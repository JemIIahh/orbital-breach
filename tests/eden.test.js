import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { makeEden, terrainHeight, terrainNormal } from '../src/eden.js';
import { SPAWN, PORTAL, ARCHIVE, KEEP, BOT_SPAWNS, FIGHT, PATH_HALF } from '../src/eden-layout.js';
import { pathX, PATH, WATER_Y, streamZ, inPond } from '../src/eden-terrain.js';

// Same narrow document mock the other suites use; Eden must not need anything more than a canvas 2D context.
const context={fillRect(){},strokeRect(){},beginPath(){},arc(){},fill(){},fillText(){},createRadialGradient(){return{addColorStop(){}}}};
globalThis.document={createElement(tag){assert.equal(tag,'canvas');return{width:0,height:0,getContext(){return context}}}};
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const world=makeEden(null);

test('Eden generation is deterministic',()=>{
  const other=makeEden(null),key=o=>[o.kind,o.position.x.toFixed(4),o.position.z.toFixed(4),o.radius.toFixed(4),o.height.toFixed(3)].join(',');
  assert.deepEqual(world.obstacles.map(key),other.obstacles.map(key));
  const names=w=>{const a=[];w.scene.traverse(o=>{if(o.isMesh)a.push(`${o.name}:${o.isInstancedMesh?o.count:0}:${o.geometry.attributes.position.count}`)});return a};
  assert.deepEqual(names(world),names(other));
});

test('Eden keeps the portal, spawn, archive and enemy clearings free of solid obstacles',()=>{
  const zones=[{...SPAWN,r:5,name:'spawn'},{...PORTAL,r:4,name:'portal'},{...ARCHIVE,r:1,name:'archive'},...BOT_SPAWNS.map((b,i)=>({...b,r:2.4,name:'bot'+i}))];
  for(const o of world.obstacles)for(const z of zones){
    const d=Math.hypot(o.position.x-z.x,o.position.z-z.z);
    assert.ok(d>=o.radius+z.r,`${o.kind} at ${o.position.x.toFixed(1)},${o.position.z.toFixed(1)} (r${o.radius.toFixed(2)}) crowds ${z.name}`);
  }
  // the archive stays reachable: a mech body can stand within the interaction radius, in front of it, without being pushed away
  for(const p of [v(0,0,70),v(0,0,71.5),v(2,0,72)]){
    const eye=v(p.x,terrainHeight(p.x,p.z)+2.65,p.z),out=world.resolve(eye,eye.clone(),v(),1.45,v(0,1,0));
    assert.ok(Math.hypot(out.x-eye.x,out.z-eye.z)<.01,`blocked near archive at ${p.x},${p.z}`);
    assert.ok(eye.distanceTo(world.archive.position)<5.5);
  }
});

test('Eden solids stay off the worn path from the portal to the archive',()=>{
  for(const o of world.obstacles){
    if(o.kind==='heart-tree'||o.position.z<PATH.z0||o.position.z>PATH.z1)continue;
    assert.ok(Math.abs(o.position.x-pathX(o.position.z))>=o.radius+PATH_HALF-1.2,`${o.kind} at ${o.position.x.toFixed(1)},${o.position.z.toFixed(1)} sits on the path`);
  }
  // the path itself is continuous walkable ground (a shallow ford is fine) and not a cliff
  let prev=null;
  for(let z=PATH.z0+2;z<PATH.z1;z+=1){const x=pathX(z),h=terrainHeight(x,z);if(prev!==null)assert.ok(Math.abs(h-prev)<.9,`path steps ${Math.abs(h-prev).toFixed(2)} m at z=${z}`);prev=h;assert.ok(h>WATER_Y-1.2,`path is submerged at z=${z}`);assert.ok(terrainNormal(x,z).y>.8,`path too steep at z=${z}`)}
  // walking the path with the real collision function never gets stuck on a solid
  const vel=v(0,0,8);let p=v(0,terrainHeight(0,-44)+2.65,-44);
  for(let z=-44;z<72;z+=.5){const tx=pathX(z+.5),next=v(tx,terrainHeight(tx,z+.5)+2.65,z+.5),res=world.resolve(p,next,vel.clone(),1.45,v(0,1,0));assert.ok(Math.hypot(res.x-next.x,res.z-next.z)<.02,`player pushed off the path at z=${z}`);p=res}
});

