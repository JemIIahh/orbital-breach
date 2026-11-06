import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { makeEden, terrainHeight } from '../src/eden.js';
import { makeCity } from '../src/city.js';
import { CITY_UPLINKS } from '../src/encounters.js';

// Landing on things: a mech that comes down on a rock, a ruin, a car or a bench must stand on it. It used to be pushed sideways
// off Eden's obstacles and fell through every city prop that was not a building, so it "sank to the floor".
const context = { fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, fillText() {}, createRadialGradient() { return { addColorStop() {} }; } };
globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return context; } }; } };
const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z), UP = v(0, 1, 0), BODY = 1.45, EYE = 1.2;
const eden = makeEden(null), city = makeCity();

// The same vertical rules the game applies while the boots are on: gravity, a terminal speed, no horizontal drive.
function settle(world, start, frames = 240) {
  let p = start.clone(); const vel = v();
  for (let i = 0; i < frames; i++) {
    vel.y = Math.max(-17, vel.y - 22 / 60);
    p = world.resolve(p, p.clone().addScaledVector(vel, 1 / 60), vel, BODY, UP);
  }
  return p;
}
// "isolated" = nothing else can touch a body that falls straight down the centre line of `o`: every neighbour is further than its own
// reach plus the body radius. (The wider `gap` is for tests that walk across a stretch of ground.)
const isolated = (o, gap = 0) => eden.obstacles.every(r => r === o || Math.hypot(r.position.x - o.position.x, r.position.z - o.position.z) > gap + BODY + .3 + (r.reach || r.radius) + (o.reach || o.radius));

test('Eden: a mech dropped onto a rock, ruin, wall, stone or barrel stands on its top', () => {
  const kinds = new Set();
  for (const o of eden.obstacles) {
    if (o.parts || o.kind === 'log' || !isolated(o) || o.height < .6) continue;
    const top = o.position.y + o.height, p = settle(eden, v(o.position.x, top + 9, o.position.z));
    assert.ok(Math.abs(p.y - (top + BODY + EYE)) < .05, `${o.kind} (h ${o.height.toFixed(2)}): rested at ${p.y.toFixed(2)}, wanted ${(top + BODY + EYE).toFixed(2)}`);
    assert.ok(Math.hypot(p.x - o.position.x, p.z - o.position.z) < .05, `${o.kind}: slid off while landing dead centre`);
    kinds.add(o.kind);
  }
  assert.ok(kinds.size >= 4, `only ${[...kinds].join(', ')} could be checked`);
});

test('Eden: tall faces still stop a mech that walks into them, and it does not climb them', () => {
  const wall = eden.obstacles.find(o => o.height >= 4 && ['rock', 'crag', 'pylon', 'wall', 'ruin'].includes(o.kind) && isolated(o, 8));
  assert.ok(wall, 'a tall isolated obstacle exists');
  const ground = terrainHeight(wall.position.x - wall.radius - 12, wall.position.z) + BODY + EYE;
  let p = v(wall.position.x - wall.radius - 12, ground, wall.position.z); const vel = v(14, 0, 0);
  for (let i = 0; i < 240; i++) {
    vel.x = 14; vel.y = Math.max(-17, vel.y - 22 / 60);
    p = eden.resolve(p, p.clone().addScaledVector(vel, 1 / 60), vel, BODY, UP);
  }
  assert.ok(p.x < wall.position.x - 0.5, `walked through a ${wall.kind} to x ${p.x.toFixed(2)} (centre ${wall.position.x.toFixed(2)})`);
  assert.ok(p.y < wall.position.y + wall.height, 'a mech walking into a tall face does not scale it');
});

test('Eden: low rubble is stepped over, never a wall', () => {
  const rubble = eden.obstacles.find(o => o.height <= 1.3 && o.height >= .5 && isolated(o, 8));
  assert.ok(rubble, 'an isolated low obstacle exists');
  let p = v(rubble.position.x - 10, terrainHeight(rubble.position.x - 10, rubble.position.z) + BODY + EYE, rubble.position.z); const vel = v(14, 0, 0);
  for (let i = 0; i < 180; i++) {
    vel.x = 14; vel.y = Math.max(-17, vel.y - 22 / 60);
    const ground = terrainHeight(p.x, p.z) + BODY + EYE;
    p = eden.resolve(p, p.clone().addScaledVector(vel, 1 / 60), vel, BODY, UP);
    if (p.y < ground) p.y = ground;
  }
  assert.ok(p.x > rubble.position.x + 4, `stuck at the ${rubble.kind}: x ${p.x.toFixed(2)} vs ${rubble.position.x.toFixed(2)}`);
});

