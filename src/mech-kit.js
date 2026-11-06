// Hard-surface geometry kit shared by the mech builders (mech-frame.js, mech-parts.js, mech-gear.js, mech-weapons.js).
// Every solid is a chamfered / bevelled prism, lathe, tube or extrusion with FLAT-SHADED facets, so edges catch the light the
// way machined armour does. Each solid also carries a baked `color` attribute: bevel facets are lightened (paint worn through
// to bright metal) and every solid gets a tiny tone shift so identical plates are not identical. mech-bake.js later merges the
// solids of a limb per material and adds ambient-occlusion style darkening in the crevices between them.
import * as T from 'three';

export const TAU = Math.PI * 2;
const WEAR = 1.34;
let toneSeed = 1;
// A deterministic +-5% brightness shift per solid. Reset at the start of a builder so cached geometry is reproducible.
const nextTone = () => { toneSeed = (toneSeed * 16807) % 2147483647; return 1 + (toneSeed / 2147483647 - .5) * .1; };
export const resetTone = (s = 1) => { toneSeed = s || 1; };

const mesh = (geometry, material, x = 0, y = 0, z = 0) => { const m = new T.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; return m; };

// ---- Sweeps ------------------------------------------------------------------------------------------------------
// A solid built from rings of points that all share one y. rings[i] = { y, p: [[x, z], ...], wear }, wear marks the strip above
// the ring as a bevel. Points run clockwise seen from above. `smooth` averages normals around each strip (round parts).
function sweep(rings, { smooth = false, facet = null, tone = 1, caps = [true, true] } = {}) {
  const pos = [], nor = [], col = [], n = rings[0].p.length;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = v => Math.hypot(v[0], v[1], v[2]);
  const unit = v => { const l = len(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const emit = (p, nrm, w) => { pos.push(p[0], p[1], p[2]); nor.push(nrm[0], nrm[1], nrm[2]); col.push(w, w, w); };
  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = rings[i], r1 = rings[i + 1], fn = [], pts = [];
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n, A0 = [r0.p[k][0], r0.y, r0.p[k][1]], A1 = [r0.p[k2][0], r0.y, r0.p[k2][1]], B0 = [r1.p[k][0], r1.y, r1.p[k][1]], B1 = [r1.p[k2][0], r1.y, r1.p[k2][1]];
      const n1 = cross(sub(B1, A0), sub(A1, A0)), n2 = cross(sub(B0, A0), sub(B1, A0));
      fn.push(unit(len(n1) > len(n2) ? n1 : n2)); pts.push([A0, A1, B0, B1, len(n1) > 1e-10, len(n2) > 1e-10]);
    }
    for (let k = 0; k < n; k++) {
      const [A0, A1, B0, B1, ok1, ok2] = pts[k], prev = fn[(k + n - 1) % n], next = fn[(k + 1) % n], f = fn[k];
      const na = smooth ? unit([prev[0] + f[0], prev[1] + f[1], prev[2] + f[2]]) : f, nb = smooth ? unit([next[0] + f[0], next[1] + f[1], next[2] + f[2]]) : f;
      const w = (r0.wear || (facet && facet(k)) ? WEAR : 1) * tone;
      if (ok1) { emit(A0, na, w); emit(B1, nb, w); emit(A1, nb, w); }
      if (ok2) { emit(A0, na, w); emit(B0, na, w); emit(B1, nb, w); }
    }
  }
  const cap = (ring, up) => {
    const c = [0, ring.y, 0]; for (const p of ring.p) { c[0] += p[0] / n; c[2] += p[1] / n; }
    const nrm = [0, up ? 1 : -1, 0];
    for (let k = 0; k < n; k++) { const a = [ring.p[k][0], ring.y, ring.p[k][1]], b = [ring.p[(k + 1) % n][0], ring.y, ring.p[(k + 1) % n][1]]; emit(c, nrm, tone); if (up) { emit(b, nrm, tone); emit(a, nrm, tone); } else { emit(a, nrm, tone); emit(b, nrm, tone); } }
  };
  if (caps[0]) cap(rings[0], false); if (caps[1]) cap(rings.at(-1), true);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  return g;
}

// An octagon: a rectangle with its four corners cut by `c`.
const oct = (hx, hz, c, ox = 0, oz = 0) => {
  c = Math.max(.004, Math.min(c, hx * .98, hz * .98));
  return [[-hx + c, -hz], [hx - c, -hz], [hx, -hz + c], [hx, hz - c], [hx - c, hz], [-hx + c, hz], [-hx, hz - c], [-hx, -hz + c]].map(([x, z]) => [x + ox, z + oz]);
};
const circ = (r, seg, ox = 0, oz = 0) => Array.from({ length: seg }, (_, k) => [ox + Math.cos(k / seg * TAU) * r, oz + Math.sin(k / seg * TAU) * r]);
const chamferFacet = k => k % 2 === 1;

