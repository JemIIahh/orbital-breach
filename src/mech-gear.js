// Headgear, back mounts, leg frames, decals and boost trails for the player's mech. Each builder receives the context that
// makeMech() assembled ({ group, body, head, limbs, parts, paint, armor, metal, glow }) and adds or swaps geometry in place.
// Conventions: the mech faces -Z, +Y is up. The head group sits at (0, 2.94, 0) and is about .6 wide, .45 tall and .55 deep.
import * as T from 'three';
import { TAU, box, tube, cyl, barX, cone, ball, ring, rod, aim, plate, circlePoints, starPoints, stripMeshes, dropGroup } from './mech-kit.js';

const glassMaterial = () => new T.MeshStandardMaterial({ color: '#9fe6f2', emissive: '#2c8196', emissiveIntensity: .5, metalness: .1, roughness: .1, transparent: true, opacity: .42, depthWrite: false });

// ---- Headgear -------------------------------------------------------------------------------------------------
export function buildHead(model, { head, metal, armor, glow, paint }) {
  const add = (...meshes) => { for (const m of meshes) head.add(m); return meshes[0]; };
  if (model === 'recon') {
    for (const s of [-1, 1]) add(rod([s * .2, .22, .16], [s * .34, .98, .3], .016, .01, metal), ball(.04, glow, s * .34, 1, .3));
    add(rod([0, .24, .2], [0, .74, .12], .014, .01, metal), ball(.03, glow, 0, .76, .12));
    add(box(.74, .05, .12, metal, 0, .27, -.2)); for (const s of [-1, 1]) add(box(.09, .03, .02, glow, s * .26, .27, -.265));
    add(rod([.3, .02, -.02], [.42, .05, -.04], .03, .03, metal));
    const dish = cyl(.21, .045, .1, armor, .46, .06, -.06, 18); dish.rotation.z = -Math.PI / 2; dish.rotation.y = .35; add(dish, ball(.04, glow, .52, .06, -.1));
    add(box(.1, .22, .3, armor, -.34, 0, .0), box(.02, .05, .22, glow, -.395, .04, 0));
  } else if (model === 'crest') {
    const radii = [.1, .085, .066, .046, .022];
    for (const s of [-1, 1]) {
      const pts = [[s * .27, .14, -.02], [s * .4, .3, 0], [s * .54, .46, .06], [s * .64, .66, .16], [s * .62, .88, .3]];
      for (let i = 0; i < pts.length - 1; i++) add(rod(pts[i], pts[i + 1], radii[i], radii[i + 1], armor, 10), ball(radii[i + 1] * 1.08, metal, ...pts[i + 1], 8, 6));
      add(ball(.12, metal, ...pts[0]), ball(.04, glow, ...pts[4]));
      const cheek = add(box(.07, .3, .32, armor, s * .33, -.06, -.1)); cheek.rotation.y = s * .2;
    }
    const blade = [[.3, .2], [.12, .56], [-.1, .74], [-.34, .52], [-.3, .2]], crest = plate(blade, .06, armor); crest.rotation.y = Math.PI / 2; crest.position.y = .02; add(crest);
    const inset = plate([[.22, .25], [.1, .5], [-.1, .64], [-.27, .47], [-.24, .27]], .075, glow); inset.rotation.y = Math.PI / 2; inset.position.y = .02; add(inset);
    add(box(.66, .09, .22, metal, 0, .17, -.3));
  } else if (model === 'cyclops') {
    add(box(.76, .26, .3, metal, 0, 0, -.3), box(.82, .06, .36, armor, 0, .17, -.3), box(.8, .05, .3, armor, 0, -.15, -.29));
    for (const s of [-1, 1]) add(tube(.125, .125, .1, armor, s * .21, 0, -.46, 20), tube(.095, .095, .06, glow, s * .21, 0, -.5, 20), tube(.04, .04, .02, metal, s * .21, 0, -.535, 12), ring(.115, .015, metal, s * .21, 0, -.47, 'z', 20));
    add(box(.1, .15, .12, armor, 0, 0, -.45), tube(.026, .026, .03, glow, 0, .045, -.52, 8));
    add(rod([.12, .2, .12], [.16, .52, .2], .014, .01, metal), ball(.028, glow, .16, .54, .2));
  } else if (model === 'warmask') {
    add(box(.64, .46, .1, armor, 0, -.01, -.37));
    const jaw = add(box(.52, .15, .22, armor, 0, -.25, -.3)); jaw.rotation.x = .45;
    add(box(.5, .06, .04, glow, 0, .07, -.425), box(.08, .26, .07, metal, 0, -.02, -.44));
    const ridge = add(box(.66, .1, .28, metal, 0, .19, -.28)); ridge.rotation.x = -.25;
    const ridgeFin = plate([[.26, .2], [.16, .36], [-.2, .38], [-.3, .2]], .07, armor); ridgeFin.rotation.y = Math.PI / 2; ridgeFin.position.y = .1; add(ridgeFin);
    for (const s of [-1, 1]) { add(box(.08, .36, .4, armor, s * .35, -.02, .02)); for (let i = 0; i < 3; i++) add(box(.025, .035, .18, metal, s * .395, -.04 - i * .08, -.12)); }
    for (let i = 0; i < 3; i++) add(box(.3, .02, .03, metal, 0, -.12 - i * .05, -.43));
  } else if (model === 'dome') {
    const glass = glassMaterial(), dome = add(new T.Mesh(new T.SphereGeometry(.52, 26, 16), glass)); dome.scale.set(1, .92, 1.1); dome.position.set(0, .07, -.02);
    for (const turn of [0, Math.PI / 2]) { const rib = add(new T.Mesh(new T.TorusGeometry(.525, .014, 6, 28, Math.PI), armor)); rib.scale.set(1, .92, 1.1); rib.rotation.y = turn; rib.position.set(0, .07, -.02); }
    add(ring(.5, .04, armor, 0, -.17, -.02, 'y', 28), cyl(.46, .5, .1, metal, 0, -.22, 0, 24), ball(.04, glow, 0, .56, -.02));
  } else if (model === 'halo') {
    for (const s of [-1, 1]) add(barX(.13, .13, .12, armor, s * .35, 0, .02, 16), barX(.08, .08, .03, glow, s * .42, 0, .02, 14), rod([s * .3, .1, .02], [s * .06, .24, .12], .014, .014, metal));
    add(rod([0, .2, .12], [0, .66, .1], .045, .03, metal));
    add(ring(.46, .032, glow, 0, .8, .1, 'y', 40), ring(.38, .014, armor, 0, .8, .1, 'y', 36), cyl(.14, .04, .07, armor, 0, .72, .1, 14));
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + .5; add(rod([0, .66, .1], [Math.sin(a) * .46, .8, .1 + Math.cos(a) * .46], .018, .014, metal)); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; add(ball(.04, glow, Math.sin(a) * .46, .8, .1 + Math.cos(a) * .46)); }
  } else if (model === 'fin') {
    const fin = plate([[.22, .2], [-.04, .52], [-.34, .78], [-.4, .5], [-.34, .2]], .05, armor); fin.rotation.y = Math.PI / 2; fin.position.y = .06; add(fin);
    const stripe = plate([[.12, .26], [-.1, .5], [-.3, .66], [-.3, .5], [-.26, .26]], .062, glow); stripe.rotation.y = Math.PI / 2; stripe.position.y = .06; add(stripe);
    const visor = add(box(.58, .2, .12, metal, 0, .02, -.36)); visor.rotation.x = .3;
    const line = add(box(.5, .035, .04, glow, 0, .04, -.425)); line.rotation.x = .3;
    add(box(.64, .05, .26, armor, 0, .2, -.24)); head.children.at(-1).rotation.x = -.18;
    for (const s of [-1, 1]) {
      const ear = plate([[0, .0], [.3, .12], [.34, -.16], [.04, -.14]], .04, armor); ear.rotation.y = s * Math.PI / 2 - (s < 0 ? 0 : 0); ear.position.set(s * .3, .02, .0); add(ear);
      add(box(.1, .16, .26, metal, s * .33, -.12, -.1));
    }
  } else if (model === 'crown') {
    add(ring(.35, .04, armor, 0, .26, 0, 'y', 28), ring(.35, .02, glow, 0, .3, 0, 'y', 28));
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TAU, x = Math.sin(a) * .35, z = Math.cos(a) * .35, h = .28 + (i % 2) * .16, spire = cone(.055, h, glow, x * 1.12, .27 + h / 2, z * 1.12, 6);
      aim(spire, x * .5, 1, z * .5); add(spire);
    }
    add(new T.Mesh(new T.OctahedronGeometry(.11), glow)); head.children.at(-1).position.set(0, .66, 0); head.children.at(-1).castShadow = true;
    add(ring(.16, .012, armor, 0, .66, 0, 'x', 20), ring(.16, .012, armor, 0, .66, 0, 'z', 20));
    add(box(.58, .08, .22, metal, 0, .15, -.3));
  }
}

