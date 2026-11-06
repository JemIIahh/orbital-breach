import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Rooms } from '../server/rooms.js';
import { arenaFor } from '../server/arena.js';
import { PROTOCOL, MAX_PLAYERS, MIN_PLAYERS, MATCH_SECONDS, spawnPoints, supplyPoints } from '../src/online-rules.js';
import { PoseBuffer } from '../src/online-interpolation.js';
import { SOLO_SECONDS } from '../src/match-limits.js';
import { CHAPTERS } from '../src/chapters.js';
import { OPERATIONS } from '../src/team-ops.js';
import { DEFAULT_BUILD } from '../src/parts.js';
import { stationPosition, resolveStationMotion } from '../src/physics.js';
import { createStationLayout } from '../src/station-layout.js';
function harness(count=3,map='city'){
  let time=10;const rooms=new Rooms({now:()=>time,random:()=>.5}),clients=[];
  for(let i=0;i<count;i++){const messages=[],peer=rooms.connect(m=>messages.push(structuredClone(m)));clients.push({messages,peer});rooms.receive(peer,{type:i?'join':'create',code:clients[0]?.peer.room?.code,map,name:`Pilot ${i+1}`,build:DEFAULT_BUILD,paint:i?'obsidian':'cobalt',lights:'magenta'})}
  const room=clients[0].peer.room;
  const send=(i,m)=>rooms.receive(clients[i].peer,m);
  const ready=()=>{clients.forEach((_,i)=>send(i,{type:'ready',ready:true}));send(0,{type:'start'})};
  const advance=seconds=>{for(let i=0;i<Math.ceil(seconds*60);i++){time+=1/60;rooms.step(1/60)}};
  return{rooms,clients,room,send,ready,advance,now:()=>time,setTime:t=>time=t};
}
const lastError=c=>c.messages.filter(m=>m.type==='error').at(-1)?.message;
test('real room protocol: minimum 3, maximum 8 and every player ready',()=>{
  const h=harness(2);assert.equal(h.clients[0].messages[0].protocol,PROTOCOL);h.ready();assert.equal(h.room.state,'lobby');assert.match(lastError(h.clients[0]),/At least 3/);
  const third=h.rooms.connect(()=>{});h.rooms.receive(third,{type:'join',code:h.room.code,name:'Third'});h.send(0,{type:'start'});assert.match(lastError(h.clients[0]),/Every pilot/);
  h.rooms.receive(third,{type:'ready',ready:true});h.send(0,{type:'start'});assert.equal(h.room.state,'playing');assert.equal(h.room.players.size,MIN_PLAYERS);
  const full=harness(MAX_PLAYERS);const messages=[],ninth=full.rooms.connect(m=>messages.push(m));full.rooms.receive(ninth,{type:'join',code:full.room.code});assert.match(messages.at(-1).message,/full/);assert.equal(full.room.players.size,8);full.ready();assert.equal(full.room.state,'playing');
  const positions=[...full.room.players.values()].map(p=>p.position.toArray().join(','));assert.equal(new Set(positions).size,8,'all eight pilots have separate spawns');
});
test('host-only map and launch, changing map clears ready state',()=>{
  const h=harness();h.send(1,{type:'map',map:'eden'});assert.equal(h.room.map,'city');h.send(1,{type:'start'});assert.equal(h.room.state,'lobby');h.send(0,{type:'ready',ready:true});h.send(0,{type:'map',map:'station'});assert.equal(h.room.map,'station');assert.ok([...h.room.players.values()].every(p=>!p.ready));
});
test('join errors do not leak rooms or replace existing membership',()=>{
  const h=harness();const p=h.rooms.connect(()=>{});h.rooms.receive(p,{type:'join',code:'BAD123'});assert.equal(p.room,null);h.send(0,{type:'create'});assert.equal(h.rooms.rooms.size,1);h.ready();h.rooms.receive(p,{type:'join',code:h.room.code});assert.equal(p.room,null);assert.equal(h.room.players.size,3);
});
test('disconnect migrates the host and empty rooms are removed',()=>{
  const h=harness();h.rooms.disconnect(h.clients[0].peer);assert.equal(h.room.host,h.clients[1].peer.id);for(const c of h.clients.slice(1))h.rooms.disconnect(c.peer);assert.equal(h.rooms.rooms.size,0);assert.equal(h.rooms.peers.size,0);
});
test('an abandoned match ends gracefully after the disconnect grace period',()=>{
  const h=harness();h.ready();h.rooms.disconnect(h.clients[1].peer);assert.equal(h.room.state,'playing','two remaining players can finish their started match');h.rooms.disconnect(h.clients[2].peer);h.advance(15.1);assert.equal(h.room.state,'finished');assert.equal(h.room.reason,'players');
});
test('five-minute multiplayer cap and three-minute solo caps are shared rules',()=>{
  assert.equal(MATCH_SECONDS,300);assert.equal(SOLO_SECONDS,180);assert.ok(CHAPTERS.slice(0,3).every(c=>c.par===180));assert.ok(OPERATIONS.every(o=>o.time===180));
  const h=harness();h.ready();h.setTime(h.room.ends-.01);h.rooms.step(.01);assert.equal(h.room.state,'playing');h.setTime(h.room.ends);h.rooms.step(.01);assert.equal(h.room.state,'finished');assert.equal(h.room.reason,'time');
});
test('a rematch requires everyone to ready again, retains appearance, and clears combat',()=>{
  const h=harness();h.ready();h.room.players.values().next().value.kills=9;h.rooms.finish(h.room,'time');h.send(1,{type:'rematch'});assert.equal(h.room.state,'finished');h.send(0,{type:'rematch'});assert.equal(h.room.state,'lobby');assert.ok([...h.room.players.values()].every(p=>!p.ready));h.ready();assert.equal(h.room.round,2);assert.ok([...h.room.players.values()].every(p=>p.kills===0));assert.equal([...h.room.players.values()][1].paint,'obsidian');assert.deepEqual([...h.room.players.values()][1].build,DEFAULT_BUILD);
});
function pose(q,seq,position=q.position.toArray(),epoch=q.epoch){return{type:'pose',seq,epoch,position,velocity:[0,0,0],up:q.up.toArray(),forward:q.forward.toArray(),pitch:0,magnetic:true,grounded:true}}
test('pose replication rejects teleports, NaN, excess speed, old sequences and old lives',()=>{
  const h=harness();h.ready();const q=h.room.players.get(h.clients[0].peer.id),initial=q.position.clone();h.send(0,pose(q,1));assert.equal(q.seq,1);
  h.send(0,pose(q,2,[100,100,100]));assert.ok(q.position.distanceTo(initial)<.001);assert.equal(q.correction,true);
  h.send(0,pose(q,3,[NaN,0,0]));assert.equal(q.seq,2);h.send(0,pose(q,1));assert.equal(q.seq,2);h.send(0,pose(q,4,q.position.toArray(),q.epoch-1));assert.equal(q.seq,2);
  const fast=pose(q,5);fast.velocity=[200,0,0];h.send(0,fast);assert.equal(q.correction,true);assert.ok(q.position.distanceTo(initial)<.001);
});
test('server validates real map geometry and all three maps have eight safe spawn points',()=>{
  for(const map of ['station','city','eden']){const arena=arenaFor(map);for(const p of spawnPoints(map)){const a=new T.Vector3(p.x,p.y,p.z),up=map==='station'?new T.Vector3(-p.x,-p.y,0).normalize():new T.Vector3(0,1,0);assert.ok(arena.resolve(a,a,new T.Vector3(),up).distanceTo(a)<.01,`${map} spawn is clear`)}assert.ok(supplyPoints(map).length>=3)}
  const city=arenaFor('city'),a=new T.Vector3(0,3,0),b=new T.Vector3(50,3,0);assert.ok(city.raycast(a,b),'city towers stop shots');assert.ok(city.resolve(a,b,new T.Vector3(30,0,0),new T.Vector3(0,1,0)).distanceTo(b)>1,'same geometry stops bodies');
});
test('new station circuits are continuous, collidable and connected through docks',()=>{
  const layout=createStationLayout(),state={stationSurfaces:layout.surfaces,stationSolids:layout.solids};assert.equal(layout.surfaces.filter(s=>s.surface==='freight').length,2);
  for(const z of [-26,26])for(const angle of [.32,.8,1.89,2.8]){const a=stationPosition(angle,2,z),b=stationPosition(angle,-2,z),v={x:0,y:0,z:0},p=resolveStationMotion(a,b,v,1.45,state);assert.ok(Math.abs(72-Math.hypot(p.x,p.y)-1.54)<.03)}
  assert.ok(layout.details.filter(d=>d.label==='FREIGHT CONTAINER').length>=32);
});
function combat(h){const [a,b,c]=h.room.players.values();a.position.set(0,2.74,8);b.position.set(0,2.74,18);c.position.set(0,2.74,75);for(const q of [a,b,c]){q.up.set(0,1,0);q.protectedUntil=0}return[a,b,c]}
function shoot(h,i=0,slot=0){const q=h.room.players.get(h.clients[i].peer.id);q.lastPose=h.now();h.send(i,{type:'fire',slot,direction:[0,0,1],damage:99999,target:h.clients[1].peer.id});}
test('server projectiles alone apply weapon damage; client damage and target claims are ignored',()=>{
  const h=harness();h.ready();const[a,b]=combat(h);b.shield=0;b.health=100;shoot(h);assert.equal(b.health,100,'fire request is not an instant claimed hit');h.advance(.1);assert.equal(b.health,83,'damage is the equipped MX9 value');assert.equal(a.kills,0);assert.ok(h.clients[1].messages.some(m=>m.type==='snapshot'&&m.events.some(e=>e.type==='hit')));
});
test('server enforces cooldowns, heat, spawn protection and cancels protection on firing',()=>{
  const h=harness();h.ready();const[a,b]=combat(h);a.protectedUntil=h.now()+3;b.protectedUntil=h.now()+3;shoot(h);shoot(h);assert.equal(h.room.projectiles.length,1);assert.equal(a.protectedUntil,0);h.advance(.12);assert.equal(b.health,100);assert.equal(b.shield,100);
  const count=h.room.projectiles.length;a.overheated[0]=true;a.cooldowns[0]=0;shoot(h);assert.equal(h.room.projectiles.length,count);h.send(0,{type:'fire',slot:9,direction:[0,0,1]});assert.equal(h.room.projectiles.length,count);
});
test('kills, death counters and respawns are identical for all clients and cannot award twice',()=>{
  const h=harness();h.ready();const[a,b]=combat(h);b.shield=0;b.health=20;shoot(h);h.advance(.12);shoot(h);h.advance(.12);assert.equal(a.kills,1);assert.equal(b.deaths,1);assert.equal(b.health,0);const old=b.epoch;shoot(h);h.advance(.2);assert.equal(a.kills,1);
  const snapshots=h.clients.map(c=>c.messages.filter(m=>m.type==='snapshot').at(-1));for(const snap of snapshots)assert.equal(snap.players.find(p=>p.id===a.id).kills,1);
  h.advance(4);assert.equal(b.epoch,old+1);assert.equal(b.health,100);assert.equal(b.shield,100);assert.ok(b.protectedUntil>h.now());
});
test('walls stop direct and splash damage and room combat cannot cross into another room',()=>{
  const h=harness();h.ready();const[a,b]=combat(h);h.room.arena={...h.room.arena,raycast:(from,to)=>from.clone().lerp(to,.1)};b.shield=0;shoot(h);h.advance(.2);assert.equal(b.health,100);
  const messages=[],peer=h.rooms.connect(m=>messages.push(m));h.rooms.receive(peer,{type:'create',name:'Other room'});const q=peer.room.players.get(peer.id);assert.equal(q.kills,0);assert.equal(messages.filter(m=>m.type==='snapshot').length,0);assert.equal(a.kills,0);
});
test('repair stations are shared, single use with a cooldown, and restore bounded health',()=>{
  const h=harness();h.ready();const q=[...h.room.players.values()][0],s=h.room.supplies[0];q.position.set(s.x,s.y+2.5,s.z);q.health=45;q.shield=20;q.lastHit=h.now();h.advance(.02);assert.equal(q.health,80);assert.equal(q.shield,70);assert.ok(s.readyAt>h.now());h.advance(.1);assert.equal(q.health,80);
});
test('room metadata sanitizes names and appearance without accepting arbitrary gear objects',()=>{
  const h=harness(1);const p=h.rooms.connect(()=>{});h.rooms.receive(p,{type:'join',code:h.room.code,name:'<script> X 👾',build:{rArm:'bad',torso:{}},paint:'bogus',lights:'bogus'});const q=p.room.players.get(p.id);assert.equal(q.name,'script X');assert.deepEqual(q.build,DEFAULT_BUILD);assert.equal(q.paint,'cobalt');assert.equal(q.lights,'auto');
});
test('remote interpolation delays smoothly, clamps packet gaps and does not sweep a respawn',()=>{
  const b=new PoseBuffer(.1),p=x=>({position:[x,0,0],velocity:[10,0,0],up:[0,1,0],forward:[0,0,1],pitch:0,epoch:1});b.push(1,p(0));b.push(1.1,p(1));assert.ok(Math.abs(b.sample(1.15).position[0]-.5)<1e-8);assert.equal(b.sample(10).position[0],1);b.push(1.2,{...p(100),epoch:2});assert.equal(b.sample(1.25).position[0],100);b.push(1.1,p(1));assert.equal(b.frames.length,2);
});
test('venting is replicated and cannot bypass the shared weapon cooldown',()=>{
  const h=harness();h.ready();const[a]=combat(h);a.heat=[1,1];a.overheated=[true,true];h.send(0,{type:'vent'});assert.deepEqual(a.heat,[0,0]);assert.deepEqual(a.overheated,[false,false]);shoot(h);assert.equal(h.room.projectiles.length,0);h.advance(.66);shoot(h);assert.equal(h.room.projectiles.length,1);
});
test('the fifteenth elimination ends the match once with identical final standings',()=>{
  const h=harness();h.ready();const[a,b]=combat(h);a.kills=14;b.health=1;b.shield=0;shoot(h);h.advance(.15);assert.equal(h.room.state,'finished');assert.equal(a.kills,15);assert.equal(b.deaths,1);const final=h.clients.map(c=>c.messages.filter(m=>m.type==='room').at(-1));assert.ok(final.every(m=>m.players[0].kills===15&&m.state==='finished'));h.advance(1);assert.equal(a.kills,15);
});
test('a fast physical window breach propagates to every player and room glass is isolated',()=>{
  const h=harness(3,'station');h.ready();const q=[...h.room.players.values()][0],angle=.22,p=stationPosition(angle,5,7.4);q.position.set(p.x,p.y,p.z);q.up.set(-Math.sin(angle),Math.cos(angle),0);q.lastPose=h.now()-.05;q.moveCredit=.1;
  const packet=pose(q,1,[p.x,p.y,9]);packet.velocity=[0,0,32];h.send(0,packet);assert.equal(h.room.arena.state.brokenWindows.size,1);h.advance(.06);for(const c of h.clients)assert.ok(c.messages.some(m=>m.type==='snapshot'&&m.events.some(e=>e.type==='glass')));assert.equal(arenaFor('station').state.brokenWindows.size,0);
});
