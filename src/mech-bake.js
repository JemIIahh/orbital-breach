// Merges the loose solids of a mech limb into one mesh per material and bakes ambient-occlusion style darkening into the vertex
// colours: surfaces near another solid (the crease under a pauldron, the seam between two plates, the root of a piston) are dimmed,
// undersides are a little darker than tops, and the lowest part of the frame carries a touch of grime. Occluders are the
// solids' own oriented bounding boxes, so a whole limb bakes in a few milliseconds and no ray casting is needed.
//
// Two ways in:
//   bakeSpec(meshes, opts)   -> geometry buckets keyed by material SLOT name ('paint', 'armor' ...) for geometry that is built once and
//                               cached; addBaked() then dresses any number of mechs with those buckets and their own materials.
//   bakeLoose(group, opts)   -> merges meshes that were added to a group by hand (headgear, back mounts, weapons) in place.
import * as T from 'three';

// Geometry that is built once and shared by every mech (the frame, guns, pods). Its entries are flagged userData.shared.
export const geometryCache = new Map();
export const SLOT_NAMES = ['paint', 'armor', 'metal', 'steel', 'rubber', 'warn', 'glow', 'trim'];
// Stand-in materials for geometry that is built before any real material exists. `name` is the slot.
// Rubber is baked into the dark metal bucket (darkened), which saves a draw call per limb.
export function slotTokens() {
  const tokens = Object.fromEntries(SLOT_NAMES.map(name => [name, new T.MeshBasicMaterial({ name })]));
  tokens.rubber.userData.aliasOf = tokens.metal; tokens.rubber.userData.tint = .5; return tokens;
}

const AO = { radius: .15, strength: 1.2, max: .6, inside: .42 };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Flattens meshes (all direct children of one group, so mesh.matrix is group space) into one triangle soup per material.
// Returns [{ material, geometry }]. y0 is the group's rest height in the mech, used for the grime gradient on the lower frame.
export function bakeMeshes(meshes, { y0 = 0, mirror = false, ao = true } = {}) {
  const items = [], R = AO.radius, v = new T.Vector3(), nv = new T.Vector3(), box = new T.Box3();
  for (const mesh of meshes) {
    const g = mesh.geometry; if (!g?.attributes.position) continue;
    mesh.updateMatrix(); if (!g.attributes.normal) g.computeVertexNormals(); if (!g.boundingBox) g.computeBoundingBox();
    const M = mesh.matrix.clone(), nm = new T.Matrix3().getNormalMatrix(M), index = g.index, P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
    const count = index ? index.count : P.count, pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3).fill(1);
    for (let i = 0; i < count; i++) {
      const s = index ? index.getX(i) : i;
      v.fromBufferAttribute(P, s).applyMatrix4(M); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      nv.fromBufferAttribute(N, s).applyMatrix3(nm).normalize(); nor[i * 3] = nv.x; nor[i * 3 + 1] = nv.y; nor[i * 3 + 2] = nv.z;
      if (C) { col[i * 3] = C.getX(s); col[i * 3 + 1] = C.getY(s); col[i * 3 + 2] = C.getZ(s); }
    }
    const e = M.elements, scale = (Math.hypot(e[0], e[1], e[2]) + Math.hypot(e[4], e[5], e[6]) + Math.hypot(e[8], e[9], e[10])) / 3;
    box.copy(g.boundingBox).applyMatrix4(M);
    items.push({ mesh, count, pos, nor, col, inv: M.clone().invert().elements, e, scale, min: g.boundingBox.min, max: g.boundingBox.max, lo: [box.min.x - R, box.min.y - R, box.min.z - R], hi: [box.max.x + R, box.max.y + R, box.max.z + R] });
  }
  if (ao) for (const it of items) {
    if (it.mesh.material.userData.noAO) continue;
    const { pos, nor, col, count } = it;
    for (let i = 0; i < count; i++) {
      const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2], nx = nor[i * 3], ny = nor[i * 3 + 1], nz = nor[i * 3 + 2];
      let occ = 0;
      for (const o of items) {
        if (o === it || px < o.lo[0] || px > o.hi[0] || py < o.lo[1] || py > o.hi[1] || pz < o.lo[2] || pz > o.hi[2]) continue;
        const m = o.inv, lx = m[0] * px + m[4] * py + m[8] * pz + m[12], ly = m[1] * px + m[5] * py + m[9] * pz + m[13], lz = m[2] * px + m[6] * py + m[10] * pz + m[14];
        const dx = lx - Math.min(o.max.x, Math.max(o.min.x, lx)), dy = ly - Math.min(o.max.y, Math.max(o.min.y, ly)), dz = lz - Math.min(o.max.z, Math.max(o.min.z, lz));
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1e-10) { occ += AO.inside; continue; }
        const d = Math.sqrt(d2) * o.scale; if (d >= R) continue;
        const k = -1 / Math.sqrt(d2), e = o.e, gx = (e[0] * dx + e[4] * dy + e[8] * dz) * k, gy = (e[1] * dx + e[5] * dy + e[9] * dz) * k, gz = (e[2] * dx + e[6] * dy + e[10] * dz) * k;
        const facing = (nx * gx + ny * gy + nz * gz) / (Math.hypot(gx, gy, gz) || 1); if (facing <= .05) continue;
        const w = 1 - d / R; occ += w * w * (.3 + .7 * facing);
      }
      const sky = .8 + .2 * (ny * .5 + .5), ground = .72 + .28 * smooth(0, 1.15, y0 + py), light = (1 - Math.min(AO.max, occ * AO.strength)) * sky * ground;
      col[i * 3] *= light; col[i * 3 + 1] *= light; col[i * 3 + 2] *= light;
    }
  }
  // Merge per material, project UVs (the brushed-metal texture needs them) and optionally mirror across x.
  const buckets = new Map();
  for (const it of items) {
    const u = it.mesh.material.userData, key = u.aliasOf || it.mesh.material; let b = buckets.get(key); if (!b) buckets.set(key, b = []); b.push(it);
    if (u.tint) for (let i = 0; i < it.col.length; i++) it.col[i] *= u.tint;
  }
  const out = [];
  for (const [material, list] of buckets) {
    const total = list.reduce((s, it) => s + it.count, 0), pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    let at = 0; for (const it of list) { pos.set(it.pos, at * 3); nor.set(it.nor, at * 3); col.set(it.col, at * 3); at += it.count; }
    if (material.userData.noAO) col.fill(1);
    if (mirror) {
      for (let i = 0; i < total; i++) { pos[i * 3] = -pos[i * 3]; nor[i * 3] = -nor[i * 3]; }
      for (let i = 0; i < total; i += 3) for (let a = 0; a < 3; a++) { const p = i * 3 + 3 + a, q = i * 3 + 6 + a; for (const arr of [pos, nor, col]) { const t = arr[p]; arr[p] = arr[q]; arr[q] = t; } }
    }
    for (let i = 0; i < total; i += 3) {
      const ax = pos[i * 3], ay = pos[i * 3 + 1], az = pos[i * 3 + 2], bx = pos[i * 3 + 3], by = pos[i * 3 + 4], bz = pos[i * 3 + 5], cx = pos[i * 3 + 6], cy = pos[i * 3 + 7], cz = pos[i * 3 + 8];
      const fx = Math.abs((by - ay) * (cz - az) - (bz - az) * (cy - ay)), fy = Math.abs((bz - az) * (cx - ax) - (bx - ax) * (cz - az)), fz = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
      for (let k = 0; k < 3; k++) {
        const x = pos[(i + k) * 3], y = pos[(i + k) * 3 + 1], z = pos[(i + k) * 3 + 2];
        const u = fx >= fy && fx >= fz ? z : x, w = fy >= fz && fy > fx ? z : y;
        uv[(i + k) * 2] = u * 2.2; uv[(i + k) * 2 + 1] = w * 2.2;
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(pos, 3)); geometry.setAttribute('normal', new T.BufferAttribute(nor, 3));
    geometry.setAttribute('color', new T.BufferAttribute(col, 3)); geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); out.push({ material, geometry });
  }
  for (const it of items) if (!it.mesh.geometry.userData.shared) it.mesh.geometry.dispose();
  return out;
}

