// Shared layout rules for Meridian: what must stay clear (spawn, relays, gateway) and which footprints are taken.
import { CITY_UPLINKS } from './encounters.js';

// Deterministic pseudo-random in [0, 1) so the city looks the same on every load and in every test.
export const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
export const GATE = { x: 0, z: 94 }, SPAWN = { x: 0, z: -65 };
export const PLANTERS = [-30, 10, 50, 90].map(z => ({ x: 24, z: z + 13 }));
export const TOWER_ROWS = [-30, 10, 50, 90];
export const towerHeight = (row, side) => 22 + ((row + (side > 0 ? 1 : 0)) % 3) * 11;
export const blocked = (x, z, radius = 8) => PLANTERS.some(p => Math.hypot(Math.abs(x) - p.x, z - p.z) < 5) || CITY_UPLINKS.some(u => Math.hypot(u.x - x, u.z - z) < radius) || Math.hypot(x - GATE.x, z - GATE.z) < 12 || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 7;

// Rectangular footprints already used by solid pieces; later props test against them so nothing overlaps.
export function makeFootprints() {
  const list = [];
  for (const [x, z] of [[-8, -28], [9, 13], [-9, 50], [9, 79]]) list.push([x - 2.3, x + 2.3, z - 1.2, z + 1.2]);
  for (const p of PLANTERS) for (const s of [-1, 1]) list.push([s * p.x - 2.6, s * p.x + 2.6, p.z - 1.6, p.z + 1.6]);
  return {
    claim(x, z, hx, hz) { list.push([x - hx, x + hx, z - hz, z + hz]); },
    free(x, z, hx, hz, pad = .6) { return !list.some(([a, b, c, d]) => x + hx + pad > a && x - hx - pad < b && z + hz + pad > c && z - hz - pad < d); },
  };
}
