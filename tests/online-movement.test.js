import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { simulation } from './support.js';
import { Rooms } from '../server/rooms.js';
import { OnlineSession } from '../src/online-session.js';
import { Grapple } from '../src/grapple.js';
import { gameplayMods } from '../src/parts.js';
for(const map of ['station','city','eden'])test(`${map}: actual player steering sends valid predicted poses without repeated corrections`,()=>{
  let time=10;const rooms=new Rooms({now:()=>time}),peers=Array.from({length:3},()=>rooms.connect(()=>{}));rooms.receive(peers[0],{type:'create',map});const r=peers[0].room;for(const p of peers.slice(1))rooms.receive(p,{type:'join',code:r.code});for(const p of peers)rooms.receive(p,{type:'ready',ready:true});rooms.receive(peers[0],{type:'start'});
  const q=r.players.get(peers[0].id),g=simulation(),arena=r.arena;g.realm=map;g.player.position.copy(q.position);g.grapple=new Grapple();g.keys.add('KeyW');g.mods=gameplayMods(q.build);g.build=q.build;
  g.world={...arena.state,covers:[],playerLight:new T.Object3D(),terrainHeight:arena.ground,raycast:(a,b)=>{const h=arena.raycast(a,b);return h?{...h,normal:h.normal||a.clone().sub(b).normalize()}:null},resolve:(a,b,v,_radius,up)=>arena.resolve(a,b,v,up)};
  const online=Object.assign(Object.create(OnlineSession.prototype),{active:true,game:g,room:{state:'playing'},epoch:q.epoch,id:q.id,seq:0,lastSend:0,mine:rooms.publicPlayer(q,true)});g.online=online;
  let corrections=0;online.send=packet=>{rooms.receive(peers[0],packet);if(q.correction)corrections++};
  for(let i=0;i<360;i++){time+=1/60;online.mine=rooms.publicPlayer(q,true);online.simulate(1/60);rooms.step(1/60)}
  assert.ok(g.player.position.distanceTo(q.position)<2,'server tracks predicted movement');assert.ok(corrections<3,`${corrections} corrections in 6 seconds`);assert.ok(Number.isFinite(g.player.position.length()));
});
