import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { STEP, SNAP_DISTANCE, blendAlpha, blendPosition, ShadowGovernor } from '../src/frame-pacing.js';
import { simulation } from './support.js';

const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);

test('blend alpha is the fraction of a sim step left over, clamped to 0..1', () => {
  assert.equal(blendAlpha(0), 0);
  assert.ok(Math.abs(blendAlpha(STEP / 2) - .5) < 1e-9);
  assert.equal(blendAlpha(STEP * 3), 1);
  assert.equal(blendAlpha(-1), 0);
});

test('blending a position lerps between the last two states and never mutates its inputs', () => {
  const prev = v(0, 0, 0), curr = v(1, 2, 3), out = v();
  blendPosition(prev, curr, .25, out);
  assert.ok(out.distanceTo(v(.25, .5, .75)) < 1e-9);
  assert.ok(blendPosition(prev, curr, 1, out).equals(curr));
  assert.ok(blendPosition(prev, curr, 0, out).equals(prev));
  assert.ok(prev.equals(v(0, 0, 0)) && curr.equals(v(1, 2, 3)));
});

test('a teleport (respawn, portal, realm change) is snapped to, never blended across', () => {
  const prev = v(0, 0, 0), curr = v(SNAP_DISTANCE + 1, 0, 0);
  assert.ok(blendPosition(prev, curr, .3).equals(curr), 'a jump bigger than the snap distance must not slide the camera across the map');
  assert.ok(blendPosition(null, curr, .3).equals(curr), 'no previous pose yet');
  // the fastest legitimate motion (a 60 m/s grapple pull) is ~1 m per step and must still blend
  assert.ok(blendPosition(v(), v(1, 0, 0), .5).distanceTo(v(.5, 0, 0)) < 1e-9);
});

const run = (gov, ms, seconds, atLevel) => {
  let refreshes = 0, frames = Math.round(seconds * 1000 / ms);
  for (let i = 0; i < frames; i++) if (gov.tick((atLevel ? atLevel(gov) : ms) / 1000)) refreshes++;
  return { refreshes, frames };
};

test('shadows refresh every frame while the machine keeps up, at 60 Hz and at 120 Hz', () => {
  for (const ms of [16.7, 8.3]) {
    const gov = new ShadowGovernor(), { refreshes, frames } = run(gov, ms, 20);
    assert.equal(gov.level, 0, `${ms} ms frames are the display's best: no reason to back off`);
    assert.equal(refreshes, frames);
  }
});

test('sustained slow frames back the shadow refresh off, at worst to the old fixed cadence', () => {
  const gov = new ShadowGovernor([0, 1 / 30, 1 / 20]);
  run(gov, 16.7, 3);
  run(gov, 40, 10);
  assert.equal(gov.level, 2, 'a machine that cannot hold 60 fps falls back to the cheapest cadence');
  const slow = run(gov, 40, 5);
  assert.ok(slow.refreshes < slow.frames, 'and no longer refreshes on every frame');
});

test('a pause or hidden tab (one huge frame) is not mistaken for load', () => {
  const gov = new ShadowGovernor();
  run(gov, 16.7, 3);
  gov.tick(2.0); gov.tick(5.0);
  run(gov, 16.7, 10);
  assert.equal(gov.level, 0);
});

test('the governor recovers the per-frame cadence once the slowdown passes', () => {
  const gov = new ShadowGovernor();
  run(gov, 16.7, 3); run(gov, 40, 8);
  assert.equal(gov.level, 2);
  run(gov, 16.7, 40);
  assert.equal(gov.level, 0);
});

test('when per-frame shadows are genuinely unaffordable the governor stops retrying them so often', () => {
  const gov = new ShadowGovernor();
  let seconds = 0, atZero = 0;
  for (let i = 0; i < 120 * 60; i++) {
    const ms = gov.level === 0 ? 28 : 16.7; // refreshing every frame costs more than the machine has
    if (gov.level === 0) atZero += ms / 1000;
    gov.tick(ms / 1000); seconds += ms / 1000;
    if (seconds >= 120) break;
  }
  assert.ok(atZero < 15, `spent ${atZero.toFixed(1)}s of 120s on the failing cadence: attempts must back off exponentially`);
});

test('quality changes can shorten the cadence list without leaving the level out of range', () => {
  const gov = new ShadowGovernor([0, 1 / 30, 1 / 20]); gov.level = 2;
  gov.setIntervals([0, 1 / 45]);
  assert.equal(gov.level, 1);
});

test('the render blend factor is published by advance() and does not change the simulation', () => {
  const game = simulation();
  game.advance(1 / 60 + 1 / 120);
  assert.ok(game.alpha >= 0 && game.alpha <= 1);
  assert.ok(Math.abs(game.alpha - .5) < 1e-6, 'half a step is left in the accumulator');
  assert.ok(game.prevPos, 'the previous pose is recorded for the blend');
});
