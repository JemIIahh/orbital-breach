// Models for the newer arm guns and shoulder mounts. Arm guns add static parts to the gun itself and anything round (coils,
// rings) to `barrels`, which the animation spins while firing. Each gun sets gun.userData.muzzle, the z of its muzzle flash.
import * as T from 'three';
import { TAU, box, tube, cyl, cone, ball, ring, rod } from './mech-kit.js';

// Returns true when `type` is one of the guns defined here.
export function addNewGunBarrels(type, { gun, barrels, metal, trim, glowing }) {
  if (type === 'railgun') {
    for (const s of [-1, 1]) { gun.add(box(.13, .2, 2.1, metal, s * .14, .02, -1.35)); gun.add(box(.05, .12, 2.0, trim, s * .225, .02, -1.3)); }
    gun.add(box(.08, .06, 2.0, glowing, 0, .05, -1.32));
    gun.add(box(.2, .12, 1.5, metal, 0, .2, -1.05), box(.36, .3, .5, trim, 0, .06, -.46), box(.3, .12, .4, metal, 0, .26, -.5));
    for (let k = 0; k < 3; k++) gun.add(box(.44, .08, .12, trim, 0, .02, -.9 - k * .5));
    for (let k = 0; k < 4; k++) barrels.add(ring(.22, .055, glowing, 0, 0, -.62 - k * .44, 'z', 20));
    gun.add(box(.46, .34, .14, trim, 0, .02, -2.4)); gun.add(box(.24, .1, .16, metal, 0, .02, -2.4));
    gun.userData.muzzle = -2.55;
  } else if (type === 'lance') {
    gun.add(tube(.08, .08, 1.8, metal, 0, 0, -1.15, 10), tube(.045, .045, 1.7, glowing, 0, 0, -1.15, 8));
    gun.add(tube(.1, .32, .42, glowing, 0, 0, -1.9, 22), ring(.32, .04, trim, 0, 0, -2.1, 'z', 22), ring(.2, .03, trim, 0, 0, -1.78, 'z', 20), ball(.15, glowing, 0, 0, -1.86, 14, 10));
    const spike = cone(.05, .7, trim, 0, 0, -2.45, 8); spike.rotation.x = -Math.PI / 2; gun.add(spike);
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + Math.PI / 4; gun.add(box(.035, .24, .9, metal, Math.sin(a) * .17, Math.cos(a) * .17, -.85)); gun.children.at(-1).rotation.z = -a; }
    for (let k = 0; k < 3; k++) barrels.add(ring(.24, .055, glowing, 0, 0, -.7 - k * .34, 'z', 20));
    gun.userData.muzzle = -2.7;
  } else if (type === 'carbine') {
    gun.add(box(.36, .32, .8, metal, 0, .02, -.65), box(.4, .06, .7, trim, 0, .2, -.62));
    for (const [x, y] of [[0, .1], [-.1, -.06], [.1, -.06]]) { barrels.add(tube(.065, .065, .8, metal, x, y, -1.1, 10)); barrels.add(tube(.075, .075, .06, glowing, x, y, -1.52, 8)); }
    barrels.add(tube(.2, .2, .06, trim, 0, .01, -.98, 14));
    gun.add(box(.14, .13, .5, trim, 0, .44, -.38), tube(.05, .05, .05, glowing, 0, .44, -.66, 8));
    const drum = cyl(.22, .22, .3, metal, 0, -.46, -.02, 16); drum.rotation.z = Math.PI / 2; gun.add(drum); gun.add(box(.1, .28, .12, trim, 0, -.28, -.7));
    gun.userData.muzzle = -1.65;
  } else if (type === 'coil') {
    gun.add(tube(.065, .065, 1.7, metal, 0, 0, -1.0, 8));
    for (let k = 0; k < 6; k++) { const r = .36 - k * .04; barrels.add(tube(r, r, .05, k % 2 ? trim : glowing, 0, 0, -.5 - k * .21, 22)); }
    barrels.add(ball(.13, glowing, 0, 0, -1.78, 14, 10), ring(.19, .018, glowing, 0, 0, -1.78, 'z', 18));
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + Math.PI / 4; gun.add(rod([Math.sin(a) * .34, Math.cos(a) * .34, -.42], [Math.sin(a) * .1, Math.cos(a) * .1, -1.72], .014, .014, glowing)); }
    gun.add(box(.3, .24, .3, trim, 0, 0, -.38));
    gun.userData.muzzle = -2.0;
  } else return false;
  return true;
}

// Returns true when `model` was one of the shoulder pods defined here (the group `g` is filled in).
export function addNewPod(model, g, side, m) {
  if (model === 'hornet') {
    const rack = new T.Group(); rack.rotation.x = .18; g.add(rack);
    rack.add(box(.46, .3, .7, m.metal, 0, 0, .05), box(.5, .06, .5, m.armor, 0, .17, .04));
    for (const x of [-.1, .1]) for (const y of [-.07, .08]) { rack.add(tube(.065, .065, .64, m.armor, x, y, -.1, 8), tube(.045, .045, .05, m.glow, x, y, -.44, 8)); }
    for (const s of [-1, 1]) rack.add(box(.02, .34, .18, m.armor, s * .24, 0, .3));
  } else if (model === 'phalanx') {
    g.add(box(.38, .3, .44, m.metal, 0, 0, .18), box(.3, .08, .3, m.armor, 0, .18, .16));
    for (const s of [-1, 1]) { g.add(tube(.05, .05, .86, m.armor, s * .09, .02, -.36, 10), tube(.075, .075, .12, m.metal, s * .09, .02, -.8, 10), tube(.04, .04, .03, m.glow, s * .09, .02, -.87, 8)); }
    g.add(tube(.14, .14, .08, m.metal, 0, .02, -.2, 12), tube(.14, .14, .08, m.metal, 0, .02, -.5, 12));
    g.add(box(.2, .26, .3, m.armor, side * .3, -.05, .22), rod([side * .22, -.05, .2], [side * .08, .0, .12], .03, .03, m.metal));
  } else if (model === 'howitzer') {
    const barrel = new T.Group(); barrel.rotation.x = .72; barrel.position.set(0, .2, .1); g.add(barrel);
    barrel.add(tube(.11, .14, 1.4, m.metal, 0, 0, -.1, 14), tube(.2, .2, .46, m.armor, 0, 0, .42, 14), tube(.17, .17, .14, m.armor, 0, 0, -.75, 14), box(.34, .06, .16, m.metal, 0, 0, -.8), tube(.1, .1, .03, m.glow, 0, 0, -.83, 12));
    g.add(box(.52, .2, .62, m.armor, 0, -.12, .12), box(.12, .32, .4, m.metal, .2, .04, .06), box(.12, .32, .4, m.metal, -.2, .04, .06));
  } else return false;
  return true;
}
