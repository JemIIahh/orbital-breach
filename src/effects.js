import * as T from 'three';
import { glowTexture } from './world.js';
import { planImpact, muzzleStyle } from './impacts.js';
import { PALETTE } from './hit-feel.js';
import { RADIUS, HALF_WIDTH } from './station-constants.js';

const Z_AXIS = new T.Vector3(0, 0, 1), Y_AXIS = new T.Vector3(0, 1, 0), HOT = new T.Color('#ff9a40');
const DECAL_LIFE = 26, DECAL_FADE = 3.5, CASING_CAP = 40, DECAL_CAP = 96, PUFF_CAP = 40, STREAK_CAP = 320;
const _g = new T.Vector3(), _n = new T.Vector3(), _v = new T.Vector3(), _o = new T.Vector3(), _dir = new T.Vector3(), _q = new T.Quaternion(), _c = new T.Color();

export class Effects {
  constructor(scene) {
    this.scene=scene;this.traces=[];this.particles=[];this.debris=[];this.rings=[];this.lightIndex=0;
    this.tracerGeometry=new T.CylinderGeometry(.018,.018,1,5);
    this.traceMaterials=new Map();
    this.sparkGeometry=new T.IcosahedronGeometry(1,0);
    this.sparkMaterial=new T.MeshBasicMaterial({vertexColors:false,toneMapped:false});
    this.sparks=new T.InstancedMesh(this.sparkGeometry,this.sparkMaterial,500);
    this.sparks.instanceMatrix.setUsage(T.DynamicDrawUsage);this.sparks.frustumCulled=false;scene.add(this.sparks);
    this.dummy=new T.Object3D();this.sparks.count=0;
    this.debrisGeometry=new T.BoxGeometry(1,1,1);
    this.debrisMaterial=new T.MeshStandardMaterial({color:'#6c818b',metalness:.8,roughness:.35});
    this.glowMap=glowTexture();
    this.glassGeometry=new T.BufferGeometry();this.glassGeometry.setAttribute('position',new T.Float32BufferAttribute([-.5,-.4,0,.5,-.3,0,.1,.55,0],3));this.glassGeometry.computeVertexNormals();
    this.glassMaterial=new T.MeshStandardMaterial({color:'#b5dce3',metalness:.45,roughness:.16,transparent:true,opacity:.62,side:T.DoubleSide,depthWrite:false});
    this.boltGeometry=new T.CylinderGeometry(1,.07,1,6); // thick head (+y, the direction of travel) tapering to a thin tail
    this.boltMaterial=new T.MeshBasicMaterial({color:new T.Color(2.4,2.4,2.4),toneMapped:false});
    this.bolts=new T.InstancedMesh(this.boltGeometry,this.boltMaterial,180);this.bolts.instanceMatrix.setUsage(T.DynamicDrawUsage);this.bolts.frustumCulled=false;this.bolts.count=0;scene.add(this.bolts);
    this.boltHeads=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),this.boltMaterial,180);this.boltHeads.instanceMatrix.setUsage(T.DynamicDrawUsage);this.boltHeads.frustumCulled=false;this.boltHeads.count=0;scene.add(this.boltHeads);
    this.haloMaterial=new T.MeshBasicMaterial({color:new T.Color(1.5,1.5,1.5),transparent:true,opacity:.24,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false});
    this.boltHalos=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),this.haloMaterial,180);this.boltHalos.instanceMatrix.setUsage(T.DynamicDrawUsage);this.boltHalos.frustumCulled=false;this.boltHalos.count=0;scene.add(this.boltHalos);
    this.boltDir=new T.Vector3();this.boltUp=new T.Vector3(0,1,0);this.boltColors=new Map();
    this.flashes=Array.from({length:12},()=>{const sprite=new T.Sprite(new T.SpriteMaterial({map:this.glowMap,color:'#ffb070',blending:T.AdditiveBlending,depthWrite:false,transparent:true,opacity:0}));sprite.visible=false;scene.add(sprite);return{sprite,life:0,max:.1,size:1}});this.flashIndex=0;
    this.ringGeometry=new T.TorusGeometry(1,.035,6,40);
    this.fireGeometry=new T.IcosahedronGeometry(1,1);
    this.lights=Array.from({length:2},()=>{const light=new T.PointLight('#ffac64',0,18,2);scene.add(light);return{light,life:0}});
    // Debris falls: the world sets `ground` (x,z -> height) so chips and casings bounce, and `radialGravity` inside the station.
    this.gravity=new T.Vector3(0,-9.8,0);this.radialGravity=false;this.ground=null;
    // Dust and smoke puffs: pooled soft sprites that swell and fade.
    this.puffs=Array.from({length:PUFF_CAP},()=>{const sprite=new T.Sprite(new T.SpriteMaterial({map:this.glowMap,color:'#8c7757',depthWrite:false,transparent:true,opacity:0}));sprite.visible=false;scene.add(sprite);return{sprite,life:0,max:.6,size:1,alpha:.4,velocity:new T.Vector3()}});this.puffIndex=0;
    // Scorch marks: one instanced mesh used as a ring buffer; hot for a moment, then dark, then shrinking away.
    this.decals=new T.InstancedMesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:this.glowMap,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4,toneMapped:false}),DECAL_CAP);
    this.decals.instanceMatrix.setUsage(T.DynamicDrawUsage);this.decals.frustumCulled=false;this.decals.count=0;scene.add(this.decals);this.decalData=[];this.decalNext=0;
    // Spent casings: tiny brass bodies that tumble, bounce and vanish.
    this.casings=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({color:'#c9a24a',metalness:.85,roughness:.35}),CASING_CAP);
    this.casings.instanceMatrix.setUsage(T.DynamicDrawUsage);this.casings.frustumCulled=false;this.casings.count=0;scene.add(this.casings);this.casingData=[];this.casingNext=0;
    // Streak sparks: thin hot slivers stretched along their velocity, head fat and tail thin. Additive and HDR (colours above 1),
    // so they glow through the bloom pass and fade simply by cooling to black. One ring-buffered instanced mesh: nothing is
    // allocated after warm-up, however fast the pilot fires.
    this.streaks=new T.InstancedMesh(new T.CylinderGeometry(1,.12,1,4,1),new T.MeshBasicMaterial({color:0xffffff,transparent:true,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false,fog:false}),STREAK_CAP);
    this.streaks.instanceMatrix.setUsage(T.DynamicDrawUsage);this.streaks.frustumCulled=false;this.streaks.count=0;scene.add(this.streaks);this.streakData=[];this.streakNext=0;
  }
  // Keep a falling bit of debris above the floor. Outdoors the floor is the terrain; in the station it is the curved promenade
  // (only within its width: beyond that there is open space). Returns true when it landed or bounced.
  collideFloor(position,velocity,size,bounce){
    if(this.radialGravity){
      const r=Math.hypot(position.x,position.y),floor=RADIUS-size;
      if(r<=floor||Math.abs(position.z)>HALF_WIDTH)return false;
      const nx=position.x/r,ny=position.y/r,vn=velocity.x*nx+velocity.y*ny;
      position.x=nx*floor;position.y=ny*floor;
      if(vn>0){velocity.x-=nx*vn*(1+bounce);velocity.y-=ny*vn*(1+bounce)}
      velocity.z*=.7;return true;
    }
    if(!this.ground)return false;
    const floor=this.ground(position.x,position.z)+size;
    if(position.y>=floor)return false;
    position.y=floor;if(velocity.y<0)velocity.y*=-bounce;velocity.x*=.7;velocity.z*=.7;return true;
  }
  gravityAt(position,out){return this.radialGravity?out.set(position.x,position.y,0).normalize().multiplyScalar(9.8):out.copy(this.gravity)}
  // A random unit-ish direction in a cone around `normal`, scaled to a random speed up to `speed`.
  spray(normal,speed,spread,out=new T.Vector3()){
    out.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(spread).add(normal).normalize();
    return out.multiplyScalar(speed*(.45+Math.random()*.7));
  }
  puff(position,hex,size,velocity,life=.6,alpha=.4){
    const f=this.puffs[this.puffIndex++%PUFF_CAP];f.sprite.position.copy(position);f.sprite.material.color.set(hex);f.sprite.material.opacity=alpha;f.sprite.visible=true;
    f.life=f.max=life;f.size=size;f.alpha=alpha;f.velocity.copy(velocity);f.sprite.scale.setScalar(size);
  }
  addDecal(point,normal,decal,hot=false){
    if(!decal)return;
    const i=this.decalNext++%DECAL_CAP,d=this.decalData[i]||(this.decalData[i]={pos:new T.Vector3(),quat:new T.Quaternion(),size:0,age:0,base:new T.Color(),hot:false,live:false});
    d.pos.copy(point).addScaledVector(normal,.03);d.quat.setFromUnitVectors(Z_AXIS,normal).multiply(_q.setFromAxisAngle(Z_AXIS,Math.random()*6.28));
    d.size=decal.size*(.85+Math.random()*.3);d.age=0;d.base.set(decal.color);d.hot=hot;d.live=true;
    this.decals.count=Math.min(this.decalNext,DECAL_CAP);this.writeDecal(i,1);this.decals.setColorAt(i,hot?HOT:d.base);this.decals.instanceColor.needsUpdate=true;
  }
  writeDecal(i,scale){const d=this.decalData[i];this.dummy.position.copy(d.pos);this.dummy.quaternion.copy(d.quat);this.dummy.scale.set(d.size*scale,d.size*scale,1);this.dummy.updateMatrix();this.decals.setMatrixAt(i,this.dummy.matrix);this.decals.instanceMatrix.needsUpdate=true}
  casing(position,side,up,forward,big=false){
    const i=this.casingNext++%CASING_CAP,c=this.casingData[i]||(this.casingData[i]={pos:new T.Vector3(),vel:new T.Vector3(),quat:new T.Quaternion(),spin:new T.Vector3(),life:0,size:new T.Vector3(),live:false});
    c.pos.copy(position);c.vel.copy(side).multiplyScalar(2.2+Math.random()*1.6).addScaledVector(up,1.6+Math.random()*1.4).addScaledVector(forward,-.5+Math.random()*1.0);
    c.quat.setFromEuler(new T.Euler(Math.random()*6,Math.random()*6,Math.random()*6));c.spin.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(30);
    c.life=1.9;c.live=true;big?c.size.set(.07,.07,.2):c.size.set(.035,.035,.11);this.casings.count=Math.min(this.casingNext,CASING_CAP);
  }
  // Muzzle blast for the pilot's own guns: flash plus the brief light, smoke for the heavy ones, and a casing for the kinetic ones.
  gunfire(muzzle,{dir,right,up,side=1},model){
    const s=muzzleStyle(model);this.muzzleFlash(muzzle,s.flash,s.size,true);
    if(s.smoke)this.puff(_n.copy(muzzle).addScaledVector(dir,.4),'#d5d0c6',s.size*.9,_v.copy(dir).multiplyScalar(2.2).addScaledVector(up,.7),.55,.28);
    if(s.casing)this.casing(_n.copy(muzzle).addScaledVector(dir,-1),_v.copy(right).multiplyScalar(side),up,dir,s.casing==='shell');
  }
  // A round hits the world. Returns the plan so the caller can play its sound.
  impact(point,normal,material,{dir=null,power=1,color='#b8f3ff'}={}){
    const plan=planImpact(material,normal,dir,{power}),n=plan.normal,lit=new T.Color(color),hotSpark=new T.Color('#ffd27a');
    const origin=_n.copy(point).addScaledVector(n,.04).clone();
    for(let i=0;i<plan.sparks&&this.particles.length<500;i++){
      const aimed=plan.reflected&&i<5,velocity=aimed?plan.reflected.clone().multiplyScalar(10+Math.random()*14).add(new T.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(2.5)):this.spray(n,plan.hard?11:7,1.5);
      this.particles.push({position:origin.clone(),velocity,life:.16+Math.random()*.34,max:.5,size:.018+Math.random()*.03,color:plan.hard&&i%2?hotSpark:lit,g:.6,drag:1.4});
    }
    for(let i=0;i<plan.chips&&this.particles.length<500;i++){
      this.particles.push({position:origin.clone(),velocity:this.spray(n,plan.material==='water'?6:5,plan.material==='water'?.6:1.3).addScaledVector(plan.material==='water'?new T.Vector3(0,1,0):n,plan.material==='water'?4:0),life:.45+Math.random()*.7,max:1.1,size:.03+Math.random()*.05,color:new T.Color(plan.debris[i%plan.debris.length]),g:1,drag:.7,bounce:.35});
    }
    if(plan.dust)for(let i=0;i<plan.puffs;i++)this.puff(origin,plan.dust,.5+Math.random()*.5+power*.12,this.spray(n,1.6,1.2).addScaledVector(new T.Vector3(0,1,0),.8),.5+Math.random()*.3,plan.material==='water'?.5:.4);
    this.muzzleFlash(origin,color,.3+Math.min(power,2)*.12,false);
    if(plan.ricochet)this.trace(origin,origin.clone().addScaledVector(plan.reflected,1.4+Math.random()*1.2),'#ffe2a8',.02,.07);
    this.addDecal(point,n,plan.decal,plan.hard);
    return plan;
  }
  trace(a,b,hex='#94f6ff',width=.018,life=.09){
    if(this.traces.length>100){const old=this.traces.shift();this.scene.remove(old.mesh)}
    if(!this.traceMaterials.has(hex))this.traceMaterials.set(hex,new T.MeshBasicMaterial({color:hex,toneMapped:false}));
    const mesh=new T.Mesh(this.tracerGeometry,this.traceMaterials.get(hex));
    const delta=new T.Vector3().subVectors(b,a);mesh.position.copy(a).addScaledVector(delta,.5);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.clone().normalize());
    mesh.scale.set(width/.018,delta.length(),width/.018);this.scene.add(mesh);this.traces.push({mesh,life,max:life});
  }
  burst(position,hex='#ffc287',count=15,power=4){
    const c=new T.Color(hex);
    for(let i=0;i<count&&this.particles.length<500;i++)this.particles.push({
      position:position.clone(),velocity:new T.Vector3((Math.random()-.5)*power,(Math.random()-.5)*power,(Math.random()-.5)*power),life:.25+Math.random()*.6,max:.85,size:.025+Math.random()*.055,color:c
    });
  }
  explosion(position,size=1){
    this.onExplosion?.(position,size); // lets the game turn a nearby blast into a shockwave the pilot feels (sensation.js)
    this.burst(position,'#ffc372',45,13*size);
    this.burst(position,'#c4eeff',15,8*size);
    this.sparkShower(position,Y_AXIS,{count:Math.round(26*size),speed:15*size,spread:6,life:.5,width:.026,g:.7,drag:1.2});
    this.embers(position,Y_AXIS,Math.round(8*size),{speed:3});
    const sprite=new T.Sprite(new T.SpriteMaterial({map:this.glowMap,color:'#ff8f3f',blending:T.AdditiveBlending,depthWrite:false,transparent:true}));
    sprite.material.color.setRGB(5,2.2,.7);sprite.position.copy(position);sprite.scale.setScalar(5*size);this.scene.add(sprite);this.traces.push({mesh:sprite,life:.25,max:.25,disposeMaterial:true});
    const slot=this.lights[this.lightIndex++%this.lights.length];slot.light.position.copy(position);slot.light.intensity=70*size;slot.life=.3;
    const fire=new T.Mesh(this.fireGeometry,new T.MeshBasicMaterial({color:'#ffa94f',transparent:true,opacity:.8,toneMapped:false}));fire.position.copy(position);this.scene.add(fire);this.rings.push({mesh:fire,life:.35,max:.35,size:size*2,fire:true});
    for(let i=0;i<2;i++){
      const ring=new T.Mesh(this.ringGeometry,new T.MeshBasicMaterial({color:i?'#ffd4a2':'#95edff',transparent:true,opacity:.9,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));
      ring.position.copy(position);ring.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,0);this.scene.add(ring);this.rings.push({mesh:ring,life:.55,max:.55,size:size*4});
    }
    for(let i=0;i<8&&this.debris.length<40;i++){
      const mesh=new T.Mesh(this.debrisGeometry,this.debrisMaterial);mesh.position.copy(position);mesh.scale.set(.1+Math.random()*.3,.1+Math.random()*.5,.1+Math.random()*.3);this.scene.add(mesh);
      this.debris.push({mesh,velocity:new T.Vector3((Math.random()-.5)*12,(Math.random()-.5)*12,(Math.random()-.5)*12),life:2+Math.random()*2});
    }
  }
  shieldHit(position,normal){
    const ring=new T.Mesh(this.ringGeometry,new T.MeshBasicMaterial({color:'#73eaff',transparent:true,opacity:.8,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));
    ring.position.copy(position);ring.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal.clone().normalize());this.scene.add(ring);this.rings.push({mesh:ring,life:.25,max:.25,size:1.0});
  }
  breakMech(bot){
    bot.group.updateMatrixWorld(true);
    const pieces=bot.parts.filter(part=>part.userData.part==='head'||part.userData.part==='core'||part.userData.part==='arm');
    for(let i=0;i<Math.min(pieces.length,7)&&this.debris.length<55;i++){
      const source=pieces[Math.floor(i*pieces.length/7)],mesh=new T.Mesh(source.geometry,source.material);
      source.matrixWorld.decompose(mesh.position,mesh.quaternion,mesh.scale);mesh.scale.multiplyScalar(.8);this.scene.add(mesh);
      this.debris.push({mesh,velocity:new T.Vector3((Math.random()-.5)*11,(Math.random()-.5)*11,(Math.random()-.5)*11),life:2+Math.random()*2});
    }
  }
  glassShatter(center,normal,angle=0){
    const orientation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),normal.clone().normalize());
    this.burst(center,'#d9ffff',28,10);
    for(let i=0;i<38&&this.debris.length<190;i++){
      const mesh=new T.Mesh(this.glassGeometry,this.glassMaterial),offset=new T.Vector3((Math.random()-.5)*4.1,(Math.random()-.5)*6.5,0).applyQuaternion(orientation);
      mesh.position.copy(center).add(offset);mesh.rotation.set(Math.random(),Math.random(),Math.random()*6);mesh.scale.setScalar(.25+Math.random()*.65);this.scene.add(mesh);
      this.debris.push({mesh,velocity:offset.multiplyScalar(.7).addScaledVector(normal,5+Math.random()*9),life:2.2+Math.random()*2});
    }
  }
  boltColor(hex){let c=this.boltColors.get(hex);if(!c){c=new T.Color(hex);this.boltColors.set(hex,c)}return c}
  // Enemy rounds are fat, long and haloed so they read as incoming fire from across the arena; the pilot's own stay slim.
  renderBolts(bullets,eye){
    const count=Math.min(bullets.length,180),up=this.boltUp,dir=this.boltDir;this.bolts.count=this.boltHeads.count=this.boltHalos.count=count;
    for(let i=0;i<count;i++){
      const b=bullets[i],enemy=b.owner==='enemy',near=eye?Math.min(1,Math.max(.18,b.position.distanceTo(eye)/9)):1;dir.copy(b.velocity).normalize();
      const length=enemy?(b.kind==='snipe'?5.2:b.kind==='blast'?3.4:3):b.weapon===1?.65:1.75,radius=enemy?(b.kind==='snipe'?.13:b.kind==='blast'?.21:.125):b.weapon===1?.045:.04;
      this.dummy.position.copy(b.position).addScaledVector(dir,-length*.5);this.dummy.quaternion.setFromUnitVectors(up,dir);this.dummy.scale.set(radius,length,radius);this.dummy.updateMatrix();this.bolts.setMatrixAt(i,this.dummy.matrix);
      const c=this.boltColor(enemy?(b.color||'#ff8b50'):b.weapon===1?'#ffd694':'#98f6ff');this.bolts.setColorAt(i,c);
      this.dummy.position.copy(b.position);this.dummy.scale.setScalar(radius*(enemy?2.4:1.8)*(.6+.4*near));this.dummy.updateMatrix();this.boltHeads.setMatrixAt(i,this.dummy.matrix);this.boltHeads.setColorAt(i,c);
      this.dummy.scale.setScalar(radius*(enemy?6:4)*near);this.dummy.updateMatrix();this.boltHalos.setMatrixAt(i,this.dummy.matrix);this.boltHalos.setColorAt(i,c);
    }
    this.bolts.instanceMatrix.needsUpdate=this.boltHeads.instanceMatrix.needsUpdate=this.boltHalos.instanceMatrix.needsUpdate=true;
    if(this.bolts.instanceColor)this.bolts.instanceColor.needsUpdate=true;if(this.boltHeads.instanceColor)this.boltHeads.instanceColor.needsUpdate=true;if(this.boltHalos.instanceColor)this.boltHalos.instanceColor.needsUpdate=true;
  }
  // A hot flash plus (optionally) a brief point light: muzzle blasts and bullet impacts. Pooled, so firing never allocates.
  muzzleFlash(position,hex='#ffb070',size=1,light=true){
    const f=this.flashes[this.flashIndex++%this.flashes.length];f.sprite.position.copy(position);f.sprite.material.color.set(hex);f.sprite.material.opacity=1;f.sprite.visible=true;f.max=f.life=.1;f.size=size;f.sprite.scale.setScalar(size*2.6);
    if(light){const slot=this.lights[this.lightIndex++%this.lights.length];slot.light.color.set(hex);slot.light.position.copy(position);slot.light.intensity=Math.max(slot.light.intensity,15*size);slot.life=Math.max(slot.life,.12)}
  }
  // A flash at an explicit HDR colour (components above 1 bloom). Shares the pooled flash sprites, never adds a light.
  hotFlash(position,rgb,size){
    const f=this.flashes[this.flashIndex++%this.flashes.length];f.sprite.position.copy(position);f.sprite.material.color.setRGB(rgb[0],rgb[1],rgb[2]);
    f.sprite.material.opacity=1;f.sprite.visible=true;f.max=f.life=.11;f.size=size;f.sprite.scale.setScalar(size*2.6);
  }
  // A shower of streak sparks fanning out around `normal` (spread ~1 hugs the surface normal, ~6 is nearly spherical).
  // Each streak leaves at a random fraction of `speed`, cools from `hot` to `cool` (HDR rgb triples) and fades as it dies.
  sparkShower(origin,normal,{count=12,speed=10,spread=1.3,life=.34,width=.022,hot=PALETTE.hull.hot,cool=PALETTE.hull.cool,g=.55,drag=1.5}={}){
    for(let i=0;i<count;i++){
      const slot=this.streakNext++%STREAK_CAP,s=this.streakData[slot]||(this.streakData[slot]={pos:new T.Vector3(),vel:new T.Vector3(),life:0,max:1,width:.02,g:0,drag:1,hot:new T.Color(),cool:new T.Color(),live:false});
      _v.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(spread).add(normal).normalize();
      s.pos.copy(origin);s.vel.copy(_v).multiplyScalar(speed*(.35+Math.random()*.75));
      s.life=s.max=life*(.6+Math.random()*.8);s.width=width*(.7+Math.random()*.6);s.g=g;s.drag=drag;s.hot.setRGB(hot[0],hot[1],hot[2]);s.cool.setRGB(cool[0],cool[1],cool[2]);s.live=true;
    }
    this.streaks.count=Math.min(this.streakNext,STREAK_CAP);
  }
  // Embers: slow glowing specks that hang in the air and drift up, long after the sparks have gone.
  embers(origin,normal,count,{speed=2.4,rgb=PALETTE.hull.hot}={}){
    for(let i=0;i<count&&this.particles.length<500;i++){
      const k=.35+Math.random()*.4;
      this.particles.push({position:origin.clone(),velocity:this.spray(normal,speed,1.7),life:.7+Math.random()*.9,max:1.6,size:.022+Math.random()*.03,color:new T.Color(rgb[0]*k,rgb[1]*k,rgb[2]*k),g:-.18,drag:1.1});
    }
  }
  // A round hits a mech. `plan` is hit-feel.hitReaction(); `normal` points from the target back toward the shooter.
  // Layers, fastest to slowest: a hot flash, streaking sparks, a shield ripple or a puff of scorched-armour smoke, and embers.
  mechHit(point,normal,plan){
    const n=_n.copy(normal);if(n.lengthSq()<1e-6)n.set(0,1,0);n.normalize();
    const origin=_o.copy(point).addScaledVector(n,.05),pal=plan.palette;
    this.hotFlash(origin,pal.flash,plan.flash);
    this.sparkShower(origin,n,{count:plan.streaks,speed:plan.speed,spread:plan.spread,hot:pal.hot,cool:pal.cool,life:plan.shield?.26:.34,width:plan.shield?.016:.022,g:plan.shield?0:.55,drag:plan.shield?2.4:1.5});
    if(plan.ring)this.shieldHit(origin,n);
    if(plan.smoke)this.puff(origin,'#2a2623',.55+plan.power*.25,_v.copy(n).multiplyScalar(1.1).addScaledVector(Y_AXIS,.9),.9,.38);
    if(plan.embers)this.embers(origin,n,plan.embers,{rgb:pal.hot});
  }
  // A mech is destroyed (on top of explosion()): a bigger flash, a radial spray, embers and a rolling column of smoke.
  killBurst(position,up,size=1){
    this.hotFlash(position,[9,5.5,2.2],3.6*size);
    this.sparkShower(position,up,{count:Math.round(30*size),speed:17*size,spread:6,life:.6,width:.03,g:.7,drag:1.1});
    this.embers(position,up,Math.round(14*size),{speed:3.6});
    for(let i=0;i<3;i++)this.puff(position,i?'#3a3631':'#1f1c1a',(1.5+Math.random()*.7)*size,_v.set((Math.random()-.5)*1.6,1.6+Math.random()*1.4,(Math.random()-.5)*1.6),1.2+Math.random()*.6,.5);
  }
  update(dt){
    for(const f of this.flashes){if(f.life<=0)continue;f.life-=dt;const k=Math.max(0,f.life/f.max);f.sprite.material.opacity=k;f.sprite.scale.setScalar(f.size*(2.6+(1-k)*1.6));if(f.life<=0)f.sprite.visible=false}
    for(const slot of this.lights){slot.life=Math.max(0,slot.life-dt);slot.light.intensity*=Math.exp(-dt*13);if(!slot.life)slot.light.intensity=0}
    for(let i=this.rings.length-1;i>=0;i--){const r=this.rings[i];r.life-=dt;const progress=1-r.life/r.max;r.mesh.scale.setScalar(Math.max(.02,r.fire?Math.sin(progress*Math.PI)*r.size:(.1+progress*r.size)));r.mesh.material.opacity=Math.max(0,1-progress)*(r.fire?.8:.9);if(r.life<=0){this.scene.remove(r.mesh);r.mesh.material.dispose();this.rings.splice(i,1)}}
    for(let i=this.traces.length-1;i>=0;i--){const t=this.traces[i];t.life-=dt;if(t.mesh.isSprite){t.mesh.material.opacity=Math.max(0,t.life/t.max);t.mesh.scale.multiplyScalar(1+dt*4)}if(t.mesh.isLight)t.mesh.intensity*=Math.max(0,1-dt*20);if(t.life<=0){this.scene.remove(t.mesh);if(t.disposeMaterial)t.mesh.material.dispose();this.traces.splice(i,1)}}
    for(let i=this.particles.length-1;i>=0;i--){
      const p=this.particles[i];p.life-=dt;if(p.life<=0){this.particles.splice(i,1);continue}
      if(p.g)p.velocity.addScaledVector(this.gravityAt(p.position,_g),p.g*dt);
      p.position.addScaledVector(p.velocity,dt);p.velocity.multiplyScalar(Math.exp(-dt*(p.drag??1.2)));
      if(p.bounce)this.collideFloor(p.position,p.velocity,p.size,p.bounce);
    }
    this.sparks.count=this.particles.length;
    this.particles.forEach((p,i)=>{this.dummy.position.copy(p.position);this.dummy.scale.setScalar(p.size*Math.min(1,p.life*5));this.dummy.updateMatrix();this.sparks.setMatrixAt(i,this.dummy.matrix);this.sparks.setColorAt(i,p.color)});
    this.sparks.instanceMatrix.needsUpdate=true;if(this.sparks.instanceColor)this.sparks.instanceColor.needsUpdate=true;
    for(let i=this.debris.length-1;i>=0;i--){const d=this.debris[i];d.life-=dt;d.mesh.position.addScaledVector(d.velocity,dt);d.mesh.rotation.x+=dt*3;d.mesh.rotation.z+=dt*2;if(d.life<=0){this.scene.remove(d.mesh);this.debris.splice(i,1)}}
    for(const f of this.puffs){if(f.life<=0)continue;f.life-=dt;const k=Math.max(0,f.life/f.max);f.sprite.position.addScaledVector(f.velocity,dt);f.velocity.multiplyScalar(Math.exp(-dt*2.2));f.sprite.material.opacity=k*f.alpha;f.sprite.scale.setScalar(f.size*(1+(1-k)*1.8));if(f.life<=0)f.sprite.visible=false}
    for(let i=0;i<this.decalData.length;i++){
      const d=this.decalData[i];if(!d.live)continue;d.age+=dt;
      if(d.age>=DECAL_LIFE){d.live=false;this.writeDecal(i,0);continue}
      if(d.hot&&d.age<.9){this.decals.setColorAt(i,_c.copy(HOT).lerp(d.base,Math.min(1,d.age/.9)));this.decals.instanceColor.needsUpdate=true}
      if(d.age>DECAL_LIFE-DECAL_FADE)this.writeDecal(i,Math.max(0,(DECAL_LIFE-d.age)/DECAL_FADE));
    }
    for(let i=0;i<this.casingData.length;i++){
      const c=this.casingData[i];if(!c.live)continue;c.life-=dt;
      if(c.life<=0){c.live=false;this.dummy.scale.setScalar(0);this.dummy.updateMatrix();this.casings.setMatrixAt(i,this.dummy.matrix);this.casings.instanceMatrix.needsUpdate=true;continue}
      c.vel.addScaledVector(this.gravityAt(c.pos,_g),dt);c.pos.addScaledVector(c.vel,dt);
      _q.set(c.spin.x*dt*.5,c.spin.y*dt*.5,c.spin.z*dt*.5,1).normalize();c.quat.premultiply(_q);
      if(this.collideFloor(c.pos,c.vel,.03,.35)){c.vel.multiplyScalar(.6);c.spin.multiplyScalar(.5)}
      this.dummy.position.copy(c.pos);this.dummy.quaternion.copy(c.quat);this.dummy.scale.copy(c.size).multiplyScalar(Math.min(1,c.life*4));this.dummy.updateMatrix();this.casings.setMatrixAt(i,this.dummy.matrix);this.casings.instanceMatrix.needsUpdate=true;
    }
    this.updateStreaks(dt);
  }
  // Streak sparks: integrate, then stretch each one along its velocity (longer when faster) with its tail trailing the head.
  updateStreaks(dt){
    let touched=false;
    for(let i=0;i<this.streakData.length;i++){
      const s=this.streakData[i];if(!s.live)continue;touched=true;s.life-=dt;
      if(s.life<=0){s.live=false;this.dummy.scale.setScalar(0);this.dummy.updateMatrix();this.streaks.setMatrixAt(i,this.dummy.matrix);continue}
      if(s.g)s.vel.addScaledVector(this.gravityAt(s.pos,_g),s.g*dt);
      s.pos.addScaledVector(s.vel,dt);s.vel.multiplyScalar(Math.exp(-dt*s.drag));
      const speed=s.vel.length(),k=s.life/s.max,length=Math.min(1.1,Math.max(.04,speed*.045))*(.35+.65*k),radius=s.width*(.4+.6*k);
      if(speed>1e-3)_dir.copy(s.vel).multiplyScalar(1/speed);else _dir.copy(Y_AXIS);
      this.dummy.position.copy(s.pos).addScaledVector(_dir,-length*.5);this.dummy.quaternion.setFromUnitVectors(Y_AXIS,_dir);this.dummy.scale.set(radius,length,radius);this.dummy.updateMatrix();this.streaks.setMatrixAt(i,this.dummy.matrix);
      // white-hot at birth, cooling toward `cool`, then dimming to nothing in the last third of its life (additive: dark = invisible)
      _c.copy(s.hot).lerp(s.cool,1-k).multiplyScalar(k<.35?k/.35:1);this.streaks.setColorAt(i,_c);
    }
    if(touched){this.streaks.instanceMatrix.needsUpdate=true;if(this.streaks.instanceColor)this.streaks.instanceColor.needsUpdate=true}
  }
}

