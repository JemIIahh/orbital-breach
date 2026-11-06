import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Effects, AudioEngine } from '../src/effects.js';
import { materialOf, planImpact, reflect, muzzleStyle, impactVolume, MATERIALS, RICOCHET_COSINE } from '../src/impacts.js';
import { makeEden } from '../src/eden.js';
import { simulation } from './support.js';

const context = { fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, fillText() {}, createRadialGradient() { return { addColorStop() {} }; } };
globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return context; } }; } };

const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const seeded = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const lights = scene => { let n = 0; scene.traverse(o => { if (o.isLight) n++; }); return n; };

test('every realm\'s hit surfaces map to a believable material', () => {
  const cases = [
    [{ surface: 'terrain', kind: 'ground' }, 'dirt'], [{ surface: 'terrain', kind: 'water' }, 'water'], [{ surface: 'terrain', kind: 'pavement' }, 'stone'],
    [{ surface: 'tree', kind: 'tree' }, 'wood'], [{ surface: 'tree', kind: 'log' }, 'wood'], [{ surface: 'tree', kind: 'stump' }, 'wood'],
    [{ surface: 'tree', kind: 'rock' }, 'stone'], [{ surface: 'tree', kind: 'ruin' }, 'stone'], [{ surface: 'tree', kind: 'pylon' }, 'metal'],
    [{ surface: 'building' }, 'stone'], [{ surface: 'window' }, 'glass'], [{ surface: 'hull' }, 'metal'], [{ surface: 'roof' }, 'metal'],
    [{ surface: 'frame' }, 'metal'], [{ surface: 'exterior-solid' }, 'metal'], [{ surface: 'cover' }, 'metal'], [null, 'metal'],
  ];
  for (const [hit, expected] of cases) assert.equal(materialOf(hit), expected, JSON.stringify(hit));
  for (const [, m] of cases) assert.ok(MATERIALS[m], `${m} has a profile`);
});

test('soft ground never ricochets; hard surfaces skip rounds only when they skim', () => {
  const n = v(0, 1, 0), rng = () => .1;
  const head = planImpact('stone', n, v(0, -1, 0), { rng }), skim = planImpact('stone', n, v(1, -.1, 0), { rng });
  assert.equal(head.ricochet, false); assert.equal(skim.ricochet, true);
  assert.ok(skim.reflected.y > 0 && skim.reflected.x > 0, 'the round leaves upward, still travelling forward');
  for (const soft of ['dirt', 'wood', 'water']) assert.equal(planImpact(soft, n, v(1, -.05, 0), { rng }).ricochet, false, soft);
  assert.equal(planImpact('metal', n, v(1, -.1, 0), { rng }).sound, 'ricochet', 'a skipped round pings');
  // just inside and outside the threshold
  const justIn = v(Math.sqrt(1 - (RICOCHET_COSINE - .02) ** 2), -(RICOCHET_COSINE - .02), 0), justOut = v(Math.sqrt(1 - (RICOCHET_COSINE + .02) ** 2), -(RICOCHET_COSINE + .02), 0);
  assert.equal(planImpact('metal', n, justIn, { rng }).ricochet, true); assert.equal(planImpact('metal', n, justOut, { rng }).ricochet, false);
});

test('reflection mirrors the direction about the normal and keeps its length', () => {
  const r = reflect(v(3, -4, 0).normalize(), v(0, 1, 0));
  assert.ok(Math.abs(r.x - .6) < 1e-9 && Math.abs(r.y - .8) < 1e-9 && Math.abs(r.length() - 1) < 1e-9);
});

