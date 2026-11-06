import * as T from 'three';

// Sensation: the "4D cinema" layer. A 4DX theatre adds motion, wind, impacts in the seat and pressure on the body to what is
// on screen. A keyboard-and-mouse browser game has no seat, so this module translates each of those into what a screen,
// speakers and (if one is connected) a gamepad can do:
//
//   body      the view carries weight: it leans into strafes and turns, pitches under acceleration, dips when you land,
//             and lurches when you dash
//   air       how fast the wind should be (streaks and sound are driven from it; see air.js and AudioEngine.wind)
//   pressure  damage and nearby blasts arrive as a shockwave: a vignette pulse, a colour-fringing flash and a FOV punch
//   thump     sub-bass hits for damage, blasts, kills and landings
//   rumble    gamepad vibration for the same events
//
// Everything here is plain maths and callbacks so it can be tested without a GPU or an audio device. game.js owns the wiring.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const LEVELS = { off: 0, subtle: .5, full: 1 };
export const DEFAULT_LEVEL = 'full';
const known = name => typeof name === 'string' && Object.hasOwn(LEVELS, name);
export const levelValue = name => (known(name) ? LEVELS[name] : LEVELS[DEFAULT_LEVEL]);

const STORAGE_KEY = 'orbital-breach.sensation';
export function loadLevel(storage = globalThis.localStorage) {
  try { const v = storage?.getItem(STORAGE_KEY); return known(v) ? v : DEFAULT_LEVEL; } catch { return DEFAULT_LEVEL; }
}
export function saveLevel(name, storage = globalThis.localStorage) { try { if (known(name)) storage?.setItem(STORAGE_KEY, name); } catch { /* storage can be blocked: the setting simply won't persist */ } }

// A damped spring chasing `target`. Sub-stepped so a long frame (the game clamps at 0.15 s) can never make it unstable.
class Spring {
  constructor(omega, zeta) { this.w = omega; this.z = zeta; this.x = 0; this.v = 0; }
  step(dt, target = 0) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (this.w * this.w * (target - this.x) - 2 * this.z * this.w * this.v) * h; this.x += this.v * h; }
  }
  kick(velocity) { this.v += velocity; }
}

// Hard ceilings on what the view may ever do, however many events pile up. These are what keep a heavy fight from making
// anyone seasick: a 4D effect that overwhelms the picture is a bug, not a feature.
export const LIMITS = { pitch: .1, roll: .09, drop: .42, fov: 9, aberration: 1, pressure: 1, blur: .06 };

export class Sensation {
  // play(kind, {volume, pan}) and rumble(strong, weak, ms) are how it reaches the speakers and the gamepad.
  constructor({ reducedMotion = false, level = DEFAULT_LEVEL, play = () => {}, rumble = () => {} } = {}) {
    this.reduced = reducedMotion; this.play = play; this.rumble = rumble; this.setLevel(level);
    this.pitch = new Spring(13, .5); this.roll = new Spring(11, .55); this.drop = new Spring(16, .45); this.punch = new Spring(18, .6);
    this.pitchTarget = 0; this.rollTarget = 0;
    this.prev = new T.Vector3(); this.hasPrev = false; this.velocity = new T.Vector3();
    this.fall = 0; this.wasGrounded = true; this.wasBoosting = false; this.speed = 0; this.air = 0;
    this.pressure = 0; this.aberration = 0; this.yawPrev = null; this.yawRate = 0; this.fireClock = 0;
    this.out = { pitch: 0, roll: 0, drop: 0, fov: 0, aberration: 0, pressure: 0, blur: 0, streaks: 0, wind: 0 };
  }
  setLevel(name) { this.levelName = known(name) ? name : DEFAULT_LEVEL; this.level = LEVELS[this.levelName]; }
  // Visual motion respects the OS reduced-motion preference; sound and rumble are not motion and stay at the chosen level.
  get visual() { return this.reduced ? 0 : this.level; }

  // One fixed simulation step (called from simulate()). Reads the pilot's motion and works out what the body would feel.
  step(dt, s) {
    this.velocity.copy(s.velocity);
    if (this.hasPrev && dt > 0) {
      const dv = _dv.copy(s.velocity).sub(this.prev), aF = dv.dot(s.forward) / dt, aR = dv.dot(s.right) / dt;
      // accelerating forward tips the view back, braking tips it forward; strafing and sideways acceleration lean it into the move
      this.pitchTarget = clamp(aF / 180, -1, 1) * .03;
      this.rollTarget = clamp(-s.velocity.dot(s.right) / 20, -1, 1) * .025 + clamp(-aR / 200, -1, 1) * .02;
    }
    this.prev.copy(s.velocity); this.hasPrev = true; this.speed = s.velocity.length();
    // landing: remember the hardest downward speed while airborne, and spend it the moment feet meet ground
    const vUp = s.velocity.dot(s.up);
    if (!s.grounded) this.fall = Math.min(this.fall, vUp);
    else if (!this.wasGrounded) { const strength = clamp(-this.fall / 17, 0, 1); this.fall = 0; if (strength > .25 && this.level) this.land(strength); }
    else this.fall = 0;
    this.wasGrounded = !!s.grounded;
    if (s.boosting && !this.wasBoosting && this.speed > 6 && this.level) { this.punch.kick(45); this.play('whoosh', { volume: .6 }); }
    this.wasBoosting = !!s.boosting;
    this.fireClock = Math.max(0, this.fireClock - dt);
  }

