import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { TeamBattle } from '../src/team-battle.js';
import { ARENAS, opById } from '../src/team-ops.js';
import { OrbitalBreach } from '../src/game.js';
import { Mission } from '../src/mission.js';

const context = { fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, fillText() {}, createRadialGradient() { return { addColorStop() {} }; } };
globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return context; } }; } };

// Deterministic randomness so a flaky balance change cannot hide behind luck.
function seeded(seed = 7) { const real = Math.random; let s = seed; Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); return () => { Math.random = real; }; }

// A game stand-in with an empty open field: just the surface TeamBattle uses.
function fakeGame() {
  const game = {
    scene: new T.Scene(), time: 0, deadTimer: 0, spawnGrace: 0, invulnerable: 0, up: new T.Vector3(0, 1, 0), combo: 0, comboTime: 0, hits: [], events: [], feed: [], finished: [],
    player: { position: new T.Vector3(0, 2.65, -70), velocity: new T.Vector3(), health: 100, shield: 100, grounded: true },
    world: { resolve: (_from, to) => to.clone() }, mission: { teamObjective: '' }, run: { kill: () => ({ points: 100, mult: 1, tags: [] }) },
    effects: { burst() {}, explosion() {}, breakMech() {} }, audio: { play() {} },
    ui: { event(t) { game.events.push(t); }, killFeed(...a) { game.feed.push(a); }, popup() {} },
    groundHeight: () => 0, blockedByCover: () => false, firstImpact: (_a, b) => b.clone(), steerAroundCover() {}, bearingTo() { return 0; },
    hurtPlayer(damage) { if (this.deadTimer > 0) return; this.hits.push(damage); this.player.health -= damage; if (this.player.health <= 0) { this.deadTimer = 4; this.battle.onPlayerKilled(); } },
    finishTeamMatch(result) { this.finished.push(result); },
  };
  return game;
}
function setup(overrides = {}, team = 'blue', skill = 'veteran') {
  const game = fakeGame(), op = { ...opById(overrides.id || 'meridian-crossfire'), ...overrides }, battle = new TeamBattle(game, op, team, skill);
  game.battle = battle; battle.begin(); return { game, battle, op };
}
function run(game, battle, seconds, until = () => false) {
  for (let t = 0; t < seconds * 60 && !until(); t++) {
    game.time += 1 / 60; game.comboTime = Math.max(0, game.comboTime - 1 / 60);
    if (game.deadTimer > 0) { game.deadTimer -= 1 / 60; if (game.deadTimer <= 0) { const p = battle.playerSpawn(); game.player.position.set(p.x, 2.65, p.z); game.player.health = 100; game.invulnerable = 5; } }
    battle.update(1 / 60);
  }
}
const goLive = (game, battle) => run(game, battle, 4.5);

test('both squads are built on their own side, inside the arena, with unique pilots wired for player hits', () => {
  for (const id of ['meridian-crossfire', 'grove-skirmish']) for (const team of ['blue', 'red']) {
    const { game, battle, op } = setup({ id }, team), arena = ARENAS[op.arena], foeTeam = team === 'blue' ? 'red' : 'blue';
    assert.equal(battle.allies.length, op.size - 1); assert.equal(battle.foes.length, op.size);
    const all = battle.everyone(); assert.equal(new Set(all.map(b => b.name)).size, all.length);
    for (const bot of all) {
      assert.equal(bot.dead, false); assert.equal(bot.group.visible, true); assert.equal(bot.group.parent, game.scene);
      assert.ok(bot.health > 0 && bot.maxHealth === bot.health);
      assert.ok(bot.gardenPosition.x >= arena.bounds.x[0] && bot.gardenPosition.x <= arena.bounds.x[1] && bot.gardenPosition.z >= arena.bounds.z[0] && bot.gardenPosition.z <= arena.bounds.z[1]);
      assert.ok(bot.parts.length > 5 && bot.parts.every(part => part.userData.bot === bot), 'player rays resolve a part back to its pilot');
      assert.equal(bot.team, battle.allies.includes(bot) ? team : foeTeam);
    }
    const allyZ = battle.allies.map(b => b.gardenPosition.z), foeZ = battle.foes.map(b => b.gardenPosition.z);
    assert.ok(team === 'blue' ? Math.max(...allyZ) < Math.min(...foeZ) : Math.min(...allyZ) > Math.max(...foeZ), 'squads start on opposite ends');
    const spawn = battle.playerSpawn(); assert.equal(spawn.yaw, arena.yaw[team]);
    assert.ok(Math.sign(spawn.z) === Math.sign(arena.spawns[team].z) || arena.spawns[team].z === 0, 'the pilot starts with their own squad');
  }
});

