'use strict';
const {createEngine,catalog,rulesHash}=require('./engine.cjs');
class GameError extends Error{constructor(status,message){super(message);this.status=status;}}
function validateSetup(value){
 if(!value||!catalog.heroes.some(h=>h.id===value.heroId))throw new GameError(400,'Выбери существующего героя.');
 if(!Array.isArray(value.deckIds)||value.deckIds.length!==5||new Set(value.deckIds).size!==5||value.deckIds.some(id=>typeof id!=='string'||!catalog.cards.some(c=>c.id===id)))throw new GameError(400,'Нужно выбрать пять разных карт.');
 return{heroId:value.heroId,deckIds:[...value.deckIds]};
}
function outcome(b){
 if(b.player.hp<=0&&b.enemy.hp<=0)return{winner:null,reason:'double-ko'};
 if(b.player.hp<=0)return{winner:1,reason:'health'};
 if(b.enemy.hp<=0)return{winner:0,reason:'health'};
 if(b.round>b.roundLimit){const delta=b.player.hp/b.player.maxHp-b.enemy.hp/b.enemy.maxHp;return{winner:Math.abs(delta)<1e-8?null:delta>0?0:1,reason:'round-limit'};}
 return null;
}
function finish(room,result){room.status='finished';room.result=result;room.battle.ended=true;room.deadlineAt=null;return room;}
function nextSide(engine,room,now,turnMs){
 const b=room.battle;
 // At most two consecutive stun skips can happen before immunity permits an action.
 for(let guard=0;guard<8;guard++){
  const result=outcome(b);if(result)return finish(room,result);
  if(b.acted.length===2){
   b.round++;b.acted=[];
   engine.tickFighter(b.player);engine.tickFighter(b.enemy);
   const ended=outcome(b);if(ended)return finish(room,ended);
   for(const side of ['player','enemy']){const f=b[side];f.hand=engine.drawHand(f.deck);f.usedCardId=null;}
   b.activeSide=b.firstSide;
  }else if(b.acted.includes(b.activeSide))b.activeSide=b.activeSide==='player'?'enemy':'player';
  const f=b[b.activeSide];
  if(f.manaRound!==b.round){if(f.manaRound>=0)f.mana=Math.min(f.maxMana,f.mana+2);f.manaRound=b.round;}
  if(f.stunTurns>0){
   f.stunTurns--;f.controlImmuneActions=1;f.skippingStun=true;f.lastAction='Оглушение · ход пропущен';
   b.acted.push(b.activeSide);b.log.unshift(f.hero.name+' пропускает ход из-за оглушения.');b.log=b.log.slice(0,24);continue;
  }
  f.skippingStun=false;room.deadlineAt=now+turnMs;return room;
 }
 throw Error('Turn progression invariant failed');
}
function start(room,now,turnMs){
 const e=createEngine(),fighters=room.players.map((p,i)=>{const hero=e.heroCatalog.find(h=>h.id===p.setup.heroId);return e.makeFighter(i===0?'player':'enemy',e.computeStats([],hero),{},hero,[])});
 // Both players have five personal cards and the same five random common cards.
 const chosen=new Set(room.players.flatMap(p=>p.setup.deckIds));
 const common=e.completeBattleDeck([...chosen].slice(0,5)).filter(id=>!chosen.has(id));
 const remaining=e.cardCatalog.map(c=>c.id).filter(id=>!chosen.has(id)&&!common.includes(id));
 while(common.length<5)common.push(remaining.splice(require('node:crypto').randomInt(remaining.length),1)[0]);
 fighters.forEach((f,i)=>{f.deck=[...room.players[i].setup.deckIds,...common.slice(0,5)];f.hand=e.drawHand(f.deck)});
 const first=require('node:crypto').randomInt(2)===0?'player':'enemy';
 room.battle={round:1,roundLimit:24,mode:'duel',firstSide:first,activeSide:first,acted:[],ended:false,log:['Дружеская дуэль началась. Первый ход определён жеребьёвкой.'],player:fighters[0],enemy:fighters[1]};
 e.battle=room.battle;room.status='active';room.startedAt=now;room.result=null;room.rulesHash=rulesHash;
 return nextSide(e,room,now,turnMs);
}
function act(room,playerIndex,action,now,turnMs){
 if(room.status!=='active')throw new GameError(409,'Бой сейчас не идёт.');
 const b=room.battle,side=playerIndex===0?'player':'enemy';
 if(b.activeSide!==side||b.acted.includes(side))throw new GameError(409,'Сейчас ход соперника.');
 if(!action||!['card','skill','focus'].includes(action.type))throw new GameError(400,'Неизвестное действие.');
 const f=b[side],t=b[side==='player'?'enemy':'player'];
 if(action.type==='card'&&(!f.hand.includes(action.cardId)||f.usedCardId===action.cardId))throw new GameError(400,'Этой карты нет в твоей руке.');
 const e=createEngine();e.battle=b;const before={actorHp:f.hp,targetHp:t.hp,block:t.block};let ok,label;
 if(action.type==='card'){const c=e.cardCatalog.find(c=>c.id===action.cardId);if(!c||f.mana<c.manaCost)throw new GameError(400,'Не хватает маны.');ok=e.applyCard(f,t,c.id);f.usedCardId=c.id;label=c.name;}
 else if(action.type==='skill'){ok=e.useHeroSkill(f);label='Способность героя';}
 else{ok=e.applyAction(f,t,'focus');label='Сосредоточение';}
 if(!ok)throw new GameError(400,'Действие недоступно: проверь ману и перезарядку.');
 f.lastAction=label;b.acted.push(side);
 room.lastAction={actor:playerIndex,label,round:b.round,hpLost:Math.max(0,before.targetHp-t.hp),healed:Math.max(0,f.hp-before.actorHp),blocked:Math.max(0,before.block-t.block)};
 return nextSide(e,room,now,turnMs);
}
function expireTurn(room,now){
 if(room.status==='active'&&Number.isFinite(room.deadlineAt)&&now>=room.deadlineAt){finish(room,{winner:room.battle.activeSide==='player'?1:0,reason:'timeout'});return true;}
 return false;
}
function publicFighter(f,own){
 const result={heroId:f.heroId,hp:f.hp,maxHp:f.maxHp,block:f.block,mana:f.mana,maxMana:f.maxMana,combo:f.comboActions||0,lastAction:f.lastAction,skillReadyRound:f.abilityUsedRound+3,statuses:[]};
 for(const [key,label] of [['poisonTurns','Яд'],['burnTurns','Горение'],['bleedTurns','Кровотечение'],['weak','Ослабление'],['stunTurns','Оглушение'],['traumaActions','Травма'],['markedTurns','Метка']])if(f[key]>0)result.statuses.push({label,remaining:f[key]});
 if(f.parry)result.statuses.push({label:'Парирование',remaining:1});if(f.dodgeCharges)result.statuses.push({label:'Уклонение',remaining:f.dodgeCharges});if(f.critWard)result.statuses.push({label:'Защита от критов',remaining:1});
 if(own){result.hand=[...f.hand];result.usedCardId=f.usedCardId||null;}
 return result;
}
function publicRoom(room,playerId,now){
 const index=room.players.findIndex(p=>p.id===playerId);if(index<0)throw new GameError(403,'Ты не участник этой комнаты.');
 const result={code:room.code,revision:room.revision,status:room.status,you:index,serverTime:now,deadlineAt:room.deadlineAt||null,players:room.players.map(p=>({name:p.name,ready:!!p.ready,rematch:!!p.rematch,heroId:p.setup.heroId})),yourSetup:room.players[index].setup,result:room.result||null,lastAction:room.lastAction||null};
 if(room.battle){const b=room.battle;result.battle={round:b.round,roundLimit:b.roundLimit,activePlayer:b.activeSide==='player'?0:1,firstPlayer:b.firstSide==='player'?0:1,fighters:[publicFighter(b.player,index===0),publicFighter(b.enemy,index===1)],log:b.log.slice(0,12)};}
 return result;
}
module.exports={GameError,validateSetup,start,act,expireTurn,publicRoom,catalog};
