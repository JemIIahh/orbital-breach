import * as T from 'three';

// Air streaks: the wind you feel in a 4D theatre, made visible. A few score of thin pale slivers hang in the air around the
// pilot. They are fixed in the world, so they rush past exactly as fast as the pilot is really moving; each one that falls
// behind is recycled ahead. They are invisible at walking pace and fade in as speed builds, so boosting, dashing and tether
// pulls look and feel fast without changing how fast anything actually is.

const Y_AXIS = new T.Vector3(0, 1, 0), X_AXIS = new T.Vector3(1, 0, 0);
const _u = new T.Vector3(), _w = new T.Vector3();
const _dir = new T.Vector3(), _rel = new T.Vector3(), _q = new T.Quaternion(), _m = new T.Matrix4(), _p = new T.Vector3(), _s = new T.Vector3(), _c = new T.Color();
const AHEAD = 22, BEHIND = 7, MIN_RADIUS = 1.7, MAX_RADIUS = 8;

export class AirStreaks {
  constructor(count = 140) {
    this.count = count;
    this.mesh = new T.InstancedMesh(new T.CylinderGeometry(1, .2, 1, 3, 1), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }), count);
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.count = count;
    this.mesh.name = 'air-streaks';
    this.pos = new Float32Array(count * 3); this.bright = new Float32Array(count); this.phase = new Float32Array(count);
    for (let i = 0; i < count; i++) { this.bright[i] = .3 + Math.random() * .7; this.phase[i] = Math.random(); }
    this.seeded = false;
  }
  // Put a streak somewhere in a loose cylinder around the line of travel: never down the exact centre of the screen.
  place(i, origin, dir, ahead) {
    const a = Math.random() * Math.PI * 2, r = MIN_RADIUS + Math.random() * (MAX_RADIUS - MIN_RADIUS), ca = Math.cos(a) * r, sa = Math.sin(a) * r;
    // any two axes perpendicular to the direction of travel will do
    _u.crossVectors(dir, Math.abs(dir.y) > .9 ? X_AXIS : Y_AXIS).normalize(); _w.crossVectors(dir, _u).normalize();
    const k = i * 3;
    this.pos[k] = origin.x + dir.x * ahead + _u.x * ca + _w.x * sa;
    this.pos[k + 1] = origin.y + dir.y * ahead + _u.y * ca + _w.y * sa;
    this.pos[k + 2] = origin.z + dir.z * ahead + _u.z * ca + _w.z * sa;
  }
  // `strength` is 0..1 (how visible: speed and the sensation level). Returns whether anything is showing.
  update(dt, camera, velocity, strength) {
    const speed = velocity.length();
    if (strength < .02 || speed < 8) { this.mesh.visible = false; this.seeded = false; return false; }
    this.mesh.visible = true;
    _dir.copy(velocity).multiplyScalar(1 / speed);
    if (!this.seeded) { for (let i = 0; i < this.count; i++) this.place(i, camera, _dir, -BEHIND + Math.random() * (AHEAD + BEHIND)); this.seeded = true; }
    _q.setFromUnitVectors(Y_AXIS, _dir);
    const length = Math.min(2.6, Math.max(.4, speed * .05)), width = .012;
    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      _rel.set(this.pos[k] - camera.x, this.pos[k + 1] - camera.y, this.pos[k + 2] - camera.z);
      const along = _rel.dot(_dir);
      // behind the pilot, or flung far away (a teleport): bring it back round in front
      if (along < -BEHIND || _rel.lengthSq() > 900) this.place(i, camera, _dir, AHEAD * (.6 + Math.random() * .4));
      _p.set(this.pos[k] - _dir.x * length * .5, this.pos[k + 1] - _dir.y * length * .5, this.pos[k + 2] - _dir.z * length * .5);
      _s.set(width, length * (.6 + this.bright[i] * .6), width);
      _m.compose(_p, _q, _s); this.mesh.setMatrixAt(i, _m);
      const b = strength * this.bright[i] * .55;
      _c.setRGB(.6 * b, .75 * b, .95 * b); this.mesh.setColorAt(i, _c);
    }
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return true;
  }
  hide() { this.mesh.visible = false; this.seeded = false; }
  // The mesh must live in whichever scene is being drawn (station, city and Eden are separate scenes).
  attach(scene) { if (this.mesh.parent !== scene) scene.add(this.mesh); }
}
