import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATIONS, TEAMS, SKILLS, ARENAS, ALLY_SKILL, opById, otherTeam, rosterFor, squadTypes, Scoreboard, winnerOf, beaconStep,
  BEACON_CAPTURE_PER_SECOND, pilotScore, pilotRank, payoutFor, loadOpsRecord, saveOpsRecord, recordOperation, OPS_KEY, skillById,
} from '../src/team-ops.js';
import { ENEMY_TYPES } from '../src/encounters.js';

const memory = () => { const data = new Map(); return { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data }; };

test('operations are well formed, reference real arenas and stay inside their own bounds', () => {
  assert.ok(OPERATIONS.length >= 4);
  assert.equal(new Set(OPERATIONS.map(op => op.id)).size, OPERATIONS.length, 'operation ids are unique');
  for (const op of OPERATIONS) {
    const arena = ARENAS[op.arena]; assert.ok(arena, `${op.id} has an arena`);
    assert.ok(['tdm', 'control'].includes(op.mode)); assert.ok(op.size >= 2 && op.size <= 6, 'squads fit the sprite budget');
    assert.ok(SKILLS[op.skill]); assert.ok(op.limit > 0 && op.time > 60 && op.base > 0);
    for (const team of ['blue', 'red']) {
      const s = arena.spawns[team], b = arena.bounds;
      assert.ok(s.x >= b.x[0] && s.x <= b.x[1] && s.z >= b.z[0] && s.z <= b.z[1], `${op.id} ${team} spawn is inside the arena`);
    }
    const c = arena.beacon; assert.ok(c.x >= arena.bounds.x[0] && c.x <= arena.bounds.x[1] && c.z >= arena.bounds.z[0] && c.z <= arena.bounds.z[1]);
    assert.ok(arena.spawns.blue.z < arena.spawns.red.z, 'blue starts south of red');
  }
  assert.equal(opById('nonsense').id, OPERATIONS[0].id, 'unknown ids fall back to the first operation');
});

test('squads field the same machine mix and use only real enemy types, with the pilot filling one slot of their own side', () => {
  for (const op of OPERATIONS) {
    for (const side of ['blue', 'red']) {
      const roster = rosterFor(op, side);
      assert.equal(roster.allies.length, op.size - 1, 'the pilot is the missing ally');
      assert.equal(roster.foes.length, op.size);
      assert.ok(roster.allies.every(r => r.team === side && ENEMY_TYPES[r.type]));
      assert.ok(roster.foes.every(r => r.team === otherTeam(side) && ENEMY_TYPES[r.type]));
      assert.deepEqual(roster.foes.map(r => r.type), squadTypes(op.size), 'the opposition is the full machine mix');
      const names = [...roster.allies, ...roster.foes].map(r => r.callsign);
      assert.equal(new Set(names).size, names.length, 'callsigns never repeat in a match');
      assert.ok(!names.includes('YOU'));
    }
  }
  assert.ok(squadTypes(6).every(type => type !== 'archon'), 'the boss never joins a team');
});

test('the scoreboard credits kills to the killer’s team, ignores friendly fire and picks the leader', () => {
  const roster = rosterFor(OPERATIONS[0], 'blue'), board = new Scoreboard('blue', roster);
  const ally = roster.allies[0].callsign, foe = roster.foes[0].callsign, foe2 = roster.foes[1].callsign;
  assert.equal(board.kill('YOU', foe), true); assert.equal(board.kill(ally, foe2), true);
  assert.equal(board.kill(foe, 'YOU'), true);
  assert.equal(board.kill(ally, roster.allies[1].callsign), false, 'friendly fire scores nothing');
  assert.equal(board.kill(null, ally), false, 'environmental deaths score nothing');
  assert.equal(board.teamScore('blue'), 2); assert.equal(board.teamScore('red'), 1);
  const you = board.pilots.get('YOU'); assert.deepEqual([you.kills, you.deaths], [1, 1]);
  assert.equal(board.leader(2), 'blue'); assert.equal(board.leader(3), null);
  assert.equal(board.table()[0].kills, 1);
});

test('a draw at the limit is not a win, and time-up compares scores honestly', () => {
  const board = new Scoreboard('blue', rosterFor(OPERATIONS[0], 'blue'));
  board.score.blue = 5; board.score.red = 5;
  assert.equal(board.leader(5), null, 'tied at the limit keeps playing');
  assert.equal(winnerOf(board, 5, false), null);
  assert.equal(winnerOf(board, 5, true), 'draw');
  board.score.red = 6; assert.equal(winnerOf(board, 5, false), 'red');
  board.score.blue = 9; assert.equal(winnerOf(board, 5, false), 'blue');
  board.score.blue = 3; board.score.red = 2; assert.equal(winnerOf(board, 50, true), 'blue', 'higher score wins when time runs out');
});

