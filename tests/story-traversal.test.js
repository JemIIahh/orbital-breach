import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { simulation } from './support.js';
import { makeWorld } from '../src/world.js';
import { makeEden, terrainHeight } from '../src/eden.js';
import { Grapple } from '../src/grapple.js';
import { makeCity } from '../src/city.js';
import { Mission } from '../src/mission.js';
import { smoothSurfaceUp } from '../src/animation.js';
import { ChapterRun, KILL_POINTS } from '../src/scoring.js';
import { loadProfile } from '../src/profile.js';
import { makeTether } from '../src/props.js';
import { firstStationIntersection, hasStationLineOfSight, resolveStationMotion, stationPosition, windowKey } from '../src/physics.js';

const context={fillRect(){},strokeRect(){},beginPath(){},arc(){},fill(){},fillText(){},createRadialGradient(){return{addColorStop(){}}}};
globalThis.document={createElement(tag){assert.equal(tag,'canvas');return{width:0,height:0,getContext(){return context}}}};
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
function stationGame(){const game=simulation();game.realm='station';game.world=makeWorld(null);game.scene=game.world.scene;game.grapple=new Grapple();game.tutorial.active=false;return game}
function storyGame(){
  const game=stationGame();game.stationWorld=game.world;game.edenWorld=makeEden();game.cityWorld=makeCity();game.mission=new Mission();game.pickups=[];game.portalCooldown=0;game.transition=0;game.effectsByRealm={station:game.effects,city:game.effects,eden:game.effects};game.tether=makeTether(game.scene);game.renderPass={scene:game.scene};game.renderer={shadowMap:{needsUpdate:false}};game.scene.add(game.camera);game.spawnPlayer(true);game.initWorld();return game;
}
function ticks(game,count){for(let i=0;i<count;i++){game.time+=1/60;game.updatePlayer(1/60)}}