// ---- Back mounts ----------------------------------------------------------------------------------------------
// The factory pack, slats and thrusters are hidden by the new mounts, which bring their own nozzles. The flames
// (limbs.leftJet/rightJet) are moved to those nozzles so the boost animation still lines up.
function clearBack({ pack, limbs }) {
  if (pack) pack.visible = false;
  for (const t of [limbs.leftThruster, limbs.rightThruster]) if (t) t.visible = false;
}
function moveJets({ limbs }, left, right, scale = 1) {
  for (const [jet, p] of [[limbs.leftJet, left], [limbs.rightJet, right]]) if (jet) { jet.position.set(...p); jet.scale.x = scale; jet.scale.z = scale; }
}
export function buildBack(model, ctx) {
  const { body, metal, armor, glow, limbs } = ctx, add = (...meshes) => { for (const m of meshes) body.add(m); return meshes[0]; };
  if (model === 'turbine') {
    clearBack(ctx);
    add(box(.34, .62, .42, metal, 0, 2.12, .62));
    for (const s of [-1, 1]) {
      const x = s * .43;
      add(tube(.3, .3, .62, armor, x, 2.14, .76, 22), tube(.32, .32, .07, metal, x, 2.14, .45, 22), tube(.27, .21, .2, metal, x, 2.14, 1.16, 22), tube(.19, .19, .03, glow, x, 2.14, 1.27, 18));
      add(ring(.31, .03, metal, x, 2.14, .66, 'z', 22), ring(.31, .03, metal, x, 2.14, .9, 'z', 22), tube(.06, .06, .08, metal, x, 2.14, .42, 10));
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU, blade = box(.045, .2, .015, glow, x + Math.sin(a) * .13, 2.14 + Math.cos(a) * .13, .405); blade.rotation.z = -a + .4; add(blade); }
      add(box(.3, .1, .34, armor, x, 2.5, .6));
    }
    moveJets(ctx, [-.43, 2.14, 1.42], [.43, 2.14, 1.42], 1.35);
  } else if (model === 'wing') {
    clearBack(ctx);
    add(box(.5, .74, .34, metal, 0, 2.15, .6), box(.3, .04, .02, glow, 0, 2.38, .78), box(.36, .1, .1, armor, 0, 2.55, .62));
    for (const s of [-1, 1]) {
      add(tube(.14, .17, .5, armor, s * .3, 1.92, .8, 14), tube(.1, .1, .03, glow, s * .3, 1.92, 1.07, 12));
      for (let i = 0; i < 4; i++) {
        const length = 1.62 - i * .24, pivot = new T.Group(); pivot.position.set(s * .2, 2.28, .62 + i * .05); pivot.rotation.z = -s * (.28 + i * .27); pivot.rotation.x = .12;
        const w = .15 - i * .01, blade = plate([[-w, 0], [w, 0], [w * .9, length * .86], [0, length], [-w * .9, length * .9]], .035, armor), edge = plate([[w * .5, length * .1], [w * .72, length * .1], [w * .64, length * .82], [w * .4, length * .88]], .045, glow);
        pivot.add(blade, edge);
        add(pivot);
      }
    }
    moveJets(ctx, [-.3, 1.92, 1.22], [.3, 1.92, 1.22], 1);
  } else if (model === 'ring') {
    clearBack(ctx);
    add(box(.32, .4, .26, metal, 0, 2.2, .48), tube(.24, .28, .46, metal, 0, 2.2, .72, 20), ring(.54, .07, armor, 0, 2.2, .92, 'z', 32), ring(.46, .024, glow, 0, 2.2, .94, 'z', 32));
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + Math.PI / 4; add(rod([0, 2.2, .78], [Math.sin(a) * .5, 2.2 + Math.cos(a) * .5, .92], .035, .035, metal)); }
    for (const s of [-1, 1]) add(tube(.09, .11, .22, metal, s * .13, 2.2, .98, 12), tube(.07, .07, .03, glow, s * .13, 2.2, 1.1, 12));
    moveJets(ctx, [-.13, 2.2, 1.28], [.13, 2.2, 1.28], .8);
  } else if (model === 'phoenix') {
    clearBack(ctx);
    add(box(.42, .66, .3, metal, 0, 2.12, .6), tube(.13, .13, .04, glow, 0, 2.12, .78, 14), box(.3, .08, .1, armor, 0, 2.5, .6));
    for (const s of [-1, 1]) {
      add(tube(.12, .15, .42, armor, s * .3, 1.94, .78, 12), tube(.08, .08, .03, glow, s * .3, 1.94, 1.0, 12));
      for (let i = 0; i < 5; i++) {
        const length = 1.5 - Math.abs(i - 1.4) * .16, pivot = new T.Group(); pivot.position.set(s * .17, 2.16, .72 + i * .015); pivot.rotation.z = -s * (.14 + i * .2); pivot.rotation.x = .18;
        const w = .1, blade = plate([[-w, 0], [w, 0], [w * 1.25, length * .62], [0, length], [-w * 1.25, length * .62]], .03, armor), rib = plate([[-.014, length * .06], [.014, length * .06], [.014, length * .84], [-.014, length * .84]], .042, glow);
        pivot.add(blade, rib);
        add(pivot);
      }
    }
    moveJets(ctx, [-.3, 1.94, 1.2], [.3, 1.94, 1.2], 1);
  }
}

