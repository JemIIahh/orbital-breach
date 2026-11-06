import { slab, rod, tube, slats, put } from './mech-kit.js';
import { slotTokens, bakeSpec, addBaked } from './mech-bake.js';
const S=slotTokens(),cache=new Map();
// Recognizable equipment with a purpose, baked into the existing material slots.
// Shared buffers keep a mixed enemy squad inexpensive to construct and render.
export function addEnemyDetails(type,body,mats,parts){
  if(!cache.has(type)){
    const o=[];
    if(type==='gunner'){
      for(const side of [-1,1]){
        o.push(slab(.48,.74,.44,S.paint,side*.64,2.3,.54,{bevel:.05}));
        o.push(...slats(4,.38,.035,.06,.12,S.metal,side*.64,2.15,.79,'y'));
        o.push(slab(.37,.08,.04,S.warn,side*.64,2.58,.79));
        o.push(rod([side*.55,2.55,.55],[side*.83,2.62,.16],.06,.045,S.steel,8));
      }
    }else if(type==='sniper'){
      o.push(slab(.24,.3,.75,S.armor,-.63,2.85,-.05,{bevel:.04}));
      o.push(tube(.11,.11,.22,S.metal,-.63,2.89,-.5,12));
      o.push(tube(.065,.065,.025,S.glow,-.63,2.89,-.62,12));
      o.push(rod([.3,2.3,.5],[.5,3.5,.6],.018,.009,S.steel,6));
    }else if(type==='bulwark'||type==='archon'){
      for(const side of [-1,1]){
        o.push(slab(.48,.64,.16,S.armor,side*.58,2.31,-.46,{bevel:.04}));
        o.push(...slats(3,.38,.04,.035,.14,S.metal,side*.58,2.11,-.56,'y'));
        o.push(slab(.12,.08,.025,S.warn,side*.58,2.57,-.555));
        o.push(rod([side*.45,2.1,.3],[side*.68,2.85,.4],.075,.04,S.steel,8));
      }
    }else if(type==='striker'){
      for(const side of [-1,1]){
        o.push(put(slab(.16,.48,.13,S.armor),side*.47,2.34,-.36,0,0,-side*.2));
        o.push(slab(.08,.22,.035,S.warn,side*.47,2.38,-.45));
      }
    }
    cache.set(type,bakeSpec(o,{part:'core',y0:0}));
  }
  addBaked(body,cache.get(type),mats,parts);
}
