// Procedural surfaces for Meridian. Each material is a stock three.js material patched with world-space patterns,
// so windows, cracked asphalt, wet puddles, paving and creeping grass cost no textures and no extra draw calls.
import * as T from 'three';

// Shared, per-world uniforms: the clock, how far the light has dropped toward dusk, the horizon haze and the gate pulse.
export function makeCityUniforms() {
  return { uTime: { value: 0 }, uDusk: { value: 0 }, uGate: { value: 0 }, uPower:{value:new T.Vector3()}, uSky: { value: new T.Color('#c9bba8') } };
}

export const GLSL_NOISE = /* glsl */`
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
vec2 hash22(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash12(i),hash12(i+vec2(1.,0.)),f.x),mix(hash12(i+vec2(0.,1.)),hash12(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vnoise(p);p=p*2.03+17.1;a*=.5;}return s;}
float crackLine(vec2 p){vec2 i=floor(p),f=fract(p);float d1=8.,d2=8.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 r=g+hash22(i+g)-f;float d=dot(r,r);if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;}return sqrt(d2)-sqrt(d1);}
`;
const FRAG_PARS = `uniform float uTime;uniform float uDusk;uniform vec3 uPower;uniform vec3 uSky;varying vec3 vMWP;varying vec3 vMWN;varying vec3 vMCen;\n${GLSL_NOISE}`;
const VERT_PARS = 'varying vec3 vMWP;varying vec3 vMWN;varying vec3 vMCen;';
// World position, axis-aligned normal and centre of every instance, so a building keeps one style on all of its faces.
const VERT_BEGIN = `#include <begin_vertex>
{vec4 wp=vec4(position,1.);vec3 wn=normal;vec3 cen=vec3(0.);
#ifdef USE_INSTANCING
wp=instanceMatrix*wp;wn=mat3(instanceMatrix)*wn;cen=instanceMatrix[3].xyz;
#endif
wp=modelMatrix*wp;vMWP=wp.xyz;vMWN=normalize(mat3(modelMatrix)*wn);vMCen=(modelMatrix*vec4(cen,1.)).xyz;}`;

const lin = hex => { const c = new T.Color(hex); return `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`; };

export function patchMaterial(material, key, uniforms, { frag = '', color = '', rough = '', metal = '', emissive = '', pars = '', after = '' }) {
  material.customProgramCacheKey = () => key;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { uTime: uniforms.uTime, uDusk: uniforms.uDusk, uSky: uniforms.uSky, uGate: uniforms.uGate,uPower:uniforms.uPower });
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERT_PARS}`).replace('#include <begin_vertex>', VERT_BEGIN);
    let f = shader.fragmentShader.replace('#include <common>', `#include <common>\nuniform float uGate;\n${FRAG_PARS}\n${pars}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${color}`);
    if (rough) f = f.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${rough}`);
    if (metal) f = f.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${metal}`);
    if (emissive) f = f.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${emissive}`);
    if (after) f = f.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${after}`);
    shader.fragmentShader = f;
  };
  return material;
}

