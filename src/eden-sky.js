// Eden's atmosphere: a gradient sky with a sun and drifting clouds, layered mountain/tree-line silhouettes with
// atmospheric perspective, translucent light shafts and a few distant flocks of birds.
import * as T from 'three';
import { V, clamp, lerp, ss, rng, fbm, vnoise, C } from './eden-core.js';

export const SUN_DIR=V(-35,65,-65).normalize(); // matches the offset game.js gives the directional light
export const SKY={horizon:C('#cfe0d2'),mid:C('#8fc3e6'),zenith:C('#3b7fc4'),fog:C('#c3d9cf')};

export const SKY_GLSL=/* glsl */`
uniform vec3 uSun;uniform vec3 uSkyA;uniform vec3 uSkyB;uniform vec3 uSkyC;
vec3 skyBase(vec3 d){
  float y=clamp(d.y,0.,1.);
  vec3 c=mix(uSkyA,uSkyB,pow(y,.5));c=mix(c,uSkyC,pow(y,1.5));
  float sd=max(dot(d,uSun),0.);
  c+=vec3(1.,.66,.34)*pow(sd,3.)*.16+vec3(1.,.82,.52)*pow(sd,36.)*.45+vec3(1.,.95,.85)*smoothstep(.9991,.9996,sd)*22.;
  return c;
}`;
const NOISE_GLSL=/* glsl */`
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=vn(p)*a;p=p*2.03+vec2(13.1,7.7);a*=.5;}return s;}`;

export function skyUniforms(){
  return {uSun:{value:SUN_DIR.clone()},uSkyA:{value:SKY.horizon.clone()},uSkyB:{value:SKY.mid.clone()},uSkyC:{value:SKY.zenith.clone()},uTime:{value:0}};
}
export function buildSky(uniforms){
  const mat=new T.ShaderMaterial({uniforms,side:T.BackSide,depthWrite:false,fog:false,
    vertexShader:`varying vec3 vDir;void main(){vDir=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
    fragmentShader:`varying vec3 vDir;uniform float uTime;${SKY_GLSL}${NOISE_GLSL}
void main(){
  vec3 d=normalize(vDir);vec3 c=skyBase(d);
  float up=smoothstep(.0,.12,d.y);
  if(d.y>.005){
    vec2 p=d.xz/(d.y+.14)*.62+vec2(uTime*.0045,uTime*.0018);
    float n=fbm(p*1.15),n2=fbm(p*1.15+uSun.xz*.09+3.);
    float cov=smoothstep(.5,.74,n)*up;
    float shade=clamp(.5+(n-n2)*3.2,0.,1.);
    vec3 lit=vec3(1.08,1.02,.92),dark=mix(uSkyB,vec3(.62,.7,.82),.6)*.85;
    vec3 cc=mix(dark,lit,shade);cc+=vec3(1.,.8,.55)*pow(max(dot(d,uSun),0.),6.)*.45*(1.-shade*.5);
    // wispy high cirrus
    vec2 q=vec2(d.x,d.z)/(d.y+.3)*vec2(.35,1.4)+vec2(uTime*.003,0.);
    float ci=smoothstep(.55,.85,fbm(q*2.2))*.3*up;
    c=mix(c,vec3(1.,.98,.95),ci);
    c=mix(c,cc,cov*.92);
  }
  gl_FragColor=vec4(c,1.);
}`});
  const sky=new T.Mesh(new T.SphereGeometry(1900,40,24),mat);sky.renderOrder=100;sky.frustumCulled=false;sky.name='sky';return sky;
}

// Layered silhouettes: farther rings are bluer and lighter and dissolve into the horizon haze at their feet.
function ridgeRing(radius,baseY,amp,detail,seed,top,haze,{peaks=1,snow=false,jag=0}={}){
  const N=360,pos=[],col=[],idx=[];
  for(let i=0;i<=N;i++){
    const a=i/N*Math.PI*2,x=Math.cos(a),z=Math.sin(a);
    const n=fbm(x*detail+seed,z*detail-seed,4),ridge=1-Math.abs(fbm(x*detail*2.1+seed*3,z*detail*2.1,3)*2-1);
    let h=baseY+amp*(n*.55+Math.pow(ridge,peaks)*.6);h+=jag*(vnoise(i*.9,seed)-.4)*amp;
    const snowK=snow?ss(.6,.8,(h-baseY)/amp):0,tc=top.clone().lerp(C('#f3f6fa'),snowK*.85).multiplyScalar(.93+.14*vnoise(i*.4,seed+3)),mc=tc.clone().lerp(haze,.55);
    pos.push(x*radius,h,z*radius, x*radius,h*.4,z*radius, x*radius,0,z*radius, x*radius,-60,z*radius);
    col.push(tc.r,tc.g,tc.b, mc.r,mc.g,mc.b, haze.r,haze.g,haze.b, haze.r,haze.g,haze.b);
    if(i<N)for(let k=0;k<3;k++){const a0=i*4+k,b0=i*4+k+1,a1=a0+4,b1=b0+4;idx.push(a0,b0,a1,a1,b0,b1)}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(col,3));g.setIndex(idx);
  const m=new T.Mesh(g,new T.MeshBasicMaterial({vertexColors:true,fog:false,side:T.DoubleSide}));m.frustumCulled=false;return m;
}
export function buildHorizon(){
  const g=new T.Group(),hz=SKY.horizon,mk=(c,k)=>C(c).lerp(hz,k);
  const layers=[
    [1500,70,330,2.2,11,mk('#b5c9dc',.2),mk('#c9dbd6',.78),{peaks:1.6,snow:true,jag:.12}],
    [1000,40,190,3.0,23,mk('#8fb0c0',.3),mk('#c3d7d0',.72),{peaks:1.3}],
    [640,22,110,4.2,37,mk('#6f9a95',.34),mk('#bcd5c9',.66),{peaks:1.2}],
    [380,14,58,6.5,53,mk('#4b7b60',.3),mk('#b2cdbd',.55),{peaks:1,jag:.18}],
  ];
  layers.forEach(([R,b,a,d,s,t,bt,o],i)=>{const m=ridgeRing(R,b,a,d,s,t,hz.clone().lerp(bt,.4),o);m.renderOrder=50+i;g.add(m)});
  g.name='horizon';return g;
}
