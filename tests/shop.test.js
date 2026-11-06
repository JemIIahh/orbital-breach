import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { simulation } from './support.js';
import { makeMech, makeGun } from '../src/world.js';
import { animateMech } from '../src/animation.js';
import { disposeMech } from '../src/mech-parts.js';
import { PART_SLOTS, GEAR_SLOTS, COSMETIC_SLOTS, DEFAULT_BUILD, PRESETS, partsFor, partById, sanitizeBuild, ownedBuild, lockedSlots, gameplayMods, computeStats, buildName, randomBuild, itemId } from '../src/parts.js';
import { ITEMS, CATEGORIES, TIERS, itemById, itemsIn, STARTER_IDS, itemIdsOfBuild, itemIdsOfLivery, creditsForMatch, PAYOUT } from '../src/shop-items.js';
import { PAINTS, LIGHTS } from '../src/livery.js';
import { loadProfile, saveProfile, awardCredits, ownsItem, canAfford, purchase, priceOf, ownedSet, ownedBuildFor, STARTING_CREDITS, MAX_CREDITS } from '../src/profile.js';

const context = { fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, fillText() {}, createRadialGradient() { return { addColorStop() {} }; } };
globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return context; } }; } };
const storage = (initial = null) => { const store = new Map(initial ? [['orbital-breach.profile.v1', JSON.stringify(initial)]] : []); return { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), raw: () => store.get('orbital-breach.profile.v1') }; };
const fresh = () => loadProfile(storage());

// ---- The catalogue ---------------------------------------------------------------------------------------------------
test('every part, paint and light is for sale at a sane price, and the starter kit is exactly what the default build wears', () => {
  const ids = ITEMS.map(i => i.id); assert.equal(new Set(ids).size, ids.length, 'item ids are unique');
  for (const item of ITEMS) {
    assert.ok(Number.isInteger(item.price) && item.price >= 0 && item.price <= 1200, `${item.id} price ${item.price}`);
    assert.ok(item.name && item.maker && item.blurb && item.tier && TIERS.includes(item.tier), `${item.id} is described and tiered`);
    assert.ok(CATEGORIES.some(c => c.id === item.category), `${item.id} sits in a shop category`);
  }
  // Prices follow the tier ladder: a dearer item never lands in a cheaper tier.
  const sorted = [...ITEMS].sort((a, b) => a.price - b.price); for (let i = 1; i < sorted.length; i++) assert.ok(TIERS.indexOf(sorted[i].tier) >= TIERS.indexOf(sorted[i - 1].tier), 'tiers rise with price');
  const starter = new Set(STARTER_IDS);
  for (const id of [...itemIdsOfBuild(DEFAULT_BUILD), ...itemIdsOfLivery('cobalt', 'auto')]) assert.ok(starter.has(id), `${id} is in the starter kit`);
  for (const id of starter) assert.equal(priceOf(id), 0);
  for (const slot of PART_SLOTS) for (const part of partsFor(slot)) assert.ok(ids.includes(itemId(slot, part.id)), `${slot}/${part.id} is in the shop`);
  assert.equal(priceOf('nonsense'), null); assert.equal(priceOf('__proto__'), null);
  for (const c of CATEGORIES) assert.ok(itemsIn(c.id).length >= 2, `${c.id} has something to browse`);
  assert.ok(ITEMS.some(i => i.price >= 1000) && ITEMS.some(i => i.price > 0 && i.price <= 100), 'the ladder spans cheap to dear');
});