test('nobody moves or fires during the countdown, then the fight goes live', () => {
  const restore = seeded(); const { game, battle } = setup();
  const before = battle.everyone().map(b => b.gardenPosition.clone());
  run(game, battle, 3.5);
  assert.equal(battle.state, 'intro'); assert.equal(battle.bullets.length, 0);
  battle.everyone().forEach((b, i) => assert.ok(b.gardenPosition.distanceTo(before[i]) < .05, 'holding position'));
  assert.ok(game.events.some(e => /BEGINS IN 3/.test(e)));
  run(game, battle, 1); assert.equal(battle.state, 'live'); assert.ok(game.events.includes('ENGAGE'));
  restore();
});

test('the squads fight each other: both sides score, pilots respawn, and the match ends once with consistent standings', () => {
  const restore = seeded(11); const { game, battle } = setup({ limit: 12, time: 600 });
  game.player.position.set(0, 2.65, -88); // out of the way of the first contact
  let respawned = 0; const seen = new Set();
  run(game, battle, 590, () => { for (const b of battle.everyone()) { if (b.dead) seen.add(b); else if (seen.has(b)) { seen.delete(b); respawned++; } } return game.finished.length > 0; });
  assert.equal(game.finished.length, 1, 'the match ended by itself and reported once');
  const result = game.finished[0]; assert.equal(battle.state, 'over');
  assert.ok(['blue', 'red'].includes(result.winner)); assert.equal(result.won, result.winner === 'blue'); assert.equal(result.draw, false);
  assert.ok(Math.max(result.teams.blue, result.teams.red) >= 12 && result.teams.blue !== result.teams.red);
  const kills = result.table.reduce((n, p) => n + p.kills, 0), deaths = result.table.reduce((n, p) => n + p.deaths, 0);
  assert.equal(kills, deaths, 'every kill has a victim and friendly fire never scores');
  assert.equal(kills, result.teams.blue + result.teams.red, 'team scores add up to the kills');
  assert.ok(respawned > 0, 'downed pilots returned to the fight');
  assert.ok(result.table.every((p, i, a) => i === 0 || a[i - 1].kills >= p.kills), 'standings are sorted by kills');
  assert.ok(result.credits >= 20 && ['S', 'A', 'B', 'C'].includes(result.rank));
  run(game, battle, 5); assert.equal(game.finished.length, 1, 'a finished match never reports again');
  restore();
});

test('player shots are credited to YOU with headshots, combo and shield refill; fresh respawns are protected', () => {
  const { game, battle } = setup(); goLive(game, battle);
  const [a, b] = battle.foes; game.player.shield = 40;
  battle.playerHit(a, 9999, 'head', a.group.position.clone());
  assert.equal(a.dead, true); assert.equal(a.group.visible, false);
  assert.equal(battle.board.pilots.get('YOU').kills, 1); assert.equal(battle.stats.headshots, 1); assert.equal(game.combo, 1); assert.equal(game.player.shield, 58);
  assert.deepEqual(game.feed.at(-1), ['YOU', a.name, 'blue']); assert.ok(game.events.some(e => e.includes(`${a.name} ELIMINATED`)));
  battle.playerHit(b, 9999, 'core', b.group.position.clone()); assert.equal(game.combo, 2); assert.equal(battle.stats.headshots, 1);
  const hp = a.health; run(game, battle, 7, () => !a.dead); assert.equal(a.dead, false, 'respawned');
  assert.ok(a.protect > 0 && a.health === a.maxHealth);
  battle.playerHit(a, 9999, 'core', a.group.position.clone()); assert.equal(a.dead, false, 'spawn protection absorbs the hit'); assert.equal(a.health, hp === 0 ? a.maxHealth : a.maxHealth);
});

