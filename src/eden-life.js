// Things that move: pollen motes, fireflies, glow spores at the shrine, waterfall mist, butterflies, distant birds,
// and soft light shafts. All animation runs in vertex shaders driven by one time uniform.
import * as T from 'three';
import { V, rng, C, clamp } from './eden-core.js';
import { terrainHeight, streamZ, FALL_X, bedHeight, WATER_Y, pathX, forestAmount, inPond, inStream } from './eden-terrain.js';
import { SUN_DIR } from './eden-sky.js';
import { SHRINE } from './eden-shrine.js';

const POINT_VS=/* glsl */`
attribute vec4 aSeed;uniform float uTime;uniform float uSize;uniform float uFollow;uniform vec3 uBox;uniform vec3 uOffset;uniform float uRise;uniform float uBlink;uniform float uGlow;
varying float vA;
void main(){
  vec3 p=aSeed.xyz*uBox;float ph=aSeed.w*6.2831;
  p+=vec3(sin(uTime*.11+ph)*1.6,sin(uTime*.23+ph*2.)*.5+uTime*uRise,cos(uTime*.09+ph*1.7)*1.6);
  vec3 w;
  if(uFollow>.5){vec3 o=cameraPosition-uBox*.5+uOffset;w=o+mod(p-o,uBox);}
  else{w=uOffset+vec3(p.x-uBox.x*.5,mod(p.y,uBox.y),p.z-uBox.z*.5);}
  vec4 mv=viewMatrix*vec4(w,1.);gl_Position=projectionMatrix*mv;
  float dist=-mv.z;
  float blink=uBlink>.5?smoothstep(.35,.95,sin(uTime*(.7+aSeed.w*.9)+ph*5.)*.5+.5):1.;
  float edge=uFollow>.5?smoothstep(0.,6.,min(w.y-(cameraPosition.y-uBox.y*.5+uOffset.y),uBox.y-(w.y-(cameraPosition.y-uBox.y*.5+uOffset.y)))):smoothstep(0.,1.5,mod(p.y,uBox.y))*smoothstep(uBox.y,uBox.y*.6,mod(p.y,uBox.y));
  vA=blink*edge*smoothstep(.6,3.,dist)*smoothstep(uBox.x*.55,uBox.x*.3,length(w.xz-cameraPosition.xz))*uGlow;
  gl_PointSize=clamp(uSize*(.6+aSeed.w*.8)*520./max(dist,.5),1.,uSize*70.);
}`;
const POINT_FS=/* glsl */`uniform vec3 uColor;uniform float uSoft;varying float vA;
void main(){float d=length(gl_PointCoord-.5)*2.;float a=smoothstep(1.,uSoft,d)*vA;if(a<.01)discard;gl_FragColor=vec4(uColor,a);}`;
function points({count,seed,box,offset=[0,0,0],follow=true,size=.05,color='#fff3c0',intensity=1,rise=.1,blink=false,additive=true,soft=.1,glow=1}){
  const r=rng(seed),a=new Float32Array(count*4),pos=new Float32Array(count*3);
  for(let i=0;i<count;i++){a[i*4]=r();a[i*4+1]=r();a[i*4+2]=r();a[i*4+3]=r()}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));g.setAttribute('aSeed',new T.BufferAttribute(a,4));
  const col=C(color).multiplyScalar(intensity),m=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:additive?T.AdditiveBlending:T.NormalBlending,vertexShader:POINT_VS,fragmentShader:POINT_FS,
    uniforms:{uTime:{value:0},uSize:{value:size},uFollow:{value:follow?1:0},uBox:{value:V(...box)},uOffset:{value:V(...offset)},uRise:{value:rise},uBlink:{value:blink?1:0},uColor:{value:new T.Vector3(col.r,col.g,col.b)},uSoft:{value:soft},uGlow:{value:glow}}});
  const pts=new T.Points(g,m);pts.frustumCulled=false;return pts;
}