test('window impacts report a physical anchor normal and a specific panel key',()=>{
  const a=stationPosition(0,5,0),b=stationPosition(0,5,20),hit=firstStationIntersection(a,b);
  assert.equal(hit.surface,'window');assert.equal(hit.key,windowKey(0,1));assert.equal(hit.normal.z,-1);
});
test('shattered panels permit traversal and gunfire while the opposite glass stays intact',()=>{
  const state={brokenWindows:new Set([windowKey(0,1)])},a=stationPosition(0,5,0),b=stationPosition(0,5,20),velocity={x:0,y:0,z:40};
  assert.equal(hasStationLineOfSight(a,b,state),true);assert.equal(hasStationLineOfSight(a,stationPosition(0,5,-20),state),false);
  assert.ok(resolveStationMotion(a,b,velocity,.7,state).z>19);
  assert.ok(resolveStationMotion(stationPosition(0,1,0),stationPosition(0,1,20),{x:0,y:0,z:40},.7,state).z<8,'the solid lower frame remains intact');
});
test('weapon damage cracks a window before shattering it and persists in collision state',()=>{
  const world=makeWorld(null),hit=firstStationIntersection(stationPosition(0,5,0),stationPosition(0,5,20));
  assert.equal(world.damageWindow(hit,17),false);assert.ok(world.windows.get(hit.key).crack);
  world.damageWindow(hit,17);assert.equal(world.damageWindow(hit,17),true);assert.ok(world.brokenWindows.has(hit.key));assert.equal(world.windows.get(hit.key).crack,null);
  world.restoreWindows();assert.equal(world.brokenWindows.size,0);assert.equal(world.windows.get(hit.key).health,42);
});
test('a jumping pilot can break glass even when initially standing against the window',()=>{
  const game=stationGame();game.player.position.set(0,-69.35,6.9);game.player.velocity.y=12;game.keys.add('KeyD');
  ticks(game,100);assert.ok(game.world.brokenWindows.has(windowKey(0,1)));assert.ok(game.player.position.z>10);assert.equal(game.player.magnetic,true,'breaching preserves boot assistance');
});
test('jumping through either window lands on its exterior balcony with boots engaged',()=>{
  for(const side of [-1,1]){
    const game=stationGame(),angle=4/96*Math.PI*2,start=stationPosition(angle,2.74,side*6.9);game.player.position.set(start.x,start.y,start.z);game.basis();game.player.velocity.copy(game.up).multiplyScalar(12);game.keys.add(side>0?'KeyD':'KeyA');
    for(let i=0;i<150;i++){game.time+=1/60;game.updatePlayer(1/60);if(Math.abs(game.player.position.z)>11)game.keys.clear()}
    assert.ok(game.world.brokenWindows.has(windowKey(angle,side)));assert.ok(Math.abs(game.player.position.z)>10);assert.equal(game.player.magnetic,true);assert.equal(game.player.grounded,true);assert.equal(game.player.supportSurface.surface,'balcony');
  }
});
test('walking toward glass without jumping does not pass through the lower frame',()=>{
  const game=stationGame();game.keys.add('KeyD');ticks(game,90);assert.equal(game.world.brokenWindows.size,0);assert.ok(game.player.position.z<8);
});
test('the tether has travel time, pulls the pilot, and attaches boots to the ceiling',()=>{
  const game=stationGame(),p=stationPosition(Math.PI*2/96,2.65,0);game.player.position.set(p.x,p.y,p.z);game.basis();const start=game.player.position.clone();assert.equal(game.grapple.fire(start,v(0,1,0),(a,b)=>game.raycastWorld(a,b)),true);
  assert.equal(game.grapple.mode,'flying');ticks(game,200);
  assert.ok(game.player.position.distanceTo(start)>3);assert.equal(game.player.magnetic,true);assert.ok(game.player.surfaceUp.y<-.9);assert.equal(game.player.radialSign,1);assert.ok(game.player.position.toArray().every(Number.isFinite));
});
test('the tether rejects empty space and releasing it preserves momentum',()=>{
  const hook=new Grapple();assert.equal(hook.fire(v(),v(1,0,0),()=>null),false);
  const player={position:v(),velocity:v(9,0,0),magnetic:false};hook.fire(v(),v(1,0,0),()=>({x:30,y:0,z:0,normal:{x:-1,y:0,z:0},surface:'frame'}));hook.release();hook.update(1/60,player);assert.equal(player.velocity.x,9);assert.equal(hook.mode,'idle');
});
test('a tether pull can shatter a glass anchor and carry the pilot into space',()=>{
  const game=stationGame(),target=v(0,-67,8.5),direction=target.clone().sub(game.player.position).normalize();
  game.grapple.fire(game.player.position,direction,(a,b)=>game.raycastWorld(a,b));ticks(game,220);
  assert.ok(game.world.brokenWindows.has(windowKey(0,1)));assert.ok(game.player.position.z>9);assert.equal(game.grapple.mode,'idle');
});
test('surface orientation can rotate smoothly through a complete ceiling inversion',()=>{
  const up=v(0,1,0),target=v(0,-1,0);let previous=up.clone();
  for(let i=0;i<100;i++){smoothSurfaceUp(up,target,1/60);assert.ok(up.toArray().every(Number.isFinite));assert.ok(up.dot(previous)>.8,'the view should rotate progressively');previous.copy(up)}
  assert.ok(up.dot(target)>.999);
});
test('Eden has rendered terrain, trees, water, a portal and an archive with valid geometry',()=>{
  const world=makeEden();assert.ok(world.obstacles.length>40);assert.ok(world.portal);assert.ok(world.archive);let meshes=0;
  world.scene.traverse(object=>{if(object.isMesh){meshes++;assert.ok(object.geometry.attributes.position.array.every(Number.isFinite))}});assert.ok(meshes<100,'the landscape must stay batched');
  const x=8,z=-20,h=terrainHeight(x,z),hit=world.raycast(v(x,h+30,z),v(x,h-10,z));assert.ok(hit);assert.equal(hit.surface,'terrain');assert.ok(Math.abs(hit.y-h)<.03);assert.ok(hit.normal.y>.8);
});
test('Eden movement rests on terrain and supports a genuine jump',()=>{
  const game=stationGame();game.realm='eden';game.world=makeEden();game.player.position.set(0,terrainHeight(0,-44)+2.65,-44);game.player.velocity.y=12;
  ticks(game,20);assert.ok(game.player.position.y>terrainHeight(game.player.position.x,game.player.position.z)+4);
  ticks(game,140);assert.ok(Math.abs(game.player.position.y-terrainHeight(game.player.position.x,game.player.position.z)-2.65)<.04);
});
test('mission gates require launch, cells, all city relays and the final commander',()=>{
  const mission=new Mission();assert.equal(mission.enterCity(),false);assert.equal(mission.enterEden(),false);assert.equal(mission.recoverCell(),false);mission.launch();
  mission.recoverCell();mission.recoverCell();assert.equal(mission.gateOpen,false);mission.recoverCell();assert.equal(mission.enterCity(),true);assert.equal(mission.enterEden(),false);
  for(let wave=0;wave<3;wave++){mission.composition.forEach((_,index)=>mission.defeatEnemy(index));assert.equal(mission.stage,'city-uplink');assert.equal(mission.activateUplink(),true)}
  assert.equal(mission.upgrades,3);assert.equal(mission.enterEden(),true);mission.composition.forEach((_,index)=>mission.defeatEnemy(index));assert.equal(mission.restore(),false);mission.tick(6);assert.equal(mission.composition[0],'archon');mission.composition.forEach((_,index)=>mission.defeatEnemy(index));assert.equal(mission.restore(),true);assert.equal(mission.stage,'complete');
});
test('full campaign: launch, station cells, three city sectors, Eden boss and archive',()=>{
  const game=storyGame();assert.ok(game.bots.every(bot=>bot.dead),'the launch point starts safe');game.player.position.copy(game.world.launchConsole.position);game.interact();assert.equal(game.mission.stage,'relays');assert.equal(game.bots.filter(bot=>!bot.dead).length,3);
  for(let i=0;i<3;i++){const bot=game.bots[i];game.damageBot(bot,999,'core',bot.group.position.clone());assert.equal(game.pickups.length,1);game.player.position.copy(game.pickups[0].root.position);game.updateMission(1/60)}
  game.player.position.copy(game.world.portal.position);game.portalCooldown=0;game.updateMission(1/60);assert.equal(game.realm,'city');assert.equal(game.camera.parent,game.cityWorld.scene);
  for(let wave=0;wave<3;wave++){
    const living=game.bots.filter(bot=>!bot.dead);assert.equal(living.length,3+wave);
    living.forEach(bot=>game.damageBot(bot,9999,'core',bot.group.position.clone()));assert.equal(game.mission.stage,'city-uplink');game.player.position.copy(game.world.uplinks[wave].position);game.interact();
  }
  assert.equal(game.mission.stage,'city-portal');game.player.position.copy(game.world.portal.position);game.portalCooldown=0;game.updateMission(1/60);assert.equal(game.realm,'eden');
  game.bots.filter(bot=>!bot.dead).forEach(bot=>game.damageBot(bot,9999,'core',bot.group.position.clone()));game.updateMission(6.1);assert.equal(game.bots[0].archetype,'archon');assert.equal(game.bots.filter(bot=>!bot.dead).length,3);
  game.bots.filter(bot=>!bot.dead).forEach(bot=>game.damageBot(bot,9999,'core',bot.group.position.clone()));assert.equal(game.mission.stage,'beacon');game.player.position.copy(game.world.archive.position);game.interact();assert.equal(game.mission.stage,'complete');
  const shield=game.player.shield;game.invulnerable=0;game.spawnGrace=0;game.hurtPlayer(30);assert.equal(game.player.shield,shield);
});
test('the station gateway cannot bypass the launch objective or cell collection',()=>{
  const game=storyGame();game.player.position.copy(game.world.portal.position);game.updateMission(1/60);game.interact();assert.equal(game.realm,'station');assert.equal(game.mission.stage,'briefing');
});
test('station wardens exit through airlocks and pursue a pilot outside',()=>{
  const game=storyGame();game.mission.launch();game.syncEncounter(true);const p=stationPosition(5/96*Math.PI*2,4,22);game.player.position.set(p.x,p.y,p.z);game.theta=5/96*Math.PI*2;game.spawnGrace=0;game.invulnerable=0;
  for(let i=0;i<60*14;i++){game.time+=1/60;game.updateBots(1/60)}
  assert.ok(game.bots.some(bot=>bot.flying));assert.ok(game.bots.some(bot=>bot.flying&&bot.group.position.distanceTo(game.player.position)<22));
});

