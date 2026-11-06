import { Vector3 } from 'three';

export const TETHER = { range:110, hookSpeed:110, speed:36, acceleration:72, brake:96, standOff:2.7, arrival:.45, timeout:8, stall:.7 };

export class Grapple {
  constructor(){this.release()}
  release(){this.mode='idle';this.hit=null;this.tip=null;this.age=0;this.distance=0;this.stalled=0;this.lastDistance=null;this.probe=0}
  fire(origin,direction,raycast){
    if(direction.lengthSq()<1e-8)return false;
    const dir=direction.clone().normalize(),hit=raycast(origin,origin.clone().addScaledVector(dir,TETHER.range));
    if(!hit||origin.distanceTo(new Vector3(hit.x,hit.y,hit.z))<3.2)return false;
    this.release();
    this.hit={...hit,point:new Vector3(hit.x,hit.y,hit.z),normal:new Vector3(hit.normal?.x||0,hit.normal?.y||0,hit.normal?.z||0)};
    if(this.hit.normal.lengthSq()<.01)this.hit.normal.copy(dir).negate();this.hit.normal.normalize();
    this.mode='flying';this.origin=origin.clone();this.tip=origin.clone();this.distance=origin.distanceTo(this.hit.point);return true;
  }
  update(dt,player,{brokenWindows=new Set(),raycast=null,onLatch=()=>{},onRelease=()=>{}}={}){
    if(this.mode==='idle')return;
    this.age+=dt;
    const detach=reason=>{const hit=this.hit;this.release();onRelease(reason,hit)};
    if(this.mode==='latched'){if(this.age>.3)this.release();return}
    this.distance=player.position.distanceTo(this.hit.point);
    if(this.mode==='flying'){
      const delta=this.hit.point.clone().sub(this.tip),distance=delta.length();
      if(distance<=TETHER.hookSpeed*dt){
        this.tip.copy(this.hit.point);this.mode='pulling';this.age=0;
        player.magnetic=false;player.surfaceUp=null;player.radialSign=null;
      }else this.tip.addScaledVector(delta,TETHER.hookSpeed*dt/distance);
      return;
    }
    if(this.hit.surface==='window'&&brokenWindows.has(this.hit.key)&&this.distance<5){detach('breach');return}
    // A cable cannot drag the pilot through intervening walls or around a blind
    // corner. Probe periodically; ordinary body collision still handles every step.
    this.probe-=dt;
    if(raycast&&this.probe<=0){
      this.probe=.1;const end=this.hit.point.clone().addScaledVector(this.hit.normal,.12),block=raycast(player.position,end);
      if(block&&new Vector3(block.x,block.y,block.z).distanceTo(this.hit.point)>.7){detach('blocked');return}
    }
    const glass=this.hit.surface==='window',target=this.hit.point.clone().addScaledVector(this.hit.normal,glass?-.5:TETHER.standOff);
    const delta=target.sub(player.position),distance=delta.length();
    if(!glass&&distance<TETHER.arrival&&player.velocity.length()<6){
      // Stop the reel at the safe standing distance, rather than overshooting
      // into the wall and trying to pull back out on the next frame.
      player.velocity.set(0,0,0);player.magnetic=true;player.surfaceUp=this.hit.normal.clone();
      player.surfaceAnchor=this.hit.point.clone();player.radialSign=this.hit.radialSign||null;
      this.mode='latched';this.age=0;onLatch(this.hit);return;
    }
    if(this.lastDistance!==null&&this.lastDistance-distance<.003)this.stalled+=dt;else this.stalled=0;
    this.lastDistance=distance;
    if(this.stalled>TETHER.stall){detach('blocked');return}
    if(this.age>TETHER.timeout){detach('timeout');return}
    if(distance>.001){
      // No minimum reel speed: the reel brakes smoothly all the way to rest.
      // Bounded acceleration also preserves momentum when hooking across travel.
      const speed=Math.min(TETHER.speed,Math.sqrt(2*54*distance),distance*4);
      const desired=delta.multiplyScalar(speed/distance),change=desired.sub(player.velocity),amount=change.length();
      const braking=player.velocity.length()>speed,step=Math.min(amount,(braking?TETHER.brake:TETHER.acceleration)*dt);
      if(amount>1e-8)player.velocity.addScaledVector(change,step/amount);
    }
  }
}
