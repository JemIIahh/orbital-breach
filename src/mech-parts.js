// Visual parts for the player's mech. makeMech() (mech-frame.js) builds the factory frame; dressMech() then swaps in the legs,
// torso, back mount, shoulder pods and arm guns a build calls for. Parts are built from the bevelled solids in mech-kit.js; anything
// added by hand is merged per material and given crevice darkening by mech-bake.js at the end of dressMech, and the arm guns and
// shoulder pods are built once per model and cached.
import * as T from 'three';
import { resolveBuild, partById } from './parts.js';
import { buildHead, buildBack, buildLegs, buildDecals, buildTrail } from './mech-gear.js';
import { addNewGunBarrels, addNewPod } from './mech-weapons.js';
import { TAU, box, slab, loft, tube, cyl, ring, rod, bolt, put, resetTone } from './mech-kit.js';
import { slotTokens, bakeSpec, addBaked, bakeLoose, flatten, geometryCache } from './mech-bake.js';

// ---- Arm guns -----------------------------------------------------------------------------------------------
// Adds a model's barrels to the shared gun hull built by makeGun(). Returns false for the two original models (gatling and flak).
export function addGunBarrels(type, { gun, barrels, metal, trim, glowing }) {
  if (type === 'buzzsaw') {
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; barrels.add(tube(.04, .04, 1, metal, Math.sin(a) * .16, Math.cos(a) * .16, -.62, 8)); }
    for (const z of [-.26, -.56, -.98]) { const disc = tube(z < -.9 ? .2 : .3, z < -.9 ? .2 : .3, .05, trim, 0, 0, z, 20); barrels.add(disc); }
    const rim = tube(.31, .31, .02, glowing, 0, 0, -.26, 20); barrels.add(rim); gun.userData.muzzle = -1.2;
  } else if (type === 'cutter') {
    for (const s of [-1, 1]) { const blade = box(.07, .26, 1.15, trim, s * .17, 0, -.7); barrels.add(blade); barrels.add(box(.02, .05, 1.0, glowing, s * .2, 0, -.7)); barrels.add(box(.1, .34, .2, metal, s * .17, 0, -.14)); }
    barrels.add(box(.2, .08, .5, metal, 0, 0, -.5)); gun.userData.muzzle = -1.3;
  } else if (type === 'stitcher') {
    barrels.add(tube(.055, .055, 1.9, metal, 0, 0, -1.05, 10)); barrels.add(tube(.11, .11, .3, trim, 0, 0, -.45, 12)); barrels.add(tube(.09, .09, .12, glowing, 0, 0, -1.98, 10));
    barrels.add(box(.14, .16, .5, metal, 0, .33, -.1)); barrels.add(tube(.05, .05, .34, glowing, 0, .33, -.4, 8)); barrels.add(box(.2, .3, .3, trim, .28, -.1, .1));
    gun.userData.muzzle = -2.05;
  } else if (type === 'pod') {
    for (const x of [-.18, 0, .18]) for (const y of [-.1, .14]) { barrels.add(tube(.085, .085, .9, metal, x, y, -.45, 10)); barrels.add(tube(.06, .06, .05, glowing, x, y, -.92, 8)); }
    barrels.add(box(.62, .6, .1, trim, 0, .02, -.4)); gun.userData.muzzle = -1.05;
  } else if (type === 'thunder') {
    barrels.add(tube(.27, .22, .85, metal, 0, 0, -.62, 16)); barrels.add(tube(.31, .31, .14, trim, 0, 0, -1.05, 16));
    for (const s of [-1, 1]) { barrels.add(box(.06, .3, .34, metal, s * .33, 0, -1.04)); barrels.add(tube(.07, .07, .6, trim, s * .2, -.28, -.45, 8)); }
    barrels.add(tube(.12, .12, .06, glowing, 0, 0, -1.14, 12)); gun.userData.muzzle = -1.3;
  } else return addNewGunBarrels(type, { gun, barrels, metal, trim, glowing });
  return true;
}