test('Meridian: ground-level props (cars, benches, planters, stalls) now hold a landing instead of letting the mech sink', () => {
  const props = city.bodyBoxes.filter(b => b.min.y < 1 && b.getSize(v()).y >= .5 && b.getSize(v()).y <= 4);
  assert.ok(props.length >= 60, `${props.length} ground-level body boxes`);
  const all = [...city.obstacles.map(o => o.box), ...city.bodyBoxes];
  let checked = 0;
  for (const box of props) {
    const c = box.getCenter(v()), top = box.max.y;
    // skip boxes with anything stacked over the landing spot: the question is whether *this* box holds
    if (all.some(o => o !== box && o.min.y >= top - .01 && o.min.x < c.x + .3 && o.max.x > c.x - .3 && o.min.z < c.z + .3 && o.max.z > c.z - .3)) continue;
    const covering = all.filter(o => o !== box && c.x > o.min.x - BODY && c.x < o.max.x + BODY && c.z > o.min.z - BODY && c.z < o.max.z + BODY && o.max.y > top - .01);
    if (covering.length) continue; // part of a bigger structure: the taller neighbour decides where a mech rests
    const p = settle(city, v(c.x, top + 8, c.z), 200);
    assert.ok(p.y - EYE - BODY >= top - .05, `sank into a prop: rested ${(p.y - EYE - BODY).toFixed(2)} below its top ${top.toFixed(2)}`);
    checked++;
  }
  assert.ok(checked >= 20, `only ${checked} props were isolated enough to check`);
});

test('Meridian: the new prop collision never blocks the spawn, the relay pads or the portal approach', () => {
  const spots = [{ x: 0, z: -65 }, { x: 0, z: -44 }, ...CITY_UPLINKS, { x: 0, z: 90 }];
  for (const s of spots) {
    const eye = v(s.x, BODY + EYE, s.z), out = city.resolve(eye, eye.clone(), v(), BODY, UP);
    assert.ok(Math.hypot(out.x - eye.x, out.z - eye.z) < .01 && Math.abs(out.y - eye.y) < .01, `a prop overlaps ${s.x},${s.z}`);
  }
});

// ---- the big rock things: cliffs, basalt, boulders and the footbridge (the escarpment blocks used to have no collision at all) ----------

// The highest part of an obstacle is its summit. Stand on it unless a taller part of something else is close enough to push the body.
const summit = o => o.parts.reduce((a, b) => (b.y1 > a.y1 ? b : a));
// (tree canopies hanging over the summit count too: a mech dropped through a canopy is pushed aside, which is correct but not what this checks)
const unobstructed = (o, top) => eden.obstacles.every(r => r === o || !r.parts || r.parts.every(q => q.type === 'cyl'
  ? q.y1 < top.y1 - BODY || Math.hypot(q.x - top.x, q.z - top.z) > q.r + BODY + .3
  : q.y + q.rv < top.y1 - BODY || q.y - q.rv > top.y1 + 6 + BODY || Math.hypot(q.x - top.x, q.z - top.z) > q.rh + BODY + .3));

test('Eden: every cliff block, basalt column and boulder holds a mech that lands on its summit', () => {
  const seen = {};
  for (const o of eden.obstacles) {
    if (!['crag', 'basalt', 'rock'].includes(o.kind)) continue;
    assert.ok(o.parts?.length, `${o.kind} at ${o.position.x.toFixed(0)},${o.position.z.toFixed(0)} has no collision parts`);
    const top = summit(o);
    if (!unobstructed(o, top)) continue;
    const p = settle(eden, v(top.x, top.y1 + 6, top.z), 200);
    assert.ok(Math.abs(p.y - (top.y1 + BODY + EYE)) < .06, `${o.kind} (summit ${top.y1.toFixed(1)}): rested ${p.y.toFixed(2)}, wanted ${(top.y1 + BODY + EYE).toFixed(2)}`);
    assert.ok(Math.hypot(p.x - top.x, p.z - top.z) < .06, `${o.kind}: slid off while landing on the summit`);
    seen[o.kind] = (seen[o.kind] || 0) + 1;
  }
  assert.ok(seen.crag >= 15 && seen.basalt >= 1 && seen.rock >= 20, `only checked ${JSON.stringify(seen)}`);
});

