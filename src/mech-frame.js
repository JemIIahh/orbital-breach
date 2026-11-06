// The factory mech: a heavy industrial exo-frame. makeMech() assembles the rig (body, head, arms, elbows, legs, knees, ankles, thrusters)
// from geometry that is hand-built once, baked (merged per material, with ambient-occlusion style vertex darkening) and cached in
// mechGeometryCache, so seven mechs on screen share a few dozen buffers. dressMech() (mech-parts.js) then swaps in a build's parts.
//
// Frame conventions: the mech faces -Z, +Y is up, feet at y = 0. Limbs are authored for the +x side ("right") with the outside at +x;
// the left limbs are the same geometry mirrored. Colour roles: paint = hull plates, armor = pauldrons, crown, knee guards and caps,
// metal = dark inner frame, steel = pistons and rings, rubber = hoses and bellows, warn = safety orange tabs, glow = lights.
import * as T from 'three';
import { addEnemyDetails } from './enemy-details.js';
import { ENEMY_TYPES } from './encounters.js';
import { dressMech, addGunBarrels } from './mech-parts.js';
import { TAU, slab, loft, lathe, cyl, tube, barX, ring, rod, plate, bolt, cable, slats, tilt, put, resetTone } from './mech-kit.js';
import { slotTokens, bakeSpec, bakeMeshes, addBaked, geometryCache } from './mech-bake.js';

export const mechGeometryCache = geometryCache;
let wearTexture = null;
function brushedWear() {
  if (wearTexture || typeof document === 'undefined') return wearTexture;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#dedede'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4500; i++) { const grey = 100 + Math.floor(Math.random() * 150); ctx.fillStyle = `rgb(${grey},${grey},${grey})`; ctx.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 9 + .3, .35); }
  for (let i = 0; i < 170; i++) { ctx.fillStyle = i % 3 ? '#8a8a8a' : '#fafafa'; const edge = Math.random() > .5 ? Math.random() * 10 : 246 + Math.random() * 10; ctx.fillRect(edge, Math.random() * 256, 1 + Math.random() * 5, .5 + Math.random() * 5); }
  wearTexture = new T.CanvasTexture(ctx.canvas || canvas); wearTexture.colorSpace = T.SRGBColorSpace; wearTexture.wrapS = wearTexture.wrapT = T.RepeatWrapping; wearTexture.anisotropy = 4; return wearTexture;
}

// One set of materials per mech (they are repainted by paintMech and flashed by the hit animation, so they cannot be shared).
export function mechMaterials({ paint = '#345e85', armor = '#a5b1b5', glow = '#a5f6ff', emissive = '#43dafa' } = {}) {
  const wear = brushedWear();
  const m = {
    paint: new T.MeshPhysicalMaterial({ color: paint, metalness: .5, roughness: .42, clearcoat: .45, clearcoatRoughness: .32, map: wear, bumpMap: wear, bumpScale: .008, vertexColors: true }),
    armor: new T.MeshStandardMaterial({ color: armor, metalness: .72, roughness: .34, map: wear, bumpMap: wear, bumpScale: .006, vertexColors: true }),
    metal: new T.MeshStandardMaterial({ color: '#1d2a35', metalness: .85, roughness: .4, vertexColors: true }),
    steel: new T.MeshStandardMaterial({ color: '#c3ced4', metalness: 1, roughness: .2, vertexColors: true }),
    rubber: new T.MeshStandardMaterial({ color: '#12181d', metalness: .05, roughness: .88, vertexColors: true }),
    warn: new T.MeshStandardMaterial({ color: '#d98a2b', metalness: .2, roughness: .55, vertexColors: true }),
    glow: new T.MeshStandardMaterial({ color: glow, emissive, emissiveIntensity: 1.2 }),
  };
  m.glow.userData.noAO = true; return m;
}

// ---- Cached frame geometry -----------------------------------------------------------------------------------------
const S = slotTokens();
const spec = (build, part, y0) => { resetTone(17); const right = bakeSpec(build(), { part, y0 }); resetTone(17); return { right, left: bakeSpec(build(), { part, y0, mirror: true }) }; };
const single = (build, part, y0) => { resetTone(23); return bakeSpec(build(), { part, y0 }); };

