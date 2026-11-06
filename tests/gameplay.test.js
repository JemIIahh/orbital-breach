import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { simulation } from './support.js';
import { wrapAngle } from '../src/physics.js';
import { RADIUS, TAU, stationPosition, polarAngle } from '../src/physics.js';

// Exercise the real movement and combat methods without requiring a graphics context.
function step(game,seconds){for(let t=0;t<seconds;t+=1/60){game.time+=1/60;game.updatePlayer(1/60)}}
function target(game,point){
  const group=new T.Group();group.position.copy(point);
  const mesh=new T.Mesh(new T.BoxGeometry(1.5,3,1.5),new T.MeshBasicMaterial());group.add(mesh);
  const bot={group,parts:[mesh],name:'TEST MECH',health:100,shield:45,dead:false,partHealth:{arm:70,leg:70},limbs:{leftArm:new T.Object3D(),rightLeg:new T.Object3D()}};
  mesh.userData={part:'core',bot};game.scene.add(group);game.bots.push(bot);return bot;
}

test('magnetic walking follows the curved station floor for several sectors',()=>{
  const game=simulation();game.keys.add('KeyW');step(game,15);
  assert.ok(polarAngle(game.player.position)>1,'pilot should traverse the ring');
  assert.ok(Math.abs(game.player.position.length()-(RADIUS-2.65))<.03,'pilot remains at standing height');
  assert.ok(game.player.velocity.length()>7);
});
test('boost is substantially faster than normal walking',()=>{
  const normal=simulation(),boost=simulation();normal.keys.add('KeyW');boost.keys.add('KeyW');boost.keys.add('ShiftLeft');step(normal,3);step(boost,3);
  assert.ok(boost.player.velocity.length()>normal.player.velocity.length()*2);
});
test('free flight applies no artificial gravity and damps momentum gradually',()=>{
  const game=simulation();game.player.magnetic=false;game.player.position.set(0,-65,20);game.player.velocity.set(5,0,0);step(game,1);
  assert.equal(game.player.position.y,-65);assert.ok(game.player.position.x>3);assert.ok(game.player.velocity.x>2);
});
test('space key lifts the mech above the floor',()=>{
  const game=simulation();game.keys.add('Space');step(game,1);
  assert.ok(RADIUS-Math.hypot(game.player.position.x,game.player.position.y)>3.5);
});
test('a released pilot can fly through an airlock into exterior space',()=>{
  const game=simulation(),point=stationPosition(5/96*TAU,4,0);game.player.position.set(point.x,point.y,point.z);game.player.magnetic=false;game.yaw=0;game.keys.add('KeyD');step(game,3);
  assert.ok(game.player.position.z>12,'airlock must not act as a solid window');
});
test('identical lateral flight is blocked at a windowed bay',()=>{
  const game=simulation();game.player.position.set(0,-68,0);game.player.magnetic=false;game.keys.add('KeyD');step(game,3);
  assert.ok(game.player.position.z<8);
});
test('shield regeneration waits for a safe interval after damage',()=>{
  const game=simulation();game.player.shield=20;step(game,3);assert.equal(game.player.shield,20);step(game,1.9);assert.equal(game.player.shield,20,'no recharge before the five second delay');step(game,3);assert.ok(game.player.shield>40);
});
test('Gatling rounds have travel time before swept collision damages the target',()=>{
  const game=simulation(),bot=target(game,new T.Vector3(12,-RADIUS+2.65,0));game.shoot(0);
  assert.equal(bot.shield,45);assert.equal(game.bullets.length,1);
  game.updateBullets(1/60);assert.equal(bot.shield,45);
  for(let i=0;i<8;i++)game.updateBullets(1/60);
  assert.equal(bot.shield,28);assert.equal(bot.health,100);assert.equal(game.bullets.length,0);assert.ok(game.heat[0]>0);
});
test('cooldown prevents repeat damage in the same simulation frame',()=>{
  const game=simulation(),bot=target(game,new T.Vector3(12,-RADIUS+2.65,0));game.shoot(0);game.shoot(0);
  assert.equal(bot.shield,45);assert.equal(game.bullets.length,1);
});
test('overheated weapons cannot fire',()=>{
  const game=simulation(),bot=target(game,new T.Vector3(12,-RADIUS+2.65,0));game.overheated[0]=true;game.shoot(0);
  assert.equal(bot.shield,45);assert.equal(game.bullets.length,0);
});
test('a mech across the ring cannot be shot through the ceiling',()=>{
  const game=simulation(),bot=target(game,new T.Vector3(0,69,0));game.pitch=Math.PI/2;game.shoot(0);for(let i=0;i<60;i++)game.updateBullets(1/60);
  assert.equal(bot.shield,45);assert.equal(game.bullets.length,0,'round must impact the near ceiling');
});
test('elimination scores once and marks a bot for respawning',()=>{
  const game=simulation(),bot=target(game,new T.Vector3(12,-RADIUS+2.65,0));bot.shield=0;bot.health=5;
  game.damageBot(bot,10,'core',bot.group.position);game.damageBot(bot,10,'core',bot.group.position);
  assert.equal(game.score,1);assert.equal(bot.dead,true);assert.equal(bot.group.visible,false);assert.ok(bot.respawn>0);
});
test('destroying an unshielded arm removes that limb',()=>{
  const game=simulation(),bot=target(game,new T.Vector3(12,-RADIUS+2.65,0));bot.shield=0;bot.partHealth.arm=10;
  game.damageBot(bot,15,'arm',bot.group.position);assert.equal(bot.armLost,true);assert.equal(bot.limbs.leftArm.visible,false);assert.ok(bot.health>0);
});
test('missiles have a cooldown and do not create duplicate projectiles',()=>{
  const game=simulation();game.fireMissile();game.fireMissile();assert.equal(game.projectiles.length,1);assert.equal(game.missileCooldown,7);
});

