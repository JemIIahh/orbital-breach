import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLOTS, PART_SLOTS, POOLS, DEFAULT_BUILD, PRESETS, partsFor, partById, sanitizeBuild, sameBuild, buildName, resolveBuild, randomBuild, computeStats, gameplayMods, describeFire, partBars, statDeltas, armDps } from '../src/parts.js';

test('every slot has a pool, part ids are unique inside a pool, and the default build is valid', () => {
  for (const slot of PART_SLOTS) {
    const pool = partsFor(slot); assert.ok(pool.length >= 3, `${slot} offers real choices`);
    assert.equal(new Set(pool.map(p => p.id)).size, pool.length, `${slot} ids are unique`);
    assert.ok(pool.every(p => p.name && p.maker && p.blurb && typeof p.weight === 'number' && p.model), `${slot} parts are fully described`);
    assert.ok(partById(slot, DEFAULT_BUILD[slot]), `${slot} default exists`);
  }
  assert.deepEqual(SLOTS.map(s => s.key), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], 'slots are reachable from the number row');
  assert.equal(partsFor('rArm'), partsFor('lArm'), 'both arms draw from the same weapon pool');
});

test('the default build keeps the original weapon numbers, so the base game plays exactly as before', () => {
  const p = resolveBuild(DEFAULT_BUILD);
  assert.deepEqual(p.lArm.fire, { cd: .075, damage: 17, pellets: 1, spread: 0, speed: 165, life: 1.7, heat: .052, shake: .12, audio: 'gatling' });
  assert.deepEqual(p.rArm.fire, { cd: .53, damage: 13, pellets: 7, spread: .052, speed: 112, life: 1.7, heat: .22, shake: .45, audio: 'flak' });
  assert.equal(p.rShoulder.fire.kind, 'missile'); assert.equal(p.rShoulder.fire.cd, 7); assert.equal(p.rShoulder.fire.damage, 150); assert.equal(p.rShoulder.fire.splash, 9);
  assert.equal(p.lShoulder.fire, null);
  assert.deepEqual(gameplayMods(DEFAULT_BUILD), { speed: 1, boost: 1, damageTaken: 1, heatGain: 1, cooling: 1 });
});

test('weapon specs are playable: positive cooldowns, finite numbers, and empty slots fire nothing', () => {
  for (const slot of ['rArm', 'lArm', 'rShoulder', 'lShoulder']) for (const part of partsFor(slot)) {
    if (part.id === 'none') { assert.equal(part.fire, null); continue; }
    const f = part.fire; assert.ok(f.cd > 0 && f.damage >= 0, `${part.name} cooldown/damage`);
    assert.ok(Object.values(f).every(v => typeof v === 'string' || Number.isFinite(v)), `${part.name} has no NaN`);
    if (slot.endsWith('Arm')) { assert.ok(f.pellets >= 1 && f.speed > 0 && f.life > 0 && f.heat > 0, `${part.name} arm numbers`); assert.ok(armDps(part) > 0); }
  }
});

test('sanitizeBuild repairs unknown, missing and hostile values slot by slot', () => {
  const messy = sanitizeBuild({ legs: 'arachne', torso: '__proto__', back: 42, rArm: null, lArm: 'lc7', extra: 'x', rShoulder: 'constructor' });
  assert.deepEqual(messy, { head: 'visor', legs: 'arachne', torso: 't40', back: 'helion', rArm: 'fk40', lArm: 'lc7', rShoulder: 'hx2', lShoulder: 'none', decal: 'none', trail: 'auto' }, 'the new head, decal and trail slots repair to their defaults');
  assert.deepEqual(sanitizeBuild(undefined), DEFAULT_BUILD); assert.deepEqual(sanitizeBuild('nonsense'), DEFAULT_BUILD);
});

test('presets are complete builds with distinct identities and are named when fitted', () => {
  assert.ok(PRESETS.length >= 4); assert.equal(new Set(PRESETS.map(p => p.id)).size, PRESETS.length);
  for (const preset of PRESETS) { assert.ok(sameBuild(preset.build, sanitizeBuild(preset.build)), `${preset.name} only names real parts`); assert.equal(buildName(preset.build), preset.name); }
  assert.equal(buildName({ ...DEFAULT_BUILD, back: 'aegis' }), 'CUSTOM BUILD');
  const dps = PRESETS.map(p => computeStats(p.build).dps); assert.ok(new Set(dps).size > 2, 'presets differ in firepower');
});