// Chest, abdomen, collar and neck (the body group).
function torso() {
  const o = [];
  o.push(loft([{ y: 1.98, hx: .4, hz: .3 }, { y: 2.2, hx: .55, hz: .38 }, { y: 2.5, hx: .64, hz: .42 }, { y: 2.7, hx: .5, hz: .35 }], S.paint, 0, 0, 0, { c: .08, bevel: .02 }), slab(.9, .05, .5, S.metal, 0, 2.0, 0));
  for (const s of [-1, 1]) {
    o.push(put(slab(.4, .27, .13, S.armor, 0, 0, 0, { top: { sx: .92, sz: .8 }, bevel: .03 }), s * .4, 2.47, -.375, .32, -s * .2, 0), put(slab(.4, .3, .13, S.armor, 0, 0, 0, { top: { sx: 1.04, sz: 1 }, bevel: .03 }), s * .4, 2.2, -.4, -.02, -s * .2, 0), put(slab(.34, .05, .1, S.metal, 0, 0, 0), s * .4, 2.04, -.4, .12, -s * .2, 0));
    o.push(put(slab(.1, .44, .5, S.paint, 0, 0, 0, { bevel: .03 }), s * .62, 2.14, .02, 0, 0, s * .1));
    o.push(put(slab(.42, .09, .5, S.armor, 0, 0, 0, { top: { sx: .85 }, bevel: .03 }), s * .36, 2.74, .0, 0, 0, -s * .17));
    o.push(put(slab(.42, .5, .1, S.paint, 0, 0, 0, { bevel: .03 }), s * .28, 2.36, .38, -.08, 0, 0));
    o.push(barX(.2, .2, .3, S.metal, s * .72, 2.6, 0, 14), ring(.205, .02, S.steel, s * .6, 2.6, 0, 'x', 20));
    for (const bx of [-.12, .12]) o.push(bolt(S.steel, s * .4 + bx, 2.53, -.5, 'z', .022));
    o.push(...slats(3, .24, .018, .03, .045, S.rubber, s * .4, 2.04, -.37, 'y'), put(slab(.24, .15, .02, S.paint, 0, 0, 0, { bevel: 0 }), s * .4, 2.2, -.475, -.02, -s * .2, 0), put(slab(.1, .02, .02, S.glow, 0, 0, 0), s * .5, 2.2, -.45, -.02, -s * .2, 0));
    o.push(cable([[s * .22, 2.78, -.1], [s * .42, 2.8, -.2], [s * .62, 2.72, -.12]], .022, S.rubber, 12, 5));
  }
  // sternum keel with the reactor light bar, and a safety-orange tab
  o.push(put(slab(.36, .62, .1, S.paint, 0, 0, 0, { top: { sx: 1.08 }, bevel: .03 }), 0, 2.3, -.5, .04, 0, 0));
  o.push(slab(.26, .035, .02, S.glow, 0, 2.57, -.553), slab(.12, .035, .02, S.warn, 0, 1.99, -.545));
  // abdomen: a ridged rubber bellows with three stacked front plates and two rear plates
  o.push(lathe([{ y: 1.58, r: .27 }, { y: 1.68, r: .31 }, { y: 1.78, r: .27 }, { y: 1.88, r: .31 }, { y: 1.98, r: .27 }, { y: 2.04, r: .3 }], S.rubber, 0, 0, 0, { seg: 16 }));
  o.push(slab(.64, .11, .13, S.paint, 0, 1.95, -.26, { bevel: .03 }), slab(.58, .11, .13, S.armor, 0, 1.81, -.265, { bevel: .03 }), slab(.5, .11, .12, S.paint, 0, 1.67, -.26, { bevel: .03 }));
  o.push(slab(.6, .13, .1, S.paint, 0, 1.92, .27, { bevel: .03 }), slab(.54, .13, .1, S.armor, 0, 1.76, .27, { bevel: .03 }));
  // collar and neck
  o.push(slab(.72, .1, .56, S.armor, 0, 2.73, 0, { top: { sx: .78, sz: .72 }, bevel: .03 }), cyl(.21, .21, .02, S.rubber, 0, 2.785, 0, 18));
  o.push(cyl(.15, .17, .2, S.metal, 0, 2.8, 0, 14), ring(.16, .02, S.rubber, 0, 2.84, 0, 'y', 16), ring(.16, .02, S.rubber, 0, 2.77, 0, 'y', 16));
  return o;
}

