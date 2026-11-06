// Pure zone map for the 96-bay Kestrel ring. No DOM and no Three.js, so the HUD, the decor builder and the tests
// all read the same answer. Sections count 1..55 around the ring; the pilot's spawn point reads DOCK A · SECTION 01.
import { BAY_COUNT, TAU } from './station-constants.js';

export const SECTION_COUNT = 55;
// Section 1 begins at bay 94, so the spawn bay (angle -0.1 rad) is the start of the first section.
export const SECTION_SHIFT = 2;

// Zones are authored in "section space" (s = bay + SECTION_SHIFT), so each one covers a clean run of section numbers.
// Dock A wraps around the ring seam, which is why it owns two ranges.
export const ZONES = [
  { id: 'dock-a', name: 'DOCK A', ranges: [[0, 6], [85, 95]] },
  { id: 'hydroponics', name: 'HYDROPONICS', ranges: [[7, 22]] },
  { id: 'promenade', name: 'PROMENADE', ranges: [[23, 41]] },
  { id: 'dock-b', name: 'DOCK B', ranges: [[42, 53]] },
  { id: 'reactor', name: 'REACTOR', ranges: [[54, 67]] },
  { id: 'freight', name: 'FREIGHT', ranges: [[68, 84]] },
];

export const normalizeBay = bay => ((Math.round(bay) % BAY_COUNT) + BAY_COUNT) % BAY_COUNT;
export const bayOfAngle = angle => normalizeBay(angle / TAU * BAY_COUNT);
export const bayAngle = bay => normalizeBay(bay) * TAU / BAY_COUNT;
const shifted = bay => (normalizeBay(bay) + SECTION_SHIFT) % BAY_COUNT;

export function sectionOfBay(bay) {
  return Math.floor(shifted(bay) * SECTION_COUNT / BAY_COUNT) + 1;
}

const zoneBySlot = (() => {
  const table = new Array(BAY_COUNT).fill(null);
  for (const zone of ZONES) for (const [from, to] of zone.ranges) for (let s = from; s <= to; s++) table[s] = zone;
  return table;
})();

export const zoneOfBay = bay => zoneBySlot[shifted(bay)];

export function bayInfo(bay) {
  const zone = zoneOfBay(bay);
  return { bay: normalizeBay(bay), zone: zone.id, zoneName: zone.name, section: sectionOfBay(bay) };
}

const pad = n => String(n).padStart(2, '0');
export const sectionLabel = section => pad(section);
export const zoneName = bay => zoneOfBay(bay).name;
// "HYDROPONICS · SECTION 06": the HUD location label.
export const locationLabel = bay => `${zoneName(bay)} · SECTION ${pad(sectionOfBay(bay))}`;

// Bays that open a zone (the previous bay belongs to a different zone), in ring order.
export function zoneStartBays() {
  const starts = [];
  for (let bay = 0; bay < BAY_COUNT; bay++) if (zoneOfBay(bay) !== zoneOfBay(bay - 1)) starts.push(bay);
  return starts;
}

export function baysOfZone(id) {
  const bays = [];
  for (let bay = 0; bay < BAY_COUNT; bay++) if (zoneOfBay(bay).id === id) bays.push(bay);
  return bays;
}

// Bays inside a zone, counted from the zone's first bay in ring order (wrapping zones start at the seam of their first range).
export function zoneIndexOfBay(bay) {
  const zone = zoneOfBay(bay);
  let index = 0;
  for (let b = normalizeBay(bay) - 1; ; b--) {
    if (zoneOfBay(b) !== zone) return index;
    index++;
    if (index > BAY_COUNT) return index;
  }
}

// The reactor zone's middle bay: the glowing pylons are built around it.
export const reactorBay = () => {
  const bays = baysOfZone('reactor');
  return bays[Math.floor(bays.length / 2)];
};
