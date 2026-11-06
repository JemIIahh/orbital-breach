import { MathUtils, Quaternion } from 'three';

export function smoothSurfaceUp(current,target,dt){
  const rotation=new Quaternion().setFromUnitVectors(current,target);rotation.slerp(new Quaternion(),Math.exp(-dt*9));return current.applyQuaternion(rotation).normalize();
}

// Pose limits. Whatever the speed, the torso never leans further than these, and the stride never cycles faster than a mech
// that size could plausibly walk. (The lean used to be proportional to strafe speed with no cap, so a boosted strafe rolled
// the whole body 45 degrees and a dash made the legs flicker at 8 strides a second.)
export const POSE = { pitch: .2, roll: .11, hipYaw: 1, maxPhaseRate: 16.5, crouch: .3 };
const { clamp, damp } = MathUtils;

// Signed travel direction relative to the way the body faces: 0 = forward, +/-PI/2 = sideways, PI = backward.
// Past ~110 degrees the legs run in reverse instead of crabbing, so retreating looks like backing away and not a moonwalk.
export function travelHeading(forward, strafe) {
  if (Math.hypot(forward, strafe) < .4) return { yaw: 0, reverse: false };
  let heading = Math.atan2(strafe, forward), reverse = false;
  if (Math.abs(heading) > 1.9) { heading -= Math.sign(heading) * Math.PI; reverse = true; }
  return { yaw: clamp(heading, -POSE.hipYaw, POSE.hipYaw), reverse };
}

// `forward` (signed speed along the facing), `turn` (yaw rate, rad/s), `vertical` (speed along up) and `dash` come from the player;
// everything else keeps its old meaning. Bots only report `speed`, `strafe` and `backwards`, which is enough to derive `forward`.
export function animateMech(mech,{dt,time,speed=0,strafe=0,forward,turn=0,vertical=0,dash=false,aimPitch=0,airborne=false,boost=false,recoil=0,hit=0,stagger=0,staggerSide=0,charge=0,backwards=false}){
  const state=mech.motion||(mech.motion={phase:0,blend:0,yaw:0,pitch:0,roll:0,crouch:0,fall:0,air:false});
  const l=mech.limbs,fwd=forward??(backwards?-speed:speed),planar=Math.hypot(fwd,strafe),intensity=Math.min(1,planar/5);
  const {yaw,reverse}=travelHeading(fwd,strafe);
  // Stride: cycles with distance travelled, but the rate is capped; going faster lengthens the swing instead of flickering the legs.
  state.phase+=(reverse?-1:1)*dt*Math.min(planar*1.25,POSE.maxPhaseRate);
  state.blend=damp(state.blend,airborne?0:intensity,12,dt);
  state.yaw=damp(state.yaw,yaw*(airborne?.4:1),9,dt);
  const gait=Math.sin(state.phase),blend=state.blend,stride=.62*clamp(.5+planar/22,.5,1.2);
  // Landing: remember the hardest fall, and absorb it with the knees and hips the moment the feet touch down.
  if(airborne){state.fall=Math.min(state.fall,vertical);state.air=true}
  else if(state.air){state.crouch=clamp(-state.fall/17,0,1);state.fall=0;state.air=false}
  state.crouch=damp(state.crouch,0,6.5,dt);
  const crouch=state.crouch;
  if(l.body){
    const bob=Math.abs(Math.cos(state.phase))*blend*.065,breath=blend<.1&&!airborne?Math.sin(time*1.8)*.012:0;
    l.body.position.y=bob+breath+(airborne?Math.sin(time*3)*.035:0)-crouch*POSE.crouch;
    // +x tips the torso back, -x forward. Lean follows the pace and is capped; a boost or dash leans further into the run.
    const lean=-clamp(fwd/22,-.5,1)*.1-(boost?.05:0)-(dash?.12:0)-(airborne?.06:0)+crouch*.06;
    l.body.rotation.x=damp(l.body.rotation.x,clamp(lean,-POSE.pitch,POSE.pitch)+stagger*.24,9,dt);
    // Roll banks into a strafe and into a turn, never more than POSE.roll (about 6 degrees).
    const bank=-clamp(strafe/22,-1,1)*.07+clamp(turn*.012,-.04,.04);
    l.body.rotation.z=damp(l.body.rotation.z,clamp(bank,-POSE.roll,POSE.roll)+staggerSide*stagger*.14,8,dt);
    l.body.position.z=recoil*.07+hit*.1+stagger*.14;
    l.body.rotation.y=damp(l.body.rotation.y,-state.yaw*.12+clamp(turn*.015,-.06,.06),8,dt);
  }
  for(const [side,sign] of [['left',1],['right',-1]]){
    const leg=l[`${side}Leg`],knee=l[`${side}Knee`],ankle=l[`${side}Ankle`];
    if(!leg)continue;
    // Yaw the hip about the vertical first and swing about the yawed axis: the legs step the way the mech is travelling, not the
    // way it is aiming. (Euler order YXZ makes rotation.y the outermost turn.)
    if(leg.rotation.order!=='YXZ')leg.rotation.order='YXZ';
    leg.rotation.y=-state.yaw;
    const swing=gait*sign;
    leg.rotation.x=damp(leg.rotation.x,airborne?-.28:swing*stride*blend-crouch*.3,16,dt);
    leg.rotation.z=damp(leg.rotation.z,airborne?sign*.13:sign*.035,12,dt);
    if(knee)knee.rotation.x=damp(knee.rotation.x,airborne?.65:Math.max(0,-swing)*.95*blend+.08+crouch*.75,16,dt);
    if(ankle)ankle.rotation.x=-(leg.rotation.x+(knee?.rotation.x||0))*.8;
    const arm=l[`${side}Arm`],elbow=l[`${side}Elbow`],gun=l[`${side}Gun`];
    if(arm)arm.rotation.x=damp(arm.rotation.x,.22+aimPitch*.35-swing*.10*blend+recoil*.18+stagger*.45,16,dt);
    if(elbow)elbow.rotation.x=damp(elbow.rotation.x,.5+recoil*.25,16,dt);
    if(gun){gun.rotation.x=aimPitch-(arm?.rotation.x||0)-(elbow?.rotation.x||0);gun.userData.flash.visible=recoil>.6;gun.userData.barrels.rotation.z+=dt*(recoil>0?28:2)}
    const jet=l[`${side}Jet`];
    if(jet){jet.visible=airborne||boost;jet.scale.y=(boost?2.8:1.4)+Math.sin(time*37+sign)*.3}
  }
  if(l.quadLegs)for(const leg of l.quadLegs){const ph=state.phase+leg.userData.phase;leg.rotation.x=damp(leg.rotation.x,airborne?-.35:Math.sin(ph)*.42*blend,14,dt);leg.rotation.z=damp(leg.rotation.z,airborne?0:Math.max(0,Math.cos(ph))*.12*blend,14,dt)}
  // The head counter-rolls the torso so the visor stays level, and looks where the guns point.
  if(l.head){l.head.rotation.x=damp(l.head.rotation.x,aimPitch*.4+stagger*.3,8,dt);l.head.rotation.y=Math.sin(time*1.4)*.035;if(l.body)l.head.rotation.z=-l.body.rotation.z*.6}
  const reactor=mech.group?.userData.reactor;if(reactor)reactor.material.emissiveIntensity=1.45+Math.sin(time*4)*.22+hit*.4;
  if(mech.paint)mech.paint.emissive.setRGB(hit*.65+charge*.12,hit*.13+charge*.025,hit*.03);
  if(mech.glow)mech.glow.emissiveIntensity=1.05+charge*1.7+recoil*.85;
}
