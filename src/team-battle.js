// Plays a team operation: builds both squads, steers every AI pilot, fires their weapons, scores kills and the beacon,
// and ends the match. Rules and data live in team-ops.js; this module owns the meshes and per-frame behaviour.
import * as T from 'three';
import { ENEMY_TYPES } from './encounters.js';
import { makeMech } from './world.js';
import { animateMech } from './animation.js';
import { disposeMech } from './mech-parts.js';
import { BULWARK, bulwarkFacing, applyBulwarkDamage } from './bulwark.js';
import { clamp } from './physics.js';
import { COMBO_WINDOW } from './scoring.js';
import { MELEE_REACH, aimCone, jitterDirection, leadFor, leadPoint, nextStrafe, shotVolume, volleyFor } from './combat-feel.js';
import { ALLY_SKILL, ARENAS, Scoreboard, TEAMS, beaconStep, otherTeam, payoutFor, pilotRank, pilotScore, rosterFor, skillById, winnerOf } from './team-ops.js';

const v3 = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const ZERO = v3();
const HIT_RADIUS = { striker: 1.2, gunner: 1.3, sniper: 1.25, bulwark: 1.55, archon: 2.2 };
const RESPAWN = 5, PLAYER = Object.freeze({ isPlayer: true, name: 'YOU' });
// Where a ray first touches a sphere; a ray that starts inside it (a point-blank shot) hits at once instead of at the far side.
const entry = (ray, sphere, start) => (sphere.containsPoint(start) ? start.clone() : ray.intersectSphere(sphere, v3()));
const MAX_RANGE = { rush: 7, burst: 55, snipe: 95, blast: 55, boss: 60 };

export class TeamBattle {
  constructor(game, op, teamId, skillId) {
    Object.assign(this, { game, op, team: teamId, foeTeam: otherTeam(teamId), skill: skillById(skillId || op.skill), arena: ARENAS[op.arena] });
    this.roster = rosterFor(op, teamId); this.board = new Scoreboard(teamId, this.roster);
    this.foes = this.roster.foes.map((r, i) => this.makeBot(r, i));
    this.allies = this.roster.allies.map((r, i) => this.makeBot(r, i + 1));
    this.bullets = []; this.time = 0; this.state = 'intro'; this.introTime = 4; this.remaining = op.time;
    this.beacon = { progress: 0, owner: null }; this.beaconSeconds = 0; this.stats = { kills: 0, deaths: 0, headshots: 0 };
    this.lastAttacker = null; this.finished = false; this.lastCount = 0;
  }

