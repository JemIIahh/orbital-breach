// Eden's heightfield: rolling meadow, a worn path to the Heart Tree, a stream that falls off a west escarpment,
// a pond basin and a rim of forested hills. terrainHeight is the single source of truth for collision, placement and meshes.
import * as T from 'three';
import { V, clamp, lerp, ss, fbm, vnoise, C, Builder } from './eden-core.js';

export const pathX=z=>5*Math.sin(z*.035);
export const PATH={z0:-68,z1:76}; // the worn track ends at the Heart Tree's dais
export const POND={x:40,z:20,rx:18,rz:22,level:.4};
export const WATER_Y=POND.level;
export const STREAM={x0:-128,x1:30,depth:.5};
export const streamZ=x=>17+8*Math.sin(x*.04+.5)+3*Math.sin(x*.105);
const streamSlope=x=>8*.04*Math.cos(x*.04+.5)+3*.105*Math.cos(x*.105);
export const FALL_X=-78; // where the stream drops off the west escarpment

const smin=(a,b,k)=>{const h=clamp(.5+.5*(b-a)/k,0,1);return lerp(b,a,h)-k*h*(1-h)};
const smax=(a,b,k)=>-smin(-a,-b,k);
function baseHeight(x,z){
  const path=Math.exp(-Math.pow((x-pathX(z))/8,2));
  const hills=3.5+Math.sin(x*.031)*3+Math.cos(z*.029)*2.2+Math.sin((x+z)*.065)*1.2;
  const fine=(fbm(x*.05,z*.05,3)-.5)*3.4+Math.sin(x*.23+z*.17)*.22;
  let h=(hills+fine*(1-path*.78))*(1-path*.67);
  const q=Math.pow(Math.pow(Math.abs(x)/150,4)+Math.pow(Math.abs(z-20)/170,4),.25);
  h+=ss(.62,1.5,q)*50;
  const ex=x+5*Math.sin(z*.05)+3*Math.sin(z*.13+1)+(fbm(x*.07,z*.07,2)-.5)*7;
  h+=15*ss(-62,-79,ex);
  return smax(h,1.5,2.4);
}
const pondTerm=(x,z)=>((x-POND.x)/POND.rx)**2+((z-POND.z)/POND.rz)**2;
function landHeight(x,z){
  let h=baseHeight(x,z);const pp=pondTerm(x,z);
  if(pp<3){const w=ss(3,1.25,pp),shape=pp<1?-1.9+2.3*Math.pow(pp,1.35):POND.level+1.15*Math.pow(pp-1,.8);h=lerp(h,shape,w)}
  return h;
}
// Stream bed: monotone running-minimum of the land along the stream line, smoothed.
const BED=(()=>{
  const n=STREAM.x1-STREAM.x0+1,raw=[],out=[];
  for(let i=0;i<n;i++){const x=STREAM.x0+i;raw.push(landHeight(x,streamZ(x))-1.4)}
  const run=[];let m=Infinity;for(let i=0;i<n;i++){m=Math.min(m,raw[i]);run.push(m)}
  for(let i=0;i<n;i++){let s=0,c=0;for(let k=-5;k<=5;k++){const j=clamp(i+k,0,n-1);s+=run[j];c++}out.push(s/c)}
  let m2=Infinity;return out.map((v,i)=>{m2=Math.min(m2,v,raw[i]);return m2});
})();
export const bedHeight=x=>{const f=clamp(x-STREAM.x0,0,BED.length-1),i=Math.floor(f),j=Math.min(BED.length-1,i+1);return lerp(BED[i],BED[j],f-i)};
export const waterLevelAt=x=>Math.max(bedHeight(x)+STREAM.depth,WATER_Y);