test('wardens route around exterior rooms, enter through doors and stay separated',()=>{
  for(const side of [-1,1]){
    const game=stationGame();game.initWorld();const p=stationPosition(0,2.74,side*24);game.player.position.set(p.x,p.y,p.z);game.theta=0;game.tutorial.active=true;
    for(let i=0;i<60*45;i++){game.time+=1/60;game.updateBots(1/60)}
    const attackers=game.bots.filter(bot=>bot.index%3===0&&bot.group.position.distanceTo(game.player.position)<8);
    assert.ok(attackers.length>0,'assault wardens must reach the occupied compartment');
    for(const bot of attackers){const up=v(-Math.sin(bot.angle),Math.cos(bot.angle),0);assert.equal(game.blockedByCover(bot.group.position.clone().addScaledVector(up,2.1),game.player.position),false)}
    const positions=game.bots.map(bot=>bot.group.position);assert.ok(positions.some(a=>positions.some(b=>a.distanceTo(b)>4)),'flight separation must prevent every bot stacking at one point');
  }
});

test('scored campaign: combo kills score, chapter 1 records a result and unlocks Meridian, skipped chapters never award a rank',t=>{
  const game=storyGame(),store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
  globalThis.localStorage=storage;t.after(()=>{delete globalThis.localStorage});
  game.profile=loadProfile(storage);game.run=new ChapterRun();game.runResults=[];game.suppressResults=false;game.player.grounded=true;
  game.player.position.copy(game.world.launchConsole.position);game.interact();
  const [first,second,third]=game.bots;assert.deepEqual([first,second,third].map(b=>b.archetype),['striker','bulwark','striker']);
  game.damageBot(first,999,'head',first.group.position.clone());
  assert.equal(game.run.score,KILL_POINTS.striker+50,'a headshot adds 50 to the first kill');game.player.position.copy(game.pickups[0].root.position);game.updateMission(1/60);
  game.damageBot(second,999,'core',second.group.position.clone());
  assert.equal(game.run.score,KILL_POINTS.striker+50+Math.round(KILL_POINTS.bulwark*1.5),'a chained kill is worth 1.5x');game.player.position.copy(game.pickups[0].root.position);game.updateMission(1/60);
  game.damageBot(third,999,'core',third.group.position.clone());
  const eliminations=KILL_POINTS.striker+50+Math.round(KILL_POINTS.bulwark*1.5)+KILL_POINTS.striker*2;assert.equal(game.run.score,eliminations,'a third chained kill is worth 2x');
  game.player.position.copy(game.pickups[0].root.position);game.updateMission(1/60);
  game.run.time=150;game.player.position.copy(game.world.portal.position);game.portalCooldown=0;game.updateMission(1/60);
  assert.equal(game.realm,'city');const result=game.runResults[0];assert.ok(result,'entering the city closes chapter 1');
  assert.deepEqual(result.breakdown,{eliminations,timeBonus:150,accuracyBonus:0,survival:600});assert.equal(result.rank,'S');
  assert.equal(game.profile.unlocked,1);assert.equal(game.profile.bests['0'].score,result.score);assert.equal(loadProfile(storage).bests['0'].rank,'S','the result persisted to storage');
  assert.equal(game.run.kills,0,'chapter 2 starts a fresh run');assert.equal(game.combo,0);
  game.suppressResults=true;game.run.score=99999;assert.equal(game.completeChapter(1),null,'a fast-forwarded chapter yields no result');
  assert.equal(game.profile.bests['1'],undefined);assert.equal(game.run.score,0,'the run is still reset');
});