test('the new gear and cosmetics meet the content brief', () => {
  const ids = slot => partsFor(slot).map(p => p.id);
  assert.ok(partsFor('head').length >= 8, 'headgear: the stock visor plus at least seven designs');
  assert.ok(ids('back').filter(id => !['helion', 'vane', 'aegis', 'none'].includes(id)).length >= 3, 'three or more new jetpacks');
  assert.ok(ids('legs').filter(id => !['rj7', 'arachne', 'at9'].includes(id)).length >= 2, 'two or more new legs');
  assert.ok(ids('rArm').filter(id => !['mx9', 'gx6', 'fk40', 'lc7', 'px3', 'mp6', 'hc1', 'none'].includes(id)).length >= 3, 'three or more new arm guns');
  assert.ok(partsFor('decal').length >= 8 && partsFor('trail').length >= 6, 'decals and boost trails');
  assert.equal(partsFor('rArm'), partsFor('lArm'));
  // New shoulder weapons only use the fire kinds the combat code already handles.
  for (const part of [...partsFor('rShoulder'), ...partsFor('rArm')]) if (part.fire && part.fire.kind) assert.ok(['missile', 'gun', 'shell', 'salvo', 'chaff'].includes(part.fire.kind), `${part.id} fire kind ${part.fire.kind}`);
  for (const part of partsFor('rArm')) if (part.fire) for (const key of ['cd', 'damage', 'pellets', 'spread', 'speed', 'life', 'heat', 'shake', 'audio']) assert.ok(key in part.fire, `${part.id} fire.${key}`);
  // Every head has a name, an armour value and a model; only small stat changes.
  for (const head of partsFor('head')) assert.ok(head.model && Number.isFinite(head.armour) && head.armour >= 0 && head.armour <= 100 && head.weight >= 0 && head.weight <= 2, `${head.id} is a believable head`);
});

test('the default build still plays exactly as before: every modifier is one, and heads stay cosmetic', () => {
  assert.deepEqual(gameplayMods(DEFAULT_BUILD), { speed: 1, boost: 1, damageTaken: 1, heatGain: 1, cooling: 1 });
  for (const slot of COSMETIC_SLOTS) for (const part of partsFor(slot)) {
    const mods = gameplayMods({ ...DEFAULT_BUILD, [slot]: part.id });
    for (const [axis, value] of Object.entries(mods)) assert.ok(Number.isFinite(value) && Math.abs(value - 1) <= .1, `${slot}/${part.id} ${axis}=${value} stays within ten percent`);
  }
  for (const slot of PART_SLOTS) for (const part of partsFor(slot)) for (const value of Object.values(gameplayMods({ ...DEFAULT_BUILD, [slot]: part.id }))) assert.ok(Number.isFinite(value) && value > .5 && value < 1.5, `${slot}/${part.id}`);
  const stock = computeStats(DEFAULT_BUILD); assert.equal(stock.armour, 2320); assert.equal(stock.dps, 420);
});

test('sanitizeBuild handles the head, decal and trail slots and never lets a hostile id through', () => {
  const clean = sanitizeBuild({ head: 'crown', decal: 'skull', trail: 'ember', rArm: 'rg5' });
  assert.equal(clean.head, 'crown'); assert.equal(clean.decal, 'skull'); assert.equal(clean.trail, 'ember'); assert.equal(clean.rArm, 'rg5');
  const bad = sanitizeBuild({ head: '__proto__', decal: 7, trail: ['ion'], legs: 'constructor', back: { toString() { return 'wing'; } } });
  assert.deepEqual(bad, DEFAULT_BUILD);
  for (const slot of PART_SLOTS) assert.ok(partById(slot, DEFAULT_BUILD[slot]), `${slot} default exists`);
  assert.deepEqual(sanitizeBuild(sanitizeBuild({ head: 'halo', decal: 'star' })), sanitizeBuild({ head: 'halo', decal: 'star' }), 'idempotent');
});

test('presets name the gear only: a head, decal or trail never turns a preset into a custom build', () => {
  assert.deepEqual(GEAR_SLOTS.concat(COSMETIC_SLOTS).sort(), PART_SLOTS.slice().sort());
  for (const preset of PRESETS) assert.equal(buildName({ ...preset.build, head: 'crown', decal: 'eye', trail: 'plasma' }), preset.name);
  assert.equal(buildName({ ...DEFAULT_BUILD, torso: 'b90' }), 'CUSTOM BUILD');
});

