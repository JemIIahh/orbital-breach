import { randomBytes, randomUUID } from 'node:crypto';
import * as T from 'three';
import { arenaFor } from './arena.js';
import { DEFAULT_BUILD, sanitizeBuild, resolveBuild, gameplayMods } from '../src/parts.js';
import { paintById, lightsById } from '../src/livery.js';
import { PROTOCOL, MIN_PLAYERS, MAX_PLAYERS, MATCH_SECONDS, KILL_LIMIT, RESPAWN_SECONDS, PROTECTION_SECONDS, MAPS, spawnPoints, supplyPoints, cleanName, finiteVector, standings } from '../src/online-rules.js';
const V=a=>new T.Vector3().fromArray(a),arr=v=>v.toArray().map(n=>Math.round(n*1000)/1000);
const unit=a=>finiteVector(a)&&Math.abs(V(a).length()-1)<.05;
export class Rooms {
  constructor({now=()=>Date.now()/1000,random=Math.random,maxRooms=24}={}){Object.assign(this,{now,random,maxRooms});this.rooms=new Map();this.peers=new Map();this.shotId=0}
  connect(send){if(this.peers.size>=192)throw Error('Server is full');const peer={id:randomUUID(),send,room:null,tokens:100,tokenAt:this.now()};this.peers.set(peer.id,peer);send({type:'hello',id:peer.id,protocol:PROTOCOL});return peer}
  error(p,text){p.send({type:'error',message:text})}
  receive(p,m){
    if(!this.peers.has(p.id)||!m||typeof m!=='object')return;
    const now=this.now();p.tokens=Math.min(160,p.tokens+(now-p.tokenAt)*120);p.tokenAt=now;if(--p.tokens<0)return;
    try{
      if(m.type==='ping'){p.send({type:'pong',at:m.at});return}
      if(m.type==='leave'){this.leave(p);return}
      if(m.type==='create'||m.type==='join'){
        if(p.room)throw Error('Leave your current room first');let room;
        if(m.type==='create'){
          if(this.rooms.size>=this.maxRooms)throw Error('All rooms are busy. Try again shortly.');
          let code;do{code=randomBytes(4).toString('hex').slice(0,6).toUpperCase()}while(this.rooms.has(code));
          room={code,map:MAPS[m.map]?m.map:'station',host:p.id,state:'lobby',players:new Map(),events:[],projectiles:[],round:0};this.rooms.set(code,room);
        }else room=this.rooms.get(String(m.code||'').trim().toUpperCase());
        if(!room)throw Error('Room not found. Check the six-character code.');
        if(room.state!=='lobby')throw Error('This match has already started. Join after it finishes.');
        if(room.players.size>=MAX_PLAYERS)throw Error('This room is full (8 players).');
        const player={id:p.id,peer:p,name:cleanName(m.name),build:sanitizeBuild(m.build||DEFAULT_BUILD),paint:paintById(m.paint).id,lights:lightsById(m.lights).id,ready:false,kills:0,deaths:0,epoch:0};
        room.players.set(p.id,player);p.room=room;this.broadcast(room);return;
      }
      const r=p.room,q=r?.players.get(p.id);if(!r||!q)throw Error('Join a room first.');
      if(m.type==='ready'&&r.state==='lobby'){q.ready=!!m.ready;this.broadcast(r)}
      if(m.type==='map'&&r.state==='lobby'){if(p.id!==r.host)throw Error('Only the host can choose the arena.');if(!MAPS[m.map])throw Error('Unknown arena');r.map=m.map;r.players.forEach(a=>a.ready=false);this.broadcast(r)}
      if(m.type==='start'){
        if(p.id!==r.host)throw Error('Only the host can launch the match.');
        if(r.state!=='lobby')throw Error('Match is already running.');
        if(r.players.size<MIN_PLAYERS)throw Error('At least 3 players are needed to launch.');
        if([...r.players.values()].some(a=>!a.ready))throw Error('Every pilot must be ready.');
        this.start(r);
      }
      if(m.type==='rematch'&&r.state==='finished'){if(p.id!==r.host)throw Error('Only the host can return everyone to the lobby.');r.state='lobby';r.players.forEach(a=>a.ready=false);this.broadcast(r)}
      if(r.state==='playing'){
        if(m.type==='pose')this.pose(r,q,m);
        if(m.type==='fire')this.fire(r,q,m);
        if(m.type==='vent'&&q.deadUntil<=now){q.heat=[0,0];q.overheated=[false,false];for(let i=0;i<2;i++)q.cooldowns[i]=Math.max(q.cooldowns[i],now+.65)}
      }
    }catch(e){this.error(p,e.message)}
  }
  publicPlayer(q,playing=false){const p={id:q.id,name:q.name,build:q.build,paint:q.paint,lights:q.lights,ready:q.ready,kills:q.kills,deaths:q.deaths};if(playing)Object.assign(p,{position:arr(q.position),velocity:arr(q.velocity),up:arr(q.up),forward:arr(q.forward),pitch:q.pitch,magnetic:q.magnetic,grounded:q.grounded,grapple:q.grapple,shield:Math.round(q.shield),health:Math.round(q.health),dead:q.deadUntil>this.now(),respawn:Math.max(0,q.deadUntil-this.now()),protected:Math.max(0,q.protectedUntil-this.now()),epoch:q.epoch,seq:q.seq,correction:q.correction});return p}
  info(r){return{type:'room',protocol:PROTOCOL,code:r.code,host:r.host,map:r.map,state:r.state,round:r.round,min:MIN_PLAYERS,max:MAX_PLAYERS,limit:KILL_LIMIT,players:standings(r.players.values()).map(q=>this.publicPlayer(q))}}
  broadcast(r){const m=this.info(r);for(const q of r.players.values())q.peer.send(m)}
  leave(p){const r=p.room;if(!r)return;p.room=null;r.players.delete(p.id);if(!r.players.size){this.rooms.delete(r.code);return}if(r.host===p.id)r.host=r.players.keys().next().value;if(r.state==='playing'){r.events.push({type:'left',id:p.id});r.shortSince=r.players.size<2?this.now():null}this.broadcast(r)}
  disconnect(p){this.leave(p);this.peers.delete(p.id)}
  start(r){
    r.arena=arenaFor(r.map);r.state='playing';r.round++;r.started=this.now();r.ends=r.started+MATCH_SECONDS;r.nextSnapshot=0;r.projectiles=[];r.events=[];r.shortSince=null;
    r.supplies=supplyPoints(r.map).map(p=>({...p,readyAt:0}));
    for(const q of r.players.values()){q.kills=0;q.deaths=0;q.mods=gameplayMods(q.build);q.parts=resolveBuild(q.build);this.spawn(r,q)}
    this.broadcast(r);this.snapshot(r);
  }
  spawn(r,q){
    const others=[...r.players.values()].filter(p=>p!==q&&p.position&&p.deadUntil<=this.now());
    const points=spawnPoints(r.map).map(p=>new T.Vector3(p.x,p.y,p.z));
    const ranked=points.map((p,i)=>({p,i,d:Math.min(999,...others.map(o=>p.distanceTo(o.position)))})).sort((a,b)=>b.d-a.d||a.i-b.i);
    const pick=ranked[0].p;q.position=pick.clone();q.velocity=new T.Vector3();q.up=r.map==='station'?new T.Vector3(-pick.x,-pick.y,0).normalize():new T.Vector3(0,1,0);q.forward=r.map==='station'?new T.Vector3(q.up.y,-q.up.x,0):new T.Vector3(0,0,1);
    q.pitch=0;q.magnetic=true;q.grounded=true;q.grapple=null;q.health=100;q.shield=100;q.deadUntil=0;q.protectedUntil=this.now()+PROTECTION_SECONDS;q.lastHit=this.now();q.lastPose=this.now();q.moveCredit=.08;q.seq=-1;q.correction=false;q.epoch++;q.cooldowns=[0,0,0,0];q.heat=[0,0];q.overheated=[false,false];q.lastFire=[-999,-999];q.chaffUntil=0;
  }
  pose(r,q,m){
    if(q.deadUntil>this.now()||m.epoch!==q.epoch||!Number.isSafeInteger(m.seq)||m.seq<=q.seq||!finiteVector(m.position)||!finiteVector(m.velocity)||!unit(m.up)||!unit(m.forward)||!Number.isFinite(m.pitch))return;
    const now=this.now(),elapsed=Math.max(0,now-q.lastPose);q.moveCredit=Math.min(.16,q.moveCredit+elapsed);q.lastPose=now;q.seq=m.seq;
    const next=V(m.position),velocity=V(m.velocity),distance=next.distanceTo(q.position),maxSpeed=Math.max(48,48*q.mods.speed*q.mods.boost),budget=maxSpeed*q.moveCredit+.08;
    q.correction=false;
    if(distance>budget||velocity.length()>maxSpeed+2||next.length()>(r.map==='station'?260:205)||r.map!=='station'&&(Math.abs(next.x)>145||Math.abs(next.z)>145)) {q.correction=true;return}
    let up=r.map==='station'?new T.Vector3(-q.position.x,-q.position.y,0).normalize():new T.Vector3(0,1,0);
    // A surface-aligned pose is accepted only beside real geometry, never a remote attachment.
    const offered=V(m.up),support=r.arena.raycast(q.position,q.position.clone().addScaledVector(offered,-4.3));if(support)up.copy(offered);
    if(r.arena.state&&distance/Math.max(.01,elapsed)>8){
      const body=q.position.clone().addScaledVector(up,-1.2),probe=next.clone().addScaledVector(up,-1.2).addScaledVector(velocity.clone().normalize(),1.65),hit=r.arena.raycast(body,probe);
      if(hit?.surface==='window'&&hit.normal&&-velocity.dot(new T.Vector3(hit.normal.x,hit.normal.y,hit.normal.z))>8){r.arena.state.brokenWindows.add(hit.key);r.events.push({type:'glass',key:hit.key,hit})}
    }
    const resolved=r.arena.resolve(q.position,next,velocity,up);
    q.correction=resolved.distanceTo(next)>.4;q.position.copy(resolved);q.velocity.copy(velocity);q.up.copy(up);q.forward.copy(V(m.forward));q.pitch=Math.max(-1.48,Math.min(1.48,m.pitch));q.magnetic=!!m.magnetic;q.grounded=!!m.grounded;
    q.moveCredit=Math.max(0,q.moveCredit-distance/maxSpeed);
    q.grapple=finiteVector(m.grapple)&&V(m.grapple).distanceTo(q.position)<112?m.grapple:null;
  }
  fire(r,q,m){
    const now=this.now(),slot=m.slot;
    if(!Number.isInteger(slot)||slot<0||slot>3||q.deadUntil>now||now-q.lastPose>.6||!unit(m.direction))return false;
    const fire=[q.parts.lArm,q.parts.rArm,q.parts.rShoulder,q.parts.lShoulder][slot]?.fire;
    if(!fire||q.cooldowns[slot]>now||slot<2&&q.overheated[slot]||r.projectiles.length>900)return false;
    q.cooldowns[slot]=now+fire.cd;q.protectedUntil=0;
    if(slot<2){q.heat[slot]=Math.min(1,q.heat[slot]+fire.heat*q.mods.heatGain);q.overheated[slot]=q.heat[slot]>=1;q.lastFire[slot]=now}
    if(fire.kind==='chaff'){q.chaffUntil=now+fire.duration;r.projectiles=r.projectiles.filter(b=>b.owner===q.id||b.position.distanceTo(q.position)>fire.radius);r.events.push({type:'chaff',id:q.id,position:arr(q.position)});return true}
    const origin=q.position.clone().addScaledVector(q.up,-.4),base=V(m.direction);
    for(let i=0;i<(fire.pellets||fire.count||1);i++){
      const direction=base.clone();if(fire.spread)direction.add(new T.Vector3((this.random()-.5)*fire.spread,(this.random()-.5)*fire.spread,(this.random()-.5)*fire.spread)).normalize();
      const b={id:++this.shotId,owner:q.id,slot,position:origin.clone(),velocity:direction.multiplyScalar(fire.speed),life:fire.life||3.5,damage:fire.damage,splash:fire.splash||0};r.projectiles.push(b);r.events.push({type:'shot',id:b.id,owner:q.id,slot,position:arr(b.position),velocity:arr(b.velocity),life:b.life});
    }return true;
  }
  damage(r,target,damage,shooter,source){
    const now=this.now();if(target.deadUntil>now||target.protectedUntil>now||target===shooter)return;
    damage*=target.mods.damageTaken*(target.chaffUntil>now?.5:1);const shield=Math.min(target.shield,damage);target.shield-=shield;target.health=Math.max(0,target.health-(damage-shield));target.lastHit=now;
    r.events.push({type:'hit',id:target.id,by:shooter?.id,damage:Math.round(damage),source:arr(source)});
    if(target.health<=0){target.deaths++;target.deadUntil=now+RESPAWN_SECONDS;target.velocity.set(0,0,0);target.grapple=null;if(shooter){shooter.kills++;shooter.shield=Math.min(100,shooter.shield+18)}r.events.push({type:'kill',id:target.id,by:shooter?.id,position:arr(target.position)});if(shooter?.kills>=KILL_LIMIT)this.finish(r,'limit')}
  }
  step(dt){
    const now=this.now();
    for(const r of this.rooms.values()){
      if(r.state!=='playing')continue;
      if(now>=r.ends||r.shortSince!=null&&now-r.shortSince>=15){this.finish(r,now>=r.ends?'time':'players');continue}
      for(const q of r.players.values()){
        if(q.deadUntil>0&&q.deadUntil<=now)this.spawn(r,q);
        if(!q.deadUntil&&now-q.lastHit>5)q.shield=Math.min(100,q.shield+18*dt);
        for(let i=0;i<2;i++){q.heat[i]=Math.max(0,q.heat[i]-dt*(now-q.lastFire[i]<.15?.17:.36)*q.mods.cooling);if(q.heat[i]<.25)q.overheated[i]=false}
      }
      for(let i=r.projectiles.length-1;i>=0;i--){
        const b=r.projectiles[i],a=b.position.clone(),end=a.clone().addScaledVector(b.velocity,dt),travel=a.distanceTo(end),world=r.arena.raycast(a,end);let point=world?new T.Vector3(world.x,world.y,world.z):end,limit=a.distanceTo(point),victim=null;
        const ray=new T.Ray(a,b.velocity.clone().normalize());
        for(const q of r.players.values()){if(q.id===b.owner||q.deadUntil>now||q.protectedUntil>now)continue;const center=q.position.clone().addScaledVector(q.up,-.7),h=ray.intersectSphere(new T.Sphere(center,1.3),new T.Vector3());if(h&&a.distanceTo(h)<=Math.min(travel,limit)){limit=a.distanceTo(h);point=h.clone();victim=q}}
        b.life-=dt;b.position.copy(point);const impact=world||victim||b.life<=0;
        if(impact){
          const shooter=r.players.get(b.owner);if(victim)this.damage(r,victim,b.damage,shooter,a);
          if(!victim&&world?.surface==='window'&&r.arena.state){r.arena.state.brokenWindows.add(world.key);r.events.push({type:'glass',key:world.key,hit:world})}
          if(b.splash)for(const q of r.players.values()){const distance=q.position.distanceTo(point);if(q!==victim&&q.id!==b.owner&&distance<b.splash&&!r.arena.raycast(point.clone().addScaledVector(b.velocity.clone().normalize(),-.1),q.position))this.damage(r,q,b.damage*(1-distance/b.splash),shooter,point)}
          r.events.push({type:'impact',id:b.id,position:arr(point),splash:b.splash});r.projectiles.splice(i,1);
        }
        if(r.state!=='playing')break;
      }
      for(const s of r.supplies){if(s.readyAt>now)continue;const pos=new T.Vector3(s.x,s.y,s.z),near=[...r.players.values()].filter(q=>!q.deadUntil&&q.position.distanceTo(pos)<4&&(q.health<100||q.shield<100)).sort((a,b)=>a.position.distanceTo(pos)-b.position.distanceTo(pos));if(near.length){const q=near[0];q.health=Math.min(100,q.health+35);q.shield=Math.min(100,q.shield+50);s.readyAt=now+25;r.events.push({type:'supply',id:q.id,point:s.id})}}
      if(r.state==='playing'&&now>=r.nextSnapshot){r.nextSnapshot=now+.05;this.snapshot(r)}
    }
  }
  snapshot(r){const m={type:'snapshot',time:this.now(),round:r.round,remaining:Math.max(0,r.ends-this.now()),players:[...r.players.values()].map(q=>this.publicPlayer(q,true)),events:r.events.splice(0),supplies:r.supplies.map(s=>({id:s.id,readyIn:Math.max(0,s.readyAt-this.now())}))};for(const q of r.players.values())q.peer.send(m)}
  finish(r,reason){if(r.state!=='playing')return;this.snapshot(r);r.state='finished';r.reason=reason;r.projectiles=[];this.broadcast(r)}
}
