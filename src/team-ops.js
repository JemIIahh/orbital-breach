import { SOLO_SECONDS } from './match-limits.js';
// Team operations: squad-versus-squad battles where the pilot fights beside AI allies against an AI team.
// Pure data and rules (no DOM, no Three.js) so every rule here is unit-testable; src/team-battle.js plays them out.

export const TEAMS = {
  blue: { id: 'blue', name: 'COBALT', color: '#5fb0ff', bolt: '#7fd6ff', blurb: 'Cold-sprung and precise. Cobalt pilots hold lines and trade range for control.', callsigns: ['RAZOR', 'TALON', 'VESPER', 'NOMAD', 'GRIT'] },
  red: { id: 'red', name: 'OXBLOOD', color: '#ff6f52', bolt: '#ff9a62', blurb: 'Hot-headed and relentless. Oxblood pilots push forward and never give ground.', callsigns: ['CINDER', 'WRAITH', 'HOLLOW', 'BRICK', 'MAUL'] },
};
export const otherTeam = id => (id === 'red' ? 'blue' : 'red');
export const teamById = id => TEAMS[id] || TEAMS.blue;

// Opposing squads' skill. `accuracy` shrinks their aim error, `cadence` multiplies their fire interval (higher is slower).
export const SKILLS = {
  rookie: { id: 'rookie', label: 'ROOKIE', blurb: 'Slow to react, loose with their aim.', accuracy: .35, cadence: 1.4, health: .85, damage: .8, reaction: 1.3, reward: .8 },
  veteran: { id: 'veteran', label: 'VETERAN', blurb: 'Steady shots and sensible positions.', accuracy: .62, cadence: 1, health: 1, damage: 1, reaction: .9, reward: 1 },
  elite: { id: 'elite', label: 'ELITE', blurb: 'Quick, accurate and hard to pin down.', accuracy: .85, cadence: .8, health: 1.15, damage: 1.12, reaction: .55, reward: 1.6 },
};
export const skillById = id => SKILLS[id] || SKILLS.veteran;
// Allies fight at a fixed, fair level whatever the opposition is.
export const ALLY_SKILL = { ...SKILLS.veteran, id: 'ally' };

// Arenas reuse the campaign worlds. Spawn zones sit at opposite ends; `bounds` keep bots inside the playable area.
export const ARENAS = {
  city: { name: 'MERIDIAN AVENUE', realm: 'city', spawns: { blue: { x: 0, z: -70 }, red: { x: 0, z: 74 } }, bounds: { x: [-22, 22], z: [-92, 90] }, beacon: { x: 0, z: 4 }, beaconRadius: 10, yaw: { blue: 0, red: Math.PI } },
  eden: { name: 'THE SANCTUARY', realm: 'eden', spawns: { blue: { x: 0, z: -36 }, red: { x: 0, z: 62 } }, bounds: { x: [-30, 30], z: [-46, 74] }, beacon: { x: 0, z: 12 }, beaconRadius: 11, yaw: { blue: 0, red: Math.PI } },
};