// ---- Shoulder pods ------------------------------------------------------------------------------------------
function buildPod(model, side, m) {
  const g = new T.Group();
  if (model === 'helix') {
    g.add(slab(.42, .36, .98, m.metal, 0, -.02, 0, { top: { sx: .92, sz: .96 } }), slab(.46, .06, .84, m.armor, 0, .2, .06, { top: { sx: .9 } }), slab(.3, .03, .5, m.glow, 0, .24, .12), slab(.2, .04, .16, m.warn, 0, .235, -.18));
    for (const s of [-1, 1]) g.add(slab(.04, .3, .7, m.paint, s * .225, -.02, .1), bolt(m.steel, s * .245, .06, .38, 'x', .025));
    const nose = new T.Mesh(new T.ConeGeometry(.14, .34, 10), m.warn); nose.rotation.x = -Math.PI / 2; nose.position.set(0, 0, -.66); g.add(nose);
    g.add(tube(.15, .15, .5, m.armor, 0, 0, -.3, 12), tube(.19, .19, .07, m.steel, 0, 0, -.52, 14), tube(.04, .04, .03, m.glow, 0, 0, -.2, 8));
  } else if (model === 'rotary') {
    g.add(box(.34, .3, .5, m.metal, 0, 0, .1)); for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; g.add(tube(.035, .035, .62, m.armor, Math.sin(a) * .08, Math.cos(a) * .08, -.4, 8)); }
    g.add(tube(.12, .12, .1, m.glow, 0, 0, -.13, 10));
  } else if (model === 'mortar') {
    const barrel = new T.Group(); barrel.rotation.x = -.95; barrel.add(tube(.17, .2, .95, m.metal, 0, 0, 0, 14)); barrel.add(tube(.22, .22, .12, m.armor, 0, 0, -.5, 14)); barrel.add(tube(.12, .12, .05, m.glow, 0, 0, -.55, 10)); barrel.position.set(0, .18, .08); g.add(barrel);
    g.add(box(.5, .16, .5, m.armor, 0, -.12, .1));
  } else if (model === 'swarm') {
    g.add(box(.58, .44, .62, m.metal, 0, 0, 0)); for (const x of [-.18, 0, .18]) for (const y of [-.1, .1]) { g.add(tube(.065, .065, .1, m.glow, x, y, -.33, 8)); g.add(tube(.08, .08, .5, m.armor, x, y, -.08, 8)); }
  } else if (model === 'chaff') {
    g.add(tube(.24, .26, .4, m.metal, 0, 0, 0, 16)); g.children[0].rotation.x = 0; g.add(new T.Mesh(new T.TorusGeometry(.22, .04, 6, 20), m.glow)); g.children[1].rotation.x = Math.PI / 2; g.children[1].position.y = .2;
    for (const a of [0, 1, 2, 3]) { const fin = box(.04, .26, .16, m.armor, Math.sin(a * TAU / 4) * .26, .05, Math.cos(a * TAU / 4) * .26); fin.rotation.y = a * TAU / 4; g.add(fin); }
  } else addNewPod(model, g, side, m);
  // A mounting plate and two pylons under every pod, so it reads as bolted to the pauldron rather than floating over it.
  const bounds = new T.Box3().setFromObject(g), cx = (bounds.min.x + bounds.max.x) / 2, cz = (bounds.min.z + bounds.max.z) / 2;
  g.add(slab(.44, .06, .4, m.metal, 0, bounds.min.y - .03, cz * .6 + .06));
  for (const x of [-.14, .14]) g.add(cyl(.045, .06, .1, m.armor, x, bounds.min.y - .09, cz * .6 + .06, 8));
  g.add(bolt(m.armor, cx - .16, bounds.min.y - .06, .22, 'y', .025), bolt(m.armor, cx + .16, bounds.min.y - .06, .22, 'y', .025));
  return g;
}
export function shoulderPod(model, side, m) {
  const key = `pod:${model}:${side}`; let spec = geometryCache.get(key);
  if (!spec) { resetTone(41); const tokens = slotTokens(), g = buildPod(model, side, tokens); spec = bakeSpec(flatten(g), { y0: 3.1 }); geometryCache.set(key, spec); }
  const pod = new T.Group(); addBaked(pod, spec, m);
  pod.userData.side = side; return pod;
}