// ---- Money -----------------------------------------------------------------------------------------------------------
test('a new pilot starts with 300 credits and the starter kit, and purchases follow the rules', () => {
  const profile = fresh();
  assert.equal(profile.credits, STARTING_CREDITS); assert.equal(STARTING_CREDITS, 300);
  assert.deepEqual(new Set(profile.owned), new Set(STARTER_IDS));
  assert.equal(ownsItem(profile, 'arm:mx9'), true); assert.equal(ownsItem(profile, 'arm:rg5'), false); assert.equal(ownsItem(profile, 'nope'), false);
  assert.equal(canAfford(profile, 'head:recon'), true); assert.equal(canAfford(profile, 'head:crown'), false); assert.equal(canAfford(profile, 'nope'), false);

  const poor = purchase(profile, 'head:crown');
  assert.equal(poor.ok, false); assert.equal(poor.reason, 'insufficient-credits'); assert.equal(poor.short, 900);
  assert.equal(profile.credits, 300); assert.equal(ownsItem(profile, 'head:crown'), false, 'a failed purchase changes nothing');

  const bought = purchase(profile, 'head:recon');
  assert.equal(bought.ok, true); assert.equal(bought.price, priceOf('head:recon')); assert.equal(profile.credits, 300 - priceOf('head:recon')); assert.equal(bought.balance, profile.credits);
  assert.equal(ownsItem(profile, 'head:recon'), true);

  const again = purchase(profile, 'head:recon'); assert.equal(again.ok, false); assert.equal(again.reason, 'already-owned'); assert.equal(profile.credits, 300 - priceOf('head:recon'), 'no double charge');
  assert.equal(purchase(profile, 'arm:mx9').reason, 'already-owned', 'starter gear is owned from the start');
  assert.equal(purchase(profile, 'made:up').reason, 'unknown-item'); assert.equal(purchase(profile, undefined).reason, 'unknown-item'); assert.equal(purchase(null, 'head:recon').ok, false === false ? false : true);
  assert.equal(profile.owned.filter(id => id === 'head:recon').length, 1);

  // Spending exactly everything is allowed and leaves nothing negative.
  const exact = fresh(); awardCredits(exact, priceOf('arm:rg5') - 300); assert.equal(exact.credits, priceOf('arm:rg5'));
  assert.equal(purchase(exact, 'arm:rg5').ok, true); assert.equal(exact.credits, 0);
  assert.equal(ownsItem(exact, 'arm:rg5'), true);
  // Paints and lights are items too.
  const painter = fresh(); assert.equal(purchase(painter, 'paint:ember').ok, true); assert.equal(purchase(painter, 'lights:cyan').ok, true);
  assert.equal(painter.credits, 300 - priceOf('paint:ember') - priceOf('lights:cyan'));
});

test('awardCredits only ever adds whole, positive amounts, returns the balance and saves nothing', () => {
  const calls = []; const store = { getItem() { return null; }, setItem(...args) { calls.push(args); } };
  const profile = loadProfile(store); assert.equal(awardCredits(profile, 120), 420); assert.equal(profile.credits, 420);
  assert.equal(awardCredits(profile, 10.9), 430, 'fractions round down');
  for (const bad of [0, -50, NaN, Infinity, 'abc', null, undefined, {}, [], -0.5]) assert.equal(awardCredits(profile, bad), 430, `ignores ${String(bad)}`);
  assert.equal(awardCredits(profile, '70'), 500, 'numeric strings count');
  assert.equal(awardCredits(profile, MAX_CREDITS * 4), MAX_CREDITS, 'the wallet has a ceiling'); assert.equal(calls.length, 0, 'awardCredits never touches storage');
  assert.equal(awardCredits({}, 5), 5, 'a profile with no wallet starts from zero');
});

test('creditsForMatch is documented, never negative, capped, and never pays less for doing better', () => {
  assert.equal(creditsForMatch({ kills: 12, won: true, score: 4500 }), 90 + 72 + 90, 'the worked example from the documentation');
  assert.equal(creditsForMatch({ kills: 40, score: 12000, mode: 'gauntlet' }), 30 + 240 + 240);
  assert.equal(creditsForMatch({ kills: 99, won: true, score: 1e9, mode: 'campaign' }) <= PAYOUT.max, true); assert.equal(creditsForMatch({ kills: 1e6, assists: 1e6, won: true, score: 1e12 }), PAYOUT.max);
  assert.equal(creditsForMatch({ kills: 50, won: true, score: 9000, mode: 'training' }), 0, 'training pays nothing');
  assert.equal(creditsForMatch(), 30, 'showing up pays a little'); assert.equal(creditsForMatch({ kills: -5, assists: NaN, score: 'x' }), 30, 'garbage counts as zero');
  const base = { kills: 0, assists: 0, won: false, score: 0, mode: 'campaign' }; let last = creditsForMatch(base);
  for (const key of ['kills', 'assists', 'score']) { let prev = creditsForMatch(base); for (const v of [0, 1, 2, 5, 9, 17, 40, 80, 120, 500, 5000, 30000, 1e6]) { const pay = creditsForMatch({ ...base, [key]: v }); assert.ok(pay >= prev, `${key}=${v} pays ${pay} >= ${prev}`); prev = pay; } }
  assert.ok(creditsForMatch({ ...base, won: true }) > creditsForMatch(base), 'winning pays more');
  for (let i = 0; i < 400; i++) { const a = { kills: i % 37, assists: i % 11, score: i * 61, won: i % 2 === 0 }, b = { ...a, kills: a.kills + 1, score: a.score + 50 }; assert.ok(creditsForMatch(b) >= creditsForMatch(a)); last = creditsForMatch(a); assert.ok(Number.isInteger(last) && last >= 0); }
});

