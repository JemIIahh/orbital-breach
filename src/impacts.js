// Bullet impact realism: what a round hit decides what flies off, what it leaves behind and how it sounds.
//
// Every world hit used to be the same five cyan sparks and no sound, so a tree, a wall and the ground were
// indistinguishable. This module keeps the decisions pure (no rendering) so they can be tested: it names the material
// from the raycast hit, then plans the debris, dust, sparks, scorch mark, ricochet and sound for that material, the
// angle the round came in at and how hard it hit. Effects.impact() in effects.js draws the plan.
import * as T from 'three';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// debris: chip colours · dust: puff colour (null = none) · chips/puffs/sparks: counts at power 1 · hard: can ricochet
// decal: scorch colour and size in metres (null = leaves no mark) · sound: AudioEngine kind
export const MATERIALS = {
  dirt: { debris: ['#5a4630', '#7a6244', '#4a3a28'], dust: '#8c7757', chips: 7, puffs: 2, sparks: 2, decal: { color: '#16110c', size: .34 }, sound: 'impactDirt', hard: false },
  wood: { debris: ['#6a5238', '#a58558', '#3f3023'], dust: '#8b7a5c', chips: 9, puffs: 1, sparks: 3, decal: { color: '#0f0a06', size: .26 }, sound: 'impactWood', hard: false },
  stone: { debris: ['#8d887c', '#5f5b53', '#aaa392'], dust: '#a39e92', chips: 8, puffs: 2, sparks: 6, decal: { color: '#14151a', size: .3 }, sound: 'impactStone', hard: true },
  metal: { debris: ['#9aa4ac', '#6c818b'], dust: null, chips: 3, puffs: 0, sparks: 12, decal: { color: '#0b0d11', size: .28 }, sound: 'impactMetal', hard: true },
  glass: { debris: ['#d9ffff', '#b5dce3'], dust: null, chips: 6, puffs: 0, sparks: 4, decal: null, sound: 'impactGlass', hard: true },
  water: { debris: ['#cfe9f2', '#9fd3e6'], dust: '#cfe9f2', chips: 12, puffs: 1, sparks: 0, decal: null, sound: 'impactWater', hard: false },
  armor: { debris: ['#9aa4ac', '#6c818b'], dust: null, chips: 3, puffs: 0, sparks: 9, decal: null, sound: 'impactMetal', hard: true },
};

// Eden's solids: living wood, old-world metal, everything else stone.
const WOOD = new Set(['tree', 'log', 'stump', 'heart-tree']);
const METAL = new Set(['barrel', 'mast', 'pod', 'pylon', 'solar']);

// Name the material of a raycast hit ({surface, kind}) from any realm.
export function materialOf(hit) {
  if (!hit) return 'metal';
  switch (hit.surface) {
    case 'terrain': return hit.kind === 'water' ? 'water' : hit.kind === 'pavement' ? 'stone' : 'dirt';
    case 'tree': return WOOD.has(hit.kind) ? 'wood' : METAL.has(hit.kind) ? 'metal' : 'stone';
    case 'building': return hit.kind==='vehicle'||hit.kind==='metal'?'metal':hit.kind==='wood'?'wood':'stone';
    case 'window': return 'glass';
    default: return 'metal'; // hull, roof, frame, exterior-solid and station cover are all plating
  }
}

// Mirror `dir` about `normal` (both unit): where a glancing round goes next.
export function reflect(dir, normal, out = new T.Vector3()) {
  return out.copy(dir).addScaledVector(normal, -2 * dir.dot(normal));
}

export const RICOCHET_COSINE = .3; // rounds arriving within ~17 degrees of the surface skip off hard materials

// Decide everything one impact needs. `dir` is the round's travel direction (any length), `normal` the surface normal
// (it is flipped to face the shooter if needed). `power` is roughly damage / 20. Deterministic for a given rng.
export function planImpact(material, normal, dir, { power = 1, rng = Math.random } = {}) {
  const prof = MATERIALS[material] || MATERIALS.metal;
  const d = dir && (dir.x || dir.y || dir.z) ? new T.Vector3().copy(dir).normalize() : new T.Vector3(0, -1, 0);
  const n = normal && (normal.x || normal.y || normal.z) ? new T.Vector3().copy(normal).normalize() : d.clone().negate(); // station hits give plain {x,y,z}
  if (n.dot(d) > 0) n.negate();                     // always face the incoming round
  const cosIn = clamp(-d.dot(n), 0, 1);             // 1 = head on, 0 = skimming
  const scale = clamp(.55 + power * .45, .55, 2.4);
  const head = .55 + .45 * cosIn;                   // glancing hits throw less debris
  const ricochet = prof.hard && cosIn < RICOCHET_COSINE && rng() < .85;
  const count = base => Math.max(0, Math.round(base * scale * head));
  return {
    material, normal: n, ricochet,
    reflected: ricochet ? reflect(d, n) : null,
    chips: count(prof.chips), puffs: prof.dust ? Math.max(1, Math.round(prof.puffs * scale * head)) : 0, sparks: count(prof.sparks) + (ricochet ? 4 : 0),
    debris: prof.debris, dust: prof.dust, hard: prof.hard,
    decal: prof.decal && cosIn > .12 ? { color: prof.decal.color, size: prof.decal.size * clamp(scale, .7, 1.7) * (1.15 - .3 * cosIn) } : null,
    sound: ricochet ? 'ricochet' : prof.sound, loudness: clamp(.45 + scale * .3, .45, 1),
  };
}

// How an arm gun looks and sounds when it fires, by model. casing: 'bullet' | 'shell' | null (energy weapons eject nothing).
const MUZZLES = {
  gatling: { flash: '#ffd9a0', size: .7, casing: 'bullet', smoke: false }, buzzsaw: { flash: '#ffd9a0', size: .55, casing: 'bullet', smoke: false },
  carbine: { flash: '#ffd9a0', size: .6, casing: 'bullet', smoke: false }, stitcher: { flash: '#ffe6b8', size: .75, casing: 'bullet', smoke: false },
  rotary: { flash: '#ffd9a0', size: .6, casing: 'bullet', smoke: false }, phalanx: { flash: '#ffd9a0', size: .6, casing: 'bullet', smoke: false },
  flak: { flash: '#ffb070', size: 1.1, casing: 'shell', smoke: true }, cutter: { flash: '#ffb070', size: .9, casing: 'shell', smoke: true },
  thunder: { flash: '#ff9a5a', size: 1.5, casing: 'shell', smoke: true }, pod: { flash: '#ffb070', size: .9, casing: null, smoke: true },
  coil: { flash: '#9fe9ff', size: .8, casing: null, smoke: false }, lance: { flash: '#d6a8ff', size: 1, casing: null, smoke: false },
  railgun: { flash: '#bff4ff', size: 1.6, casing: null, smoke: true },
};
export const muzzleStyle = model => MUZZLES[model] || { flash: '#ffd9a0', size: .7, casing: 'bullet', smoke: false };

// How loud and from where: distance falloff and stereo pan for a world sound (matches shotVolume's shape).
export const impactVolume = (distance, loudness = 1) => clamp(1.15 - distance / 70, .08, 1) * loudness;
