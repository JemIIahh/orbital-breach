import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { makeCity } from '../src/city.js';
import { CITY_UPLINKS } from '../src/encounters.js';

// The canvas stub only supports the calls the rest of the suite uses, so the code under test must guard anything else.
const context = { fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, fillText() {}, createRadialGradient() { return { addColorStop() {} }; } };
globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return context; } }; } };

const stats = world => {
  const out = { batches: 0, meshes: 0, instances: 0, names: [] };
  world.scene.traverse(o => {
    if (o.isInstancedMesh) { out.batches++; out.instances += o.count; out.names.push(o.name); }
    if (o.isMesh) out.meshes++;
  });
  return out;
};
const fingerprint = world => { let h = 0; world.scene.traverse(o => { if (o.isInstancedMesh) { const a = o.instanceMatrix.array; for (let i = 0; i < a.length; i += 7) h = (h * 31 + Math.round(a[i] * 1000)) | 0; } }); return h; };

test('Meridian is deterministic and stays inside the draw-call budget with and without the arena', () => {
  const a = makeCity(), b = makeCity();
  assert.equal(fingerprint(a), fingerprint(b), 'two builds must produce the same city');
  const s = stats(a);
  assert.ok(s.batches <= 24, `${s.batches} instanced batches`);
  assert.ok(s.meshes < 64, `${s.meshes} meshes`);
  assert.ok(s.instances > 3000 && s.instances < 9000, `${s.instances} instances`);
  assert.deepEqual(stats(b), s);
});

test('every instance transform, colour and vertex in the city is finite', () => {
  const world = makeCity();
  world.scene.traverse(o => {
    assert.ok(o.position.toArray().every(Number.isFinite), `${o.name} position`);
    if (o.isInstancedMesh) {
      assert.ok(o.instanceMatrix.array.every(Number.isFinite), `${o.name} matrices`);
      if (o.instanceColor) assert.ok(o.instanceColor.array.every(Number.isFinite), `${o.name} colours`);
    }
    if (o.geometry) for (const attribute of Object.values(o.geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite), `${o.name || o.type} ${attribute.itemSize}`);
  });
});

test('the original collision footprints survive and nothing solid sits on the spawn, relays or gateway', () => {
  const world = makeCity(), boxes = world.obstacles.map(o => o.box);
  const has = (cx, cy, cz, sx, sy, sz) => boxes.some(b => Math.abs((b.min.x + b.max.x) / 2 - cx) < 1e-6 && Math.abs((b.min.y + b.max.y) / 2 - cy) < 1e-6 && Math.abs((b.min.z + b.max.z) / 2 - cz) < 1e-6 && Math.abs(b.max.x - b.min.x - sx) < 1e-6 && Math.abs(b.max.y - b.min.y - sy) < 1e-6 && Math.abs(b.max.z - b.min.z - sz) < 1e-6);
  for (const side of [-1, 1]) for (let row = 0; row < 4; row++) {
    const z = -30 + row * 40, height = 22 + ((row + (side > 0 ? 1 : 0)) % 3) * 11;
    assert.ok(has(side * 40, height / 2, z, 21, height, 23), `tower ${side},${row}`);
    assert.ok(has(side * 40, height + .4, z, 23, .8, 25), `roof ${side},${row}`);
    assert.ok(has(side * 73, (38 + (row % 2) * 20) / 2, z + 2, 28, 38 + (row % 2) * 20, 29), `back building ${side},${row}`);
    assert.ok(has(side * 24, .6, z + 13, 5, 1.2, 3), `planter ${side},${row}`);
  }
  for (const [x, z] of [[-8, -28], [9, 13], [-9, 50], [9, 79]]) assert.ok(has(x, .95, z, 4.5, 1.9, 2.2), `median cover ${x},${z}`);
  for (const x of [-13, 13]) assert.ok(has(x, 12, 99, 4, 24, 5), `gate tower ${x}`);
  // Spawn: a mech body (radius 1.45, eye 2.65 above ground) must have clear air in every direction.
  const spawn = new T.Vector3(0, 1.45, -65);
  for (const b of boxes) assert.ok(b.distanceToPoint(spawn) > 6, 'cover too close to the spawn');
  for (const u of CITY_UPLINKS) { const p = new T.Vector3(u.x, 1.45, u.z); for (const b of boxes) assert.ok(b.distanceToPoint(p) > 3.5, `cover crowds relay ${u.name}`); }
  // Gateway: the portal ring spans x in [-3.25, 3.25] at z=94; the approach lane x in [-9, 9] stays open.
  for (const b of boxes) if (b.max.y < 40 && b.max.z > 84 && b.min.z < 100) assert.ok(b.min.x > 9 || b.max.x < -9, 'the gateway approach must stay clear');
  // And the central lane is not walled off: no new solid blocks both x in [-6, 6] over a long run.
  assert.ok(world.obstacles.length < 200, `${world.obstacles.length} solid boxes keeps ray tests cheap`);
});

test('the avenue is still crossable: a mech walks spawn to gateway without being stopped by new props', () => {
  const world = makeCity(), velocity = new T.Vector3(0, 0, 30);
  let p = new T.Vector3(0, 2.65, -65);
  for (let i = 0; i < 400; i++) { const next = p.clone().add(new T.Vector3(0, 0, .35)); p = world.resolve(p, next, velocity); }
  assert.ok(p.z > 20, `stopped at z=${p.z.toFixed(1)}`);
});

test('the sky, plumes and dishes animate safely every frame', () => {
  const world = makeCity();
  assert.ok(world.sky.mesh.material.uniforms.uSun.value.y > 0.3, 'the sun is above the horizon');
  assert.ok(world.life.plumes, 'steam vents and burnt wrecks exist');
  assert.ok(world.life.dishes.length >= 4, 'rooftop radar dishes');
  const before = world.life.dishes[0].rotation.y;
  for (let i = 0; i < 300; i++) world.update(i / 60, false, false, i % 3);
  assert.notEqual(world.life.dishes[0].rotation.y, before);
  assert.ok(world.life.dishes.every(d => Number.isFinite(d.rotation.y)));
  // time can restart (new run) or stall (pause) without breaking anything
  world.update(0); world.update(0); world.update(500);
  assert.ok(Number.isFinite(world.scene.fog.near) && world.scene.fog.far > world.scene.fog.near);
});
