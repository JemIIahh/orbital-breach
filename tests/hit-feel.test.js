import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { hitReaction, hitSide, shakeFalloff, PALETTE } from '../src/hit-feel.js';
import { Effects } from '../src/effects.js';
import { animateMech } from '../src/animation.js';
import { simulation } from './support.js';

const context = { fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, fillText() {}, createRadialGradient() { return { addColorStop() {} }; } };
globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return context; } }; } };

const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const BLOOM_THRESHOLD = 1.3; // UnrealBloomPass threshold in game.js: only colours brighter than this glow
const lights = scene => { let n = 0; scene.traverse(o => { if (o.isLight) n++; }); return n; };

test('a harder hit is a bigger event, and a headshot hits harder than a body shot', () => {
  const light = hitReaction({ damage: 8 }), heavy = hitReaction({ damage: 40 });
  assert.ok(heavy.power > light.power && heavy.flash > light.flash && heavy.streaks > light.streaks && heavy.flinch >= light.flinch);
  assert.ok(hitReaction({ damage: 20, part: 'head' }).power > hitReaction({ damage: 20, part: 'core' }).power);
});

test('every layer stays inside a sane budget however extreme the damage', () => {
  for (const damage of [0, 1, 9999]) {
    const r = hitReaction({ damage, killed: true, big: true });
    assert.ok(r.streaks <= 60 && r.embers <= 24 && r.flash <= 5 && r.flinch <= 1 && r.stop <= .2 && Number.isFinite(r.power));
  }
});

test('only the moments that deserve a freeze get one: kills and shield pops, never an ordinary graze', () => {
  assert.equal(hitReaction({ damage: 20 }).stop, 0);
  assert.ok(hitReaction({ damage: 20, shield: true, shieldBroke: true }).stop > 0);
  const kill = hitReaction({ damage: 20, killed: true }), bigKill = hitReaction({ damage: 20, killed: true, big: true });
  assert.ok(kill.stop >= .05 && kill.stop <= .1, 'a freeze of about four frames: felt, never mistaken for lag');
  assert.ok(bigKill.stop > kill.stop);
  assert.ok(kill.streaks > hitReaction({ damage: 20 }).streaks && kill.flash > hitReaction({ damage: 20 }).flash);
});

test('shield hits read as blue energy with a ripple; armour hits as hot metal with embers and scorch smoke', () => {
  const shield = hitReaction({ damage: 30, shield: true }), armour = hitReaction({ damage: 30 });
  assert.ok(shield.ring && !armour.ring);
  assert.equal(shield.embers, 0); assert.ok(armour.embers > 0);
  assert.ok(armour.smoke && !shield.smoke);
  const [sr, , sb] = shield.palette.hot, [ar, , ab] = armour.palette.hot;
  assert.ok(sb > sr, 'shield sparks are blue-dominant'); assert.ok(ar > ab, 'armour sparks are orange-dominant');
});

test('effect colours are HDR: bright enough to cross the bloom threshold, or they can never glow', () => {
  for (const [name, pal] of Object.entries(PALETTE)) {
    assert.ok(Math.max(...pal.hot) > BLOOM_THRESHOLD * 2, `${name} streaks must bloom`);
    assert.ok(Math.max(...pal.flash) > BLOOM_THRESHOLD * 2, `${name} flash must bloom`);
    assert.ok(Math.max(...pal.cool) < Math.max(...pal.hot), `${name} sparks cool as they age`);
  }
});

test('a big target flinches less than a light one for the same hit', () => {
  assert.ok(hitReaction({ damage: 20, big: true }).flinch < hitReaction({ damage: 20 }).flinch);
});

test('hit side and camera-shake falloff behave', () => {
  assert.ok(hitSide(v(1, 0, 0), v(), v(5, 0, 0)) > .99);
  assert.ok(hitSide(v(1, 0, 0), v(), v(-5, 0, 0)) < -.99);
  assert.equal(hitSide(v(1, 0, 0), v(), v()), 0, 'a hit at the origin has no side and must not produce NaN');
  assert.ok(shakeFalloff(2, 1) > shakeFalloff(30, 1) && shakeFalloff(500, 1) === 0 && shakeFalloff(0, 1) <= 1);
});

test('a hit makes the torso, arms and head jerk back, then settle', () => {
  // animateMech only reaches the arms of a side that has a leg, so the rig needs both
  const rig = () => { const mk = () => new T.Object3D(); return { limbs: { body: mk(), head: mk(), leftArm: mk(), rightArm: mk(), leftLeg: mk(), rightLeg: mk() } }; };
  const calm = rig(), hit = rig();
  for (let i = 0; i < 30; i++) { animateMech(calm, { dt: 1 / 60, time: i / 60 }); animateMech(hit, { dt: 1 / 60, time: i / 60, stagger: 1, staggerSide: 1 }); }
  assert.ok(hit.limbs.body.rotation.x > calm.limbs.body.rotation.x + .1, 'torso leans back');
  assert.ok(hit.limbs.body.rotation.z > calm.limbs.body.rotation.z + .05, 'and rolls toward the side the round landed on');
  assert.ok(hit.limbs.body.position.z > calm.limbs.body.position.z, 'and is shoved away from the shooter');
  assert.ok(hit.limbs.head.rotation.x > calm.limbs.head.rotation.x && hit.limbs.leftArm.rotation.x > calm.limbs.leftArm.rotation.x);
  for (let i = 0; i < 90; i++) animateMech(hit, { dt: 1 / 60, time: (30 + i) / 60, stagger: 0 });
  assert.ok(Math.abs(hit.limbs.body.rotation.x - calm.limbs.body.rotation.x) < .02, 'it recovers fully when the stagger ends');
});

