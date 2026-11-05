const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const between = (a, b) => {
  const start = source.indexOf(a);
  assert.notEqual(start, -1, `Не найден фрагмент: ${a}`);
  const end = source.indexOf(b, start);
  assert.notEqual(end, -1, `Не найден конец фрагмента: ${b}`);
  return source.slice(start, end).trim();
};
const clamp = (v, min, max) => Math.max(min, Math.min(max, Number.isNaN(Number(v)) ? min : Number(v)));
const normalizeStats = value => value;
const heroCatalog = [{ id: 'test', hp: 1000, damage: 100, defense: 50, crit: 10, stats: {} }];
const currentHero = () => heroCatalog[0];
const itemDetails = item => ({ rarity: item.rarity, effects: item.effects || {} });
const artifactQualityPower = { common: 1, uncommon: 1.12, rare: 1.28, epic: 1.48, legendary: 1.72, ebichesky: 2, ebanuty: 2.3 };
const computeStats = new Function('clamp', 'normalizeStats', 'itemDetails', 'currentHero', 'heroCatalog', 'artifactQualityPower', `${between('const computeStats=', 'const allStats=')} return computeStats;`)(clamp, normalizeStats, itemDetails, currentHero, heroCatalog, artifactQualityPower);
const statAt = rarity => computeStats([{ rarity, effects: { damageFlat: 10, defenseFlat: 8, maxHp: 100, critChance: 2, critDamage: .2, damageMult: 1.2 } }]);
const tiers = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ebichesky', 'ebanuty'].map(statAt);
for (let i = 1; i < tiers.length; i++) {
  assert.ok(tiers[i].damage > tiers[i - 1].damage, `Урон должен расти при качестве ${i}`);
  assert.ok(tiers[i].hp > tiers[i - 1].hp, `HP должно расти при качестве ${i}`);
  assert.ok(tiers[i].damageMult > tiers[i - 1].damageMult, `Множитель урона должен расти при качестве ${i}`);
}
const base = computeStats([{ rarity: 'common', upgradeLevel: 0, effects: { damageFlat: 10 } }]);
const forged = computeStats([{ rarity: 'common', upgradeLevel: 5, effects: { damageFlat: 10 } }]);
assert.ok(forged.damageMult > base.damageMult, 'Перековка должна увеличивать множитель урона');
assert.ok(forged.hp > base.hp && forged.defense > base.defense && forged.crit > base.crit, 'Перековка должна увеличивать HP, защиту и крит');

const tuneEnemyStats = new Function('clamp', 'normalizeStats', `${between('const tuneEnemyStats=', 'const monsterPortrait=')} return tuneEnemyStats;`)(clamp, normalizeStats);
const bosses = [1, 5, 9, 10, 15, 20].map(stage => ({ stage, ...tuneEnemyStats({}, { hp: 1300, damage: 142, defense: 60 }, 'bossRush', stage) }));
for (let i = 1; i < bosses.length; i++) {
  assert.ok(bosses[i].hp > bosses[i - 1].hp, `HP босса не вырос на этапе ${bosses[i].stage}`);
  assert.ok(bosses[i].damage > bosses[i - 1].damage, `Атака босса не выросла на этапе ${bosses[i].stage}`);
  assert.ok(bosses[i].defense > bosses[i - 1].defense, `Защита босса не выросла на этапе ${bosses[i].stage}`);
}
const bossCreation = between('const enemyBase=tuneEnemyStats', 'const profile=enemyHero.monsterKind');
assert.match(bossCreation, /if\(mode==='bossRush'\)\{enemyBase\.percentageDamage=0;enemyBase\.executePercent=0;\}/, 'В Boss Rush должен быть отключён процентный урон врага');
assert.match(source, /<div class="battle-shop-mark"><span>✧<\/span><i>·<\/i><b>✦<\/b><i>·<\/i><span>✧<\/span><\/div>/, 'Не найдена разметка декоративного элемента лавки');
assert.match(source, /\.battle-shop-mark\{display:flex!important;[^}]*justify-content:center/, 'Декоративный элемент лавки должен центрироваться через flex');