test('the beacon needs a pilot majority, scales with the lead, freezes on a tie and decays when unattended', () => {
  let state = { progress: 0, owner: null };
  const step = (blue, red, dt) => { const s = beaconStep(state, blue, red, dt); state = { progress: s.progress, owner: s.owner }; return s; };
  assert.equal(step(1, 0, 1).progress, BEACON_CAPTURE_PER_SECOND);
  const afterOne = state.progress;
  assert.equal(step(2, 2, 5).progress, afterOne, 'contested beacons do not move');
  const lead3 = beaconStep({ progress: 0, owner: null }, 4, 1, 1).progress, lead1 = beaconStep({ progress: 0, owner: null }, 2, 1, 1).progress;
  assert.ok(lead3 > lead1, 'a bigger majority captures faster');
  assert.ok(beaconStep({ progress: 0, owner: null }, 10, 0, 1).progress <= BEACON_CAPTURE_PER_SECOND * 2 + 1e-9, 'the lead bonus is capped');
  state = { progress: 0, owner: null }; let owner = null, points = 0;
  for (let i = 0; i < 400 && !owner; i++) { const s = step(1, 0, .1); owner = s.owner; }
  assert.equal(owner, 'blue'); assert.equal(state.progress, 1);
  points = step(1, 0, 1).points; assert.ok(points > 0, 'an owned beacon scores');
  state = { progress: -.5, owner: null }; const decayed = step(0, 0, 4).progress; assert.ok(decayed > -.5 && decayed < 0, 'an unattended beacon drifts back to neutral');
  assert.equal(beaconStep({ progress: -1, owner: 'red' }, 0, 3, 1).owner, 'red');
  assert.equal(beaconStep({ progress: 1, owner: 'blue' }, 0, 2, 1).owner, null, 'losing control stops the points');
});

test('scores, ranks and payouts reward doing better and never pay nothing', () => {
  const base = { kills: 6, deaths: 3, headshots: 2, won: true, beaconSeconds: 20 };
  for (const key of ['kills', 'headshots', 'beaconSeconds']) assert.ok(pilotScore({ ...base, [key]: base[key] + 1 }) > pilotScore(base), `${key} raises the score`);
  assert.ok(pilotScore({ ...base, deaths: 8 }) < pilotScore(base)); assert.ok(pilotScore({ ...base, won: false }) < pilotScore(base));
  assert.equal(pilotScore({ deaths: 99 }), 0, 'the score floors at zero');
  assert.equal(pilotRank({ kills: 20, deaths: 0, won: false, limit: 30 }), 'C', 'a loss never ranks above C');
  assert.equal(pilotRank({ kills: 14, deaths: 4, won: true, limit: 30 }), 'S');
  assert.equal(pilotRank({ kills: 7, deaths: 9, won: true, limit: 30 }), 'A');
  assert.equal(pilotRank({ kills: 1, deaths: 9, won: true, limit: 30 }), 'B');
  const op = opById('meridian-crossfire');
  const win = payoutFor(op, { won: true, kills: 8, deaths: 3 }), loss = payoutFor(op, { won: false, kills: 8, deaths: 3 }), draw = payoutFor(op, { draw: true, kills: 8, deaths: 3 });
  assert.ok(win > draw && draw > loss && loss >= 20, 'win > draw > loss, and a loss still pays');
  assert.ok(payoutFor(op, { won: true, kills: 9, deaths: 3 }) > win && payoutFor(op, { won: true, kills: 8, deaths: 3, mvp: true }) > win);
  assert.ok(payoutFor({ ...op, skill: 'elite' }, { won: true }) > payoutFor({ ...op, skill: 'rookie' }, { won: true }), 'harder opposition pays more');
  assert.ok(payoutFor(op, {}) >= 20, 'an empty result still pays the floor');
  assert.ok(Number.isInteger(win));
});

test('opposition skill makes the AI measurably tougher while allies stay at a fixed level', () => {
  const [r, v, e] = ['rookie', 'veteran', 'elite'].map(skillById);
  assert.ok(r.accuracy < v.accuracy && v.accuracy < e.accuracy);
  assert.ok(r.cadence > v.cadence && v.cadence > e.cadence, 'higher skill fires faster');
  assert.ok(r.reaction > v.reaction && v.reaction > e.reaction);
  assert.ok(r.reward < v.reward && v.reward < e.reward);
  assert.equal(skillById('x').id, 'veteran');
  assert.equal(ALLY_SKILL.accuracy, SKILLS.veteran.accuracy); assert.equal(TEAMS.blue.name, 'COBALT'); assert.equal(TEAMS.red.name, 'OXBLOOD');
});

test('operation records survive a reload, ignore damage and flag personal bests', () => {
  const storage = memory();
  const fresh = loadOpsRecord(storage); assert.deepEqual([fresh.team, fresh.skill, fresh.op, Object.keys(fresh.ops).length], ['blue', '', '', 0]);
  const first = recordOperation(fresh, 'beacon-run', { won: true, kills: 7, score: 1200 });
  assert.equal(first.improved, true);
  const worse = recordOperation(fresh, 'beacon-run', { won: false, kills: 3, score: 400 });
  assert.equal(worse.improved, false); assert.deepEqual(worse.best, { played: 2, wins: 1, bestKills: 7, bestScore: 1200 });
  fresh.team = 'red'; fresh.skill = 'elite'; fresh.op = 'beacon-run'; saveOpsRecord(fresh, storage);
  const loaded = loadOpsRecord(storage); assert.equal(loaded.team, 'red'); assert.equal(loaded.skill, 'elite'); assert.equal(loaded.op, 'beacon-run'); assert.equal(loaded.ops['beacon-run'].wins, 1);
  storage.setItem(OPS_KEY, '{"team":"green","skill":"god","op":"nope","ops":{"beacon-run":{"played":"x"},"ghost":{"played":9}}}');
  const hostile = loadOpsRecord(storage); assert.deepEqual([hostile.team, hostile.skill, hostile.op], ['blue', '', '']); assert.ok(!hostile.ops.ghost); assert.equal(hostile.ops['beacon-run'].played, 0);
  storage.setItem(OPS_KEY, '{broken'); assert.equal(loadOpsRecord(storage).team, 'blue');
  assert.equal(loadOpsRecord(undefined).team, 'blue', 'no storage at all still works');
});
