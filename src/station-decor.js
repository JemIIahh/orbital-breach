import { isSkylightBay } from './station-layout.js';
// Visual dressing for the Kestrel ring: bright white panelling, orange octagonal frames, stencils, airlock frames,
// hydroponics, freight, docked shuttles and the reactor pylons. Everything here is decoration only: no collision
// volumes are added or changed, so movement, windows and cover behave exactly as before.
//
// Draw-call budget: three instanced batches (painted boxes, HDR glow, faceted foliage) and one merged stencil
// mesh, whatever the number of pieces. Per-instance colour carries the white/orange/green variety.
import * as T from 'three';
import { RADIUS as R, HEIGHT as H, HALF_WIDTH as W, BAY_COUNT as N, TAU } from './station-constants.js';
import { LANDING_PAD_EDGE } from './station-layout.js';
import { isAirlock } from './physics.js';
import { bayInfo, bayAngle, sectionOfBay, zoneIndexOfBay, reactorBay, zoneStartBays, zoneOfBay } from './station-zones.js';
import { makeAtlasTexture, numeralRect, wordRect, uvOf, CONTAINER_IDS } from './station-atlas.js';

const color = hex => new T.Color(hex);
const glowColor = (hex, intensity) => new T.Color(hex).multiplyScalar(intensity);
export const PALETTE = {
  white: color('#e6e9e7'), panel: color('#cfd4d3'), grey: color('#aeb4b7'), steel: color('#58626a'), orange: color('#ee6a1c'), dark: color('#232a30'), soil: color('#3b2f27'),
  crop: color('#4c9a45'), cropDark: color('#3a7d3b'), leaf: color('#58a64d'), leafDeep: color('#3f8a44'), trunk: color('#7a5a3c'),
  light: glowColor('#f4f8ff', 2.6), green: glowColor('#06d45f', .8), reactor: glowColor('#ffd9ae', 2.2), engine: glowColor('#9fe8ff', 2.2),
};

const UP = new T.Vector3(0, 0, 1);
const ONE = new T.Vector3(1, 1, 1);
// Deterministic variety: the same ring is built every time.
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const idFor = n => CONTAINER_IDS[Math.floor(hash(n) * CONTAINER_IDS.length)];

// Octagonal corridor section: a flat ceiling run plus 45 degree chamfers into the walls (+z side, mirrored for -z).
const CH = { zA: 6.5, yA: H - .36, zB: 8.3, yB: H - 2.1 };
const chDz = CH.zB - CH.zA, chDy = CH.yB - CH.yA, chLen = Math.hypot(chDz, chDy);
const chMid = { z: (CH.zA + CH.zB) / 2, y: (CH.yA + CH.yB) / 2 };
const chTilt = side => Math.atan2(-chDy, side * chDz); // rotation about x that lays a box along the chamfer
const nIn = { z: -Math.abs(chDy) / chLen, y: -Math.abs(chDz) / chLen }; // unit normal pointing into the corridor (+z side)

