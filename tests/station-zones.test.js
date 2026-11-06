import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAY_COUNT } from '../src/station-constants.js';
import {
  ZONES, SECTION_COUNT, bayInfo, bayOfAngle, bayAngle, sectionOfBay, zoneOfBay, locationLabel, zoneStartBays, baysOfZone, zoneIndexOfBay, reactorBay,
} from '../src/station-zones.js';

test('every bay belongs to exactly one zone and the zone ranges leave no gaps', () => {
  const claimed = new Array(BAY_COUNT).fill(0);
  for (const zone of ZONES) for (const [from, to] of zone.ranges) for (let s = from; s <= to; s++) claimed[s]++;
  assert.deepEqual(claimed, new Array(BAY_COUNT).fill(1));
  for (let bay = 0; bay < BAY_COUNT; bay++) assert.ok(zoneOfBay(bay), `bay ${bay} has a zone`);
});

test('sections run 1 to 55 in ring order, never skipping a number', () => {
  const seen = new Set();
  let previous = null, wraps = 0;
  for (let step = 0; step < BAY_COUNT; step++) {
    const bay = (94 + step) % BAY_COUNT, section = sectionOfBay(bay);
    seen.add(section);
    if (previous !== null) {
      if (section < previous) wraps++;
      else assert.ok(section - previous <= 1, `section jumps from ${previous} to ${section}`);
    }
    previous = section;
  }
  assert.equal(wraps, 0, 'sections never wrap back inside one lap');
  assert.deepEqual([...seen].sort((a, b) => a - b), Array.from({ length: SECTION_COUNT }, (_, i) => i + 1));
});

test('the pilot spawns at DOCK A · SECTION 01 and the map is stable', () => {
  const spawn = bayOfAngle(-0.1);
  assert.equal(locationLabel(spawn), 'DOCK A · SECTION 01');
  assert.deepEqual(bayInfo(spawn), { bay: spawn, zone: 'dock-a', zoneName: 'DOCK A', section: 1 });
  assert.deepEqual(bayInfo(spawn), bayInfo(spawn), 'deterministic');
  assert.equal(bayInfo(-1).bay, 95); assert.equal(bayInfo(BAY_COUNT + 3).bay, 3, 'bays wrap around the ring');
});

test('zones follow the order seen in play: dock, hydroponics, promenade, dock, reactor, freight, dock', () => {
  const order = [];
  for (let step = 0; step < BAY_COUNT; step++) { const id = zoneOfBay(94 + step).id; if (order.at(-1) !== id) order.push(id); }
  assert.deepEqual(order, ['dock-a', 'hydroponics', 'promenade', 'dock-b', 'reactor', 'freight', 'dock-a']);
  const hydroSections = baysOfZone('hydroponics').map(sectionOfBay);
  assert.ok(Math.min(...hydroSections) <= 5 && Math.max(...hydroSections) >= 12, 'hydroponics covers sections 5 to 12');
  const reactor = baysOfZone('reactor').map(sectionOfBay);
  assert.ok(Math.min(...reactor) <= 33 && Math.max(...reactor) >= 38, 'the reactor covers sections 33 to 38');
});

test('zone helpers: starts, indices and the reactor bay', () => {
  const starts = zoneStartBays();
  assert.equal(starts.length, ZONES.length, 'dock A wraps the ring seam but is still one contiguous zone');
  for (const bay of starts) assert.equal(zoneIndexOfBay(bay), 0);
  assert.equal(zoneIndexOfBay(starts[1] + 3), 3);
  assert.equal(zoneOfBay(reactorBay()).id, 'reactor');
  assert.equal(bayOfAngle(bayAngle(37)), 37, 'angle and bay round-trip');
});

test('the location label is padded and names the zone', () => {
  for (let bay = 0; bay < BAY_COUNT; bay++) assert.match(locationLabel(bay), /^[A-Z ]+ · SECTION \d{2}$/);
  assert.equal(locationLabel(bayOfAngle(0.61 / 1)), `${bayInfo(bayOfAngle(0.61)).zoneName} · SECTION ${String(bayInfo(bayOfAngle(0.61)).section).padStart(2, '0')}`);
});
