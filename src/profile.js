// Player profile saved in the browser: frame livery, fitted build, unlocked chapters, best results and the shop wallet.
import { DEFAULT_BUILD, sanitizeBuild, ownedBuild } from './parts.js';
import { PAINTS, LIGHTS, paintById, lightsById, liveryFor } from './livery.js';
import { STARTER_IDS, itemById, priceOf, creditsForMatch, itemIdsOfBuild, itemIdsOfLivery, paintItemId, lightsItemId } from './shop-items.js';
// Paints and lights live in livery.js; they are re-exported so existing imports keep working.
export { PAINTS, LIGHTS, paintById, lightsById, liveryFor };
// The economy rules the game calls: prices and the match payout are plain functions of the catalogue.
export { priceOf, creditsForMatch };
// Storage is injectable so the logic can be unit-tested without a browser.
const KEY = 'orbital-breach.profile.v1';

export const STARTING_CREDITS = 300, MAX_CREDITS = 9999999;
const clampCredits = value => Math.max(0, Math.min(MAX_CREDITS, Math.floor(Number(value)) || 0));

const blank = () => ({ v: 2, paint: 'cobalt', lights: 'auto', build: { ...DEFAULT_BUILD }, credits: STARTING_CREDITS, owned: [...STARTER_IDS], unlocked: 0, completed: false, bests: {}, gauntlet: { wave: 0, score: 0 } });

// Loads and repairs a saved profile. Anything corrupt falls back field by field.
//  * A save with no `owned` list is a legacy save from before the shop: it gets the starter kit, 300 credits, and keeps
//    everything its build, paint and lights were already using (grandfathered), so nobody loses a part they were wearing.
//  * Otherwise `owned` is filtered to real item ids, and the build, paint and lights fall back to the factory ones if they
//    name something the save does not own.
export function loadProfile(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return blank();
    const data = JSON.parse(raw);
    const base = blank(), legacy = !Array.isArray(data.owned);
    const paint = PAINTS.some(p => p.id === data.paint) ? data.paint : base.paint, lights = LIGHTS.some(l => l.id === data.lights) ? data.lights : base.lights;
    const wanted = sanitizeBuild(data.build), owned = new Set(STARTER_IDS);
    if (legacy) { for (const id of itemIdsOfBuild(wanted)) owned.add(id); for (const id of itemIdsOfLivery(paint, lights)) owned.add(id); }
    else for (const id of data.owned) if (typeof id === 'string' && itemById(id)) owned.add(id);
    const credits = legacy || !Number.isFinite(Number(data.credits)) ? STARTING_CREDITS : clampCredits(data.credits);
    return {
      ...base,
      paint: owned.has(paintItemId(paint)) ? paint : base.paint,
      lights: owned.has(lightsItemId(lights)) ? lights : base.lights,
      build: ownedBuild(wanted, owned),
      credits,
      owned: [...owned],
      unlocked: Math.max(0, Math.min(2, Number(data.unlocked) || 0)),
      completed: !!data.completed,
      bests: data.bests && typeof data.bests === 'object' ? data.bests : {},
      gauntlet: { wave: Number(data.gauntlet?.wave) || 0, score: Number(data.gauntlet?.score) || 0 },
    };
  } catch {
    return blank();
  }
}

export function saveProfile(profile, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify(profile)); return true; } catch { return false; }
}

// Records a chapter result. Returns { best, improved } where best is the stored record afterwards.
export function recordChapter(profile, chapter, result) {
  const key = String(chapter);
  const previous = profile.bests[key];
  const improved = !previous || result.score > previous.score;
  if (improved) profile.bests[key] = { score: result.score, rank: result.rank, time: Math.round(result.time) };
  profile.unlocked = Math.max(profile.unlocked, Math.min(2, chapter + 1));
  return { best: profile.bests[key], improved, previous };
}

// Records a Gauntlet run. Returns { improved, previous, best } like recordChapter.
export function recordGauntlet(profile, wave, score) {
  const previous = profile.gauntlet.score > 0 ? { ...profile.gauntlet } : null;
  const improved = score > profile.gauntlet.score;
  if (improved) profile.gauntlet = { wave, score };
  return { improved, previous, best: { ...profile.gauntlet } };
}

// ---- Shop wallet ---------------------------------------------------------------------------------------------------
// None of these save: the caller decides when to saveProfile(). They only read and change the in-memory profile.

// Everything this profile may use: the free items plus what it bought.
export const ownedSet = profile => new Set([...STARTER_IDS, ...(Array.isArray(profile?.owned) ? profile.owned : [])]);
export const ownsItem = (profile, id) => !!itemById(id) && (priceOf(id) === 0 || (Array.isArray(profile?.owned) && profile.owned.includes(id)));
export const canAfford = (profile, id) => { const price = priceOf(id); return price !== null && (Number(profile?.credits) || 0) >= price; };
// The build the pilot may actually fit: anything unowned falls back to the factory part in that slot.
export const ownedBuildFor = (profile, build) => ownedBuild(build, ownedSet(profile));

// Adds credits (whole numbers above zero only; anything else is ignored) and returns the new balance.
export function awardCredits(profile, amount) {
  const add = Math.floor(Number(amount));
  profile.credits = clampCredits((Number(profile.credits) || 0) + (Number.isFinite(add) && add > 0 ? add : 0));
  return profile.credits;
}

// Buys one item. { ok: true, reason: 'purchased', item, price, balance } or { ok: false, reason, message, short? }.
// Reasons: 'unknown-item' (not for sale), 'already-owned', 'insufficient-credits' (short = credits missing).
export function purchase(profile, id) {
  const item = itemById(id);
  if (!item) return { ok: false, reason: 'unknown-item', message: 'That item is not for sale.' };
  if (ownsItem(profile, id)) return { ok: false, reason: 'already-owned', message: 'You already own this.' };
  const balance = Number(profile?.credits) || 0;
  if (balance < item.price) return { ok: false, reason: 'insufficient-credits', short: item.price - balance, message: `Need ${item.price - balance} more credits.` };
  profile.credits = clampCredits(balance - item.price);
  profile.owned = [...new Set([...(Array.isArray(profile.owned) ? profile.owned : []), id])];
  return { ok: true, reason: 'purchased', item, price: item.price, balance: profile.credits };
}