// Fluttering things on rails, drawn as one instanced draw: butterflies (near) and birds (far).
const FLY_VS=/* glsl */`
attribute vec3 aCenter;attribute vec4 aParam;attribute vec3 aColor;uniform float uTime;uniform float uFlap;uniform float uScale;
varying vec3 vC;varying vec2 vUv;varying float vD;
void main(){
  float a=uTime*aParam.y+aParam.z,R=aParam.x;
  vec3 c=aCenter+vec3(cos(a)*R,sin(a*1.7+aParam.z*3.)*aParam.w,sin(a)*R*(.6+.4*cos(aParam.z)));
  vec3 f=normalize(vec3(-sin(a),cos(a*1.7+aParam.z*3.)*aParam.w*.15,cos(a)*(.6+.4*cos(aParam.z))));
  vec3 r=normalize(cross(vec3(0.,1.,0.),f)),u=cross(f,r);
  float flap=sin(uTime*uFlap+aParam.z*9.)*.95;
  vec3 lp=position*uScale;float th=flap;
  vec3 q=vec3(lp.x*cos(th),abs(lp.x)*sin(th),lp.z);
  vec3 world=c+r*q.x+u*(q.y+lp.y)+f*q.z;
  vC=aColor;vUv=uv;vD=length(world-cameraPosition);
  gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);
}`;
const FLY_FS=/* glsl */`varying vec3 vC;varying vec2 vUv;varying float vD;uniform float uBird;
void main(){
  vec3 c=vC;
  if(uBird>.5)c=mix(c*(.7+.6*vUv.y),vec3(.62,.76,.92),smoothstep(50.,230.,vD)*.55);
  if(uBird<.5){float spot=smoothstep(.2,.12,length(vUv-vec2(.5,.45)));float edge=smoothstep(.75,.95,length(vUv-vec2(.2,.5))*1.2);c=mix(c,c*.25,edge*.7);c=mix(c,vec3(1.,.95,.8),spot*.5);c*=1.15;}
  gl_FragColor=vec4(c,1.);
}`;
function flyers({count,seed,uniforms,wing,scale,flap,bird,place}){
  const g=new T.InstancedBufferGeometry(),pos=[],uv=[];
  // body + two wings (each wing a quad split in two tris), x is the wing axis
  const W=wing;const tri=(a,b,c,ua,ub,uc)=>{pos.push(...a,...b,...c);uv.push(...ua,...ub,...uc)};
  if(bird)for(const s of [-1,1]){tri([0,0,.32*W],[s*W*.55,0,.12*W],[s*W*.5,0,-.08*W],[.5,.5],[s>0?.7:.3,.6],[s>0?.7:.3,.2]);tri([s*W*.5,0,.1*W],[s*W,0,-.42*W],[s*W*.42,0,-.1*W],[.5,.5],[s>0?1:0,0],[s>0?.6:.4,.2]);tri([0,0,.32*W],[s*W*.5,0,-.08*W],[0,0,-.34*W],[.5,.5],[s>0?.7:.3,.2],[.5,0])}
  else for(const s of [-1,1]){tri([0,0,.5*W],[s*W,0,.25*W],[s*W*.9,0,-.5*W],[.5,.5],[s>0?1:0,.4],[s>0?.9:.1,.0]);tri([0,0,.5*W],[s*W*.9,0,-.5*W],[0,0,-.4*W],[.5,.5],[s>0?.9:.1,0],[.5,0])}
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  const R=rng(seed),center=new Float32Array(count*3),param=new Float32Array(count*4),color=new Float32Array(count*3);
  for(let i=0;i<count;i++){const o=place(i,R);center.set(o.c,i*3);param.set(o.p,i*4);color.set(o.color,i*3)}
  g.setAttribute('aCenter',new T.InstancedBufferAttribute(center,3));g.setAttribute('aParam',new T.InstancedBufferAttribute(param,4));g.setAttribute('aColor',new T.InstancedBufferAttribute(color,3));g.instanceCount=count;
  const m=new T.ShaderMaterial({uniforms:{uTime:uniforms.uTime,uFlap:{value:flap},uScale:{value:scale},uBird:{value:bird?1:0}},vertexShader:FLY_VS,fragmentShader:FLY_FS,side:T.DoubleSide,fog:false});
  const mesh=new T.Mesh(g,m);mesh.frustumCulled=false;return mesh;
}