test('bullets hurt only the opposing side, and enemy shots credit the shooter when they down the pilot', () => {
  const { game, battle } = setup(); goLive(game, battle);
  const ally = battle.allies[0], shooterAlly = battle.allies[1], foe = battle.foes[0], shooterFoe = battle.foes[1];
  const shot = (target, team, shooter, damage = 30) => {
    const centre = target.group.position.clone().add(new T.Vector3(0, 1.7, 0));
    battle.bullets.push({ position: centre.clone().add(new T.Vector3(0, 0, -2.5)), velocity: new T.Vector3(0, 0, 120), life: 2, team, shooter, damage, blast: 0, color: '#fff' });
    battle.updateBullets(1 / 60); battle.bullets.length = 0;
  };
  const allyBefore = ally.health + ally.shield; shot(ally, 'blue', shooterAlly);
  assert.equal(ally.health + ally.shield, allyBefore, 'no friendly fire');
  const foeBefore = foe.health + foe.shield; shot(foe, 'blue', shooterAlly);
  assert.ok(foe.health + foe.shield < foeBefore, 'allies hurt the opposition');
  const pointBlank = foe.health + foe.shield; battle.bullets.push({ position: foe.group.position.clone().add(new T.Vector3(0, 1.7, -.4)), velocity: new T.Vector3(0, 0, 120), life: 2, team: 'blue', shooter: shooterAlly, damage: 10, blast: 0, color: '#fff' });
  battle.updateBullets(1 / 60); battle.bullets.length = 0; assert.ok(foe.health + foe.shield < pointBlank, 'a shot that starts inside the hitbox still lands');
  const allyBefore2 = ally.health + ally.shield; shot(ally, 'red', shooterFoe);
  assert.ok(ally.health + ally.shield < allyBefore2, 'the opposition hurts allies');
  // Isolate the player-only shot from randomly placed allied hitboxes.
  game.player.position.set(80,2.65,80);
  battle.bullets.push({ position: game.player.position.clone().add(new T.Vector3(0, 0, -2.5)), velocity: new T.Vector3(0, 0, 120), life: 2, team: 'red', shooter: shooterFoe, damage: 40, blast: 0, color: '#fff' });
  battle.updateBullets(1 / 60); assert.deepEqual(game.hits, [40]); assert.equal(battle.lastAttacker, shooterFoe.name);
  game.player.health = 10; battle.bullets.push({ position: game.player.position.clone().add(new T.Vector3(0, 0, -1)), velocity: new T.Vector3(0, 0, 120), life: 2, team: 'red', shooter: shooterFoe, damage: 40, blast: 0, color: '#fff' });
  battle.updateBullets(1 / 60);
  assert.equal(battle.board.pilots.get('YOU').deaths, 1); assert.deepEqual(game.feed.at(-1), [shooterFoe.name, 'YOU', 'red']); assert.equal(battle.board.teamScore('red'), 1);
  assert.equal(game.deadTimer, 4);
  const hitsAfterDeath = game.hits.length; battle.bullets.push({ position: game.player.position.clone().add(new T.Vector3(0, 0, -1)), velocity: new T.Vector3(0, 0, 120), life: 2, team: 'red', shooter: shooterFoe, damage: 40, blast: 0, color: '#fff' });
  battle.updateBullets(1 / 60); assert.equal(game.hits.length, hitsAfterDeath, 'a downed pilot cannot be hit again');
});

