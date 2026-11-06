import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Grapple,TETHER} from '../src/grapple.js';
import {Sensation,LIMITS} from '../src/sensation.js';
import {makeMech,makeWorld} from '../src/world.js';
import {makeTether} from '../src/props.js';
import {simulation} from './support.js';
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),dt=1/60;
const ctx={fillRect(){},strokeRect(){},beginPath(){},arc(){},fill(){},fillText(){},createRadialGradient(){return{addColorStop(){}}}};
globalThis.document={createElement(){return{getContext(){return ctx}}}};
const pilot=()=>({position:v(),velocity:v(),magnetic:true});
const anchor={x:65,y:0,z:0,normal:{x:-1,y:0,z:0},surface:'frame'};

test('the reel accelerates once, brakes before arrival and settles without overshooting',()=>{
  for(const fps of [30,60,120]){
    const p=pilot(),g=new Grapple();g.fire(p.position,v(1),()=>anchor);let lastSpeed=0,maxSpeed=0,minDistance=Infinity,arrivals=0;
    for(let i=0;i<fps*5;i++){
      const was=g.mode;g.update(1/fps,p,{onLatch(){arrivals++}});
      const speed=p.velocity.length();maxSpeed=Math.max(maxSpeed,speed);
      if(was==='pulling'&&g.mode==='pulling')assert.ok(Math.abs(speed-lastSpeed)<TETHER.brake/fps+.001,'acceleration must be bounded');
      p.position.addScaledVector(p.velocity,1/fps);minDistance=Math.min(minDistance,65-TETHER.standOff-p.position.x);lastSpeed=speed;
    }
    assert.equal(arrivals,1);assert.equal(p.magnetic,true);assert.equal(g.mode,'idle');assert.ok(p.velocity.length()<.001);
    assert.ok(maxSpeed>30&&maxSpeed<=TETHER.speed+.001);assert.ok(minDistance>-.05,'never shoot through the landing point');
    assert.ok(Math.abs(p.position.x-(65-TETHER.standOff))<TETHER.arrival);
  }
});

test('a blocked cable releases instead of dragging indefinitely against a wall',()=>{
  const p=pilot(),g=new Grapple();g.fire(p.position,v(1),()=>anchor);let reason;
  for(let i=0;i<120;i++)g.update(dt,p,{raycast:()=>({x:8,y:0,z:0}),onRelease(r){reason=r}});
  assert.equal(reason,'blocked');assert.equal(g.mode,'idle');
  const stalled=new Grapple();stalled.fire(p.position,v(1),()=>anchor);reason=null;
  for(let i=0;i<180;i++)stalled.update(dt,p,{onRelease(r){reason=r}}); // collision holds the pilot still
  assert.equal(reason,'blocked');assert.equal(stalled.mode,'idle');
});

test('normal flight no longer fights an active reel, and canceling preserves its momentum',()=>{
  const game=simulation();game.realm='city';game.world={...game.world,resolve:(a,b)=>b.clone(),raycast:()=>null};game.player.position.set(0,2.65,0);game.grapple=new Grapple();
  game.grapple.fire(game.player.position,v(1),()=>({...anchor,y:2.65}));
  for(let i=0;i<100;i++){game.time+=dt;game.updatePlayer(dt)}
  assert.equal(game.grapple.mode,'pulling');assert.ok(game.player.velocity.length()>33,'the 25 m/s flight cap must not suppress the reel');
  const speed=game.player.velocity.length();game.fireGrapple();game.updatePlayer(dt);
  assert.equal(game.grapple.mode,'idle');assert.ok(game.player.velocity.length()>speed*.98,'release should coast rather than instantly clamp speed');
});

test('canceling a hook before it lands does not disable magnetic boots',()=>{
  const game=simulation();game.grapple=new Grapple();game.grapple.fire(game.player.position,v(1),()=>({...anchor,y:game.player.position.y}));
  game.fireGrapple();assert.equal(game.player.magnetic,true);assert.equal(game.grapple.mode,'idle');
});

test('chase-view cable comes from the actual arm, with a safe fallback for an unarmed loadout',()=>{
  const game=simulation();game.thirdPerson=true;game.playerMech=makeMech('blue');game.playerMech.group.position.set(8,4,12);
  const expected=game.playerMech.limbs.leftGun.userData.flash;game.playerMech.group.updateMatrixWorld(true);
  assert.ok(game.tetherOrigin().distanceTo(expected.getWorldPosition(v()))<1e-8);
  delete game.playerMech.limbs.leftGun;assert.ok(game.tetherOrigin().toArray().every(Number.isFinite));
  const rope=makeTether(game.scene),g=new Grapple();g.fire(v(),v(1),()=>anchor);g.update(.2,pilot());rope.update(v(),g);
  assert.equal(rope.root.visible,true);assert.ok(rope.cable.instanceMatrix.array.every(Number.isFinite));
  g.release();rope.update(v(),g);assert.equal(rope.root.visible,false);
});

test('grappling keeps the image sharp; ordinary speed blur stays under a small hard ceiling',()=>{
  const s=new Sensation();s.speed=50;
  for(let i=0;i<180;i++)s.update(dt);
  assert.ok(s.out.blur>0&&s.out.blur<=LIMITS.blur);
  const wind=s.out.wind;s.update(dt,{tethering:true});assert.equal(s.out.blur,0);assert.ok(s.out.streaks<.2);assert.ok(s.out.wind>=wind*.99);
});

test('station fill light is restrained near white hull panels, without emissive white paint',()=>{
  const world=makeWorld(null);assert.ok(world.playerLight.intensity<=2);assert.ok(world.playerLight.distance<=10);
  assert.equal(world.mat.ceramic.emissive.getHex(),0);assert.ok(world.sun.intensity<2.5);
});

test('locking onto an inverted station ceiling preserves the pilot’s aim direction',()=>{
  const game=simulation();game.world=makeWorld(null);game.grapple=new Grapple();
  const angle=Math.PI*2/96;game.player.position.set(Math.sin(angle)*69.35,-Math.cos(angle)*69.35,0);
  game.yaw=.35;game.pitch=.18;game.basis();
  game.grapple.fire(game.player.position,game.up.clone(),(a,b)=>game.raycastWorld(a,b));
  let arrived=false;
  for(let i=0;i<240;i++){
    const before=game.aim().direction,mode=game.grapple.mode;game.time+=dt;game.updatePlayer(dt);
    if(mode==='pulling'&&game.grapple.mode==='latched'){
      assert.ok(before.dot(game.aim().direction)>.99,'a latch must not reset yaw/pitch toward the corridor');arrived=true;break;
    }
  }
  assert.equal(arrived,true);
});