// Fusion is a rarity promotion of the selected item; all equipped-stat dimensions must rise.
const fusionStats = tiers;
for (let i = 1; i < fusionStats.length; i++) {
  assert.ok(fusionStats[i].defense > fusionStats[i - 1].defense, `Защита должна расти при редкости ${i}`);
  assert.ok(fusionStats[i].crit > fusionStats[i - 1].crit, `Крит. шанс должен расти при редкости ${i}`);
  assert.ok(fusionStats[i].critMult > fusionStats[i - 1].critMult, `Крит. урон должен расти при редкости ${i}`);
}
assert.match(source, /target\.rarity=targetRarity;save\(\)/, 'Слияние должно сохранять новую редкость выбранного предмета');
assert.match(source, /const rarity=rarityOrder\.includes\(x\.rarity\)\?x\.rarity:template\.rarity/, 'Загрузка профиля должна сохранять новую редкость артефакта');
assert.match(source, /Третий контрольный: полноценный повторный удар/, 'Пассивка Максоса должна сообщать о полном повторном ударе');
assert.match(source, /damage\(attacker,defender,sourceBase,type,pierce\)/, 'Пассивка Максоса должна вызывать повторную атаку с исходным типом и пробитием');
const passiveSource = between('const applyHeroPassives=', 'const applyAction=');
const repeatHits = [];
const mockDamage = (attacker, defender, base, type, pierce) => { repeatHits.push({ base, type, pierce }); return 91; };
const applyMaxosPassive = new Function('battleFx','tryStun','heal','applyDot','gainBlock','addLog','receiveDamage','damage', `${passiveSource} return applyHeroPassives;`)(()=>{},()=>{},()=>{},()=>{},()=>{},()=>{},()=>0,mockDamage);
const maxos = { heroId: 'maxim', passiveHits: 2, passiveActionUsed: false, hp: 100, stats: {} };
const target = { hp: 1000, maxHp: 1000, heroId: 'dummy', block: 0, stats: {} };
applyMaxosPassive(maxos, target, 50, false, 'physical', 0, 194, .2);
assert.equal(repeatHits.length, 1, 'Третий успешный удар Максоса должен вызывать ровно один дополнительный удар');
assert.deepEqual(repeatHits[0], { base: 194, type: 'physical', pierce: .2 }, 'Повтор должен использовать полный базовый урон и параметры исходного удара');
assert.equal(maxos.passiveActionUsed, true, 'Пассивка Максоса должна блокировать рекурсивное повторное срабатывание');

// A double-strike relic/mod must repeat the complete damage of a card action.
const damageSource = between("const damage=(attacker,defender,base,type='physical',pierce=0)=>{", 'const applyDot=');
const receiveDamageMock = (target, amount) => { const dealt = Math.min(target.hp, amount); target.hp -= dealt; target.totalHpLost = (target.totalHpLost || 0) + dealt; return dealt; };
const resolveDamage = new Function('BALANCE','battle','clamp','criticalChance','criticalMultiplier','typeReduction','receiveDamage','heal','battleFx','floatDamage','addLog','applyHeroPassives','checkRevive','tryStun','applyDot', `${damageSource} return damage;`)({directDamage:1.08,comboStep:.06},{round:1},clamp,()=>0,()=>1.5,()=>0,receiveDamageMock,()=>{},()=>{},()=>{},()=>{},()=>{},()=>{},()=>{},()=>{});
const oldRandom = Math.random;
Math.random = () => 0;
const cardAttacker = {hp:1000,maxHp:1000,hero:{name:'Тестовый герой'},side:'left',damageDone:0,hitsThisAction:0,stats:{damageMult:1,doubleStrikeChance:1,cardDamageMult:1.25,damageTakenMult:1,stunChance:0,bleedChance:0,weakenChance:0},cardAction:true,attackProcsUsed:false,echoActive:false};
const cardTarget = {hp:1000,maxHp:1000,side:'right',hero:{name:'Тестовая цель'},block:0,stats:{damageTakenMult:1},rawDamageThisAction:0,damageTakenThisAction:0};
resolveDamage(cardAttacker,cardTarget,100,'physical',0);
Math.random = oldRandom;
assert.equal(cardAttacker.hitsThisAction, 2, 'Атакующая карта с гарантированным шансом эха должна выполнить два попадания');
assert.equal(Math.round(cardAttacker.damageDone), 270, 'Повтор атакующей карты должен повторять полный карточный урон');