// ---- Saves -----------------------------------------------------------------------------------------------------------
test('a save from before the shop is grandfathered: it keeps what it was wearing and gets the starting wallet', () => {
  const legacy = { v: 1, paint: 'obsidian', lights: 'magenta', build: { legs: 'arachne', torso: 'b90', back: 'aegis', rArm: 'px3', lArm: 'gx6', rShoulder: 'th3', lShoulder: 'sr6' }, unlocked: 2, completed: true, bests: { 0: { score: 900, rank: 'B', time: 200 } }, gauntlet: { wave: 4, score: 1200 } };
  const profile = loadProfile(storage(legacy));
  assert.equal(profile.credits, 300); assert.equal(profile.paint, 'obsidian'); assert.equal(profile.lights, 'magenta');
  assert.deepEqual(profile.build, { ...DEFAULT_BUILD, ...legacy.build }, 'nothing it was wearing is taken away');
  for (const id of ['legs:arachne', 'torso:b90', 'back:aegis', 'arm:px3', 'arm:gx6', 'shoulder:th3', 'shoulder:sr6', 'paint:obsidian', 'lights:magenta']) assert.equal(ownsItem(profile, id), true, id);
  assert.equal(ownsItem(profile, 'arm:rg5'), false, 'but not the whole shop');
  assert.equal(profile.unlocked, 2); assert.equal(profile.completed, true); assert.equal(profile.bests[0].score, 900); assert.equal(profile.gauntlet.wave, 4);
  assert.deepEqual(ownedBuildFor(profile, profile.build), profile.build);
  // Nothing about the old shape needs a version bump to load again.
  saveProfile(profile, storage()); assert.deepEqual(loadProfile(storage(JSON.parse(JSON.stringify(profile)))).owned.sort(), profile.owned.slice().sort());
});

test('a save that already has a wallet is trusted for credits and ownership, but never for parts it does not own', () => {
  const save = { v: 2, credits: 777, owned: ['head:recon', 'arm:px3', 'bogus', 42, null, 'paint:ember'], paint: 'ember', lights: 'magenta', build: { head: 'recon', rArm: 'px3', lArm: 'rg5', legs: 'hover' } };
  const profile = loadProfile(storage(save));
  assert.equal(profile.credits, 777); assert.ok(!profile.owned.includes('bogus')); assert.ok(profile.owned.every(id => itemById(id)), 'only real item ids survive');
  assert.equal(profile.build.head, 'recon'); assert.equal(profile.build.rArm, 'px3'); assert.equal(profile.build.lArm, 'mx9', 'an unowned gun falls back to the factory gun'); assert.equal(profile.build.legs, 'rj7');
  assert.equal(profile.paint, 'ember'); assert.equal(profile.lights, 'auto', 'unowned lights fall back');
});

test('corrupt saves load as a clean new profile or repair field by field', () => {
  for (const raw of ['{not json', 'null', '[]', '"x"', '7', '']) {
    const store = { getItem: () => raw, setItem() {} }; const profile = loadProfile(store);
    assert.equal(profile.credits, 300); assert.deepEqual(profile.build, DEFAULT_BUILD); assert.deepEqual(new Set(profile.owned), new Set(STARTER_IDS), `raw ${raw}`);
  }
  for (const credits of [-40, NaN, 'lots', null, 1e99, {}]) { const p = loadProfile(storage({ v: 2, credits, owned: [] })); assert.ok(Number.isInteger(p.credits) && p.credits >= 0 && p.credits <= MAX_CREDITS, `credits ${String(credits)} -> ${p.credits}`); }
  const hostile = loadProfile(storage({ owned: 'everything', credits: 99999, build: { head: '__proto__', rArm: { x: 1 } }, paint: 'gold', lights: 7 }));
  assert.equal(hostile.credits, 300, 'a non-array owned list is treated as a legacy save'); assert.deepEqual(hostile.build, DEFAULT_BUILD); assert.equal(hostile.paint, 'cobalt'); assert.equal(hostile.lights, 'auto');
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }; assert.equal(loadProfile(throwing).credits, 300); assert.equal(saveProfile(fresh(), throwing), false);
  const stored = storage(); const p = fresh(); purchase(p, 'head:recon'); assert.equal(saveProfile(p, stored), true); assert.equal(loadProfile(stored).owned.includes('head:recon'), true, 'purchases persist');
});

