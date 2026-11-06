import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Sensation, Haptics, LEVELS, LIMITS, levelValue, loadLevel, saveLevel } from '../src/sensation.js';
import { AirStreaks } from '../src/air.js';
import { makeSensationPass, applySensation, SensationShader } from '../src/sensation-pass.js';
import { Effects, AudioEngine } from '../src/effects.js';
import { simulation } from './support.js';

const context = { fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, fillText() {}, createRadialGradient() { return { addColorStop() {} }; } };
globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return context; } }; } };

const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const FPS = 1 / 60;
const make = (opts = {}) => {
  const plays = [], rumbles = [], s = new Sensation({ play: (kind, o) => plays.push({ kind, ...o }), rumble: (strong, weak, ms) => rumbles.push({ strong, weak, ms }), ...opts });
  return { s, plays, rumbles };
};
const state = (velocity, grounded = true, boosting = false) => ({ velocity, forward: v(1, 0, 0), right: v(0, 0, 1), up: v(0, 1, 0), grounded, boosting });
const run = (s, seconds, frame) => { let worst = 0; for (let i = 0; i < seconds * 60; i++) { const out = s.update(FPS, frame?.(i)); worst = Math.max(worst, Math.abs(out.pitch), Math.abs(out.roll), Math.abs(out.drop), Math.abs(out.fov)); } return worst; };

// ---- levels and persistence ----------------------------------------------------------------------------------------------

test('levels: off < subtle < full, and unknown or inherited names fall back to the default', () => {
  assert.ok(LEVELS.off === 0 && LEVELS.off < LEVELS.subtle && LEVELS.subtle < LEVELS.full);
  assert.equal(levelValue('subtle'), LEVELS.subtle);
  for (const bad of ['toString', '__proto__', '', undefined, null, 3]) assert.equal(levelValue(bad), LEVELS.full, String(bad));
});

test('the chosen level persists, and blocked, throwing or tampered storage never breaks the game', () => {
  const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, val) => store.set(k, val) };
  assert.equal(loadLevel(storage), 'full');
  saveLevel('subtle', storage); assert.equal(loadLevel(storage), 'subtle');
  saveLevel('toString', storage); assert.equal(loadLevel(storage), 'subtle', 'an invalid level is never saved');
  store.set('orbital-breach.sensation', 'constructor'); assert.equal(loadLevel(storage), 'full', 'a tampered value falls back');
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(loadLevel(blocked), 'full'); assert.doesNotThrow(() => saveLevel('off', blocked));
  assert.equal(loadLevel(undefined), 'full');
});

// ---- body motion ---------------------------------------------------------------------------------------------------------

test('accelerating tips the view back, braking tips it forward, strafing leans it into the move', () => {
  const { s } = make();
  s.step(FPS, state(v())); s.step(FPS, state(v(10, 0, 0)));
  assert.ok(s.pitchTarget > .025, 'accelerating forward');
  s.step(FPS, state(v(0, 0, 0)));
  assert.ok(s.pitchTarget < -.025, 'braking');
  s.step(FPS, state(v(0, 0, 10)));
  assert.ok(s.rollTarget < -.01, 'strafing leans the view into the move');
});

test('the springs are stable on any frame length, including the longest the game allows, and settle back to rest', () => {
  const { s } = make();
  s.event('dash'); s.event('hurt', { amount: 1 });
  for (let i = 0; i < 30; i++) { const o = s.update(.15); for (const k of Object.keys(o)) assert.ok(Number.isFinite(o[k]), `${k} stays finite at 150 ms frames`); }
  const o = (run(s, 4), s.out);
  assert.ok(Math.abs(o.pitch) < .002 && Math.abs(o.fov) < .05 && o.pressure < .01 && o.aberration < .01, 'everything comes to rest');
});