// Building walls: lit windows, ribbons, curtain glass, slab lines, grime, creeping moss at street level.
export function facadeMaterial(U) {
  const m = new T.MeshStandardMaterial({ color: '#ffffff', roughness: .82, metalness: .04 });
  return patchMaterial(m, 'meridian-facade', U, {
    pars: 'float fPane;vec3 fEmi;',
    color: `
fPane=0.;fEmi=vec3(0.);
{vec3 wn=normalize(vMWN);vec3 col=diffuseColor.rgb;
if(wn.y>.6){float n=vnoise(vMWP.xz*1.7);col*=.5*(.8+.4*n);}
else if(wn.y>-.6){
  float st=hash12(floor(vMCen.xz*.5)+3.7);bool xf=abs(wn.x)>abs(wn.z);
  float u=xf?vMWP.z:vMWP.x,v=vMWP.y;
  float pitch=st<.34?3.2:(st<.67?3.6:2.4);
  float gv=(v-.5)/3.;float cu=floor(u/pitch),cv=floor(gv);vec2 f=vec2(fract(u/pitch),fract(gv));
  vec2 cell=vec2(cu,cv)+floor(vMCen.xz*.37)*13.1+(xf?7.:0.);
  vec2 lo=st<.34?vec2(.2,.18):(st<.67?vec2(.0,.2):vec2(.04,.05)),hi=st<.34?vec2(.8,.8):(st<.67?vec2(1.,.78):vec2(.96,.95));
  float pane=step(lo.x,f.x)*step(f.x,hi.x)*step(lo.y,f.y)*step(f.y,hi.y)*step(1.15,v);
  float mull=st>=.34&&st<.67?step(f.x,.035)+step(.965,f.x):0.;pane*=1.-clamp(mull,0.,1.);
  float r=hash12(cell*1.37);
  float tog=step(.985,hash12(cell+floor(uTime*.07+r*13.)));
  float power=vMWP.z<10.?uPower.x:(vMWP.z<50.?uPower.y:uPower.z);
  float warm=step(r,.09+uDusk*.17+power*.18),cool=step(.09+uDusk*.17+power*.18,r)*step(r,.115+uDusk*.19+power*.24),dead=step(.985,r);
  warm=abs(warm-tog);
  float row=step(.93,hash12(vec2(cv,floor(vMCen.x*.3+vMCen.z*.7)))); cool=max(cool,row*step(r,.7));
  // Reflected skyline bands, recessed reveals and room silhouettes keep each
  // pane from reading as a painted black rectangle. No extra geometry.
  float skyline=smoothstep(.3,.32,f.y+sin(f.x*7.+hash12(cell)*6.)*.08);
  vec3 refl=mix(vec3(.07,.12,.16),uSky*.85+vec3(.04,.08,.12),skyline)*(.65+.35*hash12(cell+2.3));
  refl+=vec3(.10,.17,.19)*pow(max(0.,sin(f.x*3.14)),5.)*.45;
  vec3 glass=mix(vec3(.025,.045,.058),refl*.72,.85)*(1.-dead*.6);
  vec3 lamp=mix(vec3(1.,.52,.2),vec3(1.,.72,.38),hash12(cell+4.1));
  float lit=max(warm,cool)*(1.-dead);
  fEmi=pane*lit*mix(lamp,vec3(.5,.74,1.),cool*(1.-warm))*mix(.55,.95,hash12(cell+9.2));
  float blind=step(.73,r)*(.85+.15*sin(v*24.));
  glass*=mix(1.,blind,step(.73,r)*.65);
  float reveal=step(f.x,lo.x+.035)+step(hi.x-.035,f.x)+step(f.y,lo.y+.035)+step(hi.y-.035,f.y);
  glass*=1.-clamp(reveal,0.,1.)*.55;
  col=mix(col,glass,pane);fPane=pane;
  fEmi*=(.15+.85*power)*(1.-step(.8,f.x)*step(f.y,.32)*step(.5,hash12(cell+5.)));
  float slab=smoothstep(.0,.06,f.y)*(1.-smoothstep(.0,.05,f.y-.9));col*=mix(.8,1.,slab);
  float grime=vnoise(vec2(u*.9,v*.5));col*=(.82+.3*grime)*(1.-.2*smoothstep(.55,.9,vnoise(vec2(u*1.7,v*.07)))*(1.-pane));
  float moss=smoothstep(.5,.78,fbm(vec2(u*.25,v*.35)+7.))*(1.-smoothstep(0.,10.,v));
  float vine=step(.8,vnoise(vec2(u*.8,3.)))*(1.-smoothstep(1.,16.,v+vnoise(vec2(u*1.3,5.))*9.));
  col=mix(col,vec3(.018,.05,.014)*(.7+.6*vnoise(vec2(u,v)*3.)),clamp(moss*.8+vine*.55,0.,1.)*(1.-pane*.85));
}
diffuseColor.rgb=col;}`,
    rough: 'roughnessFactor=mix(roughnessFactor,.3,fPane);',
    metal: 'metalnessFactor=mix(metalnessFactor,.25,fPane);',
    emissive: 'totalEmissiveRadiance+=fEmi;',
    after: 'reflectedLight.indirectSpecular*=mix(1.,.12,fPane);',
  });
}

// Ground: paving slabs with joints, cracks, damp patches and grass pushing up, wilder with distance from the avenue.
export function groundMaterial(U) {
  const m = new T.MeshStandardMaterial({ color: '#ffffff', roughness: .9, metalness: 0 });
  return patchMaterial(m, 'meridian-ground', U, {
    pars: 'float gWet;',
    color: `
gWet=0.;
{vec3 wn=normalize(vMWN);if(wn.y>.5){
  vec2 p=vMWP.xz;float wild=clamp(smoothstep(34.,120.,abs(p.x))+smoothstep(98.,170.,abs(p.y-15.))*.8,0.,1.);
  vec2 g=p/2.4,id=floor(g),f=fract(g);float tone=hash12(id)*.16;
  vec3 col=${lin('#838a88')}*(.86+tone);
  col*=.8+.35*fbm(p*.3);
  float edge=min(min(f.x,1.-f.x),min(f.y,1.-f.y));float joint=1.-smoothstep(.0,.03,edge);
  col*=1.-joint*.35;
  float cr=1.-smoothstep(0.,.035,crackLine(p*.28+(vnoise(p*.7)-.5)*.7));cr*=smoothstep(.5,.7,vnoise(p*.05+2.));
  col*=1.-cr*.4;
  float grass=clamp((joint+cr)*(smoothstep(.45,.75,fbm(p*.09+3.))*.8+wild*.9),0.,1.);
  col=mix(col,${lin('#33541f')}*(.7+.8*vnoise(p*4.)),grass);
  float cover=smoothstep(.55,.8,fbm(p*.055+11.))*(.08+wild*1.1);
  col=mix(col,${lin('#2c4a1c')}*(.6+.8*vnoise(p*2.7)),clamp(cover,0.,1.));
  gWet=smoothstep(.62,.7,fbm(p*.11+vec2(5.,9.)))*(1.-wild);col*=1.-gWet*.5;
  diffuseColor.rgb=col;}}`,
    rough: 'roughnessFactor=mix(roughnessFactor,.28,gWet);',
    emissive: 'totalEmissiveRadiance+=uSky*gWet*pow(1.-abs(dot(normalize(vViewPosition),normal)),3.)*.55;',
  });
}

