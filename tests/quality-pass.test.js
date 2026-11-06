import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {makeMech,makeWorld} from '../src/world.js';
import {makeCity} from '../src/city.js';
import {ROOF_WINDOWS,ARC_STEP,DECK_HEIGHT} from '../src/station-layout.js';
import {firstStationIntersection,resolveStationMotion,stationPosition,HEIGHT} from '../src/physics.js';
import {makeBoxIndex} from '../src/city-spatial.js';
import {steerPlanar} from '../src/locomotion.js';
import {ResolutionGovernor} from '../src/frame-pacing.js';
import {materialOf} from '../src/impacts.js';
import {simulation} from './support.js';

const ctx={fillRect(){},strokeRect(){},beginPath(){},arc(){},fill(){},fillText(){},createRadialGradient(){return{addColorStop(){}}}};
globalThis.document={createElement(){return{getContext(){return ctx}}}};
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);

test('every roof hatch can be shot open and traversed from either side; frame and neighbouring roof remain solid',()=>{
  const world=makeWorld(null);assert.equal(world.roofWindows.length,8);
  for(const panel of ROOF_WINDOWS){
    const a=stationPosition(panel.angle,HEIGHT+8,0),b=stationPosition(panel.angle,HEIGHT-4,0);
    const hit=firstStationIntersection(a,b,world);assert.equal(hit.surface,'window');assert.equal(hit.key,panel.key);assert.equal(hit.roof,true);
    assert.equal(world.damageWindow(hit,17),false);assert.ok(world.windows.get(panel.key).crack);
    world.damageWindow(hit,17);assert.equal(world.damageWindow(hit,17),true);
    assert.equal(firstStationIntersection(a,b,world),null);
    for(const [start,end] of [[a,b],[b,a]]){
      const vel=v().subVectors(end,start).setLength(80),p=resolveStationMotion(start,end,vel,1.45,world);
      assert.ok(v(p.x,p.y,p.z).distanceTo(v(end.x,end.y,end.z))<.001);
    }
    const outside=firstStationIntersection(stationPosition(panel.angle,HEIGHT+8,5.5),stationPosition(panel.angle,HEIGHT-4,5.5),world);
    assert.equal(outside.surface,'roof','the side of the hatch remains load bearing');
    const neighbour=firstStationIntersection(stationPosition(panel.angle+ARC_STEP,HEIGHT+8,0),stationPosition(panel.angle+ARC_STEP,HEIGHT-4,0),world);
    assert.equal(neighbour.surface,'roof');
  }
  world.restoreWindows();assert.equal(world.brokenWindows.size,0);
  assert.equal(firstStationIntersection(stationPosition(0,20,0),stationPosition(0,6,0),world).surface,'window');
});

test('a pilot above an opened skylight descends and lands inside Kestrel with boots enabled',()=>{
  const game=simulation();game.world=makeWorld(null);
  const hit=firstStationIntersection(stationPosition(0,20,0),stationPosition(0,7,0),game.world);game.world.damageWindow(hit,100);
  const p=stationPosition(0,15,0);game.player.position.set(p.x,p.y,p.z);
  for(let i=0;i<180;i++){game.time+=1/60;game.updatePlayer(1/60)}
  assert.ok(Math.abs(game.player.position.y+72-2.65-DECK_HEIGHT)<.05);
  assert.equal(game.player.grounded,true);assert.equal(game.player.magnetic,true);
});

test('city broad phase retains all intersected boxes and cuts nearby candidates substantially',()=>{
  const city=makeCity(),boxes=city.obstacles.map(o=>o.box),index=makeBoxIndex(boxes),ray=new T.Ray();
  let count=0,total=0;
  for(let i=0;i<600;i++){
    const a=v(Math.sin(i*7.3)*50,2+i%12,Math.cos(i*3.1)*90),b=a.clone().add(v(Math.cos(i)*12,Math.sin(i)*4,Math.sin(i)*15));
    const nearby=index.query(a,b),length=a.distanceTo(b);ray.set(a,b.clone().sub(a).normalize());
    for(const box of boxes){const hit=ray.intersectBox(box,v());if(hit&&a.distanceTo(hit)<=length)assert.ok(nearby.includes(box),'grid dropped a ray intersection')}
    const body=index.query(a,a,1.45);for(const box of boxes)if(box.distanceToPoint(a)<1.45)assert.ok(body.includes(box),'grid dropped a body contact');
    count+=nearby.length;total+=boxes.length;
  }
  assert.ok(count<total*.2,`${count}/${total} collision candidates`);
});

test('bounded acceleration and airborne momentum remain consistent at different simulation rates',()=>{
  const cases=[30,60,120].map(fps=>{const current=v();for(let i=0;i<fps;i++)steerPlanar(current,v(14,0,0),1/fps);return current.x});
  assert.ok(cases.every(x=>x>13.9));assert.ok(Math.max(...cases)-Math.min(...cases)<.02);
  const current=v(33,0,0);steerPlanar(current,v(-33,0,0),1/60);assert.ok(current.x>31,'a reversal cannot instantly erase momentum');
  const ground=v(14,0,0),air=ground.clone();steerPlanar(ground,v(),.1);steerPlanar(air,v(),.1,{grounded:false});assert.ok(air.x>ground.x);
  for(let i=0;i<120;i++)steerPlanar(ground,v(),1/60);assert.ok(ground.length()<.01);
});

test('a live Striker maintains space around a stationary pilot over a sustained encounter',()=>{
  const game=simulation();game.realm='city';game.world=makeCity();game.scene=game.world.scene;
  game.player.position.set(0,2.65,-65);game.enemyFire=()=>{};
  const bot={...makeMech('red',1,'striker'),archetype:'striker',index:0,gardenPosition:v(0,0,-60),dead:false,hover:0,justSpawned:true};
  game.bots=[bot];game.scene.add(bot.group);let nearest=Infinity;
  for(let i=0;i<600;i++){
    game.time+=1/60;game.updateGardenBots(1/60);
    nearest=Math.min(nearest,Math.hypot(bot.gardenPosition.x,bot.gardenPosition.z+65));
  }
  assert.ok(nearest>=3.59,`striker closed to ${nearest}m`);
  assert.ok(bot.gardenPosition.distanceTo(v(0,0,-65))<6,'the Striker remains engaged in melee range');
});

test('city shots identify vehicle metal and facade stone for appropriate impact effects',()=>{
  const city=makeCity();
  const car=city.raycast(v(-10,.8,-89),v(-10,.8,-80));assert.ok(car);assert.equal(materialOf(car),'metal');
  const wall=city.raycast(v(20,8,-30),v(45,8,-30));assert.ok(wall);assert.equal(materialOf(wall),'stone');
});

test('balanced resolution backs off under persistent load, ignores interruptions and recovers slowly',()=>{
  const gov=new ResolutionGovernor();for(let i=0;i<600;i++)gov.tick(1/30);assert.ok(gov.scale<1&&gov.scale>=.75);
  const scale=gov.scale;gov.tick(5);assert.equal(gov.scale,scale);
  for(let i=0;i<60*90;i++)gov.tick(1/60);assert.equal(gov.scale,1);
  const stable=new ResolutionGovernor();for(let i=0;i<60*30;i++)stable.tick(1/60);assert.equal(stable.scale,1);
});
