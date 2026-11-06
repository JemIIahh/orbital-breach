import * as T from 'three';
import { makePortal } from './props.js';
import { CITY_UPLINKS } from './encounters.js';
import { addCityProps, cityPropMaterials, PROP_TINTS } from './city-props.js';
import { addArchitecture } from './city-arch.js';
import { createKit } from './city-batch.js';
import { makeFootprints } from './city-layout.js';
import { makeCityUniforms, facadeMaterial, groundMaterial, roadMaterial } from './city-shaders.js';
import { makeSky } from './city-sky.js';
import { makeCityLife } from './city-life.js';
import { makeBoxIndex } from './city-spatial.js';
import { makeCitySigns } from './city-signage.js';
import { makeArena } from './gauntlet-arena.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
// Linear horizon haze by day and at floodlit dusk; fog, sky and wet roads all read the same colour.
const HAZE_DAY=new T.Color().setRGB(.43,.53,.59),HAZE_DUSK=new T.Color().setRGB(.26,.13,.11);
export function makeCity(environment=null){
  const U=makeCityUniforms(),scene=new T.Scene();U.uSky.value.copy(HAZE_DAY);
  scene.background=U.uSky.value.clone();scene.fog=new T.Fog(U.uSky.value.clone(),90,430);scene.environment=environment;scene.environmentIntensity=.55;
  const hemisphere=new T.HemisphereLight('#bedced','#494d45',1.7);scene.add(hemisphere);
  const sun=new T.DirectionalLight('#ffe2bb',2.6);sun.position.set(-65,85,-60);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-55,right:55,top:55,bottom:-55,near:1,far:240});sun.shadow.normalBias=.05;scene.add(sun,sun.target);
  const playerLight=new T.PointLight('#d1f2ff',2,18,2);scene.add(playerLight);
  const materials={dark:new T.MeshStandardMaterial({color:'#283d48',roughness:.65,metalness:.35}),glass:new T.MeshStandardMaterial({color:'#7099a8',roughness:.18,metalness:.7}),light:new T.MeshStandardMaterial({color:'#8fe3e2',emissive:'#5bc3d2',emissiveIntensity:2.2}),
    concrete:groundMaterial(U),road:roadMaterial(U),facade:facadeMaterial(U),...cityPropMaterials(U)};
  const hitKinds=new WeakMap(),boxes=[],bodyBoxes=[],obstacles=[],ctx={vents:[],dishes:[]},footprints=makeFootprints();
  // Solid pieces register axis-aligned collision boxes; everything else is purely visual. 'body' pieces (tree crowns) stop the
  // mech but let bullets and line of sight through, so they live in their own list that only resolve() reads.
  const kit=createKit(PROP_TINTS,{walkable:true,onSolid(x,y,z,sx,sy,sz,mode,name){const bounds=new T.Box3(V(x-sx/2,y-sy/2,z-sz/2),V(x+sx/2,y+sy/2,z+sz/2));if(mode==='body'){bodyBoxes.push(bounds);return}hitKinds.set(bounds,name==='vehicle'?'vehicle':name==='bark'?'wood':/steel|dark|glass/.test(name||'')?'metal':'stone');boxes.push(bounds);obstacles.push({kind:'building',box:bounds,position:V(x,0,z),radius:Math.hypot(sx,sz)/2,height:sy})}});
  addArchitecture(kit,ctx,footprints);addCityProps(kit,ctx,footprints);
  // Relay pads: a low plinth and four warning lamps mark each uplink without adding cover.
  for(const u of CITY_UPLINKS){kit.cyl('steelDark',u.x,.07,u.z,2.7,.1);for(const [dx,dz] of [[-2.2,-2.2],[2.2,-2.2],[-2.2,2.2],[2.2,2.2]])kit.box('warn',u.x+dx,.2,u.z+dz,.3,.3,.3)}
  kit.flush(scene,materials);
  scene.add(makeCitySigns(U));
  const shotIndex=makeBoxIndex(boxes),bodyIndex=makeBoxIndex(boxes.concat(bodyBoxes));
  const sky=makeSky(U),life=makeCityLife(U,ctx),arena=makeArena(U,materials);scene.add(sky.mesh,life.group,arena.group);
  const uplinks=CITY_UPLINKS.map((p,index)=>{const root=new T.Group();root.position.set(p.x,0,p.z);const metal=new T.Mesh(new T.CylinderGeometry(.85,1.15,1.7,12),materials.dark);metal.position.y=.85;root.add(metal);const core=new T.Mesh(new T.OctahedronGeometry(.55),materials.light.clone());core.position.y=2;root.add(core);const ring=new T.Mesh(new T.TorusGeometry(1.4,.05,6,40),materials.light);ring.rotation.x=-Math.PI/2;ring.position.y=.15;root.add(ring);scene.add(root);return{root,core,ring,index,name:p.name,position:root.position}});
  const portal=makePortal(scene,V(0,3.65,94),V(0,0,1)),ray=new T.Ray();
  function normalAt(hit,bounds){const faces=[['x',bounds.min.x,-1],['x',bounds.max.x,1],['y',bounds.min.y,-1],['y',bounds.max.y,1],['z',bounds.min.z,-1],['z',bounds.max.z,1]].sort((a,b)=>Math.abs(hit[a[0]]-a[1])-Math.abs(hit[b[0]]-b[1]));const n=V();n[faces[0][0]]=faces[0][2];return n}
  function raycast(a,b){const delta=b.clone().sub(a),length=delta.length();if(!length)return null;ray.set(a,delta.normalize());let closest=length+.0001,result=null;
    if(a.y>0&&b.y<=0){const t=a.y/(a.y-b.y),hit=a.clone().lerp(b,t);closest=hit.distanceTo(a);result={...hit,surface:'terrain',kind:'pavement',normal:V(0,1,0)}}
    for(const bounds of shotIndex.query(a,b)){const hit=ray.intersectBox(bounds,V());if(hit&&hit.distanceTo(a)>.0001&&hit.distanceTo(a)<closest){closest=hit.distanceTo(a);result={x:hit.x,y:hit.y,z:hit.z,surface:'building',kind:hitKinds.get(bounds),normal:normalAt(hit,bounds)}}}return result;
  }
  function resolve(start,end,velocity,radius=1.45,up=V(0,1,0)){
    const p=start.clone(),delta=end.clone().sub(start),steps=Math.max(1,Math.ceil(delta.length()/.35));
    for(let i=0;i<steps;i++){p.addScaledVector(delta,1/steps);const body=p.clone().addScaledVector(up,-1.2);
      if(body.y<radius){p.y+=radius-body.y;body.y=radius;if(velocity.y<0)velocity.y=0}
      for(const bounds of bodyIndex.query(body,body,radius+.1)){const nearest=bounds.clampPoint(body,V()),normal=body.clone().sub(nearest),d=normal.length();if(d>=radius)continue;
        let push=radius-d;if(d<1e-7){normal.copy(normalAt(body,bounds));const axis=Math.abs(normal.x)>.5?'x':Math.abs(normal.y)>.5?'y':'z';push=radius+Math.min(body[axis]-bounds.min[axis],bounds.max[axis]-body[axis])}else normal.divideScalar(d);
        p.addScaledVector(normal,push);body.addScaledVector(normal,push);const toward=velocity.dot(normal);if(toward<0)velocity.addScaledVector(normal,-toward);
      }
    }return p;
  }
  const previewCamera=new T.PerspectiveCamera(65,1,.1,1000);previewCamera.position.set(0,5,-60);previewCamera.lookAt(0,10,70);
  // Lighting eases between daylight and floodlit dusk. The arena (Gauntlet) asks for dusk; the campaign stays in daylight.
  const lights={sun:{day:new T.Color('#ffe2bb'),dusk:new T.Color('#ff8f5e')},sky:{day:new T.Color('#bedced'),dusk:new T.Color('#6f7fb0')},ground:{day:new T.Color('#494d45'),dusk:new T.Color('#2c2a3a')}};
  let dusk=0,duskTarget=0,lastT=null,poweredCount=0;const powerTarget=V();
  function applyDusk(){
    U.uDusk.value=dusk;U.uSky.value.copy(HAZE_DAY).lerp(HAZE_DUSK,dusk);scene.fog.color.copy(U.uSky.value);scene.fog.near=90-dusk*25;scene.fog.far=430-dusk*60;scene.background.copy(U.uSky.value);
    sun.color.copy(lights.sun.day).lerp(lights.sun.dusk,dusk);sun.intensity=2.6-dusk*.5;hemisphere.color.copy(lights.sky.day).lerp(lights.sky.dusk,dusk);hemisphere.groundColor.copy(lights.ground.day).lerp(lights.ground.dusk,dusk);hemisphere.intensity=1.7-dusk*.6;
    scene.environmentIntensity=.55-dusk*.25;playerLight.intensity=2+dusk*1.2;
  }
  const world={kind:'city',powerLevels:U.uPower.value,scene,sun,playerLight,portal,uplinks,obstacles,bodyBoxes,covers:[],raycast,resolve,terrainHeight:()=>0,previewCamera,sky,life,arena,
    // Gauntlet presentation API. setArena shows the arena group and eases the light toward dusk; pulseGates opens the spawn
    // shutters for a few seconds (call it when a wave starts); setArenaBoard redraws the scoreboard only when a value changes.
    setArena(on){arena.setOn(!!on);duskTarget=on?.9:0;if(!on){dusk=duskTarget;applyDusk()}return arena.on},
    pulseGates(){arena.pulseGates()},
    setArenaBoard(info){arena.setBoard(info)},
    get arenaActive(){return arena.on},
    update(t,open=false,restored=false,wave=0,powerCount=open?3:wave){
      U.uGate.value=open?1:0;portal.update(t,open);for(const uplink of uplinks){uplink.core.rotation.y=t*.8;uplink.core.material.emissiveIntensity=uplink.index<powerCount?2.4:.6;uplink.ring.visible=uplink.index===wave&&!open}
      const dt=lastT===null?0:Math.min(Math.max(t-lastT,0),.1);lastT=t;U.uTime.value=t;
      const count=arena.on?3:Math.max(0,Math.min(3,powerCount));powerTarget.set(count>0?1:0,count>1?1:0,count>2?1:0);
      if(count<poweredCount)U.uPower.value.copy(powerTarget);else U.uPower.value.lerp(powerTarget,1-Math.exp(-dt*1.8));poweredCount=count;
      if(dusk!==duskTarget){dusk+=(duskTarget-dusk)*(1-Math.exp(-dt*1.2));if(Math.abs(dusk-duskTarget)<.002)dusk=duskTarget;applyDusk()}
      life.update(t,playerLight.position);arena.update(t);
    }};
  applyDusk();return world;
}
