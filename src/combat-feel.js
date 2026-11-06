import * as T from 'three';

// Combat feel: the ballistics, volley shapes and feedback maths shared by the campaign garden enemies and by the
// Team Ops bots, kept free of rendering so the numbers can be tested. Enemy fire used to be a single thin bolt aimed
// 0.14 s ahead of the pilot with no spread, which a sidestep beats forever and which never *felt* like gunfire.
// Now rounds are aimed at the true intercept point, wobble inside a cone that tightens with skill, and leave in timed
// volleys that keep tracking the pilot between rounds.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const MAX_LEAD_SECONDS = 1.3;

// Shape of one trigger pull. `shots` rounds leave `gap` seconds apart; each shot throws `bolts` side-by-side rounds
// `fan` radians apart (the Archon's wall of fire).
export const VOLLEYS = {
  burst: { shots: 4, gap: .1, bolts: 1, fan: 0 },
  rush: { shots: 1, gap: 0, bolts: 1, fan: 0 },
  snipe: { shots: 1, gap: 0, bolts: 1, fan: 0 },
  blast: { shots: 1, gap: 0, bolts: 1, fan: 0 },
  boss: { shots: 2, gap: .42, bolts: 5, fan: .07 },
};
// Striker lunges connect inside this distance (metres): a dash or a hard sidestep during the wind-up beats them.
export const MELEE_REACH = 4.6;
export const volleyFor = attack => VOLLEYS[attack] || VOLLEYS.burst;

// Half-angle of the random cone around the aim line, before skill and target speed are applied.
const CONES = { burst: .02, snipe: .0035, blast: .015, boss: .018, rush: 0 };

// Campaign opposition gets sharper as the threat tier climbs; the floor keeps wave one honest but not harmless.
export const accuracyFor = tier => clamp(.6 + (tier - 1) * .045, .6, .94);
// How much of the true lead the AI applies (1 = perfect prediction of a straight-line mover).
export const leadFor = accuracy => clamp(.3 + accuracy * .6, .62, .92);

export function aimCone(attack, accuracy = .75, targetSpeed = 0) {
  const base = CONES[attack] ?? .02;
  return base * (1.9 - clamp(accuracy, 0, 1) * 1.2) + Math.min(Math.max(targetSpeed, 0), 14) * .0006 * (1.2 - clamp(accuracy, 0, 1)) * (base > 0 ? 1 : 0);
}

// Smallest positive time at which a round of `speed` launched from `from` meets a target moving at constant velocity.
export function interceptTime(dx, dy, dz, vx, vy, vz, speed) {
  const c = dx * dx + dy * dy + dz * dz, fallback = Math.min(Math.sqrt(c) / Math.max(speed, 1e-6), MAX_LEAD_SECONDS);
  const a = vx * vx + vy * vy + vz * vz - speed * speed, b = 2 * (dx * vx + dy * vy + dz * vz);
  if (Math.abs(a) < 1e-6) return b < 0 ? clamp(-c / b, 0, MAX_LEAD_SECONDS) : fallback;
  const disc = b * b - 4 * a * c; if (disc < 0) return fallback;
  const root = Math.sqrt(disc), t1 = (-b - root) / (2 * a), t2 = (-b + root) / (2 * a);
  const t = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
  return Number.isFinite(t) ? Math.min(t, MAX_LEAD_SECONDS) : fallback;
}

// Where to aim so a round fired now meets the target. `lead` scales how much of the prediction is applied.
export function leadPoint(from, target, velocity, speed, lead = 1, out = new T.Vector3()) {
  const t = interceptTime(target.x - from.x, target.y - from.y, target.z - from.z, velocity.x, velocity.y * .6, velocity.z, speed);
  return out.set(target.x + velocity.x * t * lead, target.y + velocity.y * .6 * t * lead, target.z + velocity.z * t * lead);
}

// Rotate `direction` by a random angle inside a cone (uniform over the disc), returning a unit vector in `out`.
const AXIS_A = new T.Vector3(), AXIS_B = new T.Vector3();
export function jitterDirection(direction, cone, rng = Math.random, out = new T.Vector3()) {
  out.copy(direction).normalize(); if (cone <= 0) return out;
  const pick = Math.abs(out.y) > .92 ? AXIS_B.set(1, 0, 0) : AXIS_B.set(0, 1, 0);
  AXIS_A.crossVectors(out, pick).normalize(); const second = AXIS_B.crossVectors(out, AXIS_A).normalize();
  const radius = cone * Math.sqrt(rng()), angle = rng() * Math.PI * 2;
  return out.addScaledVector(AXIS_A, Math.cos(angle) * radius).addScaledVector(second, Math.sin(angle) * radius).normalize();
}

// Angle of `point` around the pilot: 0 straight ahead, +PI/2 on the right, +-PI behind. Matches a clockwise HUD ring.
export function bearingOf(forward, right, origin, point) {
  const x = point.x - origin.x, y = point.y - origin.y, z = point.z - origin.z;
  return Math.atan2(x * right.x + y * right.y + z * right.z, x * forward.x + y * forward.y + z * forward.z);
}

// Closest distance between a segment and a point, without allocating.
export function passDistance(a, b, p) {
  const sx = b.x - a.x, sy = b.y - a.y, sz = b.z - a.z, len = sx * sx + sy * sy + sz * sz;
  const t = len > 1e-9 ? clamp(((p.x - a.x) * sx + (p.y - a.y) * sy + (p.z - a.z) * sz) / len, 0, 1) : 0;
  return Math.hypot(a.x + sx * t - p.x, a.y + sy * t - p.y, a.z + sz * t - p.z);
}

// How hard a hit should land on the screen, camera and speakers.
export function damageFeel(damage, shieldBefore, healthBefore, shieldAfter, healthAfter) {
  const shieldOnly = healthAfter >= healthBefore, shieldBroke = shieldBefore > 0 && shieldAfter <= 0;
  const amount = clamp(damage / 32, .25, 1);
  return {
    amount, shieldOnly, shieldBroke, healthHit: !shieldOnly,
    shake: clamp(.34 + damage / 26, .34, 1.5) * (shieldOnly ? 1 : 1.3),
    kick: clamp(damage * .0017, .014, .07) * (shieldOnly ? .8 : 1.25),
  };
}

// 0 when comfortable, 1 when one more burst ends the run; a faint 0.15 when the shield is gone but the core is intact.
export function dangerLevel(health, shield) {
  const core = clamp((62 - health) / 47, 0, 1), exposed = shield <= 0 && health < 100 ? .15 : 0;
  return clamp(core + exposed * (1 - core), 0, 1);
}
export const heartInterval = level => 1.15 - clamp(level, 0, 1) * .6;

// A new strafe direction and when to reconsider it, so the AI jinks unpredictably instead of weaving on a sine wave.
export function nextStrafe(time, rng = Math.random) { return { dir: rng() < .5 ? -1 : 1, until: time + .7 + rng() * 1.3 }; }

// Distance-based loudness for enemy gunfire (1 at point-blank, a faint floor at long range).
export const shotVolume = distance => clamp(1.12 - distance / 85, .12, 1);

// Rough damage per second one machine deals if every round lands, handy for tuning and for guarding regressions.
export function nominalDps(spec) { const v = volleyFor(spec.attack); return spec.damage * v.shots * v.bolts / Math.max(spec.cooldown, .1); }
