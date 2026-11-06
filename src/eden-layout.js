// Gameplay-critical Eden positions and the keep-clear rules that decorative/solid placement must respect.
import * as T from 'three';
import { V, clamp } from './eden-core.js';
import { terrainHeight, pathX, PATH, inStream, inPond, WATER_Y } from './eden-terrain.js';

export const SPAWN={x:0,z:-44};
export const PORTAL={x:0,z:-53};
export const HEART={x:0,z:78};
export const ARCHIVE={x:0,z:74};
// Mirrors spawnGardenBot in game.js: wave 1 fights around z=30, later waves around z=4; offsets are indexed by bot.
const OFFSETS=[[-12,30],[12,35],[-7,48],[8,56],[-12,63],[4,70]];
export const BOT_SPAWNS=[30,4].flatMap(cz=>OFFSETS.map(([dx,dz])=>({x:clamp(dx,-25,25),z:clamp(cz+dz,-30,85)})));
export const KEEP=[
  {x:SPAWN.x,z:SPAWN.z,r:8,name:'spawn'},{x:PORTAL.x,z:PORTAL.z,r:9,name:'portal'},{x:ARCHIVE.x,z:ARCHIVE.z,r:9,name:'archive'},
  ...BOT_SPAWNS.map((s,i)=>({x:s.x,z:s.z,r:5.5,name:'bot'+i})),
];
export const FIGHT={x0:-25,x1:25,z0:28,z1:88};
export const inFight=(x,z)=>x>FIGHT.x0&&x<FIGHT.x1&&z>FIGHT.z0&&z<FIGHT.z1;
export const PATH_HALF=4.6; // solids keep this far from the path centre line
export const pathPoints=(()=>{const a=[];for(let z=PATH.z0;z<=PATH.z1;z+=2)a.push({x:pathX(z),z});return a})();
export function keepDistance(x,z){let m=Infinity;for(const k of KEEP)m=Math.min(m,Math.hypot(x-k.x,z-k.z)-k.r);return m}
// May a solid obstacle of radius r stand here?
export function solidOk(x,z,r=1,{path=true,keep=true}={}){
  if(keep&&keepDistance(x,z)<r)return false;
  if(path&&z>PATH.z0-6&&z<PATH.z1+10&&Math.abs(x-pathX(z))<PATH_HALF+r)return false;
  if(terrainHeight(x,z)<WATER_Y+.45||inStream(x,z,r+1.5)||inPond(x,z,r+2))return false;
  return true;
}
// Small spatial hash so scatterers can keep their distance from everything already placed.
export class Occupancy{
  constructor(cell=6){this.cell=cell;this.map=new Map()}
  key(i,j){return i*73856093^j*19349663}
  ok(x,z,r,scale=1){const c=this.cell,i0=Math.floor((x-r-8)/c),i1=Math.floor((x+r+8)/c),j0=Math.floor((z-r-8)/c),j1=Math.floor((z+r+8)/c);
    for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++){const l=this.map.get(this.key(i,j));if(l)for(const o of l){if(Math.hypot(o.x-x,o.z-z)<(o.r+r)*scale)return false}}return true}
  put(x,z,r){const k=this.key(Math.floor(x/this.cell),Math.floor(z/this.cell));let l=this.map.get(k);if(!l)this.map.set(k,l=[]);l.push({x,z,r})}
}
export function makeObstacle(kind,x,y,z,radius,height){
  return {kind,position:V(x,y,z),radius,height,box:new T.Box3(V(x-radius,y,z-radius),V(x+radius,y+height,z+radius))};
}
