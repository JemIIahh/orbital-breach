// The Gauntlet arena: the Meridian avenue dressed as a combat arena. Everything lives in one group that is hidden by
// default and shown with setArena(true). It adds no collision and no real-time lights: floodlights are additive cones
// and ground pools, the scoreboard is a canvas texture redrawn only when its numbers change, and the spawn-gate
// shutters are one dynamic instanced mesh. All of it is driven by the same uniforms as the rest of the city.
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createKit } from './city-batch.js';
import { patchMaterial, ANIM, GLSL_NOISE } from './city-shaders.js';
import { PROP_TINTS } from './city-props.js';
import { TOWER_ROWS, towerHeight, hash } from './city-layout.js';

const lin = hex => { const c = new T.Color(hex); return `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`; };

// Yellow-and-black warning stripes drawn in world space, so every rail, jamb and shutter shares one diagonal pattern.
function hazardMaterial(U) {
  return patchMaterial(new T.MeshStandardMaterial({ color: '#ffffff', roughness: .6, metalness: .25 }), 'meridian-hazard', U, {
    color: `{float s=vMWP.x+vMWP.y+vMWP.z;float stripe=step(.5,fract(s*.72));
float wear=.75+.25*vnoise(vMWP.xz*3.+vMWP.y*2.);diffuseColor.rgb=mix(${lin('#14171a')},${lin('#e0a418')},stripe)*wear;}`,
  });
}

// Floodlight cones and their ground pools share one geometry and one draw call. The cone (kind 0) fades along its
// length and at its silhouette; the disc at its far end (kind 1) is squashed onto the ground as a soft spot of light.
function beamMaterial(U) {
  return new T.ShaderMaterial({
    uniforms: { uTime: U.uTime, uDusk: U.uDusk }, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false,
    vertexShader: `attribute float kind;varying float vH;varying float vKind;varying vec3 vN;varying vec3 vV;varying vec3 vC;varying vec2 vR;
void main(){vH=-position.y;vKind=kind;vR=position.xz;vC=instanceColor;mat4 w=modelMatrix*instanceMatrix;vec4 wp=w*vec4(position,1.);vN=vec3(0.,1.,0.);
if(kind>.5)wp.y=.1;else vN=normalize(transpose(inverse(mat3(viewMatrix*w)))*normal);
vec4 mv=viewMatrix*wp;vV=-mv.xyz;gl_Position=projectionMatrix*mv;if(kind<.5&&length(instanceMatrix[1].xyz)<.01)gl_Position=vec4(2.,2.,2.,1.);}`,
    fragmentShader: `uniform float uTime;uniform float uDusk;varying float vH;varying float vKind;varying vec3 vN;varying vec3 vV;varying vec3 vC;varying vec2 vR;
void main(){float a;
if(vKind>.5){float r=length(vR);a=pow(max(0.,1.-r),1.8)*(.18+uDusk*.5);}
else{float fres=abs(dot(normalize(vN),normalize(vV)));a=pow(fres,1.3)*(1.-smoothstep(0.,1.,vH))*smoothstep(0.,.05,vH)*(.8+.2*sin(vH*26.-uTime*1.4+vC.r*9.))*(.085+uDusk*.2);}
gl_FragColor=vec4(vC,a);}`,
  });
}
// Holographic trophies: fresnel rim and scan lines, additive.
function holoMaterial(U) {
  return new T.ShaderMaterial({
    uniforms: { uTime: U.uTime, uDusk: U.uDusk }, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false,
    vertexShader: 'varying vec3 vN;varying vec3 vV;varying vec3 vC;varying float vY;void main(){mat4 w=modelMatrix*instanceMatrix;vec4 mv=viewMatrix*w*vec4(position,1.);vN=normalize(mat3(viewMatrix)*mat3(w)*normal);vV=-mv.xyz;vC=instanceColor;vY=(w*vec4(position,1.)).y;gl_Position=projectionMatrix*mv;}',
    fragmentShader: 'uniform float uTime;varying vec3 vN;varying vec3 vV;varying vec3 vC;varying float vY;void main(){float f=1.-abs(dot(normalize(vN),normalize(vV)));float scan=.7+.3*sin(vY*30.-uTime*5.);gl_FragColor=vec4(vC*1.6,(.16+.8*pow(f,1.6))*scan);}',
  });
}

