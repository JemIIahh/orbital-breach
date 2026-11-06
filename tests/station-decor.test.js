import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { buildStationDecor } from '../src/station-decor.js';
import { ATLAS_SIZE, ATLAS_WORDS, CONTAINER_IDS, numeralRect, wordRect, uvOf } from '../src/station-atlas.js';
import { createStationLayout } from '../src/station-layout.js';
import { SECTION_COUNT } from '../src/station-zones.js';
import { RADIUS, HALF_WIDTH } from '../src/station-constants.js';
import { makeWorld } from '../src/world.js';

// Same CPU-only canvas stub as the world tests: textures are never uploaded to a GPU here.
const context = { fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, fillText() {}, createRadialGradient() { return { addColorStop() {} }; } };
globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return context; } }; } };

const build = () => { const scene = new T.Scene(); return { scene, decor: buildStationDecor(scene, {}, { layout: createStationLayout() }) }; };

test('station decor stays inside a small, fixed draw-call budget', () => {
  const { scene, decor } = build();
  const instanced = [], plain = [];
  scene.traverse(o => { if (o.isInstancedMesh) instanced.push(o); else if (o.isMesh) plain.push(o); });
  assert.equal(instanced.length, 3, 'painted boxes, glow and foliage are the only instanced batches');
  assert.equal(plain.length, 1, 'every stencil is merged into a single mesh');
  assert.ok(decor.instances.paint > 3000, 'the whole ring is dressed');
  assert.ok(decor.decalCount > 300, 'section numbers, zone words, airlock signs and container ids are all stencilled');
  for (const mesh of instanced) for (let i = 0; i < mesh.count; i += 97) {
    const m = new T.Matrix4(); mesh.getMatrixAt(i, m);
    assert.ok(m.elements.every(Number.isFinite), `${mesh.name} instance ${i} must be finite`);
  }
});

test('stencil quads are well formed: finite, inside the atlas, and wound to face the way their normals say', () => {
  const { decor } = build();
  const g = decor.stencils.geometry, p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv'), index = g.getIndex();
  assert.ok(p.array.every(Number.isFinite) && n.array.every(Number.isFinite));
  assert.ok(uv.array.every(v => v >= 0 && v <= 1), 'uv stays inside the atlas');
  const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), face = new T.Vector3(), stored = new T.Vector3();
  for (let t = 0; t < index.count; t += 3) {
    const [i, j, k] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, j); c.fromBufferAttribute(p, k);
    face.subVectors(b, a).cross(c.clone().sub(a)).normalize(); stored.fromBufferAttribute(n, i);
    assert.ok(face.dot(stored) > .999, `triangle ${t / 3} winding disagrees with its normal`);
  }
});

test('stencils never cover the breakable window panes', () => {
  const { decor } = build();
  const p = decor.stencils.geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), height = RADIUS - Math.hypot(x, y);
    // Panes live on the corridor walls between 2.05 m and 9.05 m; anything touching a wall must stay clear of that band.
    if (Math.abs(z) > HALF_WIDTH - .3 && Math.abs(z) < HALF_WIDTH) assert.ok(height < 2.05 || height > 9.05, `decal vertex at height ${height.toFixed(2)} overlaps the window band`);
  }
});

test('atlas cells are unique, inside the texture and cover every section and word', () => {
  const rects = [];
  for (let s = 1; s <= SECTION_COUNT; s++) rects.push(numeralRect(s));
  for (const word of ATLAS_WORDS) rects.push(wordRect(word));
  for (const r of rects) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= ATLAS_SIZE && r.y + r.h <= ATLAS_SIZE, 'cell inside the atlas');
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `atlas cells ${i} and ${j} overlap`);
  }
  for (const id of CONTAINER_IDS) assert.ok(ATLAS_WORDS.includes(id), `${id} has an atlas cell`);
  assert.throws(() => wordRect('NOT A WORD'));
  const { u0, u1, v0, v1 } = uvOf(numeralRect(1));
  assert.ok(u0 < u1 && v0 < v1 && u0 >= 0 && v1 <= 1);
});

test('dressing the station adds no collision and keeps the cover layout', () => {
  const world = makeWorld(null);
  assert.equal(world.covers.length, 48);
  assert.equal(world.stationSolids.length, createStationLayout().solids.length, 'decor must not register solids');
  assert.ok(world.decor.reactorLight.isPointLight, 'the reactor keeps its warm point light');
});