export function terrainHeight(x,z){
  let h=landHeight(x,z);
  if(x>STREAM.x0-12&&x<STREAM.x1+8){
    const d=Math.abs(z-streamZ(x))/Math.sqrt(1+streamSlope(x)**2);
    if(d<22){const w=ss(STREAM.x0-10,STREAM.x0+6,x)*ss(STREAM.x1+6,STREAM.x1-6,x),target=bedHeight(clamp(x,STREAM.x0,STREAM.x1))+.2*d+.05*d*d;h=lerp(h,smin(h,target,1.6),w)}
  }
  return h;
}
export function terrainNormal(x,z){return V(terrainHeight(x-.15,z)-terrainHeight(x+.15,z),.3,terrainHeight(x,z-.15)-terrainHeight(x,z+.15)).normalize()}
export const inStream=(x,z,margin=0)=>x>STREAM.x0&&x<STREAM.x1+4&&Math.abs(z-streamZ(x))<3.6+margin;
export const inPond=(x,z,margin=0)=>pondTerm(x,z)<(1.18+margin/14);
export const nearWater=(x,z)=>{const h=terrainHeight(x,z);return h<WATER_Y+.5&&(inPond(x,z,6)||inStream(x,z,5))};
// distance (metres, approx.) from the worn path
export const pathDist=(x,z)=>Math.abs(x-pathX(z));
export const onPath=(x,z,w=3)=>z>PATH.z0&&z<PATH.z1&&pathDist(x,z)<w;

// ---------------------------------------------------------------- biome colouring (vertex colours; alpha = wildflower mask)
const PAL={
  meadowA:C('#3d7a2c'),meadowB:C('#78a238'),meadowC:C('#5a9034'),forest:C('#264a22'),litter:C('#5e4a2f'),moss:C('#356f38'),
  dirt:C('#8a6f48'),dirtDark:C('#5d4a31'),sand:C('#d4c18c'),mud:C('#5b4b36'),rockA:C('#8b867a'),rockB:C('#6f6b62'),rockC:C('#a39a88'),
  pebble:C('#9a9488'),dry:C('#a3a24f'),
};
export function groundColor(x,z,h,n,out=new T.Color()){
  const nrm=n.y,slope=1-nrm,patch=fbm(x*.03+4,z*.03-2,3),pat2=fbm(x*.12,z*.12+9,2),fo=forestAmount(x,z);
  out.copy(PAL.meadowA).lerp(PAL.meadowB,ss(.3,.7,patch)*.85).lerp(PAL.meadowC,ss(.4,.6,pat2)*.4);
  out.lerp(PAL.dry,ss(.62,.8,fbm(x*.02-11,z*.02+3,2))*.45);
  out.lerp(PAL.forest,fo*.75);out.lerp(PAL.litter,fo*ss(.45,.65,pat2)*.55);
  if(fo>.35)out.lerp(PAL.moss,ss(.55,.8,fbm(x*.09,z*.09,2))*.5*fo);
  // path
  const pd=Math.abs(x-pathX(z))+(vnoise(x*.5,z*.5)-.5)*1.2;
  if(z>PATH.z0-4&&z<PATH.z1+6){const pm=(1-ss(1.8,3.2,pd))*ss(PATH.z0-4,PATH.z0+4,z)*ss(PATH.z1+6,PATH.z1-6,z);out.lerp(PAL.dirt,pm*.9);out.lerp(PAL.dirtDark,pm*.25*ss(.5,.8,pat2))}
  // water edges
  const wet=ss(WATER_Y+1.6,WATER_Y-.1,h);
  if(wet>0&&(inPond(x,z,9)||inStream(x,z,7))){out.lerp(PAL.sand,wet*.8);out.lerp(PAL.mud,ss(WATER_Y+.4,WATER_Y-.5,h)*.7);if(h>WATER_Y-.3)out.lerp(PAL.pebble,ss(.55,.75,pat2)*.35*wet)}
  // rock on slopes, banded strata on the escarpment
  const rock=ss(.17,.32,slope);
  if(rock>0){const band=vnoise(h*.55,x*.04+z*.04)*.6+vnoise(h*1.8,z*.1)*.4,rc=PAL.rockA.clone().lerp(PAL.rockB,band).lerp(PAL.rockC,ss(.55,.9,vnoise(h*.9+3,x*.1)));out.lerp(rc,rock*.92);if(nrm>.62)out.lerp(PAL.moss,rock*.25*(1-ss(.28,.38,slope)))}
  return out;
}
// 0 meadow .. 1 dense forest, shared by ground colouring and placement.
export function forestAmount(x,z){
  const corridor=1-ss(10,32,Math.abs(x-pathX(z))), clear=Math.max(0,1-Math.hypot(x,z-48)/50),n=fbm(x*.02+31,z*.02-17,3);
  let f=ss(.3,.62,n)*.85+ss(40,110,Math.hypot(x*.9,z-20))*.25;
  f*=1-corridor*.75;f*=1-clear*.4;
  if(z<-60)f=Math.max(f,.5);
  return clamp(f,0,1);
}

