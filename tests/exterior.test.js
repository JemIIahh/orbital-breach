import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { simulation } from './support.js';
import { createStationLayout, ARC_STEP, DECK_HEIGHT, DOCK_ROOF_HEIGHT } from '../src/station-layout.js';
import { stationPosition, resolveStationMotion, firstStationIntersection, RADIUS as R } from '../src/physics.js';
import { Grapple } from '../src/grapple.js';

const layout=createStationLayout(),world={stationSurfaces:layout.surfaces,stationSolids:layout.solids};
const position=(angle,height,z)=>new T.Vector3(...Object.values(stationPosition(angle,height,z)));
function pilot(angle,height,z){const game=simulation();Object.assign(game.world,world);game.realm='station';game.grapple=new Grapple();game.player.position.copy(position(angle,height,z));game.basis();return game}
function ticks(game,count){for(let i=0;i<count;i++){game.time+=1/60;game.updatePlayer(1/60)}}
const height=p=>R-Math.hypot(p.x,p.y);

test('balconies cover every window bay on both sides of the complete ring',()=>{
  for(let i=0;i<96;i++)for(const side of [-1,1]){
    const angle=i*ARC_STEP,hit=firstStationIntersection(position(angle,5,side*12),position(angle,-2,side*12),world);
    assert.equal(hit?.surface,'balcony',`bay ${i}, side ${side}`);assert.ok(Math.abs(height(hit)-DECK_HEIGHT)<1e-6);assert.ok(hit.normal.x*-Math.sin(angle)+hit.normal.y*Math.cos(angle)>.999);
  }
  assert.equal(layout.docks.length,16);assert.equal(layout.docks.filter(d=>d.side<0).length,8);
});

test('boot assist lands on either balcony and stops horizontal movement at its guardrail',()=>{
  for(const side of [-1,1]){
    const game=pilot(4*ARC_STEP,6,side*12);ticks(game,120);
    assert.equal(game.player.grounded,true);assert.equal(game.player.supportSurface.surface,'balcony');assert.ok(Math.abs(height(game.player.position)-DECK_HEIGHT-2.65)<.02);
    game.keys.add(side>0?'KeyD':'KeyA');ticks(game,180);
    assert.ok(Math.abs(game.player.position.z)<15.1,'walking must stop on the inside of the rail');
    assert.equal(game.player.grounded,true);
  }
});

test('a dash cannot tunnel through exterior guard panels or pod side walls',()=>{
  const angle=4*ARC_STEP,velocity={x:0,y:0,z:100};
  const hit=resolveStationMotion(position(angle,1.54,12),position(angle,1.54,30),velocity,1.45,world);
  assert.ok(hit.z<15.1);assert.ok(Math.abs(velocity.z)<.001);
  const result=resolveStationMotion(position(0,2,24),position(.3,2,24),{x:100,y:0,z:0},1.45,world);
  assert.ok(result.x<5.8,'a pod side wall must block lateral traversal');
});

test('each dock connects its balcony to an open room, gantry and landing pad',()=>{
  for(const dock of layout.docks){
    const game=pilot(dock.angle,DECK_HEIGHT+2.65,dock.side*12);game.keys.add(dock.side>0?'KeyD':'KeyA');ticks(game,125);
    assert.ok(Math.abs(game.player.position.z)>38,`${dock.id} doorway or bridge blocked at ${game.player.position.z}`);
    assert.equal(game.player.grounded,true);assert.equal(game.player.supportSurface.surface,'landing-pad');
  }
});

test('pod roofs and the main hull roof are landable without snapping inside the corridor',()=>{
  for(const side of [-1,1]){
    const game=pilot(0,14,side*23);ticks(game,150);assert.equal(game.player.grounded,true);
    assert.equal(game.player.supportSurface.surface,'dock-roof');assert.ok(Math.abs(height(game.player.position)-DOCK_ROOF_HEIGHT-2.65)<.03);
    game.player.velocity.copy(game.up).multiplyScalar(12);ticks(game,12);assert.ok(height(game.player.position)>DOCK_ROOF_HEIGHT+4,'a roof landing must allow jumping');
  }
  const game=pilot(.2,20,0);ticks(game,180);assert.equal(game.player.grounded,true);assert.equal(game.player.supportSurface.label,'HULL ROOF');assert.ok(height(game.player.position)>14);
});

test('landing patches have finite edges and navigation rays hit the actual exterior walls',()=>{
  assert.equal(firstStationIntersection(position(.3,10,40),position(.3,-5,40),world),null,'gaps between outer pads stay open');
  const panel=firstStationIntersection(position(0,8,57),position(0,-5,57),world);assert.equal(panel.surface,'solar');
  const wall=firstStationIntersection(position(0,3,24),position(.3,3,24),world);assert.equal(wall.surface,'exterior-solid');assert.match(wall.id,/S01-side/);assert.ok(wall.normal.x<-.9);
});

test('the tether pulls a pilot from open space onto an exterior roof',()=>{
  const game=pilot(0,22,24);game.player.magnetic=false;
  assert.equal(game.grapple.fire(game.player.position,game.up.clone().negate(),(a,b)=>game.raycastWorld(a,b)),true);
  assert.equal(game.grapple.hit.surface,'dock-roof');ticks(game,180);
  assert.equal(game.player.magnetic,true);assert.equal(game.player.grounded,true);assert.equal(game.player.supportSurface.surface,'dock-roof');assert.ok(height(game.player.position)>9.5);
});
