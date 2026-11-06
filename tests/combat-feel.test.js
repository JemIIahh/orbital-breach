import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  VOLLEYS, MELEE_REACH, MAX_LEAD_SECONDS, volleyFor, accuracyFor, leadFor, aimCone, interceptTime, leadPoint, jitterDirection,
  bearingOf, passDistance, damageFeel, dangerLevel, heartInterval, nextStrafe, shotVolume, nominalDps,
} from '../src/combat-feel.js';
import { ENEMY_TYPES } from '../src/encounters.js';
import { simulation } from './support.js';

const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const seeded = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

test('a round aimed at the lead point meets a pilot who keeps strafing in a straight line', () => {
  const from = v(0, 0, 0), target = v(30, 0, 0), velocity = v(0, 0, 8), speed = 46;
  const aim = leadPoint(from, target, velocity, speed, 1), t = aim.distanceTo(from) / speed;
  const where = target.clone().addScaledVector(velocity, t);
  assert.ok(where.distanceTo(aim) < 1e-6, 'the pilot arrives at the aim point exactly when the round does');
  assert.ok(aim.z > 4, 'the aim point is well ahead of the pilot, not the old 0.14 s guess');
  const old = target.clone().addScaledVector(velocity, .14);
  assert.ok(aim.distanceTo(where) < old.distanceTo(where) * .01, 'far more accurate than the fixed 0.14 s lead');
});

test('lead falls back sanely: stationary targets, targets faster than the round, and the lead cap', () => {
  assert.ok(Math.abs(interceptTime(40, 0, 0, 0, 0, 0, 40) - 1) < 1e-9, 'a still target takes distance / speed');
  const chase = interceptTime(10, 0, 0, 60, 0, 0, 30); assert.ok(chase >= 0 && chase <= MAX_LEAD_SECONDS, 'an unreachable target never gives a negative or huge time');
  assert.ok(interceptTime(300, 0, 0, 0, 0, 0, 20) <= MAX_LEAD_SECONDS, 'the lead is capped');
  const half = leadPoint(v(), v(30, 0, 0), v(0, 0, 8), 46, .5), full = leadPoint(v(), v(30, 0, 0), v(0, 0, 8), 46, 1);
  assert.ok(half.z < full.z && half.z > 0, 'partial skill leads by less');
});

test('skill tightens the cone, speed loosens it, and snipers are far more precise than gunners', () => {
  assert.ok(aimCone('burst', .95) < aimCone('burst', .6));
  assert.ok(aimCone('burst', .8, 12) > aimCone('burst', .8, 0), 'a fast mover is harder to hit');
  assert.ok(aimCone('snipe', .8) < aimCone('burst', .8) / 3);
  assert.equal(aimCone('rush', .8, 10), 0, 'melee never fans out');
  assert.ok(accuracyFor(6) > accuracyFor(1) && accuracyFor(99) <= .94 && accuracyFor(-4) >= .6);
  assert.ok(leadFor(.94) > leadFor(.6) && leadFor(1) <= 1 && leadFor(0) >= .6);
});

test('jittered shots stay inside their cone, stay unit length and are reproducible', () => {
  const dir = v(.3, .1, 1).normalize(), cone = .03, rng = seeded(7);
  let widest = 0; for (let i = 0; i < 400; i++) { const out = jitterDirection(dir, cone, rng); assert.ok(Math.abs(out.length() - 1) < 1e-9); widest = Math.max(widest, out.angleTo(dir)); }
  assert.ok(widest <= cone * 1.02 && widest > cone * .8, 'uses most of the cone without leaving it');
  assert.ok(jitterDirection(dir, cone, seeded(7), v()).equals(jitterDirection(dir, cone, seeded(7), v())), 'same seed, same shot');
  assert.ok(jitterDirection(v(0, 1, 0), cone, seeded(3)).angleTo(v(0, 1, 0)) <= cone * 1.02, 'straight-up aim has no degenerate axis');
  assert.ok(jitterDirection(dir, 0).equals(dir.clone().normalize()), 'zero cone is exact');
});

test('volleys: gunners stitch four timed rounds, the Archon throws a wall, snipers and brutes fire single rounds', () => {
  assert.equal(volleyFor('burst').shots, 4); assert.ok(volleyFor('burst').gap > 0);
  assert.equal(volleyFor('boss').bolts, 5); assert.ok(volleyFor('boss').shots >= 2);
  for (const k of ['snipe', 'blast', 'rush']) assert.equal(VOLLEYS[k].shots, 1);
  assert.equal(volleyFor('nonsense'), VOLLEYS.burst);
});

