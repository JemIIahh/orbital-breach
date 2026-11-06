import * as T from 'three';
import { makeObstacle } from './eden-layout.js';
import { attachParts } from './tree-collision.js';

// Collision for the big rock things in Eden, built from the very numbers that draw them (so what you see is what you stand on).
//
//   crags and basalt   a cluster of hexagonal prisms (three.js CylinderGeometry, 6 sides). Each prism becomes a short stack of
//                      cylinders that follows its (leaning) axis and narrows towards the top.
//   boulders           a stack of cylinders that follows the lumpy dome: wide at the foot, a flat stable top you can stand on.
//
// A cluster is ONE obstacle with `parts`, the same compound shape trees use, so bodies are pushed out of every part and land on
// the tops. `partBoxes` lets bullets hit the real shape instead of the cluster's big bounding box.
const HEX = .93; // a regular hexagon's average radius as a fraction of its corner radius
const _a = new T.Vector3(), _b = new T.Vector3(), _m = new T.Matrix4();
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// One hexagonal prism drawn as CylinderGeometry(rTop, rBottom, 1, 6): its axis runs y = -.5 .. .5 in local space, through `local`
// (the prism within the cluster) and then `instance` (the cluster in the world). `band` is the tallest cylinder used, in metres.
export function prismParts(local, instance, { rTop, rBottom, band = 2, out = [] }) {
  _m.multiplyMatrices(instance, local);
  const e = _m.elements, scale = (Math.hypot(e[0], e[1], e[2]) + Math.hypot(e[8], e[9], e[10])) / 2;
  const base = _a.set(0, -.5, 0).applyMatrix4(_m).clone(), top = _b.set(0, .5, 0).applyMatrix4(_m).clone();
  const bands = clamp(Math.ceil(base.distanceTo(top) / band), 1, 8);
  for (let k = 0; k < bands; k++) {
    const t0 = k / bands, t1 = (k + 1) / bands, p0 = _a.copy(base).lerp(top, t0), p1 = _b.copy(base).lerp(top, t1);
    out.push({ type: 'cyl', x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2, y0: Math.min(p0.y, p1.y), y1: Math.max(p0.y, p1.y), r: (rBottom + (rTop - rBottom) * (t0 + t1) / 2) * HEX * scale });
  }
  return out;
}

// A boulder is a squashed, lumpy sphere. Its dome becomes four cylinders: flat tops are what a mech can stand on, and the sides are
// not so far out that the body hangs in the air beside the rock.
const DOME = [-.35, .2, .55, .8, .95];
export function domeParts(cx, cy, cz, rh, rv, out = []) {
  for (let k = 0; k < DOME.length - 1; k++) {
    const f = (DOME[k] + DOME[k + 1]) / 2;
    out.push({ type: 'cyl', x: cx, z: cz, y0: cy + rv * DOME[k], y1: cy + rv * DOME[k + 1], r: rh * Math.sqrt(1 - f * f) * .95 });
  }
  return out;
}

// Wrap parts into one obstacle (see tree-collision.attachParts). `position` is the foot of the cluster, `radius` how far it reaches,
// `box` the whole cluster, and `partBoxes` one box per part for bullets and sight lines.
export function compoundObstacle(kind, parts) {
  let minY = Infinity, sx = 0, sz = 0;
  const box = new T.Box3(), partBoxes = [];
  for (const p of parts) {
    minY = Math.min(minY, p.y0); sx += p.x; sz += p.z;
    const b = new T.Box3(new T.Vector3(p.x - p.r, p.y0, p.z - p.r), new T.Vector3(p.x + p.r, p.y1, p.z + p.r));
    partBoxes.push(b); box.union(b);
  }
  const o = attachParts(makeObstacle(kind, sx / parts.length, minY, sz / parts.length, .01, .01), parts);
  o.radius = o.reach; o.height = o.top - minY; o.box = box; o.partBoxes = partBoxes;
  return o;
}
