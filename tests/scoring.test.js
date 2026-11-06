import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChapterRun, comboMultiplier, finishRun, rankFor, formatTime, KILL_POINTS, RANK_TARGETS } from '../src/scoring.js';
import { loadProfile, saveProfile, recordChapter, PAINTS } from '../src/profile.js';

const memory = (initial = {}) => { const data = { ...initial }; return { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data }; };

test('combo multiplier grows by half a step per chained kill and caps at 4x', () => {
  assert.deepEqual([1, 2, 3, 4, 7, 8, 20].map(comboMultiplier), [1, 1.5, 2, 2.5, 4, 4, 4]);
  assert.equal(comboMultiplier(0), 1);
});

test('kills award type points scaled by combo, with headshot and airborne bonuses', () => {
  const run = new ChapterRun();
  assert.deepEqual(run.kill('striker', { combo: 1 }), { points: KILL_POINTS.striker, mult: 1, tags: [] });
  const second = run.kill('gunner', { combo: 2, headshot: true, airborne: true });
  assert.equal(second.points, Math.round(KILL_POINTS.gunner * 1.5) + 100);
  assert.deepEqual(second.tags, ['HEADSHOT', 'AIRBORNE']);
  assert.equal(run.kills, 2); assert.equal(run.headshots, 1); assert.equal(run.airborneKills, 1); assert.equal(run.peakCombo, 2);
  assert.equal(run.score, 100 + second.points);
  assert.equal(run.kill('unknown-type').points, 100, 'unknown enemy types fall back to a base value');
});

test('accuracy counts each trigger pull once, however many pellets hit', () => {
  const run = new ChapterRun();
  const flak = run.registerShot(), burst = run.registerShot(), miss = run.registerShot();
  for (let i = 0; i < 7; i++) run.registerHit(flak);
  run.registerHit(burst); run.registerHit(0); run.registerHit(undefined);
  assert.equal(run.shots, 3); assert.equal(run.hits.size, 2); assert.ok(miss > burst);
  assert.ok(Math.abs(run.accuracy - 2 / 3) < 1e-9);
  assert.equal(new ChapterRun().accuracy, 0);
});

test('finishing a run adds time, accuracy and survival bonuses', () => {
  const run = new ChapterRun(); run.score = 900; run.time = 120; run.damageTaken = 100; run.deaths = 0;
  for (let i = 0; i < 40; i++) { const id = run.registerShot(); if (i < 30) run.registerHit(id); }
  const result = finishRun(run, 0);
  assert.deepEqual(result.breakdown, { eliminations: 900, timeBonus: (180 - 120) * 5, accuracyBonus: Math.round(0.75 * 500), survival: 400 });
  assert.equal(result.score, 900 + 300 + 375 + 400);
  assert.equal(result.stats.accuracy, 75);
  const slow = new ChapterRun(); slow.score = 100; slow.time = 9999; slow.damageTaken = 9999; slow.deaths = 3;
  const floor = finishRun(slow, 1).breakdown;
  assert.equal(floor.timeBonus, 0); assert.equal(floor.survival, 0); assert.equal(floor.accuracyBonus, 0, 'too few shots to judge accuracy');
});

test('deaths cost survival points and ranks rise monotonically with score', () => {
  const clean = new ChapterRun(), sloppy = new ChapterRun(); sloppy.deaths = 1; sloppy.damageTaken = 50;
  assert.ok(finishRun(clean, 0).breakdown.survival > finishRun(sloppy, 0).breakdown.survival);
  const order = 'CBAS';
  for (let chapter = 0; chapter < RANK_TARGETS.length; chapter++) {
    let previous = 0;
    for (let score = 0; score <= RANK_TARGETS[chapter] * 1.2; score += 50) {
      const index = order.indexOf(rankFor(chapter, score));
      assert.ok(index >= previous, `rank never drops as score rises (chapter ${chapter}, score ${score})`);
      previous = index;
    }
    assert.equal(rankFor(chapter, RANK_TARGETS[chapter]), 'S'); assert.equal(rankFor(chapter, 0), 'C');
  }
});

test('time formats as mm:ss and clamps negatives', () => {
  assert.equal(formatTime(0), '00:00'); assert.equal(formatTime(61.9), '01:01'); assert.equal(formatTime(-5), '00:00');
});

test('profile survives missing, corrupt or hostile storage', () => {
  assert.equal(loadProfile(memory()).unlocked, 0);
  assert.equal(loadProfile(memory({ 'orbital-breach.profile.v1': '{not json' })).paint, 'cobalt');
  const hostile = loadProfile(memory({ 'orbital-breach.profile.v1': JSON.stringify({ paint: '<script>', unlocked: 99, bests: 'x', gauntlet: null }) }));
  assert.equal(hostile.paint, 'cobalt'); assert.equal(hostile.unlocked, 2); assert.deepEqual(hostile.bests, {});
  assert.equal(loadProfile(null).paint, 'cobalt', 'no storage at all');
  assert.equal(saveProfile({}, { setItem() { throw new Error('quota'); } }), false, 'a full or blocked store never throws');
});

test('recording a chapter keeps the best score and unlocks the next chapter', () => {
  const storage = memory(), profile = loadProfile(storage);
  const first = recordChapter(profile, 0, { score: 1000, rank: 'A', time: 200.4 });
  assert.equal(first.improved, true); assert.equal(profile.unlocked, 1); assert.deepEqual(profile.bests['0'], { score: 1000, rank: 'A', time: 200 });
  const worse = recordChapter(profile, 0, { score: 400, rank: 'C', time: 300 });
  assert.equal(worse.improved, false); assert.equal(profile.bests['0'].score, 1000);
  recordChapter(profile, 2, { score: 5000, rank: 'A', time: 1 }); assert.equal(profile.unlocked, 2, 'unlock never exceeds the last chapter');
  saveProfile(profile, storage);
  assert.equal(loadProfile(storage).bests['0'].score, 1000);
  assert.ok(PAINTS.every(p => /^#[0-9a-f]{6}$/i.test(p.paint)));
});
