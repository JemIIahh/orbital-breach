import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { simulation } from './support.js';
import { DEFAULT_BUILD, PRESETS, sanitizeBuild } from '../src/parts.js';
import { loadProfile } from '../src/profile.js';

const fitted = (build, mutate) => { const game = simulation(); game.applyBuild({ ...DEFAULT_BUILD, ...build }); if (mutate) mutate(game); return game; };
const storage = () => { const store = new Map(); return { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }; };

test('the factory build fires exactly as the original two guns did', () => {
  const game = simulation(); game.applyBuild(DEFAULT_BUILD);
  game.shoot(0);
  assert.equal(game.bullets.length, 1); assert.equal(game.bullets[0].damage, 17); assert.equal(game.bullets[0].splash, 0);
  game.bullets.length = 0; game.shoot(1);
  assert.equal(game.bullets.length, 7); assert.ok(game.bullets.every(b => b.damage === 13 && b.life === 1.7));
  assert.deepEqual(game.mods, { speed: 1, boost: 1, damageTaken: 1, heatGain: 1, cooling: 1 });
});

test('arm weapons come from the fitted parts: pellets, damage, splash and heat all follow the part', () => {
  const game = fitted({ lArm: 'lc7', rArm: 'hc1' });
  game.shoot(0);
  assert.equal(game.bullets.length, 3); assert.ok(game.bullets.every(b => b.damage === 12));
  game.bullets.length = 0; game.shoot(1);
  assert.equal(game.bullets.length, 1); assert.equal(game.bullets[0].damage, 100); assert.equal(game.bullets[0].splash, 6.5);
  assert.ok(game.heat[1] >= .42 - 1e-9, 'the thunderclap runs hot');
  assert.equal(game.cooldowns[1], 1.5);
});

test('an empty arm does nothing, and a hotter torso builds heat faster', () => {
  const game = fitted({ lArm: 'none' }); game.shoot(0);
  assert.equal(game.bullets.length, 0); assert.equal(game.cooldowns[0], 0); assert.equal(game.heat[0], 0);
  const cool = fitted({ torso: 'c7' }), hot = fitted({ torso: 'b90' }); cool.shoot(1); hot.shoot(1);
  assert.ok(cool.heat[1] < hot.heat[1], 'the Cirrus has the heat room the Bastion lacks');
});

test('shoulders fire on G with separate cooldowns and the default helix keeps its seven-second recharge', () => {
  const game = simulation(); game.applyBuild(DEFAULT_BUILD);
  assert.equal(game.fireShoulders(), true); assert.equal(game.projectiles.length, 1); assert.equal(game.missileCooldown, 7);
  assert.equal(game.fireShoulders(), false, 'nothing is ready, and the empty left mount never fires');
  const both = fitted({ rShoulder: 'sr6', lShoulder: 'th3' });
  both.fireShoulders();
  assert.equal(both.projectiles.length, 6 + 1); assert.equal(both.missileCooldown, 4.2); assert.equal(both.leftShoulderCooldown, 3.2);
  assert.match(both.shoulderStatus(), /5 S · 4 S/);
});

test('a shoulder gun is a hold-to-fire weapon and uses the bullet pipeline', () => {
  const game = fitted({ rShoulder: 'rs1' });
  game.fireShoulder(0); assert.equal(game.projectiles.length, 0); assert.equal(game.bullets.length, 1); assert.equal(game.bullets[0].damage, 9);
  assert.ok(Math.abs(game.missileCooldown - .11) < 1e-9);
});