test('whatever piles up, the view stays inside hard limits', () => {
  const { s } = make();
  let worst = { pitch: 0, roll: 0, drop: 0, fov: 0 };
  for (let i = 0; i < 600; i++) {
    s.event(['dash', 'hurt', 'blast', 'kill'][i % 4], { amount: 1, distance: 1, size: 1.4, big: true });
    s.step(FPS, state(v((i % 2) * 80, 0, (i % 3) * 30)));
    const o = s.update(FPS, { yaw: i * .5 });
    for (const k of Object.keys(worst)) worst[k] = Math.max(worst[k], Math.abs(o[k]));
    assert.ok(o.pressure <= LIMITS.pressure && o.aberration <= LIMITS.aberration);
  }
  for (const k of Object.keys(worst)) assert.ok(worst[k] <= LIMITS[k] + 1e-9, `${k} peaked at ${worst[k]}`);
});

test('a hard landing dips the view and thumps; a hop does nothing', () => {
  const { s, plays, rumbles } = make();
  for (let i = 0; i < 20; i++) s.step(FPS, state(v(0, -15, 0), false));
  s.step(FPS, state(v(0, 0, 0), true));
  const land = plays.find(p => p.kind === 'land');
  assert.ok(land && land.volume > .7, 'a fall at 15 m/s lands hard');
  assert.ok(rumbles.length === 1 && rumbles[0].strong > .5);
  let dip = 0; for (let i = 0; i < 20; i++) dip = Math.max(dip, s.update(FPS).drop);
  assert.ok(dip > .03, 'the view drops');
  const calm = make();
  for (let i = 0; i < 20; i++) calm.s.step(FPS, state(v(0, -3, 0), false));
  calm.s.step(FPS, state(v(), true));
  assert.equal(calm.plays.length, 0, 'a 3 m/s step down is not a landing');
});

test('boosting kicks the view once when it starts, not continuously', () => {
  const { s, plays } = make();
  s.step(FPS, state(v(20, 0, 0), true, false));
  for (let i = 0; i < 30; i++) s.step(FPS, state(v(20, 0, 0), true, true));
  assert.equal(plays.filter(p => p.kind === 'whoosh').length, 1);
});

test('turning hard banks the view; a respawn snapping the heading does not', () => {
  const { s } = make();
  s.update(FPS, { yaw: 0 });
  let yaw = 0, peak = 0;
  for (let i = 0; i < 40; i++) { yaw += .02; peak = Math.max(peak, s.update(FPS, { yaw }).roll); }
  assert.ok(peak > .003, 'turning right banks the view');
  const before = Math.abs(s.yawRate); yaw += 3; s.update(FPS, { yaw });
  assert.ok(Math.abs(s.yawRate) <= before + 1e-9, 'a 3 radian jump is a respawn, not a turn');
});

// ---- air -----------------------------------------------------------------------------------------------------------------

test('wind builds with speed: nothing at rest, near full at boost speed', () => {
  const { s } = make();
  s.step(FPS, state(v())); run(s, 2);
  assert.ok(s.out.wind < .01 && s.out.blur < .01 && s.out.streaks < .01);
  const fast = make(); fast.s.step(FPS, state(v(40, 0, 0))); run(fast.s, 2);
  assert.ok(fast.s.out.wind > .9 && fast.s.out.blur > .04 && fast.s.out.blur <= LIMITS.blur && fast.s.out.streaks > .9);
});

// ---- pressure and events -------------------------------------------------------------------------------------------------

test('a hit squeezes the screen and thumps, then it fades inside about a second', () => {
  const { s, plays, rumbles } = make();
  s.event('hurt', { amount: .8 });
  assert.ok(s.update(FPS).pressure > .5 && s.out.aberration > .5);
  assert.ok(plays.some(p => p.kind === 'thump' && p.volume > .6) && rumbles.length === 1);
  run(s, 1.5); assert.ok(s.out.pressure < .05 && s.out.aberration < .02);
});

