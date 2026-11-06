import { Vector3 } from 'three';

// Acceleration is bounded in metres/sec², even across a full-speed reversal.
// Ground braking is strong; jet steering preserves momentum in the air.
export function steerPlanar(current,desired,dt,{grounded=true,boost=false}={}){
  const delta=new Vector3().subVectors(desired,current),braking=desired.lengthSq()<.01;
  const acceleration=grounded?(braking?96:boost?85:64):(braking?18:28);
  const step=Math.min(acceleration*dt,delta.length()*(1-Math.exp(-dt*(braking?18:12))));
  if(delta.lengthSq()>1e-10)current.addScaledVector(delta,step/delta.length());
  return current;
}

// Body-space foot contact spacing. Melee enemies never trade away their safety
// gap to pressure a stationary pilot, and ranged machines retain room to react.
export function combatRange(spec,pressure=0){
  return spec.attack==='rush'?spec.range:Math.max(7,spec.range*(1-.25*Math.min(3,pressure)/3));
}