  // One rendered frame (real time). Integrates the springs and publishes what the camera, post-process, wind streaks and wind
  // sound should do. `yaw` is the pilot's heading in radians: turning hard banks the view like an aircraft.
  update(dt, { yaw = null, tethering = false } = {}) {
    let bank = 0;
    if (yaw != null && this.yawPrev != null && dt > 0) {
      let d = yaw - this.yawPrev; d = Math.atan2(Math.sin(d), Math.cos(d));
      // a jump this large is a respawn or a latch snapping the view, not the pilot turning: ignore it
      const rate = Math.abs(d) > .6 ? 0 : d / dt;
      this.yawRate += (clamp(rate, -6, 6) - this.yawRate) * (1 - Math.exp(-dt * 12));
      bank = clamp(this.yawRate * .008, -.04, .04);
    }
    if (yaw != null) this.yawPrev = yaw;
    this.pitch.step(dt, this.pitchTarget); this.roll.step(dt, this.rollTarget + bank); this.drop.step(dt, 0); this.punch.step(dt, 0);
    this.pressure *= Math.exp(-dt * 4.2); this.aberration *= Math.exp(-dt * 7);
    const airTarget = smooth(10, 34, this.speed);
    this.air += (airTarget - this.air) * (1 - Math.exp(-dt * 3));
    const v = this.visual, o = this.out;
    const at = x => (v ? x * v : 0); // an exact 0 (not -0) when the visual layer is off
    o.pitch = at(clamp(this.pitch.x, -LIMITS.pitch, LIMITS.pitch));
    o.roll = at(clamp(this.roll.x, -LIMITS.roll, LIMITS.roll));
    o.drop = at(clamp(this.drop.x, -LIMITS.drop, LIMITS.drop));
    o.fov = at(clamp(this.punch.x, -LIMITS.fov, LIMITS.fov));
    o.aberration = at(clamp(this.aberration, 0, LIMITS.aberration));
    o.pressure = at(clamp(this.pressure, 0, LIMITS.pressure));
    o.blur = tethering ? 0 : at(this.air * this.air * LIMITS.blur);       // radial speed blur: only really noticeable near full tilt
    o.streaks = at(this.air * (tethering ? .16 : 1));               // wind streaks in the air
    o.wind = this.level ? this.air * this.level : 0; // wind noise (audible even with reduced motion)
    return o;
  }

  land(strength) {
    this.drop.kick(strength * 2.6); this.pitch.kick(-strength * .9);
    this.play('land', { volume: .35 + .65 * strength }); this.rumble(strength * .8, strength * .45, 90 + strength * 90);
  }

  // Discrete moments. Each is scaled to its own strength and does nothing at all when the level is off.
  event(kind, d = {}) {
    if (!this.level) return;
    switch (kind) {
      case 'dash':
        this.pitch.kick(1); this.punch.kick(110); this.aberration = Math.max(this.aberration, .6);
        this.play('whoosh', { volume: .8 }); this.rumble(.45, .7, 140); break;
      case 'hurt': {
        const a = clamp(d.amount ?? .5, 0, 1);
        this.pressure = Math.max(this.pressure, .35 + .5 * a); this.aberration = Math.max(this.aberration, .45 + .5 * a);
        this.play('thump', { volume: .45 + .55 * a }); this.rumble(.3 + .7 * a, .6, 120 + a * 180); break;
      }
      case 'blast': {
        // size ~1 is a missile, ~1.25 an enemy mech going up; closer and bigger is stronger, and far blasts are only a rumble
        const size = d.size ?? 1, k = clamp(1 - (d.distance ?? 99) / (28 + 14 * size), 0, 1) * Math.min(1.4, size);
        if (k < .05) return;
        this.punch.kick(k * 150); this.drop.kick(k * 1.2); this.aberration = Math.max(this.aberration, k * .9); this.pressure = Math.max(this.pressure, k * .5);
        this.play('thump', { volume: clamp(k, 0, 1) }); this.rumble(clamp(k, 0, 1), clamp(k * .6, 0, 1), 160 + k * 200); break;
      }
      case 'kill': {
        const k = clamp(1 - (d.distance ?? 20) / 40, .15, 1) * (d.big ? 1.4 : 1);
        this.punch.kick(40 * k); this.play('thump', { volume: clamp(.45 * k, 0, 1) }); this.rumble(clamp(.5 * k, 0, 1), clamp(.8 * k, 0, 1), 120); break;
      }
      case 'fire':
        // a gun is felt in the hands, not shaken through the whole view: rumble only, rate-limited
        if (this.fireClock > 0) return;
        this.fireClock = d.heavy ? .12 : .07; this.rumble(d.heavy ? .45 : 0, d.heavy ? .3 : .22, 40); break;
      case 'miss': this.rumble(0, .35, 50); break;
    }
  }
}
const _dv = new T.Vector3();

// Gamepad rumble. Chrome only lists a controller after a button has been pressed on it, and the game does not read gamepad
// input at all, so this fires only for a controller that happens to be connected: it is a bonus, never a requirement.
export class Haptics {
  constructor(nav = globalThis.navigator) { this.nav = nav; this.last = -1e9; }
  rumble(strong, weak, ms, now = globalThis.performance?.now?.() ?? Date.now()) {
    if (now - this.last < 25) return false; // one effect at a time: a new one replaces the old
    let played = false;
    let pads = [];
    try { pads = Array.from(this.nav?.getGamepads?.() || []); } catch { return false; }
    for (const pad of pads) {
      const actuator = pad?.vibrationActuator;
      if (!actuator?.playEffect) continue;
      try {
        const result = actuator.playEffect('dual-rumble', { startDelay: 0, duration: clamp(ms, 0, 1000), weakMagnitude: clamp(weak, 0, 1), strongMagnitude: clamp(strong, 0, 1) });
        result?.catch?.(() => {}); played = true;
      } catch { /* a controller that refuses the effect is not worth an error */ }
    }
    if (played) this.last = now;
    return played;
  }
}
