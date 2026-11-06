import { RADIUS, TAU, wrapAngle } from './physics.js';
import { ENEMY_TYPES } from './encounters.js';

export const INITIAL_ENEMY_DISTANCES=[42,60,80,-62,-86,108];
export function planEnemySpawn(playerAngle,index,bots,initial=false,rng=Math.random){
  if(initial)return {angle:wrapAngle(playerAngle+INITIAL_ENEMY_DISTANCES[index%6]/RADIUS),side:[-2.1,2.1,0][index%3]};
  let best=null;
  for(let i=0;i<36;i++){
    const sign=i%2===0?1:-1;
    const distance=40+rng()*60;
    const angle=wrapAngle(playerAngle+sign*distance/RADIUS),side=[-2.2,0,2.2][i%3];
    const separation=bots.filter(b=>!b.dead&&b.index!==index).reduce((nearest,b)=>Math.min(nearest,Math.hypot(wrapAngle(angle-b.angle)*RADIUS,side-b.side)),Infinity);
    const score=Math.min(separation,25)-Math.abs(distance-55)*.035;
    if(!best||score>best.score)best={angle,side,score};
  }
  return best;
}
export function safestPlayerAngle(bots){
  let best={angle:-.1,clearance:-1};
  for(let i=0;i<96;i++){
    const angle=i/96*TAU;
    const clearance=bots.filter(b=>!b.dead).reduce((nearest,b)=>Math.min(nearest,Math.abs(wrapAngle(angle-b.angle))*RADIUS),100);
    if(clearance>best.clearance)best={angle,clearance};
  }
  return best.angle;
}

// Local corridor steering: hold a combat range, retreat when rushed, and separate from allies.
export function steerEnemy(bot,playerAngle,bots,time,training=false){
  const delta=wrapAngle(playerAngle-bot.angle),distance=Math.abs(delta)*RADIUS,sign=Math.sign(delta)||1;
  const spec=ENEMY_TYPES[bot.archetype],chaser=spec?spec.attack==='rush':bot.index%3===0,preferred=training?42:spec?.range??(chaser?4.8:22+(bot.index%2)*5),band=chaser&&!training?.8:4;
  let along=distance>preferred+band?sign*(training?2.5:chaser?11:8):distance<preferred-band?-sign*7:Math.sin(time*.8+bot.phase)*.8;
  let lateral=Math.sin(time*1.25+bot.phase)*2.8;
  for(const other of bots){
    if(other===bot||other.dead)continue;
    const a=wrapAngle(bot.angle-other.angle)*RADIUS,z=bot.side-other.side,d=Math.hypot(a,z);
    if(d<7&&d>.01){const push=(7-d)*1.9;along+=a/d*push;lateral+=z/d*push}
  }
  return {along:Math.max(-10,Math.min(10,along)),lateral:Math.max(-4,Math.min(4,lateral)),distance};
}
