// Collects boxes and cylinders by material and flushes each group as one InstancedMesh. Tinted names (see PROP_TINTS)
// resolve to a shared base material plus a per-instance colour, which keeps the whole city to a handful of draw calls.
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const BOX = new T.BoxGeometry(1, 1, 1), CYL = new T.CylinderGeometry(.5, .5, 1, 16, 1);
const ROUND = new RoundedBoxGeometry(1, 1, 1, 1, .09), LEAF = new T.IcosahedronGeometry(.5, 1);
// A cabin with a narrower roof and sloping front/rear windscreens.
const CABIN = BOX.clone(), cp = CABIN.attributes.position;
for(let i=0;i<cp.count;i++)if(cp.getY(i)>0){cp.setX(i,cp.getX(i)*.82);cp.setZ(i,cp.getZ(i)*.63)}
CABIN.computeVertexNormals();
const SHAPES={box:BOX,cyl:CYL,round:ROUND,leaf:LEAF,cabin:CABIN};

// `walkable`: pieces that were never marked solid but are big enough to stand on (a parked car, a bench, a planter, a stall) still
// register a mech-only collision box around their real bounds, rotation included, so a landing on one holds instead of sinking
// through to the street. Overhead things (awnings, signs, lamps) are left alone: the mech passes under them.
const UNIT = new T.Box3(new T.Vector3(-.5, -.5, -.5), new T.Vector3(.5, .5, .5)), _b = new T.Box3(), _c = new T.Vector3(), _s = new T.Vector3();
const WALK = { minHeight: .5, minFoot: .7, maxBottom: 1, maxTop: 6, skip: /glow|glass|warn|light|neon|wire/ };
export function createKit(tints, { onSolid = null, walkable = false } = {}) {
  const batches = new Map(), dummy = new T.Object3D(), aim = new T.Object3D();
  function add(shape, name, x, y, z, sx, sy, sz, rot) {
    const tint = tints[name], material = tint ? tint.base : name, shadow = tint?.shadow !== false, key = `${material}:${shape}${shadow ? '' : ':soft'}`;
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz);
    if (rot) dummy.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0); else dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    if (!batches.has(key)) batches.set(key, { material, shape, shadow, items: [] });
    batches.get(key).items.push({ m: dummy.matrix.clone(), c: tint ? tint.color : null, a: tint?.anim || 0 });
    return dummy.matrix;
  }
  function walk(name, matrix, y, sx, sy, sz) {
    if (!walkable || !onSolid || WALK.skip.test(name) || sy < WALK.minHeight || Math.min(sx, sz) < WALK.minFoot || y - sy / 2 > WALK.maxBottom || y + sy / 2 > WALK.maxTop) return;
    _b.copy(UNIT).applyMatrix4(matrix); _b.getCenter(_c); _b.getSize(_s);
    onSolid(_c.x, _c.y, _c.z, _s.x, _s.y, _s.z, 'body');
  }
  return {
    collider(x,y,z,sx,sy,sz,mode=true){onSolid?.(x,y,z,sx,sy,sz,mode,'vehicle')},
    // rot is an optional [rx, ry, rz]; rotated pieces cannot be solid because collision is axis aligned.
    // solid may be true (stops bodies, bullets and line of sight) or 'body' (stops the mech only, like foliage).
    box(name, x, y, z, sx, sy, sz, solid = false, rot = null) { const m = add('box', name, x, y, z, sx, sy, sz, rot); if (solid && onSolid && !rot) onSolid(x, y, z, sx, sy, sz, solid,name); else if (!solid || rot) walk(name, m, y, sx, sy, sz); },
    shaped(shape, name, x, y, z, sx, sy, sz, solid = false, rot = null) {
      const m = add(shape, name, x, y, z, sx, sy, sz, rot);
      if(solid && onSolid && !rot)onSolid(x,y,z,sx,sy,sz,solid,name);
    },
    cyl(name, x, y, z, r, h, solid = false, rot = null) { const m = add('cyl', name, x, y, z, r * 2, h, r * 2, rot); if (solid && onSolid && !rot) onSolid(x, y, z, r * 2, h, r * 2, solid,name); else if (!solid || rot) walk(name, m, y, r * 2, h, r * 2); },
    // A thin bar from one point to another (wires, cables, strings); never solid.
    line(name, x0, y0, z0, x1, y1, z1, thickness = .05) {
      const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0); if (len < 1e-6) return;
      aim.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); aim.lookAt(x1, y1, z1);
      add('box', name, aim.position.x, aim.position.y, aim.position.z, thickness, thickness, len, [aim.rotation.x, aim.rotation.y, aim.rotation.z]);
    },
    count: () => [...batches.values()].reduce((n, b) => n + b.items.length, 0),
    // Builds one InstancedMesh per material/shape pair under `parent`. Returns the meshes for tests and tooling.
    flush(parent, materials, { cast = true, receive = true } = {}) {
      const meshes = [];
      for (const [key, { material, shape, shadow, items }] of batches) {
        let geometry = SHAPES[shape];
        if (material === 'glow') { geometry = geometry.clone(); geometry.setAttribute('aAnim', new T.InstancedBufferAttribute(Float32Array.from(items, i => i.a), 1)); }
        const mesh = new T.InstancedMesh(geometry, materials[material], items.length);
        const tinted = items.some(i => i.c);
        items.forEach((item, i) => { mesh.setMatrixAt(i, item.m); if (tinted) mesh.setColorAt(i, item.c || WHITE); });
        mesh.name = `city:${key}`; mesh.castShadow = cast && shadow && material !== 'glow'; mesh.receiveShadow = receive;
        mesh.computeBoundingSphere(); mesh.computeBoundingBox?.(); parent.add(mesh); meshes.push(mesh);
      }
      batches.clear();
      return meshes;
    },
  };
}
const WHITE = new T.Color(1, 1, 1);
