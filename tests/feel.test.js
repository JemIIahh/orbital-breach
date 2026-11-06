import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { CHASE, chaseOffset, armTarget, armEase, mechVisible } from '../src/chase-camera.js';
import { animateMech, travelHeading, POSE } from '../src/animation.js';
import { makeMech } from '../src/world.js';
import { simulation } from './support.js';

const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z), UP = v(0, 1, 0), FWD = v(1, 0, 0);

// ---- chase camera --------------------------------------------------------------------------------------------------------------------

test('chase camera: the position follows a limited pitch, so looking up or down can never put it under the street or inside the mech', () => {
  let lowest = Infinity;
  for (let pitch = -1.5; pitch <= 1.5; pitch += .05) {
    const o = chaseOffset(FWD, UP, pitch);
    assert.ok(o.dot(FWD) < -CHASE.minDistance * .7, `pitch ${pitch.toFixed(2)}: camera is not behind the mech (${o.dot(FWD).toFixed(2)})`);
    assert.ok(o.length() >= CHASE.minDistance && o.length() < CHASE.distance + CHASE.lift, `pitch ${pitch.toFixed(2)}: arm ${o.length().toFixed(2)}`);
    lowest = Math.min(lowest, o.y);
  }
  // the pivot is 0.4 above the eye and the feet are 2.65 below it: even looking straight up the camera stays above the soles
  assert.ok(lowest > -3.05 + .4, `camera dips to ${lowest.toFixed(2)} below the pivot`);
  assert.deepEqual(chaseOffset(FWD, UP, 1.4).toArray(), chaseOffset(FWD, UP, CHASE.maxUp).toArray(), 'pitch beyond the limit does not move the camera');
  assert.deepEqual(chaseOffset(FWD, UP, -1.5).toArray(), chaseOffset(FWD, UP, -CHASE.maxDown).toArray());
});

test('chase camera: a wall pulls the arm in at once, never closer than the minimum, and it eases back out', () => {
  assert.equal(armTarget(6.7, null), 6.7);
  assert.equal(armTarget(6.7, 20), 6.7);
  assert.ok(Math.abs(armTarget(6.7, 4) - (4 - CHASE.margin)) < 1e-9, 'stops just in front of the wall');
  assert.equal(armTarget(6.7, .5), CHASE.minDistance);
  assert.equal(armEase(6.7, 2, .016), 2, 'pulling in is instant: a wall is never seen through');
  const out = armEase(2, 6.7, .016);
  assert.ok(out > 2 && out < 2.5, `easing out starts gently (${out.toFixed(3)})`);
  let arm = 2; for (let i = 0; i < 90; i++) arm = armEase(arm, 6.7, 1 / 60);
  assert.ok(arm > 6.5, 'and arrives within about a second and a half');
});

test('chase camera: the mech is hidden only when the camera is almost inside it', () => {
  assert.equal(mechVisible(CHASE.distance), true);
  assert.equal(mechVisible(CHASE.minDistance), false, 'at the minimum arm the camera would be looking at the inside of the torso');
  assert.equal(mechVisible(CHASE.hideBelow), true);
});

// ---- body animation ------------------------------------------------------------------------------------------------------------------

function run(params, frames = 120) {
  const mech = makeMech('red');
  for (let i = 0; i < frames; i++) animateMech(mech, { dt: 1 / 60, time: i / 60, ...params });
  return mech;
}

test('animation: however fast it flies, the torso lean and bank stay inside the pose limits', () => {
  const cases = [
    { speed: 33, forward: 33, boost: true }, { speed: 43, forward: 43, dash: true, boost: true }, { speed: 33, strafe: 33, forward: 0, boost: true },
    { speed: 40, strafe: -40, forward: 20, boost: true, airborne: true }, { speed: 0, turn: 20 }, { speed: 12, forward: -12, strafe: 25 }
  ];
  for (const c of cases) {
    const m = run(c);
    assert.ok(Math.abs(m.limbs.body.rotation.x) <= POSE.pitch + 1e-6, `${JSON.stringify(c)}: pitch ${m.limbs.body.rotation.x.toFixed(3)}`);
    assert.ok(Math.abs(m.limbs.body.rotation.z) <= POSE.roll + 1e-6, `${JSON.stringify(c)}: roll ${m.limbs.body.rotation.z.toFixed(3)}`);
  }
});

test('animation: the stride never cycles faster than the cap, even at dash speed', () => {
  const m = run({ speed: 43, forward: 43, dash: true }, 1);
  const before = m.motion.phase; animateMech(m, { dt: 1 / 60, time: 1, speed: 43, forward: 43, dash: true });
  const rate = (m.motion.phase - before) * 60;
  assert.ok(rate <= POSE.maxPhaseRate + 1e-6, `stride rate ${rate.toFixed(1)} rad/s`);
  assert.ok(rate > 10, 'but a fast mech is still visibly running');
  const walk = run({ speed: 4, forward: 4 }, 1), p0 = walk.motion.phase; animateMech(walk, { dt: 1 / 60, time: 1, speed: 4, forward: 4 });
  assert.ok((walk.motion.phase - p0) * 60 < 6, 'a walk is a slow cycle');
});