test('harder hits throw more debris; glancing hits throw less; each material looks different', () => {
  const n = v(0, 1, 0), rng = () => .99, soft = planImpact('dirt', n, v(0, -1, 0), { power: .5, rng }), hard = planImpact('dirt', n, v(0, -1, 0), { power: 4, rng }), glance = planImpact('dirt', n, v(1, -.2, 0), { power: 4, rng });
  assert.ok(hard.chips > soft.chips && hard.puffs >= soft.puffs && hard.decal.size > soft.decal.size);
  assert.ok(glance.chips < hard.chips, 'a glancing blow digs less');
  const dirt = planImpact('dirt', n, v(0, -1, 0), { rng }), metal = planImpact('metal', n, v(0, -1, 0), { rng });
  assert.ok(dirt.puffs > 0 && metal.puffs === 0, 'earth kicks up dust, plating does not');
  assert.ok(metal.sparks > dirt.sparks, 'plating throws more sparks than earth');
  assert.equal(planImpact('glass', n, v(0, -1, 0), { rng }).decal, null);
  assert.equal(planImpact('water', n, v(0, -1, 0), { rng }).decal, null, 'water keeps no scorch');
  assert.deepEqual(new Set(['dirt', 'wood', 'stone', 'metal', 'glass', 'water'].map(m => planImpact(m, n, v(0, -1, 0), { rng }).sound)).size, 6);
});

test('plans survive awkward inputs: plain-object normals, missing direction, normals facing away', () => {
  const rng = () => .5;
  const plain = planImpact('metal', { x: 0, y: 1, z: 0 }, v(0, -1, 0), { rng });
  assert.ok(Math.abs(plain.normal.length() - 1) < 1e-9);
  const away = planImpact('stone', v(0, -1, 0), v(0, -1, 0), { rng });   // normal points the way the round travels: flipped to face it
  assert.ok(away.normal.y > 0);
  const none = planImpact('stone', null, null, { rng });
  assert.ok(Number.isFinite(none.normal.x) && none.chips >= 0);
  assert.ok(planImpact('nonsense', v(0, 1, 0), v(0, -1, 0), { rng }).sound === 'impactMetal', 'unknown material falls back to plating');
});

test('Effects.impact makes debris that falls, bounces on the ground and drains away without adding lights', () => {
  const scene = new T.Scene(), fx = new Effects(scene), before = lights(scene);
  fx.ground = () => 0;
  const plan = fx.impact(v(0, .02, 0), v(0, 1, 0), 'dirt', { dir: v(0, -1, 0), power: 2 });
  assert.equal(plan.material, 'dirt'); assert.ok(fx.particles.length > 5, 'a spray of debris');
  assert.ok(fx.particles.some(p => p.g > 0), 'debris is affected by gravity');
  assert.ok(fx.decals.count === 1 && fx.decalData[0].live, 'a scorch mark is left behind');
  assert.ok(fx.puffs.some(p => p.life > 0), 'earth throws up dust');
  let lowest = Infinity;
  for (let i = 0; i < 90; i++) { fx.update(1 / 60); for (const p of fx.particles) if (p.bounce) lowest = Math.min(lowest, p.position.y - p.size); }
  assert.ok(lowest > -1e-6, `chips bounce off the ground instead of sinking (${lowest})`);
  for (let i = 0; i < 120; i++) fx.update(1 / 60);
  assert.equal(fx.particles.length, 0, 'all debris expires'); assert.ok(fx.puffs.every(p => p.life <= 0 && !p.sprite.visible));
  assert.equal(lights(scene), before, 'impacts never add lights (that would recompile shaders mid-fight)');
});

test('scorch marks are capped, cool from hot to dark, and fade away', () => {
  const fx = new Effects(new T.Scene());
  for (let i = 0; i < 300; i++) fx.impact(v(i * .1, 0, 0), v(0, 1, 0), 'metal', { dir: v(0, -1, 0) });
  assert.ok(fx.decals.count <= 96 && fx.decalData.length <= 96, 'decals are a ring buffer');
  assert.ok(fx.particles.length <= 500, 'particle cap holds under a heavy volley');
  const fresh = new Effects(new T.Scene()); fresh.impact(v(), v(0, 1, 0), 'metal', { dir: v(0, -1, 0) });
  const c0 = new T.Color(); fresh.decals.getColorAt(0, c0); const hotAtStart = c0.r;
  for (let i = 0; i < 60; i++) fresh.update(1 / 60);
  const c1 = new T.Color(); fresh.decals.getColorAt(0, c1);
  assert.ok(hotAtStart > .5 && c1.r < .1, `hot metal cools to a dark mark (${hotAtStart.toFixed(2)} -> ${c1.r.toFixed(2)})`);
  for (let i = 0; i < 60 * 30; i++) fresh.update(1 / 60);
  assert.equal(fresh.decalData[0].live, false, 'scorch eventually fades');
});

