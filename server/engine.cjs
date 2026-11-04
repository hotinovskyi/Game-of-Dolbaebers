'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const gameDir=path.resolve(process.env.GAME_DIR||(fs.existsSync(path.join(__dirname,'../game/index.html'))?path.join(__dirname,'../game'):path.join(__dirname,'..')));
const html=fs.readFileSync(path.join(gameDir,'index.html'),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const heroCatalog='));
if(!source?.includes('// ENGINE_TEST_HOOK'))throw Error('Unsupported game engine build');
// Bridge to the shipped, trusted combat implementation. No player JavaScript is evaluated.
// The DOM/animation boundary is inert. Only combat functions are exposed to the service.
const exposed=`globalThis.rules={heroCatalog,cardCatalog,computeStats,makeFighter,completeBattleDeck,drawHand,applyCard,applyAction,useHeroSkill,tickFighter,heroSkillReady,get battle(){return battle},set battle(value){battle=value}};return;`;
const compiled=new vm.Script(source.replace('// ENGINE_TEST_HOOK',exposed),{filename:'trusted-game-engine.js'});
const rulesHash=crypto.createHash('sha256').update(source).digest('hex');
function createEngine(){
 const element=()=>({style:{setProperty(){}},dataset:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},appendChild(){},remove(){},scrollIntoView(){},setAttribute(){},querySelector:element,querySelectorAll(){return[]},getBoundingClientRect(){return{left:0,top:0,width:300,height:300}},textContent:'',innerHTML:'',value:'',offsetWidth:100});
 const elements=new Map(),storage=new Map(),math=Object.create(Math);
 math.random=()=>crypto.randomInt(0,0x100000000)/0x100000000;
 const context=vm.createContext({Math:math,Date,URL,URLSearchParams,AbortController,console:{log(){},warn(){},error(){}},document:{querySelector(key){if(!elements.has(key))elements.set(key,element());return elements.get(key)},querySelectorAll(){return[]},createElement:element,addEventListener(){}},window:{addEventListener(){}},location:{search:'',href:'http://localhost/'},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},setTimeout(){return 0},clearTimeout(){},setInterval(){return 0},requestAnimationFrame(){},cancelAnimationFrame(){},confirm:()=>false,innerWidth:390,innerHeight:844},{codeGeneration:{strings:false,wasm:false}});
 compiled.runInContext(context,{timeout:1500});return context.rules;
}
const reference=createEngine();
const catalog={heroes:reference.heroCatalog.map(h=>({id:h.id,name:h.name,title:h.title,portrait:h.portrait,ability:h.ability})),cards:reference.cardCatalog.map(c=>({id:c.id,name:c.name,type:c.type,kind:c.kind,manaCost:c.manaCost,text:c.text})),rulesHash};
module.exports={createEngine,catalog,rulesHash,gameDir};