test('chaff wipes nearby enemy rounds, then blunts damage for its duration only', () => {
  const game = fitted({ lShoulder: 'cm12' });
  const near = { position: game.player.position.clone().add(new T.Vector3(5, 0, 0)), velocity: new T.Vector3(), owner: 'enemy', life: 1 };
  const far = { position: game.player.position.clone().add(new T.Vector3(80, 0, 0)), velocity: new T.Vector3(), owner: 'enemy', life: 1 };
  const mine = { position: game.player.position.clone(), velocity: new T.Vector3(), owner: 'player', life: 1 };
  game.bullets.push(near, far, mine);
  game.fireShoulder(1);
  assert.deepEqual(game.bullets, [far, mine], 'only enemy rounds inside the radius are scrambled');
  assert.equal(game.damageScale(), .5); assert.equal(game.leftShoulderCooldown, 14);
  game.chaffTime = 0; assert.equal(game.damageScale(), 1);
});

test('armour and mass change what the pilot suffers and how fast they move', () => {
  const stock = simulation(); stock.applyBuild(DEFAULT_BUILD);
  const heavy = fitted({ legs: 'at9', torso: 'b90', back: 'aegis' }), light = fitted({ legs: 'arachne', torso: 'c7', back: 'none' });
  assert.ok(heavy.mods.damageTaken < 1, 'plate lowers damage taken'); assert.ok(light.mods.damageTaken > 1, 'a light frame takes more');
  const hit = game => { game.invulnerable = 0; game.spawnGrace = 0; game.player.shield = 0; game.player.health = 100; game.hurtPlayer(20); return 100 - game.player.health; };
  assert.ok(hit(heavy) < hit(stock), 'plate soaks damage'); assert.ok(hit(stock) <= hit(light));
  assert.ok(heavy.mods.speed < 1 && light.mods.speed > 1, 'the heavy frame is slower, the quad quicker');
});

test('refit happens at once when it is safe and waits for the next spawn when it is not', t => {
  globalThis.localStorage = storage(); t.after(() => { delete globalThis.localStorage; });
  const game = simulation(); game.applyBuild(DEFAULT_BUILD); game.profile = loadProfile(globalThis.localStorage);
  game.profile.owned.push('arm:px3', 'arm:gx6'); // fitting now goes through ownership (see tests/shop.test.js), so these two guns are bought first
  game.started = true; game.mission = { combatActive: true, upgrades: 0 }; game.tutorial.active = false;
  const bot = { dead: false, group: { visible: true, position: game.player.position.clone().add(new T.Vector3(10, 0, 0)) } }; game.bots = [bot];
  assert.equal(game.refitNow(), false, 'a hostile ten metres away');
  game.fitBuild({ ...DEFAULT_BUILD, rArm: 'px3' });
  assert.equal(game.build.rArm, 'fk40', 'still the old guns'); assert.equal(game.pendingBuild.rArm, 'px3'); assert.equal(game.profile.build.rArm, 'px3', 'saved straight away');
  game.consumePendingBuild();
  assert.equal(game.build.rArm, 'px3'); assert.equal(game.pendingBuild, null); assert.equal(game.armParts[1].id, 'px3');
  bot.group.position.x += 200; game.time = 100; game.player.lastHit = 99;
  assert.equal(game.refitNow(), false, 'just hit');
  game.player.lastHit = 50; assert.equal(game.refitNow(), true, 'quiet and nobody near');
  game.fitBuild({ ...DEFAULT_BUILD, lArm: 'gx6' });
  assert.equal(game.build.lArm, 'gx6', 'applied immediately in a lull'); assert.equal(game.pendingBuild, null);
  game.mission.combatActive = false; bot.group.position.x -= 200; assert.equal(game.refitNow(), true, 'between waves');
});

test('every preset sanitises to itself and applies cleanly; corrupt saves fall back to the factory build', () => {
  for (const preset of PRESETS) { const game = fitted(preset.build); assert.deepEqual(game.build, sanitizeBuild(preset.build)); assert.ok(Object.values(game.mods).every(Number.isFinite)); }
  const game = simulation(); game.applyBuild({ legs: 'nope', rArm: 42 }); assert.deepEqual(game.build, { ...DEFAULT_BUILD });
});