test('animation: the legs step the way the mech travels, running backwards when it retreats', () => {
  assert.deepEqual(travelHeading(10, 0), { yaw: 0, reverse: false });
  assert.equal(travelHeading(0, 10).reverse, false);
  assert.ok(Math.abs(travelHeading(0, 10).yaw - POSE.hipYaw) < 1e-9 && travelHeading(0, -10).yaw < 0, 'strafing turns the hips to the side of travel, up to the limit');
  const back = travelHeading(-10, 0);
  assert.equal(back.reverse, true); assert.ok(Math.abs(back.yaw) < .05, 'retreating runs the legs in reverse instead of crabbing');
  assert.equal(travelHeading(.1, .1).reverse, false); assert.equal(travelHeading(.1, .1).yaw, 0, 'standing still keeps the legs square');

  const fwd = run({ speed: 8, forward: 8 }, 30), bwd = run({ speed: 8, forward: -8 }, 30), side = run({ speed: 8, forward: 0, strafe: 8 }, 60);
  assert.ok(fwd.motion.phase > 0 && bwd.motion.phase < 0, 'the stride cycle runs backwards when walking backwards');
  assert.ok(Math.abs(side.limbs.leftLeg.rotation.y) > .5 && Math.abs(fwd.limbs.leftLeg.rotation.y) < .05, 'strafing yaws both hips');
  assert.equal(side.limbs.leftLeg.rotation.y, side.limbs.rightLeg.rotation.y);
});

test('animation: landing hard drops the body and bends the knees, then recovers', () => {
  const m = makeMech('red');
  for (let i = 0; i < 40; i++) animateMech(m, { dt: 1 / 60, time: i / 60, airborne: true, vertical: -17 });
  const settled = m.limbs.body.position.y;
  animateMech(m, { dt: 1 / 60, time: 1, airborne: false });
  const crouch = m.motion.crouch; assert.ok(crouch > .6, `crouch ${crouch.toFixed(2)} after a terminal-speed fall`);
  for (let i = 0; i < 6; i++) animateMech(m, { dt: 1 / 60, time: 1.1 + i / 60, airborne: false });
  assert.ok(m.limbs.body.position.y < -.05, `body sank ${m.limbs.body.position.y.toFixed(3)} (was ${settled.toFixed(3)} airborne)`);
  assert.ok(m.limbs.leftKnee.rotation.x > .4, 'the knees take the landing');
  for (let i = 0; i < 90; i++) animateMech(m, { dt: 1 / 60, time: 2 + i / 60, airborne: false });
  assert.ok(Math.abs(m.limbs.body.position.y) < .03 && m.motion.crouch < .01, 'and the mech stands back up');
  const soft = makeMech('red'); for (let i = 0; i < 20; i++) animateMech(soft, { dt: 1 / 60, time: i / 60, airborne: true, vertical: -2 });
  animateMech(soft, { dt: 1 / 60, time: 1, airborne: false }); assert.ok(soft.motion.crouch < .2, 'a hop barely bends the knees');
});

test('animation: a limb the new rig lacks never throws (bots share the same animator)', () => {
  const bare = { limbs: {}, group: new T.Group() };
  assert.doesNotThrow(() => animateMech(bare, { dt: 1 / 60, time: 0, speed: 10, strafe: 4, airborne: true, boost: true, stagger: 1 }));
});

// ---- shooting ------------------------------------------------------------------------------------------------------------------------

test('aim: with nothing in the way the crosshair point is far down the line of sight', () => {
  const game = simulation(); game.realm = 'garden'; game.world = { ...game.world, raycast: () => null };
  game.player.position.set(0, 1.7, 0); game.yaw = -Math.PI / 2; game.pitch = 0; game.thirdPerson = false;
  const p = game.aimPoint(100);
  assert.ok(p.distanceTo(game.player.position) > 99, `first-person aim point ${p.distanceTo(game.player.position).toFixed(1)} m away`);
  assert.ok(p.clone().sub(game.player.position).normalize().dot(v(1, 0, 0)) > .999, 'straight down the facing');
});

test('aim: an enemy on the crosshair is the aim point, so shots converge on it instead of the wall behind', () => {
  const game = simulation(); game.realm = 'garden';
  game.world = { ...game.world, raycast: () => ({ x: 90, y: 0, z: 0 }) };
  const group = new T.Group(); group.position.set(30, 0, 0);
  const part = new T.Mesh(new T.BoxGeometry(2, 3, 2), new T.MeshBasicMaterial()); part.position.set(0, 1.7, 0); part.userData.part = 'core'; group.add(part);
  group.updateMatrixWorld(true);
  game.bots = [{ dead: false, group, parts: [part], angle: 0 }];
  game.player.position.set(0, 1.7, 0); game.yaw = -Math.PI / 2; game.pitch = 0; game.thirdPerson = false;
  const p = game.aimPoint(100);
  assert.ok(Math.abs(p.x - 29) < .6, `aimed at the near face of the enemy: x ${p.x.toFixed(2)}`);
  game.bots[0].dead = true;
  assert.ok(Math.abs(game.aimPoint(100).x - 90) < .01, 'a dead enemy does not catch the aim');
});

test('shooting: every shot kicks the view up a little and it settles back; the cap holds under sustained fire', () => {
  const game = simulation();
  game.cooldowns = [0, 0]; game.heat = [0, 0]; game.overheated = [false, false];
  let guard = 0;
  while (!game.recoilKick && guard++ < 3) game.shoot(0);
  const first = game.recoilKick; assert.ok(first > 0 && first < .06, `one shot kicks ${first}`);
  for (let i = 0; i < 40; i++) { game.cooldowns[0] = 0; game.heat[0] = 0; game.shoot(0); }
  assert.ok(game.recoilKick <= .1 + 1e-9, `sustained fire is capped at ${game.recoilKick}`);
});
