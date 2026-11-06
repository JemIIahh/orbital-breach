// Pure scoring rules for a chapter run. No DOM, no Three.js, so every rule is unit-testable.
import { CHAPTERS } from './chapters.js';

export const KILL_POINTS = { striker: 100, gunner: 150, sniper: 200, bulwark: 300, archon: 2500 };
// Score needed for an S rank in each chapter. A: 70%, B: 45%, anything lower is C.
export const RANK_TARGETS = [1500, 4000, 6000];
export const COMBO_WINDOW = 4;

// 1x on the first kill, +0.5x for each kill chained within the window, capped at 4x.
export const comboMultiplier = combo => Math.min(4, 1 + Math.max(0, combo - 1) * 0.5);

export function rankFor(chapter, score) {
  const target = RANK_TARGETS[chapter] ?? RANK_TARGETS[0];
  return score >= target ? 'S' : score >= target * 0.7 ? 'A' : score >= target * 0.45 ? 'B' : 'C';
}

export class ChapterRun {
  constructor() {
    this.score = 0; this.kills = 0; this.headshots = 0; this.airborneKills = 0; this.peakCombo = 0;
    this.shots = 0; this.hits = new Set(); this.shotSeq = 0;
    this.damageTaken = 0; this.deaths = 0; this.time = 0;
  }

  // Each trigger pull counts as one shot; every pellet of that pull shares the id, so a hit counts once.
  registerShot() { this.shots++; return ++this.shotSeq; }
  registerHit(id) { if (id) this.hits.add(id); }
  get accuracy() { return this.shots ? Math.min(1, this.hits.size / this.shots) : 0; }

  kill(type, { combo = 1, headshot = false, airborne = false, reactor = false } = {}) {
    const mult = comboMultiplier(combo);
    let points = Math.round((KILL_POINTS[type] ?? 100) * mult);
    const tags = [];
    if (headshot) { points += 50; this.headshots++; tags.push('HEADSHOT'); }
    if (airborne) { points += 50; this.airborneKills++; tags.push('AIRBORNE'); }
    if(reactor){points+=100;tags.push('REACTOR')}
    this.score += points; this.kills++; this.peakCombo = Math.max(this.peakCombo, combo);
    return { points, mult, tags };
  }
}

// Turns a finished run into a result: bonuses on top of kill score, a rank, and stats for the results screen.
export function finishRun(run, chapter, par = CHAPTERS[chapter]?.par ?? 300) {
  const eliminations = run.score;
  const timeBonus = Math.max(0, Math.round((par - run.time) * 5));
  const accuracyBonus = run.shots >= 20 ? Math.round(run.accuracy * 500) : 0;
  const survival = Math.max(0, Math.round(600 - run.damageTaken * 2 - run.deaths * 300));
  const score = eliminations + timeBonus + accuracyBonus + survival;
  return {
    chapter, score, rank: rankFor(chapter, score), time: run.time, par,
    breakdown: { eliminations, timeBonus, accuracyBonus, survival },
    stats: { kills: run.kills, accuracy: Math.round(run.accuracy * 100), peakCombo: run.peakCombo, damageTaken: Math.round(run.damageTaken), deaths: run.deaths, headshots: run.headshots },
  };
}

// Gauntlet: no par time. Waves cleared drive the rank, and every cleared wave banks a flat bonus.
export const GAUNTLET_WAVE_BONUS = 250;
export const gauntletRank = waves => (waves >= 12 ? 'S' : waves >= 8 ? 'A' : waves >= 4 ? 'B' : 'C');
export function finishGauntlet(run, waves) {
  const eliminations = run.score;
  const waveBonus = waves * GAUNTLET_WAVE_BONUS;
  const accuracyBonus = run.shots >= 20 ? Math.round(run.accuracy * 500) : 0;
  const score = eliminations + waveBonus + accuracyBonus;
  return {
    mode: 'gauntlet', chapter: 3, score, rank: gauntletRank(waves), time: run.time, waves,
    breakdown: { eliminations, waveBonus, accuracyBonus },
    stats: { kills: run.kills, accuracy: Math.round(run.accuracy * 100), peakCombo: run.peakCombo, damageTaken: Math.round(run.damageTaken), deaths: run.deaths, headshots: run.headshots },
  };
}

export const formatTime = seconds => {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