// Hip girdle, joint housings and skirt plates (the root group).
function pelvis() {
  const o = [];
  o.push(loft([{ y: 1.2, hx: .42, hz: .28 }, { y: 1.42, hx: .5, hz: .32 }, { y: 1.62, hx: .46, hz: .3 }], S.metal, 0, 0, 0, { c: .07, bevel: .02 }));
  o.push(slab(1.02, .09, .64, S.armor, 0, 1.6, 0, { bevel: .03 }), slab(.3, .22, .4, S.metal, 0, 1.18, 0, { bevel: .02 }));
  for (const s of [-1, 1]) o.push(put(slab(.3, .24, .07, S.armor, 0, 0, 0, { top: { sx: 1.1 }, bevel: .025 }), s * .27, 1.46, -.33, -.1, 0, 0), slab(.14, .03, .02, S.warn, s * .27, 1.55, -.375));
  o.push(loft([{ y: 1.23, hx: .06, hz: .04 }, { y: 1.55, hx: .17, hz: .05 }], S.paint, 0, 0, -.31, { c: .03, bevel: .015 }), slab(.5, .28, .08, S.paint, 0, 1.38, .31, { bevel: .03 }));
  for (const s of [-1, 1]) {
    o.push(barX(.23, .23, .36, S.metal, s * .45, 1.32, 0, 18), ring(.235, .025, S.steel, s * .64, 1.32, 0, 'x', 20), bolt(S.steel, s * .66, 1.32, 0, 'x', .04));
    o.push(put(slab(.08, .32, .5, S.armor, 0, 0, 0, { bevel: .025 }), s * .72, 1.44, 0, 0, 0, s * .14));
  }
  return o;
}

// The sensor head. The pivot is the middle of the head; it sits down into the collar on a ribbed neck.
function head() {
  const o = [];
  o.push(loft([{ y: -.2, hx: .2, hz: .22 }, { y: -.06, hx: .29, hz: .28 }, { y: .1, hx: .3, hz: .27, oz: .02 }, { y: .19, hx: .22, hz: .2, oz: .06 }], S.metal, 0, 0, 0, { c: .07, bevel: .02 }));
  o.push(put(slab(.58, .09, .36, S.armor, 0, 0, 0, { top: { sx: .9, sz: .7, oz: -.04 }, bevel: .03 }), 0, .17, -.1, -.2, 0, 0));
  const crest = put(plate([[.18, .19], [.05, .3], [-.12, .31], [-.27, .16], [-.27, .12], [.18, .15]], .06, S.armor), 0, 0, 0, 0, Math.PI / 2, 0); o.push(crest);
  o.push(put(slab(.5, .15, .1, S.rubber, 0, 0, 0, { bevel: .02 }), 0, 0, -.275, .1, 0, 0), plate([[-.22, 0], [-.17, .045], [.17, .045], [.22, 0], [.17, -.03], [-.17, -.03]], .02, S.glow, [], 0));
  o[o.length - 1].position.set(0, .005, -.325); o[o.length - 1].rotation.x = .1;
  for (const s of [-1, 1]) {
    o.push(put(slab(.07, .3, .38, S.paint, 0, 0, 0, { bevel: .025 }), s * .315, -.04, -.02, 0, s * .06, 0), ...slats(3, .02, .025, .2, .07, S.rubber, s * .353, -.05, -.04, 'y'));
  }
  o.push(put(slab(.36, .1, .22, S.armor, 0, 0, 0, { top: { sx: 1.1 }, bevel: .025 }), 0, -.19, -.2, .35, 0, 0), ...slats(3, .28, .015, .02, .04, S.rubber, 0, -.145, -.305, 'y'));
  o.push(barX(.075, .075, .1, S.metal, -.35, 0, .04, 12), barX(.045, .045, .02, S.glow, -.405, 0, .04, 12), barX(.075, .075, .1, S.metal, .35, 0, .04, 12), rod([.34, .08, .1], [.4, .46, .13], .014, .008, S.steel, 6));
  o.push(...slats(3, .34, .025, .08, .05, S.armor, 0, .05, .3, 'y'), cyl(.17, .2, .1, S.rubber, 0, -.23, 0, 14), slab(.06, .015, .04, S.glow, 0, .3, -.04));
  for (const m of o) { m.position.multiplyScalar(1.12); m.scale.multiplyScalar(1.12); }
  return o;
}

// The pack on the spine (a child of the body at (0, 2.1, .56)). Its thruster nacelles are separate groups.
function pack() {
  const o = [];
  o.push(loft([{ y: -.4, hx: .28, hz: .17 }, { y: 0, hx: .34, hz: .2 }, { y: .38, hx: .3, hz: .17 }], S.metal, 0, 0, 0, { c: .05, bevel: .02 }));
  o.push(slab(.58, .2, .36, S.armor, 0, .42, 0, { top: { sx: .8, sz: .8 }, bevel: .03 }), slab(.04, .14, .015, S.glow, 0, .42, .187), ...slats(4, .5, .04, .07, .13, S.armor, 0, -.005, .22, 'y'));
  for (const s of [-1, 1]) {
    o.push(put(cyl(.06, .075, .3, S.metal, 0, 0, 0, 10), s * .2, .58, .08, 0, 0, -s * .12), put(cyl(.085, .085, .03, S.armor, 0, 0, 0, 10), s * .23, .73, .08, 0, 0, -s * .12), put(cyl(.05, .05, .015, S.glow, 0, 0, 0, 10), s * .232, .745, .08, 0, 0, -s * .12));
    o.push(slab(.16, .22, .2, S.armor, s * .31, -.08, .04, { bevel: .03 }));
    o.push(cable([[s * .12, -.36, .08], [s * .15, -.5, .0], [s * .2, -.56, -.24]], .024, S.rubber, 12, 5));
  }
  o.push(rod([.2, .52, .1], [.28, 1.0, .1], .012, .006, S.steel, 5));
  return o;
}