test('muzzle effects: kinetic guns eject casings, energy guns do not, heavy guns smoke', () => {
  const fx = new Effects(new T.Scene()), shot = { dir: v(0, 0, 1), right: v(1, 0, 0), up: v(0, 1, 0), side: 1 };
  fx.gunfire(v(0, 2, 0), shot, 'gatling'); assert.equal(fx.casingNext, 1, 'gatling ejects a casing');
  fx.gunfire(v(0, 2, 0), shot, 'railgun'); assert.equal(fx.casingNext, 1, 'a railgun ejects nothing');
  fx.gunfire(v(0, 2, 0), shot, 'thunder'); assert.equal(fx.casingNext, 2); assert.ok(fx.puffs.some(p => p.life > 0), 'heavy guns smoke');
  assert.ok(muzzleStyle('flak').size > muzzleStyle('gatling').size && muzzleStyle('???').casing === 'bullet');
  const startY = fx.casingData[0].pos.y; fx.ground = () => 0;
  for (let i = 0; i < 20; i++) fx.update(1 / 60);
  assert.ok(fx.casingData[0].pos.y !== startY, 'the casing moves');
  for (let i = 0; i < 180; i++) fx.update(1 / 60);
  assert.ok(fx.casingData.every(c => !c.live), 'casings disappear');
});

test('inside the station debris falls toward the hull, not down the screen', () => {
  const fx = new Effects(new T.Scene()); fx.radialGravity = true;
  const g = fx.gravityAt(v(0, -100, 0), v()); assert.ok(g.y < -9 && Math.abs(g.x) < 1e-9, 'outward from the axis');
  assert.ok(Math.abs(fx.gravityAt(v(100, 0, 0), v()).x - 9.8) < 1e-9);
});

test('in the station, casings and chips land on the curved promenade instead of falling through', async () => {
  const { RADIUS } = await import('../src/station-constants.js');
  const fx = new Effects(new T.Scene()); fx.radialGravity = true;
  // a spot on the floor near angle 0 (the floor is at radius RADIUS; "up" points toward the axis), shot from 1.5 m above it
  fx.gunfire(v(0, -(RADIUS - 1.5), 0), { dir: v(0, 0, 1), right: v(1, 0, 0), up: v(0, 1, 0), side: 1 }, 'gatling');
  fx.impact(v(0, -(RADIUS - .05), 3), v(0, 1, 0), 'metal', { dir: v(0, -1, 0), power: 2 });
  let deepest = 0;
  for (let i = 0; i < 150; i++) { fx.update(1 / 60); for (const c of fx.casingData) if (c.live) deepest = Math.max(deepest, Math.hypot(c.pos.x, c.pos.y) - RADIUS); for (const p of fx.particles) if (p.bounce) deepest = Math.max(deepest, Math.hypot(p.position.x, p.position.y) - RADIUS); }
  assert.ok(deepest < 1e-6, `debris sank ${deepest.toFixed(3)} m below the floor`);
  // beyond the promenade's edge there is open space: nothing stops a falling chip there
  const out = new T.Vector3(0, -RADIUS - 1, 200), vel = new T.Vector3(0, -3, 0);
  assert.equal(fx.collideFloor(out, vel, .05, .35), false);
});

