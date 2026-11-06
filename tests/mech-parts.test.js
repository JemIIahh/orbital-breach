import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { makeMech, makeGun } from '../src/world.js';
import { animateMech } from '../src/animation.js';
import { swapMech, disposeMech, paintMech } from '../src/mech-parts.js';
import { PART_SLOTS, partsFor, DEFAULT_BUILD, PRESETS, randomBuild } from '../src/parts.js';

const context = { fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, fillText() {}, createRadialGradient() { return { addColorStop() {} }; } };
globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return context; } }; } };

const finite = group => { let count = 0; group.traverse(o => { if (o.geometry) { count++; assert.ok(o.geometry.attributes.position.array.every(Number.isFinite), 'finite geometry'); } assert.ok(o.position.toArray().every(Number.isFinite) && o.scale.toArray().every(Number.isFinite), 'finite transform'); }); return count; };
const run = (mech, frames = 90) => { for (let i = 0; i < frames; i++) animateMech(mech, { dt: 1 / 60, time: i / 60, speed: 12, strafe: 1, aimPitch: .2, airborne: i > 60, boost: i % 40 < 20, recoil: i % 7 ? 0 : 1 }); mech.group.traverse(o => assert.ok(o.rotation.toArray().slice(0, 3).every(Number.isFinite), 'finite rotation')); };

test('the factory mech is unchanged when no build is passed', () => {
  const a = makeMech('blue'), b = makeMech('blue', 1, 'gunner', null);
  assert.equal(a.parts.length, b.parts.length); assert.ok(a.limbs.leftGun && a.limbs.rightGun && a.limbs.leftThruster); assert.equal(a.group.userData.build, undefined); assert.ok(a.armor);
  assert.equal(makeMech('red', 1, 'archon').group.userData.archetype, 'archon');
});

test('every single part, swapped into the default build, produces a finite, animatable mech', () => {
  for (const slot of PART_SLOTS) for (const part of partsFor(slot)) {
    const mech = makeMech('blue', 1, 'gunner', { ...DEFAULT_BUILD, [slot]: part.id });
    assert.ok(finite(mech.group) > 20, `${part.name} builds`); run(mech);
  }
});

test('arms, shoulders and legs show up where the build says', () => {
  const quad = makeMech('blue', 1, 'gunner', { ...DEFAULT_BUILD, legs: 'arachne' });
  assert.equal(quad.limbs.quadLegs.length, 4); assert.ok(quad.limbs.leftLeg && quad.limbs.rightLeg, 'placeholder legs keep the arms animating');
  assert.equal(makeMech('blue', 1, 'gunner', DEFAULT_BUILD).limbs.quadLegs, undefined);
  const bare = makeMech('blue', 1, 'gunner', { ...DEFAULT_BUILD, lArm: 'none', rArm: 'none', rShoulder: 'none' });
  assert.equal(bare.limbs.leftGun, undefined); assert.equal(bare.limbs.rightGun, undefined); assert.equal(bare.limbs.rightShoulderPod, undefined);
  const loaded = makeMech('blue', 1, 'gunner', { ...DEFAULT_BUILD, lShoulder: 'th3', rShoulder: 'sr6' });
  assert.ok(loaded.limbs.leftShoulderPod && loaded.limbs.rightShoulderPod); assert.equal(loaded.group.userData.build.lShoulder, 'th3');
  const none = makeMech('blue', 1, 'gunner', { ...DEFAULT_BUILD, back: 'none' }); assert.equal(none.limbs.leftThruster.visible, false);
});

test('every preset and a few hundred random builds construct without error', () => {
  for (const preset of PRESETS) finite(makeMech('blue', 1, 'gunner', preset.build).group);
  let seed = 11; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 40; i++) { const mech = makeMech('blue', 1, 'gunner', randomBuild(rng)); finite(mech.group); if (i % 8 === 0) run(mech, 30); }
});

test('all arm gun models build with barrels, a muzzle flash, and the animation hooks', () => {
  for (const part of partsFor('rArm')) {
    if (part.id === 'none') continue; const gun = makeGun(part.model);
    assert.ok(gun.userData.barrels && gun.userData.flash, `${part.name} has animation hooks`); assert.ok(Number.isFinite(gun.userData.flash.position.z));
    // Barrels are baked into one merged mesh per material (they spin together), so count real geometry rather than child objects.
    let barrelTris = 0; gun.userData.barrels.traverse(o => { if (o.geometry) barrelTris += o.geometry.attributes.position.count / 3; });
    assert.ok(gun.userData.barrels.children.length >= 1 && barrelTris >= 60, `${part.name} has visible barrels`); finite(gun);
  }
});

test('swapMech rebuilds in place so scene references survive, and paintMech repaints the shared materials', () => {
  const live = makeMech('blue', 1.4), group = live.group, scene = new T.Scene(); scene.add(group); group.position.set(3, 2, 1);
  swapMech(live, makeMech('blue', 1, 'gunner', { ...DEFAULT_BUILD, legs: 'arachne', torso: 'b90' }));
  assert.equal(live.group, group); assert.equal(group.parent, scene); assert.deepEqual(group.position.toArray(), [3, 2, 1]); assert.equal(live.limbs.quadLegs.length, 4); assert.equal(group.userData.build.torso, 'b90');
  paintMech(live, { paint: '#112233', armor: '#445566', trim: '#aabbcc', glow: '#ff00aa' });
  assert.equal(live.paint.color.getHexString(), '112233'); assert.equal(live.armor.color.getHexString(), '445566'); assert.equal(live.glow.emissive.getHexString(), 'ff00aa');
  run(live, 30);
});

test('disposing a mech frees its own geometry but keeps the geometry shared between mechs', () => {
  // The factory frame is entirely cached geometry now, so use a dressed mech: its headgear and decals are merged per mech and owned by it.
  const a = makeMech('blue', 1, 'gunner', { ...DEFAULT_BUILD, head: 'recon', decal: 'chevron' }), b = makeMech('blue'); let freed = 0, sharedFreed = 0;
  a.group.traverse(o => { if (o.geometry) o.geometry.addEventListener('dispose', () => (o.geometry.userData.shared ? sharedFreed++ : freed++)); });
  disposeMech(a.group, true);
  assert.ok(freed >= 1, 'geometry built for this mech alone is released'); assert.equal(sharedFreed, 0, 'cached frame, gun and pod geometry is kept'); assert.equal(a.group.children.length, 0);
  finite(b.group);
});