export const OPERATIONS = [
  { id: 'meridian-crossfire', name: 'MERIDIAN CROSSFIRE', arena: 'city', mode: 'tdm', size: 4, limit: 30, time: SOLO_SECONDS, skill: 'veteran', base: 240, tag: '4 v 4 · TEAM DEATHMATCH',
    blurb: 'Two squads collide on the central avenue. First team to 30 eliminations takes the street.' },
  { id: 'beacon-run', name: 'BEACON RUN', arena: 'city', mode: 'control', size: 4, limit: 90, time: SOLO_SECONDS, skill: 'veteran', base: 280, tag: '4 v 4 · HOLD THE BEACON',
    blurb: 'A dormant relay beacon sits mid-avenue. Stand in the ring with more pilots than the enemy to capture it, then hold it.' },
  { id: 'grove-skirmish', name: 'GROVE SKIRMISH', arena: 'eden', mode: 'tdm', size: 3, limit: 20, time: SOLO_SECONDS, skill: 'rookie', base: 200, tag: '3 v 3 · TEAM DEATHMATCH',
    blurb: 'A small, forgiving fight in the Eden clearing. A good place to learn how your squad fights.' },
  { id: 'heart-tree-hold', name: 'HOLD THE HEART TREE', arena: 'eden', mode: 'control', size: 4, limit: 90, time: SOLO_SECONDS, skill: 'veteran', base: 300, tag: '4 v 4 · HOLD THE BEACON',
    blurb: 'Take the old relay at the centre of the sanctuary and keep it while ARCHON-built squads try to burn you off it.' },
  { id: 'avenue-war', name: 'AVENUE WAR', arena: 'city', mode: 'tdm', size: 5, limit: 45, time: SOLO_SECONDS, skill: 'elite', base: 420, tag: '5 v 5 · TEAM DEATHMATCH',
    blurb: 'The big one. Five on five against an elite squad. First to 45.' },
];
export const opById = id => OPERATIONS.find(op => op.id === id) || OPERATIONS[0];

// ---- Rosters -----------------------------------------------------------------------------------------------
const POOL = ['striker', 'gunner', 'sniper', 'bulwark', 'gunner'];
// Both squads field the same machine mix so a result reflects play, not a lopsided draw.
export function squadTypes(size) { return Array.from({ length: size }, (_, i) => POOL[i % POOL.length]); }
// The pilot takes the first slot on their own team, so allies number size - 1 and the opposition number size.
export function rosterFor(op, playerTeam) {
  const foeTeam = otherTeam(playerTeam), mine = teamById(playerTeam).callsigns, theirs = teamById(foeTeam).callsigns;
  const types = squadTypes(op.size);
  return {
    allies: types.slice(1).map((type, i) => ({ type, callsign: mine[i % mine.length], team: playerTeam })),
    foes: types.map((type, i) => ({ type, callsign: theirs[i % theirs.length], team: foeTeam })),
  };
}

// ---- Scoreboard ---------------------------------------------------------------------------------------------
// Tracks per-pilot kills and deaths and the team totals. In "control" operations the beacon adds points as well.
export class Scoreboard {
  constructor(playerTeam, roster) {
    this.playerTeam = playerTeam; this.score = { blue: 0, red: 0 }; this.beaconPoints = { blue: 0, red: 0 };
    this.pilots = new Map(); this.add('YOU', playerTeam);
    for (const r of [...roster.allies, ...roster.foes]) this.add(r.callsign, r.team);
  }
  add(name, team) { this.pilots.set(name, { name, team, kills: 0, deaths: 0 }); }
  // `killer` may be null for environmental deaths. Friendly fire never happens, so a kill always scores for the killer's team.
  kill(killer, victim) {
    const v = this.pilots.get(victim), k = killer && this.pilots.get(killer);
    if (v) v.deaths++;
    if (k && v && k.team !== v.team) { k.kills++; this.score[k.team]++; return true; }
    return false;
  }
  beacon(team, points) { this.beaconPoints[team] += points; this.score[team] += points; }
  teamScore(team) { return Math.floor(this.score[team]); }
  leader(limit) { const b = this.teamScore('blue'), r = this.teamScore('red'); return b >= limit && b > r ? 'blue' : r >= limit && r > b ? 'red' : null; }
  table() { return [...this.pilots.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths); }
  mvp() { return this.table()[0] || null; }
}

// Decide a finished or timed-out match: the first team over the limit, else the higher score at time, else a draw.
export function winnerOf(scoreboard, limit, timeUp) {
  const lead = scoreboard.leader(limit); if (lead) return lead;
  if (!timeUp) return null;
  const b = scoreboard.teamScore('blue'), r = scoreboard.teamScore('red');
  return b === r ? 'draw' : b > r ? 'blue' : 'red';
}