// One thruster nacelle, centred on its own axis (Z). The jet flame starts at z = .35.
function thruster() {
  const o = [];
  o.push(tube(.2, .2, .34, S.metal, 0, 0, -.04, 18), tube(.235, .235, .1, S.armor, 0, 0, -.2, 18), tube(.215, .215, .06, S.armor, 0, 0, .05, 18));
  o.push(tube(.27, .17, .2, S.metal, 0, 0, .23, 18), ring(.265, .02, S.armor, 0, 0, .33, 'z', 20), tube(.25, .25, .015, S.rubber, 0, 0, .338, 18), tube(.12, .12, .01, S.metal, 0, 0, .346, 14), tube(.045, .045, .012, S.glow, 0, 0, .352, 8));
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; o.push(put(slab(.03, .1, .02, S.steel, 0, 0, 0), Math.sin(a) * .17, Math.cos(a) * .17, .348, 0, 0, -a)); }
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + .5; o.push(put(slab(.03, .1, .18, S.armor, 0, 0, 0), Math.sin(a) * .22, Math.cos(a) * .22, -.05, 0, 0, -a)); }
  return o;
}

// Shoulder, pauldron and upper arm (the arm group; the pivot is the shoulder).
function arm() {
  const o = [];
  o.push(barX(.23, .23, .5, S.metal, 0, 0, 0, 16), ring(.235, .022, S.steel, .27, 0, 0, 'x', 20), ring(.235, .022, S.steel, -.27, 0, 0, 'x', 20));
  o.push(put(loft([{ y: -.07, hx: .35, hz: .4 }, { y: .02, hx: .34, hz: .39 }, { y: .09, hx: .26, hz: .31 }, { y: .14, hx: .14, hz: .2 }], S.armor, 0, 0, 0, { c: .1, bevel: .018 }), .08, .24, 0, 0, 0, -.14));
  o.push(put(slab(.66, .12, .76, S.paint, 0, 0, 0, { bevel: .03 }), .1, .12, 0, 0, 0, -.2));
  o.push(put(slab(.58, .11, .7, S.armor, 0, 0, 0, { bevel: .03 }), .14, 0, 0, 0, 0, -.28));
  o.push(put(slab(.5, .2, .07, S.paint, 0, 0, 0, { bevel: .025 }), .1, .12, -.42, .25, 0, -.2), put(slab(.5, .2, .07, S.paint, 0, 0, 0, { bevel: .025 }), .1, .12, .42, -.25, 0, -.2));
  o.push(put(slab(.03, .03, .5, S.glow, 0, 0, 0), .38, .08, 0, 0, 0, -.2), put(slab(.07, .3, .64, S.armor, 0, 0, 0, { top: { sx: 1, sz: .85 }, bevel: .025 }), .41, -.08, 0, 0, 0, -.3), slab(.02, .09, .2, S.warn, .455, -.04, -.1), tube(.05, .05, .04, S.glow, .3, .1, -.415, 10));
  for (const [bx, bz] of [[.3, .28], [.3, -.28], [-.1, .28], [-.1, -.28]]) o.push(bolt(S.steel, bx, .32, bz, 'y', .025));
  o.push(loft([{ y: -.2, hx: .15, hz: .17 }, { y: -.6, hx: .14, hz: .15 }], S.metal, 0, 0, 0, { c: .04, bevel: .015 }));
  o.push(slab(.07, .34, .3, S.paint, .18, -.38, 0, { bevel: .025 }), put(slab(.26, .3, .06, S.armor, 0, 0, 0, { bevel: .02 }), 0, -.36, -.18, .08, 0, 0));
  o.push(rod([-.1, -.24, .14], [-.1, -.42, .13], .06, .06, S.metal, 10), rod([-.1, -.4, .13], [-.1, -.58, .12], .032, .032, S.steel, 8), cable([[-.15, -.04, -.1], [-.22, -.3, -.04], [-.17, -.6, .02]], .022, S.rubber, 12, 5));
  o.push(barX(.16, .16, .44, S.metal, 0, -.62, 0, 14), ring(.165, .022, S.steel, .23, -.62, 0, 'x', 18), ring(.165, .022, S.steel, -.23, -.62, 0, 'x', 18), bolt(S.steel, .26, -.62, 0, 'x', .035));
  return o;
}
// Forearm (the elbow group; the pivot is the elbow).
function forearm() {
  const o = [];
  o.push(loft([{ y: -.02, hx: .17, hz: .2 }, { y: -.55, hx: .15, hz: .22 }], S.metal, 0, 0, 0, { c: .05, bevel: .015 }));
  o.push(slab(.4, .44, .48, S.paint, 0, -.27, -.04, { top: { sx: .86, sz: .9 }, bevel: .03 }), slab(.34, .09, .42, S.armor, 0, .02, .02, { bevel: .03 }), slab(.06, .3, .34, S.armor, .23, -.28, -.02, { bevel: .02 }));
  o.push(...slats(3, .02, .03, .22, .07, S.rubber, .262, -.36, -.02, 'y'), slab(.02, .03, .3, S.glow, .265, -.16, -.02));
  o.push(rod([.08, -.04, .27], [.08, -.24, .26], .055, .055, S.metal, 10), rod([.08, -.22, .26], [.08, -.44, .25], .03, .03, S.steel, 8));
  return o;
}