// ---- Legs -----------------------------------------------------------------------------------------------------
// Replaces the factory leg with an empty group so the arm and gait animation keep working without touching missing parts.
function removeLegs({ group, limbs, parts }) {
  for (const side of ['left', 'right']) {
    const leg = limbs[`${side}Leg`]; dropGroup(leg, parts);
    const placeholder = new T.Group(); placeholder.position.copy(leg.position); group.add(placeholder);
    limbs[`${side}Leg`] = placeholder; delete limbs[`${side}Knee`]; delete limbs[`${side}Ankle`];
  }
}
export function buildLegs(model, ctx) {
  const { group, limbs, parts, metal, armor, glow, paint } = ctx;
  if (model === 'sprinter') {
    for (const side of ['left', 'right']) {
      const leg = limbs[`${side}Leg`], knee = limbs[`${side}Knee`], ankle = limbs[`${side}Ankle`], s = side === 'left' ? -1 : 1;
      stripMeshes(leg, parts);
      knee.position.set(0, -.5, -.1); ankle.position.set(0, -.72, .24);
      leg.add(ball(.17, metal, 0, 0, 0, 12, 8), rod([0, -.02, 0], [0, -.5, -.1], .17, .12, armor, 10), box(.38, .34, .14, paint, 0, -.24, -.2));
      knee.add(barX(.13, .13, .4, metal, 0, 0, 0, 12), box(.34, .24, .28, armor, 0, 0, -.1), rod([0, 0, 0], [0, -.72, .24], .125, .075, metal, 10), rod([s * .13, -.08, .04], [s * .1, -.62, .22], .04, .028, armor), box(.24, .5, .09, paint, 0, -.36, -.06));
      knee.children.at(-1).rotation.x = .32;
      ankle.add(ball(.11, metal, 0, 0, 0), rod([0, 0, 0], [0, -.1, -.54], .085, .06, armor), box(.26, .07, .4, armor, 0, -.112, -.5), rod([0, 0, 0], [0, -.12, .24], .06, .025, metal), box(.14, .03, .52, glow, 0, -.074, -.48));
    }
  } else if (model === 'tread') {
    removeLegs(ctx);
    for (const s of [-1, 1]) {
      const x = s * .64;
      group.add(box(.5, .44, 1.7, metal, x, .32, 0), box(.58, .12, 1.52, armor, x, .62, 0), box(.06, .36, 1.45, armor, s * .93, .48, 0), box(.58, .3, .42, armor, x, .46, -.92), box(.58, .3, .36, armor, x, .46, .92));
      group.children.at(-2).rotation.x = .55; group.children.at(-1).rotation.x = -.55;
      for (let k = 0; k < 5; k++) { const z = -.68 + k * .34; group.add(barX(.23, .23, .56, metal, x, .26, z, 16), barX(.09, .09, .03, glow, s * .93, .26, z, 10)); }
      for (let k = 0; k < 12; k++) group.add(box(.6, .035, .1, armor, x, .03, -.82 + k * .15));
      group.add(box(.3, .72, .58, armor, s * .5, .98, 0), box(.2, .1, .5, glow, s * .5, 1.35, 0));
    }
  } else if (model === 'hover') {
    removeLegs(ctx);
    group.add(cyl(.34, .42, .72, metal, 0, 1.0, 0, 16), cyl(.92, 1, .16, armor, 0, .55, 0, 18), ring(.9, .05, metal, 0, .64, 0, 'y', 28), ring(.78, .05, glow, 0, .44, 0, 'y', 28), cyl(.5, .66, .12, metal, 0, .42, 0, 18));
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + Math.PI / 4, x = Math.sin(a) * .74, z = Math.cos(a) * .74;
      group.add(cyl(.2, .26, .24, metal, x, .42, z, 14), cyl(.17, .17, .025, glow, x, .295, z, 14), rod([Math.sin(a) * .25, 1.0, Math.cos(a) * .25], [x, .55, z], .05, .05, armor));
    }
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, fin = box(.05, .2, .26, armor, Math.sin(a) * .98, .6, Math.cos(a) * .98); fin.rotation.y = a; group.add(fin); }
  }
}