export function buildLife({scene,uniforms}){
  const out=[],add=(m,name)=>{m.name=name;scene.add(m);out.push(m);return m},pt=[];
  // pollen and dust motes drifting through the sunlight around the viewer
  const pollen=points({count:900,seed:11,box:[64,16,64],offset:[0,-1,0],size:.045,color:'#fff0c4',intensity:1.25,rise:.07,glow:.7});add(pollen,'pollen');pt.push(pollen);
  const flies=points({count:240,seed:12,box:[50,6,50],offset:[0,-2.6,0],size:.07,color:'#d9ff7a',intensity:3.2,rise:.02,blink:true,soft:.0,glow:.9});add(flies,'fireflies');pt.push(flies);
  // glow spores rising around the Heart Tree grove
  const spores=points({count:150,seed:13,box:[26,11,26],offset:[SHRINE.x,terrainHeight(SHRINE.x,SHRINE.z)+.3,SHRINE.z],follow:false,size:.09,color:'#7dffd2',intensity:3,rise:.35,soft:.0,glow:1});add(spores,'grove-spores');pt.push(spores);
  // mist at the foot of the waterfall
  const fz=streamZ(FALL_X+4),fy=bedHeight(FALL_X+4);
  const mist=points({count:48,seed:14,box:[10,7,10],offset:[FALL_X+5,fy,fz],follow:false,size:1.1,color:'#e8f4f2',intensity:.55,rise:.5,additive:false,soft:-.4,glow:.42});add(mist,'fall-mist');pt.push(mist);
  // butterflies over the meadows and the grove
  const colors=['#ffb347','#ffffff','#7ab8ff','#ff7fb0','#f4e04a','#b48cff'];
  const butterflies=flyers({count:44,seed:21,uniforms,wing:.1,scale:1,flap:15,bird:false,place:(i,R)=>{
    let x,z;if(i<14){const a=R()*6.28,d=3+R()*9;x=SHRINE.x+Math.cos(a)*d;z=SHRINE.z+Math.sin(a)*d}else{z=-40+R()*120;x=pathX(z)+(R()-.5)*44}
    const c=C(colors[Math.floor(R()*colors.length)]);return {c:[x,terrainHeight(x,z)+1.5+R()*1.4,z],p:[1.5+R()*3,.25+R()*.3,R()*6.28,.35+R()*.45],color:[c.r,c.g,c.b]}}});add(butterflies,'butterflies');
  // distant flocks
  const dark=C('#3a444c');
  const birds=flyers({count:26,seed:31,uniforms,wing:1.1,scale:1.9,flap:6,bird:true,place:(i,R)=>{
    const flock=i%2,cx=flock?-60:90,cz=flock?190:60,k=R();
    return {c:[cx+(R()-.5)*30,46+R()*26+flock*16,cz+(R()-.5)*30],p:[50+R()*40,.05+(R()*.02)+(flock?.02:0),flock*2+R()*.5,2+R()*3],color:[dark.r,dark.g,dark.b]}}});add(birds,'birds');
  // light shafts: tapered cylinders along the sun direction, faded by view angle and distance
  const rays=new T.Group(),rr=rng(51),pos=[],nor=[],att=[],idx=[],seg=10;
  const sd=SUN_DIR.clone(),axisX=V(0,1,0).cross(sd).normalize(),axisZ=sd.clone().cross(axisX).normalize();
  const spots=[];
  for(let i=0;i<60&&spots.length<18;i++){const x=-70+rr()*150,z=-40+rr()*140;if(forestAmount(x,z)<.35||terrainHeight(x,z)<WATER_Y+1)continue;spots.push([x,z])}
  spots.push([SHRINE.x-6,SHRINE.z-12],[SHRINE.x+8,SHRINE.z-6],[SHRINE.x+2,SHRINE.z+4],[8,-30],[-14,10],[30,-6]);
  spots.forEach(([x,z],bi)=>{
    const g=terrainHeight(x,z),len=34+rr()*22,rad=1.6+rr()*2.6,base=V(x,g-2,z),base0=pos.length/3;
    for(let k=0;k<=1;k++)for(let j=0;j<=seg;j++){const a=j/seg*Math.PI*2,t=k,r=rad*(.6+.7*t),o=axisX.clone().multiplyScalar(Math.cos(a)).addScaledVector(axisZ,Math.sin(a)),p=base.clone().addScaledVector(sd,t*len).addScaledVector(o,r);pos.push(p.x,p.y,p.z);nor.push(o.x,o.y,o.z);att.push(t,rr()*0+.55+.45*((bi*37%7)/7))}
    for(let j=0;j<seg;j++){const a=base0+j,b=base0+j+1,c=base0+seg+1+j,d=base0+seg+1+j+1;idx.push(a,c,b,b,c,d)}
  });
  const rg=new T.BufferGeometry();rg.setAttribute('position',new T.Float32BufferAttribute(pos,3));rg.setAttribute('normal',new T.Float32BufferAttribute(nor,3));rg.setAttribute('aAtt',new T.Float32BufferAttribute(att,2));rg.setIndex(idx);
  const rayMat=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide,uniforms:{uTime:uniforms.uTime},
    vertexShader:`attribute vec2 aAtt;uniform float uTime;varying vec3 vN;varying vec3 vW;varying vec2 vAtt;void main(){vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vAtt=aAtt;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`uniform float uTime;varying vec3 vN;varying vec3 vW;varying vec2 vAtt;void main(){vec3 v=normalize(cameraPosition-vW);float f=pow(abs(dot(normalize(vN),v)),1.6);float t=vAtt.x;float fade=smoothstep(0.,.3,t)*smoothstep(1.02,.55,t);float d=distance(cameraPosition,vW);float near=smoothstep(6.,24.,d);float shimmer=.75+.25*sin(uTime*.6+vAtt.y*12.+vW.x*.07);float a=f*fade*near*shimmer*.085*vAtt.y;gl_FragColor=vec4(vec3(1.,.86,.56)*1.1,a);}`});
  const rm=new T.Mesh(rg,rayMat);rm.frustumCulled=false;rm.renderOrder=6;add(rm,'light-shafts');
  return {meshes:out,update(t,restored){for(const p of pt)p.material.uniforms.uTime.value=t;spores.material.uniforms.uGlow.value=restored?1.8:1;uniforms.uTime.value=t}};
}
