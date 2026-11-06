// The Gear Shop catalogue: every purchasable item, its price and category, and the payout rule for a finished match.
// Pure data and maths (no DOM, no Three.js, no profile), so prices, tiers and payouts are unit-testable.
import { POOLS, PART_SLOTS, itemId, itemGroup, partById, sanitizeBuild, SLOT_TITLES } from './parts.js';
import { PAINTS, LIGHTS } from './livery.js';

// Shop tabs, in the order they appear. `groups` are the item groups a tab lists.
export const CATEGORIES = [
  { id: 'head', short: 'HEADGEAR', label: 'HEADGEAR', title: 'Headgear', groups: ['head'], slots: ['head'], note: 'Helmets, antennas and crests. Mostly looks; the heavy ones add a little plate.' },
  { id: 'legs', short: 'LEGS', label: 'LEGS', title: 'Legs', groups: ['legs'], slots: ['legs'], note: 'Leg frames set your speed and how hard you are to hurt.' },
  { id: 'back', short: 'JETPACKS', label: 'JETPACKS', title: 'Jetpacks', groups: ['back'], slots: ['back'], note: 'Back mounts set boost, cooling and the shape of your silhouette.' },
  { id: 'arm', short: 'ARM GUNS', label: 'ARM GUNS', title: 'Arm guns', groups: ['arm'], slots: ['rArm', 'lArm'], note: 'Any arm gun fits either arm. Buy once, mount twice.' },
  { id: 'shoulder', short: 'SHOULDER', label: 'SHOULDER WEAPONS', title: 'Shoulder weapons', groups: ['shoulder'], slots: ['rShoulder', 'lShoulder'], note: 'Fired together on G. Any shoulder weapon fits either side.' },
  { id: 'torso', short: 'TORSOS', label: 'TORSOS', title: 'Torsos', groups: ['torso'], slots: ['torso'], note: 'The chassis sets your armour, heat room and cooling.' },
  { id: 'paint', short: 'PAINT & LIGHTS', label: 'PAINT & LIGHTS', title: 'Paint & lights', groups: ['paint', 'lights'], slots: [], note: 'Paint colours the hull and plates. Lights colour the visor and thrusters.' },
  { id: 'decal', short: 'DECALS', label: 'DECALS', title: 'Decals', groups: ['decal'], slots: ['decal'], note: 'Emblems and markings for the shoulders and chest.' },
  { id: 'trail', short: 'TRAILS', label: 'BOOST TRAILS', title: 'Boost trails', groups: ['trail'], slots: ['trail'], note: 'The colour of the flame when you boost or fly.' },
];
export const categoryById = id => CATEGORIES.find(c => c.id === id) || null;

// Price bands. A tier is only a label: the price on the item is what you pay.
export const TIERS = [
  { id: 'starter', label: 'STARTER', max: 0 }, { id: 'common', label: 'COMMON', max: 150 }, { id: 'field', label: 'FIELD GRADE', max: 350 },
  { id: 'elite', label: 'ELITE', max: 650 }, { id: 'prototype', label: 'PROTOTYPE', max: 1000 }, { id: 'legend', label: 'LEGENDARY', max: Infinity },
];
export const tierOf = price => TIERS.find(t => price <= t.max);

const items = [], byId = new Map();
function add(item) { item.tier = tierOf(item.price); items.push(item); byId.set(item.id, item); }
// One item per part. Both arms share a pool and so do both shoulders, so only the first slot of each group is walked.
for (const slot of PART_SLOTS) {
  const group = itemGroup(slot);
  if (slot === 'lArm' || slot === 'lShoulder') continue;
  const category = CATEGORIES.find(c => c.groups.includes(group));
  for (const part of POOLS[slot]) {
    add({ id: itemId(slot, part.id), group, category: category.id, slot, ref: part.id, kind: 'part', name: part.name, maker: part.maker, role: part.role, tag: part.tag, blurb: part.blurb, price: part.price, part, empty: part.model === 'none' });
  }
}
for (const paint of PAINTS) add({ id: `paint:${paint.id}`, group: 'paint', category: 'paint', slot: null, ref: paint.id, kind: 'paint', name: paint.name, maker: 'KESSLER FINISHING', role: 'PAINT', tag: paint.tag, blurb: paint.blurb, price: paint.price, paint, empty: false });
for (const light of LIGHTS) add({ id: `lights:${light.id}`, group: 'lights', category: 'paint', slot: null, ref: light.id, kind: 'lights', name: light.name, maker: 'ASTER LIGHTING', role: 'LIGHTS', tag: light.tag, blurb: light.blurb, price: light.price, light, empty: false });

export const ITEMS = items;
export const itemById = id => byId.get(id) || null;
export const itemsIn = categoryId => items.filter(i => i.category === categoryId);
export const itemFor = (slot, partId) => byId.get(itemId(slot, partId)) || null;
export const paintItemId = id => `paint:${id}`;
export const lightsItemId = id => `lights:${id}`;

// Price in credits, or null for something that is not for sale.
export const priceOf = id => byId.get(id)?.price ?? null;
// Everything that costs nothing: the factory kit and the empty mounts.
export const STARTER_IDS = items.filter(i => i.price === 0).map(i => i.id);

// The item ids a build (and optionally a paint and lights) use. Used to grandfather what a legacy save was already wearing.
export function itemIdsOfBuild(build) {
  const clean = sanitizeBuild(build);
  return PART_SLOTS.map(slot => itemId(slot, partById(slot, clean[slot]).id));
}
export const itemIdsOfLivery = (paint, lights) => [paintItemId(paint), lightsItemId(lights)].filter(id => byId.has(id));

// ---- Payouts ---------------------------------------------------------------------------------------------------
// Credits earned for one finished match (a chapter, or a Gauntlet run):
//   30 for turning up (90 if the objective was completed / the chapter won)
//   + 6 per kill (first 80 count) + 3 per assist (first 80 count) + 1 per 50 points of score (first 20,000)
// then scaled by mode: 'training' pays nothing, every other mode pays in full. Rounded down, capped at 1,200.
// Examples: a won chapter with 12 kills and 4,500 points pays 90 + 72 + 90 = 252; a Gauntlet run with 40 kills and 12,000 pays 30 + 240 + 240 = 510.
// Every term is non-decreasing in kills, assists, score and won, so doing better can never pay less.
export const PAYOUT = { turnUp: 30, win: 60, kill: 6, assist: 3, perScore: 50, killCap: 80, assistCap: 80, scoreCap: 20000, max: 1200 };
export function creditsForMatch({ kills = 0, assists = 0, won = false, score = 0, mode = 'campaign' } = {}) {
  const n = v => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0), P = PAYOUT;
  if (mode === 'training') return 0;
  const raw = P.turnUp + (won ? P.win : 0) + Math.min(P.killCap, Math.floor(n(kills))) * P.kill + Math.min(P.assistCap, Math.floor(n(assists))) * P.assist + Math.floor(Math.min(P.scoreCap, n(score)) / P.perScore);
  return Math.min(P.max, Math.floor(raw));
}

// Short human description of a slot for shop messages ("R ARM", "headgear").
export const slotTitle = slot => SLOT_TITLES[slot] || slot;