test('gauntlet: waves advance in the city, each life lost is counted, and the last one ends the run with a saved result',t=>{
  const game=storyGame(),store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
  globalThis.localStorage=storage;t.after(()=>{delete globalThis.localStorage});
  game.profile=loadProfile(storage);game.run=new ChapterRun();game.runResults=[];game.suppressResults=false;
  const shown=[];game.ui.showResults=(result,handlers)=>{shown.push({result,handlers});return true};game.ui.hideResults=()=>{};
  game.mission.startGauntlet();game.setRealm('city');game.spawnGardenPlayer();game.syncEncounter(true);
  assert.equal(game.currentChapter(),3);assert.equal(game.realm,'city');assert.ok(game.player.position.distanceTo(v(0,2.65,-65))<.01,'the run starts at the avenue entrance');
  assert.deepEqual(game.bots.filter(b=>!b.dead).map(b=>b.archetype),['striker','gunner','striker'],'wave 1 spawns');
  for(const bot of game.bots.filter(b=>!b.dead))game.damageBot(bot,9999,'core',bot.group.position.clone());
  assert.equal(game.run.kills,3);assert.ok(game.mission.intermission>0,'clearing the squad starts the refit');
  for(let i=0;i<300;i++)game.updateMission(1/60);
  assert.equal(game.mission.wave,1,'the next wave starts after the intermission');
  const wave2=game.bots.filter(b=>!b.dead).map(b=>b.archetype);assert.deepEqual(wave2,['gunner','sniper','striker']);
  for(const bot of game.bots.filter(b=>!b.dead)){assert.ok(bot.gardenPosition.toArray().every(Number.isFinite));assert.ok(bot.health>0)}
  game.deadTimer=0;game.invulnerable=0;game.spawnGrace=0;game.killPlayer();assert.equal(game.mission.lives,2);assert.match(game.ui.messages.at(-1),/2 LIVES LEFT/);
  game.deadTimer=0;game.killPlayer();assert.equal(game.mission.lives,1);assert.match(game.ui.messages.at(-1),/1 LIFE LEFT/);
  game.simulate(1/60);assert.equal(game.player.position.distanceTo(v(0,2.65,-65))<.01,true,'a respawn returns to the avenue entrance');assert.equal(shown.length,0,'the run continues while lives remain');
  game.deadTimer=0;game.killPlayer();assert.equal(game.mission.lives,0);assert.match(game.ui.messages.at(-1),/GAUNTLET OVER/);assert.equal(shown.length,0,'the death plays out before the results');
  game.simulate(1/60);game.simulate(1/60);game.simulate(1/60);game.simulate(1/60);
  for(let i=0;i<120&&!shown.length;i++)game.simulate(1/60);
  assert.equal(shown.length,1,'the results appear once');assert.equal(game.resultsOpen,true);
  const {result}=shown[0];assert.equal(result.mode,'gauntlet');assert.equal(result.waves,1,'one wave was fully cleared');assert.equal(result.stats.deaths,3);assert.equal(result.stats.kills,3);
  assert.equal(game.profile.gauntlet.wave,1);assert.equal(loadProfile(storage).gauntlet.score,result.score,'the best run persisted');
  assert.equal(result.record.improved,true);
  game.simulate(1/60);assert.equal(shown.length,1,'ending is idempotent');
});