export function buildGround(){
  const N=240,A=1.0,R=260,pos=new Float32Array((N+1)*(N+1)*3),col=new Float32Array((N+1)*(N+1)*4),idx=[],tmp=new T.Color();
  const map=u=>R*(.55*u+.45*u*u*u);
  for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){
    const k=j*(N+1)+i,x=map(i/N*2-1),z=map(j/N*2-1),y=terrainHeight(x,z);
    pos[k*3]=x;pos[k*3+1]=y;pos[k*3+2]=z;
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){const a=j*(N+1)+i,b=a+1,c=a+N+1,d=c+1;idx.push(a,c,b,b,c,d)}
  g.setIndex(idx);g.computeVertexNormals();
  const nor=g.attributes.normal,fl=new T.Color();
  for(let k=0;k<(N+1)*(N+1);k++){
    const x=pos[k*3],y=pos[k*3+1],z=pos[k*3+2],n=V(nor.getX(k),nor.getY(k),nor.getZ(k));groundColor(x,z,y,n,tmp);
    const fo=forestAmount(x,z),m=clamp((1-fo*1.25)*(1-(Math.abs(x-pathX(z))<3.3?1:0))*ss(.8,.95,n.y)*ss(.3,1.2,y)*(1-ss(0,.7,fbm(x*.04+50,z*.04,2)-.25)*0)+0,0,1);
    col[k*4]=tmp.r;col[k*4+1]=tmp.g;col[k*4+2]=tmp.b;col[k*4+3]=m;
  }
  g.setAttribute('color',new T.BufferAttribute(col,4));g.computeBoundingSphere();
  return g;
}

export function groundMaterial(){
  const m=new T.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0});
  m.onBeforeCompile=s=>{
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;varying vec3 vWN;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvWP=(modelMatrix*vec4(transformed,1.)).xyz;vWN=normal;');
    s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vWP;varying vec3 vWN;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}`)
    .replace('#include <color_fragment>',`#include <color_fragment>
{
  float flowerMask=diffuseColor.a;diffuseColor.a=1.;
  vec2 q=vWP.xz;
  float n1=vn(q*.31),n2=vn(q*1.9),n3=vn(q*7.3),n4=vn(q*23.);
  float pd=abs(vWP.x-5.*sin(vWP.z*.035))+(vn(q*.5)-.5)*1.2;
  float pm=(1.-smoothstep(1.7,3.2,pd))*smoothstep(-64.,-56.,vWP.z)*smoothstep(82.,70.,vWP.z);
  vec3 grain=vec3(.72+.5*(n1*.45+n2*.33+n3*.22));
  diffuseColor.rgb*=grain;
  // wheel ruts and pebbles on the path
  float rut=smoothstep(.22,.0,abs(abs(vWP.x-5.*sin(vWP.z*.035))-.95))*pm;diffuseColor.rgb*=1.-rut*.28;
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*(.9+.2*n4)+vec3(.04,.035,.02)*step(.8,n4)*pm,pm*.6);
  // wildflower speckles
  vec2 cell=floor(q*2.6);float hh=h21(cell+3.7);
  if(hh>.935&&flowerMask>.15){vec2 fp=fract(q*2.6)-.5-(vec2(h21(cell+1.1),h21(cell+9.2))-.5)*.5;float spot=smoothstep(.17,.08,length(fp))*flowerMask;float k=fract(hh*91.7);
    vec3 fc=k<.28?vec3(.95,.93,.8):k<.5?vec3(.97,.78,.2):k<.7?vec3(.62,.42,.82):k<.86?vec3(.94,.45,.55):vec3(.45,.62,.95);diffuseColor.rgb=mix(diffuseColor.rgb,fc,spot*.85);}
  // clover / dry grass patches in the meadow
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.12,1.1,.8),smoothstep(.62,.78,vn(q*.18+7.))*.4*flowerMask);
}`);
  };
  m.customProgramCacheKey=()=>'eden-ground';
  return m;
}