test('Eden has fighting cover in the clearing and a living, varied landscape',()=>{
  const cover=world.obstacles.filter(o=>o.position.x>FIGHT.x0&&o.position.x<FIGHT.x1&&o.position.z>FIGHT.z0&&o.position.z<FIGHT.z1);
  assert.ok(cover.length>=14,'the fighting ground needs scattered cover');
  const kinds=new Set(world.obstacles.map(o=>o.kind));for(const k of ['tree','rock','log','ruin'])assert.ok(kinds.has(k),`missing ${k}`);
  const names=[];world.scene.traverse(o=>{if(o.name)names.push(o.name)});
  for(const n of ['sky','horizon','ground','water','heart-tree','light-shafts','butterflies','birds','pollen','fireflies','oak0','pine0','birch0','willow0','grass0','shrub0','fern0','flower-heads','glow-mushroom0','reeds0','log0','boulder0','crags','ruins-matte'])assert.ok(names.includes(n),`missing mesh ${n}`);
  assert.ok(world.flora.placed.oak>=30&&world.flora.placed.pine>=60&&world.flora.placed.birch>=30&&world.flora.placed.willow>=6,'four tree species are present in numbers');
});

test('Eden stays inside its draw-call and geometry budget and has no NaN transforms',()=>{
  let meshes=0,instances=0,tris=0;
  world.scene.traverse(o=>{
    if(!o.isMesh&&!o.isPoints)return;if(o.isMesh)meshes++;
    const g=o.geometry;for(const k in g.attributes){const a=g.attributes[k].array;for(let i=0;i<a.length;i++)if(!Number.isFinite(a[i]))assert.fail(`${o.name}.${k}[${i}] is not finite`)}
    if(o.isInstancedMesh){instances+=o.count;const m=o.instanceMatrix.array;for(let i=0;i<o.count*16;i++)if(!Number.isFinite(m[i]))assert.fail(`${o.name} instance ${(i/16)|0} has a NaN transform`);assert.ok(o.boundingSphere&&Number.isFinite(o.boundingSphere.radius))}
    if(o.isMesh)tris+=(g.index?g.index.count/3:g.attributes.position.count/3)*(o.isInstancedMesh?o.count:1);
  });
  // tris counts every instance at full detail (it was 1.62e6 before the trimmed flower/grass/panel geometry and the 240x240 terrain); the per-frame cost is bounded by the culling test below.
  assert.ok(meshes<100,`too many meshes: ${meshes}`);assert.ok(instances<16000,`too many instances: ${instances}`);assert.ok(tris<1.5e6,`too many triangles: ${tris}`);
  assert.ok(world.obstacles.length<700,'collision list should stay cheap to scan');
  for(const o of world.obstacles){assert.ok([o.position.x,o.position.y,o.position.z,o.radius,o.height].every(Number.isFinite));assert.ok(o.box.min.x<o.box.max.x&&o.box.min.y<o.box.max.y)}
});

test('Eden solids behave like the old trees: bodies are pushed out and bullets hit them',()=>{
  // an isolated rock: a body wedged between two rocks cannot satisfy both, so this checks one rock at a time
  const lonely=q=>world.obstacles.every(r=>r===q||Math.hypot(r.position.x-q.position.x,r.position.z-q.position.z)>5+(q.reach||q.radius)+(r.reach||r.radius));
  // a rock is a stack of cylinders that follows its dome. Find a band at the height of a walking body's centre and overlap it by half a metre from the side.
  let used=null;
  for(const o of world.obstacles.filter(q=>q.kind==='rock'&&lonely(q))){
    for(const part of o.parts){
      const x=part.x+part.r+1.45-.5,y=Math.max(world.terrainHeight(x,part.z)+1.45+.02,part.y0+.05);
      if(y<=part.y1-.05){used={o,part,x,y};break}
    }
    if(used)break;
  }
  assert.ok(used,'an isolated rock tall enough to meet a walking body');
  const {part,x,y}=used,vel=v(-3,0,0),eye=v(x,y+1.2,part.z),p=world.resolve(eye,eye.clone(),vel,1.45,v(0,1,0));
  assert.ok(Math.hypot(p.x-part.x,p.z-part.z)>=part.r+1.45-.01,'the body ends up outside the obstacle');assert.ok(vel.x>=0,'velocity into the obstacle is removed');
  const mid=(part.y0+part.y1)/2,hit=world.raycast(v(part.x-part.r-6,mid,part.z),v(part.x+part.r+6,mid,part.z));
  assert.ok(hit&&hit.surface==='tree'&&hit.kind==='rock'&&Math.abs(hit.x-(part.x-part.r))<.05,'a bullet is stopped by the rock face');
});

