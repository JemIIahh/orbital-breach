import * as T from 'three';
import { RADIUS, HALF_WIDTH, stationPosition } from './physics.js';

export function makePortal(scene,position,normal,up=new T.Vector3(0,1,0)){
  const root=new T.Group();root.position.copy(position);root.up.copy(up);root.lookAt(position.clone().add(normal));scene.add(root);
  const metal=new T.MeshStandardMaterial({color:'#24383b',metalness:.88,roughness:.27});
  const rim=new T.Mesh(new T.TorusGeometry(3.25,.24,12,64),metal);root.add(rim);
  const glow=new T.MeshStandardMaterial({color:'#9fffd1',emissive:'#4df2bb',emissiveIntensity:2.1,roughness:.3});
  const lightRing=new T.Mesh(new T.TorusGeometry(2.98,.045,6,80),glow);lightRing.position.z=.04;root.add(lightRing);
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2,clamp=new T.Mesh(new T.BoxGeometry(.48,.6,.5),metal);clamp.position.set(Math.sin(a)*3.25,Math.cos(a)*3.25,0);clamp.rotation.z=-a;root.add(clamp)}
  const uniforms={time:{value:0},open:{value:0},useMap:{value:0},viewMap:{value:null}};
  const field=new T.Mesh(new T.CircleGeometry(2.96,64),new T.ShaderMaterial({uniforms,transparent:true,side:T.DoubleSide,depthWrite:false,
    vertexShader:`varying vec2 uvp;void main(){uvp=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 uvp;uniform float time;uniform float open;uniform float useMap;uniform sampler2D viewMap;void main(){vec2 p=uvp-.5;float r=length(p)*2.;float angle=atan(p.y,p.x);float wave=sin(angle*9.-time*2.+r*18.)*.5+.5;float edge=pow(r,5.);vec3 c=mix(vec3(.015,.07,.10),vec3(.12,.7,.48),wave*.25+edge*.7);vec2 uv=uvp+vec2(sin(p.y*12.+time),cos(p.x*12.+time))*.008;vec3 view=texture2D(viewMap,clamp(uv,0.,1.)).rgb;c=mix(c,view,useMap*open*(1.-edge*.7));c+=vec3(.13,.8,.48)*edge*(.5+open);gl_FragColor=vec4(c,mix(.2,.98,open));}`
  }));field.position.z=.01;root.add(field);
  // A volumetric velocity envelope: fresnel edges, travelling pressure rings,
  // and inward-moving filaments. It needs no scene-copy/refraction pass.
  const bubble=new T.Mesh(new T.SphereGeometry(1,40,24),new T.ShaderMaterial({
    uniforms,transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,
    vertexShader:`varying vec3 p;varying vec3 n;varying vec3 view;uniform float time;uniform float open;
    void main(){p=position;vec3 q=position;float pulse=sin(q.z*18.-time*5.)*.012*open;q*=1.+pulse;
    vec4 w=modelMatrix*vec4(q,1.);n=normalize(normalMatrix*normal);view=-(viewMatrix*w).xyz;
    gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`varying vec3 p;varying vec3 n;varying vec3 view;uniform float time;uniform float open;
    void main(){float f=pow(1.-abs(dot(normalize(n),normalize(view))),2.8);
    float bands=pow(.5+.5*sin(p.z*26.-time*7.),14.);
    float a=atan(p.y,p.x);float threads=pow(.5+.5*sin(a*23.+p.z*8.-time*1.7),26.);
    float wake=(f*.36+bands*.055+threads*.09)*(0.22+open*.78);
    gl_FragColor=vec4(mix(vec3(.12,.4,.45),vec3(.35,1.,.76),open),wake);}`
  }));bubble.name='portal:velocity-envelope';bubble.scale.set(3.02,3.02,2.35);root.add(bubble);
  const seed=new Float32Array(120*3);
  for(let i=0;i<120;i++)seed.set([i/120,((i*73)%120)/120,((i*37)%120)/120],i*3);
  const streakGeo=new T.BufferGeometry();streakGeo.setAttribute('position',new T.BufferAttribute(seed,3));
  const streaks=new T.Points(streakGeo,new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    vertexShader:`uniform float time;uniform float open;varying float alpha;
    void main(){float age=fract(position.x+time*(.19+position.y*.17));float a=position.y*6.283185;
    float r=sqrt(1.-pow(age*2.-1.,2.))*2.92;vec3 p=vec3(cos(a)*r,sin(a)*r,(age-.5)*5.);
    vec4 mv=modelViewMatrix*vec4(p,1.);alpha=sin(age*3.14159)*open*.7;
    gl_PointSize=clamp(30./max(.5,-mv.z),1.,4.);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`varying float alpha;void main(){float a=1.-smoothstep(.1,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(.6,1.,.85,a*alpha);}`
  }));streaks.frustumCulled=false;streaks.name='portal:velocity-filaments';root.add(streaks);
  const target=new T.WebGLRenderTarget(384,384,{type:T.HalfFloatType});
  return {root,bubble,streaks,position:root.position,normal:normal.clone().normalize(),uniforms,target,open:false,
    update(t,unlocked){this.open=unlocked;uniforms.time.value=t;uniforms.open.value=unlocked?1:0;lightRing.rotation.z=t*.1;glow.emissiveIntensity=unlocked?2.4: .45;},
    preview(renderer,otherScene,camera){const previous=renderer.getRenderTarget(),shadow=renderer.shadowMap.needsUpdate;renderer.setRenderTarget(target);renderer.render(otherScene,camera);renderer.setRenderTarget(previous);renderer.shadowMap.needsUpdate=shadow;uniforms.viewMap.value=target.texture;uniforms.useMap.value=1;},
    contains(point){const d=point.clone().sub(root.position),depth=d.dot(this.normal);return Math.abs(depth)<1.4&&d.addScaledVector(this.normal,-depth).length()<2.75;}
  };
}

