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
const statAt = rarity => computeStats([{ rarity, effects: { damageFlat: 10, maxHp: 100, damageMult: 1.2 } }]);
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
console.log('0.36.2 mechanics QA: PASS');
console.table(bosses.map(({ stage, hp, damage, defense }) => ({ stage, hp: Math.round(hp), damage: Math.round(damage), defense: Math.round(defense) })));
console.log('Artifact quality damage values:', tiers.map(x => Math.round(x.damage)).join(' → '));
