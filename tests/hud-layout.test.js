import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectMarkerLabels } from '../src/hud-layout.js';
import { Onboarding } from '../src/onboarding.js';

test('crowded enemies get one legible label, with charging threats taking priority',()=>{
  const enemies=[{index:0,x:600,y:300,distance:18},{index:1,x:620,y:306,distance:40,priority:2},{index:2,x:610,y:315,distance:12}];
  assert.deepEqual(selectMarkerLabels(enemies).map(item=>item.index),[1]);
});
test('enemy labels avoid instruction cards and stay capped in combat and training',()=>{
  const enemies=Array.from({length:6},(_,index)=>({index,x:120+index*190,y:300,distance:20+index})),card={left:10,right:250,top:240,bottom:400};
  const combat=selectMarkerLabels(enemies,[card],3);assert.equal(combat.length,3);assert.ok(combat.every(item=>item.x-83>=card.right));assert.equal(selectMarkerLabels(enemies,[],1).length,1);
});
test('the boost lesson names the unfinished action after sprinting or dashing',()=>{
  const tutorial=new Onboarding();tutorial.index=1;tutorial.metrics.boost=5;
  assert.deepEqual(tutorial.tasks.filter(task=>!task.done).map(task=>task.label),['Tap X once']);
  tutorial.record('dash');assert.ok(tutorial.tasks.every(task=>task.done));tutorial.reset();assert.equal(tutorial.tasks.length,2);assert.ok(tutorial.tasks.every(task=>!task.done));
});
