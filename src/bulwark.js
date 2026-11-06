import { Vector3 } from 'three';

export const BULWARK = { frontScale:.22, reactorScale:2.5, turnRate:.85, frontCone:.35, rearCone:-.35 };
const FRONT=new Vector3(0,0,-1),UP=new Vector3(0,1,0);

// The incoming shot's position decides the side, rather than the pilot's current
// position (a pilot may already have dashed elsewhere while the round travels).
export function bulwarkFacing(bot,source){
  const forward=FRONT.clone().applyQuaternion(bot.group.quaternion),up=UP.clone().applyQuaternion(bot.group.quaternion);
  const to=new Vector3().subVectors(source,bot.group.position);to.addScaledVector(up,-to.dot(up));
  return to.lengthSq()>.0001?to.normalize().dot(forward):0;
}
export function bulwarkHit(bot,part,source,{direct=true}={}){
  const result={scale:1,reactor:false,armored:false,bypass:false};
  if(bot.archetype!=='bulwark'||!source||!direct)return result;
  const facing=bulwarkFacing(bot,source);
  if(part==='reactor'&&facing<BULWARK.rearCone)return{scale:BULWARK.reactorScale,reactor:true,armored:false,bypass:true};
  if(!bot.armLost&&facing>BULWARK.frontCone)return{scale:part==='head'?.5:BULWARK.frontScale,reactor:false,armored:true,bypass:false};
  return result;
}
export function applyBulwarkDamage(bot,damage,part,source,context={}){
  const hit=bulwarkHit(bot,part,source,context),amount=damage*hit.scale;
  const shieldDamage=hit.bypass?0:Math.min(bot.shield,amount);bot.shield-=shieldDamage;
  bot.health=Math.max(0,bot.health-(amount-shieldDamage)*(part==='head'?1.65:1));
  return{...hit,damage:amount,dead:bot.health<=0};
}