export function installWindows(scene,glassMesh,panels){
  const brokenWindows=new Set(),windows=new Map(panels.map(p=>[p.key,{...p,health:42,crack:null}]));
  function crack(panel,hit){
    if(panel.crack)return;
    const p=stationPosition(panel.angle,panel.roof?11.25:5.5,panel.roof?0:panel.side*HALF_WIDTH),group=new T.Group();group.position.set(p.x,p.y,p.z);group.rotation.z=panel.angle;if(panel.roof)group.rotateX(-Math.PI/2);
    const local=hit.clone().sub(group.position).applyQuaternion(group.quaternion.clone().invert()),points=[];
    for(let i=0;i<11;i++){
      let last=new T.Vector3(local.x,local.y,0);const angle=i/11*Math.PI*2;
      for(let j=1;j<5;j++){const r=j*.75,next=new T.Vector3(Math.max(-(panel.width||4.1)/2,Math.min((panel.width||4.1)/2,local.x+Math.cos(angle+(Math.random()-.5)*.2)*r)),Math.max(-(panel.height||6.6)/2,Math.min((panel.height||6.6)/2,local.y+Math.sin(angle)*r)),0);points.push(last.x,last.y,last.z,next.x,next.y,next.z);last=next}
    }
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(points,3));group.add(new T.LineSegments(geo,new T.LineBasicMaterial({color:'#d8f9ff',transparent:true,opacity:.8})));scene.add(group);panel.crack=group;
  }
  return {brokenWindows,windows,
    damageWindow(hit,damage,effects){
      const panel=windows.get(hit.key);if(!panel||brokenWindows.has(hit.key))return false;
      panel.health-=damage;const point=new T.Vector3(hit.x,hit.y,hit.z);crack(panel,point);
      if(panel.health>0)return false;
      brokenWindows.add(hit.key);glassMesh.setMatrixAt(panel.index,new T.Matrix4().makeScale(.000001,.000001,.000001));glassMesh.instanceMatrix.needsUpdate=true;
      if(panel.crack){scene.remove(panel.crack);panel.crack.children[0].geometry.dispose();panel.crack.children[0].material.dispose();panel.crack=null}
      const p=stationPosition(panel.angle,panel.roof?11.25:5.5,panel.roof?0:panel.side*HALF_WIDTH),normal=panel.roof?new T.Vector3(-Math.sin(panel.angle),Math.cos(panel.angle),0):new T.Vector3(0,0,panel.side);effects?.glassShatter?.(new T.Vector3(p.x,p.y,p.z),normal,panel.angle);return true;
    },
    restoreWindows(){for(const panel of windows.values()){panel.health=42;glassMesh.setMatrixAt(panel.index,panel.matrix);if(panel.crack){scene.remove(panel.crack);panel.crack.children[0].geometry.dispose();panel.crack.children[0].material.dispose();panel.crack=null}}brokenWindows.clear();glassMesh.instanceMatrix.needsUpdate=true;}
  };
}