// Rings with a bevel at both ends: an inset ring at each end, then the full-size ring `bevel` further in.
function bevelled(sections, bevel, make) {
  const first = sections[0], last = sections.at(-1), size = s => Math.min(s.hx ?? s.r, s.hz ?? s.r);
  const b = Math.max(0, Math.min(bevel, (last.y - first.y) * .34, size(first) * .5, size(last) * .5));
  if (b < .003) return sections.map(s => ({ y: s.y, p: make(s, 0) }));
  const rings = [{ y: first.y, p: make(first, b), wear: true }, { y: first.y + b, p: make(first, 0) }];
  for (let i = 1; i < sections.length - 1; i++) rings.push({ y: sections[i].y, p: make(sections[i], 0) });
  rings.push({ y: last.y - b, p: make(last, 0), wear: true }, { y: last.y, p: make(last, b) });
  return rings;
}

// A prism through octagonal sections: [{ y, hx, hz, ox, oz, c }]. This is the workhorse for plates, limb segments and housings.
export function loftGeometry(sections, { c = .035, bevel = 0, tone = nextTone() } = {}) {
  const S = sections.map(s => ({ c, ox: 0, oz: 0, ...s }));
  return sweep(bevelled(S, bevel, (s, inset) => oct(s.hx - inset, s.hz - inset, s.c - inset * .45, s.ox, s.oz)), { facet: chamferFacet, tone });
}
// A solid of revolution: [{ y, r }] with `seg` sides. Smooth around, creased at the rings.
export function latheGeometry(sections, { seg = 12, bevel = 0, smooth = seg > 8, tone = nextTone() } = {}) {
  return sweep(bevelled(sections, bevel, (s, inset) => circ(Math.max(.001, s.r - inset), seg)), { smooth, tone });
}

export const loft = (sections, material, x = 0, y = 0, z = 0, options) => mesh(loftGeometry(sections, options), material, x, y, z);
export const lathe = (sections, material, x = 0, y = 0, z = 0, options) => mesh(latheGeometry(sections, options), material, x, y, z);

// ---- Primitives (the original kit API, now bevelled) -----------------------------------------------------------------
const bevelFor = (...dims) => { const m = Math.min(...dims); return m < .035 ? 0 : Math.min(.05, m * .2); };
function flatBox(w, h, d) {
  const g = new T.BoxGeometry(w, h, d).toNonIndexed(); g.computeVertexNormals(); g.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(nextTone()), 3));
  g.deleteAttribute('uv'); return g;
}
// A bevelled box. `top` tapers it: { sx, sz, ox, oz } scale and offset the top face (a wedge, a tapered plate).
export function slab(w, h, d, material, x = 0, y = 0, z = 0, { top = null, c, bevel } = {}) {
  const b = bevel ?? bevelFor(w, h, d);
  if (!top && b === 0) return mesh(flatBox(w, h, d), material, x, y, z);
  const t = { sx: 1, sz: 1, ox: 0, oz: 0, ...top }, cc = c ?? Math.max(.01, b * .9);
  return loft([{ y: -h / 2, hx: w / 2, hz: d / 2 }, { y: h / 2, hx: w / 2 * t.sx, hz: d / 2 * t.sz, ox: t.ox, oz: t.oz }], material, x, y, z, { c: cc, bevel: b });
}
export const box = (w, h, d, material, x = 0, y = 0, z = 0) => slab(w, h, d, material, x, y, z);
const roundBevel = (rTop, rBottom, height) => Math.min(.024, Math.min(rTop, rBottom) * .22, height * .22);
const roundSolid = (rTop, rBottom, height, radial) => {
  const b = roundBevel(rTop, rBottom, height);
  if (b < .005 || radial < 5) { const g = new T.CylinderGeometry(rTop, rBottom, height, radial); return g; }
  return latheGeometry([{ y: -height / 2, r: rBottom }, { y: height / 2, r: rTop }], { seg: radial, bevel: b });
};
// A cylinder lying along Z. rTop faces the back (+z), rBottom faces the front (-z).
export const tube = (rTop, rBottom, length, material, x = 0, y = 0, z = 0, radial = 12) => { const m = mesh(roundSolid(rTop, rBottom, length, radial), material, x, y, z); m.rotation.x = Math.PI / 2; return m; };
// An upright cylinder (along Y).
export const cyl = (rTop, rBottom, height, material, x = 0, y = 0, z = 0, radial = 12) => mesh(roundSolid(rTop, rBottom, height, radial), material, x, y, z);
// A cylinder lying along X.
export const barX = (rTop, rBottom, length, material, x = 0, y = 0, z = 0, radial = 12) => { const m = cyl(rTop, rBottom, length, material, x, y, z, radial); m.rotation.z = Math.PI / 2; return m; };
export const cone = (radius, height, material, x = 0, y = 0, z = 0, radial = 10) => mesh(new T.ConeGeometry(radius, height, radial), material, x, y, z);
export const ball = (radius, material, x = 0, y = 0, z = 0, width = 12, height = 8) => mesh(new T.SphereGeometry(radius, width, height), material, x, y, z);
// A torus. axis 'y' lies flat, 'z' faces front/back, 'x' faces the sides.
export function ring(radius, thickness, material, x = 0, y = 0, z = 0, axis = 'y', segments = 28) {
  const m = mesh(new T.TorusGeometry(radius, thickness, 6, segments), material, x, y, z);
  if (axis === 'y') m.rotation.x = Math.PI / 2; else if (axis === 'x') m.rotation.y = Math.PI / 2;
  return m;
}
// A tapered rod between two points (r1 at a, r2 at b).
export function rod(a, b, r1, r2, material, radial = 8) {
  const from = new T.Vector3(...a), to = new T.Vector3(...b), dir = to.clone().sub(from), length = dir.length() || 1e-4;
  const m = mesh(roundSolid(r2, r1, length, radial), material, 0, 0, 0);
  m.position.copy(from).addScaledVector(dir, .5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize()); return m;
}
// Points the +Y axis of a mesh along a direction.
export function aim(m, x, y, z) { m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(x, y, z).normalize()); return m; }
// An extruded flat plate from a list of [x, y] points, optionally with holes. It faces +Z and is `depth` thick, centred on z = 0.
// Plates thicker than 4 cm get a small bevel inside their outline.
export function plate(points, depth, material, holes = [], bevel) {
  const shape = new T.Shape(points.map(([x, y]) => new T.Vector2(x, y)));
  for (const hole of holes) shape.holes.push(new T.Path(hole.map(([x, y]) => new T.Vector2(x, y))));
  const b = bevel ?? (depth >= .04 ? Math.min(.012, depth * .22) : 0);
  let geometry = new T.ExtrudeGeometry(shape, b > 0 ? { depth: depth - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1 } : { depth, bevelEnabled: false });
  geometry.translate(0, 0, b > 0 ? -(depth - 2 * b) / 2 : -depth / 2);
  if (geometry.index) geometry = geometry.toNonIndexed();
  geometry.computeVertexNormals(); geometry.deleteAttribute('uv');
  const nrm = geometry.attributes.normal, colors = new Float32Array(nrm.count * 3), tone = nextTone();
  for (let i = 0; i < nrm.count; i++) colors.fill(Math.abs(nrm.getZ(i)) > .9 ? tone : tone * WEAR, i * 3, i * 3 + 3);
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  const m = new T.Mesh(geometry, material); m.castShadow = true; return m;
}
export const circlePoints = (radius, count = 16, cx = 0, cy = 0, sx = 1, sy = 1) => Array.from({ length: count }, (_, i) => [cx + Math.cos(i / count * TAU) * radius * sx, cy + Math.sin(i / count * TAU) * radius * sy]);
export const starPoints = (outer, inner, spikes = 5) => Array.from({ length: spikes * 2 }, (_, i) => { const a = Math.PI / 2 + i / (spikes * 2) * TAU, r = i % 2 ? inner : outer; return [Math.cos(a) * r, Math.sin(a) * r]; });