test('mass, armour and damage come from the parts and move the right way', () => {
  const base = computeStats(DEFAULT_BUILD), heavy = computeStats(PRESETS.find(p => p.id === 'brawler').build), light = computeStats(PRESETS.find(p => p.id === 'ghost').build);
  assert.ok(heavy.mass > base.mass && heavy.armour > base.armour); assert.ok(light.mass < base.mass && light.armour < base.armour);
  assert.ok(light.speed > base.speed && gameplayMods(light && PRESETS.find(p => p.id === 'ghost').build).speed > 1, 'a light quad is faster');
  const bare = computeStats({ ...DEFAULT_BUILD, rArm: 'none', lArm: 'none', rShoulder: 'none' }); assert.equal(bare.dps, 0); assert.ok(bare.mass < base.mass);
  assert.equal(computeStats({}).dps, base.dps, 'an empty object is the default build');
});

test('gameplay modifiers: armour cuts damage taken, mass slows you, cooling and heat room follow the torso and back', () => {
  const tank = gameplayMods({ ...DEFAULT_BUILD, legs: 'at9', torso: 'b90', back: 'aegis' });
  assert.ok(tank.damageTaken < 1 && tank.speed < 1 && tank.speed >= .8 && tank.boost < 1);
  const glass = gameplayMods({ ...DEFAULT_BUILD, legs: 'arachne', torso: 'c7', back: 'none' });
  assert.ok(glass.damageTaken > 1 && glass.speed > 1 && glass.damageTaken <= 1.35);
  assert.ok(gameplayMods({ ...DEFAULT_BUILD, torso: 'c7' }).cooling > 1, 'the Cirrus runs cool');
  assert.ok(gameplayMods({ ...DEFAULT_BUILD, torso: 'b90' }).heatGain > 1, 'the Bastion runs hot');
  assert.ok(gameplayMods({ ...DEFAULT_BUILD, back: 'vane' }).cooling > 1, 'radiators add cooling');
  for (let seed = 0; seed < 200; seed++) { let s = seed + 1; const m = gameplayMods(randomBuild(() => (s = (s * 16807) % 2147483647) / 2147483647)); assert.ok(Object.values(m).every(Number.isFinite) && m.speed >= .8 && m.speed <= 1.25); }
});

test('random builds are valid, deterministic for a given generator, and cover the pools', () => {
  const seeded = () => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  assert.deepEqual(randomBuild(seeded()), randomBuild(seeded())); const picked = randomBuild(); assert.ok(sameBuild(picked, sanitizeBuild(picked)));
  const rng = seeded(), seen = new Set(); for (let i = 0; i < 300; i++) seen.add(randomBuild(rng).rArm); assert.equal(seen.size, partsFor('rArm').length);
  assert.equal(randomBuild(() => 0.9999999).legs, POOLS.legs.at(-1).id, 'the top of the range stays in bounds');
});

test('HOW YOU FIRE lists each trigger, and says so when a slot is empty', () => {
  assert.deepEqual(describeFire(DEFAULT_BUILD), [{ key: 'LMB', text: 'MX-9 GATLING' }, { key: 'RMB', text: 'FK-40 FLAK CANNON' }, { key: 'G', text: 'HX-2 HELIX MISSILE' }]);
  const full = describeFire({ ...DEFAULT_BUILD, lShoulder: 'th3', lArm: 'none' });
  assert.equal(full[0].text, 'NO GUN'); assert.equal(full[2].text, 'HX-2 HELIX MISSILE + TH-3 THUMPER MORTAR');
  assert.equal(describeFire({ ...DEFAULT_BUILD, rShoulder: 'none' })[2].text, 'NO SHOULDER MOUNT');
});

test('stat bars and header deltas describe a swap honestly', () => {
  for (const slot of PART_SLOTS) for (const part of partsFor(slot)) { const bars = partBars(slot, part); assert.ok(slot === 'decal' || slot === 'trail' ? bars.length === 0 : bars.length >= (slot === 'head' ? 2 : 3), `${part.name} has bars`); assert.ok(bars.every(b => Number.isFinite(b.value) && b.max > 0 && b.value <= b.max + 1e-9), `${part.name} bars fit`); }
  const d = statDeltas(computeStats(DEFAULT_BUILD), computeStats({ ...DEFAULT_BUILD, torso: 'b90' }));
  assert.ok(d.mass.delta > 0 && d.mass.good === false && d.armour.delta > 0 && d.armour.good === true && d.dps.delta === 0 && d.dps.good === null);
});
