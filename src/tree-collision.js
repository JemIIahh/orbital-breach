// Body collision for trees that matches what you can see.
//
// A tree used to be one thin trunk cylinder (a pine's was 0.5 m wide) while its branches and canopy reach 3-4 m, so the mech
// walked and flew straight through the foliage. Each tree now carries a compound solid built from the same numbers that
// shape its mesh: the tapering trunk and the pine's skirts become stacked vertical cylinders, and each leafy lump becomes an
// ellipsoid. Pure maths, no rendering, so it is easy to test.
//
// `shape` comes from the species generators in eden-flora.js, in the tree's local (unscaled) units:
//   h      trunk height
//   trunk  t(0..1) -> trunk radius
//   skirt  optional y -> radius of the pine's conical skirts, with skirtTop their highest point
//   blobs  optional [{c:{x,y,z}, rx, ry, rz}] leafy ellipsoids
import * as T from 'three';

const BAND = 1.2;       // height of one stacked cylinder
const CORE = 0.82;      // colliders cover the dense core of the foliage; stray leaf cards and branch tips may still brush the mech
const BODY_TOP = 2.9;   // a walking mech's body spans roughly 0..2.9 m above the ground
const _o = new T.Object3D(), _v = new T.Vector3();

const lerp = (a, b, t) => a + (b - a) * t;

// Skirt profile for a conifer from its tiers: widest just under each tier's lower edge, narrowing to the tip.
export function skirtProfile(tiers) {
  const top = tiers.reduce((m, t) => Math.max(m, t.y1), 0);
  return {
    top,
    radius(y) {
      let r = 0;
      for (const t of tiers) {
        if (y < t.y0 || y > t.y1) continue;
        r = Math.max(r, y < t.mid ? lerp(.72 * t.R, .34 * t.R, (y - t.y0) / Math.max(t.mid - t.y0, 1e-6)) : lerp(.34 * t.R, .08 * t.R, (y - t.mid) / Math.max(t.y1 - t.mid, 1e-6)));
      }
      return r;
    },
  };
}

// Build world-space parts for one placed tree. `place` mirrors Instances.add: position, per-axis scale and Euler rotation, so the
// colliders follow the same yaw, lean and size as the drawn instance.
export function treeParts(shape, { x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0 }) {
  _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz); _o.scale.set(sx, sy, sz); _o.updateMatrix();
  const m = _o.matrix, rxz = (sx + sz) / 2, parts = [];
  const top = Math.max(shape.h, shape.skirtTop || 0);
  for (let y0 = 0; y0 < top - 1e-6; y0 += BAND) {
    const y1 = Math.min(top, y0 + BAND);
    const trunk = y0 < shape.h ? shape.trunk(Math.min(1, y0 / shape.h)) : 0;
    const skirt = shape.skirt ? Math.max(shape.skirt(y0), shape.skirt(y1), shape.skirt((y0 + y1) / 2)) * CORE : 0;
    const r = Math.max(trunk, skirt) * rxz;
    if (r < .05) continue;
    const a = _v.set(0, y0, 0).applyMatrix4(m).clone(), b = _v.set(0, y1, 0).applyMatrix4(m);
    parts.push({ type: 'cyl', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, y0: a.y, y1: b.y, r });
  }
  for (const blob of shape.blobs || []) {
    const c = _v.set(blob.c.x, blob.c.y, blob.c.z).applyMatrix4(m);
    parts.push({ type: 'ell', x: c.x, y: c.y, z: c.z, rh: (blob.rx * sx + blob.rz * sz) / 2 * CORE, rv: blob.ry * sy * CORE });
  }
  return parts;
}

// How far from the trunk the colliders reach where a walking mech can touch them (used to keep paths and clearings open).
export function walkReach(parts, cx, cz, ground) {
  let reach = 0;
  for (const p of parts) {
    const lowest = p.type === 'cyl' ? p.y0 : p.y - p.rv;
    if (lowest - ground > BODY_TOP) continue;
    reach = Math.max(reach, Math.hypot(p.x - cx, p.z - cz) + (p.type === 'cyl' ? p.r : p.rh));
  }
  return reach;
}