test('mech hits spray streaks, adding no lights, and every layer drains away', () => {
  const scene = new T.Scene(), fx = new Effects(scene), before = lights(scene);
  fx.mechHit(v(0, 2, 0), v(0, 0, 1), hitReaction({ damage: 25 }));
  assert.ok(fx.streakData.filter(s => s.live).length >= 7, 'streak sparks are emitted');
  assert.ok(fx.particles.length > 0, 'and embers');
  assert.equal(lights(scene), before, 'adding a light would recompile every material mid-fight');
  for (let i = 0; i < 240; i++) fx.update(1 / 60);
  assert.equal(fx.streakData.filter(s => s.live).length, 0);
  assert.equal(fx.particles.length, 0);
  assert.equal(fx.rings.length, 0);
  assert.equal(lights(scene), before);
});

test('streaks are stretched along their direction of travel, with the head leading', () => {
  const fx = new Effects(new T.Scene());
  fx.sparkShower(v(), v(1, 0, 0), { count: 1, speed: 20, spread: 0, g: 0, drag: 0, life: 1 });
  fx.update(1 / 60);
  const s = fx.streakData[0], m = new T.Matrix4(), pos = new T.Vector3(), q = new T.Quaternion(), sc = new T.Vector3();
  fx.streaks.getMatrixAt(0, m); m.decompose(pos, q, sc);
  const axis = new T.Vector3(0, 1, 0).applyQuaternion(q), heading = s.vel.clone().normalize();
  assert.ok(axis.dot(heading) > .999, 'long axis follows velocity');
  assert.ok(sc.y > sc.x * 5, 'a sliver, not a dot');
  assert.ok(pos.distanceTo(s.pos) < sc.y, 'the tail trails the head');
});

test('hammering the trigger never grows the pools or allocates past their caps', () => {
  const fx = new Effects(new T.Scene()), plan = hitReaction({ damage: 25 }), kill = hitReaction({ damage: 25, killed: true });
  for (let i = 0; i < 3000; i++) { fx.mechHit(v(i % 7, 2, 0), v(0, 0, 1), i % 50 ? plan : kill); if (i % 3 === 0) fx.update(1 / 60); }
  assert.ok(fx.streakData.length <= 320, 'streaks are a fixed ring buffer');
  assert.ok(fx.streaks.count <= 320);
  assert.ok(fx.particles.length <= 500);
  assert.ok(fx.flashes.length === 12 && fx.puffs.length <= 40);
});

test('explosions and kill bursts throw streaks and embers too, and still leave no light behind', () => {
  const scene = new T.Scene(), fx = new Effects(scene), before = lights(scene);
  fx.explosion(v(0, 2, 0), 1.25); fx.killBurst(v(0, 2, 0), v(0, 1, 0), 1.25);
  assert.ok(fx.streakData.filter(s => s.live).length >= 26);
  assert.equal(lights(scene), before);
  for (let i = 0; i < 360; i++) fx.update(1 / 60);
  assert.equal(fx.streakData.filter(s => s.live).length, 0);
  assert.ok(fx.puffs.every(p => p.life <= 0 && !p.sprite.visible));
});

// The real damageBot path, against the test harness's mock effects object (which has no mechHit): it must not crash, and must
// still apply the flinch and the freeze.
function target(game, point) {
  const group = new T.Group(); group.position.copy(point);
  const mesh = new T.Mesh(new T.BoxGeometry(1.5, 3, 1.5), new T.MeshBasicMaterial()); group.add(mesh);
  const bot = { group, parts: [mesh], name: 'TEST MECH', health: 100, shield: 45, dead: false, partHealth: { arm: 70, leg: 70 }, limbs: { leftArm: new T.Object3D(), rightLeg: new T.Object3D() } };
  mesh.userData = { part: 'core', bot }; game.scene.add(group); game.bots.push(bot); return bot;
}

test('damaging a bot staggers it, and a kill freezes the world and shakes the camera', () => {
  const game = simulation(), bot = target(game, v(12, 2, 0));
  game.damageBot(bot, 10, 'core', bot.group.position);
  assert.ok(bot.stagger > 0 && Number.isFinite(bot.staggerSide), 'the hit visibly reaches the enemy');
  assert.equal(game.hitStop || 0, 0, 'a graze does not freeze the game');
  bot.shield = 0; bot.health = 5;
  game.damageBot(bot, 50, 'core', bot.group.position);
  assert.equal(bot.dead, true);
  assert.ok(game.hitStop > 0, 'a kill freezes the simulation for a few frames');
});

test('with real effects attached, a hit goes through the layered path and a kill adds the burst', () => {
  const game = simulation(), fx = new Effects(game.scene);
  game.effects = fx; fx.ground = () => 0;
  const bot = target(game, v(12, 2, 0));
  game.damageBot(bot, 10, 'core', bot.group.position);
  assert.ok(fx.streakData.some(s => s.live), 'streaks fly on a hit');
  assert.ok(fx.rings.length > 0, 'a shielded enemy ripples');
  bot.shield = 0; bot.health = 5;
  const live = fx.streakData.filter(s => s.live).length;
  game.damageBot(bot, 50, 'core', bot.group.position);
  assert.ok(fx.streakData.filter(s => s.live).length > live + 20, 'a kill is a much bigger burst than a hit');
});