// A profile reload must retain a fused rarity and continue using that tier in stat calculation.
const sanitizeSource = between('function sanitizeProfile(raw){', 'function restoreBattle(saved){');
const mockFresh = () => ({items:[],equippedUids:[],chests:{standard:0,premium:0},deckCounts:{},activeItemOwned:[],dungeonRun:{},bossRushBuffs:[],randomDraftDeck:[]});
const sanitize = new Function('freshState','clamp','itemTemplates','rarityOrder','MAX_ITEMS','heroCatalog','cardById','activeItemCatalog','battleMods','dungeonEvents','questCatalog', `${sanitizeSource} return sanitizeProfile;`)(mockFresh,clamp,[{id:'TEST',rarity:'common'}],['common','uncommon','rare','epic','legendary','ebichesky','ebanuty'],10,[{id:'hero'}],()=>true,[],[],[],[]);
const restored = sanitize({items:[{uid:1,templateId:'TEST',rarity:'ebanuty',upgradeLevel:2}],equippedUids:[1],activeItemOwned:[],itemCollectionVersion:1,heroId:null});
assert.equal(restored.items[0].rarity,'ebanuty', 'Перезапуск не должен откатывать объединённую редкость к шаблону');
assert.match(source, /const dungeonTable=stage>=9\?\{common:18,uncommon:30,rare:32,epic:16,legendary:4\}/, 'Для подземелья нужна отдельная сниженная таблица дропа');
assert.match(source, /battle\.mode!=='dungeon'\|\|stage%3===0/, 'В подземелье артефакт должен выпадать только в каждой третьей комнате');
assert.match(source, /НЕРФИТСЯ, ДАНИЛ, ИДИ ПОГУЛЯЙ/, 'Должно отображаться сообщение блокировки подземелья');
assert.match(source, /id="leaveBattle"/, 'В бою должна быть кнопка выхода');
assert.match(source, /id="confirmLeaveBattle"/, 'Должно быть подтверждение выхода из боя');
assert.match(source, /Ты действительно хочешь покинуть бой\?/, 'Текст подтверждения выхода отсутствует');
assert.match(source, /const abandonCurrentBattle=\(\)=>/, 'Должен существовать отдельный обработчик выхода без наград');
const abandonSource = between("const abandonCurrentBattle=()=>{", "document.addEventListener('click',e=>{");
assert.doesNotMatch(abandonSource, /endBattle\(|state\.gold\s*[+]=|rewardItem\s*=|battleRewardGold/, 'Выход из боя не должен выдавать награды');
assert.match(source, /Объединение артефактов/,'В обучении должна быть отдельная инструкция по объединению артефактов');
assert.match(source, /НЕРФИТСЯ, ДАНИЛ, ИДИ ПОГУЛЯЙ/,'Должно отображаться сообщение блокировки подземелья');
assert.match(source, /src="assets\/welcome-symmetrical-v0369\.jpg"/, 'Не используется новая симметричная заставка');
assert.match(source, /id="welcomeContinue"/, 'Не найдена интерактивная кнопка старта');
assert.match(source, /БЛЯДОНСКОЕ/, 'Максимальная редкость не переименована');
assert.match(source, /hero-detail-ability/, 'Блок способности героя должен иметь отдельные отступы');
assert.match(source, /#battleBoard\.is-live #enemyLastCard[^}]*margin:16px 0 5px/, 'Для карточки последнего хода нужен отдельный вертикальный отступ');
console.log('0.36.3 mechanics QA: PASS');
console.table(bosses.map(({ stage, hp, damage, defense }) => ({ stage, hp: Math.round(hp), damage: Math.round(damage), defense: Math.round(defense) })));
console.log('Artifact quality damage values:', tiers.map(x => Math.round(x.damage)).join(' → '));
