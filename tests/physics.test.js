import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RADIUS, HALF_WIDTH, TAU, stationPosition, resolveStationMotion, hasStationLineOfSight, applyDamage, isAirlock } from '../src/physics.js';

const velocity=(x=0,y=0,z=0)=>({x,y,z});
test('high-speed boost cannot tunnel from the corridor through the floor',()=>{
  const start=stationPosition(0,2,0),end=stationPosition(0,-15,0),v=velocity(0,-100,0);
  const p=resolveStationMotion(start,end,v);
  assert.ok(Math.hypot(p.x,p.y)<=RADIUS-.69);assert.equal(v.y,0);
});
test('high-speed boost cannot pass through the ceiling',()=>{
  const p=resolveStationMotion(stationPosition(0,3,0),stationPosition(0,20,0),velocity(0,100,0));
  assert.ok(Math.hypot(p.x,p.y)>=RADIUS-11+.69);
});
test('windows stop a lateral boost',()=>{
  const v=velocity(0,0,100),p=resolveStationMotion(stationPosition(0,4,0),stationPosition(0,4,20),v);
  assert.ok(p.z<=HALF_WIDTH-.69);assert.equal(v.z,0);
});
test('an airlock allows travel from the corridor into space',()=>{
  const angle=5/96*TAU;
  assert.equal(isAirlock(angle),true);
  const p=resolveStationMotion(stationPosition(angle,4,0),stationPosition(angle,4,20),velocity(0,0,100));
  assert.ok(p.z>19.9);
});
test('airlock openings work after wrapping around the ring',()=>{
  assert.equal(isAirlock(5/96*TAU),isAirlock(5/96*TAU+TAU*3));
  assert.equal(isAirlock(-6/96*TAU),true);
});
test('the exterior of a window blocks return flight except at airlocks',()=>{
  const p=resolveStationMotion(stationPosition(0,4,20),stationPosition(0,4,0),velocity(0,0,-100));
  assert.ok(p.z>=HALF_WIDTH+.69);
});
test('station hull blocks bullets from outside',()=>{
  assert.equal(hasStationLineOfSight(stationPosition(0,-5,0),stationPosition(0,4,0)),false);
});
test('window blocks fire while airlock permits it',()=>{
  assert.equal(hasStationLineOfSight(stationPosition(0,4,0),stationPosition(0,4,20)),false);
  const angle=5/96*TAU;
  assert.equal(hasStationLineOfSight(stationPosition(angle,4,0),stationPosition(angle,4,20)),true);
});
test('a target behind the far side of the curved ring is occluded',()=>{
  assert.equal(hasStationLineOfSight(stationPosition(0,3,0),stationPosition(Math.PI,3,0)),false);
});
test('shield absorbs damage before a headshot multiplier reaches core health',()=>{
  const target={shield:10,health:100};
  assert.equal(applyDamage(target,30,1.5),false);assert.equal(target.shield,0);assert.equal(target.health,70);
  assert.equal(applyDamage(target,100),true);assert.equal(target.health,0);
});
