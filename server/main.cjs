'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Store}=require('./store.cjs'),{Service}=require('./service.cjs'),{GameError}=require('./duel.cjs'),{catalog,rulesHash,gameDir}=require('./engine.cjs');
function createApp({database=path.resolve(process.env.DATA_DIR||path.join(__dirname,'data'),'pvp.sqlite'),turnMs=Number(process.env.TURN_SECONDS||120)*1000,now=()=>Date.now(),publicOrigin=process.env.PUBLIC_ORIGIN||''}={}){
 if(!Number.isFinite(turnMs)||turnMs<1000||turnMs>600000)throw Error('Invalid turn duration');
 if(publicOrigin&&new URL(publicOrigin).origin!==publicOrigin)throw Error('PUBLIC_ORIGIN must be an origin without a trailing slash');
 const store=new Store(database),service=new Service(store,{turnMs,now}),limits=new Map();
 function limit(key,max,windowMs){const t=now();let bucket=limits.get(key);if(!bucket||t>=bucket.until){bucket={count:0,until:t+windowMs};limits.set(key,bucket);}if(++bucket.count>max)throw new GameError(429,'Слишком много запросов. Подожди минуту.');}
 const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'SAMEORIGIN'};
 function send(res,status,data){res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
 async function body(req){if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new GameError(415,'Нужен JSON-запрос.');let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>16384)throw new GameError(413,'Запрос слишком большой.');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new GameError(400,'Некорректный JSON.');}}
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost'),ip=req.socket.remoteAddress||'unknown';
   if(url.pathname==='/healthz'&&req.method==='GET')return send(res,200,{ok:true,version:'0.36.1',protocol:1});
   if(url.pathname.startsWith('/api/')){
    // This service serves the game and API together. Cross-origin browser writes are not accepted.
    if(req.headers.origin){const allowed=publicOrigin||[...['http:','https:'].map(protocol=>protocol+'//'+req.headers.host)];if(Array.isArray(allowed)?!allowed.includes(req.headers.origin):req.headers.origin!==allowed)throw new GameError(403,'Этот адрес игры не разрешён.');}
    limit('ip:'+ip,900,60000);
    if(url.pathname==='/api/v1/pvp/meta'&&req.method==='GET')return send(res,200,{protocol:1,version:'0.36.1',rulesHash,catalog,turnSeconds:turnMs/1000,features:{guestSessions:true,privateRooms:true,pveInventory:false,activeItems:false,roundShop:false}});
    if(url.pathname==='/api/v1/pvp/guest'&&req.method==='POST'){limit('guest:'+ip,8,60000);const data=await body(req);return send(res,201,service.register(data.name));}
    const token=/^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.authorization||'')?.[1],player=service.authenticate(token);
    limit('player:'+player.id,300,60000);
    if(url.pathname==='/api/v1/pvp/me'&&req.method==='GET')return send(res,200,service.me(player));
    if(url.pathname==='/api/v1/pvp/rooms'&&req.method==='POST'){limit('create:'+player.id,8,60000);const data=await body(req);return send(res,201,service.create(player,data.setup));}
    if(url.pathname==='/api/v1/pvp/rooms/join'&&req.method==='POST'){limit('join:'+player.id,20,60000);const data=await body(req);return send(res,200,service.join(player,data.code));}
    const match=/^\/api\/v1\/pvp\/rooms\/([A-Za-z0-9-]{8,12})(\/commands)?$/.exec(url.pathname);
    if(match&&!match[2]&&req.method==='GET')return send(res,200,service.read(player,match[1]));
    if(match&&match[2]&&req.method==='POST'){limit('command:'+player.id,60,60000);return send(res,200,service.command(player,match[1],await body(req)));}
    throw new GameError(404,'Этот API-маршрут не найден.');
   }
   if(!['GET','HEAD'].includes(req.method))throw new GameError(405,'Метод не поддерживается.');
   let relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
   if(!['index.html','pvp.js','pvp.css'].includes(relative)&&!relative.startsWith('assets/'))throw new GameError(404,'Файл не найден.');
   const filename=path.resolve(gameDir,relative);if(!filename.startsWith(gameDir+path.sep)||(relative.startsWith('assets/')&&!filename.startsWith(path.join(gameDir,'assets')+path.sep)))throw new GameError(404,'Файл не найден.');
   const data=await fs.promises.readFile(filename);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp'};
   res.writeHead(200,{...headers,'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':['index.html','pvp.js','pvp.css'].includes(relative)?'no-cache':'public, max-age=3600'});res.end(req.method==='HEAD'?undefined:data);
  }catch(err){if(res.writableEnded||res.destroyed)return;const status=err.status||(err.code==='ENOENT'?404:500);if(status===500)console.error('request-error',crypto.randomUUID(),err.stack);send(res,status,{detail:status===500?'Не удалось обработать запрос. Попробуй снова.':err.message});}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
 const cleanup=setInterval(()=>{try{store.cleanup(now());for(const [key,b]of limits)if(now()>=b.until)limits.delete(key);}catch(err){console.error('cleanup failed',err.message)}},60000);cleanup.unref();
 return{server,store,service,close:()=>new Promise(resolve=>{clearInterval(cleanup);server.close(()=>{store.close();resolve();});server.closeIdleConnections();})};
}
if(require.main===module){const app=createApp(),port=Number(process.env.PORT||3000);app.server.listen(port,process.env.HOST||'0.0.0.0',()=>console.log('Game of Dolbaebers PvP listening on port '+port));const stop=()=>{app.close().then(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref()};process.once('SIGTERM',stop);process.once('SIGINT',stop);}
module.exports={createApp};