// The board texture is laid out on a 1200x400 grid and squeezed into 1000x400 pixels, so the 60 unit board fits between the avenue towers.
const BOARD_W = 1000, BOARD_H = 400, LAYOUT_W = 1200;
const fmt = n => Math.max(0, Math.round(n || 0)).toLocaleString('en-US');

export function makeArena(U, materials) {
  const group = new T.Group(); group.name = 'gauntlet-arena'; group.visible = false;
  const kit = createKit(PROP_TINTS), H = hash;
  const { box, cyl } = kit;
  // --- Beams and pools (collected here, built as two instanced meshes below). ---------------------------------------------
  const beams = [], pools = [];
  const beam = (from, to, radius, colorHex, pool = true) => {
    const origin = new T.Vector3(...from), target = new T.Vector3(...to), dir = target.clone().sub(origin), length = dir.length();
    beams.push({ origin, dir: dir.normalize(), length, radius, color: new T.Color(colorHex) });
    if (pool) pools.push({ x: to[0], z: to[2], radius: radius * 1.05, color: new T.Color(colorHex) });
  };
  const lampBank = (x, y, z, face, w = 2.6) => {
    // A rig: housing, a bank of lamps facing the avenue (face is the direction toward it) and two short arms.
    box('steelDark', x, y, z, .7, 1.4, w); box('arenaWhite', x + face * .38, y, z, .08, 1.0, w - .3);
    for (const e of [-w / 2 + .3, w / 2 - .3]) box('steel', x - face * .5, y - .8, z + e, .16, 1.4, .16);
  };

  // Rooftop floodlight rigs on every tower, throwing a visible cone across the avenue.
  for (const side of [-1, 1]) TOWER_ROWS.forEach((z0, row) => {
    const roofY = towerHeight(row, side) + .8, x = side * 29.7, y = roofY + 3.4, z = z0 + (row % 2 ? 5.5 : -5.5);
    box('steelDark', x - side * .6, roofY + 1.6, z, .5, 3.2, .5); lampBank(x, y, z, -side);
    box('steelDark', x - side * .6, roofY + 1.6, z + 5.5 * (row % 2 ? -2 : 2), .5, 3.2, .5); lampBank(x, y, z + 5.5 * (row % 2 ? -2 : 2), -side);
    beam([x, y, z], [side * (4 + row * 2), 0, z0 + (row % 2 ? 14 : -14)], 6 + (row % 2), row % 2 ? '#ffe7bf' : '#cfeaff');
    beam([x, y, z + 5.5 * (row % 2 ? -2 : 2)], [side * (9 - row), 0, z0 + (row % 2 ? -9 : 9)], 5.5, '#ffd9a0');
  });
  // Ground masts along the southern plaza fence.
  for (const side of [-1, 1]) [-92, -80, -66, -52].forEach((z, i) => {
    const x = side * 29.6;
    box('steelDark', x, 6, z, .45, 12, .45); box('steelDark', x - side * .5, 12.2, z, 1.3, .35, 3); lampBank(x - side * .9, 12.9, z, -side, 3);
    beam([x - side * 1.2, 12.9, z], [side * (6 + (i % 2) * 5), 0, z + (i % 2 ? 6 : -6)], 5.2, i % 2 ? '#ffe7bf' : '#d4ecff');
  });
  pools.push({ x: 0, z: -65, radius: 11, color: new T.Color('#ffd08a') }, { x: 0, z: 84, radius: 12, color: new T.Color('#ff9a50') });

  // --- Boundary: hazard kickboards, posts and rails along the facades and the southern plaza, runway lights on the floor. ---------
  const edgeX = 28.8;
  for (const side of [-1, 1]) {
    for (let z = -96; z < 102; z += 4) {
      const inPlaza = z < -42;
      box('hazard', side * edgeX, .42, z + 2, .3, .84, 3.9);
      if (inPlaza) { box('steelDark', side * edgeX, 1.7, z, .22, 3.4, .22); box('hazard', side * edgeX, 2.6, z + 2, .14, .3, 3.9); box('arenaChase', side * edgeX, 3.5, z + 2, .1, .1, 3.7); }
      else box('steelDark', side * edgeX, 1.0, z, .2, 1.2, .2);
      box('arenaChase', side * 26.4, .05, z + 1.4, .22, .03, 1.9); box('arenaChase', side * 15.6, .05, z + 1.4, .16, .03, 1.5);
    }
    // Tower tops are lined with chase lights that sweep down the avenue.
    TOWER_ROWS.forEach((z0, row) => { const y = towerHeight(row, side) + 1.55; for (let k = -5; k <= 5; k++) box('arenaChase', side * 28.6, y, z0 + k * 2.2, .22, .22, 1.7); });
  }

  // --- Entrance wall and gantry at the south end: closed blast doors under a banner and scoreboard. -------------------------
  const sz = -98;
  box('steelDark', 0, 5.5, sz, 62, 11, 2.2); box('hazard', 0, 11.2, sz + .1, 62, .9, 2.4); box('hazard', 0, .45, sz + .1, 62, .9, 2.4);
  for (const side of [-1, 1]) { box('steel', side * 4.6, 4.4, sz + 1.2, 8.8, 8.6, .35); box('hazard', side * 9.3, 4.4, sz + 1.1, .7, 8.8, .5); box('arenaWhite', side * .3, 4.4, sz + 1.2, .14, 8.4, .1); }
  box('hazard', 0, 8.9, sz + 1.2, 18.6, .8, .5); for (let k = -4; k <= 4; k++) box('arenaGate', k * 1.9, 2.2, sz + 1.45, .16, 3.2, .06);
  for (const side of [-1, 1]) { for (let k = 0; k < 3; k++) box('arenaStrobe', side * (11.5 + k * 3.2), 9.6, sz + 1.3, .5, .5, .3); box('arenaCyan', side * 20, 5.5, sz + 1.2, 1.2, 7, .1); box('arenaCyan', side * 27, 5.5, sz + 1.2, 1.2, 7, .1); }
  for (const side of [-1, 1]) { box('steelDark', side * 20, 17, sz + 1, .9, 12, .9); box('steelDark', side * 20, 23.2, sz + 1, 1.2, .5, 1.4); box('arenaWhite', side * 20, 24, sz + 1, .5, .5, .5); box('steelDark', side * 24, 29, sz + 1.6, .6, 12, .6); }
  box('steelDark', 0, 23.2, sz + 1, 40.4, .5, .8); box('arenaChase', 0, 23.6, sz + 1.5, 40, .12, .12);
  // Launch pad under the pilot's spawn: a dark plate ringed by cyan light.
  box('steelDark', 0, .07, -65, 7.4, .06, 7.4); for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; box('arenaCyan', Math.cos(a) * 4.3, .11, -65 + Math.sin(a) * 4.3, 1.2, .04, .22, false, [0, -a + Math.PI / 2, 0]); }
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; box('hazard', Math.cos(a) * 3.3, .115, -65 + Math.sin(a) * 3.3, 1.5, .03, .5, false, [0, -a, 0]); }

  // --- Spawn gates in the northern wall, behind the gateway: four bays with rising shutters. ---------------------------------
  const nz = 105, bayH = 7.2, bays = [{ x: -22, w: 8 }, { x: -6.5, w: 6.2 }, { x: 6.5, w: 6.2 }, { x: 22, w: 8 }];
  box('steelDark', 0, 11.6, nz, 62, 8.8, 2.4); box('hazard', 0, 15.9, nz - .1, 62, .9, 2.6); box('hazard', 0, 7.45, nz - .55, 62, .5, 1.5);
  for (const [a, b] of [[-31, -26], [-18, -9.6], [-3.4, 3.4], [9.6, 18], [26, 31]]) { box('steelDark', (a + b) / 2, bayH / 2, nz, b - a, bayH, 2.4); box('hazard', (a + b) / 2, .35, nz - 1.25, b - a, .7, .2); }
  for (const bay of bays) {
    for (const e of [-1, 1]) box('hazard', bay.x + e * (bay.w / 2 + .3), bayH / 2, nz - 1.3, .6, bayH + .2, .5);
    box('steelDark', bay.x, bayH / 2, nz + .9, bay.w, bayH, .3);
    for (let k = -2; k <= 2; k++) box('arenaGate', bay.x + k * (bay.w / 5.2), 3.6, nz + .7, .5, 6.4, .12);
    box('arenaGate', bay.x, .2, nz + .7, bay.w, .3, .12);
    for (const e of [-1, 1]) box('arenaStrobe', bay.x + e * (bay.w / 2 + .9), bayH + .9, nz - 1.5, .6, .6, .35);
    box('arenaWhite', bay.x, bayH + .55, nz - 1.4, bay.w * .6, .12, .08);
  }
  for (const side of [-1, 1]) box('steelDark', side * 30, 22, nz - 1.2, 1, 12, 1);
  box('steelDark', 0, 28, nz - 1.2, 60, .5, .8);

  // --- Banners and pennants: long banners down the tower faces, flag strings across the plaza. -----------------------------------
  const flags = ['pennantA', 'pennantB', 'pennantC', 'canvasWhite'];
  for (const side of [-1, 1]) TOWER_ROWS.forEach((z0, row) => {
    const h = towerHeight(row, side), xf = side * 29.5, out = -side;
    for (const dz of [-8.4, 8.4]) { const top = h - .4, len = 8.5; box(flags[(row + (dz > 0 ? 1 : 0)) % 3], xf + out * .45, top - len / 2, z0 + dz, .07, len, 2.5); box('light', xf + out * .5, top - len / 2, z0 + dz, .05, len - 1, .22); box('steelDark', xf + out * .3, top + .1, z0 + dz, .3, .2, 2.8); }
  });
  for (const z of [-90, -72, -56]) for (let k = 0; k < 29; k++) {
    const sagAt = i => 9.4 - 1.9 * Math.sin(Math.PI * (i / 28)), x = -28 + k * 2;
    box(flags[k % 4], x, sagAt(k) - .32, z, .36, .5, .04, false, [0, 0, Math.PI / 4]);
    if (k) kit.line('steelDark', x - 2, sagAt(k - 1) + .05, z, x, sagAt(k) + .05, z, .05);
  }
  for (const z of [-90, -72, -56]) for (const side of [-1, 1]) box('steelDark', side * 28.9, 5, z, .3, 10, .3);

  // --- Spectator stands: tiered terraces outside the plaza fence with softly lit seat lights, plus camera drone rigs. ------------------
  for (const side of [-1, 1]) for (const [za, zb] of [[-94, -76], [-72, -52]]) {
    const length = zb - za, zc = (za + zb) / 2;
    for (let tier = 0; tier < 4; tier++) {
      const x = side * (32.4 + tier * 2.5), top = 1.3 + tier * 1.25;
      box('slab', x, top / 2, zc, 2.5, top, length); box('seat', x - side * .2, top + .22, zc, .75, .12, length - .6);
      for (let k = 0; k < Math.floor(length / 1.5); k++) if (H(k * 3 + tier * 17 + side * 5 + za) > .46) box(H(k + tier) > .5 ? 'arenaCyan' : 'arenaChase', x + side * .25, top + .55, za + 1 + k * 1.5, .3, .55, .5);
    }
    box('steelDark', side * 40.2, 6.6, zc, .4, .5, length + 1); for (const e of [za + .5, zb - .5]) box('steelDark', side * 41.2, 3.4, e, .3, 6.8, .3);
    box('hazard', side * 31, .45, zc, .3, .9, length);
  }

  const trophySpots0 = [[-11, -48], [11, -48], [-13, -86], [13, -86]];
  for (const [x, z] of trophySpots0) { box('steelDark', x, .5, z, 1.7, 1, 1.7); box('arenaCyan', x, 1.05, z, 1.9, .1, 1.9); box('arenaWhite', x, 2.1, z, .1, 2.2, .1); }
  const solid = { ...materials, hazard: hazardMaterial(U) };
  const meshes = kit.flush(group, solid, { cast: false });

  // --- Beams and pools: one instanced mesh. Pool-only entries are cones squashed flat, leaving just their ground disc. ----------------------
  const cone = new T.ConeGeometry(1, 1, 24, 1, true); cone.translate(0, -.5, 0);
  const disc = new T.CircleGeometry(1, 28); disc.rotateX(-Math.PI / 2); disc.translate(0, -1, 0);
  for (const [geo, k] of [[cone, 0], [disc, 1]]) geo.setAttribute('kind', new T.Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(k), 1));
  const beamGeometry = mergeGeometries([cone, disc]);
  const dummy = new T.Object3D(), up = new T.Vector3(0, -1, 0), spots = [...beams, ...pools.map(p => ({ origin: new T.Vector3(p.x, 0, p.z), dir: up, length: 0, radius: p.radius, color: p.color, flat: true }))];
  const beamMesh = new T.InstancedMesh(beamGeometry, beamMaterial(U), spots.length);
  spots.forEach((b, i) => { dummy.position.copy(b.origin); dummy.quaternion.setFromUnitVectors(up, b.dir); dummy.scale.set(b.radius, b.flat ? 1e-4 : b.length, b.radius); dummy.updateMatrix(); beamMesh.setMatrixAt(i, dummy.matrix); beamMesh.setColorAt(i, b.color); });
  beamMesh.frustumCulled = false; beamMesh.renderOrder = 6; beamMesh.name = 'arena:beams'; group.add(beamMesh);

  // --- Hologram trophies: a tumbling crystal inside a tilted halo, one instanced mesh. -------------------------------------------------------
  const trophySpots = trophySpots0, holo = holoMaterial(U);
  const gemGeometry = mergeGeometries([new T.IcosahedronGeometry(.9, 1).scale(.8, 1.15, .8), new T.TorusGeometry(1.7, .05, 6, 48).rotateX(1.2).toNonIndexed(), new T.TorusGeometry(1.35, .04, 6, 40).rotateX(-.5).rotateZ(.6).toNonIndexed()]);
  const gem = new T.InstancedMesh(gemGeometry, holo, trophySpots.length); gem.instanceMatrix.setUsage(T.DynamicDrawUsage);
  const gold = new T.Color('#ffc65a'), ice = new T.Color('#74e7ff');
  trophySpots.forEach((_, i) => gem.setColorAt(i, i % 2 ? ice : gold));
  gem.frustumCulled = false; gem.name = 'arena:trophies'; gem.renderOrder = 7; group.add(gem);

  // --- Camera drones: small hovering rigs, one mesh each with the lens baked in as a bright vertex colour. ------------------------------------
  const paintGeometry = (geo, r, g, b) => { geo.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3).map((_, i) => [r, g, b][i % 3]), 3)); return geo; };
  const droneGeometry = mergeGeometries([paintGeometry(new T.BoxGeometry(1.4, .5, 1.1), .3, .33, .36), paintGeometry(new T.BoxGeometry(2.8, .08, .22).translate(0, .25, 0), .5, .52, .55), paintGeometry(new T.BoxGeometry(.22, .08, 2.2).translate(0, .25, 0), .5, .52, .55),
    paintGeometry(new T.CylinderGeometry(.14, .14, .35, 8).translate(0, -.4, .5), .2, .22, .25), paintGeometry(new T.BoxGeometry(.5, .32, .12).translate(0, -.05, .6), .6, 2.6, 3.2)]);
  const droneMaterial = new T.MeshBasicMaterial({ vertexColors: true });
  const drones = [[-21, 9.5, -38], [21, 12, -4], [-21, 11, 26], [21, 9.5, 58]].map(([x, y, z], i) => {
    const drone = new T.Mesh(droneGeometry, droneMaterial); drone.position.set(x, y, z); drone.userData = { base: y, phase: i * 1.9, x, z }; group.add(drone); return drone;
  });

  // --- Shutters: nine slats per bay in one dynamic instanced mesh that bunch at the lintel as the gate opens. -----------------------
  const SLATS = 9, slats = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), solid.hazard, bays.length * SLATS);
  slats.instanceMatrix.setUsage(T.DynamicDrawUsage); slats.frustumCulled = false; slats.name = 'arena:shutters'; slats.castShadow = false; group.add(slats);
  let shutterLevel = -1;
  const setShutters = level => {
    if (Math.abs(level - shutterLevel) < 1e-4) return; shutterLevel = level;
    const e = level * level * (3 - 2 * level), sh = bayH / SLATS;
    bays.forEach((bay, b) => { for (let i = 0; i < SLATS; i++) {
      const rest = i * sh + sh / 2, open = bayH - (SLATS - i) * .13 + .07;
      dummy.position.set(bay.x, rest + (open - rest) * e, nz - .9); dummy.scale.set(bay.w - .1, sh * (1 - e * .45) + .02, .3); dummy.quaternion.identity(); dummy.updateMatrix(); slats.setMatrixAt(b * SLATS + i, dummy.matrix);
    } });
    slats.instanceMatrix.needsUpdate = true;
  };
  setShutters(0);

  // --- Scoreboard: one canvas texture shared by a big board over each wall. -----------------------------------------------------------------------
  const state = { wave: 1, score: 0, lives: 3, best: null }; let drawn = '';
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (canvas) { canvas.width = BOARD_W; canvas.height = BOARD_H; }
  const ctx2 = canvas?.getContext?.('2d') || null;
  const texture = canvas ? new T.CanvasTexture(canvas) : null;
  if (texture) { texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4; }
  function drawBoard() {
    const key = `${state.wave}|${state.score}|${state.lives}|${state.best?.wave}|${state.best?.score}`;
    if (key === drawn) return false; drawn = key;
    const c = ctx2; if (!c) return true;
    const W = LAYOUT_W, Hh = BOARD_H, call = (fn, ...a) => c[fn]?.(...a);
    call('save'); call('scale', BOARD_W / LAYOUT_W, 1);
    c.globalAlpha = 1; c.fillStyle = 'rgba(3,10,18,.86)'; call('fillRect', 0, 0, W, Hh);
    c.fillStyle = 'rgba(120,230,255,.05)'; for (let y = 0; y < Hh; y += 6) call('fillRect', 0, y, W, 2);
    c.strokeStyle = '#6fe6ff'; c.lineWidth = 6; call('strokeRect', 10, 10, W - 20, Hh - 20); c.lineWidth = 2; c.strokeStyle = 'rgba(255,190,90,.9)'; call('strokeRect', 26, 26, W - 52, Hh - 52);
    c.fillStyle = '#ffb44d'; for (let k = 0; k < 23; k++) call('fillRect', 44 + k * 50, 36, 26, 8);
    c.textBaseline = 'alphabetic'; c.letterSpacing = '10px'; c.fillStyle = '#9ceeff'; c.font = '700 44px Teko, Rajdhani, sans-serif'; call('fillText', 'MERIDIAN GAUNTLET', 70, 104);
    c.letterSpacing = '5px'; c.font = '700 32px Rajdhani, sans-serif'; c.fillStyle = '#ffb44d'; call('fillText', 'WAVE', 72, 160); call('fillText', 'SCORE', 520, 160); call('fillText', 'LIVES', 520, 352);
    c.letterSpacing = '0px'; c.fillStyle = '#ffffff'; c.font = '700 230px Teko, Rajdhani, sans-serif'; call('fillText', String(Math.max(1, state.wave)).padStart(2, '0'), 64, 350);
    c.font = '700 150px Teko, Rajdhani, sans-serif'; c.fillStyle = '#9ceeff'; call('fillText', fmt(state.score), 516, 290);
    for (let i = 0; i < 3; i++) { c.beginPath?.(); c.arc?.(672 + i * 52, 340, 17, 0, Math.PI * 2); c.fillStyle = i < state.lives ? '#6fe6ff' : 'rgba(111,230,255,.2)'; call('fill'); }
    c.letterSpacing = '2px'; c.fillStyle = '#cfe9ef'; c.font = '600 30px Rajdhani, sans-serif'; call('fillText', state.best ? `BEST W${state.best.wave} / ${fmt(state.best.score)}` : 'NO RECORD YET', 830, 352);
    c.letterSpacing = '0px'; call('restore');
    return true;
  }
  const boardMaterial = new T.MeshBasicMaterial({ map: texture, color: new T.Color(1.5, 1.5, 1.5), transparent: true, depthWrite: false, side: T.DoubleSide });
  const northBoard = new T.Mesh(new T.PlaneGeometry(60, 24), boardMaterial), southBoard = new T.Mesh(new T.PlaneGeometry(50, 20), boardMaterial);
  northBoard.position.set(0, 41, nz - 2.2); northBoard.rotation.y = Math.PI; southBoard.position.set(0, 32.5, sz + 2);
  northBoard.name = southBoard.name = 'arena:scoreboard'; northBoard.renderOrder = southBoard.renderOrder = 8; group.add(northBoard, southBoard);
  drawBoard(); if (texture) texture.needsUpdate = true;
  // The board texture is redrawn once the display faces finish loading, so numerals are never in the fallback font.
  const refreshFonts = () => { try { Promise.all([document.fonts?.load?.('700 100px Teko'), document.fonts?.load?.('700 30px Rajdhani')]).then(() => { drawn = ''; drawBoard(); if (texture) texture.needsUpdate = true; }).catch(() => {}); } catch { /* fonts unavailable */ } };

  // --- Gate timeline: warn, rise, hold, close. ------------------------------------------------------------------------------------------------
  let pulse = null, pending = false, gateLevel = 0;
  const arena = {
    group, state, bays, meshes: [...meshes, beamMesh, gem, slats], texture, boardMaterial,
    get on() { return group.visible; },
    setOn(on) { const was = group.visible; group.visible = !!on; if (on && !was) { drawn = ''; drawBoard(); if (texture) texture.needsUpdate = true; refreshFonts(); } return group.visible; },
    pulseGates() { if (group.visible) pending = true; },
    setBoard(info = {}) {
      if (info.wave != null) state.wave = info.wave | 0; if (info.score != null) state.score = info.score; if (info.lives != null) state.lives = info.lives | 0;
      if (info.best !== undefined) state.best = typeof info.best === 'number' ? { wave: info.best, score: 0 } : info.best ? { wave: info.best.wave | 0, score: info.best.score || 0 } : null;
      if (drawBoard() && texture) texture.needsUpdate = true;
    },
    update(t) {
      if (!group.visible) return;
      if (pending) { pending = false; pulse = t; }
      let level = 0, glow = 0;
      if (pulse !== null) {
        const e = t - pulse;
        if (e < 0 || e > 4.6) { pulse = null; }
        else { glow = e < .6 ? e / .6 : 1; level = e < .6 ? 0 : e < 1.5 ? (e - .6) / .9 : e < 3.4 ? 1 : Math.max(0, 1 - (e - 3.4) / 1.1); if (e > 3.4) glow = Math.max(0, 1 - (e - 3.4) / 1.2); }
      }
      gateLevel = level; U.uGate.value = glow; setShutters(level);
      for (const d of drones) { d.position.y = d.userData.base + Math.sin(t * 1.1 + d.userData.phase) * .45; d.rotation.y = Math.sin(t * .35 + d.userData.phase) * .8 + (d.userData.x < 0 ? Math.PI / 2 : -Math.PI / 2); }
      trophySpots.forEach(([x, z], i) => { dummy.position.set(x, 3.3 + Math.sin(t * 1.6 + i) * .14, z); dummy.rotation.set(0, t * .7 + i, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); gem.setMatrixAt(i, dummy.matrix); });
      gem.instanceMatrix.needsUpdate = true;
      boardMaterial.opacity = .92 + .08 * Math.sin(t * 2.2);
    },
    get gateLevel() { return gateLevel; },
  };
  return arena;
}