// Thigh, hip cap and rear piston (the leg group; the pivot is the hip). The thigh leans forward from the hip to the knee.
function thigh() {
  const o = [];
  o.push(loft([{ y: 0, hx: .17, hz: .2 }, { y: -.3, hx: .2, hz: .22 }, { y: -.58, hx: .15, hz: .18 }], S.metal, 0, 0, 0, { c: .05, bevel: .015 }));
  o.push(put(slab(.36, .38, .1, S.paint, 0, 0, 0, { top: { sx: .8 }, bevel: .03 }), 0, -.27, -.2, -.12, 0, 0), slab(.07, .4, .34, S.paint, .22, -.27, .02, { bevel: .025 }), slab(.05, .3, .28, S.armor, -.2, -.3, .02, { bevel: .02 }));
  o.push(slab(.44, .12, .46, S.armor, 0, -.04, 0, { bevel: .035 }), slab(.2, .025, .02, S.glow, 0, -.4, -.265));
  o.push(rod([0, -.1, .23], [0, -.36, .22], .06, .06, S.metal, 10), rod([0, -.3, .22], [0, -.56, .2], .033, .033, S.steel, 8), cable([[-.17, -.08, .12], [-.25, -.3, .15], [-.2, -.56, .04]], .025, S.rubber, 12, 5));
  return tilt(o, .2);
}
// Knee joint, knee guard and shin (the knee group; the pivot is the knee). The shin slopes back to the ankle.
function shin() {
  const o = [];
  const joint = [barX(.14, .14, .46, S.metal, 0, 0, 0, 16), ring(.145, .02, S.steel, .235, 0, 0, 'x', 18), ring(.145, .02, S.steel, -.235, 0, 0, 'x', 18), barX(.07, .07, .52, S.rubber, 0, 0, 0, 10), bolt(S.steel, .27, 0, 0, 'x', .04)];
  const guard = [put(slab(.34, .26, .18, S.armor, 0, 0, 0, { top: { sx: .7, sz: .5, oz: -.04 }, bevel: .03 }), 0, 0, -.2, -.25, 0, 0), slab(.2, .03, .02, S.glow, 0, -.1, -.285)];
  const frame = [loft([{ y: 0, hx: .15, hz: .17 }, { y: -.66, hx: .11, hz: .13 }], S.metal, 0, 0, 0, { c: .04, bevel: .015 })];
  frame.push(slab(.34, .42, .09, S.paint, 0, -.3, -.19, { top: { sx: .85 }, bevel: .03 }), slab(.36, .4, .24, S.paint, 0, -.24, .2, { top: { sx: .72, sz: .62, oz: .03 }, bevel: .03 }), ...slats(3, .2, .02, .02, .08, S.rubber, 0, -.28, .325, 'y'));
  frame.push(slab(.3, .16, .28, S.armor, 0, -.52, -.02, { bevel: .03 }), slab(.05, .34, .3, S.armor, .2, -.3, .03, { bevel: .02 }), rod([0, -.05, .31], [0, -.3, .34], .055, .055, S.metal, 10), rod([0, -.28, .34], [0, -.56, .3], .03, .03, S.steel, 8));
  o.push(...joint, ...guard, ...tilt(frame, -.34));
  return o;
}
// Ankle and foot (the ankle group; the sole is at y = -.11).
function foot() {
  const o = [];
  o.push(barX(.1, .1, .34, S.metal, 0, 0, 0, 14), bolt(S.steel, .18, 0, 0, 'x', .035), slab(.3, .14, .26, S.armor, 0, .05, .04, { bevel: .03 }));
  o.push(slab(.44, .07, .62, S.metal, 0, -.075, -.2, { bevel: .02 }), slab(.42, .1, .5, S.armor, 0, -.03, -.22, { top: { sx: .9, sz: .84, oz: .02 }, bevel: .03 }));
  o.push(put(slab(.4, .08, .2, S.paint, 0, 0, 0, { top: { sx: .8, sz: .6, oz: -.04 }, bevel: .025 }), 0, -.05, -.52, .12, 0, 0), slab(.3, .12, .16, S.metal, 0, -.05, .15, { bevel: .025 }), slab(.2, .04, .16, S.warn, 0, .02, .15));
  return o;
}