  // ---- Building and placing -------------------------------------------------------------------------------
  // A bot carries everything the campaign enemies do (group, parts, limbs, health, shield...) so player shots, labels and
  // the radar treat them identically.
  makeBot(entry, slot) {
    const spec = ENEMY_TYPES[entry.type], mech = makeMech(entry.team, 1, entry.type);
    const bot = Object.assign({}, mech, {
      archetype: entry.type, name: entry.callsign, team: entry.team, index: slot, spec, dead: true, respawn: 0, health: 1, shield: 0, maxHealth: 1, maxShield: 0,
      fire: 2, charge: 0, recoil: 0, hit: 0, speed: 0, strafe: 0, hover: 0, partHealth: { arm: 70, leg: 70 }, armLost: false, legLost: false,
      gardenPosition: v3(), velocity: v3(), thinkTimer: Math.random() * .5, phase: Math.random() * 6.28, target: null, navPoint: null, navProbeTime: 0,
      justSpawned: true, aimLock: null, los: false, protect: 0,
    });
    bot.parts.forEach(part => { part.userData.bot = bot; }); bot.group.visible = false; return bot;
  }
  everyone() { return [...this.foes, ...this.allies]; }
  attach() { for (const bot of this.everyone()) this.game.scene.add(bot.group); }
  begin() {
    this.attach(); this.buildBeacon();
    for (const bot of this.everyone()) this.spawn(bot, true);
    this.game.ui.event(`${this.op.name}\n${TEAMS[this.team].name} VS ${TEAMS[this.foeTeam].name}`, 3.5);
  }
  dispose() {
    const scene = this.game.scene;
    for (const bot of this.everyone()) { scene.remove(bot.group); disposeMech(bot.group); }
    this.disposeBeacon(); this.bullets.length = 0;
  }
  spawnPoint(bot) {
    const zone = this.arena.spawns[bot.team], list = bot.team === this.team ? this.allies : this.foes, slot = Math.max(0, list.indexOf(bot)), count = Math.max(1, list.length);
    const b = this.arena.bounds;
    return { x: clamp(zone.x + (slot - (count - 1) / 2) * 8 + (Math.random() - .5) * 3, b.x[0], b.x[1]), z: clamp(zone.z + (Math.random() - .5) * 10, b.z[0], b.z[1]) };
  }
  spawn(bot, initial = false) {
    const g = this.game, p = this.spawnPoint(bot), sk = bot.team === this.team ? ALLY_SKILL : this.skill, spec = bot.spec;
    bot.gardenPosition.set(p.x, g.groundHeight(p.x, p.z), p.z); bot.group.position.copy(bot.gardenPosition);
    bot.health = bot.maxHealth = spec.health * sk.health; bot.shield = bot.maxShield = spec.shield;
    bot.dead = false; bot.group.visible = true; bot.volley = null; bot.fire = 1.5 + Math.random() * 2; bot.armLost = false; bot.legLost = false; bot.partHealth = { arm: 70, leg: 70 };
    bot.speed = 0; bot.strafe = 0; bot.recoil = 0; bot.hit = 0; bot.charge = 0; bot.target = null; bot.navPoint = null; bot.protect = initial ? 0 : 2; bot.justSpawned = true;
    Object.values(bot.limbs).forEach(limb => { if (limb.visible !== undefined) limb.visible = true; }); bot.paint.emissive.set('#000000');
    this.face(bot, this.objectivePoint(bot), 0);
  }
  playerSpawn() {
    const zone = this.arena.spawns[this.team], b = this.arena.bounds;
    return { x: clamp(zone.x + (Math.random() - .5) * 6, b.x[0], b.x[1]), z: clamp(zone.z + (Math.random() - .5) * 6, b.z[0], b.z[1]), yaw: this.arena.yaw[this.team] };
  }

