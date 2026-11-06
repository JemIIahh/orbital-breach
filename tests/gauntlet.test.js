import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gauntletWave, difficultyFor, encounterFor, ENEMY_TYPES } from '../src/encounters.js';
import { Mission } from '../src/mission.js';
import { ChapterRun, finishGauntlet, gauntletRank, GAUNTLET_WAVE_BONUS } from '../src/scoring.js';
import { loadProfile, recordGauntlet } from '../src/profile.js';

test('gauntlet waves are deterministic, capped at the six-mech pool and only name real enemy types', () => {
  for (let wave = 0; wave < 60; wave++) {
    const squad = gauntletWave(wave);
    assert.deepEqual(squad, gauntletWave(wave), 'the same wave always yields the same squad');
    assert.ok(squad.length >= 2 && squad.length <= 6, `wave ${wave + 1} fits the bot pool`);
    assert.ok(squad.every(type => ENEMY_TYPES[type]));
    assert.equal(squad.includes('archon'), wave % 5 === 4, 'ARCHON leads every fifth wave and no other');
  }
  assert.deepEqual(encounterFor('gauntlet', 3), gauntletWave(3));
});

test('the gauntlet opens gently, then widens its roster and threat', () => {
  assert.ok(gauntletWave(0).every(type => ['striker', 'gunner'].includes(type)), 'wave 1 is strikers and gunners only');
  assert.ok(gauntletWave(1).includes('sniper'));
  assert.ok([5, 6, 7].some(wave => gauntletWave(wave).includes('bulwark')), 'heavies join before wave 9');
  const tiers = Array.from({ length: 20 }, (_, wave) => difficultyFor('gauntlet', wave));
  tiers.reduce((previous, now) => { assert.ok(now.tier >= previous.tier && now.health >= previous.health && now.damage >= previous.damage); return now; });
  assert.ok(tiers[19].tier > difficultyFor('eden', 1).tier, 'late waves outscale the campaign finale');
  assert.equal(tiers[19].cadence, .65, 'fire cadence stops tightening at its floor');
});

test('gauntlet mission loop: clear a wave, refit during the intermission, then the next squad arrives', () => {
  const mission = new Mission();
  assert.equal(mission.startGauntlet(), true);
  assert.equal(mission.stage, 'gauntlet'); assert.equal(mission.world, 'city'); assert.equal(mission.lives, 3); assert.equal(mission.upgrades, 3);
  assert.equal(mission.combatActive, true); assert.match(mission.title, /GAUNTLET · WAVE 1/); assert.match(mission.objective, /Wave 1 · 3 hostiles/);
  const revision = mission.revision;
  mission.composition.forEach((_, index) => mission.defeatEnemy(index));
  assert.equal(mission.stage, 'gauntlet', 'the stage never leaves the gauntlet');
  assert.equal(mission.combatActive, false); assert.ok(mission.intermission > 0); assert.match(mission.objective, /Next wave in/);
  mission.tick(1); assert.equal(mission.wave, 0, 'still refitting');
  mission.tick(10);
  assert.equal(mission.wave, 1); assert.equal(mission.encounterKills.size, 0); assert.ok(mission.revision > revision, 'a new revision tells the game to spawn the squad');
  assert.equal(mission.combatActive, true); assert.deepEqual(mission.composition, gauntletWave(1));
  assert.equal(mission.defeatEnemy(0), true); assert.equal(mission.defeatEnemy(0), false, 'a kill only counts once');
});

test('a reset clears gauntlet lives so the campaign never inherits them', () => {
  const mission = new Mission(); mission.startGauntlet(); mission.reset();
  assert.equal(mission.lives, 0); assert.equal(mission.stage, 'briefing'); assert.equal(mission.world, 'station');
});

test('gauntlet scoring: kills, a flat bonus per cleared wave, and ranks by waves reached', () => {
  const run = new ChapterRun(); run.kill('striker', { combo: 1 }); run.kill('gunner', { combo: 2 });
  const result = finishGauntlet(run, 6);
  assert.equal(result.mode, 'gauntlet'); assert.equal(result.waves, 6);
  assert.equal(result.breakdown.waveBonus, 6 * GAUNTLET_WAVE_BONUS);
  assert.equal(result.score, result.breakdown.eliminations + result.breakdown.waveBonus + result.breakdown.accuracyBonus);
  assert.deepEqual([0, 3, 4, 7, 8, 11, 12, 30].map(gauntletRank), ['C', 'C', 'B', 'B', 'A', 'A', 'S', 'S']);
  assert.equal(finishGauntlet(new ChapterRun(), 0).score, 0, 'dying on wave one scores nothing');
});

test('the gauntlet record keeps the best run and reports the previous one', () => {
  const profile = loadProfile({ getItem: () => null });
  const first = recordGauntlet(profile, 5, 3000);
  assert.deepEqual([first.improved, first.previous], [true, null]); assert.deepEqual(profile.gauntlet, { wave: 5, score: 3000 });
  const worse = recordGauntlet(profile, 3, 1200);
  assert.equal(worse.improved, false); assert.deepEqual(worse.best, { wave: 5, score: 3000 }); assert.deepEqual(profile.gauntlet, { wave: 5, score: 3000 });
  const better = recordGauntlet(profile, 9, 7000);
  assert.equal(better.improved, true); assert.equal(better.previous.score, 3000); assert.deepEqual(profile.gauntlet, { wave: 9, score: 7000 });
});
