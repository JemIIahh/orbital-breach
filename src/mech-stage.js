// A small WebGL stage that shows the player's mech on a service pad, plus a baker for part thumbnails.
// Both the Field Refit screen and the Gear Shop use one shared stage: they mount its canvas into their own layout while they are
// open, so there is a single renderer, a single environment map, and one thumbnail cache between them.
import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeMech, makeGun } from './world.js';
import { mechMaterials } from './mech-frame.js';
import { animateMech } from './animation.js';
import { disposeMech, paintMech, shoulderPod } from './mech-parts.js';
import { DEFAULT_BUILD, sanitizeBuild, itemGroup, partById } from './parts.js';
import { liveryFor } from './livery.js';

export const THUMB_W = 224, THUMB_H = 140;
const thumbCache = new Map(); // key -> data URL, kept for the life of the page
// Where the thumbnail camera looks for each kind of item: target point, distance, azimuth (0 = behind the mech, PI = in front).
const VIEWS = {
  legs: { t: [0, .95, 0], d: 4.1, az: 2.5 }, torso: { t: [0, 2.6, 0], d: 3.4, az: 2.75 }, back: { t: [0, 2.55, .5], d: 3.6, az: .45 },
  head: { t: [0, 3.2, -.1], d: 3.1, az: 2.6, el: .3 }, decal: { t: [0, 2.55, -.1], d: 3.0, az: 2.75 }, trail: { t: [0, 2.0, 1.0], d: 4.6, az: .5 },
  paint: { t: [0, 1.85, 0], d: 7.6, az: 2.6 }, lights: { t: [0, 2.9, -.1], d: 3.6, az: 2.7, el: .25 },
};
const MECH_KINDS = new Set(['legs', 'torso', 'back', 'head', 'decal', 'trail', 'paint', 'lights']);

export class MechStage {
  static shared(reducedMotion = false) { return (MechStage.instance ||= new MechStage({ reducedMotion })); }
  constructor({ reducedMotion = false } = {}) {
    Object.assign(this, { reducedMotion, viewShift: 0, paint: 'cobalt', lights: 'auto', build: { ...DEFAULT_BUILD }, pose: {}, queue: [], onThumb: null, drag: null, last: 0, container: null });
    this.canvas = document.createElement('canvas'); this.canvas.className = 'stage-canvas'; this.canvas.setAttribute('aria-hidden', 'true');
    this.view = { az: 2.5, y: 2, dist: 8, auto: 0, target: null };
    this.onDown = e => { if (e.target.closest?.('button, a, input')) return; this.drag = { x: e.clientX, az: this.view.az }; this.view.auto = 4; this.container.setPointerCapture?.(e.pointerId); };
    this.onMove = e => { if (this.drag) this.view.az = this.drag.az - (e.clientX - this.drag.x) * .008; };
    this.onUp = () => { this.drag = null; };
    this.onWheel = e => { e.preventDefault(); this.view.dist = Math.min(12, Math.max(4.2, this.view.dist + e.deltaY * .004)); };
  }