// ---- Ownership -------------------------------------------------------------------------------------------------------
test('ownedBuild falls back to the factory part slot by slot, and is idempotent', () => {
  const wish = { head: 'crown', legs: 'hover', torso: 'b90', back: 'phoenix', rArm: 'rg5', lArm: 'mx9', rShoulder: 'hw1', lShoulder: 'hr4', decal: 'skull', trail: 'pulse' };
  assert.deepEqual(ownedBuild(wish, new Set()), DEFAULT_BUILD, 'nothing owned: the factory build, with the starter lArm kept');
  const some = new Set([itemId('head', 'crown'), itemId('rArm', 'rg5'), itemId('trail', 'pulse')]);
  const got = ownedBuild(wish, some);
  assert.equal(got.head, 'crown'); assert.equal(got.rArm, 'rg5'); assert.equal(got.trail, 'pulse'); assert.equal(got.legs, 'rj7'); assert.equal(got.decal, 'none'); assert.equal(got.lShoulder, 'none'); assert.equal(got.rShoulder, 'hx2');
  assert.deepEqual(ownedBuild(got, some), got, 'idempotent');
  assert.deepEqual(lockedSlots(wish, some).sort(), ['back', 'decal', 'lShoulder', 'legs', 'rShoulder', 'torso'].sort());
  assert.deepEqual(lockedSlots(DEFAULT_BUILD, new Set()), []);
  assert.deepEqual(ownedBuild(undefined, undefined), DEFAULT_BUILD); assert.deepEqual(ownedBuild('junk', ['arm:rg5']), DEFAULT_BUILD); assert.deepEqual(ownedBuild({ lArm: 'rg5' }, ['arm:rg5']).lArm, 'rg5', 'one arm purchase covers both arms');
  assert.deepEqual(ownedBuild({ rArm: 'rg5', lArm: 'rg5' }, ['arm:rg5']), { ...DEFAULT_BUILD, rArm: 'rg5', lArm: 'rg5' }, 'and the same gun can ride on both');
  assert.deepEqual(ownedBuild({ rShoulder: 'hr4', lShoulder: 'hr4' }, new Set(['shoulder:hr4'])), { ...DEFAULT_BUILD, rShoulder: 'hr4', lShoulder: 'hr4' });
  assert.deepEqual(ownedBuild(wish, new Set(PART_SLOTS.flatMap(slot => partsFor(slot).map(p => itemId(slot, p.id))))), sanitizeBuild(wish), 'owning everything lets everything through');
  for (let i = 0; i < 60; i++) { const owned = new Set(ITEMS.filter(() => Math.random() < .5).map(x => x.id)), build = randomBuild(Math.random, owned); assert.deepEqual(lockedSlots(build, owned), [], 'random builds only use owned parts'); }
});

