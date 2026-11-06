import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {makeMech,makeWorld} from '../src/world.js';
import {makeCity} from '../src/city.js';
import {BULWARK,applyBulwarkDamage} from '../src/bulwark.js';
import {Mission} from '../src/mission.js';
import {ChapterRun,KILL_POINTS} from '../src/scoring.js';
import {TeamBattle} from '../src/team-battle.js';
import {opById} from '../src/team-ops.js';
import {firstStationIntersection,stationPosition} from '../src/physics.js';
import {simulation} from './support.js';
const ctx={fillRect(){},strokeRect(){},beginPath(){},arc(){},fill(){},fillText(){},createRadialGradient(){return{addColorStop(){}}}};
globalThis.document={createElement(){return{getContext(){return ctx}}}};
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
function heavy(){
  const b={...makeMech('red',1,'bulwark'),archetype:'bulwark',name:'BULWARK',index:1,health:190,shield:80,maxHealth:190,maxShield:80,dead:false,angle:0,hover:0,gardenPosition:v(),fire:0,partHealth:{arm:70,leg:70},armLost:false,legLost:false};
  b.parts.forEach(p=>p.userData.bot=b);return b;
}
function combat(){
  const g=simulation();g.realm='city';g.world={...g.world,raycast:()=>null};g.run=new ChapterRun();g.player.position.set(0,2.65,10);g.player.grounded=false;g.dashCooldown=2.4;
  const b=heavy();g.bots=[b];g.scene.add(b.group);return{g,b};
}

test('the visible rear reactor is actual hit geometry, and cannot be targeted through the front hull',()=>{
  const b=heavy();b.group.updateMatrixWorld(true);
  const rear=new T.Raycaster(v(0,2.4,8),v(0,0,-1)).intersectObjects(b.parts,false)[0];
  const front=new T.Raycaster(v(0,2.4,-8),v(0,0,1)).intersectObjects(b.parts,false)[0];
  assert.equal(rear.object.userData.part,'reactor');assert.notEqual(front.object.userData.part,'reactor');
  assert.ok(b.group.userData.reactor.material.emissiveIntensity>1);
});

test('front armor reduces direct rounds, rear reactor bypasses shields, and splash remains viable',()=>{
  const front=heavy(),rear=heavy(),splash=heavy();
  applyBulwarkDamage(front,20,'core',v(0,2,-10));assert.ok(Math.abs(front.shield-(80-20*BULWARK.frontScale))<1e-9);assert.equal(front.health,190);
  const critical=applyBulwarkDamage(rear,20,'reactor',v(0,2,10));assert.equal(critical.reactor,true);assert.equal(rear.shield,80);assert.equal(rear.health,140);
  applyBulwarkDamage(splash,100,'reactor',v(0,2,-10),{direct:false});assert.equal(splash.shield,0);assert.equal(splash.health,170);
  const exposed=heavy();exposed.armLost=true;applyBulwarkDamage(exposed,20,'core',v(0,2,-10));assert.equal(exposed.shield,60,'destroying the shield arm removes directional protection');
});

test('real projectile impacts reward an airborne reactor kill once and use the incoming round direction',()=>{
  const {g,b}=combat();b.health=40;
  g.bullets.push({position:v(0,2.4,8),velocity:v(0,0,-500),life:1,owner:'player',weapon:0,damage:17,shot:g.run.registerShot()});
  g.updateBullets(1/60);assert.equal(b.dead,true);assert.equal(g.dashCooldown,0);
  assert.equal(g.run.score,KILL_POINTS.bulwark+50+100);assert.equal(g.run.kills,1);assert.ok(g.ui.messages.some(m=>m.includes('DASH READY')));
  g.dashCooldown=1;g.damageBot(b,100,'reactor',v(0,2.4,1.2));assert.equal(g.dashCooldown,1,'dead targets cannot recharge another dash');
  const other=combat(); // The pilot is behind it, but the incoming projectile is from the front.
  other.g.bullets.push({position:v(0,2.4,-8),velocity:v(0,0,500),life:1,owner:'player',damage:20});other.g.updateBullets(1/60);
  assert.ok(Math.abs(other.b.shield-(80-20*BULWARK.frontScale))<.001);assert.equal(other.b.health,190);
});

