import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { simulation } from './support.js';
import { makeCity } from '../src/city.js';
import { makeMech } from '../src/world.js';
import { Mission } from '../src/mission.js';
import { ENEMY_TYPES, difficultyFor } from '../src/encounters.js';
const context={fillRect(){},strokeRect(){},beginPath(){},arc(){},fill(){},fillText(){},createRadialGradient(){return{addColorStop(){}}}};
globalThis.document={createElement(){return{getContext(){return context}}}};
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
function cityGame(){const game=simulation();game.realm='city';game.world=makeCity();game.scene=game.world.scene;game.player.position.set(0,2.65,-65);game.basis();game.initWorld();return game}
function clear(mission){mission.composition.forEach((_,index)=>mission.defeatEnemy(index))}
function cityMission(){const mission=new Mission();mission.launch();for(let i=0;i<3;i++)mission.recoverCell();mission.enterCity();return mission}
function tick(game,frames){for(let i=0;i<frames;i++){game.time+=1/60;game.updateBots(1/60);game.updateBullets(1/60)}}

test('campaign launch is safe and every chapter encounter escalates without infinite respawns',()=>{
  const mission=new Mission();assert.equal(mission.combatActive,false);assert.equal(mission.launch(),true);assert.equal(mission.composition.length,3);assert.equal(mission.difficulty.tier,1);
  const game=cityGame();game.mission=cityMission();game.syncEncounter(true);game.spawnGrace=0;
  const first=game.bots[0];game.damageBot(first,9999,'core',first.group.position);for(let i=0;i<600;i++){game.time+=1/60;game.updateBots(1/60)}assert.equal(first.dead,true,'campaign enemies must stay defeated');
  const mission2=cityMission();const tiers=[];
  for(let wave=0;wave<3;wave++){tiers.push(mission2.difficulty.tier);assert.equal(mission2.activateUplink(),false);clear(mission2);assert.equal(mission2.activateUplink(),true)}
  mission2.enterEden();tiers.push(mission2.difficulty.tier);clear(mission2);mission2.tick(6);tiers.push(mission2.difficulty.tier);assert.deepEqual(tiers,[2,3,4,5,6]);assert.ok(difficultyFor('eden',1).damage>difficultyFor('station').damage);
});
test('enemy classes have different armor colors and physical silhouettes, including the commander crown',()=>{
  const mechs=Object.keys(ENEMY_TYPES).map(type=>makeMech('red',1,type)),colors=new Set(mechs.map(m=>m.paint.color.getHex()));assert.equal(colors.size,5);
  const boxes=mechs.map(mech=>new T.Box3().setFromObject(mech.group).getSize(v()));assert.ok(boxes[0].x<boxes[3].x);assert.ok(boxes[4].y>boxes[1].y*1.3);assert.ok(mechs[4].parts.filter(p=>p.userData.part==='head').length>mechs[1].parts.filter(p=>p.userData.part==='head').length);
});
test('real gunner volleys damage a stationary pilot in the city',()=>{
  const game=cityGame(),gunner=game.bots[1];game.bots=[gunner];game.configureEnemy(gunner,'gunner');gunner.gardenPosition.set(0,0,-43);gunner.justSpawned=true;gunner.fire=.1;game.positionBot(gunner,0,0);const before=game.player.shield;
  tick(game,360);assert.ok(game.player.shield<before,'the rendered enemy and actual firing path must be able to hit');assert.ok(game.player.health>0,'one gunner should give a pilot time to react');
});
test('a lancer commits its aim during the violet warning so moving aside avoids its shot',()=>{
  const game=cityGame(),sniper=game.bots[2];game.bots=[sniper];sniper.gardenPosition.set(0,0,-40);sniper.justSpawned=true;game.positionBot(sniper,0,0);sniper.fire=.8;game.enemyFire(sniper,.1,false,25);assert.ok(sniper.aimLock);const locked=sniper.aimLock.clone();game.player.position.x=12;game.enemyFire(sniper,.8,false,25);assert.equal(game.bullets.length,1);
  const shot=game.bullets[0],direction=locked.sub(shot.position).normalize();assert.ok(shot.velocity.clone().normalize().dot(direction)>.9999);for(let i=0;i<90;i++)game.updateBullets(1/60);assert.equal(game.player.shield,100);
});
test('commander strikes warn before damage and can be escaped with movement',()=>{
  for(const dodge of [false,true]){
    const game=cityGame();game.addDangerZone(game.player.position.clone(),6,2,35);game.updateDangerZones(1);assert.equal(game.player.shield,100);assert.equal(game.dangerZones.length,1);if(dodge)game.player.position.x+=10;game.updateDangerZones(1.1);assert.equal(game.player.shield,dodge?100:65);assert.equal(game.dangerZones.length,0);
  }
});
test('city buildings block shots and boosted movement while their roofs support landings and jumps',()=>{
  const game=cityGame(),world=game.world;const hit=world.raycast(v(-40,80,-30),v(-40,0,-30));assert.equal(hit.surface,'building');assert.ok(Math.abs(hit.y-22.8)<1e-6);assert.equal(hit.normal.y,1);
  const velocity=v(-100,0,0),resolved=world.resolve(v(-20,2.65,-30),v(-50,2.65,-30),velocity);assert.ok(resolved.x>-29);assert.ok(Math.abs(velocity.x)<.001);
  game.player.position.set(-40,40,-30);for(let i=0;i<180;i++){game.time+=1/60;game.updatePlayer(1/60)}assert.ok(Math.abs(game.player.position.y-hit.y-2.65)<.03);assert.equal(game.player.grounded,true);
  game.player.velocity.y=12;for(let i=0;i<12;i++)game.updatePlayer(1/60);assert.ok(game.player.position.y>hit.y+4);
  let batches=0,meshes=0;makeCity().scene.traverse(o=>{if(o.isInstancedMesh)batches++;if(o.isMesh){meshes++;assert.ok(o.geometry.attributes.position.array.every(Number.isFinite))}});assert.ok(batches<=24,`city batches ${batches}`);assert.ok(meshes<64,`city meshes ${meshes}`);
});
test('relays improve weapons and thrusters; a city checkpoint keeps cleared enemies defeated',()=>{
  const game=cityGame();game.mission=cityMission();clear(game.mission);game.mission.activateUplink();game.syncEncounter(true);const first=game.bots.find(b=>!b.dead);game.damageBot(first,9999,'core',first.group.position);game.spawnGardenPlayer();game.syncEncounter(true);assert.equal(first.dead,true);assert.equal(game.mission.wave,1);assert.ok(game.player.position.distanceTo(v(-22,2.65,-6))<.001);
  clear(game.mission);game.mission.activateUplink();game.syncEncounter(true);game.fireMissile();assert.equal(game.missileCooldown,5);game.dash();assert.equal(game.dashCooldown,1.6);
});

test('jet-equipped enemies can follow a pilot to city rooftop height',()=>{
  const game=cityGame(),gunner=game.bots[1];game.bots=[gunner];gunner.gardenPosition.set(-22,0,-30);game.player.position.set(-40,25.45,-30);game.tutorial.active=true;
  for(let i=0;i<600;i++){game.time+=1/60;game.updateBots(1/60)}assert.ok(gunner.group.position.y>17);assert.ok(gunner.group.position.toArray().every(Number.isFinite));assert.ok(gunner.hover>10);assert.equal(gunner.limbs.leftJet.visible,true);
});