test('a blast is felt in proportion to how close and how big it is, and a distant one not at all', () => {
  const near = make(), far = make(), distant = make();
  near.s.event('blast', { distance: 4, size: 1 }); far.s.event('blast', { distance: 25, size: 1 }); distant.s.event('blast', { distance: 200, size: 1 });
  assert.ok(near.plays[0].volume > far.plays[0].volume && far.plays.length === 1);
  assert.equal(distant.plays.length + distant.rumbles.length, 0);
  assert.ok(near.rumbles[0].ms > far.rumbles[0].ms);
  const big = make(); big.s.event('blast', { distance: 4, size: 1.4 }); assert.ok(big.plays[0].volume >= near.plays[0].volume);
});

test('gun rumble is rate-limited, and only a heavy gun shakes the hands hard', () => {
  const { s, rumbles } = make();
  s.event('fire', { heavy: false }); s.event('fire', { heavy: false }); assert.equal(rumbles.length, 1, 'a second round in the same instant is dropped');
  for (let i = 0; i < 10; i++) s.step(FPS, state(v()));
  s.event('fire', { heavy: true }); assert.equal(rumbles.length, 2);
  assert.ok(rumbles[1].strong > rumbles[0].strong);
});

// ---- the three user-facing levels ----------------------------------------------------------------------------------------

test('off means off: no sound, no rumble, no motion, whatever happens', () => {
  const { s, plays, rumbles } = make({ level: 'off' });
  for (const kind of ['dash', 'hurt', 'blast', 'kill', 'fire', 'miss']) s.event(kind, { amount: 1, distance: 1, size: 1.4 });
  for (let i = 0; i < 20; i++) s.step(FPS, state(v(0, -15, 0), false));
  s.step(FPS, state(v(), true)); s.step(FPS, state(v(20, 0, 0), true, true)); s.step(FPS, state(v(20, 0, 0), true, true));
  run(s, 1);
  assert.equal(plays.length + rumbles.length, 0, 'events, landings and boosts all respect the level');
  for (const k of Object.keys(s.out)) assert.equal(s.out[k], 0, k);
});

test('subtle is a gentler full', () => {
  const peak = level => { const { s } = make({ level }); s.event('dash'); s.event('hurt', { amount: 1 }); let f = 0, p = 0; for (let i = 0; i < 40; i++) { const o = s.update(FPS); f = Math.max(f, o.fov); p = Math.max(p, o.pressure); } return { f, p }; };
  const subtle = peak('subtle'), full = peak('full');
  assert.ok(subtle.f > 0 && full.f > subtle.f * 1.6 && full.p > subtle.p * 1.6);
});

test('reduced motion removes every visual effect but keeps the sound and the rumble', () => {
  const { s, plays, rumbles } = make({ reducedMotion: true });
  s.event('dash'); s.event('hurt', { amount: 1 }); s.step(FPS, state(v(40, 0, 0))); run(s, 2);
  for (const k of ['pitch', 'roll', 'drop', 'fov', 'aberration', 'pressure', 'blur', 'streaks']) assert.equal(s.out[k], 0, `${k} is visual motion`);
  assert.ok(plays.length > 0 && rumbles.length > 0, 'sound and rumble are not motion');
  assert.ok(s.out.wind > .9, 'wind noise is sound');
});

// ---- gamepad rumble ------------------------------------------------------------------------------------------------------

test('rumble reaches a connected controller, clamped and throttled, and never throws', async () => {
  const calls = [];
  const nav = { getGamepads: () => [null, { vibrationActuator: { playEffect(type, opts) { calls.push({ type, opts }); return Promise.reject(new Error('refused')); } } }] };
  const h = new Haptics(nav);
  assert.equal(h.rumble(5, -1, 5000, 100), true);
  assert.deepEqual(calls[0].opts, { startDelay: 0, duration: 1000, weakMagnitude: 0, strongMagnitude: 1 });
  assert.equal(calls[0].type, 'dual-rumble');
  assert.equal(h.rumble(.5, .5, 100, 110), false, 'one effect at a time');
  assert.equal(h.rumble(.5, .5, 100, 140), true);
  await new Promise(r => setImmediate(r)); // a rejected promise from the controller must not surface as an unhandled rejection
  for (const bad of [{}, { getGamepads: () => [] }, { getGamepads: () => { throw new Error('x'); } }, { getGamepads: () => [{ vibrationActuator: { playEffect() { throw new Error('x'); } } }] }, undefined])
    assert.equal(new Haptics(bad).rumble(1, 1, 50, 1e6), false);
});