const frameSpec = () => {
  if (mechGeometryCache.has('frame')) return mechGeometryCache.get('frame');
  const f = {
    body: single(torso, 'core', 2.2), root: single(pelvis, 'core', 1.4), head: single(head, 'head', 2.94), pack: single(pack, 'core', 2.1), thruster: spec(thruster, 'core', 2),
    arm: spec(arm, 'arm', 2.62), elbow: spec(forearm, 'arm', 2), leg: spec(thigh, 'leg', 1.32), knee: spec(shin, 'leg', .73), ankle: spec(foot, 'leg', .11),
  };
  mechGeometryCache.set('frame', f); return f;
};

// Cached rounded-off box for the little add-on plates of the enemy variants.
function plateGeometry(w, h, d) {
  const key = [w, h, d].join('/');
  if (!mechGeometryCache.has(key)) { resetTone(5); const g = bakeMeshes([slab(w, h, d, S.paint)], {})[0].geometry; g.userData.shared = true; mechGeometryCache.set(key, g); }
  return mechGeometryCache.get(key);
}
function jetGeometry() {
  if (!mechGeometryCache.has('jet')) { const g = new T.ConeGeometry(.17, .5, 10); g.translate(0, .25, 0); g.userData.shared = true; mechGeometryCache.set('jet', g); }
  return mechGeometryCache.get('jet');
}