test('Eden water, wind and life animate without errors and the archive reacts to restoration',()=>{
  for(const t of [0,1.5,37.2])world.update(t,true,false,2);
  world.update(5,true,true,2);assert.equal(world.archive.children[0].material.emissiveIntensity,3);world.update(6,true,false,2);assert.equal(world.archive.children[0].material.emissiveIntensity,1.5);
  // the stream flows through the path crossing and the pond sits where the old lake did
  assert.ok(Math.abs(streamZ(3)-20)<10);assert.ok(inPond(40,20));assert.ok(terrainHeight(40,20)<WATER_Y-1);
});

test('Eden terrain is finite, bounded and keeps the spawn and portal on gentle ground',()=>{
  for(let x=-200;x<=200;x+=10)for(let z=-200;z<=200;z+=10){const h=terrainHeight(x,z);assert.ok(Number.isFinite(h)&&h>-6&&h<80)}
  for(const p of [SPAWN,PORTAL,ARCHIVE]){assert.ok(terrainNormal(p.x,p.z).y>.9);assert.ok(terrainHeight(p.x,p.z)>WATER_Y+.5)}
});

// ---------------------------------------------------------------- per-render culling and level of detail (src/eden-cull.js)
const eye=(w,x,z,yaw)=>{const c=new T.PerspectiveCamera(76,16/9,.06,4500);c.position.set(x,w.terrainHeight(x,z)+2.65,z);c.rotation.set(0,yaw,0,'YXZ');c.updateMatrixWorld();return c};
const render=(w,cam,shadows=true)=>{w.cull.force();w.scene.updateMatrixWorld(true);w.scene.onBeforeRender({shadowMap:{enabled:shadows}},w.scene,cam)};
const key=(a,o)=>`${a[o+12].toFixed(2)},${a[o+13].toFixed(2)},${a[o+14].toFixed(2)}`;
const emitted=mesh=>{const m=new Map(),a=mesh.instanceMatrix.array;for(let i=0;i<mesh.count;i++){const k=key(a,i*16);m.set(k,(m.get(k)||0)+1)}return m};
const frustumOf=cam=>new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse));
const liveTris=w=>{let tris=0,calls=0;w.scene.traverse(o=>{if(!o.isMesh||!o.visible)return;const g=o.geometry,r=g.drawRange,per=(g.index?(r.count!==Infinity?r.count:g.index.count):g.attributes.position.count)/3;tris+=per*(o.isInstancedMesh?o.count:1);calls++});return{tris,calls}};