test('opposition skill changes how often and how hard the AI fires', () => {
  const count = skill => {
    const restore = seeded(3), { game, battle } = setup({ id: 'meridian-crossfire' }, 'blue', skill); goLive(game, battle);
    for (const b of battle.allies) b.dead = true; // nobody to shoot but the pilot, so every volley is comparable
    game.player.health = 1e9; game.player.position.set(0, 2.65, 70); // standing next to the OXBLOOD line
    for (const b of battle.foes) { b.gardenPosition.set((b.index - 2) * 4, 0, 40); b.group.position.copy(b.gardenPosition); b.los = true; b.fire = .1; }
    run(game, battle, 20); restore(); return { shots: game.hits.length, damage: game.hits.reduce((n, d) => n + d, 0) };
  };
  const rookie = count('rookie'), elite = count('elite');
  assert.ok(elite.shots > rookie.shots, `elite lands more shots (${elite.shots}) than rookie (${rookie.shots})`);
  assert.ok(elite.damage > rookie.damage * 1.2, 'and hits harder in total');
});

test('the beacon is captured by the side with more pilots in the ring and scores for its owner', () => {
  const { game, battle, op } = setup({ id: 'beacon-run' }); goLive(game, battle);
  const c = ARENAS[op.arena].beacon, r = ARENAS[op.arena].beaconRadius;
  battle.foes.forEach(b => b.gardenPosition.set(c.x + r * 3, 0, c.z + r * 3)); battle.allies.forEach((b, i) => b.gardenPosition.set(c.x + i - 1, 0, c.z));
  game.player.position.set(c.x, 2.65, c.z + 2);
  for (let i = 0; i < 60 * 5; i++) { game.time += 1 / 60; battle.updateBeacon(1 / 60); }
  assert.equal(battle.beacon.owner, 'blue'); assert.equal(battle.beacon.progress, 1);
  assert.ok(battle.board.beaconPoints.blue > 0 && battle.board.teamScore('blue') > 0); assert.ok(battle.beaconSeconds > 1, 'time holding the beacon with the pilot on it is tracked');
  const held = battle.beaconSeconds; for (let i = 0; i < 120; i++) { game.time += 1 / 60; battle.updateBeacon(1 / 60); } assert.ok(battle.beaconSeconds > held + 1.9, 'and keeps counting while the team holds it');
  assert.equal(battle.board.beaconPoints.red, 0);
  game.player.position.set(0, 2.65, -80); battle.allies.forEach(b => b.gardenPosition.set(c.x + r * 3, 0, c.z + r * 3));
  battle.foes.forEach((b, i) => b.gardenPosition.set(c.x + i - 1, 0, c.z));
  for (let i = 0; i < 60 * 12; i++) { game.time += 1 / 60; battle.updateBeacon(1 / 60); }
  assert.equal(battle.beacon.owner, 'red', 'the beacon changes hands'); assert.ok(battle.board.beaconPoints.red > 0);
  battle.updateObjective(); assert.match(game.mission.teamObjective, /OXBLOOD hold the beacon/);
});

test('time up decides by score, a tie is a draw, and the limit ends the match instantly', () => {
  let { game, battle } = setup(); goLive(game, battle);
  battle.board.score.blue = 4; battle.board.score.red = 2; battle.remaining = .01; battle.update(.05);
  assert.equal(game.finished.length, 1); assert.equal(game.finished[0].winner, 'blue'); assert.equal(game.finished[0].won, true);
  ({ game, battle } = setup()); goLive(game, battle);
  battle.board.score.blue = 3; battle.board.score.red = 3; battle.remaining = .01; battle.update(.05);
  assert.equal(game.finished[0].draw, true); assert.equal(game.finished[0].won, false); assert.ok(game.finished[0].credits >= 20);
  ({ game, battle } = setup({}, 'red')); goLive(game, battle);
  battle.board.score.blue = battle.op.limit; battle.checkEnd();
  assert.equal(game.finished[0].winner, 'blue'); assert.equal(game.finished[0].won, false, 'the red pilot lost'); assert.equal(game.finished[0].rank, 'C');
});