// ---- Dressing -----------------------------------------------------------------------------------------------
const GUN_AT = [0, -.44, -.29], GUN_SCALE = .55;
// ctx carries what makeMech built: { group, body, head, pack, limbs, parts, paint, armor, metal, glow, mats, makeGun }.
export function dressMech(build, ctx) {
  const p = resolveBuild(build), { group, body, head, pack, limbs, parts, armor, metal, glow, paint } = ctx;
  const removeParts = root => { const dead = new Set(); root.traverse(o => dead.add(o)); for (let i = parts.length - 1; i >= 0; i--) if (dead.has(parts[i])) parts.splice(i, 1); };

  // Torso
  if (p.torso.model === 'cirrus') {
    body.scale.x = .92;
    const glass = new T.MeshStandardMaterial({ color: '#8fdbe8', emissive: '#2c8196', emissiveIntensity: .6, metalness: .1, roughness: .1, transparent: true, opacity: .62 });
    const canopy = new T.Mesh(new T.SphereGeometry(.46, 18, 12), glass); canopy.scale.set(1, .85, 1.15); canopy.position.set(0, 2.78, -.12); body.add(canopy);
    const rim = ring(.43, .035, armor, 0, 2.6, -.12, 'y', 24); rim.scale.set(1, 1, 1.15); body.add(rim);
    for (const s of [-1, 1]) { const fin = box(.04, .5, .5, armor, s * .66, 2.35, .3); fin.rotation.z = s * .2; body.add(fin); body.add(box(.05, .06, .42, glow, s * .69, 2.28, .3)); }
  } else if (p.torso.model === 'bastion') {
    body.scale.set(1.16, 1.04, 1.08);
    body.add(put(slab(1.0, .38, .2, armor, 0, 0, 0, { top: { sx: .94, sz: .8 }, bevel: .04 }), 0, 2.3, -.52, .3, 0, 0), put(slab(.94, .42, .2, armor, 0, 0, 0, { top: { sx: 1.05 }, bevel: .04 }), 0, 1.92, -.55, -.03, 0, 0));
    body.add(box(.84, .1, .06, glow, 0, 2.1, -.66), box(.3, .05, .04, ctx.mats?.warn || metal, 0, 1.68, -.62));
    for (const s of [-1, 1]) {
      const pauldron = loft([{ y: -.2, hx: .48, hz: .5 }, { y: -.08, hx: .5, hz: .52 }, { y: .12, hx: .4, hz: .44 }, { y: .24, hx: .24, hz: .3 }], armor, s * .98, 2.98, .02, { c: .12, bevel: .02 }); pauldron.rotation.z = s * -.12; body.add(pauldron);
      body.add(slab(.2, .55, .6, metal, s * .55, 1.85, -.35, { bevel: .03 }), slab(.05, .08, .3, glow, s * 1.25, 2.9, .02));
    }
    body.add(box(.9, .22, .6, metal, 0, 2.95, .1));
  }

  // Back mount
  const thrusters = [limbs.leftThruster, limbs.rightThruster].filter(Boolean);
  if (p.back.model === 'vane') {
    for (const s of [-1, 1]) { const vane = box(.05, 1.2, .62, armor, s * .62, 2.5, .88); vane.rotation.z = s * .32; body.add(vane); body.add(box(.06, 1.0, .06, glow, s * .86, 2.5, .88)); for (let i = 0; i < 4; i++) { const slat = box(.07, .04, .56, metal, s * (.57 + i * .03), 2.15 + i * .24, .88); slat.rotation.z = s * .32; body.add(slat); } }
  } else if (p.back.model === 'aegis') {
    body.add(box(.98, .94, .34, armor, 0, 2.15, .98)); body.add(box(.5, .5, .1, glow, 0, 2.15, 1.17)); for (const s of [-1, 1]) { const wing = box(.1, .86, .5, metal, s * .55, 2.15, .9); wing.rotation.y = s * .25; body.add(wing); }
  } else if (p.back.model === 'none') {
    for (const t of thrusters) t.visible = false; for (const j of [limbs.leftJet, limbs.rightJet]) if (j) j.position.set(j.position.x * .55, 1.7, .5);
    if (pack) pack.visible = false;
  }

  if (['turbine', 'wing', 'ring', 'phoenix'].includes(p.back.model)) buildBack(p.back.model, ctx);

  // Legs
  if (['sprinter', 'tread', 'hover'].includes(p.legs.model)) buildLegs(p.legs.model, ctx);
  else if (p.legs.model === 'heavy') {
    for (const side of ['left', 'right']) { limbs[`${side}Leg`].scale.set(1.3, .93, 1.3); limbs[`${side}Leg`].position.x *= 1.12; }
    group.add(box(1.25, .28, .85, armor, 0, 1.58, 0)); for (const s of [-1, 1]) group.add(box(.12, .5, .7, metal, s * .68, 1.35, 0));
  } else if (p.legs.model === 'quad') {
    for (const side of ['left', 'right']) { const leg = limbs[`${side}Leg`]; removeParts(leg); group.remove(leg); const placeholder = new T.Group(); placeholder.position.copy(leg.position); group.add(placeholder); limbs[`${side}Leg`] = placeholder; delete limbs[`${side}Knee`]; delete limbs[`${side}Ankle`]; }
    group.add(box(1.0, .4, 1.25, metal, 0, 1.38, 0)); group.add(box(.7, .12, 1.0, armor, 0, 1.6, 0));
    limbs.quadLegs = [];
    for (const s of [-1, 1]) for (const q of [-1, 1]) {
      const leg = new T.Group(); leg.position.set(s * .5, 1.32, q * .5); group.add(leg);
      const chain = new T.Group(); chain.rotation.y = Math.atan2(-q * Math.sin(.55), s * Math.cos(.55)); leg.add(chain);
      const upper = slab(1.05, .26, .26, armor, .44, .22, 0, { top: { sx: 1, sz: .8 } }); upper.rotation.z = .42; chain.add(upper, put(slab(.5, .03, .05, glow, 0, 0, 0), .5, .38, 0, 0, 0, .42), rod([0, 0, 0], [.9, .5, 0], .08, .08, metal, 10));
      const joint = cyl(.15, .15, .3, metal, .86, .45, 0, 12); joint.rotation.x = Math.PI / 2; chain.add(joint, ring(.16, .022, armor, .86, .45, .17, 'z', 16), ring(.16, .022, armor, .86, .45, -.17, 'z', 16), bolt(armor, .86, .45, .2, 'z', .04));
      chain.add(rod([.86, .45, 0], [1.56, -1.22, 0], .11, .06, metal, 10), put(slab(.22, 1.0, .26, armor, 0, 0, 0, { top: { sx: .7, sz: .8 } }), 1.2, -.38, 0, 0, 0, -.397), put(slab(.1, .5, .04, glow, 0, 0, 0), 1.08, -.22, .14, 0, 0, -.397), rod([.95, .3, .13], [1.4, -.78, .12], .03, .03, armor, 6));
      chain.add(cyl(.17, .24, .1, armor, 1.56, -1.31, 0, 14), ring(.2, .03, metal, 1.56, -1.26, 0, 'y', 16), put(slab(.2, .05, .2, glow, 0, 0, 0), 1.56, -1.37, 0));
      bakeLoose(chain, { parts, part: 'leg', y0: 1 });
      limbs.quadLegs.push(leg); leg.userData.phase = (s * q > 0 ? 0 : Math.PI);
    }
  }

  // Arm guns: the build's weapons replace the factory pair (an empty arm carries nothing).
  for (const [slot, key, elbowKey] of [['lArm', 'leftGun', 'leftElbow'], ['rArm', 'rightGun', 'rightElbow']]) {
    const elbow = limbs[elbowKey], old = limbs[key]; if (!elbow) continue;
    if (old) { elbow.remove(old); delete limbs[key]; }
    if (!p[slot].fire) continue;
    const gun = ctx.makeGun(p[slot].model, paint, metal, glow); gun.position.set(...GUN_AT); gun.scale.setScalar(GUN_SCALE); elbow.add(gun); limbs[key] = gun;
  }

  // Shoulder pods
  const lift = p.torso.model === 'bastion' ? .06 : 0, mats = ctx.mats || { metal, armor, glow };
  for (const [slot, side] of [['lShoulder', -1], ['rShoulder', 1]]) {
    if (!p[slot].fire) continue;
    const pod = shoulderPod(p[slot].model, side, mats); pod.position.set(side * .96, 3.2 + lift, .06); body.add(pod); limbs[`${side < 0 ? 'left' : 'right'}ShoulderPod`] = pod;
  }

  // Headgear, decals and boost trail (looks only)
  if (p.head.model !== 'visor') buildHead(p.head.model, ctx);
  const decal = partById('decal', p.decal.id); if (decal.model !== 'none') buildDecals(decal.model, ctx, { color: decal.color, torso: p.torso.model });
  const trail = partById('trail', p.trail.id); if (trail.color) buildTrail(trail.color, ctx);

  // Merge what was added by hand, per group and material, with the same crevice darkening as the frame.
  group.updateMatrixWorld(true);
  const role = new Map([[body, 'core'], [group, 'core'], [head, 'head']]);
  for (const [k, v] of Object.entries(limbs)) if (v?.isGroup && /(Arm|Elbow)$/.test(k)) role.set(v, 'arm'); else if (v?.isGroup && /(Leg|Knee|Ankle)$/.test(k)) role.set(v, 'leg');
  const targets = []; group.traverse(g => { if (g.isGroup && g.children.some(c => c.isMesh && !c.userData.baked && !c.userData.keep)) targets.push(g); });
  const at = new T.Vector3();
  for (const g of targets) { at.setFromMatrixPosition(g.matrixWorld); bakeLoose(g, { parts, part: role.get(g) || null, y0: at.y / (group.scale.y || 1) }); }
  group.userData.build = build;
}

// ---- Livery and cleanup -------------------------------------------------------------------------------------
export function paintMech(mech, livery) {
  if (mech.paint) mech.paint.color.set(livery.paint);
  if (mech.armor && livery.armor) mech.armor.color.set(livery.armor);
  if (mech.glow) { mech.glow.color.set(livery.trim); mech.glow.emissive.set(livery.glow); }
}

// Replaces the contents of an existing mech in place, so scene references (the launch bay, the third-person model) stay valid.
export function swapMech(target, fresh) {
  disposeMech(target.group, true);
  for (const child of [...fresh.group.children]) target.group.add(child);
  target.group.userData = fresh.group.userData;
  for (const key of ['parts', 'limbs', 'paint', 'glow', 'armor']) target[key] = fresh[key];
  target.motion = null;
}

// Frees GPU resources of a mech that is being replaced. Geometry cached by makeMech is flagged shared and kept.
export function disposeMech(group, clear = false) {
  const materials = new Set();
  group.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => materials.add(x)); });
  for (const m of materials) m.dispose();
  if (clear) group.clear();
}
