import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { makeWorld, makeMech } from '../src/world.js';
import { animateMech } from '../src/animation.js';
import { Effects } from '../src/effects.js';

// Texture upload needs a GPU. This canvas stub allows CPU scene construction checks only.
const context={fillRect(){},strokeRect(){},beginPath(){},arc(){},fill(){},fillText(){},createRadialGradient(){return{addColorStop(){}}}};
globalThis.document={createElement(tag){assert.equal(tag,'canvas');return{width:0,height:0,getContext(){return context}}}};

test('the complete station batches its repeating structures and contains no invalid geometry',()=>{
  const world=makeWorld(null);let batches=0,instances=0,meshes=0;
  world.scene.traverse(object=>{
    if(object.isInstancedMesh){batches++;instances+=object.count}
    if(object.isMesh){meshes++;const array=object.geometry.getAttribute('position').array;assert.ok(array.every(Number.isFinite),'all vertex coordinates must be finite')}
    assert.ok(object.position.toArray().every(Number.isFinite));
  });
  assert.ok(batches<=22,`expected batched structure, got ${batches} batches`);
  assert.ok(instances>4000,'entire ring must be populated');
  assert.ok(meshes<135,'static station must stay within a bounded draw-call budget');
  assert.equal(world.covers.length,48);assert.ok(world.earth.children.length>=2);
});
test('articulated mech exposes real hit geometry and separately detachable limbs',()=>{
  const mech=makeMech('red');assert.ok(mech.parts.length>15);assert.ok(mech.limbs.leftArm);assert.ok(mech.limbs.rightLeg);
  mech.group.updateMatrixWorld(true);
  const ray=new T.Raycaster(new T.Vector3(0,2.15,-8),new T.Vector3(0,0,1));
  const hits=ray.intersectObjects(mech.parts,false);assert.ok(hits.length>0);assert.equal(hits[0].object.userData.part,'core');
});
test('walking bends knees and ankles, while free flight tucks the legs and ignites jets',()=>{
  const mech=makeMech('red');let kneeRange=0,previous=0;
  for(let i=0;i<90;i++){animateMech(mech,{dt:1/60,time:i/60,speed:8});kneeRange=Math.max(kneeRange,Math.abs(mech.limbs.leftKnee.rotation.x-previous));previous=mech.limbs.leftKnee.rotation.x}
  assert.ok(kneeRange>.04);assert.ok(Math.abs(mech.limbs.leftAnkle.rotation.x)>0);assert.equal(mech.limbs.leftJet.visible,false);
  for(let i=0;i<30;i++)animateMech(mech,{dt:1/60,time:i/60,airborne:true,boost:true});
  assert.ok(mech.limbs.leftKnee.rotation.x>.5);assert.equal(mech.limbs.leftJet.visible,true);assert.ok(mech.limbs.leftJet.scale.y>2);
  mech.group.updateMatrixWorld(true);mech.group.traverse(object=>assert.ok(object.matrixWorld.elements.every(Number.isFinite)));
});
test('explosions preserve the light count to avoid recompiling lighting shaders during combat',()=>{
  const scene=new T.Scene(),effects=new Effects(scene);const count=()=>{let n=0;scene.traverse(o=>{if(o.isLight)n++});return n};
  const initial=count();effects.explosion(new T.Vector3(),1);effects.explosion(new T.Vector3(1,2,3),1);assert.equal(count(),initial);
  for(let i=0;i<120;i++)effects.update(1/60);assert.equal(count(),initial);assert.equal(effects.rings.length,0);assert.ok(effects.lights.every(slot=>slot.light.intensity===0));
});
test('moving ammunition is rendered as world-space instanced solids with distinct teams',()=>{
  const scene=new T.Scene(),effects=new Effects(scene);
  effects.renderBolts([{position:new T.Vector3(10,2,-3),velocity:new T.Vector3(100,0,0),owner:'player',weapon:0},{position:new T.Vector3(-10,2,3),velocity:new T.Vector3(-46,0,0),owner:'enemy',weapon:0}]);
  assert.equal(effects.bolts.count,2);assert.equal(effects.boltHeads.count,2);
  const matrix=new T.Matrix4(),position=new T.Vector3();effects.boltHeads.getMatrixAt(0,matrix);position.setFromMatrixPosition(matrix);assert.ok(position.distanceTo(new T.Vector3(10,2,-3))<.001);
  const c1=new T.Color(),c2=new T.Color();effects.bolts.getColorAt(0,c1);effects.bolts.getColorAt(1,c2);assert.notEqual(c1.getHex(),c2.getHex());
});