// Attach the compound solid to an obstacle from makeObstacle(). `box`, `radius` and `height` stay the trunk, which is what bullets
// and bot navigation use; foliage deliberately does not stop shots or line of sight, only bodies.
export function attachParts(obstacle, parts) {
  let reach = obstacle.radius, top = obstacle.position.y + obstacle.height;
  for (const p of parts) {
    reach = Math.max(reach, Math.hypot(p.x - obstacle.position.x, p.z - obstacle.position.z) + (p.type === 'cyl' ? p.r : p.rh));
    top = Math.max(top, p.type === 'cyl' ? p.y1 : p.y + p.rv);
  }
  obstacle.parts = parts; obstacle.reach = reach; obstacle.top = top;
  obstacle.walkReach = walkReach(parts, obstacle.position.x, obstacle.position.z, obstacle.position.y);
  return obstacle;
}

// Push the body sphere (centre `body`, radius R) out of every part it overlaps, moving `p` (the eye point) by the same amount and
// cancelling the velocity that drives into the surface. Returns true if anything moved the body.
export function resolveParts(o, p, body, R, velocity) {
  const dx0 = body.x - o.position.x, dz0 = body.z - o.position.z;
  if (dx0 * dx0 + dz0 * dz0 > (o.reach + R) * (o.reach + R) || body.y > o.top + R || body.y < o.position.y - R) return false;
  let moved = false;
  for (const part of o.parts) {
    let nx, ny, nz, push;
    if (part.type === 'cyl') {
      if (body.y - R > part.y1 || body.y + R < part.y0) continue;
      const dx = body.x - part.x, dz = body.z - part.z, d = Math.hypot(dx, dz), k = d > part.r ? part.r / d : 1;
      const qy = Math.min(Math.max(body.y, part.y0), part.y1), vx = dx - dx * k, vy = body.y - qy, vz = dz - dz * k, dist = Math.hypot(vx, vy, vz);
      if (dist >= R) continue;
      if (dist > 1e-6) { nx = vx / dist; ny = vy / dist; nz = vz / dist; push = R - dist; }
      else { // the centre is inside the solid: leave by the shortest way
        const out = part.r - d, up = part.y1 - body.y, down = body.y - part.y0, least = Math.min(out, up, down);
        if (least === up) { nx = 0; ny = 1; nz = 0; push = up + R; }
        else if (least === down) { nx = 0; ny = -1; nz = 0; push = down + R; }
        else { nx = d > 1e-6 ? dx / d : 1; ny = 0; nz = d > 1e-6 ? dz / d : 0; push = out + R; }
      }
    } else {
      const a = part.rh + R, b = part.rv + R, dx = body.x - part.x, dy = body.y - part.y, dz = body.z - part.z;
      const q = (dx * dx + dz * dz) / (a * a) + dy * dy / (b * b);
      if (q >= 1) continue;
      if (q < 1e-10) { nx = 0; ny = 1; nz = 0; push = b - dy; }
      else {
        // slide out along the ray from the lump's centre to the grown surface; the surface normal drives the velocity change
        const s = 1 / Math.sqrt(q) - 1, gx = dx / (a * a), gy = dy / (b * b), gz = dz / (a * a), gl = Math.hypot(gx, gy, gz);
        nx = gx / gl; ny = gy / gl; nz = gz / gl;
        const mx = dx * s, my = dy * s, mz = dz * s;
        p.x += mx; p.y += my; p.z += mz; body.x += mx; body.y += my; body.z += mz;
        const into = velocity.x * nx + velocity.y * ny + velocity.z * nz;
        if (into < 0) { velocity.x -= into * nx; velocity.y -= into * ny; velocity.z -= into * nz; }
        moved = true; continue;
      }
    }
    p.x += nx * push; p.y += ny * push; p.z += nz * push; body.x += nx * push; body.y += ny * push; body.z += nz * push;
    const into = velocity.x * nx + velocity.y * ny + velocity.z * nz;
    if (into < 0) { velocity.x -= into * nx; velocity.y -= into * ny; velocity.z -= into * nz; }
    moved = true;
  }
  return moved;
}

// Every plain obstacle (a rock, a ruined wall, a barrel, a standing stone) is one vertical cylinder. Giving it the same
// sphere-versus-cylinder treatment as a tree part means the mech lands ON its top, slides up over low rubble, and is only pushed
// sideways by faces taller than it can climb. Built once and cached on the obstacle.
export function solidOf(o) {
  return o.solid || (o.solid = {
    position: o.position, reach: o.radius, top: o.position.y + o.height,
    parts: [{ type: 'cyl', x: o.position.x, z: o.position.z, y0: o.position.y, y1: o.position.y + o.height, r: o.radius }],
  });
}