// ---- Decals ---------------------------------------------------------------------------------------------------
// Emblems for both shoulders (children of the arms, so they swing with them) and the chest plate. `color` is the decal's own
// colour, independent of the paint.
export function buildDecals(model, { body, limbs }, { color, torso }) {
  const ink = new T.MeshStandardMaterial({ color, metalness: .25, roughness: .55 }), dark = new T.MeshStandardMaterial({ color: '#10181e', metalness: .4, roughness: .5 });
  const glowInk = new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4 });
  const chestZ = torso === 'bastion' ? -.64 : -.562, chestY = torso === 'bastion' ? 2.08 : 2.2;
  // A group on the outer face of the pauldron's side guard (normal along +/-X), tilted like the guard.
  const shoulder = side => { const g = new T.Group(); g.position.set(side * .462, -.075, 0); g.rotation.z = side * -.3; (side < 0 ? limbs.leftArm : limbs.rightArm).add(g); return g; };
  // A group on the chest plate facing forward (normal along -Z).
  const chest = (x = 0, y = chestY) => { const g = new T.Group(); g.position.set(x, y, chestZ); g.rotation.y = Math.PI; body.add(g); return g; };
  const facing = (g, side, ...meshes) => { const flat = new T.Group(); flat.rotation.y = side * Math.PI / 2; for (const m of meshes) flat.add(m); g.add(flat); return flat; };
  const flat = (g, ...meshes) => { for (const m of meshes) g.add(m); };

  if (model === 'chevron') {
    for (const side of [-1, 1]) {
      const g = shoulder(side);
      for (let i = 0; i < 3; i++) for (const t of [-1, 1]) { const bar = box(.014, .055, .24, ink, 0, t * .068, .2 - i * .21); bar.rotation.x = t * -.62; g.add(bar); }
    }
    const g = chest(); for (let i = 0; i < 2; i++) for (const t of [-1, 1]) { const bar = box(.2, .045, .016, ink, t * .1, -i * .09 + .04, 0); bar.rotation.z = t * -.5; g.add(bar); }
  } else if (model === 'roundel') {
    for (const side of [-1, 1]) facing(shoulder(side), side, ring(.17, .03, ink, 0, 0, 0, 'z', 24), plate(circlePoints(.1, 18), .014, ink), plate(circlePoints(.05, 14), .02, dark));
    flat(chest(), ring(.19, .032, ink, 0, 0, 0, 'z', 24), plate(circlePoints(.11, 18), .014, ink), plate(circlePoints(.055, 14), .02, dark));
  } else if (model === 'hazard') {
    for (const side of [-1, 1]) { const g = shoulder(side); g.add(box(.012, .17, .72, dark, 0, 0, 0)); for (let k = 0; k < 6; k++) { const stripe = box(.016, .17, .07, ink, 0, 0, -.3 + k * .12); stripe.rotation.x = .55; g.add(stripe); } }
    const g = chest(); g.add(box(.6, .12, .014, dark, 0, 0, 0)); for (let k = 0; k < 7; k++) { const stripe = box(.07, .12, .018, ink, -.27 + k * .09, 0, 0); stripe.rotation.z = .55; g.add(stripe); }
  } else if (model === 'tally') {
    const l = shoulder(-1); for (let k = 0; k < 4; k++) l.add(box(.014, .26, .03, ink, 0, 0, .27 - k * .1)); const slash = box(.016, .03, .46, ink, 0, 0, .12); slash.rotation.x = .5; l.add(slash);
    const r = shoulder(1); r.add(box(.014, .05, .62, ink, 0, .07, 0), box(.014, .05, .4, ink, 0, -.06, .1));
    const g = chest(); for (let k = 0; k < 5; k++) g.add(box(.025, .2, .014, ink, -.15 + k * .075, 0, 0)); const cross = box(.42, .025, .016, ink, 0, 0, 0); cross.rotation.z = .3; g.add(cross);
  } else if (model === 'wings') {
    const wingPts = [[.04, .02], [.22, .13], [.4, .15], [.55, .1], [.4, .05], [.5, .0], [.36, -.04], [.42, -.09], [.26, -.08], [.04, -.05]];
    const g = chest(0, chestY + .02); g.scale.setScalar(.88); g.add(plate(wingPts, .02, ink)); g.add(plate(wingPts.map(([x, y]) => [-x, y]).reverse(), .02, ink)); g.add(plate(circlePoints(.05, 4, 0, 0, 1, 1.4), .024, glowInk));
    const leaf = [[0, .17], [.1, .05], [.1, -.06], [0, -.17], [-.1, -.06], [-.1, .05]];
    for (const side of [-1, 1]) facing(shoulder(side), side, plate(leaf, .014, ink), plate([[0, .16], [.012, .16], [.012, -.16], [0, -.16]], .02, dark));
  } else if (model === 'star') {
    const star = (r, depth) => plate(starPoints(r, r * .42), depth, ink);
    flat(chest(0, chestY + .02), star(.19, .02));
    for (const side of [-1, 1]) facing(shoulder(side), side, star(.17, .016));
  } else if (model === 'skull') {
    const skull = [[-.11, .12], [-.06, .17], [.06, .17], [.11, .12], [.12, 0], [.07, -.05], [.07, -.13], [-.07, -.13], [-.07, -.05], [-.12, 0]];
    const eyes = [circlePoints(.032, 8, -.055, .03), circlePoints(.032, 8, .055, .03)], nose = [[-.012, -.03], [.012, -.03], [0, -.06]];
    const g = chest(0, chestY + .02); g.scale.setScalar(1.25); g.add(plate(skull, .02, ink, [...eyes, nose]));
    for (let k = 0; k < 3; k++) g.add(box(.012, .06, .024, dark, -.035 + k * .035, -.1, .002));
    for (const side of [-1, 1]) { const g2 = shoulder(side); for (const t of [-1, 1]) { const bone = box(.014, .05, .5, ink, 0, 0, 0); bone.rotation.x = t * .6; g2.add(bone); } }
  } else if (model === 'eye') {
    const almond = [[-.2, 0], [-.12, .07], [0, .1], [.12, .07], [.2, 0], [.12, -.07], [0, -.1], [-.12, -.07]];
    const g = chest(0, chestY); g.add(plate(almond, .02, ink, [circlePoints(.07, 14)])); g.add(plate(circlePoints(.045, 12), .03, glowInk)); g.add(plate(circlePoints(.016, 8), .036, dark));
    for (const side of [-1, 1]) facing(shoulder(side), side, plate(circlePoints(.05, 10, 0, 0, 1.8, 1), .014, glowInk), plate(circlePoints(.02, 8), .02, dark));
  }
}

// ---- Boost trail ----------------------------------------------------------------------------------------------
// Recolours the thruster flames with their own material (so changing the lights does not change the trail) and gives them a pale core.
export function buildTrail(color, { limbs }) {
  const outer = new T.MeshBasicMaterial({ color, transparent: true, opacity: .92, depthWrite: false, toneMapped: false });
  const core = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .55, depthWrite: false, toneMapped: false });
  for (const jet of [limbs.leftJet, limbs.rightJet]) if (jet) { jet.material = outer; const innerGeometry = new T.ConeGeometry(.05, .56, 8); innerGeometry.translate(0, .28, 0); jet.add(new T.Mesh(innerGeometry, core)); }
}