test('ground kills and explosions never grant the airborne reactor dash reward',()=>{
  for(const mode of ['ground','splash','training']){
    const {g,b}=combat();b.health=20;if(mode==='ground')g.player.grounded=true;if(mode==='training')g.tutorial.active=true;
    g.damageBot(b,200,'reactor',v(0,2.4,1.2),0,{source:v(0,2,10),direct:mode!=='splash'});
    assert.equal(b.dead,true);assert.equal(g.dashCooldown,2.4,mode);
  }
});

test('Bulwarks turn slowly enough to flank and cannot fire backward through their own armor',()=>{
  const {g,b}=combat();const before=b.group.quaternion.clone();g.positionBot(b,0,1/60);
  assert.ok(before.angleTo(b.group.quaternion)<=BULWARK.turnRate/60+.00001);
  g.enemyFire(b,1/60,false,10);assert.equal(g.bullets.length,0);
  b.group.rotation.y=Math.PI;b.fire=0;g.enemyFire(b,1/60,false,10);assert.equal(g.bullets.length,1,'fires once the gun faces its target');
});

test('the opening guides a glass breach and a real exterior tether route without adding progression locks',()=>{
  const g=simulation();g.mission=new Mission();g.mission.launch();g.world=makeWorld(null);g.pickups=[];g.bots=[heavy()];
  assert.deepEqual(g.mission.composition,['striker','bulwark','striker']);assert.equal(g.mission.openingStep,'breach');assert.match(g.objectiveTarget().label,/BREACH/);
  const p=stationPosition(0,5,0),end=stationPosition(0,5,20),hit=firstStationIntersection(p,end,g.world);
  g.worldImpact(hit,v(hit.x,hit.y,hit.z),{owner:'player',damage:42,velocity:v(0,0,100)});
  assert.equal(g.mission.openingStep,'tether');const target=g.objectiveTarget();assert.match(target.label,/EXTERIOR PAD/);
  const outside=stationPosition(0,5,10),pad=firstStationIntersection(outside,target.position,g.world);assert.ok(pad);assert.equal(pad.surface,'landing-pad');
  assert.equal(g.mission.recordOpening('tether'),true);assert.equal(g.mission.recordOpening('tether'),false);assert.equal(g.mission.openingStep,'reactor');
  for(let i=0;i<3;i++)g.mission.recoverCell();assert.equal(g.mission.gateOpen,true,'the route never prevents an ordinary campaign clear');
  g.mission.reset();assert.equal(g.mission.opening.breach,false);
});

test('reactor kills use the same shield bypass and airborne dash reward in Team Ops',()=>{
  const {g}=combat();g.battle=new TeamBattle(g,opById('meridian-crossfire'),'blue','veteran');g.battle.begin();g.battle.state='live';g.bots=g.battle.foes;
  const b=g.battle.foes.find(b=>b.archetype==='bulwark');b.protect=0;b.health=20;b.shield=80;b.group.position.set(0,0,0);b.group.quaternion.identity();
  g.battle.playerHit(b,17,'reactor',v(0,2.4,1.2),{source:v(0,2,10),direct:true});
  assert.equal(b.dead,true);assert.equal(g.dashCooldown,0);assert.equal(g.battle.stats.kills,1);assert.equal(g.run.score,KILL_POINTS.bulwark+150);
});

test('each relay restores only its district, fades lights on, and resets cleanly without new draw calls',()=>{
  const city=makeCity(),count=()=>{let n=0;city.scene.traverse(o=>{if(o.isMesh)n++});return n},before=count();
  for(let i=0;i<180;i++)city.update(i/60,false,false,1,1);
  assert.ok(city.powerLevels.x>.99);assert.equal(city.powerLevels.y,0);assert.equal(city.powerLevels.z,0);
  for(let i=180;i<360;i++)city.update(i/60,false,false,2,2);
  assert.ok(city.powerLevels.y>.99);assert.equal(city.powerLevels.z,0);
  for(let i=360;i<540;i++)city.update(i/60,true,false,2,3);
  assert.ok(city.powerLevels.z>.99);assert.equal(count(),before);
  const kinds=new Set();city.scene.traverse(o=>{if(o.name==='city:facade:box'||o.name==='city:glow:box'||o.name==='city:signage'){
    const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>'};o.material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.uPower.value,city.powerLevels);kinds.add(o.name);
  }});assert.equal(kinds.size,3,'facades, lighting and billboard graphics share district power');
  city.update(0,false,false,0,0);assert.deepEqual(city.powerLevels.toArray(),[0,0,0]);
});
