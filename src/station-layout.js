import { RADIUS as R, HEIGHT as H, HALF_WIDTH as W, BAY_COUNT, TAU, wrapAngle } from './station-constants.js';

export const BALCONY_EDGE=16.5;
export const DOCK_OUTER_EDGE=31;
export const LANDING_PAD_EDGE=46;
export const DECK_HEIGHT=.09;
export const DOCK_ROOF_HEIGHT=7;
export const ARC_STEP=TAU/BAY_COUNT;
export const isSkylightBay=bay=>((bay%BAY_COUNT)+BAY_COUNT)%12===0;
export const ROOF_WINDOWS=Array.from({length:BAY_COUNT/12},(_,i)=>({
  key:`roof:${i*12}`,bay:i*12,angle:i*12*ARC_STEP,halfAngle:ARC_STEP*.49,halfWidth:4.2,height:H+.25
}));
export function roofWindowAt(angle,z,state={},margin=0){
  return (state.roofWindows||[]).find(p=>Math.abs(wrapAngle(angle-p.angle))<p.halfAngle-margin/(R-H)&&Math.abs(z)<p.halfWidth-margin);
}
export function insidePatch(surface,angle,z,margin=0){
  return z>=surface.minZ-margin&&z<=surface.maxZ+margin&&(surface.halfAngle==null||Math.abs(wrapAngle(angle-surface.angle))<=surface.halfAngle+margin/R);
}