  // ---- Targets ----------------------------------------------------------------------------------------------
  pointOf(target) { const g = this.game; return target.isPlayer ? g.player.position.clone().addScaledVector(g.up, -.35) : target.gardenPosition.clone().add(v3(0, 1.7, 0)); }
  isGone(target) { return target.isPlayer ? this.game.deadTimer > 0 : target.dead; }
  pickTarget(bot) {
    const g = this.game, mine = bot.team === this.team, foes = mine ? this.foes : this.allies, pos = bot.gardenPosition;
    let best = null, bestDistance = 140;
    for (const foe of foes) { if (foe.dead || foe.protect > 0) continue; const d = foe.gardenPosition.distanceTo(pos); if (d < bestDistance) { bestDistance = d; best = foe; } }
    if (!mine && g.deadTimer <= 0 && g.spawnGrace <= 0 && g.invulnerable <= 0) { const d = g.player.position.distanceTo(pos); if (d < bestDistance) best = PLAYER; }
    return best;
  }
  // Where a pilot with nothing to shoot at heads: the beacon in control operations, otherwise the enemy spawn.
  objectivePoint(bot) {
    const g = this.game, slot = bot.index + (bot.team === this.team ? 0 : 3), ring = slot / 6 * Math.PI * 2;
    if (this.op.mode === 'control') { const c = this.arena.beacon; return v3(c.x + Math.cos(ring) * 4, g.groundHeight(c.x, c.z), c.z + Math.sin(ring) * 4); }
    const z = this.arena.spawns[otherTeam(bot.team)]; return v3(z.x + (slot - 2) * 3, g.groundHeight(z.x, z.z), z.z);
  }
  preferredRange(bot) { return bot.archetype === 'striker' ? 4 : clamp(bot.spec.range * 1.3, 8, 36); }
  muzzle(bot) {
    const out = bot.group.position.clone().add(v3(0, 2.3, 0)), gun = bot.limbs[bot.armLost ? 'rightGun' : 'leftGun'];
    if (gun?.userData?.flash) { bot.group.updateMatrixWorld(true); gun.userData.flash.getWorldPosition(out); } return out;
  }
  face(bot, point, dt) {
    const up = v3(0, 1, 0), to = point.clone().sub(bot.group.position).addScaledVector(up, -2.3), height = to.dot(up), flat = to.clone().addScaledVector(up, -height);
    if (flat.lengthSq() < .01) flat.set(0, 0, 1); flat.normalize();
    const q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(v3(), flat, up));
    if (bot.justSpawned) { bot.group.quaternion.copy(q); bot.justSpawned = false; } else if(bot.archetype==='bulwark')bot.group.quaternion.rotateTowards(q,BULWARK.turnRate*dt);else bot.group.quaternion.slerp(q, 1 - Math.exp(-dt * 10));
    return Math.atan2(height, Math.max(1, to.length()));
  }

  // ---- Per-frame update -------------------------------------------------------------------------------------
  update(dt) {
    const g = this.game; this.time += dt;
    if (this.state === 'intro') {
      this.introTime -= dt; const count = Math.ceil(this.introTime);
      if (count !== this.lastCount && count > 0 && count <= 3) { this.lastCount = count; g.ui.event(`OPERATION BEGINS IN ${count}`, 1); g.audio.play('ui'); }
      if (this.introTime <= 0) { this.state = 'live'; g.ui.event('ENGAGE', 1.4); g.audio.play('ui'); }
    } else if (this.state === 'live') this.remaining -= dt;
    for (const bot of this.everyone()) this.updateBot(bot, dt);
    this.updateBullets(dt); this.keepPilotInside();
    if (this.op.mode === 'control') this.updateBeacon(dt);
    this.updateObjective();
    if (this.state === 'live' && this.remaining <= 0) this.finish(true);
  }
  updateBot(bot, dt) {
    const g = this.game, spec = bot.spec, sk = bot.team === this.team ? ALLY_SKILL : this.skill, live = this.state === 'live', pos = bot.gardenPosition;
    if (bot.dead) { bot.respawn -= dt; if (bot.respawn <= 0 && live) this.spawn(bot); return; }
    bot.protect = Math.max(0, bot.protect - dt); bot.thinkTimer -= dt;
    if (bot.thinkTimer <= 0) {
      bot.thinkTimer = (.3 + Math.random() * .3) * sk.reaction; bot.target = this.pickTarget(bot);
      bot.los = bot.target ? !g.blockedByCover(this.muzzle(bot), this.pointOf(bot.target)) : false;
    }
    if (bot.target && this.isGone(bot.target)) { bot.target = null; bot.los = false; }
    const targetPoint = bot.target ? this.pointOf(bot.target) : null, dest = targetPoint || this.objectivePoint(bot);
    const delta = dest.clone().sub(pos); delta.y = 0; const distance = delta.length(), direction = delta.clone().normalize();
    const velocity = v3(); let retreat = false;
    if (live) {
      const preferred = bot.target ? this.preferredRange(bot) : 3;
      retreat = !!bot.target && bot.archetype !== 'striker' && distance < preferred - 4;
      velocity.copy(direction).multiplyScalar(distance > preferred + 2 ? 10 * spec.speed : retreat ? -6 : 0);
      if (bot.target) {
        if (this.time > (bot.strafeUntil || 0)) { const s = nextStrafe(this.time); bot.strafeDir = s.dir; bot.strafeUntil = s.until; }
        velocity.add(v3(-direction.z, 0, direction.x).multiplyScalar((bot.strafeDir || 1) * (bot.archetype === 'striker' ? 1.5 : 4.5) * (.8 + sk.accuracy * .4)));
      }
      for (const other of this.everyone()) { if (other === bot || other.dead) continue; const push = pos.clone().sub(other.gardenPosition); push.y = 0; const d = push.length(); if (d > 0 && d < 5) velocity.addScaledVector(push, (5 - d) * 2 / d); }
      if (distance > 6) { bot.navTarget = dest; g.steerAroundCover(bot, velocity); }
      if (bot.legLost) velocity.multiplyScalar(.5);
    }
    const foot = pos.clone(), eye = foot.clone().add(v3(0, 2.65, 0)), next = eye.clone().addScaledVector(velocity, dt), resolved = g.world.resolve(eye, next, velocity, 1.2, v3(0, 1, 0)), b = this.arena.bounds;
    pos.x = clamp(resolved.x, b.x[0], b.x[1]); pos.z = clamp(resolved.z, b.z[0], b.z[1]); pos.y = g.groundHeight(pos.x, pos.z);
    bot.velocity.copy(pos).sub(foot).divideScalar(Math.max(dt, 1e-4)); bot.speed = bot.velocity.length(); bot.strafe = bot.velocity.dot(v3(-direction.z, 0, direction.x)); bot.backwards = retreat;
    bot.group.position.copy(pos);
    const pitch = this.face(bot, targetPoint || dest, dt);
    animateMech(bot, { dt, time: g.time, speed: bot.speed, strafe: bot.strafe, aimPitch: pitch, airborne: false, boost: false, recoil: bot.recoil, hit: bot.hit, charge: bot.charge, backwards: bot.backwards });
    bot.recoil = Math.max(0, bot.recoil - dt * 9); bot.hit = Math.max(0, bot.hit - dt * 6);
    this.fireAt(bot, dt, distance, targetPoint, sk, live);
  }
  fireAt(bot, dt, distance, targetPoint, sk, live) {
    const spec = bot.spec; bot.fire -= dt; if (bot.volley) this.tickVolley(bot, dt, sk, live);
    const windup = spec.attack === 'snipe' ? 1.15 : .7, range = MAX_RANGE[spec.attack] || 55;
    const wasCharging = bot.charge > 0;
    bot.charge = live && targetPoint && bot.los && distance < range && bot.fire < windup ? 1 - Math.max(0, bot.fire) / windup : 0;
    if (!wasCharging && bot.charge > 0 && spec.attack === 'snipe' && bot.target?.isPlayer && bot.team !== this.team) this.game.lockWarning?.(bot);
    if (!live || !targetPoint || !bot.los || bot.fire > 0) return;
    if (distance > range) { bot.fire = .4; return; }
    if(bot.archetype==='bulwark'&&bulwarkFacing(bot,targetPoint)<.55)return;
    bot.fire = (bot.armLost ? spec.cooldown * 1.5 : spec.cooldown) * sk.cadence * (.9 + Math.random() * .3);
    const damage = spec.damage * sk.damage;
    if (spec.attack === 'rush') { if (distance < MELEE_REACH) { bot.recoil = 1; this.strike(bot.target, damage, bot); } return; }
    if (!bot.target) return;
    bot.volley = { left: volleyFor(spec.attack).shots, wait: 0 }; this.tickVolley(bot, 0, sk, live);
  }
  // One round of a volley at the target's predicted position, with the shared cone/lead model so bots shoot like campaign enemies.
  tickVolley(bot, dt, sk, live) {
    const v = bot.volley; v.wait -= dt; if (v.wait > 0) return;
    const spec = bot.spec, target = bot.target, g = this.game;
    if (!live || !target || this.isGone(target) || !bot.los) { bot.volley = null; return; }
    const from = this.muzzle(bot), point = this.pointOf(target), velocity = target.isPlayer ? g.player.velocity : (target.velocity || ZERO);
    const shape = volleyFor(spec.attack), tmp = this.tmp || (this.tmp = [v3(), v3(), v3()]);
    leadPoint(from, point, velocity, spec.shotSpeed, leadFor(sk.accuracy), tmp[0]); tmp[1].copy(tmp[0]).sub(from).normalize();
    jitterDirection(tmp[1], aimCone(spec.attack, sk.accuracy, velocity.length()), Math.random, tmp[2]);
    const side = tmp[1].clone().cross(v3(0, 1, 0)).normalize(), color = TEAMS[bot.team].bolt; bot.recoil = 1;
    for (let i = 0; i < shape.bolts; i++) {
      const d = tmp[2].clone(); if (shape.bolts > 1) d.addScaledVector(side, (i - (shape.bolts - 1) / 2) * shape.fan).normalize();
      this.bullets.push({ position: from.clone(), origin: from.clone(), velocity: d.multiplyScalar(spec.shotSpeed), life: 3, owner: 'enemy', weapon: 0, kind: spec.attack, team: bot.team, shooter: bot, damage: spec.damage * sk.damage, blast: spec.attack === 'blast' ? 4 : 0, color });
    }
    g.effects.burst(from, color, 4, 3); g.effects.muzzleFlash?.(from, color, spec.attack === 'snipe' || spec.attack === 'boss' ? 1.5 : .9);
    const away = from.distanceTo(g.player.position); if (away < 90) g.audio.play('enemyShot', { volume: shotVolume(away) * (bot.team === this.team ? .55 : 1), pan: Math.sin(g.bearingTo(from)) });
    v.left--; v.wait = shape.gap; if (v.left <= 0) bot.volley = null;
  }
  strike(target, damage, shooter) {
    if (target.isPlayer) { this.lastAttacker = shooter.name; this.game.hurtPlayer(damage, shooter.group.position); } else this.damageBot(target, damage, 'core', target.gardenPosition.clone().add(v3(0, 1.7, 0)), shooter);
  }

  // ---- Bullets ----------------------------------------------------------------------------------------------
  updateBullets(dt) {
    const g = this.game, sphere = new T.Sphere();
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i], start = b.position.clone(), end = start.clone().addScaledVector(b.velocity, dt), travel = start.distanceTo(end);
      b.life -= dt; let endpoint = g.firstImpact(start, end), limit = start.distanceTo(endpoint), victim = null;
      const ray = new T.Ray(start, b.velocity.clone().normalize()), foes = b.team === this.team ? this.foes : this.allies;
      for (const foe of foes) {
        if (foe.dead || foe.protect > 0) continue;
        sphere.set(foe.group.position.clone().add(v3(0, 1.7, 0)), HIT_RADIUS[foe.archetype] || 1.3);
        const hit = entry(ray, sphere, start); if (hit) { const d = start.distanceTo(hit); if (d <= Math.min(travel, limit)) { limit = d; endpoint = hit; victim = foe; } }
      }
      if (b.team !== this.team && g.deadTimer <= 0) {
        sphere.set(g.player.position.clone().addScaledVector(g.up, -.7), 1.05);
        const hit = entry(ray, sphere, start); if (hit) { const d = start.distanceTo(hit); if (d <= Math.min(travel, limit)) { limit = d; endpoint = hit; victim = PLAYER; } }
      }
      const impact = victim || limit < travel - .001; b.position.copy(endpoint);
      if (impact) {
        if (victim === PLAYER) { this.lastAttacker = b.shooter.name; g.hurtPlayer(b.damage, b.origin || start); g.effects.burst(endpoint, b.color, 8, 6); }
        else if (victim) this.damageBot(victim, b.damage, 'core', endpoint, b.shooter,{source:start,direct:true});
        else if (g.worldImpact) g.worldImpact(g.raycastWorld(start, end), endpoint, b);
        else { g.effects.burst(endpoint, b.color, 4, 5); g.effects.muzzleFlash?.(endpoint, b.color, .7, false); }
        if (b.blast) this.explode(b, endpoint, victim);
      }
      if (impact || b.life <= 0) this.bullets.splice(i, 1);
    }
  }
  explode(b, point, skip) {
    const g = this.game; g.effects.explosion(point, .7); const foes = b.team === this.team ? this.foes : this.allies;
    for (const foe of foes) { if (foe.dead || foe === skip || foe.protect > 0) continue; const d = foe.group.position.clone().add(v3(0, 1.7, 0)).distanceTo(point); if (d < b.blast) this.damageBot(foe, b.damage * (1 - d / b.blast), 'core', point, b.shooter,{source:point,direct:false}); }
    if (b.team !== this.team && skip !== PLAYER && g.deadTimer <= 0) { const d = g.player.position.clone().addScaledVector(g.up, -.7).distanceTo(point); if (d < b.blast && !g.blockedByCover(point, g.player.position)) { this.lastAttacker = b.shooter.name; g.hurtPlayer(b.damage * (1 - d / b.blast), point); } }
  }

  // ---- Damage and kills -------------------------------------------------------------------------------------
  // Shots fired by the pilot arrive here through game.damageBot, which has already played the hit feedback.
  playerHit(bot, damage, part, point,context={}) { this.damageBot(bot, damage, part, point, PLAYER,context); }
  damageBot(bot, damage, part, point, shooter,context={}) {
    if (bot.dead || bot.protect > 0 || this.finished) return;
    const g = this.game; bot.hit = 1; g.effects.burst(point, bot.shield > 0 ? '#7ceaff' : '#ffba78', bot.shield > 0 ? 5 : 9, 6);
    const source=context.source||(shooter===PLAYER?g.player.position:shooter?.group?.position)||point;
    const strike=applyBulwarkDamage(bot,damage,part,source,context),dead=strike.dead;
    if(shooter===PLAYER&&strike.armored&&g.time>(g.armorTipUntil||0)){g.armorTipUntil=g.time+4;g.ui.event('FRONT ARMOR · FLANK THE REAR REACTOR',1.5)}
    if (bot.shield === 0 && (part === 'arm' || part === 'leg')) {
      bot.partHealth[part] -= damage;
      if (bot.partHealth[part] <= 0 && !(part === 'arm' ? bot.armLost : bot.legLost)) {
        if (part === 'arm') { bot.armLost = true; bot.limbs.leftArm.visible = false; } else { bot.legLost = true; bot.limbs.rightLeg.visible = false; }
        g.effects.explosion(point, .3);
      }
    }
    if (dead) this.killBot(bot, shooter, part,strike);
  }
  killBot(bot, shooter, part,strike={}) {
    const g = this.game, byPlayer = shooter === PLAYER, killer = byPlayer ? 'YOU' : shooter?.name || null, center = bot.group.position.clone();
    bot.dead = true; bot.respawn = RESPAWN + Math.random() * 1.5; bot.group.visible = false; bot.target = null;
    g.effects.breakMech?.(bot); g.effects.explosion(center.clone().add(v3(0, 1.8, 0)), 1.1);
    this.board.kill(killer, bot.name); g.ui.killFeed?.(killer || '—', bot.name, byPlayer ? this.team : shooter?.team);
    if (byPlayer) {
      g.audio.play('kill'); this.stats.kills++; if (part === 'head') this.stats.headshots++;
      g.combo = g.comboTime > 0 ? g.combo + 1 : 1; g.comboTime = COMBO_WINDOW;
      const dashReward=strike.reactor&&g.rewardReactorKill();
      const award = g.run?.kill(bot.archetype, { combo: g.combo, headshot: part === 'head', airborne: !g.player.grounded,reactor:strike.reactor });
      g.ui.event(`${g.combo > 1 ? g.combo + ' × COMBO · ' : ''}${bot.name} ELIMINATED${dashReward?' · AIR REACTOR KILL · DASH READY':strike.reactor?' · REACTOR DESTROYED':''}`,dashReward?2:1.3); if (award) g.ui.popup?.(award, center.add(v3(0, 3.4, 0)));
      g.player.shield = Math.min(100, g.player.shield + 18);
    }
    this.checkEnd();
  }
  onPlayerKilled() {
    this.stats.deaths++; const killer = this.lastAttacker || '—'; this.lastAttacker = null;
    this.board.kill(killer, 'YOU'); this.game.ui.killFeed?.(killer, 'YOU', this.foeTeam); this.checkEnd();
  }
  checkEnd() { if (this.state === 'live' && this.board.leader(this.op.limit)) this.finish(false); }

  // ---- Beacon -----------------------------------------------------------------------------------------------
  buildBeacon() {
    if (this.op.mode !== 'control') return;
    const g = this.game, c = this.arena.beacon, r = this.arena.beaconRadius, group = new T.Group();
    const ring = new T.Mesh(new T.TorusGeometry(r, .22, 8, 72), new T.MeshBasicMaterial({ color: '#c9d6dc', transparent: true, opacity: .85, depthWrite: false })); ring.rotation.x = Math.PI / 2; ring.position.y = .3; group.add(ring);
    const disc = new T.Mesh(new T.CircleGeometry(r, 48), new T.MeshBasicMaterial({ color: '#c9d6dc', transparent: true, opacity: .1, depthWrite: false, side: T.DoubleSide })); disc.rotation.x = -Math.PI / 2; disc.position.y = .2; group.add(disc);
    const beam = new T.Mesh(new T.CylinderGeometry(.5, .9, 46, 14, 1, true), new T.MeshBasicMaterial({ color: '#c9d6dc', transparent: true, opacity: .32, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending })); beam.position.y = 23; group.add(beam);
    group.position.set(c.x, g.groundHeight(c.x, c.z), c.z); g.scene.add(group); this.beaconMesh = { group, ring, disc, beam };
  }
  disposeBeacon() {
    if (!this.beaconMesh) return; const { group } = this.beaconMesh; this.game.scene.remove(group);
    group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); this.beaconMesh = null;
  }
  updateBeacon(dt) {
    const g = this.game, c = this.arena.beacon, r = this.arena.beaconRadius; let blue = 0, red = 0, near = false;
    if (this.state === 'live') {
      for (const bot of this.everyone()) { if (!bot.dead && Math.hypot(bot.gardenPosition.x - c.x, bot.gardenPosition.z - c.z) < r) bot.team === 'blue' ? blue++ : red++; }
      const p = g.player; near = g.deadTimer <= 0 && Math.hypot(p.position.x - c.x, p.position.z - c.z) < r && p.position.y - g.groundHeight(p.position.x, p.position.z) < 14;
      if (near) this.team === 'blue' ? blue++ : red++;
      const step = beaconStep(this.beacon, blue, red, dt); this.beacon.progress = step.progress; this.beacon.owner = step.owner;
      if (step.owner) { this.board.beacon(step.owner, step.points); if (near && step.owner === this.team) this.beaconSeconds += dt; }
      this.checkEnd();
    }
    if (!this.beaconMesh) return;
    const p = this.beacon.progress, color = new T.Color('#c9d6dc').lerp(new T.Color(p >= 0 ? TEAMS.blue.color : TEAMS.red.color), Math.abs(p));
    for (const m of [this.beaconMesh.ring, this.beaconMesh.disc, this.beaconMesh.beam]) m.material.color.copy(color);
    this.beaconMesh.beam.material.opacity = .22 + .12 * Math.sin(this.time * 3); this.beaconMesh.ring.scale.setScalar(1 + .015 * Math.sin(this.time * 2));
  }

  // ---- HUD text and the end of the match ---------------------------------------------------------------------
  teamName(id) { return TEAMS[id].name; }
  hint() {
    return this.op.mode === 'control' ? 'Hold the ring with more pilots than the enemy to capture the beacon.' : 'Your squad fights on its own. Eliminations restore shield.';
  }
  threatText() { const alive = this.foes.filter(b => !b.dead).length; return `${TEAMS[this.foeTeam].name} · ${this.skill.label} · ${alive} OF ${this.foes.length} ACTIVE`; }
  suitText() { const alive = this.allies.filter(b => !b.dead).length + (this.game.deadTimer > 0 ? 0 : 1); return `${TEAMS[this.team].name} SQUAD · ${alive} OF ${this.op.size} ACTIVE · ${this.board.pilots.get('YOU').kills} K / ${this.board.pilots.get('YOU').deaths} D`; }
  objectiveMarker() {
    if (this.op.mode !== 'control') return null; const c = this.arena.beacon;
    return { position: v3(c.x, this.game.groundHeight(c.x, c.z) + 3, c.z), label: 'BEACON' };
  }
  // The pilot flies freely, but the match only happens inside the arena: a soft wall stops them wandering off the map.
  keepPilotInside() {
    const g = this.game, p = g.player.position, b = this.arena.bounds, m = 5, x = clamp(p.x, b.x[0] - m, b.x[1] + m), z = clamp(p.z, b.z[0] - m, b.z[1] + m);
    if (x === p.x && z === p.z) return;
    p.x = x; p.z = z; g.player.velocity.x *= .2; g.player.velocity.z *= .2;
    if (g.time - (this.warned || -9) > 3) { this.warned = g.time; g.ui.event('OUT OF BOUNDS · RETURN TO THE ARENA', 1.4); }
  }
  updateObjective() {
    const m = this.game.mission; if (!m) return;
    const them = TEAMS[this.foeTeam].name;
    if (this.state === 'intro') m.teamObjective = `Get into position · begins in ${Math.max(1, Math.ceil(this.introTime))}`;
    else if (this.op.mode === 'control') {
      const owner = this.beacon.owner, pct = Math.round(Math.abs(this.beacon.progress) * 100), lead = this.beacon.progress > 0 ? TEAMS.blue.name : this.beacon.progress < 0 ? TEAMS.red.name : 'NOBODY';
      m.teamObjective = owner ? `${TEAMS[owner].name} hold the beacon` : `Capture the beacon · ${lead} ${pct}%`;
    } else m.teamObjective = `Eliminate the ${them} squad`;
  }
  finish(timeUp) {
    if (this.finished) return; const winner = winnerOf(this.board, this.op.limit, timeUp); if (!winner) return;
    this.finished = true; this.state = 'over';
    const won = winner === this.team, draw = winner === 'draw', me = this.board.pilots.get('YOU'), table = this.board.table(), mvp = table[0]?.name === 'YOU';
    const input = { kills: me.kills, deaths: me.deaths, headshots: this.stats.headshots, won, beaconSeconds: this.beaconSeconds };
    this.result = {
      mode: 'team', chapter: 4, op: this.op, team: this.team, skill: this.skill.id, won, draw, winner, mvp, time: this.op.time - this.remaining,
      score: pilotScore(input), rank: pilotRank({ ...input, limit: this.op.limit, mode: this.op.mode }), credits: payoutFor(this.op, { won, draw, kills: me.kills, deaths: me.deaths, mvp }),
      teams: { blue: this.board.teamScore('blue'), red: this.board.teamScore('red') }, table, stats: { kills: me.kills, deaths: me.deaths, headshots: this.stats.headshots, beaconSeconds: Math.round(this.beaconSeconds) },
    };
    this.game.finishTeamMatch(this.result);
  }
}