test('the game fits only what the pilot owns: an unowned fit falls back to factory parts per slot', () => {
  globalThis.localStorage = storage(); const run = fn => { try { fn(); } finally { delete globalThis.localStorage; } };
  run(() => {
    const game = simulation(); game.applyBuild(DEFAULT_BUILD); game.profile = fresh();
    game.fitBuild({ ...DEFAULT_BUILD, head: 'crown', rArm: 'rg5', legs: 'hover', trail: 'pulse', torso: 'c7' });
    assert.deepEqual(game.profile.build, DEFAULT_BUILD, 'the saved build only holds owned parts'); assert.deepEqual(game.build, DEFAULT_BUILD, 'and so does the build in play');
    assert.equal(game.mods.speed, 1);
    awardCredits(game.profile, 2000); assert.equal(purchase(game.profile, 'head:crown').ok, true); assert.equal(purchase(game.profile, 'arm:rg5').ok, true);
    game.fitBuild({ ...DEFAULT_BUILD, head: 'crown', rArm: 'rg5', legs: 'hover' });
    assert.equal(game.build.head, 'crown'); assert.equal(game.build.rArm, 'rg5'); assert.equal(game.build.legs, 'rj7', 'the hover skirt is still not owned');
    assert.equal(game.armParts[1].id, 'rg5', 'the bought gun is the one that fires');
    game.fitBuild({ ...DEFAULT_BUILD, rArm: 'nonsense', head: '__proto__' }); assert.deepEqual(game.build, DEFAULT_BUILD, 'junk is repaired, not fitted');
    // Hostile ownership data in the profile object itself cannot buy anything.
    game.profile.owned = 'everything'; game.fitBuild({ ...DEFAULT_BUILD, legs: 'hover' }); assert.equal(game.build.legs, 'rj7');
  });
});

test('the game banks match credits through awardCredits and treats the shop as a modal screen', () => {
  const game = simulation(); game.profile = fresh();
  const chapter = { score: 4500, stats: { kills: 12 } }; game.payOut(chapter, true, 'campaign');
  assert.equal(chapter.credits, 252); assert.equal(chapter.balance, 552); assert.equal(game.profile.credits, 552);
  const run = { score: 1000, stats: { kills: 3 } }; game.payOut(run, false, 'gauntlet'); assert.equal(run.credits, 30 + 18 + 20); assert.equal(game.profile.credits, 552 + 68);
  const drill = { score: 900, stats: { kills: 4 } }; game.payOut(drill, true, 'training'); assert.equal(drill.credits, 0, 'the guided flight pays nothing');
  assert.equal(game.modalOpen, false); game.shopOpen = true; assert.equal(game.modalOpen, true, 'the shop pauses play like the Field Refit');
  game.shopOpen = false; game.loadoutOpen = true; assert.equal(game.modalOpen, true);
});

// ---- Geometry --------------------------------------------------------------------------------------------------------
const signature = group => { const box = new T.Box3().setFromObject(group); let meshes = 0, verts = 0; group.traverse(o => { if (o.geometry) { meshes++; verts += o.geometry.attributes.position.count; } }); return { meshes, verts, box: [...box.min.toArray(), ...box.max.toArray()].map(v => Math.round(v * 1e4) / 1e4) }; };
const check = group => { let meshes = 0; group.traverse(o => { assert.ok(o.position.toArray().every(Number.isFinite) && o.scale.toArray().every(Number.isFinite) && o.rotation.toArray().slice(0, 3).every(Number.isFinite), `${o.name || o.type} transform is finite`); if (o.geometry) { meshes++; const p = o.geometry.attributes.position.array; assert.ok(p.every(Number.isFinite), 'finite vertices'); } }); return meshes; };
const NEW = {
  head: ['recon', 'crest', 'dome', 'cyclops', 'warmask', 'halo', 'fin', 'crown'], back: ['ring', 'turbine', 'wing', 'phoenix'], legs: ['tread', 'sprint', 'hover'],
  rArm: ['bc4', 'sc9', 'pl2', 'rg5'], rShoulder: ['hr4', 'pd2', 'hw1'], decal: partsFor('decal').filter(p => p.id !== 'none').map(p => p.id), trail: partsFor('trail').filter(p => p.id !== 'auto').map(p => p.id),
};

test('every new model builds without NaN, animates, and disposes cleanly', () => {
  let built = 0;
  for (const [slot, list] of Object.entries(NEW)) for (const id of list) {
    assert.ok(partById(slot, id), `${slot}/${id} exists`);
    const mech = makeMech('blue', 1, 'gunner', { ...DEFAULT_BUILD, [slot]: id });
    assert.ok(check(mech.group) > 20, `${slot}/${id} builds a real mech`);
    for (let i = 0; i < 40; i++) animateMech(mech, { dt: 1 / 60, time: i / 60, speed: 11, strafe: 1, aimPitch: .1, airborne: i > 20, boost: i % 20 < 10, recoil: i % 9 ? 0 : 1 });
    check(mech.group);
    const geometries = new Set(), materials = new Set(); mech.group.traverse(o => { if (o.geometry) geometries.add(o.geometry); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => materials.add(x)); });
    let disposed = 0; for (const g of geometries) if (!g.userData.shared) g.addEventListener('dispose', () => disposed++); for (const m of materials) m.addEventListener('dispose', () => disposed++);
    const owned = [...geometries].filter(g => !g.userData.shared).length + materials.size;
    assert.doesNotThrow(() => disposeMech(mech.group, true), `${slot}/${id} disposes`); assert.equal(disposed, owned, `${slot}/${id} frees every geometry and material it owns`);
    assert.equal(mech.group.children.length, 0); built++;
  }
  assert.ok(built >= 20);
});

