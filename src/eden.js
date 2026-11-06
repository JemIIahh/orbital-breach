import * as T from 'three';
import { makePortal } from './props.js';
import { V, leafAtlas } from './eden-core.js';
import { terrainHeight, terrainNormal, buildGround, groundMaterial, inStream, inPond } from './eden-terrain.js';
import { SPAWN, PORTAL, HEART, ARCHIVE, Occupancy } from './eden-layout.js';
import { SKY, skyUniforms, buildSky, buildHorizon } from './eden-sky.js';
import { buildFlora } from './eden-flora.js';
import { buildWaterGeometry, waterMaterial, lilyPads } from './eden-water.js';
import { buildRuins } from './eden-ruins.js';
import { buildShrine } from './eden-shrine.js';
import { buildLife } from './eden-life.js';
import { installCulling, clusterIndexed } from './eden-cull.js';
import { resolveParts, solidOf } from './tree-collision.js';

export { terrainHeight, terrainNormal };

export function makeEden(environment=null){
  const scene=new T.Scene();scene.background=SKY.fog.clone();scene.fog=new T.FogExp2(SKY.fog.clone(),.0036);scene.environment=environment;scene.environmentIntensity=.3;
  const hemisphere=new T.HemisphereLight('#cfe6ff','#3e4a26',1.0);const fill=new T.DirectionalLight('#9dbfff',.45);fill.position.set(60,30,90);scene.add(hemisphere,fill);
  const sun=new T.DirectionalLight('#ffe0a8',2.8);sun.position.set(-50,90,-60);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-48,right:48,top:48,bottom:-48,near:1,far:230});sun.shadow.bias=-.0003;sun.shadow.normalBias=.06;scene.add(sun,sun.target);
  const playerLight=new T.PointLight('#deedda',1.2,12,2);scene.add(playerLight);
  const skyU=skyUniforms(),U={uTime:skyU.uTime},atlas=leafAtlas(),obstacles=[],occ=new Occupancy();
  scene.add(buildSky(skyU),buildHorizon());
  const ground=new T.Mesh(buildGround(),groundMaterial());ground.receiveShadow=true;ground.name='ground';ground.userData.cull={clusters:clusterIndexed(ground.geometry,16)};scene.add(ground);
  const heart=V(0,terrainHeight(HEART.x,HEART.z),HEART.z),archivePos=heart.clone().add(V(0,2.3,-4));
  const ruins=buildRuins({scene,U,atlas,obstacles});
  for(const s of ruins.sites)occ.put(s.x,s.z,s.r);
  const shrine=buildShrine({scene,U,atlas,obstacles,archivePos});occ.put(0,77,13);
  const flora=buildFlora({U,atlas,scene,obstacles,occ});
  const life=buildLife({scene,uniforms:skyU});
  const water=new T.Mesh(buildWaterGeometry(),waterMaterial(skyU));water.name='water';water.renderOrder=5;water.frustumCulled=false;scene.add(water);lilyPads(scene);

  const cull=installCulling(scene,sun); // per-render instance culling + far LOD for the instanced vegetation (see eden-cull.js)

  const archiveMaterial=new T.MeshStandardMaterial({color:'#d6ffb3',emissive:'#9bf3a6',emissiveIntensity:1.5,metalness:.65,roughness:.25});
  const archive=new T.Group();archive.position.copy(archivePos);archive.add(new T.Mesh(new T.OctahedronGeometry(.7),archiveMaterial));const halo=new T.Mesh(new T.TorusGeometry(1.1,.035,8,48),archiveMaterial);archive.add(halo);scene.add(archive);
  const portal=makePortal(scene,V(0,terrainHeight(0,-53)+3.65,-53),V(0,0,1));
  const previewCamera=new T.PerspectiveCamera(68,1,.1,1500);previewCamera.position.set(0,terrainHeight(0,-45)+4,-45);previewCamera.lookAt(0,8,55);
  const ray=new T.Ray(),castPoint=V();
  function raycast(a,b){
    const delta=b.clone().sub(a),length=delta.length();if(length<.00001)return null;ray.set(a,delta.clone().normalize());let closest=length+.001,result=null;
    let previous=a.y-terrainHeight(a.x,a.z);
    const steps=Math.max(2,Math.ceil(length/.75));
    for(let i=1;i<=steps;i++){
      const t=i/steps,px=a.x+delta.x*t,py=a.y+delta.y*t,pz=a.z+delta.z*t,height=py-terrainHeight(px,pz);
      if(height<=0&&previous>0){let lo=(i-1)/steps,hi=t;for(let j=0;j<9;j++){const mid=(lo+hi)*.5,q=a.clone().addScaledVector(delta,mid);if(q.y>terrainHeight(q.x,q.z))lo=mid;else hi=mid}const q=a.clone().addScaledVector(delta,(lo+hi)*.5);closest=q.distanceTo(a);result={x:q.x,y:q.y,z:q.z,surface:'terrain',kind:inStream(q.x,q.z,0)||inPond(q.x,q.z,0)?'water':'ground',normal:terrainNormal(q.x,q.z)};break}previous=height;
    }
    // a cheap reject first: most obstacles are nowhere near this segment, and there are several hundred of them
    const lox=Math.min(a.x,b.x)-.05,hix=Math.max(a.x,b.x)+.05,loy=Math.min(a.y,b.y)-.05,hiy=Math.max(a.y,b.y)+.05,loz=Math.min(a.z,b.z)-.05,hiz=Math.max(a.z,b.z)+.05;
    for(const obstacle of obstacles){
      const box=obstacle.box;if(box.max.x<lox||box.min.x>hix||box.max.z<loz||box.min.z>hiz||box.max.y<loy||box.min.y>hiy)continue;
      const p=obstacle.position,hit=ray.intersectBox(box,castPoint);
      if(!hit)continue;
      if(obstacle.partBoxes){ // rocks, crags and basalt: hit the real shape, not the whole cluster's bounding box
        for(let i=0;i<obstacle.partBoxes.length;i++){
          const part=obstacle.parts[i],h=ray.intersectBox(obstacle.partBoxes[i],castPoint);
          if(h&&h.distanceTo(a)<closest&&h.distanceTo(a)>.03){closest=h.distanceTo(a);const normal=V(h.x-part.x,0,h.z-part.z).normalize();if(Math.abs(h.y-part.y1)<.05)normal.set(0,1,0);result={x:h.x,y:h.y,z:h.z,surface:'tree',kind:obstacle.kind,normal}}
        }
        continue;
      }
      if(hit.distanceTo(a)<closest&&hit.distanceTo(a)>.03){closest=hit.distanceTo(a);const normal=V(hit.x-p.x,0,hit.z-p.z).normalize();if(Math.abs(hit.y-p.y-obstacle.height)<.05)normal.set(0,1,0);result={x:hit.x,y:hit.y,z:hit.z,surface:'tree',kind:obstacle.kind,normal};}
    }
    return result;
  }
  function resolve(start,end,velocity,radius=1.45,up=V(0,1,0)){
    const p=end.clone(),body=p.clone().addScaledVector(up,-1.2),height=terrainHeight(body.x,body.z)+radius;
    if(body.y<height){p.y+=height-body.y;body.y=height;if(velocity.y<0)velocity.y=0}
    for(const o of obstacles){
      if(o.parts){resolveParts(o,p,body,radius,velocity);continue} // trees: trunk, skirts and canopy lumps
      resolveParts(solidOf(o),p,body,radius,velocity)} // rocks, ruins, walls: land on top, climb low rubble, slide off tall faces
    // a canopy above can push the body down; never let that sink it into the ground
    const floor=terrainHeight(body.x,body.z)+radius,lowest=p.y-1.2;if(lowest<floor){p.y+=floor-lowest;if(velocity.y<0)velocity.y=0}
    return p;
  }
  return {kind:'eden',scene,sun,playerLight,portal,previewCamera,heart,archive,obstacles,covers:[],raycast,resolve,terrainHeight,flora,ruins,shrine,cull,
    update(t,open=true,restored=false){
      life.update(t,restored);shrine.update(t,restored);skyU.uTime.value=t;portal.update(t,open);archive.rotation.y=t*.7;halo.rotation.z=t*.4;archive.position.y=heart.y+2.3+Math.sin(t*1.8)*.18;archiveMaterial.emissiveIntensity=restored?3:1.5;
    }
  };
}
