import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { makeEden, terrainHeight } from '../src/eden.js';
import { makeCity } from '../src/city.js';
import { treeParts, attachParts, resolveParts, skirtProfile } from '../src/tree-collision.js';
import { makeObstacle } from '../src/eden-layout.js';

// Same narrow canvas stub the other world suites use.
const context = { fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, fillText() {}, createRadialGradient() { return { addColorStop() {} }; } };
globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return context; } }; } };

const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const UP = v(0, 1, 0), BODY = 1.45, EYE = 2.65;
const eden = makeEden(null);
const trees = eden.obstacles.filter(o => o.kind === 'tree');
// Pines are the tall, slim-trunked ones (collider 12 m); oaks have the thickest trunks and a high crown.
const pine = trees.find(o => o.radius > .35 && o.radius < .7 && o.height > 9.5 && o.height < 17);
const oak = trees.find(o => o.radius > .65 && o.height > 5 && o.height < 10);

// Drive the mech body at a tree from `from`, holding height and heading, and report the closest it ever gets to the trunk axis.
function approach(tree, from, lift, speed = 14, frames = 240) {
  const gy = tree.position.y;
  let pos = v(from.x, gy + EYE + lift, from.z), closest = Infinity;
  const dir = v(tree.position.x - from.x, 0, tree.position.z - from.z).normalize(), vel = dir.clone().multiplyScalar(speed);
  for (let i = 0; i < frames; i++) {
    pos = eden.resolve(pos, pos.clone().addScaledVector(vel, 1 / 60), vel, BODY, UP);
    pos.y = gy + EYE + lift; vel.copy(dir).multiplyScalar(speed);
    closest = Math.min(closest, Math.hypot(pos.x - tree.position.x, pos.z - tree.position.z));
  }
  return closest;
}

test('every Eden tree carries a compound solid wider than its trunk, with finite numbers', () => {
  assert.ok(trees.length > 150);
  for (const t of trees) {
    assert.ok(t.parts?.length > 0, 'tree has no parts');
    assert.ok(t.reach >= t.radius && Number.isFinite(t.reach) && Number.isFinite(t.top) && Number.isFinite(t.walkReach));
    for (const p of t.parts) assert.ok(Object.values(p).every(x => typeof x === 'string' || Number.isFinite(x)), 'non-finite part');
  }
  // trunk box stays the trunk: bullets and bot navigation still read it
  assert.ok(Math.abs(pine.box.max.x - pine.box.min.x - pine.radius * 2) < 1e-6);
});

test('a walking mech can no longer sink into a pine\'s branches', () => {
  // Before: the solid stopped at trunk + body = 1.95 m while the branches reach ~3.8 m.
  const closest = approach(pine, v(pine.position.x + 12, 0, pine.position.z), 0);
  assert.ok(closest > 3.0, `body got to ${closest.toFixed(2)} m from the trunk`);
  assert.ok(closest < 4.6, `colliders should hug the foliage, not wall it off (${closest.toFixed(2)} m)`);
});

test('a flying mech is stopped by a pine and by an oak crown at their foliage heights', () => {
  const lowPine = approach(pine, v(pine.position.x, 0, pine.position.z + 12), 5);
  assert.ok(lowPine > 2.3, `flew to ${lowPine.toFixed(2)} m of the pine at 5 m up`);
  const crownLift = oak.parts.filter(p => p.type === 'ell').map(p => p.y - oak.position.y).sort((a, b) => a - b)[0];
  assert.ok(Number.isFinite(crownLift), 'oak has crown lumps');
  const flying = approach(oak, v(oak.position.x - 14, 0, oak.position.z), crownLift - EYE + 1.2);
  assert.ok(flying > oak.radius + BODY + 1.0, `flew to ${flying.toFixed(2)} m into the oak crown`);
});

test('a walking mech still passes under an oak crown and reaches the trunk', () => {
  assert.ok(oak.walkReach < 2.6, `oak walk reach ${oak.walkReach.toFixed(2)} m should be trunk-ish, not crown-wide`);
  const closest = approach(oak, v(oak.position.x, 0, oak.position.z - 12), 0);
  assert.ok(closest < oak.walkReach + BODY + .4, `walking under the crown stopped at ${closest.toFixed(2)} m`);
});

test('dropping onto a crown lands on it instead of falling through', () => {
  const lump = oak.parts.filter(p => p.type === 'ell').sort((a, b) => b.y + b.rv - (a.y + a.rv))[0];
  let pos = v(lump.x, lump.y + lump.rv + 6, lump.z);
  const vel = v(0, -25, 0);
  for (let i = 0; i < 90; i++) { pos = eden.resolve(pos, pos.clone().addScaledVector(vel, 1 / 60), vel, BODY, UP); if (vel.y < 0) vel.y = -25; }
  const bodyY = pos.y - 1.2;
  assert.ok(bodyY > lump.y, `fell through the crown to ${bodyY.toFixed(2)} (crown centre ${lump.y.toFixed(2)})`);
});

test('a boosting dash cannot tunnel through a trunk', () => {
  for (const angle of [0, 1.1, 2.3, 3.9, 5.2]) {
    const from = v(pine.position.x + Math.cos(angle) * 14, 0, pine.position.z + Math.sin(angle) * 14);
    assert.ok(approach(pine, from, 0, 43, 120) > 2.3, `dash from ${angle} rad reached the trunk`);
  }
});

