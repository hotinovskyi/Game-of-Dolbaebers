'use strict';
const crypto=require('node:crypto');const rules=require('./duel.cjs');const {rulesHash}=require('./engine.cjs');const {GameError}=rules;
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const defaultSetup={heroId:'sashok',deckIds:['ATK_001','ATK_002','EFF_001','DEF_001','SUP_001']};
class Service{
 constructor(store,{now=()=>Date.now(),turnMs=120000}={}){this.store=store;this.now=now;this.turnMs=turnMs;}
 authenticate(token){const p=this.store.player(token,this.now());if(!p)throw new GameError(401,'Сессия закончилась. Войди заново.');return p;}
 register(name){if(typeof name!=='string')throw new GameError(400,'Введи имя.');name=name.trim().normalize('NFC');if(name.length<2||name.length>24||/[\p{Cc}\p{Cf}<>]/u.test(name))throw new GameError(400,'Имя: от 2 до 24 символов, без управляющих символов и скобок.');return this.store.createPlayer(name,this.now());}
 me(player){const current=this.store.db.prepare('SELECT active_room FROM players WHERE id=?').get(player.id);const room=current?.active_room?this.store.getRoom(current.active_room):null;return{id:player.id,name:player.name,room:room&&room.players.some(p=>p.id===player.id)?this.read(player,room.code):null};}
 ensureNoActive(player){const p=this.store.db.prepare('SELECT active_room FROM players WHERE id=?').get(player.id);if(p?.active_room){const room=this.store.getRoom(p.active_room);if(room&&(outdated(room)||rules.expireTurn(room,this.now()))){room.revision++;this.store.saveRoom(room,this.now());}if(room&&['lobby','active'].includes(room.status))throw new GameError(409,'У тебя уже есть комната. Сначала заверши бой или выйди из неё.');}}
 create(player,setup){setup=rules.validateSetup(setup||defaultSetup);return this.store.transaction(()=>{this.ensureNoActive(player);let code;do{code=Array.from({length:8},()=>alphabet[crypto.randomInt(alphabet.length)]).join('');}while(this.store.getRoom(code));const room={code,revision:1,status:'lobby',createdAt:this.now(),players:[{id:player.id,name:player.name,setup,ready:false}],battle:null};this.store.saveRoom(room,this.now());this.store.setActive(player.id,code);return rules.publicRoom(room,player.id,this.now());});}
 join(player,code){code=normalizeCode(code);return this.store.transaction(()=>{const room=this.store.getRoom(code);if(!room)throw new GameError(404,'Комната не найдена. Проверь код.');if(room.players.some(p=>p.id===player.id))return rules.publicRoom(room,player.id,this.now());this.ensureNoActive(player);if(room.status!=='lobby'||room.players.length>=2)throw new GameError(409,'Комната уже занята или бой начался.');room.players.push({id:player.id,name:player.name,setup:{...defaultSetup,deckIds:[...defaultSetup.deckIds]},ready:false});room.revision++;this.store.saveRoom(room,this.now());this.store.setActive(player.id,code);return rules.publicRoom(room,player.id,this.now());});}
 read(player,code){code=normalizeCode(code);return this.store.transaction(()=>{const room=this.store.getRoom(code);if(!room)throw new GameError(404,'Комната не найдена.');if(!room.players.some(p=>p.id===player.id))throw new GameError(403,'Ты не участник этой комнаты.');if(outdated(room)||rules.expireTurn(room,this.now())){room.revision++;this.store.saveRoom(room,this.now());}return rules.publicRoom(room,player.id,this.now());});}
 command(player,code,body){
  code=normalizeCode(code);if(!body||typeof body.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,64}$/.test(body.requestId)||!Number.isSafeInteger(body.revision))throw new GameError(400,'Некорректный номер команды или ревизия.');
  const digest=crypto.createHash('sha256').update(JSON.stringify({revision:body.revision,type:body.type,setup:body.setup,action:body.action})).digest('hex');
  return this.store.transaction(()=>{
   const room=this.store.getRoom(code);if(!room)throw new GameError(404,'Комната не найдена.');const index=room.players.findIndex(p=>p.id===player.id);if(index<0)throw new GameError(403,'Ты не участник этой комнаты.');
   const receipt=this.store.receipt(code,player.id,body.requestId);if(receipt){if(receipt.digest!==digest)throw new GameError(409,'Этот номер команды уже использован для другого действия.');return{...rules.publicRoom(room,player.id,this.now()),duplicate:true};}
   if(outdated(room)||rules.expireTurn(room,this.now())){room.revision++;this.store.saveRoom(room,this.now());return{...rules.publicRoom(room,player.id,this.now()),expired:true};}
   if(room.revision!==body.revision)throw new GameError(409,'Состояние обновилось. Проверь бой и повтори действие.');
   const member=room.players[index];
   if(body.type==='ready'){
    if(room.status!=='lobby')throw new GameError(409,'Бой уже начался.');member.setup=rules.validateSetup(body.setup);member.ready=true;
    if(room.players.length===2&&room.players.every(p=>p.ready))rules.start(room,this.now(),this.turnMs);
   }else if(body.type==='unready'){
    if(room.status!=='lobby')throw new GameError(409,'Бой уже начался.');member.ready=false;
   }else if(body.type==='act')rules.act(room,index,body.action,this.now(),this.turnMs);
   else if(body.type==='resign'){
    if(room.status!=='active')throw new GameError(409,'Бой сейчас не идёт.');room.status='finished';room.battle.ended=true;room.deadlineAt=null;room.result={winner:1-index,reason:'resign'};
   }else if(body.type==='leave'){
    if(room.status!=='lobby')throw new GameError(409,'Из активного боя можно выйти через сдачу.');this.store.setActive(player.id,null);
    if(index===0){room.status='closed';for(const p of room.players)this.store.setActive(p.id,null);}else{room.players.splice(index,1);room.players[0].ready=false;}
   }else if(body.type==='rematch'){
    if(room.status!=='finished')throw new GameError(409,'Сначала заверши бой.');member.rematch=true;
    if(room.players.every(p=>p.rematch)){room.status='lobby';room.battle=null;room.result=null;room.lastAction=null;for(const p of room.players){p.ready=false;p.rematch=false;}}
   }else throw new GameError(400,'Неизвестная команда.');
   room.revision++;this.store.saveRoom(room,this.now());this.store.record(code,player.id,body.requestId,digest);
   // The leaving guest is no longer a member; do not return the other player's private view.
   if(!room.players.some(p=>p.id===player.id))return{left:true};
   return rules.publicRoom(room,player.id,this.now());
  });
 }
}
function normalizeCode(code){if(typeof code!=='string')throw new GameError(400,'Введи код комнаты.');code=code.toUpperCase().replace(/[\s-]/g,'');if(!/^[A-HJ-NP-Z2-9]{8}$/.test(code))throw new GameError(400,'Код комнаты состоит из восьми букв и цифр.');return code;}
function outdated(room){if(room.status==='active'&&room.rulesHash!==rulesHash){room.status='finished';room.battle.ended=true;room.deadlineAt=null;room.result={winner:null,reason:'server-update'};return true;}return false;}
module.exports={Service,normalizeCode,defaultSetup};