  // ---- Mounting -------------------------------------------------------------------------------------------------
  // Puts the canvas into `container` (whose size drives the render size) and starts listening for drags and the wheel there.
  mount(container) {
    this.unmount(); this.container = container; this.viewShift = 0; container.prepend(this.canvas);
    const ok = this.ensure(); container.classList.toggle('no-gl', !ok); if (!ok) return false;
    container.addEventListener('pointerdown', this.onDown); container.addEventListener('pointermove', this.onMove);
    container.addEventListener('pointerup', this.onUp); container.addEventListener('pointercancel', this.onUp); container.addEventListener('wheel', this.onWheel, { passive: false });
    this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.resize()) : null; this.resizeObserver?.observe(container);
    this.resize(); this.last = performance.now(); return true;
  }
  unmount() {
    const c = this.container; if (!c) return;
    c.removeEventListener('pointerdown', this.onDown); c.removeEventListener('pointermove', this.onMove); c.removeEventListener('pointerup', this.onUp); c.removeEventListener('pointercancel', this.onUp); c.removeEventListener('wheel', this.onWheel);
    this.resizeObserver?.disconnect(); this.resizeObserver = null; this.canvas.remove(); this.container = null; this.drag = null;
  }
  ensure() {
    if (this.renderer) return true;
    if (this.failed) return false;
    try { this.renderer = new T.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'low-power' }); } catch { this.failed = true; this.renderer = null; return false; }
    const r = this.renderer; r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75)); r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.shadowMap.enabled = true; r.shadowMap.type = T.PCFShadowMap;
    this.scene = new T.Scene(); this.scene.fog = new T.Fog('#07111b', 12, 26);
    const pmrem = new T.PMREMGenerator(r); this.scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture; this.scene.environmentIntensity = .55; pmrem.dispose();
    this.camera = new T.PerspectiveCamera(34, 1, .1, 60);
    const key = new T.DirectionalLight('#fff1dd', 2.4); key.position.set(-4, 7, -5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 5, bottom: -2, near: 1, far: 20 }); this.scene.add(key);
    const rim = new T.DirectionalLight('#6fd6ff', 1.6); rim.position.set(5, 3, 5); this.scene.add(rim);
    const warm = new T.PointLight('#ff9d4f', 18, 12, 1.6); warm.position.set(-3.2, .6, 3); this.scene.add(warm);
    // Service pad: a dark disc with a lit rim and a few ring marks.
    const pad = new T.Group(), discMat = new T.MeshStandardMaterial({ color: '#0d1822', metalness: .6, roughness: .55 });
    const disc = new T.Mesh(new T.CylinderGeometry(3.1, 3.3, .24, 56), discMat); disc.position.y = -.12; disc.receiveShadow = true; pad.add(disc);
    const rimGlow = new T.Mesh(new T.TorusGeometry(3.12, .035, 8, 80), new T.MeshBasicMaterial({ color: '#7fe3f2' })); rimGlow.rotation.x = Math.PI / 2; pad.add(rimGlow);
    const inner = new T.Mesh(new T.RingGeometry(1.6, 1.66, 64), new T.MeshBasicMaterial({ color: '#f2a65a', side: T.DoubleSide })); inner.rotation.x = -Math.PI / 2; inner.position.y = .005; pad.add(inner);
    for (let i = 0; i < 12; i++) { const tick = new T.Mesh(new T.BoxGeometry(.5, .01, .06), new T.MeshBasicMaterial({ color: '#5f8c99' })); const a = i / 12 * Math.PI * 2; tick.position.set(Math.sin(a) * 2.6, .005, Math.cos(a) * 2.6); tick.rotation.y = a; pad.add(tick); }
    this.scene.add(pad); this.pad = pad;
    this.thumbScene = new T.Scene(); this.thumbScene.environment = this.scene.environment; this.thumbScene.environmentIntensity = .8;
    const tk = new T.DirectionalLight('#fff1dd', 2.2); tk.position.set(-3, 5, -4); const tf = new T.DirectionalLight('#7fd6ff', 1.3); tf.position.set(4, 2, 3); this.thumbScene.add(tk, tf);
    this.thumbCamera = new T.PerspectiveCamera(30, THUMB_W / THUMB_H, .1, 60);
    return true;
  }
  resize() {
    if (!this.renderer || !this.container) return;
    const w = Math.max(2, this.container.clientWidth), h = Math.max(2, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75)); this.renderer.setSize(w, h, false); this.camera.aspect = w / h;
    if (this.viewShift) this.camera.setViewOffset(w, h, 0, this.viewShift, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }
  // Slides the picture up by `px` so the mech sits clear of an overlay along the bottom of the stage.
  setShift(px) { px = Math.round(px); if (px !== this.viewShift) { this.viewShift = px; this.resize(); } }

  // ---- The mech on the pad --------------------------------------------------------------------------------------
  setBuild(build) {
    this.build = sanitizeBuild(build); if (!this.renderer) return;
    if (this.mech) { this.scene.remove(this.mech.group); disposeMech(this.mech.group); }
    this.mech = makeMech('blue', 1, 'gunner', this.build); this.scene.add(this.mech.group); this.applyLivery();
  }
  setLivery(paint, lights) { this.paint = paint; this.lights = lights; this.applyLivery(); }
  applyLivery() { if (this.mech) paintMech(this.mech, liveryFor({ paint: this.paint, lights: this.lights })); }
  // Aims the camera: it eases to { az, y, dist } and then drifts round the mech (unless reduced motion is on).
  frame(focus) { this.view.target = focus; this.view.auto = 0; }
  update(now) {
    if (!this.renderer || !this.container) return;
    const dt = Math.min(.05, Math.max(0, (now - this.last) / 1000)); this.last = now;
    if (this.queue.length && this.pump(7)) this.resize();
    const v = this.view;
    if (v.target) {
      const damp = 1 - Math.exp(-dt * (this.reducedMotion ? 60 : 5));
      let delta = v.target.az - v.az; delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      if (!this.drag) v.az += delta * damp; v.y += (v.target.y - v.y) * damp; v.dist += (v.target.dist - v.dist) * damp * (this.drag ? 0 : 1);
      if (Math.abs(delta) < .02) v.target = null;
    } else if (!this.reducedMotion && !this.drag) { v.auto = Math.max(0, v.auto - dt); if (!v.auto) v.az += dt * .22; }
    this.camera.position.set(Math.sin(v.az) * v.dist, v.y + v.dist * .1, Math.cos(v.az) * v.dist); this.camera.lookAt(0, v.y, 0);
    if (this.mech) animateMech(this.mech, { dt, time: now / 1000, speed: 0, ...this.pose });
    this.renderer.render(this.scene, this.camera);
  }

  // ---- Thumbnails -----------------------------------------------------------------------------------------------
  // spec: { kind: 'part', slot, id } | { kind: 'paint', id } | { kind: 'lights', id }. Parts that draw a whole mech depend on the livery.
  specKind(spec) { return spec.kind === 'part' ? itemGroup(spec.slot) : spec.kind; }
  thumbKey(spec) {
    const kind = this.specKind(spec), base = `${kind}:${spec.id}`;
    if (!MECH_KINDS.has(kind) || kind === 'paint') return base;
    return kind === 'lights' ? `${base}@${this.paint}` : `${base}@${this.paint}.${this.lights}`;
  }
  // Returns the picture if it is baked; otherwise queues it (at the front when `urgent`) and returns null.
  thumb(spec, urgent = false) {
    const key = this.thumbKey(spec), url = thumbCache.get(key); if (url) return url;
    const at = this.queue.findIndex(q => q.key === key);
    if (at < 0) this.queue[urgent ? 'unshift' : 'push']({ spec, key }); else if (urgent && at > 0) this.queue.unshift(...this.queue.splice(at, 1));
    return null;
  }
  // Bakes queued thumbnails until the time budget (ms) runs out. Returns how many were made.
  pump(budget = 7) {
    if (!this.renderer || !this.queue.length) return 0;
    const start = performance.now(), ratio = this.renderer.getPixelRatio(); let made = 0;
    this.renderer.setPixelRatio(1);
    while (this.queue.length && (made === 0 || performance.now() - start < budget)) {
      const { spec, key } = this.queue.shift(); if (thumbCache.has(key)) continue;
      const url = this.bake(spec); if (url) { thumbCache.set(key, url); made++; this.onThumb?.(key, url); }
    }
    this.renderer.setPixelRatio(ratio); return made;
  }
  // Renders one item to a data URL. Gun and shoulder models are shown alone; everything else is the whole mech with that item fitted.
  bake(spec) {
    const kind = this.specKind(spec); let obj, mech = null, view;
    const mats = mechMaterials();
    try {
      if (kind === 'arm') obj = makeGun(partById(spec.slot, spec.id).model);
      else if (kind === 'shoulder') obj = shoulderPod(partById(spec.slot, spec.id).model, 1, mats);
      else {
        const build = kind === 'paint' || kind === 'lights' ? { ...DEFAULT_BUILD } : { ...DEFAULT_BUILD, [spec.slot]: spec.id };
        mech = makeMech('blue', 1, 'gunner', build);
        paintMech(mech, liveryFor(kind === 'paint' ? { paint: spec.id, lights: 'auto' } : kind === 'lights' ? { paint: this.paint, lights: spec.id } : { paint: this.paint, lights: this.lights }));
        if (kind === 'trail') for (const jet of [mech.limbs.leftJet, mech.limbs.rightJet]) { jet.visible = true; jet.scale.y = 2.4; }
        if (kind === 'head' || kind === 'decal') for (const gun of [mech.limbs.leftGun, mech.limbs.rightGun]) if (gun) gun.visible = false;
        obj = mech.group; view = VIEWS[kind];
      }
      return this.render(obj, view);
    } catch (error) { return null; } finally { if (obj) { this.thumbScene.remove(obj); disposeMech(obj); } Object.values(mats).forEach(m => m.dispose()); }
  }
  render(obj, view, w = THUMB_W, h = THUMB_H) {
    const r = this.renderer, cam = this.thumbCamera, scene = this.thumbScene, target = new T.Vector3(), dir = new T.Vector3(1.3, .45, -.9).normalize(); let dist;
    scene.add(obj);
    if (view?.az !== undefined) dir.set(Math.sin(view.az), view.el ?? .22, Math.cos(view.az)).normalize();
    if (view?.t) { target.set(...view.t); dist = view.d; }
    cam.aspect = w / h; cam.updateProjectionMatrix();
    if (!view?.t) { // frame a lone gun or pod: the nearest distance at which every corner of its box is inside the frustum
      obj.updateMatrixWorld(true); const bounds = new T.Box3().setFromObject(obj); bounds.getCenter(target);
      const fwd = dir.clone().negate(), right = new T.Vector3().crossVectors(fwd, new T.Vector3(0, 1, 0)).normalize(), up = new T.Vector3().crossVectors(right, fwd).normalize();
      const tanV = Math.tan(T.MathUtils.degToRad(cam.fov / 2)), tanH = tanV * cam.aspect, p = new T.Vector3(); dist = 0;
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        p.set(x, y, z).sub(target); const depth = p.dot(fwd); dist = Math.max(dist, depth + Math.abs(p.dot(right)) / (tanH * .96), depth + Math.abs(p.dot(up)) / (tanV * .96));
      }
    } cam.position.copy(target).addScaledVector(dir, dist); cam.lookAt(target);
    r.setSize(w, h, false); r.setClearColor('#0e2433', 1); r.render(scene, cam);
    const copy = document.createElement('canvas'); copy.width = w; copy.height = h; copy.getContext('2d').drawImage(this.canvas, 0, 0);
    r.setClearColor(0x000000, 0); return copy.toDataURL('image/jpeg', .88);
  }
  // Developer helper: renders a gun or shoulder pod alone from a chosen angle.
  snapshotPart(slot, id, { az, el = .25, w = 360, h = 240 } = {}) {
    if (!this.ensure()) return null;
    const model = partById(slot, id).model, mats = mechMaterials();
    const obj = itemGroup(slot) === 'arm' ? makeGun(model) : shoulderPod(model, 1, mats), ratio = this.renderer.getPixelRatio(); this.renderer.setPixelRatio(1);
    try { return this.render(obj, az === undefined ? null : { az, el }, w, h); } finally { this.thumbScene.remove(obj); disposeMech(obj); Object.values(mats).forEach(m => m.dispose()); this.renderer.setPixelRatio(ratio); this.resize(); }
  }
  // Developer helper: renders a whole build from any angle to a data URL (used for visual checks).
  snapshot(build, { az = 2.7, y = 2, dist = 8, el = .22, target = null, w = 360, h = 300, paint = this.paint, lights = this.lights, boost = false } = {}) {
    if (!this.ensure()) return null;
    const mech = makeMech('blue', 1, 'gunner', sanitizeBuild(build)); paintMech(mech, liveryFor({ paint, lights }));
    if (boost) for (const jet of [mech.limbs.leftJet, mech.limbs.rightJet]) { jet.visible = true; jet.scale.y = 2.4; }
    const ratio = this.renderer.getPixelRatio(); this.renderer.setPixelRatio(1);
    try { return this.render(mech.group, { t: target || [0, y, 0], d: dist, az, el }, w, h); } finally { this.thumbScene.remove(mech.group); disposeMech(mech.group); this.renderer.setPixelRatio(ratio); this.resize(); }
  }
}