test('foliage stops bodies but not shots or line of sight; trunks stop both', () => {
  const lump = oak.parts.filter(p => p.type === 'ell')[0];
  const through = eden.raycast(v(lump.x - 9, lump.y, lump.z), v(lump.x + 9, lump.y, lump.z));
  assert.ok(!through || through.kind !== 'tree' || Math.hypot(through.x - oak.position.x, through.z - oak.position.z) < oak.radius + .5 || through.y < oak.position.y + oak.height + .1, 'a bolt through the crown should not stop on leaves');
  const mid = oak.position.y + 1;
  const trunk = eden.raycast(v(oak.position.x - 6, mid, oak.position.z), v(oak.position.x + 6, mid, oak.position.z));
  assert.equal(trunk?.surface, 'tree');
  assert.equal(trunk.kind, 'tree', 'impacts report what they hit');
});

test('collision parts follow the instance: yaw and scale move and size the crown', () => {
  const shape = { h: 4, trunk: () => .5, blobs: [{ c: { x: 3, y: 5, z: 0 }, rx: 2, ry: 2, rz: 2 }] };
  const a = treeParts(shape, { x: 10, y: 0, z: 10 }), b = treeParts(shape, { x: 10, y: 0, z: 10, ry: Math.PI / 2 }), c = treeParts(shape, { x: 10, y: 0, z: 10, sx: 2, sy: 2, sz: 2 });
  const ell = ps => ps.find(p => p.type === 'ell');
  assert.ok(Math.abs(ell(a).x - 13) < 1e-6 && Math.abs(ell(a).z - 10) < 1e-6);
  assert.ok(Math.abs(ell(b).x - 10) < 1e-6 && Math.abs(Math.abs(ell(b).z - 10) - 3) < 1e-6, 'a quarter turn swings the lump round the trunk');
  assert.ok(ell(c).rh > ell(a).rh * 1.9 && ell(c).y > ell(a).y * 1.9, 'a bigger tree has a bigger, higher crown');
});

test('resolveParts is stable: a body inside a solid is ejected, never NaN', () => {
  const o = attachParts(makeObstacle('tree', 0, 0, 0, .5, 6), [{ type: 'cyl', x: 0, z: 0, y0: 0, y1: 6, r: 1 }, { type: 'ell', x: 0, y: 8, z: 0, rh: 2, rv: 1.5 }]);
  for (const at of [v(0, 3, 0), v(.0001, 3, 0), v(0, 8, 0), v(.5, 8.2, .1)]) {
    const p = at.clone().add(v(0, 1.2, 0)), body = at.clone(), vel = v(1, -1, 1);
    resolveParts(o, p, body, BODY, vel);
    assert.ok([p.x, p.y, p.z, vel.x, vel.y, vel.z].every(Number.isFinite), 'finite result');
    assert.ok(Math.hypot(body.x, body.z) >= 1 + BODY - .05 || body.y > 6 + BODY - .05 || at.y > 6, 'ejected from the trunk');
  }
});

test('pine skirt profile is widest at each tier\'s lower edge and closes at the tip', () => {
  const s = skirtProfile([{ y0: 2, y1: 7, mid: 3.5, R: 3 }]);
  assert.equal(s.top, 7); assert.equal(s.radius(1), 0); assert.equal(s.radius(8), 0);
  assert.ok(s.radius(2.01) > s.radius(3.4) && s.radius(3.4) > s.radius(6.9) && s.radius(6.9) > 0);
});

test('Eden stays walkable: the path, clearings and spawn are still free of canopy solids', () => {
  // the path test in eden.test.js walks the real route; here check no crown reaches any keep-clear zone at walking height
  for (const t of trees) {
    for (const z of [{ x: 0, z: -44, r: 5 }, { x: 0, z: -53, r: 4 }, { x: 0, z: 74, r: 1 }]) {
      assert.ok(Math.hypot(t.position.x - z.x, t.position.z - z.z) >= t.walkReach + z.r, `tree at ${t.position.x.toFixed(1)},${t.position.z.toFixed(1)} reaches into a keep-clear zone`);
    }
  }
});

test('Meridian street-tree crowns stop the mech but let bullets through', () => {
  const city = makeCity();
  assert.ok(city.bodyBoxes.length >= 30, 'street trees contribute crown boxes');
  // crowns are the raised body boxes; ground-level ones are props the mech can also stand on (tests/landing.test.js)
  const crown = city.bodyBoxes.find(b => b.min.y > 1.5), c = crown.getCenter(v()), s = crown.getSize(v());
  // a mech flying up into it is blocked
  let pos = v(c.x, c.y - s.y / 2 - 3, c.z); const vel = v(0, 14, 0);
  for (let i = 0; i < 90; i++) { pos = city.resolve(pos, pos.clone().addScaledVector(vel, 1 / 60), vel, BODY, UP); vel.y = 14; }
  assert.ok(pos.y - 1.2 < c.y - s.y / 2 + .05, `flew up through the crown to ${pos.y.toFixed(2)}`);
  // but a bolt crossing the crown is not stopped by it
  const hit = city.raycast(v(c.x - 4, c.y, c.z), v(c.x + 4, c.y, c.z));
  assert.ok(!hit || !(hit.x > crown.min.x - .01 && hit.x < crown.max.x + .01 && Math.abs(hit.y - c.y) < s.y / 2 && Math.abs(hit.z - c.z) < s.z / 2), 'the bolt ran into the leaves');
});
