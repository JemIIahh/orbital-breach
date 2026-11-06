// Eden's water: one shader-driven mesh for the stream, its waterfall and the pond (depth-tinted, sky-reflecting,
// with ripples, sun glints and shore foam), plus lily pads.
import * as T from 'three';
import { V, clamp, rng, C, Builder, P, M, Instances, foliageMaterial } from './eden-core.js';
import { terrainHeight, streamZ, waterLevelAt, WATER_Y, STREAM, POND, FALL_X, inPond } from './eden-terrain.js';
import { SKY_GLSL } from './eden-sky.js';

export function buildWaterGeometry(){
  const pos=[],dep=[],flow=[],idx=[];
  const vert=(x,y,z,d,f)=>{pos.push(x,y,z);dep.push(d);flow.push(f);return pos.length/3-1};
  // stream ribbon, finer around the waterfall
  const xs=[];for(let x=STREAM.x0+4;x<22;x+=(x>FALL_X-14&&x<FALL_X+10)?.5:1.25)xs.push(x);xs.push(22);
  const W=9,step=1,cols=[];for(let t=-W;t<=W;t+=step)cols.push(t);
  const rows=xs.map((x,i)=>{
    const y=waterLevelAt(x),f=Math.abs(waterLevelAt(x+.5)-waterLevelAt(x-.5));
    return cols.map(t=>{const z=streamZ(x)+t*Math.sqrt(1)+0;const d=y-terrainHeight(x,z);return {x,y,z,d,f}});
  });
  const id=rows.map(row=>row.map(v=>vert(v.x,v.y,v.z,v.d,v.f)));
  for(let i=0;i<rows.length-1;i++)for(let j=0;j<cols.length-1;j++){
    const a=rows[i][j],b=rows[i+1][j],c=rows[i][j+1],d=rows[i+1][j+1];
    if(Math.max(a.d,b.d,c.d,d.d)<-.05)continue;
    idx.push(id[i][j],id[i][j+1],id[i+1][j],id[i][j+1],id[i+1][j+1],id[i+1][j]);
  }
  // pond
  const step2=1.4,x0=POND.x-POND.rx*1.5,z0=POND.z-POND.rz*1.5,nx=Math.ceil(POND.rx*3/step2),nz=Math.ceil(POND.rz*3/step2),grid=[];
  for(let j=0;j<=nz;j++){grid.push([]);for(let i=0;i<=nx;i++){const x=x0+i*step2,z=z0+j*step2,d=WATER_Y-terrainHeight(x,z);grid[j].push({x,z,d,v:-1,ok:x>=20.5&&inPond(x,z,6)})}}
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const q=[grid[j][i],grid[j][i+1],grid[j+1][i],grid[j+1][i+1]];if(!q.every(p=>p.ok)||Math.max(...q.map(p=>p.d))<-.05)continue;
    for(const p of q)if(p.v<0)p.v=vert(p.x,WATER_Y,p.z,p.d,0);
    idx.push(q[0].v,q[1].v,q[2].v,q[1].v,q[3].v,q[2].v);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('aDepth',new T.Float32BufferAttribute(dep,1));g.setAttribute('aFlow',new T.Float32BufferAttribute(flow,1));g.setIndex(idx);g.computeBoundingSphere();return g;
}
export function waterMaterial(skyU){
  const uniforms={...T.UniformsUtils.clone(T.UniformsLib.fog),uTime:skyU.uTime,uSun:skyU.uSun,uSkyA:skyU.uSkyA,uSkyB:skyU.uSkyB,uSkyC:skyU.uSkyC};
  return new T.ShaderMaterial({uniforms,fog:true,transparent:true,depthWrite:false,side:T.DoubleSide,
    vertexShader:`attribute float aDepth;attribute float aFlow;varying vec3 vW;varying float vDepth;varying float vFlow;
#include <fog_pars_vertex>
void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vDepth=aDepth;vFlow=aFlow;vec4 mvPosition=viewMatrix*w;gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`,
    fragmentShader:`varying vec3 vW;varying float vDepth;varying float vFlow;uniform float uTime;${SKY_GLSL}
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
#include <fog_pars_fragment>
float ripple(vec2 p,float t,float fl){
  vec2 q=p*1.6+vec2(-t*(.35+fl*5.),t*.12);float a=vn(q)+vn(q*2.3+vec2(t*.2,-t*.3))*.5+vn(p*5.1+vec2(-t*(.6+fl*8.),0.))*.25;return a;
}
void main(){
  float fl=clamp(vFlow,0.,1.5);vec2 p=vW.xz;float e=.12;
  float h0=ripple(p,uTime,fl),hx=ripple(p+vec2(e,0.),uTime,fl),hz=ripple(p+vec2(0.,e),uTime,fl);
  float amp=.55+fl*1.2;vec3 n=normalize(vec3(-(hx-h0)/e*.06*amp,1.,-(hz-h0)/e*.06*amp));
  vec3 V=normalize(cameraPosition-vW);float nv=max(dot(n,V),0.);
  float fres=.04+.96*pow(1.-nv,4.);
  vec3 R=reflect(-V,n);R.y=abs(R.y)+.02;vec3 refl=skyBase(normalize(R));
  float dd=smoothstep(0.,2.4,vDepth);
  vec3 shallow=vec3(.10,.32,.26)*(.85+.3*vn(p*.8)),deep=vec3(.015,.09,.12);
  vec3 col=mix(mix(shallow,deep,dd),refl,clamp(fres*1.1,0.,.9));
  float glint=pow(max(dot(reflect(-uSun,n),V),0.),160.)*5.*step(.0,uSun.y);col+=vec3(1.,.88,.6)*glint;
  // shore foam and waterfall spray
  float shore=smoothstep(.5,.0,vDepth)*(.45+.55*vn(p*3.2+uTime*.15));
  float streak=smoothstep(.55,.8,vn(vec2(p.x*.5-uTime*(1.5+fl*6.),p.y*2.6)))*smoothstep(.12,.5,fl);
  float foam=clamp(shore*.75+streak*.9+smoothstep(.45,1.,fl)*.35*vn(p*4.),0.,1.);
  col=mix(col,vec3(.93,.97,.96),foam);
  float alpha=clamp(mix(.58,.93,dd)+fres*.25,0.,1.)*smoothstep(0.,.14,vDepth);alpha=max(alpha,foam*.9*smoothstep(0.,.1,vDepth));
  gl_FragColor=vec4(col,alpha);
#include <fog_fragment>
}`});
}
export function lilyPads(scene,count=46){
  const b=new Builder(),r=rng(77),seg=14;
  const c0=C('#3f8a3a'),c1=C('#5fb04a'),ctr=b.vert(V(0,0,0),V(0,1,0),c0,1);
  for(let i=0;i<=seg;i++){const a=.35+i/seg*(Math.PI*2-.7);b.vert(V(Math.cos(a)*.5,0,Math.sin(a)*.5),V(0,1,0),c1,1)}
  for(let i=0;i<seg;i++)b.tri(ctr,ctr+1+i+1,ctr+1+i);
  const flowerG=new Builder();
  for(let k=0;k<6;k++){const a=k/6*6.28;flowerG.add(P.ico(0),M(V(Math.cos(a)*.1,.06,Math.sin(a)*.1),V(.07,.05,.07),{y:a}),C('#ffd6ea'),1)}
  flowerG.add(P.ico(0),M(V(0,.07,0),.05),C('#ffcf3a'),0);
  const pads=new Instances(),flowers=new Instances();let n=0,t=0;
  while(n<count&&t++<6000){
    const x=POND.x+(r()-.5)*POND.rx*2.4,z=POND.z+(r()-.5)*POND.rz*2.4,d=WATER_Y-terrainHeight(x,z);
    if(!inPond(x,z,0)||d<.35||d>1.9)continue;
    const s=.8+r()*1.1;pads.add(x,WATER_Y+.03,z,s,1,s,0,r()*6.28,0,C('#ffffff').multiplyScalar(.8+r()*.3));
    if(r()<.35)flowers.add(x+(r()-.5)*.3,WATER_Y+.03,z+(r()-.5)*.3,s,s,s,0,r()*6.28,0,C(['#ffffff','#ffc0dc','#ffe38a'][Math.floor(r()*3)]));n++;
  }
  const mat=foliageMaterial({uTime:{value:0}},{mode:'none',side:T.DoubleSide,roughness:.6}),out=[];
  const m1=pads.mesh(b.build(),mat,{receive:true});m1.name='lily-pads';scene.add(m1);out.push(m1);
  const m2=flowers.mesh(flowerG.build(),mat,{receive:false});m2.name='lily-flowers';scene.add(m2);out.push(m2);
  return out;
}
