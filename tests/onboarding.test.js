import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Onboarding } from '../src/onboarding.js';

const pilot=()=>({player:{position:{x:0,y:0,z:0}},keys:new Set()});
function frames(tutorial,game,count,walk=0){for(let i=0;i<count;i++){game.player.position.x+=walk;tutorial.update(1/60,game)}}

test('the first control popup persists while a pilot has not acted',()=>{
  const tutorial=new Onboarding(),game=pilot();frames(tutorial,game,60*90);assert.equal(tutorial.index,0);assert.equal(tutorial.active,true);assert.match(tutorial.lesson.text,/W A S D/);
});
test('lessons progress in response to movement, boost, both weapons, missile and jets',()=>{
  const tutorial=new Onboarding(),game=pilot();tutorial.record('look',.4);frames(tutorial,game,110,.1);assert.equal(tutorial.index,1);
  game.keys.add('ShiftLeft');tutorial.record('dash');frames(tutorial,game,100,.2);assert.equal(tutorial.index,2);game.keys.clear();
  tutorial.record('left');frames(tutorial,game,60);assert.equal(tutorial.index,2,'both weapons are required');
  tutorial.record('right');frames(tutorial,game,50);assert.equal(tutorial.index,3);
  tutorial.record('missile');frames(tutorial,game,50);assert.equal(tutorial.index,4);
  tutorial.record('freeFlight');game.keys.add('Space');frames(tutorial,game,90);assert.equal(tutorial.index,5);tutorial.record('grapple');frames(tutorial,game,50);assert.equal(tutorial.active,false);assert.equal(tutorial.justCompleted,true);
});
test('teleporting on respawn does not satisfy the movement lesson',()=>{
  const tutorial=new Onboarding(),game=pilot();frames(tutorial,game,1);game.player.position.x=100;tutorial.record('look',1);frames(tutorial,game,60);assert.equal(tutorial.index,0);
});
test('lessons can be skipped and replayed with clean progress',()=>{
  const tutorial=new Onboarding();tutorial.record('left');tutorial.skip();assert.equal(tutorial.active,false);assert.equal(tutorial.justCompleted,true);
  tutorial.reset();assert.equal(tutorial.active,true);assert.equal(tutorial.index,0);assert.equal(tutorial.metrics.actions.size,0);assert.equal(tutorial.justCompleted,false);
});