test('every machine is a real threat but none can delete the pilot in a single trigger pull', () => {
  for (const [id, spec] of Object.entries(ENEMY_TYPES)) {
    assert.ok(spec.cooldown <= 3.2, `${id} fires often enough to matter (${spec.cooldown}s)`);
    const shot = spec.damage * volleyFor(spec.attack).bolts; assert.ok(shot <= 75, `${id} one shot is survivable: ${shot}`);
    assert.ok(nominalDps(spec) >= 8, `${id} has teeth: ${nominalDps(spec).toFixed(1)} dps`);
    assert.ok(nominalDps(spec) <= (spec.attack === 'boss' ? 70 : 60), `${id} is not a death ray: ${nominalDps(spec).toFixed(1)} dps`); // the boss's wall of fire can never all land
  }
  assert.ok(ENEMY_TYPES.sniper.damage >= 30, 'a Lancer hit hurts');
  assert.ok(MELEE_REACH < 6 && MELEE_REACH >= 3, 'melee can be dodged but not ignored');
  // Steering holds a Striker at its range +-0.8 m. It must stay outside body contact (3 m) yet inside lunge reach.
  assert.ok(ENEMY_TYPES.striker.range - .8 > 3.2, 'strikers never hug the pilot'); assert.ok(ENEMY_TYPES.striker.range <= MELEE_REACH, 'but they can still connect');
});

test('bearings point at the shooter around the pilot: ahead, right, behind, left', () => {
  const fwd = v(0, 0, 1), right = v(-1, 0, 0), o = v();
  assert.ok(Math.abs(bearingOf(fwd, right, o, v(0, 0, 20))) < 1e-9);
  assert.ok(Math.abs(bearingOf(fwd, right, o, v(-20, 0, 0)) - Math.PI / 2) < 1e-9, 'right is +90 degrees');
  assert.ok(Math.abs(Math.abs(bearingOf(fwd, right, o, v(0, 0, -20))) - Math.PI) < 1e-9, 'behind is 180');
  assert.ok(Math.abs(bearingOf(fwd, right, o, v(20, 0, 0)) + Math.PI / 2) < 1e-9, 'left is -90 degrees');
});

test('near misses: segments passing close are detected, distant and past-the-end ones are not', () => {
  assert.ok(Math.abs(passDistance(v(0, 0, 0), v(0, 0, 10), v(1.5, 0, 5)) - 1.5) < 1e-9);
  assert.ok(Math.abs(passDistance(v(0, 0, 0), v(0, 0, 10), v(0, 3, 14)) - 5) < 1e-9, 'beyond the end measures to the end point');
  assert.equal(passDistance(v(1, 1, 1), v(1, 1, 1), v(1, 1, 3)), 2, 'a zero-length segment is a point');
});

test('hit feedback scales with damage and tells shield hits from core hits and shield breaks', () => {
  const shieldHit = damageFeel(14, 100, 100, 86, 100), coreHit = damageFeel(24, 6, 100, 0, 82), small = damageFeel(4, 100, 100, 96, 100), big = damageFeel(34, 100, 100, 66, 100);
  assert.equal(shieldHit.shieldOnly, true); assert.equal(shieldHit.healthHit, false); assert.equal(shieldHit.shieldBroke, false);
  assert.equal(coreHit.shieldOnly, false); assert.equal(coreHit.shieldBroke, true);
  assert.ok(big.shake > small.shake && big.kick > small.kick && big.amount > small.amount);
  assert.ok(coreHit.shake > shieldHit.shake * 1.1 || coreHit.amount >= shieldHit.amount, 'hits to the core hit harder than the shield');
  assert.ok(small.amount >= .2 && big.amount <= 1 && big.shake <= 2 && big.kick <= .1, 'bounded so a hit can never throw the view around');
  assert.equal(damageFeel(10, 0, 50, 0, 40).shieldBroke, false, 'no break when there was no shield');
});