export function buildStationDecor(scene, mat, { layout = null, panelMap = null } = {}) {
  const arc = TAU / N, L = TAU * R / N;
  const atlas = makeAtlasTexture();
  const layers = { paint: { m: [], c: [] }, glow: { m: [], c: [] }, foliage: { m: [], c: [] } };
  const decals = { pos: [], nrm: [], uv: [], idx: [] };
  const qa = new T.Quaternion(), eu = new T.Euler(), pv = new T.Vector3(), sv = new T.Vector3(), local = new T.Matrix4();

  // A frame is the local axes of one bay: x along the corridor, y up toward the ring centre, z across the deck.
  const frame = (angle, z = 0) => new T.Matrix4().compose(new T.Vector3(Math.sin(angle) * R, -Math.cos(angle) * R, z), new T.Quaternion().setFromAxisAngle(UP, angle), ONE);
  const put = (layer, tint, f, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    eu.set(rx, ry, rz); qa.setFromEuler(eu); local.compose(pv.set(x, y, z), qa, sv.set(sx, sy, sz));
    layers[layer].m.push(new T.Matrix4().multiplyMatrices(f, local)); layers[layer].c.push(tint);
  };
  // A decal is a flat atlas quad. u is the reading direction, v is "up" in the text; the normal is u x v.
  const decal = (f, c, u, v, w, h, rect) => {
    const { u0, u1, v0, v1 } = uvOf(rect), U = new T.Vector3(...u), V = new T.Vector3(...v), C = new T.Vector3(...c);
    const n = new T.Vector3().crossVectors(U, V).normalize().transformDirection(f), base = decals.pos.length / 3;
    for (const [a, b, tu, tv] of [[-.5, -.5, u0, v0], [.5, -.5, u1, v0], [.5, .5, u1, v1], [-.5, .5, u0, v1]]) {
      const p = C.clone().addScaledVector(U, a * w).addScaledVector(V, b * h).applyMatrix4(f);
      decals.pos.push(p.x, p.y, p.z); decals.nrm.push(n.x, n.y, n.z); decals.uv.push(tu, tv);
    }
    decals.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const wallDecal = (f, side, x, y, w, h, rect) => decal(f, [x, y, side * (W - .18)], [-side, 0, 0], [0, 1, 0], w, h, rect);
  // Floor words read correctly when walking along +x.
  const floorDecal = (f, x, z, w, h, rect, y = .113) => decal(f, [x, y, z], [0, 0, 1], [1, 0, 0], w, h, rect);
  const octagon = (layer, tint, f, x, y, z, size, height) => { put(layer, tint, f, x, y, z, size, height, size); put(layer, tint, f, x, y, z, size, height, size, 0, Math.PI / 4); };

  // The covers keep their exact positions; they are re-skinned further down.
  const covers = [];
  for (let i = 0; i < N; i += 4) { if (isAirlock(i * arc)) continue; for (const side of [-1, 1]) covers.push({ i, side, angle: (i + .4) * arc }); }

  // ---------------------------------------------------------------- per-bay structure
  for (let i = 0; i < N; i++) {
    const a = i * arc, f = frame(a), airlock = isAirlock(a), info = bayInfo(i), zi = zoneIndexOfBay(i), zone = zoneOfBay(i).id;
    const seamPost = i % 12 === 6; // middle of a two-bay airlock doorway: no rib across the opening
    const sectionStart = sectionOfBay(i) !== sectionOfBay(i - 1);

    // Bright ceiling: white panel, orange runners, long light bars flat and on the chamfers.
    if(!isSkylightBay(i))put('paint', PALETTE.white, f, 0, H - .32, 0, L - .1, .08, 13.1);
    else for(const z of [-5.5,5.5])put('paint',PALETTE.white,f,0,H-.32,z,L-.1,.08,2.6);
    if(!isSkylightBay(i))for (const z of [-3.9, 3.9]) put('paint', PALETTE.orange, f, 0, H - .366, z, L - .1, .014, .26);
    if(!isSkylightBay(i))for (const z of [-2.5, 2.5]) put('glow', PALETTE.light, f, 0, H - .376, z, L * .62, .03, .3);
    for (const side of [-1, 1]) {
      const theta = chTilt(side);
      put('paint', PALETTE.panel, f, 0, chMid.y, side * chMid.z, L - .1, .1, chLen, theta);
      put('glow', PALETTE.light, f, 0, chMid.y + nIn.y * .075, side * (chMid.z + nIn.z * .075), L * .62, .03, .5, theta);
      // Orange frame ribs at the start of every bay: chamfer gusset and tall wall rib on both faces of the wall.
      put('paint', PALETTE.orange, f, -L / 2, chMid.y + nIn.y * .12, side * (chMid.z + nIn.z * .12), .36, .24, chLen + .3, theta);
      if (!seamPost) put('paint', PALETTE.orange, f, -L / 2, 4.4, side * (W - .45), .36, 8.8, .55);
      put('paint', PALETTE.orange, f, -L / 2, 4.7, side * (W + .32), .34, 9.4, .45);
      // Utility conduit along the chamfer/wall junction, as in the original corridor.
      put('paint', PALETTE.steel, f, 0, CH.yB - .2, side * (W - .42), L - .2, .17, .17);
    }
    put('paint', PALETTE.orange, f, -L / 2, H - .5, 0, .36, .24, 13.3);

    // Floor guide lines: wide orange lanes and thin outer lines run the whole ring.
    for (const z of [-1.55, 1.55]) put('paint', PALETTE.orange, f, 0, .098, z, L, .012, .34);
    for (const z of [-1.1, 1.1]) put('paint', PALETTE.orange, f, 0, .098, z, L, .012, .07);
    for (const z of [-7.35, 7.35]) put('paint', PALETTE.orange, f, 0, .098, z, L, .012, .22);

    // Exterior roof: white plating, orange edge lines and a pipe run, flush with the walkable roof surface.
    if(!isSkylightBay(i))put('paint', PALETTE.white, f, 0, H + .555, 0, L, .06, 17.0);
    else for(const z of [-6.4,6.4])put('paint',PALETTE.white,f,0,H+.555,z,L,.06,4.3);
    for (const z of [-7.7, 7.7]) put('paint', PALETTE.orange, f, 0, H + .59, z, L, .012, .32);
    if(!isSkylightBay(i))put('paint', PALETTE.orange, f, 0, H + .59, 0, L, .012, .16);
    if (i % 2 === 0 && !isSkylightBay(i)) for (const z of [-3.2, 3.2]) put('paint', PALETTE.steel, f, 0, H + .66, z, L * .98, .1, .1);

    // Planters: round beds with a faceted tree stand off the centre lane in hydroponics.
    const planter = zone === 'hydroponics' && !airlock && i % 4 === 2;
    if (!airlock) {
      for (const side of [-1, 1]) {
        // Orange stripes frame the white sill band; the section numeral (or a louvred vent) sits between them.
        put('paint', PALETTE.orange, f, 0, .14, side * (W - .195), L - .12, .14, .04);
        put('paint', PALETTE.orange, f, 0, 1.86, side * (W - .195), L - .12, .14, .04);
        if (sectionStart) wallDecal(f, side, 0, 1.0, 1.4 * 256 / 192, 1.4, numeralRect(info.section));
        else {
          put('paint', PALETTE.steel, f, 0, 1.0, side * (W - .2), 1.6, .95, .03);
          for (let k = 0; k < 4; k++) put('paint', PALETTE.grey, f, 0, .72 + k * .19, side * (W - .225), 1.5, .07, .03);
        }
        // Window bars: the panes behind them still shatter exactly as before.
        for (const x of [-1.5, -.5, .5, 1.5]) put('paint', PALETTE.dark, f, x, 5.8, side * (W - .3), .07, 7.3, .08);
      }
      // Recessed floor hatches break up the deck.
      if (i % 4 === 2 && !planter && zone !== 'hydroponics') for (const side of [-1, 1]) {
        put('paint', PALETTE.dark, f, 0, .1, side * 3.2, 3.1, .012, 1.7);
        for (let k = 0; k < 5; k++) put('paint', PALETTE.steel, f, 0, .112, side * 3.2 - .68 + k * .34, 3.0, .01, .07);
      }
    } else {
      for (const side of [-1, 1]) {
        // Airlock doorway: glowing green frame, white header with hazard strip, sign plate, chevrons on the deck.
        const edge = i % 12 === 5 ? -L / 2 + .36 : L / 2 - .36;
        put('glow', PALETTE.green, f, edge, 4.65, side * (W - 1.0), .2, 9.0, .2);
        put('glow', PALETTE.green, f, 0, 9.1, side * (W - 1.0), L - .2, .2, .2);
        put('paint', PALETTE.white, f, 0, 10.25, side * W, L, 1.3, .3);
        decal(f, [0, 9.78, side * (W - .17)], [-side, 0, 0], [0, 1, 0], L, .3, wordRect('HAZARD'));
        if (i % 12 === 5) {
          decal(f, [L / 2, 10.38, side * (W - .17)], [-side, 0, 0], [0, 1, 0], 3.4, .85, wordRect('AIRLOCK'));
          for (const x of [L / 2 - 1.7, L / 2, L / 2 + 1.7]) decal(f, [x, .114, side * (W - 1.5)], [-side, 0, 0], [0, 0, side], .9, .9, wordRect('CHEVRON'));
        }
      }
    }

    // ---------------------------------------------------------------- zone dressing
    if (zone === 'hydroponics' && !airlock) {
      for (const side of [-1, 1]) {
        // White racks line the walls: three tiers of crop trays on thin shelves, as in the footage.
        const z = side * (W - 1.15);
        for (const x of [-L / 2 + .45, L / 2 - .45]) put('paint', PALETTE.white, f, x, .7, z, .08, 1.4, .9);
        for (let tier = 0; tier < 3; tier++) {
          const y = .22 + tier * .45;
          put('paint', PALETTE.white, f, 0, y, z, L - .7, .07, .9);
          put('paint', (i + tier) % 2 ? PALETTE.crop : PALETTE.cropDark, f, 0, y + .17, z, L - .85, .27, .74);
        }
      }
    }
    if (planter) {
      const side = (i >> 2) % 2 ? 1 : -1, fp = frame(a, side * 3.0);
      octagon('paint', PALETTE.white, fp, 0, .28, 0, 2.2, .56);
      put('paint', PALETTE.soil, fp, 0, .58, 0, 1.75, .06, 1.75);
      put('paint', PALETTE.trunk, fp, 0, 1.9, 0, .34, 2.6, .34);
      put('foliage', PALETTE.leaf, fp, 0, 4.0, 0, 2.3, 1.05, 2.3); put('foliage', PALETTE.leafDeep, fp, .75, 3.45, .5, 1.5, .8, 1.5); put('foliage', PALETTE.leaf, fp, -.6, 4.75, -.4, 1.5, .8, 1.5);
    }
    if (zone === 'promenade' && !airlock) {
      if (i % 4 === 2) for (const side of [-1, 1]) {
        put('paint', PALETTE.white, f, 0, .36, side * 6.3, 2.4, .36, .72);
        put('paint', PALETTE.orange, f, 0, .56, side * 6.3, 2.2, .05, .6);
      }
      if (zi % 4 === 1) for (const side of [-1, 1]) {
        put('paint', PALETTE.white, f, 0, .28, side * 2.9, .9, .56, .9);
        put('foliage', PALETTE.leaf, f, 0, .95, side * 2.9, .62, .5, .62);
      }
    }
    if (zone === 'freight' && !airlock && zi % 3 === 0) {
      const side = i % 2 === 0 ? 1 : -1, tall = hash(i) > .6, z = side * (W - 1.3);
      for (let level = 0; level < (tall ? 2 : 1); level++) {
        const y = 1.1 + level * 2.15;
        put('paint', level ? PALETTE.panel : PALETTE.white, f, 0, y, z, L - .6, 2.05, 2.1);
        put('paint', PALETTE.orange, f, 0, y + .7, z, L - .55, .3, 2.14);
        put('paint', PALETTE.orange, f, 0, y - .85, z, L - .55, .18, 2.14);
        decal(f, [0, y - .1, z - side * 1.06], [-side, 0, 0], [0, 1, 0], 2.4, .6, wordRect(idFor(i * 7 + level)));
      }
    }
    if (i % 4 === 0) {
      // Wayfinding board hung from the ceiling: zone word and section numeral, readable from both ends.
      put('paint', PALETTE.white, f, 0, 7.75, 0, .12, .7, 4.7); put('paint', PALETTE.orange, f, 0, 7.4, 0, .14, .06, 4.74);
      for (const z of [-2.0, 2.0]) put('paint', PALETTE.steel, f, 0, 9.35, z, .1, 3.2, .1);
      for (const face of [-1, 1]) {
        const u = [0, 0, -face], v = [0, 1, 0], flip = face === -1 ? 1 : -1;
        decal(f, [face * .075, 7.78, -.9 * flip], u, v, 2.7, .675, wordRect(info.zoneName));
        decal(f, [face * .075, 7.78, 1.5 * flip], u, v, .9, .675, numeralRect(info.section));
      }
    }
  }

  // Zone names painted across the deck where each zone begins, and again part-way through long zones.
  const starts = new Set(zoneStartBays());
  for (let i = 0; i < N; i++) {
    const zone = zoneOfBay(i), zi = zoneIndexOfBay(i);
    if (!(starts.has(i) || zi % 9 === 5) || isAirlock(i * arc)) continue;
    floorDecal(frame(i * arc), 0, 0, 7.4, 7.4 / 4, wordRect(zone.name));
  }

  // ---------------------------------------------------------------- cover crates: white and orange containers
  for (const { i, side, angle } of covers) {
    const f = frame(angle, side * 4.6), zone = zoneOfBay(i).id;
    for (const y of [.4, 1.22]) put('paint', PALETTE.orange, f, 0, y, 0, 2.4, .2, 2.24);
    if (zone === 'hydroponics') {
      put('paint', PALETTE.soil, f, 0, 1.97, 0, 2.2, .05, 2.0); put('foliage', PALETTE.leaf, f, 0, 2.5, 0, 1.15, .62, 1.15); put('foliage', PALETTE.leafDeep, f, .5, 2.35, .35, .8, .5, .8);
    } else decal(f, [0, .84, -side * 1.112], [-side, 0, 0], [0, 1, 0], 1.9, .475, wordRect(idFor(i * 3 + (side > 0 ? 1 : 0))));
  }

  // ---------------------------------------------------------------- reactor pylons
  const rb = reactorBay();
  const pylon = (bay, side) => {
    const f = frame(bayAngle(bay), side * 5.7);
    octagon('paint', PALETTE.panel, f, 0, .2, 0, 3.2, .4);
    for (const y of [.5, 9.6]) octagon('paint', PALETTE.orange, f, 0, y, 0, 3.0, .14);
    octagon('glow', PALETTE.reactor, f, 0, 5.1, 0, 1.9, 9.0);
    for (let k = 0; k < 8; k++) { const t = k * Math.PI / 4 + Math.PI / 8; put('paint', PALETTE.steel, f, Math.cos(t) * 1.08, 5.1, Math.sin(t) * 1.08, .24, 9.2, .24, 0, -t); }
    for (const y of [1.3, 5.1, 8.9]) octagon('paint', PALETTE.dark, f, 0, y, 0, 2.6, .38);
    put('paint', PALETTE.dark, f, 0, 10.4, 0, .6, 1.3, .6);
  };
  pylon(rb - 2, -1); pylon(rb + 2, 1);
  const reactorPoint = new T.Vector3(0, 5, 0).applyMatrix4(frame(bayAngle(rb)));
  const reactorLight = new T.PointLight('#ffb277', 24, 22, 2); reactorLight.position.copy(reactorPoint); scene.add(reactorLight);

  // ---------------------------------------------------------------- docked shuttles beyond the landing pads
  const docks = layout?.docks || [];
  docks.forEach((dock, index) => {
    if ((Math.round(dock.angle / arc / 12) + (dock.side > 0 ? 1 : 0)) % 2) return;
    const f = frame(dock.angle), s = dock.side, c = s * (LANDING_PAD_EDGE + 4.6);
    for (const x of [-1.5, 1.5]) for (const dz of [-2.4, 2.4]) put('paint', PALETTE.dark, f, x, -.2, c + dz, .3, 1.2, .3);
    put('paint', PALETTE.white, f, 0, 1.0, c, 3.6, 1.5, 6.6); put('paint', PALETTE.white, f, 0, .9, c - s * 3.5, 2.5, 1.1, 1.8);
    put('paint', PALETTE.white, f, 0, .7, c + s * .6, 9.2, .2, 2.6);
    put('paint', PALETTE.orange, f, 0, .55, c, 3.64, .22, 6.2); put('paint', PALETTE.orange, f, 0, .7, c + s * .6, 9.24, .02, .5);
    put('paint', PALETTE.dark, f, 0, 1.55, c - s * 3.55, 2.1, .46, 1.0);
    for (const x of [-1.0, 1.0]) { put('paint', PALETTE.dark, f, x, 1.0, c + s * 3.4, .9, .9, .6); put('glow', PALETTE.engine, f, x, 1.0, c + s * 3.75, .7, .7, .05); }
    const id = wordRect(idFor(index + 11));
    decal(f, [1.805, 1.12, c], [0, 0, -1], [0, 1, 0], 2.8, .7, id); decal(f, [-1.805, 1.12, c], [0, 0, 1], [0, 1, 0], 2.8, .7, id);
    // Container ids on the dock cargo crates (their inner faces look into the aisle).
    for (const x of [-4.8, 4.8]) decal(f, [x > 0 ? 3.68 : -3.68, 1.0, s * 25], [0, 0, x > 0 ? 1 : -1], [0, 1, 0], 2.4, .6, wordRect(idFor(index * 5 + (x > 0 ? 1 : 0))));
  });

  // ---------------------------------------------------------------- build the meshes
  const meshes = [];
  const painted = new T.MeshStandardMaterial({ color: '#ffffff', metalness: .14, roughness: .52 });
  if (panelMap) painted.map = panelMap;
  const foliage = new T.MeshStandardMaterial({ color: '#ffffff', roughness: .85, flatShading: true });
  const glow = new T.MeshBasicMaterial({ color: '#ffffff' });
  const box = new T.BoxGeometry(1, 1, 1), blob = new T.IcosahedronGeometry(1, 1);
  const instanced = (name, geometry, material, shadow) => {
    const { m, c } = layers[name]; if (!m.length) return;
    const mesh = new T.InstancedMesh(geometry, material, m.length);
    m.forEach((matrix, k) => { mesh.setMatrixAt(k, matrix); mesh.setColorAt(k, c[k]); });
    mesh.instanceColor.needsUpdate = true; mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.computeBoundingSphere(); mesh.name = `decor-${name}`;
    scene.add(mesh); meshes.push(mesh);
  };
  instanced('paint', box, painted, true); instanced('glow', box, glow, false); instanced('foliage', blob, foliage, true);

  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(decals.pos, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(decals.nrm, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(decals.uv, 2));
  geometry.setIndex(decals.idx);
  const stencilMaterial = new T.MeshStandardMaterial({ map: atlas, transparent: true, alphaTest: .03, depthWrite: false, roughness: .65, metalness: 0, emissive: '#ffffff', emissiveMap: atlas, emissiveIntensity: .55, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const stencils = new T.Mesh(geometry, stencilMaterial); stencils.name = 'decor-stencils'; stencils.renderOrder = 2; geometry.computeBoundingSphere();
  scene.add(stencils); meshes.push(stencils);

  return { meshes, stencils, reactorLight, reactorPoint, covers, instances: Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v.m.length])), decalCount: decals.idx.length / 6 };
}
