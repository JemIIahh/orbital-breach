import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { makeCity } from '../src/city.js';

// A counting canvas context: the scoreboard must only draw when a value changes, and only use calls the stub provides.
const drawn = { text: 0, frames: 0 };
const context = {
  fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, createRadialGradient() { return { addColorStop() {} }; },
  fillText(text) { drawn.text++; (drawn.lines ||= []).push(text); },
};
globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return context; } }; } };

test('the arena is hidden by default, toggles with setArena and exposes the wiring API', () => {
  const world = makeCity();
  for (const name of ['setArena', 'pulseGates', 'setArenaBoard', 'update']) assert.equal(typeof world[name], 'function', name);
  assert.equal(world.arena.group.visible, false);
  assert.equal(world.arenaActive, false);
  assert.equal(world.setArena(true), true); assert.equal(world.arenaActive, true); assert.equal(world.arena.group.visible, true);
  world.setArena(true); world.setArena(true);
  assert.equal(world.setArena(false), false); assert.equal(world.arena.group.visible, false);
});

test('the arena adds no collision and no real-time lights, and few draw calls', () => {
  const world = makeCity(), lights = () => { let n = 0; world.scene.traverse(o => { if (o.isLight) n++; }); return n; };
  const obstacles = world.obstacles.length, before = lights();
  world.setArena(true); for (let i = 0; i < 120; i++) world.update(i / 30); world.pulseGates();
  assert.equal(world.obstacles.length, obstacles);
  assert.equal(lights(), before, 'arena must not change the light count');
  let calls = 0, batches = 0;
  world.arena.group.traverse(o => { if (o.isMesh) calls++; if (o.isInstancedMesh) batches++; });
  assert.ok(calls <= 20, `${calls} arena draw calls`); assert.ok(batches <= 7, `${batches} arena batches`);
  const ray = world.raycast(new T.Vector3(0, 30, 90), new T.Vector3(0, 30, 120));
  assert.equal(ray, null, 'the scoreboard and walls are not hit-scan surfaces');
});

test('the scoreboard redraws only when its values change', () => {
  const world = makeCity();
  world.setArena(true);
  const base = drawn.text;
  world.setArenaBoard({ wave: 3, score: 1250, lives: 2, best: { wave: 7, score: 9000 } });
  const first = drawn.text; assert.ok(first > base, 'a new value draws');
  for (let i = 0; i < 6; i++) world.setArenaBoard({ wave: 3, score: 1250, lives: 2, best: { wave: 7, score: 9000 } });
  for (let i = 0; i < 30; i++) world.update(i / 10);
  assert.equal(drawn.text, first, 'identical values and frame updates must not redraw');
  world.setArenaBoard({ wave: 4 }); const second = drawn.text; assert.ok(second > first);
  assert.ok(drawn.lines.includes('04') && drawn.lines.includes('1,250'), `board text: ${drawn.lines.slice(-8)}`);
  world.setArenaBoard({ lives: 0, best: 12 }); assert.ok(drawn.text > second);
  assert.equal(world.arena.state.best.wave, 12);
});

test('spawn gates open on pulseGates and close again, and a pulse while the arena is off does nothing', () => {
  const world = makeCity(), arena = world.arena;
  world.pulseGates(); world.setArena(true); world.update(1); assert.equal(arena.gateLevel, 0, 'a pulse while hidden is dropped');
  world.pulseGates();
  const levels = []; for (let t = 2; t < 9; t += .1) { world.update(t); levels.push(arena.gateLevel); }
  assert.ok(Math.max(...levels) > .99, 'shutters fully open');
  assert.equal(levels[levels.length - 1], 0, 'and close again');
  assert.ok(levels.every(l => l >= 0 && l <= 1 && Number.isFinite(l)));
  // a second wave pulses again even if time keeps counting up
  world.pulseGates(); world.update(20); world.update(21.6); assert.ok(arena.gateLevel > .5);
  // shutter slats stay finite and inside the lintel
  const slats = arena.meshes.find(m => m.name === 'arena:shutters'), a = slats.instanceMatrix.array;
  assert.ok(a.every(Number.isFinite));
});

test('floodlights, trophies and drones animate with finite transforms, repeatedly', () => {
  const world = makeCity(); world.setArena(true);
  for (let i = 0; i < 600; i++) { world.update(i / 60, i % 2 === 0, false, i % 4); if (i % 90 === 0) world.pulseGates(); }
  world.arena.group.traverse(o => {
    assert.ok(o.position.toArray().every(Number.isFinite), `${o.name} position`);
    if (o.isInstancedMesh) assert.ok(o.instanceMatrix.array.every(Number.isFinite), `${o.name} matrices`);
  });
  const dusk = world.scene.fog.near;
  assert.ok(dusk < 90, 'the light drops toward dusk while the arena is on');
  world.setArena(false); assert.equal(world.scene.fog.near, 90, 'daylight returns when the arena is switched off');
  assert.ok(Math.abs(world.sun.intensity - 2.6) < 1e-6);
});