// ---- Beacon -------------------------------------------------------------------------------------------------
// progress runs from -1 (OXBLOOD owns it) to +1 (COBALT owns it). A pilot-count lead captures it; a tie freezes it.
export const BEACON_CAPTURE_PER_SECOND = .16, BEACON_POINTS_PER_SECOND = .8;
export function beaconStep(state, blue, red, dt) {
  const lead = blue - red; let { progress } = state;
  if (lead !== 0) { const rate = BEACON_CAPTURE_PER_SECOND * (1 + (Math.min(Math.abs(lead), 3) - 1) * .5); progress = Math.max(-1, Math.min(1, progress + Math.sign(lead) * rate * dt)); }
  else if (!blue && !red) progress += -Math.sign(progress) * Math.min(Math.abs(progress), .03 * dt); // an unattended beacon slowly goes dark
  const owner = progress >= 1 ? 'blue' : progress <= -1 ? 'red' : null;
  return { progress, owner, points: owner ? BEACON_POINTS_PER_SECOND * dt : 0 };
}

// ---- Results and rewards ------------------------------------------------------------------------------------
export function pilotScore({ kills = 0, deaths = 0, headshots = 0, won = false, beaconSeconds = 0 }) {
  return Math.max(0, kills * 100 + headshots * 50 + Math.round(beaconSeconds) * 5 + (won ? 500 : 0) - deaths * 25);
}
// S needs a win and a leading share of the team's kills; a loss never ranks above C.
export function pilotRank({ kills = 0, deaths = 0, won = false, limit = 30, mode = 'tdm' }) {
  if (!won) return 'C';
  const share = kills / Math.max(1, mode === 'control' ? limit / 4 : limit);
  return share >= .35 && kills >= deaths * 1.5 ? 'S' : share >= .2 ? 'A' : 'B';
}
// Credits are what the shop sells for. Winning pays most, the opposition's skill scales it, and every kill counts.
export function payoutFor(op, { won = false, draw = false, kills = 0, deaths = 0, mvp = false } = {}) {
  const skill = skillById(op.skill), base = op.base * (won ? 1 : draw ? .6 : .4) * skill.reward;
  return Math.max(20, Math.round(base + kills * 12 - deaths * 2 + (mvp ? 60 : 0)));
}

// ---- Saved records (kept apart from the campaign profile) --------------------------------------------------
export const OPS_KEY = 'orbital-breach-ops-v1';
export function loadOpsRecord(storage = globalThis.localStorage) {
  try { const data = JSON.parse(storage?.getItem(OPS_KEY) || 'null'); if (data && typeof data === 'object') return { team: data.team === 'red' ? 'red' : 'blue', skill: SKILLS[data.skill] ? data.skill : '', op: OPERATIONS.some(o => o.id === data.op) ? data.op : '', ops: sanitiseOps(data.ops) }; } catch { /* fall through */ }
  return { team: 'blue', skill: '', op: '', ops: {} };
}
function sanitiseOps(ops) {
  const clean = {};
  for (const op of OPERATIONS) { const r = ops?.[op.id]; if (r && typeof r === 'object') clean[op.id] = { played: r.played | 0, wins: r.wins | 0, bestKills: r.bestKills | 0, bestScore: r.bestScore | 0 }; }
  return clean;
}
export function saveOpsRecord(record, storage = globalThis.localStorage) { try { storage?.setItem(OPS_KEY, JSON.stringify(record)); } catch { /* storage may be unavailable */ } }
// Folds a finished match into the record and reports whether it set a new personal best.
export function recordOperation(record, opId, { won, kills, score }) {
  const r = record.ops[opId] ||= { played: 0, wins: 0, bestKills: 0, bestScore: 0 };
  const improved = score > r.bestScore; r.played++; if (won) r.wins++; r.bestKills = Math.max(r.bestKills, kills); r.bestScore = Math.max(r.bestScore, score);
  return { improved, best: { ...r } };
}
