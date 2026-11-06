// Collision comes from the same procedural builders as the client, with no WebGL context.
import * as T from 'three';
import { createStationLayout, ROOF_WINDOWS } from '../src/station-layout.js';
import { firstStationIntersection, resolveStationMotion, stationPosition, TAU, isAirlock, RADIUS } from '../src/physics.js';
import { createKit } from '../src/city-batch.js';
import { PROP_TINTS, addCityProps } from '../src/city-props.js';
import { addArchitecture } from '../src/city-arch.js';
import { makeFootprints } from '../src/city-layout.js';
import { makeBoxIndex } from '../src/city-spatial.js';
import { buildRuins } from '../src/eden-ruins.js';
import { buildShrine } from '../src/eden-shrine.js';
import { buildFlora } from '../src/eden-flora.js';
import { Occupancy } from '../src/eden-layout.js';
import { terrainHeight } from '../src/eden-terrain.js';
import { resolveParts, solidOf } from '../src/tree-collision.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),cache=new Map();
function flatArena(map,boxes,bodyBoxes=[],obstacles=[]){
  const shotIndex=makeBoxIndex(boxes),bodyIndex=makeBoxIndex(boxes.concat(bodyBoxes)),ground=(x,z)=>map==='eden'?terrainHeight(x,z):0;
  function raycast(a,b){
    const delta=b.clone().sub(a),length=delta.length();if(!length)return null;
    const ray=new T.Ray(a,delta.clone().normalize());let best=length+1e-4,result=null;
    for(const box of shotIndex.query(a,b)){const h=ray.intersectBox(box,V());if(h&&h.distanceTo(a)>.03&&h.distanceTo(a)<best){best=h.distanceTo(a);result=h.clone()}}
    let above=a.y-ground(a.x,a.z);const steps=Math.ceil(length/.75);
    for(let i=1;i<=steps;i++){const h=a.clone().addScaledVector(delta,i/steps),d=h.y-ground(h.x,h.z);if(d<=0&&above>0){let lo=(i-1)/steps,hi=i/steps;for(let k=0;k<9;k++){const m=(lo+hi)/2,q=a.clone().addScaledVector(delta,m);if(q.y>ground(q.x,q.z))lo=m;else hi=m}const q=a.clone().addScaledVector(delta,(lo+hi)/2);if(q.distanceTo(a)<best)result=q;break}above=d}
    return result;
  }
  function resolve(a,b,velocity,up){
    const p=a.clone(),delta=b.clone().sub(a),steps=Math.max(1,Math.ceil(delta.length()/.35));
    for(let i=0;i<steps;i++){
      p.addScaledVector(delta,1/steps);const body=p.clone().addScaledVector(up,-1.2),floor=ground(body.x,body.z)+1.45;
      if(body.y<floor){p.y+=floor-body.y;body.y=floor;if(velocity.y<0)velocity.y=0}
      if(map==='eden'){for(const o of obstacles)resolveParts(o.parts?o:solidOf(o),p,body,1.45,velocity)}
      else for(const box of bodyIndex.query(body,body,1.55)){
        const nearest=box.clampPoint(body,V()),n=body.clone().sub(nearest),d=n.length();if(d>=1.45)continue;
        let push=1.45-d;if(d<1e-7){const faces=[['x',box.min.x,-1],['x',box.max.x,1],['y',box.min.y,-1],['y',box.max.y,1],['z',box.min.z,-1],['z',box.max.z,1]].sort((u,v)=>Math.abs(body[u[0]]-u[1])-Math.abs(body[v[0]]-v[1]));n.set(0,0,0);n[faces[0][0]]=faces[0][2];push=1.45+Math.abs(body[faces[0][0]]-faces[0][1])}else n.divideScalar(d);
        p.addScaledVector(n,push);body.addScaledVector(n,push);const toward=velocity.dot(n);if(toward<0)velocity.addScaledVector(n,-toward);
      }
    }
    p.y=Math.max(p.y,ground(p.x,p.z)+2.65);return p;
  }
  return{raycast,resolve,ground};
}
function build(map){
  if(map==='city'){
    const boxes=[],body=[],kit=createKit(PROP_TINTS,{walkable:true,onSolid(x,y,z,sx,sy,sz,mode){(mode==='body'?body:boxes).push(new T.Box3(V(x-sx/2,y-sy/2,z-sz/2),V(x+sx/2,y+sy/2,z+sz/2)))}}),ctx={vents:[],dishes:[]},footprints=makeFootprints();
    addArchitecture(kit,ctx,footprints);addCityProps(kit,ctx,footprints);return flatArena(map,boxes,body);
  }
  const scene=new T.Scene(),U={uTime:{value:0}},atlas=null,obstacles=[],occ=new Occupancy();
  const ruins=buildRuins({scene,U,atlas,obstacles});for(const s of ruins.sites)occ.put(s.x,s.z,s.r);
  buildShrine({scene,U,atlas,obstacles,archivePos:V(0,terrainHeight(0,78)+2.3,74)});occ.put(0,77,13);buildFlora({scene,U,atlas,obstacles,occ});
  const boxes=obstacles.flatMap(o=>o.partBoxes||[o.box]);
  const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.add(m)});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  return flatArena(map,boxes,[],obstacles);
}
export function arenaFor(map){
  if(map!=='station'){if(!cache.has(map))cache.set(map,build(map));return cache.get(map)}
  const layout=createStationLayout(),state={stationSurfaces:layout.surfaces,stationSolids:layout.solids,roofWindows:ROOF_WINDOWS,brokenWindows:new Set()},covers=[];
  for(let i=0;i<96;i+=4)if(!isAirlock(i*TAU/96))for(const side of [-1,1]){const a=(i+.4)*TAU/96,p=stationPosition(a,0,side*4.6);covers.push(V(p.x,p.y,p.z).addScaledVector(V(-Math.sin(a),Math.cos(a),0),.9))}
  return{state,ground:()=>0,raycast(a,b){let hit=firstStationIntersection(a,b,state),best=hit?a.distanceTo(V(hit.x,hit.y,hit.z)):a.distanceTo(b),result=hit;const ray=new T.Ray(a,b.clone().sub(a).normalize());for(const c of covers){const h=ray.intersectSphere(new T.Sphere(c,1.2),V());if(h&&h.distanceTo(a)>.03&&h.distanceTo(a)<best){best=h.distanceTo(a);result=h}}return result},resolve(a,b,velocity,up){const start=a.clone().addScaledVector(up,-1.2),end=b.clone().addScaledVector(up,-1.2),p=resolveStationMotion(start,end,velocity,1.45,state);return V(p.x,p.y,p.z).addScaledVector(up,1.2)}};
}
