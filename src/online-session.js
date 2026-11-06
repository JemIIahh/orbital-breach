import * as T from 'three';
import { OnlineLobby } from './online-lobby.js';
import { PoseBuffer } from './online-interpolation.js';
import { PROTOCOL, MAPS, supplyPoints, standings } from './online-rules.js';
import { makeMech } from './mech-frame.js';
import { paintMech, disposeMech } from './mech-parts.js';
import { liveryFor } from './livery.js';
import { animateMech } from './animation.js';
import { makeTether } from './props.js';
import { Mission } from './mission.js';
import { damageFeel } from './combat-feel.js';
const V=a=>new T.Vector3().fromArray(a),$=id=>document.getElementById(id);
export class OnlineSession {
  constructor(game){
    this.game=game;this.active=false;this.room=null;this.id=null;this.remotes=new Map();this.shots=new Map();this.lastSend=0;this.seq=0;this.ping=0;this.lobby=new OnlineLobby(this);
    this.entry=document.createElement('button');this.entry.className='online-entry';this.entry.type='button';this.entry.textContent='MULTIPLAYER · 3–8 PILOTS ↗';document.querySelector('.menu-actions').append(this.entry);this.entry.addEventListener('click',()=>this.open());
    this.board=document.createElement('aside');this.board.className='online-scoreboard hidden';this.board.setAttribute('aria-label','Multiplayer standings');document.body.append(this.board);
    const code=new URL(location.href).searchParams.get('room');if(code&&/^[a-z0-9]{6}$/i.test(code))queueMicrotask(()=>{this.open();this.lobby.el('ol-code-input').value=code.toUpperCase();this.lobby.message('Invitation loaded. Enter a callsign and join your friends.');});
  }
  open(){if(this.game.running)this.game.pause();if(!this.lobby.visible)this.lobby.open()}
  async connect(){
    if(this.socket?.readyState===WebSocket.OPEN&&this.id)return;if(this.connecting)return this.connecting;
    this.connecting=new Promise((resolve,reject)=>{
      let endpoint=import.meta.env.VITE_MULTIPLAYER_URL||new URL('/socket',location.href).href.replace(/^http/,'ws');
      const ws=new WebSocket(endpoint);this.socket=ws;this.id=null;this.lobby.el('ol-connection').textContent='CONNECTING…';
      const timeout=setTimeout(()=>{ws.close();reject(Error('Server did not respond. Start the multiplayer server and try again.'))},8000);
      ws.addEventListener('message',event=>{try{const m=JSON.parse(event.data);if(m.type==='hello'){if(m.protocol!==PROTOCOL){ws.close();reject(Error('Client and server versions differ. Reload the game.'));return}this.id=m.id;clearTimeout(timeout);this.lobby.el('ol-connection').textContent='CONNECTED · LIVE SERVER';resolve();this.pinger=setInterval(()=>this.send({type:'ping',at:performance.now()}),3000)}this.message(m)}catch(e){console.error('Multiplayer packet rejected',e)}});
      ws.addEventListener('error',()=>{clearTimeout(timeout);reject(Error('Cannot reach multiplayer. Run npm run dev, or check the server address.'))});
      ws.addEventListener('close',()=>{clearTimeout(timeout);clearInterval(this.pinger);this.id=null;this.connecting=null;reject(Error('Connection closed'));if(this.room||this.active){this.cleanup();this.room=null;if(!this.lobby.visible)this.lobby.open();this.lobby.render();this.lobby.message('Disconnected. Your previous room was left. Rejoin with its code.')}this.lobby.el('ol-connection').textContent='DISCONNECTED'});
    }).finally(()=>this.connecting=null);return this.connecting;
  }
  send(m){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(m))}
  async create(){try{await this.connect();this.send({type:'create',map:'station',...this.lobby.credentials()})}catch(e){this.lobby.message(e.message)}}
  async join(code){try{await this.connect();this.send({type:'join',code,...this.lobby.credentials()})}catch(e){this.lobby.message(e.message)}}
  message(m){
    if(m.type==='error'){this.lobby.message(m.message);return}
    if(m.type==='pong'){this.ping=Math.round(performance.now()-m.at);return}
    if(m.type==='room'){
      this.room=m;
      if(m.state==='playing'&&!this.active)this.enter();
      if(m.state==='finished'){this.game.running=false;this.game.buttons=[false,false];this.game.keys.clear();this.game.audio.pause();document.exitPointerLock?.();this.board.classList.add('hidden');if(!this.lobby.visible)this.lobby.open();}
      if(m.state==='lobby'&&this.active){this.cleanup();if(!this.lobby.visible)this.lobby.open()}
      this.lobby.render();return;
    }
    if(m.type!=='snapshot'||!this.active||m.round!==this.room.round)return;
    this.serverAt=m.time;this.receivedAt=performance.now()/1000;this.snapshot=m;this.game.remaining=m.remaining;
    const ids=new Set(m.players.map(p=>p.id));
    for(const [id,actor] of this.remotes)if(!ids.has(id))this.removeActor(id,actor);
    for(const p of m.players){
      if(p.id===this.id){this.self(p);continue}
      let actor=this.remotes.get(p.id);
      if(!actor){actor=this.addActor(p)}actor.buffer.push(m.time,p);actor.health=p.health;actor.shield=p.shield;actor.dead=p.dead;actor.name=p.name;
    }
    for(const e of m.events)this.event(e);
    for(const p of m.supplies){const mesh=this.supplies?.find(s=>s.id===p.id);if(mesh){mesh.readyIn=p.readyIn;mesh.group.visible=p.readyIn<=0}}
  }
  enter(){
    const g=this.game;g.resetMatch();this.savedBots=g.bots;g.bots.forEach(b=>{b.dead=true;b.group.visible=false});g.bots=[];g.mission=null;g.dropTeamMatch();g.setRealm(this.room.map);g.cityWorld?.setArena(false);g.stationWorld.restoreWindows();g.tutorial.active=false;g.tutorial.justCompleted=false;
    g.started=true;g.ended=false;g.time=0;g.remaining=300;g.running=false;g.thirdPerson=true;g.weapons.visible=false;g.heroMech.group.visible=false;g.transition=0;g.chapterTime=0;g.radio=null;g.spawnGrace=0;g.invulnerable=0;g.heat=[0,0];g.overheated=[false,false];g.cooldowns=[0,0];g.clearDangerZones();g.player.velocity.set(0,0,0);g.grapple.release();g.bullets=[];g.recoil=[0,0];g.missileCooldown=0;g.leftShoulderCooldown=0;
    this.active=true;this.epoch=null;this.seq=0;this.lastSend=0;this.snapshot=null;this.supplies=supplyPoints(this.room.map).map(p=>this.makeSupply(p));$('menu').classList.add('hidden');$('hud').classList.add('hidden');g.ui.clearCombat();
  }
  async resume(){
    if(!this.active||this.room?.state!=='playing')return;
    try{await this.game.lockPointer();this.lobby.close();const g=this.game;g.running=true;g.started=true;g.clock.getDelta();g.accumulator=0;g.audio.start();this.sendPose();$('menu').classList.add('hidden');$('hud').classList.remove('hidden');this.board.classList.remove('hidden');g.renderer.shadowMap.needsUpdate=true}catch{this.lobby.message('Click ENTER ARENA again to allow mouse capture.')}
  }
  pause(release=true){const g=this.game;g.running=false;g.keys.clear();g.buttons=[false,false];g.accumulator=0;g.audio.pause();if(release)document.exitPointerLock?.();$('hud').classList.add('hidden');this.board.classList.add('hidden');if(!this.lobby.visible)this.lobby.open()}
  leave(){this.send({type:'leave'});this.cleanup();this.room=null;this.lobby.render();this.lobby.message('Room left. Create another room or join with a code.')}
  cleanup(){
    if(!this.active)return;const g=this.game;this.active=false;g.running=false;document.exitPointerLock?.();
    for(const [id,a] of this.remotes)this.removeActor(id,a);this.remotes.clear();for(const s of this.supplies||[]){g.scene.remove(s.group);s.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose()})}this.supplies=[];
    this.shots.clear();g.bullets=[];g.grapple.release();g.bots=this.savedBots||[];g.mission=new Mission();g.resetMatch();g.started=false;g.ui.clearTeamHud();g.heroMech.group.visible=true;g.playerMech.group.visible=false;g.weapons.visible=false;g.audio.pause();$('menu').classList.remove('hidden');$('hud').classList.add('hidden');this.board.classList.add('hidden');g.refreshMenuSummary();
  }
  makeSupply(p){
    const g=this.game,group=new T.Group(),material=new T.MeshStandardMaterial({color:'#93d7c5',emissive:'#397b68',emissiveIntensity:.5,roughness:.5,metalness:.5});
    const base=new T.Mesh(new T.CylinderGeometry(1.4,1.6,.2,20),material);group.add(base);const core=new T.Mesh(new T.OctahedronGeometry(.6),material.clone());core.position.y=1.1;group.add(core);const up=this.room.map==='station'?new T.Vector3(-p.x,-p.y,0).normalize():new T.Vector3(0,1,0);group.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),up);group.position.set(p.x,p.y,p.z);g.scene.add(group);return{id:p.id,group,core,readyIn:0};
  }
  addActor(p){const g=this.game,mech=makeMech('red',1,'gunner',p.build);paintMech(mech,liveryFor(p));const a={...mech,id:p.id,name:p.name,archetype:'pilot',health:p.health,shield:p.shield,maxHealth:100,maxShield:100,angle:0,dead:p.dead,buffer:new PoseBuffer(),rope:makeTether(g.scene),recoil:0,hit:0};a.parts.forEach(part=>part.userData.bot=a);g.scene.add(a.group);this.remotes.set(p.id,a);g.bots.push(a);return a}
  removeActor(id,a){this.game.scene.remove(a.group);disposeMech(a.group);a.rope.root.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose()});a.rope.root.removeFromParent();this.remotes.delete(id);this.game.bots=this.game.bots.filter(b=>b!==a)}
  self(p){
    const g=this.game,spawn=this.epoch!==p.epoch;
    if(spawn){this.epoch=p.epoch;g.player.position.fromArray(p.position);g.prevPos?.copy(g.player.position);g.player.velocity.set(0,0,0);g.player.surfaceUp=null;g.player.radialSign=null;g.player.magnetic=true;g.player.bootDelay=0;g.grapple.release();g.yaw=0;g.pitch=0;g.dashCooldown=0;g.dashTime=0;g.cooldowns=[0,0];g.heat=[0,0];g.overheated=[false,false];g.deadTimer=0;g.basis();}
    if(p.correction&&p.seq>=this.seq-4){g.player.position.fromArray(p.position);g.prevPos?.copy(g.player.position);g.player.velocity.fromArray(p.velocity);g.grapple.release()}
    this.mine=p;g.player.health=p.health;g.player.shield=p.shield;g.invulnerable=p.protected;g.deadTimer=p.dead?Math.max(.01,p.respawn):0;g.playerMech.group.visible=!p.dead&&g.thirdPerson;
  }
  fire(slot,direction){if(!this.active||this.room.state!=='playing'||this.mine?.dead)return;this.send({type:'fire',slot,direction:direction.toArray()})}
  sendPose(){
    const g=this.game,grapple=g.grapple?.hit?.point;g.basis();this.lastSend=g.time;
    this.send({type:'pose',epoch:this.epoch,seq:++this.seq,position:g.player.position.toArray(),velocity:g.player.velocity.toArray(),up:g.up.toArray(),forward:g.forward.toArray(),pitch:g.pitch,magnetic:g.player.magnetic,grounded:g.player.grounded,grapple:grapple&&g.grapple.mode!=='idle'?grapple.toArray():null});
  }
  simulate(dt){
    const g=this.game;if(this.room?.state!=='playing')return;(g.prevPos||(g.prevPos=new T.Vector3())).copy(g.player.position);g.time+=dt;
    if(!this.mine?.dead)g.updatePlayer(dt);else{g.player.velocity.set(0,0,0);g.buttons=[false,false]}
    // Health, protection and respawn belong exclusively to the shared server.
    if(this.mine){g.player.health=this.mine.health;g.player.shield=this.mine.shield;g.invulnerable=this.mine.protected}
    for(let i=0;i<2;i++){g.cooldowns[i]=Math.max(0,g.cooldowns[i]-dt);g.heat[i]=Math.max(0,g.heat[i]-dt*(g.buttons[i]?.17:.36)*(g.mods?.cooling||1));if(g.overheated[i]&&g.heat[i]<.25)g.overheated[i]=false;if(g.buttons[i])g.shoot(i)}
    g.missileCooldown=Math.max(0,g.missileCooldown-dt);g.leftShoulderCooldown=Math.max(0,(g.leftShoulderCooldown||0)-dt);g.chaffTime=Math.max(0,(g.chaffTime||0)-dt);
    if(g.keys.has('KeyG'))for(let slot=0;slot<2;slot++)if(g.shoulderPart(slot)?.fire?.kind==='gun')g.fireShoulder(slot);
    if(g.time-this.lastSend>=.049)this.sendPose();
    g.sense?.step(dt,{velocity:g.player.velocity,forward:g.forward,right:g.right,up:g.up,grounded:!!g.player.grounded,boosting:g.keys.has('ShiftLeft')||g.keys.has('ShiftRight')});
  }
  event(e){
    const g=this.game;
    // A paused pilot still receives the authoritative world, but does not accumulate unseen effects.
    if(!g.running){if(e.type==='glass'&&g.realm==='station')g.world.damageWindow?.(e.hit,100);return}
    if(e.type==='shot'){
      const bullet={position:V(e.position),velocity:V(e.velocity),life:e.life,owner:'online',weapon:e.slot,color:e.owner===this.id?'#a8e7ed':'#ffb38c'};g.bullets.push(bullet);this.shots.set(e.id,bullet);const a=this.remotes.get(e.owner);if(a){a.recoil=1;if(g.player.position.distanceTo(a.group.position)<60)g.audio.play(e.slot<2?'gatling':'missile',{volume:.3})}
    }
    if(e.type==='impact'){const b=this.shots.get(e.id);if(b)b.life=0;this.shots.delete(e.id);const point=V(e.position);if(g.player.position.distanceTo(point)<100){if(e.splash)g.effects.explosion(point,Math.min(2.6,e.splash/3));else g.effects.burst(point,'#a7dae8',5,5)}}
    if(e.type==='glass'&&g.realm==='station')g.world.damageWindow?.(e.hit,100,g.effects);
    if(e.type==='hit'){if(e.by===this.id)g.ui.hit();const a=this.remotes.get(e.id);if(a)a.hit=1;if(e.id===this.id){const feel=damageFeel(e.damage,100,100,this.mine?.shield||0,this.mine?.health||0);g.ui.damage(feel,g.bearingTo(V(e.source)));g.audio.play('hurt',{volume:.6});g.sense?.event('hurt',{amount:feel.amount})}}
    if(e.type==='kill'){const name=id=>id===this.id?'YOU':this.room.players.find(p=>p.id===id)?.name||'PILOT';g.ui.killFeed(name(e.by),name(e.id),'red');g.effects.explosion(V(e.position),1.2);if(e.id===this.id){g.ui.event('CORE DESTROYED\nREDEPLOYING IN 4 SECONDS',3);g.grapple.release();g.buttons=[false,false]}else if(e.by===this.id)g.audio.play('kill')}
    if(e.type==='supply'&&e.id===this.id){g.ui.event('FIELD REPAIR · +35 CORE / +50 SHIELD',1.5);g.audio.play('ui')}
    if(e.type==='chaff')g.effects.burst(V(e.position),'#ffd27a',18,8);
  }
  render(dt){
    if(this.lobby.visible){this.lobby.update(performance.now());return true}
    if(!this.active)return false;const g=this.game,serverTime=(this.serverAt||0)+(performance.now()/1000-(this.receivedAt||performance.now()/1000));
    for(const a of this.remotes.values()){
      const p=a.buffer.sample(serverTime);if(!p)continue;const up=V(p.up).normalize(),f=V(p.forward).normalize();a.angle=Math.atan2(p.position[0],-p.position[1]);a.group.position.fromArray(p.position).addScaledVector(up,-2.6);a.group.quaternion.setFromRotationMatrix(new T.Matrix4().lookAt(new T.Vector3(),f,up));a.group.visible=!p.dead;a.recoil=Math.max(0,a.recoil-dt*8);a.hit=Math.max(0,a.hit-dt*6);
      animateMech(a,{dt,time:g.time,speed:V(p.velocity).length(),forward:V(p.velocity).dot(f),vertical:V(p.velocity).dot(up),airborne:!p.grounded,aimPitch:p.pitch,recoil:a.recoil,hit:a.hit,boost:V(p.velocity).length()>24});
      const origin=(a.limbs.leftGun?.userData.flash||a.group).getWorldPosition(new T.Vector3()),grapple=p.grapple?{mode:'pulling',hit:{point:V(p.grapple)},tip:V(p.grapple),distance:origin.distanceTo(V(p.grapple))}:{mode:'idle'};a.rope.update(origin,grapple,up);
    }
    for(let i=g.bullets.length-1;i>=0;i--){const b=g.bullets[i];b.life-=dt;b.position.addScaledVector(b.velocity,dt);if(b.life<=0)g.bullets.splice(i,1)}
    for(const s of this.supplies||[])s.core.rotation.y+=dt;
    return false;
  }
  hud(){
    if(!this.active||!this.snapshot)return;const table=standings(this.snapshot.players),me=table.find(p=>p.id===this.id),g=this.game;
    if(me?.dead){g.playerMech.group.visible=false;g.weapons.visible=false}else g.weapons.visible=!g.thirdPerson;
    const spans=document.querySelectorAll('.match .team span');if(spans[0])spans[0].textContent='YOUR KILLS';if(spans[1])spans[1].textContent='LEADER';$('score-blue').textContent=String(me?.kills||0).padStart(2,'0');$('score-red').textContent=String(table[0]?.kills||0).padStart(2,'0');$('combo-bar').style.transform='scaleX(0)';$('timer').textContent=`${Math.floor(g.remaining/60).toString().padStart(2,'0')}:${Math.floor(g.remaining%60).toString().padStart(2,'0')}`;$('match-goal').textContent='FIRST TO 15';
    $('mission-chapter').textContent=`ONLINE · ${this.room.code}`;$('mission-objective').textContent='Every pilot for themselves.';$('mission-hint').textContent=`${MAPS[this.room.map].name}. Find green repair stations to recover your suit. Firing ends your spawn shield.`;$('campaign-threat').textContent=`${table.length} PILOTS · ${this.ping} MS`;$('campaign-upgrade').textContent=me?.dead?`REDEPLOY IN ${Math.ceil(me.respawn)} S`:`${me?.kills||0} KILLS / ${me?.deaths||0} DEATHS`;
    for(const id of ['chapter-card','radio','objective-marker','interact-prompt','boss-status','coach'])$(id).classList.add('hidden');
    $('grapple-label').textContent=g.grapple.mode==='idle'?'TETHER READY · AIM + C':'TETHER ACTIVE · C TO RELEASE';
    const signature=JSON.stringify(table.map(p=>[p.id,p.name,p.kills,p.deaths]));if(signature!==this.tableSignature){this.tableSignature=signature;this.board.replaceChildren();const title=document.createElement('h3');title.textContent='LIVE STANDINGS';this.board.append(title);for(const p of table){const row=document.createElement('div'),name=document.createElement('span'),score=document.createElement('b');name.textContent=p.id===this.id?`${p.name} · YOU`:p.name;score.textContent=`${p.kills} / ${p.deaths}`;row.classList.toggle('is-you',p.id===this.id);row.append(name,score);this.board.append(row)}const note=document.createElement('small');note.textContent='KILLS / DEATHS · ESC FOR ROOM';this.board.append(note)}
  }
}