test('Eden culls instances per render: everything in view is drawn exactly once, the rest is dropped, and far LOD takes over past its distance',()=>{
  const w=makeEden(null),cam=eye(w,SPAWN.x,SPAWN.z,Math.PI),f=frustumOf(cam),total=w.cull.items.reduce((a,it)=>a+it.n,0);
  render(w,cam);
  let seen=0,drawn=0;
  for(const it of w.cull.items){
    const near=emitted(it.mesh),far=it.far?emitted(it.far.mesh):new Map(),lod=it.cfg.lod;
    drawn+=it.mesh.count;
    for(let i=0;i<it.n;i++){
      const c=v(it.cx[i],it.cy[i],it.cz[i]);if(!f.intersectsSphere(new T.Sphere(c,it.rad[i])))continue;
      seen++;const k=key(it.src,i*16),inNear=near.get(k)||0,inFar=far.get(k)||0;
      assert.ok(inNear+inFar>=1,`${it.mesh.name} instance ${i} is in the view but was culled`);
      if(lod){const d=Math.max(0,c.distanceTo(cam.position)-it.rad[i]*.4);if(d<lod.dist-4)assert.ok(inNear>=1,`${it.mesh.name} ${i} should still be full detail at ${d.toFixed(0)} m`);if(d>lod.dist+4)assert.ok(inFar>=1,`${it.mesh.name} ${i} should be far detail at ${d.toFixed(0)} m`)}
      else assert.ok(inNear>=1);
    }
  }
  for(const g of w.cull.groups.values())drawn+=g.mesh.count;
  assert.ok(seen>2000,'the spawn view sees a lot of vegetation');assert.ok(drawn>=seen&&drawn<total*.85,`culling should drop what is off screen (${drawn}/${total}, ${seen} in view)`);
  // looking back over the empty side of the map draws far less
  render(w,eye(w,SPAWN.x,SPAWN.z,0));let behind=0;for(const it of w.cull.items)behind+=it.mesh.count;for(const g of w.cull.groups.values())behind+=g.mesh.count;
  assert.ok(behind<drawn*.6,`turning away should cull more (${behind} vs ${drawn})`);
});

test('Eden keeps casters that are off screen but inside the sun\'s shadow box, and only while shadows are on',()=>{
  const w=makeEden(null),cam=eye(w,SPAWN.x,SPAWN.z,0); // facing -z, away from the map
  const tx=-40,tz=30,ty=w.terrainHeight(tx,tz);w.sun.target.position.set(tx,ty,tz);w.sun.position.set(tx-35,ty+65,tz-65);
  const count=on=>{render(w,cam,on);let n=0;for(const it of w.cull.items)if(it.cast)n+=it.mesh.count;for(const g of w.cull.groups.values())if(g.cast)n+=g.mesh.count;return n};
  const withShadows=count(true),sf=w.sun.shadow.getFrustum(),f=frustumOf(cam);let needed=0,shadowOnly=0;
  for(const it of w.cull.items){
    if(!it.cast)continue;const near=emitted(it.mesh),far=it.far?emitted(it.far.mesh):new Map();
    for(let i=0;i<it.n;i++){const s=new T.Sphere(v(it.cx[i],it.cy[i],it.cz[i]),it.rad[i]);if(!sf.intersectsSphere(s))continue;needed++;if(!f.intersectsSphere(s))shadowOnly++;const k=key(it.src,i*16);assert.ok((near.get(k)||0)+(far.get(k)||0)>=1,`${it.mesh.name} ${i} casts into the shadow box but was culled`)}
  }
  assert.ok(needed>20&&shadowOnly>10,`the test scene needs shadow-only casters (${needed} in the box, ${shadowOnly} off screen)`);
  assert.ok(count(false)<withShadows,'with shadows off the off-screen casters are not kept');
});

test('Eden stays inside a per-frame triangle budget and far levels of detail are much lighter',()=>{
  const w=makeEden(null);let staticTris=0;w.scene.traverse(o=>{if(o.isMesh){const g=o.geometry;staticTris+=(g.index?g.index.count:g.attributes.position.count)/3*(o.isInstancedMesh?o.count:1)}});
  for(const [x,z,yaw] of [[SPAWN.x,SPAWN.z,Math.PI],[0,-10,Math.PI],[0,38,Math.PI],[0,20,0],[0,56,Math.PI]]){
    render(w,eye(w,x,z,yaw));const {tris,calls}=liveTris(w);
    assert.ok(tris<6e5,`${tris|0} triangles from ${x},${z} (the scene was 1.62e6 before culling)`);assert.ok(tris<staticTris*.45&&calls<95,`${calls} meshes drawn`);
  }
  const ground=w.scene.getObjectByName('ground');assert.ok(ground.geometry.drawRange.count<ground.geometry.index.count*.75,'terrain tiles outside the view are skipped');
  const per=g=>(g.index?g.index.count:g.attributes.position.count)/3;
  for(const [name,g] of w.cull.groups)for(const m of g.members)assert.ok(per(g.geo)<per(m.mesh.geometry)*.6,`${name}: far geometry (${per(g.geo)}) should be well under the near one (${per(m.mesh.geometry)})`);
  assert.ok(w.cull.groups.size>=6);
});