// ---- air streaks ---------------------------------------------------------------------------------------------------------

test('air streaks are hidden at walking pace and appear once the pilot is fast', () => {
  const air = new AirStreaks(), cam = v();
  assert.equal(air.update(FPS, cam, v(5, 0, 0), 1), false); assert.equal(air.mesh.visible, false);
  assert.equal(air.update(FPS, cam, v(40, 0, 0), 0), false, 'strength zero (sensation off, reduced motion) hides them');
  assert.equal(air.update(FPS, cam, v(40, 0, 0), 1), true); assert.equal(air.mesh.visible, true);
});

test('air streaks rush past in the world and are recycled ahead, staying in a loose tube around the line of travel', () => {
  const air = new AirStreaks(140), cam = v(), vel = v(40, 0, 0), dir = v(1, 0, 0);
  for (let i = 0; i < 300; i++) {
    cam.x += 40 / 60; air.update(FPS, cam, vel, 1);
    for (let j = 0; j < air.count; j++) {
      const rel = v(air.pos[j * 3] - cam.x, air.pos[j * 3 + 1] - cam.y, air.pos[j * 3 + 2] - cam.z), along = rel.dot(dir), lateral = rel.clone().addScaledVector(dir, -along).length();
      assert.ok(along > -8.1 && along < 23, `streak ${j} is ${along.toFixed(1)} m along`);
      assert.ok(lateral > 1.6 && lateral < 8.1, `streak ${j} is ${lateral.toFixed(1)} m off the line (never down the middle of the screen)`);
    }
  }
});

test('air streaks stretch along the direction of travel and are brighter when more visible', () => {
  // One set of streaks, two strengths. (Each AirStreaks rolls its own random brightness, so comparing two separate sets made this
  // ratio drift outside its band a few runs in a hundred.)
  const air = new AirStreaks(60), total = strength => { air.update(FPS, v(), v(0, 30, 0), strength); return air.mesh.instanceColor.array.reduce((a, b) => a + b, 0); };
  const strong = { air, total: total(1) }, weak = { total: total(.3) };
  strong.total = total(1);
  assert.ok(strong.total / weak.total > 3 && strong.total / weak.total < 3.8);
  const m = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), p = new T.Vector3();
  strong.air.mesh.getMatrixAt(0, m); m.decompose(p, q, sc);
  assert.ok(new T.Vector3(0, 1, 0).applyQuaternion(q).dot(v(0, 1, 0)) > .999, 'long axis follows the velocity, also when it points straight up');
  assert.ok(sc.y > sc.x * 20, 'a sliver');
});

test('air streaks cope with standing still, a teleport, and a change of scene', () => {
  const air = new AirStreaks(60), cam = v();
  air.update(FPS, cam, v(40, 0, 0), 1); air.update(FPS, cam, v(), 1);
  assert.ok(Array.from(air.pos).every(Number.isFinite));
  cam.set(500, 0, 0); air.update(FPS, cam, v(40, 0, 0), 1);
  for (let j = 0; j < 60; j++) assert.ok(v(air.pos[j * 3] - 500, air.pos[j * 3 + 1], air.pos[j * 3 + 2]).length() < 31, 'recycled around the pilot after a teleport');
  const a = new T.Scene(), b = new T.Scene(); air.attach(a); air.attach(b);
  assert.equal(air.mesh.parent, b); assert.ok(!a.children.includes(air.mesh));
});

// ---- post-process pass ---------------------------------------------------------------------------------------------------