test('simulation and movement retain the same real-world speed at 20, 30 and 120 FPS',()=>{
  const games=[20,30,120].map(fps=>{const game=simulation();game.keys.add('KeyW');for(let i=0;i<fps*2;i++)game.advance(1/fps);return game});
  for(const game of games){assert.ok(Math.abs(game.time-2)<.00001);assert.ok(Math.abs(game.remaining-178)<.00001);assert.ok(game.player.velocity.length()>13)}
  assert.ok(games[0].player.position.distanceTo(games[2].player.position)<.001);
});
test('thruster dash accelerates immediately, respects its cooldown, and cannot cross a window',()=>{
  const game=simulation();game.keys.add('KeyD');assert.equal(game.dash(),true);assert.equal(game.dash(),false);game.updatePlayer(1/60);
  assert.ok(game.player.velocity.length()>40);step(game,.3);assert.ok(game.player.position.z<8,'swept collision stops even a dash at a closed window');
});
test('enemy projectiles can be dodged instead of dealing instant hitscan damage',()=>{
  const stationary=simulation(),dodging=simulation();
  for(const game of [stationary,dodging])game.bullets.push({position:new T.Vector3(12,-RADIUS+2.0,0),velocity:new T.Vector3(-46,0,0),owner:'enemy',damage:12,life:1});
  dodging.keys.add('KeyD');
  for(let i=0;i<30;i++){stationary.updatePlayer(1/60);stationary.updateBullets(1/60);dodging.updatePlayer(1/60);dodging.updateBullets(1/60)}
  assert.equal(stationary.player.shield,88);assert.equal(dodging.player.shield,100);
});
test('tutorial and spawn shield block hostile projectile damage',()=>{
  for(const mode of ['tutorial','spawn']){
    const game=simulation();if(mode==='tutorial')game.tutorial.reset();else game.spawnGrace=3;
    game.bullets.push({position:new T.Vector3(4,-RADIUS+2,0),velocity:new T.Vector3(-46,0,0),owner:'enemy',damage:12,life:1});
    for(let i=0;i<15;i++)game.updateBullets(1/60);assert.equal(game.player.shield,100);
  }
});
test('practice eliminations do not count toward the competitive match',()=>{
  const game=simulation();game.tutorial.reset();const bot=target(game,new T.Vector3(12,-RADIUS+2.65,0));bot.health=5;bot.shield=0;
  game.damageBot(bot,20,'core',bot.group.position);assert.equal(bot.dead,true);assert.equal(game.score,0);
});
test('initial enemy deployment leaves at least forty metres of approach distance',()=>{
  const game=simulation();game.spawnPlayer(true);game.initWorld();
  for(const bot of game.bots)assert.ok(Math.abs(wrapAngle(bot.angle-game.theta))*RADIUS>=40);
  for(let i=0;i<game.bots.length;i++)for(let j=i+1;j<game.bots.length;j++)assert.ok(Math.abs(wrapAngle(game.bots[i].angle-game.bots[j].angle))*RADIUS>14);
});
test('assault bots pursue into close range while ranged bots stay separated',()=>{
  const game=simulation();game.spawnPlayer(true);game.initWorld();game.spawnGrace=0;
  for(let i=0;i<60*60;i++){game.time+=1/60;game.updateBots(1/60)}
  for(const bot of game.bots)assert.ok(Math.abs(wrapAngle(bot.angle-game.theta))*RADIUS>(bot.index%3===0?3:12),'bots should stay outside body contact');
  assert.ok(game.bots.some(bot=>Math.abs(wrapAngle(bot.angle-game.theta))*RADIUS<10),'assault wardens must actually pursue the pilot');
  for(let i=0;i<game.bots.length;i++)for(let j=i+1;j<game.bots.length;j++)assert.ok(game.bots[i].group.position.distanceTo(game.bots[j].group.position)>3.5,'bots should separate from one another');
});
test('respawning uses a safe sector and grants protection',()=>{
  const game=simulation();game.spawnPlayer(true);game.initWorld();game.spawnPlayer();
  assert.equal(game.invulnerable,5);assert.ok(game.spawnGrace>0);
  for(const bot of game.bots)assert.ok(Math.abs(wrapAngle(bot.angle-game.theta))*RADIUS>40);
});
test('hostiles do not launch rounds while an on-screen lesson is active',()=>{
  const game=simulation();game.spawnPlayer(true);game.initWorld();game.tutorial.reset();game.spawnGrace=0;
  for(let i=0;i<60*12;i++){game.time+=1/60;game.updateBots(1/60)}
  assert.equal(game.bullets.length,0);
});
test('completing flight lessons resets targets to safe distances before combat begins',()=>{
  const game=simulation();game.spawnPlayer(true);game.initWorld();game.score=8;game.player.shield=1;game.tutorial.active=false;game.tutorial.justCompleted=true;game.beginCombat();
  assert.equal(game.score,0);assert.equal(game.remaining,180);assert.equal(game.player.shield,100);assert.equal(game.spawnGrace,3);
  for(const bot of game.bots)assert.ok(Math.abs(wrapAngle(bot.angle-game.theta))*RADIUS>=39.9);
});
test('replaying instructions preserves the existing match timer and scores',()=>{
  const game=simulation();game.spawnPlayer(true);game.initWorld();game.trainingReplay=true;game.remaining=160;game.score=7;game.enemyScore=2;game.beginCombat();
  assert.equal(game.score,7);assert.equal(game.enemyScore,2);assert.equal(game.remaining,160);assert.equal(game.trainingReplay,false);
});