export function makeCell(scene,position,up){
  const root=new T.Group();root.position.copy(position).addScaledVector(up,1.4);root.up.copy(up);root.lookAt(root.position.clone().add(up));
  const material=new T.MeshStandardMaterial({color:'#c9ffae',emissive:'#77ff8e',emissiveIntensity:2,metalness:.5,roughness:.25});
  root.add(new T.Mesh(new T.OctahedronGeometry(.36),material));const ring=new T.Mesh(new T.TorusGeometry(.65,.025,6,32),material);root.add(ring);scene.add(root);
  return {root,position:root.position.clone(),up:up.clone(),update(t){root.rotation.z=t;root.position.copy(this.position).addScaledVector(this.up,Math.sin(t*2)*.16)},dispose(){scene.remove(root);root.traverse(o=>{if(o.isMesh)o.geometry.dispose()});material.dispose()}};
}
export function makeTether(scene){
  const root=new T.Group(),material=new T.MeshStandardMaterial({color:'#526774',metalness:.35,roughness:.72});
  // Thin segmented cable: a little slack during launch, taut during the pull.
  const segments=24,cable=new T.InstancedMesh(new T.CylinderGeometry(.014,.014,1,6),material,segments),dummy=new T.Object3D();
  cable.instanceMatrix.setUsage(T.DynamicDrawUsage);cable.frustumCulled=false;root.add(cable);
  const hook=new T.Group();hook.add(new T.Mesh(new T.ConeGeometry(.1,.28,8),material));
  for(let i=0;i<3;i++){const claw=new T.Mesh(new T.BoxGeometry(.045,.22,.05),material);claw.position.set(Math.cos(i/3*Math.PI*2)*.1,-.08,Math.sin(i/3*Math.PI*2)*.1);claw.rotation.z=.5;hook.add(claw)}
  root.add(hook);root.visible=false;scene.add(root);
  const axis=new T.Vector3(0,1,0),last=new T.Vector3(),point=new T.Vector3(),delta=new T.Vector3(),step=new T.Vector3();
  return{root,cable,hook,update(origin,grapple,up=axis){
    root.visible=grapple.mode!=='idle';if(!root.visible)return;
    const tip=grapple.tip||grapple.hit.point;delta.subVectors(tip,origin);
    const slack=grapple.mode==='flying'?Math.min(.5,delta.length()*.012):.025;
    last.copy(origin);
    for(let i=0;i<segments;i++){
      const t=(i+1)/segments;point.copy(origin).addScaledVector(delta,t).addScaledVector(up,-Math.sin(t*Math.PI)*slack);
      step.subVectors(point,last);const length=step.length();dummy.position.copy(last).addScaledVector(step,.5);
      dummy.scale.set(1,Math.max(length,.0001),1);if(length>.0001)dummy.quaternion.setFromUnitVectors(axis,step.divideScalar(length));
      dummy.updateMatrix();cable.setMatrixAt(i,dummy.matrix);last.copy(point);
    }
    cable.instanceMatrix.needsUpdate=true;hook.position.copy(tip);hook.quaternion.copy(dummy.quaternion);
  }};
}