export class AudioEngine {
  constructor(){this.enabled=true;this.ctx=null;this.lastShot=0}
  async start(){
    if(!this.enabled)return;
    try{if(!this.ctx){this.ctx=new(window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.gain.value=.22;this.master.connect(this.ctx.destination);
      const hum=this.ctx.createOscillator(),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();hum.type='sawtooth';hum.frequency.value=43;filter.type='lowpass';filter.frequency.value=85;gain.gain.value=.08;hum.connect(filter).connect(gain).connect(this.master);hum.start();}
      await this.ctx.resume();
    }catch{this.enabled=false}
  }
  setEnabled(value){this.enabled=value;if(this.ctx)this.master.gain.setTargetAtTime(value?.22:0,this.ctx.currentTime,.1)}
  noiseBuffer(){
    if(!this.noise){const ctx=this.ctx;this.noise=ctx.createBuffer(1,Math.floor(ctx.sampleRate*.35),ctx.sampleRate);const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1}
    return this.noise;
  }
  // Layered, positional sounds for combat: incoming fire, bullets whipping past, hits, shield break and the low-health heartbeat.
  // `volume` is 0-1 loudness (distance falloff) and `pan` is -1 (left) to 1 (right) from the shooter's bearing.
  special(kind,o={}){
    const ctx=this.ctx,t=ctx.currentTime,vol=o.volume??1,pan=Math.max(-1,Math.min(1,o.pan||0));
    const known=['enemyShot','whiz','hurt','shieldHit','shieldBreak','heartbeat','lock','impactDirt','impactWood','impactStone','impactMetal','impactGlass','impactWater','ricochet','thump','land','whoosh'];if(!known.includes(kind))return false;
    // body-felt sounds: a pile-up of sub-bass would turn to mud and (through small speakers) to distortion
    if(kind==='thump'||kind==='land'||kind==='whoosh'){const last=this.lastBody||(this.lastBody={});if(t-(last[kind]||0)<.06||vol<.05)return true;last[kind]=t}
    if(kind==='enemyShot'){if(t-(this.lastEnemyShot||0)<.045)return true;this.lastEnemyShot=t}
    // rapid fire lands many rounds a second: keep each impact sound distinct instead of stacking into a buzz
    if(kind.startsWith('impact')||kind==='ricochet'){const last=this.lastImpact||(this.lastImpact={});if(t-(last[kind]||0)<.04||vol<.08)return true;last[kind]=t}
    const route=()=>{if(!pan||!ctx.createStereoPanner)return this.master;const p=ctx.createStereoPanner();p.pan.value=pan;p.connect(this.master);return p};
    const tone=(type,f0,f1,dur,gain,delay=0)=>{const osc=ctx.createOscillator(),g=ctx.createGain(),dest=route();osc.type=type;osc.frequency.setValueAtTime(f0,t+delay);osc.frequency.exponentialRampToValueAtTime(Math.max(1,f1),t+delay+dur);g.gain.setValueAtTime(Math.max(.0002,gain*vol),t+delay);g.gain.exponentialRampToValueAtTime(.0005,t+delay+dur);osc.connect(g).connect(dest);osc.start(t+delay);osc.stop(t+delay+dur+.02);osc.onended=()=>{osc.disconnect();g.disconnect();if(dest!==this.master)dest.disconnect()}};
    const hiss=(type,f0,f1,dur,gain,delay=0)=>{const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),g=ctx.createGain(),dest=route();src.buffer=this.noiseBuffer();filter.type=type;filter.frequency.setValueAtTime(f0,t+delay);filter.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+delay+dur);g.gain.setValueAtTime(Math.max(.0002,gain*vol),t+delay);g.gain.exponentialRampToValueAtTime(.0005,t+delay+dur);src.connect(filter).connect(g).connect(dest);src.start(t+delay);src.stop(t+delay+dur+.02);src.onended=()=>{src.disconnect();filter.disconnect();g.disconnect();if(dest!==this.master)dest.disconnect()}};
    switch(kind){
      case 'enemyShot':tone('sawtooth',340,70,.14,.17);hiss('bandpass',1600,600,.1,.14);tone('square',900,200,.05,.05);break;
      case 'whiz':hiss('bandpass',3400,700,.26,.34);tone('sine',1700,420,.2,.06);break;
      case 'hurt':tone('sine',160,36,.26,.62);hiss('lowpass',1100,200,.14,.4);tone('square',240,70,.09,.14);break;
      case 'shieldHit':tone('triangle',1250,300,.17,.3);hiss('highpass',3200,2500,.08,.1);tone('sine',140,50,.12,.22);break;
      case 'shieldBreak':tone('sawtooth',760,55,.5,.34);hiss('bandpass',1400,260,.4,.32);tone('sine',90,30,.34,.5);tone('triangle',1500,200,.2,.18);break;
      case 'lock':tone('square',1900,1850,.07,.13);tone('square',1900,1850,.07,.13,.11);tone('square',2300,2250,.09,.15,.22);break;
      case 'heartbeat':tone('sine',64,38,.14,.55);tone('sine',58,36,.13,.38,.18);break;
      // world impacts, one voice per material: a soft thud, a wooden knock, a stone chip, a metallic tick, glass, a splash
      case 'impactDirt':hiss('lowpass',1100,180,.14,.5);tone('sine',110,45,.1,.4);break;
      case 'impactWood':tone('triangle',520,150,.08,.45);hiss('bandpass',2400,900,.06,.3);tone('sine',150,60,.1,.25,.01);break;
      case 'impactStone':hiss('highpass',4200,1600,.05,.4);tone('square',820,300,.05,.15);tone('sine',180,70,.09,.25);break;
      case 'impactMetal':tone('square',2100,1100,.04,.14);tone('triangle',1500,1000,.2,.14,.005);hiss('highpass',3500,2200,.06,.22);break;
      case 'impactGlass':tone('triangle',3200,1800,.07,.12);hiss('highpass',5000,3000,.08,.2);break;
      case 'impactWater':hiss('bandpass',1600,350,.2,.35);tone('sine',260,90,.12,.18);break;
      // the 4D layer: sub-bass you feel in headphones more than hear, a heavier one for landings, and an air whoosh for boosts and dashes
      case 'thump':tone('sine',64,24,.4,.95);hiss('lowpass',300,60,.2,.4);tone('sine',120,40,.16,.4);break;
      case 'land':tone('sine',78,28,.32,.85);hiss('lowpass',800,110,.16,.45);break;
      case 'whoosh':hiss('bandpass',450,2400,.34,.3);hiss('highpass',1800,900,.2,.12);break;
      case 'ricochet':tone('sine',2400+Math.random()*500,800,.28,.16);hiss('bandpass',4400,1400,.2,.18);tone('triangle',3300,1200,.14,.07,.02);break;
    }
    return true;
  }
  play(kind,opts){
    if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
    if(this.special(kind,opts))return;
    const ctx=this.ctx,t=ctx.currentTime;
    if(kind==='gatling'&&t-this.lastShot<.055)return;if(kind==='gatling')this.lastShot=t;
    const gain=ctx.createGain();gain.connect(this.master);
    const osc=ctx.createOscillator();osc.connect(gain);
    const config={gatling:[135,35,.08,.3,'sawtooth'],flak:[85,22,.22,.65,'sawtooth'],hit:[680,220,.055,.13,'triangle'],kill:[180,720,.18,.22,'sine'],missile:[230,35,.5,.45,'sawtooth'],hurt:[80,30,.15,.25,'sine'],ui:[450,700,.09,.2,'sine'],dash:[110,560,.21,.18,'sawtooth'],glass:[1400,210,.28,.18,'triangle']}[kind]||[200,80,.1,.2,'sine'];
    osc.type=config[4];osc.frequency.setValueAtTime(config[0],t);osc.frequency.exponentialRampToValueAtTime(config[1],t+config[2]);gain.gain.setValueAtTime(config[3],t);gain.gain.exponentialRampToValueAtTime(.001,t+config[2]);osc.start(t);osc.stop(t+config[2]);osc.onended=()=>{osc.disconnect();gain.disconnect()};
    if(['gatling','flak','missile','dash','glass'].includes(kind)){
      if(!this.noise){this.noise=ctx.createBuffer(1,Math.floor(ctx.sampleRate*.35),ctx.sampleRate);const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1}
      const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),envelope=ctx.createGain();source.buffer=this.noise;filter.type=kind==='glass'?'highpass':kind==='dash'?'bandpass':'lowpass';filter.frequency.value=kind==='glass'?2400:kind==='gatling'?1700:kind==='flak'?700:1100;
      envelope.gain.setValueAtTime(kind==='flak'?.5:.18,t);envelope.gain.exponentialRampToValueAtTime(.001,t+config[2]);source.connect(filter).connect(envelope).connect(this.master);source.start(t);source.stop(t+config[2]);source.onended=()=>{source.disconnect();filter.disconnect();envelope.disconnect()};
    }
  }
  // The wind bed: a looping band of low rumbling noise whose loudness and brightness follow the pilot's speed (0..1).
  // Built once on first use; silent (not stopped) at rest so it never clicks.
  wind(level){
    const ctx=this.ctx;
    if(!ctx||!this.master||ctx.state!=='running'||!this.enabled){if(this.windGain&&ctx)this.windGain.gain.setTargetAtTime(0,ctx.currentTime,.1);return}
    if(!this.windGain){
      const length=Math.floor(ctx.sampleRate*3),buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0),fade=Math.min(Math.floor(ctx.sampleRate*.12),length>>1);
      let last=0;for(let i=0;i<length;i++){last=(last+.02*(Math.random()*2-1))/1.02;data[i]=last*3.5}
      // fade the ends so the loop seam never clicks
      for(let i=0;i<fade;i++){const k=i/fade;data[i]*=k;data[length-1-i]*=k}
      const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
      source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=300;gain.gain.value=0;source.connect(filter).connect(gain).connect(this.master);source.start();
      this.windFilter=filter;this.windGain=gain;
    }
    const t=ctx.currentTime,l=Math.max(0,Math.min(1,level||0));
    this.windGain.gain.setTargetAtTime(l*.34,t,.12);this.windFilter.frequency.setTargetAtTime(220+l*1500,t,.15);
  }
  pause(){if(this.ctx?.state==='running')this.ctx.suspend().catch(()=>{})}
}
