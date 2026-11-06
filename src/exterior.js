import * as T from 'three';
import { RADIUS, HALF_WIDTH, TAU } from './station-constants.js';
import { createStationLayout, BALCONY_EDGE } from './station-layout.js';

export function buildExterior(scene,mat){
  const layout=createStationLayout(),batches=new Map(),dummy=new T.Object3D(),pivot=new T.Object3D();
  const materials={dark:mat.dark,ceramic:mat.ceramic,steel:mat.steel,cargo:mat.crate,solar:mat.solar,glass:new T.MeshStandardMaterial({color:'#7cbbc5',metalness:.7,roughness:.18,transparent:true,opacity:.22,depthWrite:false}),line:mat.cyan,orange:mat.orange};
  const add=(material,angle,x,y,z,sx,sy,sz)=>{
    pivot.position.set(Math.sin(angle)*RADIUS,-Math.cos(angle)*RADIUS,0);pivot.rotation.set(0,0,angle);pivot.updateMatrix();
    dummy.position.set(x,y,z);dummy.rotation.set(0,0,0);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();
    if(!batches.has(material))batches.set(material,[]);batches.get(material).push(new T.Matrix4().multiplyMatrices(pivot.matrix,dummy.matrix));
  };
  for(const surface of layout.surfaces){
    if(['hull','roof'].includes(surface.surface))continue;
    const start=surface.angle==null?0:surface.angle-surface.halfAngle,end=surface.angle==null?TAU:surface.angle+surface.halfAngle,count=Math.ceil((end-start)/(TAU/192)),step=(end-start)/count;
    const height=RADIUS-surface.radius,midZ=(surface.minZ+surface.maxZ)*.5,width=surface.maxZ-surface.minZ;
    for(let i=0;i<count;i++){
      const angle=start+(i+.5)*step,length=step*surface.radius;
      add('dark',angle,0,height-surface.thickness*.5,midZ,length+.05,surface.thickness,width);
      add(surface.surface==='solar'?'solar':'ceramic',angle,0,height+.012,midZ,length-.08,.025,width-.22);
      for(const z of [surface.minZ+.25,surface.maxZ-.25])add('orange',angle,0,height+.034,z,length-.08,.025,.09);
      if(i%2===0)add('line',angle,0,height+.045,midZ,length*.45,.025,.08);
    }
  }
  for(const detail of layout.details){
    const {angle,local:p,size:s,material}=detail;
    if(material==='rail'){
      add('glass',angle,p.x,p.y,p.z,s.x,s.y,s.z);
      add('orange',angle,p.x,p.y+s.y*.5,p.z,s.x,.11,s.z+.035);
      add('orange',angle,p.x,p.y-s.y*.5,p.z,s.x,.13,s.z+.035);
      if(s.x>s.z){for(const x of [-s.x*.48,s.x*.48])add('steel',angle,p.x+x,p.y,p.z,.10,s.y,s.z+.05)}
      else for(const z of [-s.z*.48,s.z*.48])add('steel',angle,p.x,p.y,p.z+z,s.x+.05,s.y,.10);
    }else{
      add(material,angle,p.x,p.y,p.z,s.x,s.y,s.z);
      if(material==='cargo')add('line',angle,p.x,p.y+.25,p.z+s.z*.501,s.x*.6,.045,.03);
    }
  }
  for(const dock of layout.docks){
    const a=dock.angle,side=dock.side;
    for(const z of [side*BALCONY_EDGE,side*31])for(const x of [-2.9,2.9])add('line',a,x,2.7,z,.055,5.1,.48);
    // Large markings make separate floor, roof and exterior pad destinations visible from flight.
    add('line',a,-2.3,7.06,side*23.7,.13,.035,4);
    add('line',a,2.3,7.06,side*23.7,.13,.035,4);
    add('line',a,0,7.06,side*23.7,4.6,.035,.13);
    for(const x of [-4.8,4.8])for(const z of [side*36,side*45])add('line',a,x,.15,z,1.2,.055,.2);
    add('orange',a,0,.14,side*33.3,4.4,.04,.15);
    addDockSign(scene,dock);
  }
  const geometry=new T.BoxGeometry(1,1,1);
  const meshes=[];
  for(const [name,matrices] of batches){
    const mesh=new T.InstancedMesh(geometry,materials[name],matrices.length);matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.castShadow=name!=='glass'&&name!=='line';mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);meshes.push(mesh);
  }
  return{stationSurfaces:layout.surfaces,stationSolids:layout.solids,exteriorLayout:layout,exteriorMeshes:meshes};
}

function addDockSign(scene,dock){
  const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#14292e';ctx.fillRect(0,0,512,128);ctx.fillStyle='#a6eee3';ctx.fillRect(0,0,8,128);ctx.textAlign='center';ctx.font='bold 43px monospace';ctx.fillText(dock.label,256,60);ctx.font='19px monospace';ctx.fillStyle='#d4dcce';ctx.fillText('AIRLOCK / LANDING GANTRY',256,100);
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
  const material=new T.MeshBasicMaterial({map:texture}),geometry=new T.PlaneGeometry(3.7,.92);
  for(const facing of [-1,1]){
    const mesh=new T.Mesh(geometry,material);const radius=RADIUS-5.9;mesh.position.set(Math.sin(dock.angle)*radius,-Math.cos(dock.angle)*radius,dock.side*16.5+facing*.28);mesh.up.set(-Math.sin(dock.angle),Math.cos(dock.angle),0);mesh.lookAt(mesh.position.clone().add(new T.Vector3(0,0,facing)));scene.add(mesh);
  }
}