// Asphalt: wear, patch repairs, cracks, oil, and large wet puddles that mirror the sky at a glancing angle.
export function roadMaterial(U) {
  const m = new T.MeshStandardMaterial({ color: '#ffffff', roughness: .95, metalness: 0 });
  return patchMaterial(m, 'meridian-road', U, {
    pars: 'float rWet;',
    color: `
rWet=0.;
{vec3 wn=normalize(vMWN);if(wn.y>.5){
  vec2 p=vMWP.xz;
  vec3 col=${lin('#3d484c')}*(.78+.5*fbm(p*.45));
  col*=.92+.16*vnoise(p*7.);
  vec2 pc=floor(p/vec2(6.5,9.));float rp=step(.84,hash12(pc));vec2 pf=fract(p/vec2(6.5,9.));
  float rect=rp*step(.12,pf.x)*step(pf.x,.88)*step(.1,pf.y)*step(pf.y,.9);col*=1.-rect*.28;
  float wear=exp(-pow((abs(p.x)-5.2)/1.5,2.))*.3;col*=1.-wear*vnoise(p*.6);
  float cr=1.-smoothstep(0.,.04,crackLine(p*.32+(vnoise(p*.8)-.5)*.6));cr*=smoothstep(.45,.65,vnoise(p*.045+7.));
  col*=1.-cr*.6;
  float grass=cr*smoothstep(.5,.75,fbm(p*.2))*.9;col=mix(col,${lin('#315221')},grass);
  float edge=smoothstep(14.,16.4,abs(p.x));col=mix(col,${lin('#2e3a33')},edge*smoothstep(.45,.7,fbm(p*.3))*.5);
  rWet=smoothstep(.57,.65,fbm(p*vec2(.05,.075)+vec2(3.,1.)))*(1.-edge*.4);
  rWet=max(rWet,smoothstep(.8,.9,fbm(p*.5+9.))*.7);
  col*=1.-rWet*.55;
  diffuseColor.rgb=col;}}`,
    rough: 'roughnessFactor=mix(roughnessFactor,.24,rWet);',
    metal: 'metalnessFactor=rWet*.15;',
    after: 'reflectedLight.indirectSpecular*=1.-rWet*.6;',
    emissive: 'totalEmissiveRadiance+=uSky*rWet*(.12+.9*pow(1.-abs(dot(normalize(vViewPosition),normal)),4.))*.7;',
  });
}

// Emissive trim and signs: a per-instance animation code drives flicker, blinking beacons, pulses and the gate lights.
export const ANIM = { still: 0, flicker: 1, beacon: 2, pulse: 3, hazard: 4, chase: 5, gate: 6, strobe: 7 };
export function glowMaterial(U) {
  const m = new T.MeshBasicMaterial({ color: '#ffffff' });
  m.customProgramCacheKey = () => 'meridian-glow';
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { uTime: U.uTime, uDusk: U.uDusk, uGate: U.uGate,uPower:U.uPower });
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAnim;varying float vAnim;varying float vSeed;varying float vZ;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vAnim=aAnim;vSeed=0.;vZ=0.;
#ifdef USE_INSTANCING
vSeed=fract(sin(dot(instanceMatrix[3].xz,vec2(12.9898,78.233)))*43758.5453);vZ=instanceMatrix[3].z;
#endif`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nuniform float uTime;uniform float uDusk;uniform float uGate;uniform vec3 uPower;varying float vAnim;varying float vSeed;varying float vZ;\n${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{float k=1.,a=vAnim,t=uTime;
if(a>.5){
 if(a<1.5){float n=hash12(vec2(floor(t*18.),vSeed*50.)),slow=hash12(vec2(floor(t*.6),vSeed*91.));k=slow>.72?(n>.45?1.:.06):1.;k*=.92+.08*sin(t*47.);}
 else if(a<2.5){k=step(fract(t*.8+vSeed),.16)*1.5+.05;}
 else if(a<3.5){k=.55+.45*sin(t*1.7+vSeed*6.283);}
 else if(a<4.5){k=step(.5,fract(t*.9+vSeed))*.95+.05;}
 else if(a<5.5){k=.2+.8*smoothstep(.45,1.,sin(vZ*.3-t*3.));}
 else if(a<6.5){k=.1+uGate*1.5;}
 else {k=mix(.12,step(.5,fract(t*4.)),step(.02,uGate));}
}
float power=vZ<10.?uPower.x:(vZ<50.?uPower.y:uPower.z);
if(a<1.5)k*=mix(.22,1.,power);
diffuseColor.rgb*=k*(1.+uDusk*.35);}`);
  };
  return m;
}