test('danger rises as the core drops, stays calm when healthy and quickens the heartbeat', () => {
  assert.equal(dangerLevel(100, 100), 0); assert.equal(dangerLevel(100, 0), 0, 'a full core with no shield is not yet critical');
  assert.equal(dangerLevel(70, 0), .15, 'shield down is a faint warning once the core is touched');
  const levels = [60, 45, 30, 15, 5].map(h => dangerLevel(h, 0)); for (let i = 1; i < levels.length; i++) assert.ok(levels[i] >= levels[i - 1]);
  assert.equal(dangerLevel(1, 0), 1); assert.ok(heartInterval(1) < heartInterval(0) && heartInterval(1) > .3);
});

test('strafing re-rolls unpredictably but always within a human reaction window; gunfire fades with distance', () => {
  const rng = seeded(11), dirs = new Set(); for (let i = 0; i < 60; i++) { const s = nextStrafe(10, rng); dirs.add(s.dir); assert.ok(s.until >= 10.7 && s.until <= 12.01); }
  assert.deepEqual([...dirs].sort(), [-1, 1]);
  assert.ok(shotVolume(5) > shotVolume(40) && shotVolume(40) > shotVolume(120) && shotVolume(500) >= .1 && shotVolume(0) <= 1);
});

test('the pilot is hurt in the right way: ring bearing, shield-break, heartbeat and view kick', () => {
  const game = simulation(), calls = { ui: [], audio: [] };
  game.ui.damage = (feel, bearing) => calls.ui.push({ feel, bearing }); game.audio.play = (kind, opts) => calls.audio.push({ kind, opts });
  game.spawnGrace = 0; game.player.shield = 10; game.player.health = 100;
  game.hurtPlayer(25, game.player.position.clone().addScaledVector(game.forward, -30));
  assert.equal(calls.ui.length, 1); assert.ok(Math.abs(Math.abs(calls.ui[0].bearing) - Math.PI) < 1e-6, 'fire from behind points the ring behind');
  assert.equal(calls.ui[0].feel.shieldBroke, true); assert.equal(calls.audio[0].kind, 'shieldBreak');
  assert.ok(game.shake >= .34 && game.kick.pitch > 0, 'the camera is shaken and kicked');
  game.player.shield = 100; game.shake = 0; game.hurtPlayer(10, game.player.position.clone().addScaledVector(game.right, 20));
  assert.equal(calls.audio.at(-1).kind, 'shieldHit'); assert.ok(calls.ui.at(-1).bearing > 1.4 && calls.ui.at(-1).bearing < 1.7, 'fire from the right points right');
  game.player.shield = 0; game.player.health = 20; game.hurtPlayer(5); assert.equal(calls.audio.at(-1).kind, 'hurt'); assert.equal(calls.ui.at(-1).bearing, null, 'unknown sources still hurt');
  calls.audio.length = 0; game.beatClock = 0; game.updateHeartbeat(.016); assert.equal(calls.audio[0]?.kind, 'heartbeat', 'a critical core has a heartbeat');
  calls.audio.length = 0; game.player.health = 90; game.beatClock = 0; game.updateHeartbeat(.016); assert.equal(calls.audio.length, 0, 'a healthy pilot does not');
});

test('a round whipping past the pilot rattles them without hurting', () => {
  const game = simulation(), seen = []; game.ui.nearMiss = b => seen.push(b); game.audio.play = (kind, opts) => seen.push([kind, opts]);
  game.spawnGrace = 0; const health = game.player.health + game.player.shield;
  game.nearMiss({ position: game.player.position.clone().addScaledVector(game.right, 1.5), origin: game.player.position.clone().addScaledVector(game.forward, 40) });
  assert.equal(game.player.health + game.player.shield, health); assert.ok(game.shake >= .2);
  assert.ok(Math.abs(seen[0]) < .01, 'the tick points at the shooter, straight ahead'); assert.equal(seen[1][0], 'whiz'); assert.ok(seen[1][1].pan > .9, 'the crack comes from the right ear');
});

test('a machine destroyed mid-burst stops firing and does not resume the burst when it respawns', () => {
  const game = simulation(); game.spawnPlayer(true); game.initWorld(); game.spawnGrace = 0;
  const bot = game.bots[0]; bot.volley = { left: 3, wait: 0 };
  game.damageBot(bot, 9999, 'core', bot.group.position);
  assert.equal(bot.dead, true); assert.equal(bot.volley, null, 'death cancels the volley');
  bot.volley = { left: 3, wait: 0 }; game.spawnBot(bot); assert.equal(bot.volley, null, 'a respawn starts clean');
});