test('tracers taper: bright head in the direction of travel, thin tail', () => {
  const fx = new Effects(new T.Scene()), p = fx.boltGeometry.parameters;
  assert.ok(p.radiusTop > p.radiusBottom * 5);
});

test('impact sounds exist for each material, are quiet when far, and never stack into a buzz', () => {
  let made = 0;
  const node = () => { const n = { connect() { return n; }, disconnect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, pan: { value: 0 } }; made++; return n; };
  const audio = new AudioEngine(); audio.ctx = { currentTime: 1, sampleRate: 8000, state: 'running', createOscillator: node, createGain: node, createBiquadFilter: node, createBufferSource: node, createStereoPanner: node, createBuffer: () => ({ getChannelData: () => new Float32Array(64) }) };
  audio.master = node();
  for (const kind of ['impactDirt', 'impactWood', 'impactStone', 'impactMetal', 'impactGlass', 'impactWater', 'ricochet']) { audio.ctx.currentTime += 1; made = 0; assert.equal(audio.special(kind, { volume: 1 }), true, kind); assert.ok(made > 1, `${kind} makes sound`); }
  audio.ctx.currentTime += 1; assert.equal(audio.special('impactWood', { volume: 1 }), true);
  made = 0; audio.ctx.currentTime += .01; audio.special('impactWood', { volume: 1 }); assert.equal(made, 0, 'a second impact within 40 ms is dropped');
  audio.ctx.currentTime += 1; made = 0; audio.special('impactWood', { volume: .02 }); assert.equal(made, 0, 'an inaudible impact is skipped');
  assert.ok(impactVolume(5) > impactVolume(60) && impactVolume(500) >= .08 && impactVolume(1, .5) <= .5);
});

test('end to end: a rifle round into an Eden trunk is stopped, sprays bark, scorches it and knocks like wood', () => {
  const eden = makeEden(null), tree = eden.obstacles.find(o => o.kind === 'tree' && o.radius > .6);
  const game = simulation(), played = [];
  game.realm = 'eden'; game.world = eden; game.scene = eden.scene; game.effects = new Effects(eden.scene);
  game.audio = { play: (kind, opts) => played.push({ kind, opts }) };
  const y = tree.position.y + 1.5, start = v(tree.position.x - 8, y, tree.position.z);
  game.camera.position.set(start.x, y + 1, start.z - 3); game.player.position.set(start.x, y + 1, start.z - 3);
  game.bullets.push({ position: start.clone(), velocity: v(165, 0, 0), life: 2, owner: 'player', weapon: 0, damage: 17, shot: 0 });
  for (let i = 0; i < 20 && game.bullets.length; i++) game.updateBullets(1 / 60);
  assert.equal(game.bullets.length, 0, 'the round was stopped by the trunk');
  const hit = played.find(p => p.kind === 'impactWood'); assert.ok(hit, `played ${JSON.stringify(played.map(p => p.kind))}`);
  assert.ok(hit.opts.volume > .5 && Number.isFinite(hit.opts.pan));
  assert.ok(game.effects.particles.length > 5 && game.effects.decals.count === 1, 'bark flies and the trunk is marked');
  const d = game.effects.decalData[0]; assert.ok(Math.abs(d.pos.x - (tree.position.x - tree.radius)) < .6, 'the mark is on the face that was hit');
});

test('end to end: a round skimming a station hull rings off it', () => {
  const game = simulation(), played = [], fx = new Effects(game.scene);
  game.effects = fx; game.audio = { play: (kind, opts) => played.push(kind) };
  const random = Math.random; Math.random = () => .1; // ricochets happen 85% of the time; pin the dice so this test is not flaky
  try { game.worldImpact({ x: 0, y: 0, z: 0, surface: 'hull', normal: { x: 0, y: 1, z: 0 } }, v(0, 0, 0), { owner: 'player', weapon: 0, damage: 17, velocity: v(165, -6, 0) }); } finally { Math.random = random; }
  assert.deepEqual(played, ['ricochet'], 'plain-object station normals are handled');
});