// Bakes scratch meshes (made with slotTokens) into cacheable specs. The geometry is flagged shared so disposeMech keeps it.
export function bakeSpec(meshes, { part = null, y0 = 0, mirror = false } = {}) {
  return bakeMeshes(meshes, { y0, mirror }).map(({ material, geometry }) => { geometry.userData.shared = true; return { slot: material.name, geometry, part }; });
}
// Dresses a group with cached buckets using one mech's own materials (a missing slot falls back to the dark frame metal).
export function addBaked(group, spec, mats, parts) {
  for (const s of spec) {
    const m = new T.Mesh(s.geometry, mats[s.slot] || mats.metal); m.castShadow = m.receiveShadow = true; m.userData.baked = true;
    if (s.part) { m.userData.part = s.part; parts?.push(m); }
    group.add(m);
  }
}
// Merges loose meshes added to `group` by hand. Transparent, hidden and already-baked meshes are left alone.
export function bakeLoose(group, { parts = null, part = null, y0 = 0 } = {}) {
  const loose = group.children.filter(c => c.isMesh && !c.userData.baked && !c.userData.keep && c.visible && c.material && !c.material.transparent && !Array.isArray(c.material));
  if (!loose.length) return;
  for (const m of loose) { group.remove(m); const i = parts?.indexOf(m) ?? -1; if (i >= 0) parts.splice(i, 1); }
  for (const { material, geometry } of bakeMeshes(loose, { y0 })) {
    const m = new T.Mesh(geometry, material); m.castShadow = m.receiveShadow = true; m.userData.baked = true;
    if (part) { m.userData.part = part; parts?.push(m); }
    group.add(m);
  }
}

// Collects every mesh under `root` (which must have an identity transform) as if it were a direct child, ready for bakeSpec().
export function flatten(root) {
  root.updateMatrixWorld(true); const list = [];
  root.traverse(o => { if (o.isMesh) { o.matrixWorld.decompose(o.position, o.quaternion, o.scale); list.push(o); } });
  return list;
}