test('the pilot cannot wander off the map, and teardown leaves the scene empty', () => {
  const { game, battle, op } = setup({ id: 'beacon-run' }); goLive(game, battle);
  const b = ARENAS[op.arena].bounds; game.player.position.set(500, 9, -500); game.player.velocity.set(30, 0, -30);
  battle.keepPilotInside();
  assert.ok(game.player.position.x <= b.x[1] + 5 && game.player.position.z >= b.z[0] - 5); assert.ok(Math.abs(game.player.velocity.x) < 10);
  assert.ok(game.events.some(e => /OUT OF BOUNDS/.test(e)));
  assert.ok(game.scene.children.length >= battle.everyone().length + 1, 'squads and beacon are in the scene');
  battle.dispose(); assert.equal(game.scene.children.length, 0); assert.equal(battle.bullets.length, 0);
});

test('game plumbing: chapter five, refits, player death, hit routing and teardown all follow the battle', () => {
  const game = Object.create(OrbitalBreach.prototype);
  const log = { events: [], hits: 0 };
  Object.assign(game, {
    mission: new Mission(), tutorial: { active: false }, started: true, deadTimer: 0, time: 10, player: { lastHit: 0, position: new T.Vector3() }, buttons: [true, true], combo: 3, comboTime: 2, run: { deaths: 0, registerHit() {} },
    ui: { event(t) { log.events.push(t); }, hit() { log.hits++; } }, audio: { play() {} }, effects: { explosion() {} }, bots: ['campaign'],
  });
  assert.notEqual(game.currentChapter(), 4);
  const calls = []; game.battle = { op: opById('beacon-run'), state: 'intro', playerHit: (...a) => calls.push(['hit', a[1], a[2]]), onPlayerKilled: () => calls.push(['killed']), update: dt => calls.push(['update', dt]), dispose: () => calls.push(['dispose']), objectiveMarker: () => 'marker' };
  game.campaignBots = ['campaign']; game.bots = ['foe'];
  assert.equal(game.currentChapter(), 4);
  assert.equal(game.refitNow(), true, 'refits are free during the countdown'); game.battle.state = 'live'; assert.equal(game.refitNow(), false, 'but wait for a respawn mid-fight'); game.deadTimer = 3; assert.equal(game.refitNow(), true, 'and land while downed'); game.deadTimer = 0;
  game.damageBot({ dead: false }, 33, 'head', new T.Vector3()); assert.deepEqual(calls.at(-1), ['hit', 33, 'head']); assert.equal(log.hits, 1);
  game.killPlayer(); assert.equal(game.deadTimer, 4); assert.equal(game.run.deaths, 1); assert.deepEqual(calls.at(-1), ['killed']); assert.equal(game.combo, 0); assert.ok(log.events.some(e => /REDEPLOYING/.test(e)));
  game.updateBots(.016); assert.deepEqual(calls.at(-1), ['update', .016]);
  assert.equal(game.objectiveTarget(), 'marker'); assert.equal(game.interact(), undefined, 'the campaign console and gateways are ignored during a battle');
  game.dropTeamMatch(); assert.deepEqual(calls.at(-1), ['dispose']); assert.equal(game.battle, null); assert.deepEqual(game.bots, ['campaign'], 'the campaign squad comes back'); game.dropTeamMatch();
  assert.equal(calls.filter(c => c[0] === 'dispose').length, 1, 'dropping twice is harmless');
});

test('the mission has a team stage with no scripted combat and its own objective text', () => {
  const mission = new Mission(), op = opById('heart-tree-hold');
  assert.equal(mission.startTeam(op), true);
  assert.equal(mission.stage, 'team'); assert.equal(mission.world, 'eden'); assert.equal(mission.combatActive, false); assert.equal(mission.upgrades, 0);
  assert.match(mission.title, /05 · HOLD THE HEART TREE/); assert.equal(mission.objective, op.name);
  mission.teamObjective = 'Capture the beacon'; assert.equal(mission.objective, 'Capture the beacon');
  assert.equal(mission.startTeam(opById('avenue-war')) && mission.world, 'city');
  mission.reset(); assert.equal(mission.stage, 'briefing'); assert.equal(mission.teamObjective, ''); assert.equal(mission.teamName, '');
});
