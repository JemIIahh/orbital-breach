import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RADIUS as R, HEIGHT as H, HALF_WIDTH as W, BAY_COUNT as N, TAU, isAirlock, stationPosition } from './physics.js';
import { windowKey } from './physics.js';
import { installWindows, makePortal } from './props.js';
import { ROOF_WINDOWS, isSkylightBay } from './station-layout.js';
import { buildExterior } from './exterior.js';
import { buildStationDecor } from './station-decor.js';

const color = hex => new T.Color(hex);
export function makeWorld(renderer) {
  const scene = new T.Scene();
  scene.background = color('#02050b');
  if(renderer){
    const pmrem = new T.PMREMGenerator(renderer);
    const envScene = new RoomEnvironment();
    scene.environment = pmrem.fromScene(envScene, .06).texture;
    scene.environmentIntensity = .6;
    envScene.dispose(); pmrem.dispose();
  }
  scene.add(new T.AmbientLight('#eef4f8', .55));
  const sun = new T.DirectionalLight('#fff3dd', 2.2);
  sun.position.set(-80, 100, -160); scene.add(sun);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,near:.5,far:220});
  sun.shadow.bias=-.0003;sun.shadow.normalBias=.025;scene.add(sun.target);
  const fill = new T.DirectionalLight('#58a9df', .8);
  fill.position.set(50,-130,90); scene.add(fill);

  const noise = makePanelTexture();
  const mat = {
    ceramic:new T.MeshStandardMaterial({color:'#d3dadd',metalness:.3,roughness:.45,map:noise}),
    dark:new T.MeshStandardMaterial({color:'#3f4c56',metalness:.5,roughness:.5,map:noise}),
    floor:new T.MeshStandardMaterial({color:'#98a3a9',metalness:.35,roughness:.5,map:noise}),
    orange:new T.MeshStandardMaterial({color:'#ee6a1c',metalness:.2,roughness:.55}),
    crate:new T.MeshStandardMaterial({color:'#dde0e0',metalness:.2,roughness:.5,map:noise}),
    steel:new T.MeshStandardMaterial({color:'#7e939e',metalness:.88,roughness:.26}),
    black:new T.MeshStandardMaterial({color:'#07121c',metalness:.65,roughness:.48}),
    amber:new T.MeshStandardMaterial({color:'#d38d47',metalness:.6,roughness:.35}),
    cyan:new T.MeshStandardMaterial({color:'#9beef2',emissive:'#66deef',emissiveIntensity:3.4,roughness:.25}),
    warm:new T.MeshStandardMaterial({color:'#ffe7b8',emissive:'#ffb76b',emissiveIntensity:3.2}),
    white:new T.MeshStandardMaterial({color:'#e3f6ff',emissive:'#b1dcff',emissiveIntensity:2.3}),
    glass:new T.MeshStandardMaterial({color:'#173448',metalness:.95,roughness:.13,transparent:true,opacity:.16,depthWrite:false,side:T.DoubleSide}),
    solar:new T.MeshStandardMaterial({color:'#112b50',metalness:.75,roughness:.3,map:makeSolarTexture()})
  };

  // All repeating structural pieces are batched by material: a complete ring with few draw calls.
  const batches = new Map();
  const boxGeo = new T.BoxGeometry(1,1,1);
  const dummy = new T.Object3D();
  const pivot = new T.Object3D();
  function box(material,x,y,z,sx,sy,sz,rz=0) {
    dummy.position.set(x,y,z);dummy.rotation.set(0,0,rz);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();
    const matrix=new T.Matrix4().multiplyMatrices(pivot.matrix,dummy.matrix);
    if(!batches.has(material))batches.set(material,[]);
    batches.get(material).push(matrix);
  }
  const arc=TAU/N, length=TAU*R/N,panels=[];let glassMesh;
  for(let i=0;i<N;i++) {
    const a=i*arc;
    pivot.position.set(Math.sin(a)*R,-Math.cos(a)*R,0);pivot.rotation.set(0,0,a);pivot.updateMatrix();
    const bay=isAirlock(a);
    box(mat.floor,0,-.28,0,length+.15,.55,W*2);
    box(mat.dark,0,-.8,0,length,.55,W*2+.3);
    if(isSkylightBay(i)){
      for(const side of [-1,1])box(mat.dark,0,H+.25,side*6.45,length,.65,4.5);
      // Reinforced transparent roof hatch, with cyan perimeter strips visible in flight.
      box(mat.glass,0,H+.25,0,length*.86,.055,8.4);
      const roofPanel=ROOF_WINDOWS.find(p=>p.bay===i);
      panels.push({...roofPanel,roof:true,width:length*.86,height:8.4,index:batches.get(mat.glass).length-1,matrix:batches.get(mat.glass).at(-1).clone()});
      for(const z of [-4.26,4.26]){box(mat.steel,0,H+.3,z,length,.18,.14);box(mat.cyan,0,H+.41,z,length*.8,.025,.045)}
      for(const dx of [-length*.44,length*.44]){box(mat.steel,dx,H+.3,0,.16,.18,8.6);box(mat.cyan,dx,H+.41,0,.035,.025,8.2)}
    }else box(mat.dark,0,H+.25,0,length,.65,W*2+.4);
    // Floor plates, recessed channels, and center navigation lighting.
    for(let z=-6;z<=6;z+=3){
      box(mat.floor,0,.025,z,length-.12,.12,2.8);
      box(mat.black,0,.1,z+1.46,length-.12,.035,.055);
      for(const x of [-length*.4,length*.4])box(mat.steel,x,.1,z,.07,.025,2.6);
    }
    for(const z of [-5.8,5.8]){
      box(mat.black,0,.11,z,length,.08,.34);
      box(mat.cyan,0,.16,z,length*.57,.025,.065);
      box(mat.amber,0,.09,z+(z<0?-.3:.3),length-.1,.04,.055);
    }
    if(!isSkylightBay(i)){box(mat.ceramic,0,H-.1,0,length-.16,.2,8.2);box(mat.black,0,H-.28,0,length-.3,.12,1.1)}
    for(const s of [-1,1]) {
      const z=s*W;
      if(!bay){
        box(mat.ceramic,0,1,z,length-.12,2.0,.35);
        box(mat.ceramic,0,H-1.1,z,length-.12,2,.4);
        box(mat.glass,0,5.8,z,length-.17,7.4,.055);
        panels.push({key:windowKey(a,s),angle:a,side:s,index:batches.get(mat.glass).length-1,matrix:batches.get(mat.glass).at(-1).clone()});
        box(mat.dark,-length*.48,5.6,z,.2,9,.28);
        box(mat.dark,0,5.5,z,length,.1,.16);
        box(mat.steel,0,2.05,z-s*.16,length,.08,.2);
        box(mat.cyan,0,1.75,z-s*.23,length*.65,.045,.045);
      } else {
        box(mat.black,0,.02,z+s*1.65,length,.3,3.5);
        box(mat.amber,0,.19,z+s*1.65,length*.9,.06,.12);
        box(mat.amber,0,9.45,z,length,.22,.35);
      }
      // Angular ribs, external armor and exposed utility conduits.
      box(mat.dark,-length*.5,4.8,z-s*.2,.31,9.5,.55);
      box(mat.steel,-length*.5,4.8,z-s*.52,.12,9.1,.07);
      box(mat.amber,-length*.5,4.7,z-s*.6,.05,8.7,.025);
      box(mat.ceramic,-length*.5,H-.8,z-s*.9,.34,2.7,.45,s<0?-.67:.67);
      box(mat.black,0,H+.75,z-s*.8,length,.3,.3);
      box(mat.steel,0,-1.18,z-s*.4,length,.16,.16);
    }
    // Transverse structural beams are narrow enough to preserve a long corridor sightline.
    box(mat.dark,-length*.5,H-.15,0,.36,.4,W*2);
    box(mat.steel,-length*.5,H-.4,0,.1,.08,W*2-1);

  }
  for(const [material,matrices] of batches){
    const mesh=new T.InstancedMesh(boxGeo,material,matrices.length);
    matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
    mesh.castShadow=material!==mat.glass;mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);
    if(material===mat.glass)glassMesh=mesh;
  }

  const covers=[],coverMatrices={body:[],lid:[],light:[]};
  function coverPiece(kind,x,y,z,sx,sy,sz){
    dummy.position.set(x,y,z);dummy.rotation.set(0,0,0);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();
    coverMatrices[kind].push(new T.Matrix4().multiplyMatrices(pivot.matrix,dummy.matrix));
  }
  for(let i=0;i<N;i+=4){
    if(isAirlock(i*arc))continue;
    for(const side of [-1,1]){
      const a=(i+.4)*arc;
      const p=stationPosition(a,0,side*4.6);
      pivot.position.set(p.x,p.y,p.z);pivot.rotation.set(0,0,a);pivot.updateMatrix();
      coverPiece('body',0,.9,0,2.35,1.75,2.2);
      coverPiece('lid',0,1.85,0,2.45,.22,2.3);
      for(const z of [-1.12,1.12])coverPiece('light',0,1.4,z,1.8,.045,.025);
      covers.push({position:new T.Vector3(p.x,p.y,p.z),radius:1.65,height:2});
    }
  }
  for(const [kind,matrices] of Object.entries(coverMatrices)){
    const geometry=kind==='light'?boxGeo:new RoundedBoxGeometry(1,1,1,2,.04);
    const mesh=new T.InstancedMesh(geometry,kind==='body'?mat.crate:kind==='lid'?mat.ceramic:mat.cyan,matrices.length);
    matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);
  }

  const playerLight=new T.PointLight('#b5e5ff',1.8,10,2);scene.add(playerLight);

  const stars=makeStars();scene.add(stars);
  const earth=makeEarth();scene.add(earth);
  const distant=new T.Group();
  const planetGlow=new T.Sprite(new T.SpriteMaterial({map:glowTexture(),color:'#4388dd',transparent:true,opacity:.22,blending:T.AdditiveBlending,depthWrite:false}));
  planetGlow.position.copy(earth.position);planetGlow.scale.setScalar(375);distant.add(planetGlow);scene.add(distant);

  const dustGeo=new T.BufferGeometry();
  const dustPositions=new Float32Array(240*3);
  for(let i=0;i<240;i++){const a=Math.random()*TAU;const p=stationPosition(a,Math.random()*H,(Math.random()-.5)*W*2);dustPositions.set([p.x,p.y,p.z],i*3)}
  dustGeo.setAttribute('position',new T.BufferAttribute(dustPositions,3));
  const dust=new T.Points(dustGeo,new T.PointsMaterial({color:'#b3e2f2',size:.025,transparent:true,opacity:.4,depthWrite:false}));scene.add(dust);
  const glass=installWindows(scene,glassMesh,panels),gatePoint=stationPosition(.3,3.65,0);
  const portal=makePortal(scene,new T.Vector3(gatePoint.x,gatePoint.y,0),new T.Vector3(Math.cos(.3),Math.sin(.3),0),new T.Vector3(-Math.sin(.3),Math.cos(.3),0));
  const launchConsole=new T.Group(),launchPoint=stationPosition(-.03,0,0);launchConsole.position.set(launchPoint.x,launchPoint.y,0);launchConsole.rotation.z=-.03;
  const pedestal=new T.Mesh(new RoundedBoxGeometry(1.4,1.5,.85,2,.08),mat.dark);pedestal.position.y=.8;launchConsole.add(pedestal);
  const screen=new T.Mesh(new T.BoxGeometry(1.15,.65,.08),mat.cyan);screen.position.set(0,1.5,-.47);screen.rotation.x=-.25;launchConsole.add(screen);
  const launchRing=new T.Mesh(new T.TorusGeometry(1.2,.04,6,40),mat.cyan);launchRing.rotation.x=Math.PI/2;launchRing.position.y=.11;launchConsole.add(launchRing);scene.add(launchConsole);
  // Exterior hatch stencils share one atlas and one draw call.
  const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=96;
  const lx=labelCanvas.getContext('2d');lx.fillStyle='#142c36';lx.fillRect(0,0,512,96);lx.fillStyle='#9aeeeb';lx.textAlign='center';lx.font='bold 28px monospace';lx.fillText('KESTREL / BREACH GLASS',256,38);lx.font='17px monospace';lx.fillText('FIRE TO OPEN / ENTRY BELOW',256,72);
  const labelTexture=new T.CanvasTexture(labelCanvas);labelTexture.colorSpace=T.SRGBColorSpace;
  const labels=ROOF_WINDOWS.map(panel=>{const g=new T.PlaneGeometry(3.1,.6);g.rotateX(-Math.PI/2);g.translate(0,H+.62,5.1);g.rotateZ(panel.angle);g.translate(Math.sin(panel.angle)*R,-Math.cos(panel.angle)*R,0);return g});
  scene.add(new T.Mesh(mergeGeometries(labels),new T.MeshBasicMaterial({map:labelTexture,side:T.DoubleSide})));labels.forEach(g=>g.dispose());
  const exterior=buildExterior(scene,mat);
  // White-and-orange dressing, stencils, airlock frames, planters, freight and the reactor pylons (decor only: no collision).
  const decor=buildStationDecor(scene,mat,{layout:exterior.exteriorLayout,panelMap:noise});
  return {kind:'station',scene,mat,covers,playerLight,sun,earth,portal,launchConsole,...glass,...exterior,roofWindows:ROOF_WINDOWS,decor,update(t,unlocked=false){earth.rotation.y=t*.007;dust.rotation.z=t*.0005;portal.update(t,unlocked);},renderer};
}

function makePanelTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#dedede';ctx.fillRect(0,0,256,256);
  for(let i=0;i<10000;i++){const c=180+Math.floor(Math.random()*65);ctx.fillStyle=`rgba(${c},${c},${c},.15)`;ctx.fillRect(Math.random()*256,Math.random()*256,Math.random()*3+.3,.5)}
  ctx.strokeStyle='#999999';ctx.lineWidth=1;ctx.strokeRect(2,2,252,252);
  for(const x of [9,247])for(const y of [9,247]){ctx.fillStyle='#777';ctx.beginPath();ctx.arc(x,y,1.3,0,TAU);ctx.fill()}
  const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;return tex;
}
function makeSolarTexture(){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#264c7b';ctx.fillRect(0,0,512,256);ctx.strokeStyle='#6887b6';ctx.lineWidth=1;
  for(let x=0;x<512;x+=32)for(let y=0;y<256;y+=24){ctx.strokeRect(x+1,y+1,29,21);ctx.fillStyle='rgba(104,156,214,.1)';ctx.fillRect(x+3,y+3,25,7)}
  const t=new T.CanvasTexture(canvas);t.colorSpace=T.SRGBColorSpace;return t;
}
function makeStars(){
  const count=6500,positions=new Float32Array(count*3),colors=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const a=Math.random()*TAU,u=Math.random()*2-1,r=1500+Math.random()*1500;
    positions.set([r*Math.sqrt(1-u*u)*Math.cos(a),r*u,r*Math.sqrt(1-u*u)*Math.sin(a)],i*3);
    const brightness=.35+Math.random()*.65;colors.set([brightness*.8,brightness*.88,brightness],i*3);
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(positions,3));geo.setAttribute('color',new T.BufferAttribute(colors,3));
  return new T.Points(geo,new T.PointsMaterial({vertexColors:true,size:1.5,sizeAttenuation:false,transparent:true,opacity:.85,depthWrite:false}));
}
function makeEarth(){
  const group=new T.Group();group.position.set(35,-30,-350);group.rotation.z=.27;
  const globe=new T.Mesh(new T.SphereGeometry(146,96,64),new T.ShaderMaterial({
    uniforms:{sunDir:{value:new T.Vector3(-.6,.7,.5).normalize()}},
    vertexShader:`varying vec3 vP;varying vec3 vN;varying vec3 vW;void main(){vP=position/146.;vN=normalize(mat3(modelMatrix)*normal);vW=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 vP;varying vec3 vN;varying vec3 vW;uniform vec3 sunDir;
    float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
    float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    float fbm(vec3 p){float v=0.,amp=.5;for(int i=0;i<6;i++){v+=amp*noise(p);p=p*2.06+vec3(7.3,3.1,5.7);amp*=.5;}return v;}
    void main(){vec3 p=normalize(vP);float land=fbm(p*3.3+vec3(2.6,0.,4.2));float coast=smoothstep(.47,.51,land);float latitude=abs(p.y);vec3 ocean=mix(vec3(.008,.055,.13),vec3(.025,.21,.31),smoothstep(.3,.48,land));vec3 terrain=mix(vec3(.055,.13,.10),vec3(.32,.28,.18),smoothstep(.55,.7,land));terrain=mix(terrain,vec3(.73,.81,.83),smoothstep(.75,.96,latitude+land*.15));vec3 c=mix(ocean,terrain,coast);float cloud=fbm(p*8.5+vec3(10.,2.,1.));cloud=smoothstep(.49,.68,cloud+sin(p.y*35.+p.x*8.)*.045);c=mix(c,vec3(.85,.91,.94),cloud*.9);float light=dot(normalize(vN),sunDir);float day=smoothstep(-.18,.3,light);c*=.035+day*1.2;float rim=pow(1.-max(0.,dot(normalize(vN),normalize(cameraPosition-vW))),4.);c+=vec3(.04,.22,.47)*rim*(.3+day*.7);gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`
  }));group.add(globe);
  const atm=new T.Mesh(new T.SphereGeometry(149.5,64,48),new T.ShaderMaterial({transparent:true,side:T.BackSide,blending:T.AdditiveBlending,depthWrite:false,
    vertexShader:`varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,
    fragmentShader:`varying vec3 n;varying vec3 v;void main(){float rim=pow(clamp(1.-abs(dot(normalize(n),normalize(v))),0.,1.),5.);gl_FragColor=vec4(.12,.42,.86,rim*.65);}`
  }));group.add(atm);return group;
}
export function glowTexture(){
  const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');const g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'white');g.addColorStop(.12,'rgba(255,255,255,.8)');g.addColorStop(.4,'rgba(255,255,255,.15)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return new T.CanvasTexture(c);
}

// The player and enemy mechs (rig, factory frame and guns) are built in mech-frame.js; the old import path keeps working.
export { makeMech, makeGun } from './mech-frame.js';
