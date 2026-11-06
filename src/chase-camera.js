import * as T from 'three';

// Chase camera maths, kept free of the game object so it can be tested. The old camera sat at `position - aim * 6.5`, so looking
// up swung it under the mech (and, aimed straight up, inside the torso: a black screen) and looking down lifted it off the street.
// Now the camera's *position* follows a limited pitch while it still *looks* along the real aim.
export const CHASE = { distance: 6.5, lift: 1.9, maxUp: .42, maxDown: 1.2, minDistance: 1.8, margin: .45, hideBelow: 2.3 };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Where the camera wants to be, relative to the mech's pivot: behind it, lifted, orbiting with the (limited) pitch.
export function chaseOffset(forward, up, pitch, out = new T.Vector3()) {
  const cp = clamp(pitch, -CHASE.maxDown, CHASE.maxUp);
  return out.copy(forward).multiplyScalar(-Math.cos(cp) * CHASE.distance).addScaledVector(up, -Math.sin(cp) * CHASE.distance + CHASE.lift);
}

// Spring arm: if something stands between the pivot and the camera, the camera comes in front of it (never closer than minDistance).
export function armTarget(wanted, hitDistance = null) {
  if (hitDistance == null || hitDistance >= wanted) return wanted;
  return clamp(hitDistance - CHASE.margin, Math.min(CHASE.minDistance, wanted), wanted);
}

// Pulling in is instant (a wall must never be seen through); easing back out is gradual so the camera does not pop.
export function armEase(current, target, dt) {
  return target < current ? target : current + (target - current) * (1 - Math.exp(-dt * 5));
}

// The mech is hidden when the camera is so close that it would be looking at the inside of it.
export const mechVisible = arm => arm >= CHASE.hideBelow;