// Geometry, collision, ray hits and landing labels all consume this single layout.
export function createStationLayout(){
  const surfaces=[],solids=[],docks=[];
  const patch=(id,label,height,minZ,maxZ,angle=null,halfAngle=null,kind='deck',thickness=.36)=>{
    const surface={id,label,radius:R-height,minZ,maxZ,angle,halfAngle,surface:kind,thickness};surfaces.push(surface);return surface;
  };
  patch('promenade','PROMENADE',DECK_HEIGHT,-W,W,null,null,'hull',.5);
  patch('core-roof','HULL ROOF',H+.58,-W,W,null,null,'roof',.78);
  for(const side of [-1,1]){
    patch(`balcony-${side}`,side<0?'PORT BALCONY':'STARBOARD BALCONY',DECK_HEIGHT,side<0?-BALCONY_EDGE:W,side<0?-W:BALCONY_EDGE,null,null,'balcony');
  }
  const box=(id,label,angle,x,y,z,sx,sy,sz,material='dark',collide=true)=>{
    const c=Math.cos(angle),s=Math.sin(angle);
    const item={id,label,angle,center:{x:s*R+c*x-s*y,y:-c*R+s*x+c*y,z},half:{x:sx*.5,y:sy*.5,z:sz*.5},size:{x:sx,y:sy,z:sz},local:{x,y,z},material,bound:Math.hypot(sx,sy,sz)*.5};
    if(collide)solids.push(item);return item;
  };
  const details=[];
  const addBox=(...args)=>{const item=box(...args);details.push(item);return item};
  // Freight decks form two complete alternate circuits, connected through all sixteen docks.
  // These are real collision surfaces; the exterior renderer consumes the same layout.
  for(const side of [-1,1]){
    patch(`freight-${side}`,side<0?'PORT FREIGHT CIRCUIT':'STARBOARD FREIGHT CIRCUIT',DECK_HEIGHT,side<0?-30:22,side<0?-22:30,null,null,'freight');
    for(let i=0;i<BAY_COUNT;i++){
      const a=i*ARC_STEP;
      if(i%12>1&&i%12<11)addBox(`freight-rail-${side}-${i}`,'FREIGHT GUARDRAIL',a,0,.99,side*30,ARC_STEP*R+.08,1.8,.22,'rail');
      // Stagger cover to create flanks without closing either circuit.
      if(i%6===3){
        addBox(`freight-cargo-${side}-${i}`,'FREIGHT CONTAINER',a,0,1.4,side*(i%12===3?23.5:28),3.0,2.7,2.4,'cargo');
        addBox(`freight-stack-${side}-${i}`,'FREIGHT CONTAINER',a,.3,3.15,side*(i%12===3?23.5:28),2.5,.8,2.3,'cargo',false);
      }
    }
  }
  for(let i=0;i<BAY_COUNT;i++){
    const angle=i*ARC_STEP,nearDock=Math.abs(wrapAngle(angle-Math.round(i/12)*12*ARC_STEP))<.07;
    for(const side of [-1,1]){
      // Opening in the outer rail lines up with each docking bay's clear central aisle.
      if(!nearDock){
        addBox(`rail-${i}-${side}`,'BALCONY RAIL',angle,0,.99,side*BALCONY_EDGE,ARC_STEP*R+.08,1.8,.22,'rail');
      }
      if(i%2===0)addBox(`bracket-${i}-${side}`,'SUPPORT',angle,0,-.7,side*(W+3.8),.3,1.3,7.8,'steel',false);
    }
  }
  for(let i=0;i<BAY_COUNT;i+=12){
    const angle=i*ARC_STEP;
    for(const side of [-1,1]){
      const index=i/12+1,id=`${side<0?'P':'S'}${String(index).padStart(2,'0')}`,label=`DOCK ${id}`;
      const span=(a,b)=>side<0?[-b,-a]:[a,b];
      const [minZ,maxZ]=span(BALCONY_EDGE-.2,DOCK_OUTER_EDGE);
      const floor=patch(`${id}-floor`,label,DECK_HEIGHT,minZ,maxZ,angle,.1,'dock-floor');
      const roof=patch(`${id}-roof`,`${label} ROOF`,DOCK_ROOF_HEIGHT,minZ,maxZ,angle,.1,'dock-roof');
      const bridge=span(DOCK_OUTER_EDGE-.2,35.1),pad=span(35,LANDING_PAD_EDGE);
      patch(`${id}-bridge`,`${label} GANTRY`,DECK_HEIGHT,...bridge,angle,.038,'gantry');
      patch(`${id}-pad`,`${label} LANDING PAD`,DECK_HEIGHT,...pad,angle,.105,'landing-pad');
      docks.push({id,label,angle,side,floor,roof,padCenter:side*40.5});
      // Side walls; both front and rear doorways stay open along the same clear aisle.
      for(const x of [-7.15,7.15])addBox(`${id}-side-${x}`,label,angle,x,3.5,side*23.7,.32,7,14.6,'ceramic');
      for(const z of [side*BALCONY_EDGE,side*DOCK_OUTER_EDGE]){
        for(const x of [-5,5])addBox(`${id}-door-${z}-${x}`,label,angle,x,2.6,z,4.0,5.2,.4,'ceramic');
        addBox(`${id}-lintel-${z}`,label,angle,0,6.1,z,14.5,1.6,.45,'ceramic');
      }
      for(const x of [-3.0,3.0])addBox(`${id}-bridge-rail-${x}`,`${label} GANTRY`,angle,x,.99,side*33.1,.17,1.8,4.1,'rail');
      for(const x of [-7.2,7.2])addBox(`${id}-pad-rail-${x}`,`${label} LANDING PAD`,angle,x,.99,side*40.5,.22,1.8,11.1,'rail');
      addBox(`${id}-pad-end`,`${label} LANDING PAD`,angle,0,.99,side*LANDING_PAD_EDGE,14.5,1.8,.22,'rail');
      for(const x of [-4.8,4.8])addBox(`${id}-cargo-${x}`,label,angle,x,1.0,side*25,2.2,1.85,3.1,'cargo');
      for(let k=0;k<3;k++){
        const band=span(45.4+k*8,52.5+k*8);
        patch(`${id}-solar-${k}`,`${label} SOLAR SERVICE PANEL`,-.79,...band,angle,.083,'solar',.31);
      }
      addBox(`${id}-solar-spine`,`${label} SOLAR SPINE`,angle,0,-1.1,side*39,.65,.55,60,'steel');
    }
  }
  return{surfaces,solids,details,docks};
}

export function boxLocal(point,box){
  const x=point.x-box.center.x,y=point.y-box.center.y,c=Math.cos(box.angle),s=Math.sin(box.angle);
  return{x:x*c+y*s,y:-x*s+y*c,z:point.z-box.center.z};
}
export function boxNormalWorld(normal,box){const c=Math.cos(box.angle),s=Math.sin(box.angle);return{x:normal.x*c-normal.y*s,y:normal.x*s+normal.y*c,z:normal.z};}
