// Things that move in Meridian: drifting dust, ash and paper, venting steam, smoke from burnt wrecks, and the radar
// dishes on the rooftops. Particles are animated entirely on the GPU from a time uniform, so update() stays cheap.
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLSL_NOISE } from './city-shaders.js';
import { hash } from './city-layout.js';

export function makeCityLife(U, ctx) {
  const group = new T.Group(); group.name = 'city-life';

  // Dust, ash flakes and paper scraps wrap around the pilot so the air is never empty.
  const N = 640, seeds = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { seeds[i * 4] = hash(i * 3.1); seeds[i * 4 + 1] = hash(i * 5.7 + 1); seeds[i * 4 + 2] = hash(i * 7.3 + 2); seeds[i * 4 + 3] = hash(i * 11.9 + 3); }
  const dustGeometry = new T.BufferGeometry();
  dustGeometry.setAttribute('position', new T.BufferAttribute(new Float32Array(N * 3), 3)); dustGeometry.setAttribute('aSeed', new T.BufferAttribute(seeds, 4));
  const dustU = { uTime: U.uTime, uCenter: { value: new T.Vector3() }, uBase: { value: .3 }, uScale: { value: 560 } };
  const dust = new T.Points(dustGeometry, new T.ShaderMaterial({
    uniforms: dustU, transparent: true, depthWrite: false,
    vertexShader: `uniform float uTime;uniform vec3 uCenter;uniform float uBase;uniform float uScale;attribute vec4 aSeed;varying float vA;varying float vK;
void main(){float k=aSeed.w;vK=k;vec3 p=aSeed.xyz*vec3(80.,26.,80.);float spd=.4+fract(k*7.)*.9;
p.x+=uTime*spd*.8;p.z+=uTime*spd*.35;p.y-=uTime*(.15+fract(k*3.)*.4)*(k>.85?2.:1.);
p.x+=sin(uTime*.6+aSeed.y*40.)*1.1;p.z+=cos(uTime*.5+aSeed.x*40.)*1.1;p.y+=sin(uTime*.9+k*30.)*.3;
vec3 q=vec3(mod(p.x-uCenter.x+40.,80.)-40.,mod(p.y,26.),mod(p.z-uCenter.z+40.,80.)-40.);
vec4 mv=viewMatrix*vec4(uCenter.x+q.x,uBase+q.y,uCenter.z+q.z,1.);float size=k>.85?.17:(k>.6?.07:.05);
gl_PointSize=clamp(size*uScale/max(-mv.z,.5),1.5,13.);vA=(1.-smoothstep(24.,40.,length(q.xz)))*smoothstep(0.,1.5,q.y)*(1.-smoothstep(20.,26.,q.y));gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform float uTime;varying float vA;varying float vK;
void main(){vec2 c=gl_PointCoord-.5;float r=length(c),alpha;vec3 col;
if(vK>.85){float a=vK*40.+uTime*(.6+vK*2.);vec2 q=mat2(cos(a),-sin(a),sin(a),cos(a))*c;alpha=step(abs(q.x),.34)*step(abs(q.y),.22)*.8;col=vec3(.62,.6,.55);}
else if(vK>.6){alpha=smoothstep(.5,.15,r)*.6;col=vec3(.05,.045,.045);}
else{alpha=smoothstep(.5,0.,r)*.4;col=vec3(.62,.55,.45);}
if(alpha*vA<.01)discard;gl_FragColor=vec4(col,alpha*vA);}`,
  }));
  dust.frustumCulled = false; dust.renderOrder = 5; group.add(dust);

  // Steam and smoke: camera-facing puffs that rise, swell and fade in world units.
  const puffs = [];
  for (const v of ctx.vents) for (let i = 0; i < (v.kind === 'smoke' ? 16 : 12); i++) puffs.push([v, i]);
  let plumes = null;
  if (puffs.length) {
    const quad = new T.PlaneGeometry(1, 1), geometry = new T.InstancedBufferGeometry();
    geometry.index = quad.index; geometry.setAttribute('position', quad.getAttribute('position')); geometry.setAttribute('uv', quad.getAttribute('uv'));
    const base = new Float32Array(puffs.length * 3), param = new Float32Array(puffs.length * 4);
    puffs.forEach(([v, i], j) => {
      base.set([v.x, v.y, v.z], j * 3);
      const per = v.kind === 'smoke' ? 16 : 12;
      param.set([i / per + hash(j) * .04, v.kind === 'smoke' ? .09 + hash(j + 4) * .02 : .2 + hash(j + 2) * .06, v.kind === 'smoke' ? 1 : 0, hash(j * 3 + 1)], j * 4);
    });
    geometry.setAttribute('aVent', new T.InstancedBufferAttribute(base, 3)); geometry.setAttribute('aP', new T.InstancedBufferAttribute(param, 4));
    geometry.instanceCount = puffs.length;
    plumes = new T.Mesh(geometry, new T.ShaderMaterial({
      uniforms: { uTime: U.uTime }, transparent: true, depthWrite: false,
      vertexShader: `uniform float uTime;attribute vec3 aVent;attribute vec4 aP;varying vec2 vUv;varying float vAlpha;varying float vKind;
void main(){float kind=aP.z;float life=fract(uTime*aP.y+aP.x);vKind=kind;
float burst=kind>.5?1.:smoothstep(.1,.55,sin(uTime*.45+aVent.x*3.1+aVent.z*1.3)*.5+.5);
float size=kind>.5?.9+life*3.8:.55+life*2.9;float h=kind>.5?10.:6.;
vec3 pos=aVent+vec3(sin(aP.w*40.+life*5.)*.3*life+life*life*(kind>.5?3.:1.6),life*h*(.3+.7*sqrt(life)),cos(aP.w*30.+life*4.)*.3*life+life*life*(kind>.5?1.2:.6));
vAlpha=sin(life*3.14159)*(kind>.5?.55:.32)*burst;vec4 mv=viewMatrix*vec4(pos,1.);mv.xy+=position.xy*size;vUv=uv;gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `varying vec2 vUv;varying float vAlpha;varying float vKind;${GLSL_NOISE}
void main(){vec2 c=vUv-.5;float r=length(c)*2.;float a=smoothstep(1.,.15,r)*(.65+.5*vnoise(vUv*5.+vKind*3.));a*=vAlpha;if(a<.008)discard;
vec3 col=vKind>.5?vec3(.045,.045,.05):vec3(.62,.64,.64);gl_FragColor=vec4(col,a);}`,
    }));
    plumes.frustumCulled = false; plumes.renderOrder = 4; group.add(plumes);
  }

  // Radar dishes turn slowly on the roofs: one merged mesh each, so a dish is a single draw call.
  const bowl = new T.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI * .36); bowl.rotateX(Math.PI / 2); bowl.translate(0, 0, .2);
  const feed = new T.CylinderGeometry(.045, .045, 1.4, 5); feed.rotateX(Math.PI / 2); feed.translate(0, 0, .8);
  const horn = new T.BoxGeometry(.2, .2, .22); horn.translate(0, 0, 1.55);
  const dishGeometry = mergeGeometries([bowl, feed, horn]); dishGeometry.rotateX(-.5);
  const dishMaterial = new T.MeshStandardMaterial({ color: '#c3c9cb', roughness: .5, metalness: .35, side: T.DoubleSide });
  const dishes = ctx.dishes.map((d, i) => {
    const pivot = new T.Group(); pivot.position.set(d.x, d.y, d.z); pivot.scale.setScalar(d.s * 1.2);
    const mesh = new T.Mesh(dishGeometry, dishMaterial); mesh.castShadow = true; pivot.add(mesh); pivot.userData.phase = i * 1.7; group.add(pivot); return pivot;
  });

  return {
    group, dishes, dust, plumes,
    update(t, center) {
      if (center) { dustU.uCenter.value.set(center.x, center.y, center.z); dustU.uBase.value = Math.max(.3, center.y - 8); }
      dustU.uScale.value = (typeof innerHeight === 'number' ? innerHeight : 900) * .64;
      for (const pivot of dishes) pivot.rotation.y = t * .55 + pivot.userData.phase;
    },
  };
}
