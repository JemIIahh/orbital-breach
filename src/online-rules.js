// Shared, versioned multiplayer rules. No browser or transport dependencies.
import { stationPosition, TAU } from './physics.js';
import { terrainHeight } from './eden-terrain.js';
import { MULTIPLAYER_SECONDS } from './match-limits.js';
export const PROTOCOL=1, MIN_PLAYERS=3, MAX_PLAYERS=8, MATCH_SECONDS=MULTIPLAYER_SECONDS, KILL_LIMIT=15, RESPAWN_SECONDS=4, PROTECTION_SECONDS=3;
export const MAPS={station:{name:'Kestrel / Freight Circuit',description:'Three ring routes, sixteen docks, breachable glass and open space.'},city:{name:'Meridian / Central Avenue',description:'Street cover, elevated bridges and rooftop flanks.'},eden:{name:'Eden / The Sanctuary',description:'Forest paths, ancient ruins and the Heart Tree clearing.'}};
export const PALETTE=['#76d9ef','#ff9475','#c2a3ff','#9be69b','#f4ce79','#ea9dcd','#8aafff','#dce8e9'];
export function spawnPoints(map){
  if(map==='station')return Array.from({length:8},(_,i)=>({...stationPosition(i*TAU/8+.32,2.74,i%2?26:-26),yaw:0}));
  const points=map==='city'?[[0,-82],[0,-54],[0,-26],[0,2],[0,30],[0,58],[0,82],[0,-40]]:[[-12,60],[12,65],[-7,78],[8,86],[-12,67],[4,74],[0,-44],[0,20]];
  return points.map(([x,z])=>({x,y:(map==='eden'?terrainHeight(x,z):0)+2.74,z,yaw:0}));
}
export function supplyPoints(map){
  if(map==='station')return [0,1,2,3].map((i)=>({id:`s${i}`,...stationPosition(.4+i*TAU/4,.2,i%2?26:-26)}));
  return (map==='city'?[[0,-18],[0,40],[0,74]]:[[0,0],[-12,60],[4,74]]).map(([x,z],i)=>({id:`s${i}`,x,y:(map==='eden'?terrainHeight(x,z):0)+.2,z}));
}
export const cleanName=value=>String(value||'PILOT').normalize('NFKC').replace(/[^\p{L}\p{N} _-]/gu,'').trim().slice(0,18)||'PILOT';
export const finiteVector=value=>Array.isArray(value)&&value.length===3&&value.every(n=>Number.isFinite(n)&&Math.abs(n)<1000);
export function standings(players){return [...players].sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths||a.id.localeCompare(b.id))}
