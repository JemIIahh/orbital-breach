// The Meridian sky: a hazy golden-hour gradient with a low sun, two drifting cloud decks and three layers of distant
// skyline silhouettes, all in one fragment shader on a dome. No textures, one draw call, and dusk is a single uniform.
import * as T from 'three';
import { GLSL_NOISE } from './city-shaders.js';

// The game keeps the sun at this offset from the pilot, so the sky disc is drawn in the same direction.
export const SUN_DIRECTION = new T.Vector3(-35, 65, -65).normalize();

export function makeSky(U) {
  const uniforms = { uTime: U.uTime, uDusk: U.uDusk, uSky: U.uSky, uSun: { value: SUN_DIRECTION.clone() } };
  const material = new T.ShaderMaterial({
    uniforms, side: T.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 vDir;uniform float uTime;uniform float uDusk;uniform vec3 uSun;uniform vec3 uSky;
${GLSL_NOISE}
float skylineLayer(float az,float y,float cells,float base,float range,float seed){
  float a=(az+3.14159)/6.28318*cells,id=floor(a),fx=fract(a);
  float h=base+pow(hash12(vec2(id,seed)),2.2)*range;
  float crown=step(.3,fx)*step(fx,.7)*step(.55,hash12(vec2(id,seed+9.)))*range*.22;
  float spike=step(abs(fx-.5),.03)*step(.8,hash12(vec2(id,seed+4.)))*range*.35;
  float gap=step(hash12(vec2(id,seed+7.)),.07);
  return step(y,(h+crown+spike)*(1.-gap));
}
void main(){
  vec3 d=normalize(vDir);float y=d.y;
  vec3 hor=uSky;
  vec3 mid=mix(vec3(.46,.58,.72),vec3(.20,.20,.34),uDusk),top=mix(vec3(.20,.34,.58),vec3(.05,.07,.18),uDusk);
  vec3 c=mix(hor,mid,smoothstep(0.,.28,y));c=mix(c,top,smoothstep(.2,.95,y));
  float sunAz=max(0.,dot(normalize(d.xz+1e-4),normalize(uSun.xz)));
  c+=vec3(.20,.10,.03)*pow(sunAz,3.)*(1.-smoothstep(0.,.35,y))*(1.-uDusk*.4);
  float s=max(0.,dot(d,uSun));
  c+=vec3(1.,.70,.40)*(pow(s,900.)*4.+pow(s,60.)*.35+pow(s,7.)*.14)*(1.-uDusk*.35);
  // cloud decks
  if(y>.015){
    vec2 uv=d.xz/(y+.22);
    for(int i=0;i<2;i++){
      float fi=float(i);vec2 p=uv*(.55+fi*.5)+vec2(uTime*(.006+fi*.004),uTime*.002*(1.+fi))+fi*13.;
      float dens=fbm(p*1.7);float cover=smoothstep(.48-.04*fi,.78,dens+.12*fbm(p*5.)-.06);
      float lit=clamp((dens-fbm(p*1.7+uSun.xz*.22))*4.+.5,0.,1.);
      vec3 shade=mix(vec3(.42,.43,.50),vec3(.10,.09,.16),uDusk),bright=mix(vec3(1.,.86,.70),vec3(.95,.45,.32),uDusk);
      vec3 cc=mix(shade,bright,lit)*(.85+.15*fi);cc=mix(cc,hor*1.1,1.-smoothstep(.03,.4,y));
      c=mix(c,cc,cover*smoothstep(.015,.14,y)*(.9-fi*.25));
    }
  }
  // distant skyline: three layers, nearest darkest, fading into the haze at the bottom
  float az=atan(d.x,d.z);
  if(y<.3){
    for(int i=0;i<3;i++){
      float fi=float(i);float cells=mix(70.,34.,fi/2.);
      float m=skylineLayer(az,y,cells,.012+fi*.012,.05+fi*.035,fi*31.+3.);
      vec3 col=mix(mix(vec3(.50,.50,.54),vec3(.30,.31,.38),fi*.5),mix(vec3(.26,.18,.20),vec3(.10,.07,.12),fi*.5),uDusk);
      col=mix(col,hor,(1.-smoothstep(0.,.07+fi*.02,y))*.8);
      float lights=step(.9,hash12(floor(vec2(az*cells*9.,y*190.))+fi*7.))*step(.4,fi)*smoothstep(.02,.07,y)*(.3+uDusk*1.);
      col+=vec3(1.,.72,.42)*lights*.55;
      c=mix(c,col,m*(.9-fi*.04));
    }
  }
  if(y<0.)c=mix(hor,hor*.92,smoothstep(0.,-.2,y));
  gl_FragColor=vec4(c,1.);
}`,
  });
  const mesh = new T.Mesh(new T.SphereGeometry(1900, 32, 20), material);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  return { mesh, uniforms, material };
}