// ---- Detail helpers ------------------------------------------------------------------------------------------------
// A hex bolt head facing +Z (rotate it with `axis`: 'x' faces the sides, 'y' faces up).
export function bolt(material, x, y, z, axis = 'z', r = .028) {
  const m = mesh(new T.CylinderGeometry(r, r, r * .8, 6), material, x, y, z);
  if (axis === 'z') m.rotation.x = Math.PI / 2; else if (axis === 'x') m.rotation.z = Math.PI / 2;
  return m;
}
// A flexible hose through a list of [x, y, z] points.
export function cable(points, radius, material, segments = 16, radial = 5) {
  return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), segments, radius, radial, false), material, 0, 0, 0);
}
// A row of thin slats (vents, louvres, heat-sink fins). axis 'y' stacks them upward, 'x' sideways.
export function slats(count, w, h, d, gap, material, x = 0, y = 0, z = 0, axis = 'y') {
  return Array.from({ length: count }, (_, i) => { const o = (i - (count - 1) / 2) * gap; return slab(w, h, d, material, x + (axis === 'x' ? o : 0), y + (axis === 'y' ? o : 0), z); });
}
// Rotates meshes together about a pivot (a leg segment tilted as one piece).
export function tilt(meshes, rx = 0, ry = 0, rz = 0, pivot = [0, 0, 0]) {
  const q = new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), p = new T.Vector3(...pivot);
  for (const m of meshes) { m.position.sub(p).applyQuaternion(q).add(p); m.quaternion.premultiply(q); }
  return meshes;
}
// Positions a mesh and optionally turns it.
export function put(m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m; }

// Removes and frees every plain mesh under a group while keeping its sub-groups, so a limb can be re-skinned in place.
export function stripMeshes(group, parts) {
  for (const child of [...group.children]) {
    if (child.isMesh) { group.remove(child); if (child.geometry && !child.geometry.userData.shared) child.geometry.dispose(); const i = parts?.indexOf(child) ?? -1; if (i >= 0) parts.splice(i, 1); }
    else if (child.isGroup) stripMeshes(child, parts);
  }
}
export function dropGroup(group, parts) {
  group.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); const i = parts?.indexOf(o) ?? -1; if (i >= 0) parts.splice(i, 1); });
  group.parent?.remove(group);
}