test('every arm gun has its own silhouette and a usable muzzle; every new shoulder pod builds', () => {
  const muzzles = new Map();
  for (const part of partsFor('rArm')) {
    if (!part.fire) continue;
    const gun = makeGun(part.model); check(gun);
    const box = new T.Box3().setFromObject(gun), size = box.getSize(new T.Vector3()); assert.ok(size.x > 0 && size.y > 0 && size.z > 0.5, `${part.id} has bulk`);
    const muzzle = gun.userData.muzzle; // the stock guns predate the muzzle record; every new gun must have one
    if (NEW.rArm.includes(part.id)) assert.ok(Number.isFinite(muzzle) && muzzle < -.5, `${part.id} has a muzzle (a z offset out along the barrel, which is where the flash and bullets start)`);
    const key = (Number.isFinite(muzzle) ? muzzle.toFixed(2) : '-') + '|' + size.toArray().map(v => v.toFixed(2)).join(',');
    if (NEW.rArm.includes(part.id)) assert.ok(!muzzles.has(key), `${part.id} looks different from ${muzzles.get(key)}`);
    muzzles.set(key, part.id); disposeMech(gun, true);
  }
  for (const id of NEW.rShoulder) for (const slot of ['rShoulder', 'lShoulder']) { const mech = makeMech('red', 1, 'gunner', { ...DEFAULT_BUILD, [slot]: id }); assert.ok(mech.limbs.rightShoulderPod || mech.limbs.leftShoulderPod, `${id} mounts on ${slot}`); disposeMech(mech.group, true); }
});

test('the default mech is untouched by the new gear code', () => {
  // No build passed: exactly the original mech, built the same way every time.
  assert.deepEqual(signature(makeMech('blue').group), signature(makeMech('blue', 1, 'gunner', null).group));
  assert.deepEqual(signature(makeMech('red', 1, 'archon').group), signature(makeMech('red', 1, 'archon', undefined).group));
  assert.equal(makeMech('blue').group.userData.build, undefined, 'no build, no build record');
  // The default cosmetics (stock visor, no decal, auto trail) add nothing and recolour nothing.
  const base = makeMech('blue', 1, 'gunner', DEFAULT_BUILD), explicit = makeMech('blue', 1, 'gunner', { ...DEFAULT_BUILD, head: 'visor', decal: 'none', trail: 'auto' });
  assert.deepEqual(signature(explicit.group), signature(base.group));
  assert.equal(base.limbs.leftJet.material.type, makeMech('blue').limbs.leftJet.material.type, 'the auto trail leaves the flame as it was');
  // ...while a chosen cosmetic really changes the mech.
  const crowned = signature(makeMech('blue', 1, 'gunner', { ...DEFAULT_BUILD, head: 'crown' }).group); assert.ok(crowned.meshes > signature(base.group).meshes, 'a new head adds geometry');
  const decal = signature(makeMech('blue', 1, 'gunner', { ...DEFAULT_BUILD, decal: 'skull' }).group); assert.ok(decal.meshes > signature(base.group).meshes, 'a decal adds geometry');
  const ember = makeMech('blue', 1, 'gunner', { ...DEFAULT_BUILD, trail: 'ember' }); assert.notEqual(ember.limbs.leftJet.material.type, base.limbs.leftJet.material.type, 'a boost trail recolours the flame');
});

test('the shop catalogue and the world agree on counts the other systems rely on', () => {
  assert.equal(ITEMS.length, new Set(ITEMS.map(i => i.id)).size);
  assert.equal(PAINTS.length, ITEMS.filter(i => i.kind === 'paint').length); assert.equal(LIGHTS.length, ITEMS.filter(i => i.kind === 'lights').length);
  const have = ownedSet({ owned: [] }); for (const id of STARTER_IDS) assert.ok(have.has(id));
});