// ---- The mech --------------------------------------------------------------------------------------------------------
export function makeMech(team = 'red', scale = 1, variant = 'gunner', build = null) {
  const info = ENEMY_TYPES[variant] || ENEMY_TYPES.gunner, red = team === 'red';
  const group = new T.Group(); group.scale.setScalar(scale);
  const mats = mechMaterials(red ? { paint: info.color, armor: info.armor, glow: info.glow, emissive: info.glow } : {});
  const { paint, armor, metal, glow } = mats, parts = [], limbs = {}, f = frameSpec();
  const part = (parent, name, w, h, d, x, y, z, material = paint) => {
    const mesh = new T.Mesh(plateGeometry(w, h, d), material); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; mesh.userData.part = name; mesh.userData.baked = true; parent.add(mesh); parts.push(mesh); return mesh;
  };
  const node = (parent, x, y, z) => { const g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const body = node(group, 0, 0, 0); limbs.body = body; addBaked(body, f.body, mats, parts); addBaked(group, f.root, mats, parts);
  const head = node(body, 0, 2.94, 0); limbs.head = head; addBaked(head, f.head, mats, parts);
  const pack = node(body, 0, 2.1, .56); addBaked(pack, f.pack, mats, parts); group.userData.pack = pack;
  for (const side of [-1, 1]) {
    const label = side < 0 ? 'left' : 'right', which = side < 0 ? 'left' : 'right';
    const leg = node(group, side * .43, 1.32, 0); limbs[label + 'Leg'] = leg; addBaked(leg, f.leg[which], mats, parts);
    const knee = node(leg, 0, -.59, -.12); limbs[label + 'Knee'] = knee; addBaked(knee, f.knee[which], mats, parts);
    const ankle = node(knee, 0, -.62, .22); limbs[label + 'Ankle'] = ankle; addBaked(ankle, f.ankle[which], mats, parts);
    const arm = node(body, side * .93, 2.62, 0); limbs[label + 'Arm'] = arm; addBaked(arm, f.arm[which], mats, parts);
    const elbow = node(arm, 0, -.62, 0); limbs[label + 'Elbow'] = elbow; addBaked(elbow, f.elbow[which], mats, parts);
    if (!build) { const gun = makeGun(side < 0 ? 'gatling' : 'flak', paint, metal, glow); gun.position.set(0, -.44, -.29); gun.scale.setScalar(.55); elbow.add(gun); limbs[label + 'Gun'] = gun; }
    const thruster = node(body, side * .42, 2.02, .6); addBaked(thruster, f.thruster[which], mats, parts); limbs[label + 'Thruster'] = thruster;
    const flame = new T.Mesh(jetGeometry(), glow); flame.rotation.x = Math.PI / 2; flame.userData.keep = true; flame.position.set(side * .42, 2.02, .96); body.add(flame); limbs[label + 'Jet'] = flame;
  }
  if (red) {
    addEnemyDetails(variant,body,mats,parts);
    if (variant === 'striker') {
      body.scale.set(.79, 1, .82); head.scale.set(.85, 1.25, .9);
      for (const side of [-1, 1]) { const fin = part(limbs[side < 0 ? 'leftArm' : 'rightArm'], 'arm', .13, .9, .7, side * .28, .25, .1, paint); fin.rotation.z = side * -.4; part(limbs[side < 0 ? 'leftElbow' : 'rightElbow'], 'arm', .12, .17, 1.3, 0, -.25, -.6, metal); part(limbs[side < 0 ? 'leftElbow' : 'rightElbow'], 'arm', .025, .08, 1.12, 0, -.32, -.6, glow); }
    } else if (variant === 'sniper') {
      body.scale.x = .85; part(body, 'core', .13, 1.7, .13, .6, 3, .35, metal); part(body, 'core', .23, .14, .23, .6, 3.88, .35, glow);
      part(limbs.rightGun, 'arm', .16, .16, 1.4, 0, .12, -1.25, metal); part(limbs.rightGun, 'arm', .18, .18, .35, 0, .45, -.1, glow); head.scale.set(.85, 1.35, .95);
    } else if (variant === 'bulwark' || variant === 'archon') {
      body.scale.x = variant === 'archon' ? 1.5 : 1.3; group.scale.multiplyScalar(variant === 'archon' ? 1.3 : 1.06);
      for (const side of [-1, 1]) { part(body, 'core', .75, .55, 1.0, side * .9, 2.95, .12, paint); for (let k = 0; k < 3; k++) part(body, 'core', .16, .16, .18, side * (.7 + k * .16), 2.95, -.43, glow); }
      part(limbs.leftArm, 'arm', .95, 1.1, .25, -.22, -.45, -.57, armor); part(limbs.leftArm, 'arm', .1, .8, .1, -.22, -.45, -.73, glow);
      if(variant==='bulwark'){
        // Exposed rear reactor sits proud of the backpack, between its exhausts.
        part(body,'core',.88,1.02,.24,0,2.4,.99,metal);
        for(const side of [-1,1])part(body,'core',.13,.91,.12,side*.37,2.4,1.16,armor);
        const reactorMat=new T.MeshStandardMaterial({color:'#ff8658',emissive:'#ff4c24',emissiveIntensity:1.45,metalness:.35,roughness:.28});
        const reactor=part(body,'reactor',.52,.69,.09,0,2.4,1.185,reactorMat);group.userData.reactor=reactor;
        for(const y of [1.94,2.86])part(body,'core',.69,.08,.1,0,y,1.17,armor);
      }
      if (variant === 'archon') { for (let i = -2; i <= 2; i++) { const crest = part(head, 'head', .13, .5 + (.25 - Math.abs(i) * .1), .2, i * .18, .5, 0, glow); crest.rotation.z = -i * .12; } part(body, 'core', .9, 1.2, .55, 0, 2.6, .85, paint); }
    }
  }
  if (build) dressMech(build, { group, body, head, pack, limbs, parts, paint, armor, metal, glow, mats, makeGun });
  group.userData.archetype = red ? variant : 'pilot';
  return { group, parts, limbs, paint, glow, armor };
}

// ---- Arm guns -----------------------------------------------------------------------------------------------------------
// The gun's static geometry is built once per model and cached; each call dresses a fresh group with it. `barrels` spin while firing.
function gunSpec(type) {
  const key = `gun:${type}`; if (mechGeometryCache.has(key)) return mechGeometryCache.get(key);
  resetTone(31);
  const gun = new T.Group(), barrels = new T.Group(); gun.add(barrels);
  const add = (...ms) => { for (const m of ms) gun.add(m); };
  add(slab(.58, .56, .92, S.paint, 0, 0, .18, { bevel: .05 }), slab(.34, .07, .8, S.armor, 0, .3, .12, { bevel: .02 }), slab(.28, .08, .9, S.metal, 0, .37, .02), slab(.4, .05, .3, S.warn, 0, .31, .42));
  add(cable([[-.18, .37, .3], [-.18, .58, .3], [.18, .58, .3], [.18, .37, .3]], .035, S.metal, 12, 6), cyl(.1, .1, .12, S.steel, 0, 0, .68, 12));
  for (const s of [-1, 1]) {
    add(slab(.03, .3, .66, S.armor, s * .3, 0, .18, { bevel: .01 }), slab(.026, .035, .28, S.glow, s * .325, .11, .04), ...slats(3, .03, .03, .45, .065, S.rubber, s * .325, -.14, .17, 'y'));
    add(bolt(S.steel, s * .32, .2, .45, 'x', .025), bolt(S.steel, s * .32, -.2, .45, 'x', .025));
  }
  gun.userData.muzzle = null;
  if (type === 'gatling') {
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; barrels.add(tube(.052, .052, 1.05, S.metal, Math.sin(a) * .15, Math.cos(a) * .15, -.65, 8)); }
    for (const z of [-.29, -.95]) barrels.add(tube(.235, .235, .12, S.steel, 0, 0, z, 16));
    barrels.add(tube(.14, .14, .6, S.metal, 0, 0, -.6, 12), tube(.2, .2, .06, S.warn, 0, 0, -.12, 14));
  } else if (!addGunBarrels(type, { gun, barrels, metal: S.metal, trim: S.trim, glowing: S.glow })) {
    barrels.add(tube(.2, .15, 1, S.metal, 0, 0, -.65, 16), tube(.235, .235, .14, S.trim, 0, 0, -1.15, 16), tube(.19, .19, .05, S.warn, 0, 0, -.18, 14));
    for (let i = 0; i < 4; i++) barrels.add(ring(.165, .02, S.trim, 0, 0, -.4 - i * .17, 'z', 16));
    barrels.add(tube(.15, .15, .03, S.rubber, 0, 0, -1.235, 12));
  }
  const entry = { body: bakeSpec(gun.children.filter(c => c.isMesh), { y0: 1.8 }).sort((a, b) => (b.slot === 'paint') - (a.slot === 'paint')), barrels: bakeSpec(barrels.children, { y0: 1.8 }), muzzle: gun.userData.muzzle ?? -1.19 };
  mechGeometryCache.set(key, entry); return entry;
}
export function makeGun(type = 'gatling', paint, metal, glowing) {
  const wear = brushedWear(), own = [];
  const mats = { paint: paint || (own[0] = new T.MeshStandardMaterial({ color: '#345e85', metalness: .75, roughness: .37, map: wear, bumpMap: wear, bumpScale: .008, vertexColors: true })), metal: metal || (own[1] = new T.MeshStandardMaterial({ color: '#1d2a35', metalness: .85, roughness: .4, vertexColors: true })), glow: glowing || (own[2] = new T.MeshStandardMaterial({ color: '#92e7ef', emissive: '#43c9e9', emissiveIntensity: 2 })) };
  mats.trim = new T.MeshStandardMaterial({ color: '#b5c8ce', metalness: .85, roughness: .26, vertexColors: true });
  mats.armor = mats.trim; mats.steel = mats.trim; mats.rubber = new T.MeshStandardMaterial({ color: '#12181d', metalness: .05, roughness: .88, vertexColors: true }); mats.warn = new T.MeshStandardMaterial({ color: '#d98a2b', metalness: .2, roughness: .55, vertexColors: true });
  const entry = gunSpec(type), gun = new T.Group(), barrels = new T.Group();
  // The painted hull is child 0 (the first-person view recolours it) and userData.paint names its material.
  addBaked(gun, entry.body, mats); gun.add(barrels); gun.userData.barrels = barrels; gun.userData.muzzle = entry.muzzle; gun.userData.paint = mats.paint; addBaked(barrels, entry.barrels, mats);
  const flash = new T.Group(), flameMaterial = new T.MeshBasicMaterial({ color: '#ffc177', transparent: true, opacity: .85, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
  flameMaterial.color.multiplyScalar(2.6);
  if (!mechGeometryCache.has('flash')) { const a = new T.ConeGeometry(.22, .8, 7), b = new T.IcosahedronGeometry(.14, 0); a.userData.shared = b.userData.shared = true; mechGeometryCache.set('flash', [a, b]); }
  const [flameGeometry, hotGeometry] = mechGeometryCache.get('flash');
  const flame = new T.Mesh(flameGeometry, flameMaterial); flame.rotation.x = -Math.PI / 2; flame.position.z = -.3; flash.add(flame);
  const hot = new T.Mesh(hotGeometry, new T.MeshBasicMaterial({ color: '#fff5d7', toneMapped: false })); hot.scale.z = 2.1; flash.add(hot);
  flash.position.z = entry.muzzle; flash.visible = false; gun.add(flash); gun.userData.flash = flash;
  return gun;
}