test('Eden: the cliff blocks are as tall as they look (collision follows the drawn prisms)', () => {
  let inst; eden.scene.traverse(o => { if (o.name === 'crags') inst = o; });
  assert.ok(inst && inst.count >= 50, 'the escarpment crags are drawn');
  const crags = eden.obstacles.filter(o => o.kind === 'crag');
  assert.equal(crags.length, inst.count, 'one collision cluster per drawn crag');
  // the drawn peak of each instance (its geometry's highest vertex through its matrix) must be covered by that cluster's summit
  const m = new T.Matrix4(), q = new T.Vector3(), pos = inst.geometry.attributes.position;
  let top = -1, vertex = null; for (let i = 0; i < pos.count; i++) if (pos.getY(i) > top) { top = pos.getY(i); vertex = i; }
  let checked = 0;
  for (let i = 0; i < inst.count; i++) {
    inst.getMatrixAt(i, m); q.fromBufferAttribute(pos, vertex).applyMatrix4(m);
    const cluster = crags.find(c => Math.abs(c.box.min.x - q.x) < 20 && c.parts.some(p => p.type === 'cyl' && Math.hypot(p.x - q.x, p.z - q.z) <= p.r + .6 && q.y >= p.y0 - .6 && q.y <= p.y1 + .6));
    assert.ok(cluster, `the drawn peak of crag ${i} at ${q.x.toFixed(0)},${q.y.toFixed(1)},${q.z.toFixed(0)} is not covered by any collision part`);
    checked++;
  }
  assert.equal(checked, inst.count);
});

test('Eden: the footbridge deck holds a mech walking across, well above the stream bed', () => {
  const bridge = eden.ruins.bridge, deck = bridge.deck + .06;
  let p = v(bridge.x, terrainHeight(bridge.x, bridge.zc - 11) + BODY + EYE, bridge.zc - 11); const vel = v(0, 0, 8); let atCentre = null, crossed = false;
  for (let i = 0; i < 420; i++) {
    vel.z = 8; vel.y = Math.max(-17, vel.y - 22 / 60);
    p = eden.resolve(p, p.clone().addScaledVector(vel, 1 / 60), vel, BODY, UP);
    if (Math.abs(p.z - bridge.zc) < .3 && !atCentre) atCentre = p.y;
    if (p.z > bridge.zc + 8) { crossed = true; break; }
  }
  assert.ok(atCentre !== null, 'the mech reached the middle of the bridge');
  assert.ok(Math.abs(atCentre - (deck + BODY + EYE)) < .08, `mid-bridge the eye is at ${atCentre.toFixed(2)}, the deck stands at ${(deck + BODY + EYE).toFixed(2)}`);
  assert.ok(atCentre - (terrainHeight(bridge.x, bridge.zc) + BODY + EYE) > 2, 'it is walking on the deck, not wading the stream below');
  assert.ok(crossed, 'and it walked off the far end');
});

test('Eden: bullets hit the cliff blocks where they really are, not at a cluster-sized box', () => {
  const o = eden.obstacles.find(c => c.kind === 'crag' && c.parts.length > 30), part = o.parts.find(q => q.y1 - q.y0 > 1 && q.y0 > o.position.y + 3);
  assert.ok(part, 'a tall prism band exists');
  const y = (part.y0 + part.y1) / 2, a = v(part.x - part.r - 8, y, part.z), hit = eden.raycast(a, v(part.x + part.r + 8, y, part.z));
  assert.ok(hit && hit.kind === 'crag', 'the shot lands on a crag');
  assert.ok(hit.x <= part.x + .05, 'and it arrives no later than the prism axis');
});