test('the post pass is off until there is something to draw, then carries the three effects', () => {
  const pass = makeSensationPass();
  assert.equal(pass.enabled, false);
  assert.equal(applySensation(pass, { blur: 0, aberration: 0, pressure: 0 }), false);
  assert.equal(applySensation(pass, { blur: .5, aberration: .2, pressure: .1 }), true);
  assert.deepEqual([pass.uniforms.uBlur.value, pass.uniforms.uAberration.value, pass.uniforms.uPressure.value], [.5, .2, .1]);
  assert.equal(applySensation(pass, { blur: 0, aberration: .3, pressure: 0 }), true, 'any one effect is enough');
  assert.equal(applySensation(pass, { blur: .001, aberration: .001, pressure: .001 }), false, 'imperceptible values do not pay for a fullscreen pass');
  for (const u of ['uBlur', 'uAberration', 'uPressure', 'tDiffuse']) assert.ok(SensationShader.fragmentShader.includes(u) && u in SensationShader.uniforms, u);
});

// ---- audio ---------------------------------------------------------------------------------------------------------------

function fakeAudio(state = 'running') {
  const nodes = [], buffers = [];
  const param = () => ({ value: 0, targets: [], setTargetAtTime(val) { this.targets.push(val); }, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => { const n = { gain: param(), frequency: param(), pan: param(), connect: x => x ?? n, disconnect() {}, start() {}, stop() {} }; nodes.push(n); return n; };
  const audio = new AudioEngine();
  audio.ctx = { currentTime: 1, sampleRate: 8000, state, createOscillator: node, createGain: node, createBiquadFilter: node, createBufferSource: node, createStereoPanner: node, createBuffer: (c, length) => { const b = { data: new Float32Array(length), getChannelData() { return this.data; } }; buffers.push(b); return b; } };
  audio.master = node();
  return { audio, nodes, buffers };
}

test('the wind bed is built once, loops seamlessly, and its loudness follows the level', () => {
  const { audio, nodes, buffers } = fakeAudio();
  audio.wind(.5); const built = nodes.length;
  assert.equal(nodes.length - 1, 3, 'a source, a filter and a gain, plus the master');
  assert.equal(buffers.length, 1); const data = buffers[0].data;
  // `=== 0` (not assert.equal): a faded sample is silence whether the noise it came from was positive or negative, i.e. 0 or -0
  assert.ok(data[0] === 0 && data[data.length - 1] === 0 && data.some(x => x !== 0), 'the ends are faded to silence so the loop never clicks');
  audio.wind(.9); assert.equal(nodes.length, built, 'never rebuilt');
  assert.ok(audio.windGain.gain.targets.at(-1) > audio.windGain.gain.targets[0]);
  audio.wind(7); assert.ok(audio.windGain.gain.targets.at(-1) <= .34 + 1e-9, 'clamped');
  audio.wind(NaN); assert.equal(audio.windGain.gain.targets.at(-1), 0);
});

test('the wind goes quiet when sound is off or the audio context is not running, and never builds before it can play', () => {
  const idle = fakeAudio('suspended'); idle.audio.wind(1); assert.equal(idle.nodes.length, 1, 'nothing is built on a suspended context');
  const { audio } = fakeAudio(); audio.wind(1); audio.enabled = false; audio.wind(1);
  assert.equal(audio.windGain.gain.targets.at(-1), 0);
  assert.doesNotThrow(() => new AudioEngine().wind(1), 'before the audio context exists');
});

test('body sounds exist as real voices and are throttled so sub-bass never piles up', () => {
  for (const kind of ['thump', 'land', 'whoosh']) {
    const { audio, nodes } = fakeAudio(); const base = nodes.length;
    assert.equal(audio.special(kind, { volume: 1 }), true, kind); assert.ok(nodes.length - base > 2, `${kind} makes sound`);
    audio.ctx.currentTime += .01; const after = nodes.length; audio.special(kind, { volume: 1 }); assert.equal(nodes.length, after, `${kind} within 60 ms is dropped`);
    audio.ctx.currentTime += 1; audio.special(kind, { volume: .02 }); assert.equal(nodes.length, after, `${kind} is skipped when inaudible`);
  }
});

// ---- the real game wiring ------------------------------------------------------------------------------------------------

function wired() {
  const game = simulation(), log = { plays: [], rumbles: [], winds: [] };
  game.audio = { play(kind, o) { log.plays.push({ kind, ...o }); }, wind(l) { log.winds.push(l); } };
  game.sense = new Sensation({ play: (kind, o) => log.plays.push({ kind, ...o }), rumble: (strong, weak, ms) => log.rumbles.push({ strong, weak, ms }) });
  game.sensePass = makeSensationPass(); game.air = new AirStreaks(); game.yaw = 0;
  return { game, log };
}
const felt = log => log.plays.filter(p => ['thump', 'land', 'whoosh'].includes(p.kind));

test('dashing, being hit, killing, firing and a near miss are each felt', () => {
  const { game, log } = wired();
  game.keys.add('KeyW'); assert.equal(game.dash(), true);
  assert.ok(felt(log).some(p => p.kind === 'whoosh') && log.rumbles.length === 1, 'dash');
  game.hurtPlayer(20, null);
  assert.ok(felt(log).some(p => p.kind === 'thump'), 'taking damage thumps');
  assert.ok(game.sense.pressure > .3, 'and squeezes the screen');
  const rumbles = log.rumbles.length; game.shoot(0);
  assert.ok(log.rumbles.length > rumbles, 'firing a gun is felt in the hands');
  const before = log.rumbles.length; game.nearMiss({ position: v(5, 0, 0), origin: v(9, 0, 0) });
  assert.ok(log.rumbles.length > before, 'a round whipping past');
  const group = new T.Group(); group.position.set(8, 0, 0);
  const mesh = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial()); group.add(mesh);
  const bot = { group, parts: [mesh], name: 'T', health: 1, shield: 0, dead: false, partHealth: { arm: 70, leg: 70 }, limbs: { leftArm: new T.Object3D(), rightLeg: new T.Object3D() } }; mesh.userData = { part: 'core', bot };
  game.scene.add(group); game.bots.push(bot);
  const thumps = felt(log).length; game.damageBot(bot, 50, 'core', group.position);
  assert.ok(bot.dead && felt(log).length > thumps, 'a close kill thumps');
});

test('a nearby explosion is felt through the effects hook; a far one is not', () => {
  const { game, log } = wired(), fx = new Effects(new T.Scene());
  fx.onExplosion = (point, size) => game.sense.event('blast', { distance: game.camera.position.distanceTo(point), size });
  fx.explosion(game.camera.position.clone().add(v(3, 0, 0)), 1); assert.ok(felt(log).some(p => p.kind === 'thump'));
  const n = log.plays.length; fx.explosion(game.camera.position.clone().add(v(300, 0, 0)), 1); assert.equal(log.plays.length, n);
  assert.doesNotThrow(() => new Effects(new T.Scene()).explosion(v(), 1), 'effects work with no hook attached, as in the test harness');
});

test('each frame drives the pass, the streaks and the wind; a menu or pause silences all three', () => {
  const { game, log } = wired();
  game.player.velocity.set(40, 0, 0); game.sense.step(FPS, { velocity: game.player.velocity, forward: game.forward, right: game.right, up: game.up, grounded: true, boosting: false });
  for (let i = 0; i < 120; i++) game.updateSensation(FPS);
  assert.equal(game.air.mesh.parent, game.scene, 'streaks live in the scene being drawn');
  assert.equal(game.air.mesh.visible, true); assert.equal(game.sensePass.enabled, true);
  assert.ok(log.winds.at(-1) > .9);
  game.quietSensation();
  assert.equal(game.air.mesh.visible, false); assert.equal(game.sensePass.enabled, false); assert.equal(log.winds.at(-1), 0);
});

test('simulating a step records motion for the body model without disturbing the simulation', () => {
  const plain = simulation(), felt1 = wired().game;
  for (const g of [plain, felt1]) { g.keys.add('KeyW'); for (let i = 0; i < 120; i++) g.advance(FPS); }
  assert.ok(plain.player.position.distanceTo(felt1.player.position) < 1e-9, 'the 4D layer is observation only: the simulation is identical with it attached');
  assert.ok(felt1.sense.speed > 5, 'and it saw the motion');
});
