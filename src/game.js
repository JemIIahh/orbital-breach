import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeWorld, makeMech, makeGun } from './world.js';
import { Effects, AudioEngine } from './effects.js';
import { UI, $ } from './ui.js';
import { Onboarding } from './onboarding.js';
import { PilotGuide } from './pilot-guide.js';
import { makeLaunchDeck, frameLaunchDeck } from './launch-deck.js';
import { DeckControls } from './launch-controls.js';
import { loadProfile, saveProfile, recordChapter, recordGauntlet, PAINTS, paintById, liveryFor, ownedBuildFor, ownedSet, ownsItem, awardCredits, creditsForMatch } from './profile.js';
import { sanitizeBuild, gameplayMods, resolveBuild, DEFAULT_BUILD } from './parts.js';
import { swapMech, paintMech, disposeMech } from './mech-parts.js';
import { LoadoutScreen } from './loadout.js';
import { ShopScreen } from './shop.js';
import { ChapterRun, finishRun, finishGauntlet, gauntletRank, COMBO_WINDOW } from './scoring.js';
import { CHAPTERS } from './chapters.js';
import { planEnemySpawn, safestPlayerAngle, steerEnemy } from './tactics.js';
import { steerPlanar, combatRange } from './locomotion.js';
import { BULWARK, bulwarkFacing, applyBulwarkDamage } from './bulwark.js';
import { animateMech, smoothSurfaceUp } from './animation.js';
import { chaseOffset, armTarget, armEase, mechVisible } from './chase-camera.js';
import { Grapple } from './grapple.js';
import { Mission } from './mission.js';
import { TeamBattle } from './team-battle.js';
import { MissionBoard } from './mission-board.js';
import { OnlineSession } from './online-session.js';
import { SOLO_SECONDS } from './match-limits.js';
import * as TeamOps from './team-ops.js';
import { makeEden } from './eden.js';
import { materialOf, impactVolume } from './impacts.js';
import { ShadowGovernor, ResolutionGovernor, blendAlpha, blendPosition } from './frame-pacing.js';
import { hitReaction, hitSide, shakeFalloff } from './hit-feel.js';
import { Sensation, Haptics, loadLevel, saveLevel } from './sensation.js';
import { AirStreaks } from './air.js';
import { makeSensationPass, applySensation } from './sensation-pass.js';
import { makeCity } from './city.js';
import { ENEMY_TYPES, CITY_UPLINKS } from './encounters.js';
import { makeCell, makeTether } from './props.js';
import { RADIUS as R, HEIGHT as H, HALF_WIDTH as W, TAU, clamp, polarAngle, wrapAngle, isAirlock, stationPosition, resolveStationMotion, hasStationLineOfSight, firstStationIntersection, applyDamage } from './physics.js';
import { MELEE_REACH, accuracyFor, leadFor, aimCone, leadPoint, jitterDirection, bearingOf, passDistance, damageFeel, dangerLevel, heartInterval, nextStrafe, shotVolume, volleyFor } from './combat-feel.js';
const NEUTRAL_MODS={speed:1,boost:1,damageTaken:1,heatGain:1,cooling:1},DEFAULT_PARTS=resolveBuild(DEFAULT_BUILD),DEFAULT_ARMS=[DEFAULT_PARTS.lArm,DEFAULT_PARTS.rArm],DEFAULT_SHOULDERS=[DEFAULT_PARTS.rShoulder,DEFAULT_PARTS.lShoulder];

const v3=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const names=['TALON','CINDER','WRAITH','MAUL','VESPER','KESTREL'];
const reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export class OrbitalBreach {
  constructor(){
    this.canvas=$('game');this.keys=new Set();this.buttons=[false,false];
    this.running=false;this.started=false;this.ended=false;this.time=0;this.menuTime=0;
    this.remaining=SOLO_SECONDS;this.score=0;this.enemyScore=0;
    this.yaw=0;this.pitch=0;this.roll=0;this.theta=0;
    this.heat=[0,0];this.overheated=[false,false];this.cooldowns=[0,0];this.recoil=[0,0];this.missileCooldown=0;
    this.realm='station';this.mission=new Mission();this.grapple=new Grapple();this.pickups=[];this.portalCooldown=0;this.portalPreviewClock=0;this.transition=0;this.thirdPerson=false;this.nearAirlock=false;this.deadTimer=0;this.invulnerable=2.5;
    this.player={position:v3(),velocity:v3(),health:100,shield:100,magnetic:true,lastHit:-100};
    this.projectiles=[];this.bullets=[];this.tutorial=new Onboarding();this.tutorial.active=false;this.dangerZones=[];this.chapterTime=0;this.spawnGrace=8;this.accumulator=0;this.dashCooldown=0;this.dashTime=0;this.dashVector=v3();this.combo=0;this.comboTime=0;this.shake=0;this.shadowGov=new ShadowGovernor();this.alpha=1;this.hitStop=0;this.bots=[];this.ray=new T.Raycaster();this.up=v3(0,1,0);this.forward=v3(1,0,0);this.right=v3(0,0,1);
    this.ui=new UI();this.audio=new AudioEngine();this.initGraphics();this.initWorld();this.initInput();this.profile=loadProfile();this.run=new ChapterRun();this.runResults=[];this.resultsOpen=false;this.suppressResults=false;this.menuChapter=Math.min(this.profile.unlocked,2);this.desktopOnly=false;this.deckControls=new DeckControls($('menu'),{reducedMotion});this.initMenu();this.initLoadout();this.initBoard();
    this.spawnPlayer(true);this.setCamera(0);this.resize();
    this.clock=new T.Clock();this.renderer.setAnimationLoop(()=>this.frame());
    this.online=new OnlineSession(this);
    $('load-status').textContent='All systems online · Keyboard + mouse';
    this.refreshMenuSummary();
    const supported=window.matchMedia('(pointer:fine)').matches;
    if(!supported){const note=document.createElement('p');note.className='touch-note';note.textContent='Flight controls currently require a keyboard and mouse. You can explore the live arena preview on this device.';document.querySelector('.menu-content').append(note);this.desktopOnly=true;this.refreshMenuSummary()}
  }
  initGraphics(){
    this.renderer=new T.WebGLRenderer({canvas:this.canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=true;
    this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
    this.camera=new T.PerspectiveCamera(76,innerWidth/innerHeight,.06,4500);
    this.quality='balanced';this.resolutionGov=new ResolutionGovernor();
    this.world=makeWorld(this.renderer);this.scene=this.world.scene;this.scene.add(this.camera);
    const target=new T.WebGLRenderTarget(innerWidth,innerHeight,{type:T.HalfFloatType,samples:2});
    this.composer=new EffectComposer(this.renderer,target);this.renderPass=new RenderPass(this.scene,this.camera);this.composer.addPass(this.renderPass);
    this.bloom=new UnrealBloomPass(new T.Vector2(innerWidth,innerHeight),.13,.25,2.3);this.composer.addPass(this.bloom);this.sensePass=makeSensationPass();this.composer.addPass(this.sensePass);this.composer.addPass(new OutputPass());
    this.stationWorld=this.world;this.edenWorld=makeEden(this.scene.environment);this.cityWorld=makeCity(this.scene.environment);this.effectsByRealm={station:new Effects(this.scene),city:new Effects(this.cityWorld.scene),eden:new Effects(this.edenWorld.scene)};this.effects=this.effectsByRealm.station;this.effectsByRealm.station.radialGravity=true;this.effectsByRealm.city.ground=()=>0;this.effectsByRealm.eden.ground=(x,z)=>this.edenWorld.terrainHeight(x,z);this.tether=makeTether(this.scene);
    this.cameraLight=new T.PointLight('#bbdfed',.8,4,2);this.cameraLight.position.set(0,.3,0);this.camera.add(this.cameraLight);
    this.weapons=new T.Group();this.camera.add(this.weapons);
    this.guns=[makeGun('gatling'),makeGun('flak')];
    this.guns.forEach((gun,i)=>{gun.scale.setScalar(.34);gun.position.set(i===0?-.56:.56,-.5,-1.02);gun.rotation.y=i===0?-.025:.025;this.weapons.add(gun)});
    this.weapons.visible=false;
    // The "4D" layer (sensation.js): body motion, wind, pressure, sub-bass thumps and gamepad rumble.
    this.haptics=new Haptics();this.air=new AirStreaks();
    this.sense=new Sensation({reducedMotion,level:loadLevel(),play:(kind,opts)=>this.audio.play(kind,opts),rumble:(strong,weak,ms)=>this.haptics.rumble(strong,weak,ms)});
    for(const fx of Object.values(this.effectsByRealm))fx.onExplosion=(point,size)=>this.sense.event('blast',{distance:this.camera.position.distanceTo(point),size});
  }
  initWorld(){
    for(let i=0;i<6;i++){
      const archetype=['striker','gunner','sniper','striker','bulwark','archon'][i],mech=makeMech('red',1,archetype);this.scene.add(mech.group);
      const bot={...mech,archetype,name:names[i],index:i,angle:0,side:0,health:100,shield:45,dead:false,respawn:0,fire:1.5+Math.random()*2,direction:i%2===0?1:-1,phase:Math.random()*TAU,partHealth:{arm:70,leg:70},armLost:false,legLost:false};
      mech.parts.forEach(part=>part.userData.bot=bot);this.bots.push(bot);this.spawnBot(bot,true);
    }
    this.playerMech=makeMech('blue');this.scene.add(this.playerMech.group);this.playerMech.group.visible=false;
    this.heroMech=makeMech('blue',1.4);this.heroMech.group.position.set(50,-56,24);this.heroMech.group.rotation.set(.2,-.7,-.5);this.scene.add(this.heroMech.group);
    this.launchDeck=makeLaunchDeck(this.heroMech,this.stationWorld?.scene.environment,this.stationWorld?.earth);
  }
  initInput(){
    $('deploy').addEventListener('click',()=>this.start());
    $('restart').addEventListener('click',()=>{this.resetMatch();this.started=false;this.menuChapter=0;this.refreshMenuSummary();this.heroMech.group.visible=true;this.weapons.visible=false;this.playerMech.group.visible=false;$('restart').classList.add('hidden');$('deploy-label').textContent='BEGIN CAMPAIGN';$('load-status').textContent='Campaign reset · Ready at Kestrel'});
    $('pause').addEventListener('click',()=>this.pause());
    this.guide=new PilotGuide();$('controls-toggle').addEventListener('click',()=>this.guide.open());
    $('inspect-frame').addEventListener('click',()=>{this.guide.tab='mech';this.guide.open()});
        $('quality').addEventListener('change',e=>{this.quality=e.target.value;this.resolutionGov.reset();this.resize()});
    $('sensation').value=this.sense.levelName;
    $('sensation').addEventListener('change',e=>{this.sense.setLevel(e.target.value);saveLevel(this.sense.levelName);if(!this.sense.level)this.quietSensation()});
    $('sound-toggle').addEventListener('click',()=>{this.audio.setEnabled(!this.audio.enabled);$('sound-toggle').textContent=this.audio.enabled?'SOUND ON':'SOUND OFF';if(this.audio.enabled)this.audio.start()});
    addEventListener('resize',()=>this.resize());
    this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.pause();showFatal('The graphics context was interrupted. Reload to reconnect to the station.')});
    addEventListener('contextmenu',e=>{if(this.running)e.preventDefault()});
    addEventListener('keydown',e=>{
      if(!this.running||this.modalOpen)return;
      if(['Space','ControlLeft','ControlRight','Tab','KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();
      this.keys.add(e.code);if(e.repeat)return;
      if(e.code==='Tab'&&this.tutorial.active)this.tutorial.skip();
      if(e.code==='KeyH'&&!this.online?.active){this.trainingReplay=true;this.tutorial.reset();this.bullets=this.bullets.filter(b=>b.owner!=='enemy');this.ui.event('OPTIONAL TRAINING · CAMPAIGN PAUSED · TAB TO RETURN',2)}
      if(e.code==='KeyX')this.dash();
      if(e.code==='KeyC')this.fireGrapple();
      if(e.code==='KeyE')this.interact();
      if(e.code==='Space'&&this.player.magnetic){const height=this.realm!=='station'?this.player.position.y-this.groundHeight(this.player.position.x,this.player.position.z):R-Math.hypot(this.player.position.x,this.player.position.y);if(height<3.2||this.player.grounded||this.player.surfaceUp){this.player.velocity.addScaledVector(this.up,Math.max(0,12-this.player.velocity.dot(this.up)));this.audio.play('dash')}}
      if(e.code==='KeyF'){this.grapple.release();this.player.surfaceUp=null;this.player.radialSign=null;this.player.magnetic=!this.player.magnetic;if(!this.player.magnetic)this.tutorial.record('freeFlight');this.ui.event(this.player.magnetic?'MAGNETIC BOOTS ENGAGED':'FREE FLIGHT\nTHRUSTERS ACTIVE',1.5);this.audio.play('ui')}
      if(e.code==='KeyV'){this.thirdPerson=!this.thirdPerson;this.weapons.visible=!this.thirdPerson;this.playerMech.group.visible=this.thirdPerson;this.ui.event(this.thirdPerson?'CHASE CAMERA':'COCKPIT CAMERA',1)}
      if(e.code==='KeyG')this.fireShoulders();
      if(e.code==='KeyB')this.openLoadout();
      if(e.code==='KeyR'){this.heat=[0,0];this.overheated=[false,false];this.cooldowns=[.65,.65];if(this.online?.active)this.online.send({type:'vent'});this.ui.event('WEAPON HEAT VENTED',.8);this.audio.play('ui')}
      if(e.code==='Escape')this.pause();
    });
    addEventListener('keyup',e=>this.keys.delete(e.code));
    addEventListener('mousemove',e=>{if(!this.running||this.modalOpen||document.pointerLockElement!==this.canvas)return;this.yaw+=e.movementX*.0023;this.pitch=clamp(this.pitch-e.movementY*.0023,-1.48,1.48);this.tutorial.record('look',Math.abs(e.movementX*.0023)+Math.abs(e.movementY*.0023))});
    addEventListener('mousedown',e=>{if(this.running&&!this.modalOpen&&document.pointerLockElement===this.canvas){if(e.button===0)this.buttons[0]=true;if(e.button===2)this.buttons[1]=true;if(e.button===1)this.fireGrapple()}});
    addEventListener('mouseup',e=>{if(e.button===0)this.buttons[0]=false;if(e.button===2)this.buttons[1]=false});
    document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==this.canvas&&this.running&&!this.modalOpen)this.pause(false)});
    addEventListener('blur',()=>{if(this.running&&!this.modalOpen)this.pause()});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.running&&!this.modalOpen)this.pause()});
  }
  async start(){
    if(this.online?.active){await this.online.resume();return}
    if(!this.canvas.requestPointerLock){$('load-status').textContent='This browser does not support mouse capture. Open in desktop Chrome, Edge, or Firefox.';return}
    try{
      await new Promise((resolve,reject)=>{
        const cleanup=()=>{document.removeEventListener('pointerlockchange',change);document.removeEventListener('pointerlockerror',error);clearTimeout(timeout)};
        const change=()=>{if(document.pointerLockElement===this.canvas){cleanup();resolve()}};
        const error=()=>{cleanup();reject(new Error('Mouse capture unavailable'))};
        const timeout=setTimeout(error,4000);
        document.addEventListener('pointerlockchange',change);document.addEventListener('pointerlockerror',error);
        try{const result=this.canvas.requestPointerLock();result?.catch?.(error)}catch{error()}
      });
      if(document.pointerLockElement!==this.canvas){$('load-status').textContent='Allow mouse capture, then click Deploy again.';return}
    }catch{$('load-status').textContent='Mouse capture was blocked. Click Deploy again to allow it.';return}
    if(this.ended){this.resetMatch()}
    if(!this.started||this.menuChapter!==this.currentChapter())this.beginChapterIfNeeded();
    if(!this.started){if($('training').checked&&this.menuChapter===0){this.tutorial.reset();this.bots.forEach(bot=>this.spawnBot(bot,true))}else{this.tutorial.active=false;this.tutorial.justCompleted=false}this.chapterTime=6}
    this.running=true;this.started=true;this.heroMech.group.visible=false;this.weapons.visible=!this.thirdPerson;this.playerMech.group.visible=this.thirdPerson;
    // The world scene's shadow map has never been rendered while the launch deck was showing; without this, throttled shadow updates sample an empty depth texture for the first few frames.
    this.renderer.shadowMap.needsUpdate=true;this.shadowGov.clock=0;
    $('menu').classList.add('hidden');$('hud').classList.remove('hidden');this.audio.start();
    this.accumulator=0;this.clock.getDelta();
    if(this.tutorial.active)this.ui.event('FLIGHT CHECK · HOSTILE FIRE DISABLED',2);
  }
  pause(release=true){
    if(this.online?.active){this.online.pause(release);return}
    this.running=false;this.transition=0;if($('realm-transition'))$('realm-transition').style.opacity='0';this.accumulator=0;this.buttons=[false,false];this.keys.clear();this.audio.pause();
    if(release&&document.pointerLockElement===this.canvas)document.exitPointerLock();
    this.refreshMenuSummary();
    if(this.started){$('restart').classList.remove('hidden');$('menu').classList.remove('hidden');$('hud').classList.add('hidden');this.menuChapter=this.currentChapter();this.refreshMenuSummary();$('load-status').textContent=this.ended?`Match complete · ${this.score} eliminations`:(this.battle?'Operation paused · Click to resume':'Campaign paused · Click to resume')}
  }
  currentChapter(){return this.battle?4:this.mission?.stage==='gauntlet'?3:this.realm==='city'?1:this.realm==='eden'?2:0}
  unlock(chapter){
    if(!this.profile||chapter<=this.profile.unlocked)return;
    this.profile.unlocked=chapter;saveProfile(this.profile);this.refreshMenuSummary();
  }
  setPaint(id,celebrate=false){
    if(celebrate&&this.profile&&!ownsItem(this.profile,`paint:${paintById(id).id}`)){this.openShop({paint:paintById(id).id});return}
    const p=paintById(id);this.profile.paint=p.id;const livery=liveryFor(this.profile);
    for(const mech of [this.heroMech,this.playerMech])paintMech(mech,livery);
    for(const gun of this.guns)(gun.userData.paint||gun.children[0]?.material)?.color?.set(livery.paint);
    document.querySelectorAll('.paint-swatch').forEach(button=>button.setAttribute('aria-checked',String(button.dataset.paint===p.id)));
    $('frame-name').firstChild.textContent=`${p.name} `;
    if(celebrate){this.deckControls.flash();saveProfile(this.profile)}
  }
  selectChapter(index){this.menuChapter=index;this.refreshMenuSummary()}
  // Restart the campaign at a chapter with the suit state a player would normally have on arrival.
  beginChapter(chapter){
    this.resetMatch();const mission=this.mission;
    if(chapter<1)return;
    if(chapter===4){this.startTeamOp();return}
    this.suppressResults=true;
    if(chapter===3){mission.startGauntlet();this.setRealm('city');this.cityWorld?.setArena?.(true);this.spawnGardenPlayer();this.syncEncounter(true);this.ui.event('THE GAUNTLET\nHOLD THE AVENUE',3);this.suppressResults=false;this.run=new ChapterRun();return}
    mission.cells=3;mission.stage='portal';
    if(chapter===1)this.enterCity();
    else{mission.world='city';mission.stage='city-portal';mission.upgrades=3;mission.wave=2;this.enterEden()}
    this.suppressResults=false;this.run=new ChapterRun();
  }
  beginChapterIfNeeded(){
    const wanted=this.menuChapter;
    if(this.started&&wanted===this.currentChapter())return;
    if(!this.started&&wanted===0)return;
    this.beginChapter(wanted);
  }
  // Finishes the current chapter run: records it, then opens the results screen when a browser UI is present.
  completeChapter(index){
    const run=this.run;this.run=new ChapterRun();this.remaining=SOLO_SECONDS;this.combo=0;this.comboTime=0;
    if(!run||this.suppressResults)return null;
    const result=finishRun(run,index);
    if(this.profile){result.record=recordChapter(this.profile,index,result);if(index===2)this.profile.completed=true;this.payOut(result,true,this.tutorial?.active?'training':'campaign');saveProfile(this.profile)}
    (this.runResults||=[])[index]=result;
    const complete=index===2&&[0,1,2].every(i=>this.runResults[i]);
    const campaign=complete?{score:this.runResults.reduce((sum,r)=>sum+r.score,0),ranks:this.runResults.map(r=>r.rank)}:null;
    this.resultsOpen=!!this.ui.showResults?.(result,{campaign,onContinue:()=>this.closeResults(),onRetry:()=>this.retryChapter(index)});
    if(this.resultsOpen){this.buttons=[false,false];this.keys.clear();if(this.canvas&&document.pointerLockElement===this.canvas)document.exitPointerLock();this.audio.play('ui')}
    return result;
  }
  // ---- Loadout: the fitted build and how it changes play --------------------------------------------------
  get modalOpen(){return !!(this.resultsOpen||this.loadoutOpen||this.shopOpen||this.online?.lobby.visible)}
  armPart(index){return (this.armParts||DEFAULT_ARMS)[index]}
  shoulderPart(slot){return (this.shoulderParts||DEFAULT_SHOULDERS)[slot]}
  damageScale(){return (this.mods?.damageTaken||1)*(this.chaffTime>0?1-(this.chaffReduction||.5):1)}
  // A refit lands at once on the pad, between fights and in the lull between waves; mid-fight it waits for the next spawn.
  refitNow(){
    if(this.online?.active)return false;
    if(this.battle)return this.battle.state==='intro'||this.deadTimer>0;
    if(!this.started||!this.mission||this.tutorial?.active||!this.mission.combatActive)return true;
    if(this.time-this.player.lastHit<6)return false;
    return !this.bots?.some(bot=>!bot.dead&&bot.group.visible&&bot.group.position.distanceTo(this.player.position)<45);
  }
  applyBuild(build){
    this.build=sanitizeBuild(build);this.mods=gameplayMods(this.build);
    const parts=resolveBuild(this.build);this.armParts=[parts.lArm,parts.rArm];this.shoulderParts=[parts.rShoulder,parts.lShoulder];
    this.heat=[0,0];this.overheated=[false,false];this.cooldowns=[0,0];
    if(this.playerMech&&this.heroMech){
      for(const mech of [this.playerMech,this.heroMech])swapMech(mech,makeMech('blue',1,'gunner',this.build));
      this.rebuildViewmodel();this.setPaint(this.profile?.paint||'cobalt');
    }
    this.ui.setBuild?.(this.build);
  }
  rebuildViewmodel(){
    const parts=[this.armPart(0),this.armPart(1)];
    for(const gun of this.guns){this.weapons.remove(gun);disposeMech(gun)}
    this.guns=parts.map((part,i)=>{const gun=makeGun(part.fire?part.model:'gatling');gun.scale.setScalar(.34);gun.position.set(i===0?-.56:.56,-.5,-1.02);gun.rotation.y=i===0?-.025:.025;gun.visible=!!part.fire;this.weapons.add(gun);return gun});
  }
  consumePendingBuild(){
    if(!this.pendingBuild)return;
    const build=this.pendingBuild;this.pendingBuild=null;this.applyBuild(build);this.ui.event?.('NEW LOADOUT ONLINE',2);
  }
  initLoadout(){
    this.loadoutOpen=false;this.pendingBuild=null;
    this.shopOpen=false;this.shopFromRefit=false;
    this.loadout=new LoadoutScreen({root:$('loadout'),reducedMotion,onFit:build=>this.fitBuild(build),onLivery:(paint,lights)=>this.setLivery(paint,lights),onShop:context=>this.openShop(context),onClose:()=>this.closeLoadout()});
    this.shop=new ShopScreen({root:$('shop'),reducedMotion,onFit:build=>this.fitBuild(build),onLivery:(paint,lights)=>this.setLivery(paint,lights),onPurchase:()=>this.shopPurchased(),onRefit:({draft})=>this.shopToRefit(draft),onClose:()=>this.closeShop()});
    this.applyBuild(this.profile.build);
    $('open-loadout')?.addEventListener('click',()=>this.openLoadout());
    $('open-shop')?.addEventListener('click',()=>this.openShop());
    this.refreshShopUi();
  }
  refitMode(){return !this.started?'pad':this.refitNow()?'field':'combat'}
  openLoadout(draft){
    if(this.online?.active){this.ui.event('LOADOUT LOCKED FOR THIS MATCH · REFIT BEFORE JOINING A ROOM',2);return}
    if(this.loadoutOpen||this.resultsOpen||this.shopOpen)return;
    const inRun=this.running;this.loadoutOpen=true;
    if(inRun){this.buttons=[false,false];this.keys.clear();if(this.canvas&&document.pointerLockElement===this.canvas)document.exitPointerLock()}
    this.loadout.open({build:this.profile.build,draft,mode:this.refitMode(),paint:this.profile.paint,lights:this.profile.lights,owned:ownedSet(this.profile),credits:this.profile.credits});
  }
  // The Gear Shop. From the Field Refit it carries the slot and any unfitted draft across, and Esc brings you back to the Refit.
  openShop(context){
    if(this.shopOpen||this.resultsOpen||this.boardOpen||this.desktopOnly)return;
    const from=this.loadoutOpen,c=context&&typeof context==='object'&&!context.type?context:{};this.shopOpen=true;this.shopFromRefit=from;
    if(from){this.loadout.close();this.loadoutOpen=false}
    else if(this.running){this.buttons=[false,false];this.keys.clear();if(this.canvas&&document.pointerLockElement===this.canvas)document.exitPointerLock()}
    this.shop.open({profile:this.profile,mode:this.refitMode(),slot:c.slot,partId:c.partId,paint:c.paint,lights:c.lights,draft:c.draft});
  }
  async closeShop(){
    if(!this.shopOpen)return;
    const draft=this.shop.draft,back=this.shopFromRefit;
    this.shop.close();this.shopOpen=false;this.shopFromRefit=false;this.refreshShopUi();
    if(back){this.openLoadout(draft);return}
    if(!this.running)return;
    this.accumulator=0;this.clock.getDelta();
    try{await this.lockPointer()}catch{this.pause()}
  }
  shopToRefit(draft){
    if(!this.shopOpen)return;
    this.shop.close();this.shopOpen=false;this.shopFromRefit=false;this.refreshShopUi();this.openLoadout(draft);
  }
  shopPurchased(){saveProfile(this.profile);this.audio.play('ui');this.refreshShopUi()}
  // Menu chips that depend on the wallet: the SHOP button's balance and the locked state of the paint swatches.
  refreshShopUi(){
    const credits=this.profile?.credits??0,chip=$('shop-credits');if(chip)chip.textContent=credits.toLocaleString('en-US');
    document.querySelectorAll('.paint-swatch').forEach(button=>{const p=paintById(button.dataset.paint),locked=!ownsItem(this.profile,`paint:${p.id}`);button.classList.toggle('locked',locked);button.setAttribute('aria-label',locked?`${p.name} paint, locked, ${p.price} credits. Opens the gear shop`:`${p.name} paint`);button.dataset.name=locked?`${p.name} · ${p.price} CR`:p.name});
  }
  // Banks the credits a finished chapter or Gauntlet run earns and puts the amount and the new balance on the result.
  payOut(result,won,mode){result.credits=creditsForMatch({kills:result.stats?.kills,won,score:result.score,mode});result.balance=awardCredits(this.profile,result.credits)}

  async closeLoadout(){
    if(!this.loadoutOpen)return;
    this.loadout.close();this.loadoutOpen=false;
    if(!this.running)return;
    this.accumulator=0;this.clock.getDelta();
    try{await this.lockPointer()}catch{this.pause()}
  }
  fitBuild(build){
    this.profile.build=ownedBuildFor(this.profile,build);saveProfile(this.profile);
    if(this.refitNow()){this.pendingBuild=null;this.applyBuild(this.profile.build);this.ui.event('LOADOUT FITTED',1.6)}
    else{this.pendingBuild={...this.profile.build};this.ui.event('FITTED FOR YOUR NEXT SPAWN',2.4)}
    this.audio.play('ui');
  }
  setLivery(paint,lights){
    if(ownsItem(this.profile,`paint:${paint}`))this.profile.paint=paint;
    if(ownsItem(this.profile,`lights:${lights}`))this.profile.lights=lights;
    saveProfile(this.profile);this.setPaint(this.profile.paint)
  }
  lockPointer(){
    return new Promise((resolve,reject)=>{
      const cleanup=()=>{document.removeEventListener('pointerlockchange',change);document.removeEventListener('pointerlockerror',error);clearTimeout(timeout)};
      const change=()=>{if(document.pointerLockElement===this.canvas){cleanup();resolve()}};
      const error=()=>{cleanup();reject(new Error('Mouse capture unavailable'))};
      const timeout=setTimeout(error,4000);
      document.addEventListener('pointerlockchange',change);document.addEventListener('pointerlockerror',error);
      try{const result=this.canvas.requestPointerLock();result?.catch?.(error)}catch{error()}
    });
  }
  async resumeAfterResults(){
    this.ui.hideResults?.();this.resultsOpen=false;this.accumulator=0;this.clock.getDelta();
    try{await this.lockPointer()}catch{this.pause()}
  }
  closeResults(){return this.resumeAfterResults()}
  // The Gauntlet ends when the last life is lost: bank the run, then show the results.
  endGauntlet(){
    const run=this.run,waves=this.mission?.wave||0;if(!run||this.resultsOpen)return null;
    this.run=new ChapterRun();this.combo=0;this.comboTime=0;
    const result=finishGauntlet(run,waves);
    if(this.profile){result.record=recordGauntlet(this.profile,waves,result.score);this.payOut(result,false,'gauntlet');saveProfile(this.profile)}
    this.resultsOpen=!!this.ui.showResults?.(result,{onContinue:()=>this.leaveGauntlet(),onRetry:()=>this.retryChapter(3)});
    if(this.resultsOpen){this.buttons=[false,false];this.keys.clear();if(this.canvas&&document.pointerLockElement===this.canvas)document.exitPointerLock();this.audio.play('ui')}
    return result;
  }
  leaveGauntlet(){
    this.ui.hideResults?.();this.resultsOpen=false;this.resetMatch();this.pause();this.selectChapter(3);$('load-status').textContent='Gauntlet over · Go again or pick a chapter';
  }
  retryChapter(index){this.beginChapter(index);return this.resumeAfterResults()}
  // ---- Team operations: squad versus squad on the Meridian and Eden maps ----------------------------------------
  get opsRecord(){return this._ops||=TeamOps.loadOpsRecord()}
  selectedOp(){
    const record=this.opsRecord,sel=this.menuOp||=({id:record.op||TeamOps.OPERATIONS[0].id,team:record.team,skill:record.skill||''}),op=TeamOps.opById(sel.id);
    return{op,team:sel.team==='red'?'red':'blue',skill:TeamOps.SKILLS[sel.skill]?sel.skill:op.skill};
  }
  chooseOp({id,team,skill}={}){
    const op=TeamOps.opById(id);this.menuOp={id:op.id,team:team==='red'?'red':'blue',skill:TeamOps.SKILLS[skill]?skill:''};
    Object.assign(this.opsRecord,{op:op.id,team:this.menuOp.team,skill:this.menuOp.skill});TeamOps.saveOpsRecord(this.opsRecord);
    this.menuChapter=4;this.refreshMenuSummary();
  }
  teamTotals(){const ops=Object.values(this.opsRecord.ops);return{played:ops.reduce((n,r)=>n+r.played,0),wins:ops.reduce((n,r)=>n+r.wins,0)}}
  describeTeamOps(live){
    const {op,team,skill}=this.selectedOp(),me=TeamOps.teamById(team),foe=TeamOps.teamById(TeamOps.otherTeam(team)),rec=this.opsRecord.ops[op.id],pay=TeamOps.payoutFor({...op,skill},{won:true,kills:Math.round(op.limit/op.size)});
    $('menu-briefing-label').textContent=live?'OPERATION IN PROGRESS':'TEAM OPERATIONS';$('menu-progress-label').textContent='SQUAD VS SQUAD';
    $('menu-objective-label').textContent=live?'CURRENT OBJECTIVE':'SELECTED OPERATION';$('menu-objective').textContent=live?this.mission.objective:op.name;
    $('menu-objective-copy').textContent=live?this.mission.title:op.blurb;
    const lines=[op.tag,`You fly for ${me.name} against ${foe.name} · ${TeamOps.skillById(skill).label}`,`A win pays about ${pay} credits`,rec?.played?`Record: ${rec.wins} won of ${rec.played} · best score ${rec.bestScore.toLocaleString()}`:'Not played yet'];
    $('menu-intel').replaceChildren(...lines.map(text=>{const item=document.createElement('li');item.textContent=text;return item}));
  }
  initBoard(){
    this.boardOpen=false;
    this.board=new MissionBoard($('board'),{
      state:()=>({selection:this.selectedOp(),record:this.opsRecord,credits:this.profile?.credits,chapters:CHAPTERS.slice(0,4),unlocked:this.profile?.unlocked||0,completed:!!this.profile?.completed,bests:this.profile?.bests||{},gauntlet:this.profile?.gauntlet,current:this.started?this.currentChapter():-1}),
      preview:arena=>this.previewArena(arena),
      choose:selection=>this.chooseOp(selection),
      deploy:selection=>this.deployTeamOp(selection),
      chapter:index=>this.selectChapter(index),
      closed:()=>{this.boardOpen=false;$('open-board')?.focus?.()},
    });
    $('open-board')?.addEventListener('click',()=>this.openBoard());
  }
  previewArena(arena){
    // Capture the real arena once per board visit. A static poster has the game's
    // actual art direction without running a second renderer behind the menu.
    const world=arena==='city'?this.cityWorld:this.edenWorld,renderer=this.renderer;
    const camera=new T.PerspectiveCamera(62,innerWidth/innerHeight,.2,650);
    if(arena==='city'){camera.position.set(-12,9,-58);camera.lookAt(2,10,35)}
    else{camera.position.set(-4,10,-28);camera.lookAt(0,16,74)}
    const target=renderer.getRenderTarget(),viewport=renderer.getViewport(new T.Vector4());
    const actors=[this.playerMech.group,...this.bots.map(bot=>bot.group),...(this.battle?.allies||[]).map(bot=>bot.group)];
    const visible=actors.map(o=>o.visible);actors.forEach(o=>o.visible=false);
    try{
      renderer.setRenderTarget(null);renderer.setViewport(0,0,innerWidth,innerHeight);renderer.shadowMap.needsUpdate=true;
      renderer.render(world.scene,camera);
      const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
      canvas.getContext('2d').drawImage(renderer.domElement,0,0,960,540);return canvas.toDataURL('image/webp',.88);
    }finally{
      actors.forEach((o,i)=>o.visible=visible[i]);renderer.setRenderTarget(target);renderer.setViewport(viewport);renderer.shadowMap.needsUpdate=true;
    }
  }
  openBoard(){if(this.running||this.loadoutOpen||this.shopOpen||this.boardOpen||this.desktopOnly)return;this.boardOpen=true;this.board.open()}
  deployTeamOp(selection){
    this.chooseOp(selection);this.board.close();const {op,team,skill}=this.selectedOp();
    if(this.battle&&!(this.battle.op.id===op.id&&this.battle.team===team&&this.battle.skill.id===skill))this.beginChapter(4);
    return this.start();
  }
  // Builds both squads, drops the pilot on their team's side of the arena and starts the countdown.
  startTeamOp(){
    const {op,team,skill}=this.selectedOp(),arena=TeamOps.ARENAS[op.arena];
    this.dropTeamMatch();this.suppressResults=true;
    this.mission.startTeam(op);this.encounterRevision=this.mission.revision;
    this.setRealm(arena.realm);
    const battle=new TeamBattle(this,op,team,skill);
    this.campaignBots=this.bots;this.campaignBots.forEach(bot=>{bot.dead=true;bot.respawn=Infinity;bot.group.visible=false});
    this.bots=battle.foes;this.battle=battle;battle.begin();
    this.spawnGardenPlayer();this.run=new ChapterRun();this.combo=0;this.comboTime=0;this.chapterTime=6;this.suppressResults=false;
  }
  dropTeamMatch(){
    if(!this.battle)return;
    this.battle.dispose();this.bots=this.campaignBots||this.bots;this.campaignBots=null;this.battle=null;
  }
  finishTeamMatch(result){
    if(this.resultsOpen)return null;
    result.record=TeamOps.recordOperation(this.opsRecord,result.op.id,{won:result.won,kills:result.stats.kills,score:result.score});TeamOps.saveOpsRecord(this.opsRecord);
    if(this.profile){result.balance=awardCredits(this.profile,result.credits);saveProfile(this.profile)}
    this.combo=0;this.comboTime=0;
    this.resultsOpen=!!this.ui.showResults?.(result,{onContinue:()=>this.leaveTeamMatch(),onRetry:()=>this.retryOperation()});
    if(this.resultsOpen){this.buttons=[false,false];this.keys.clear();if(this.canvas&&document.pointerLockElement===this.canvas)document.exitPointerLock();this.audio.play(result.won?'kill':'ui')}
    return result;
  }
  leaveTeamMatch(){this.ui.hideResults?.();this.resultsOpen=false;this.resetMatch();this.pause();this.selectChapter(4);$('load-status').textContent='Operation over · Open the Mission Board to pick another'}
  retryOperation(){this.beginChapter(4);return this.resumeAfterResults()}
  initMenu(){
    const holder=$('paint-swatches');
    for(const p of PAINTS){
      const button=document.createElement('button');button.type='button';button.className='paint-swatch';button.dataset.paint=p.id;button.dataset.name=p.name;
      button.setAttribute('role','radio');button.setAttribute('aria-label',`${p.name} paint`);button.style.setProperty('--swatch',p.paint);
      button.addEventListener('click',()=>this.setPaint(p.id,true));holder.append(button);
    }
    document.querySelectorAll('[data-preview-chapter]').forEach(button=>button.addEventListener('click',()=>this.selectChapter(Number(button.dataset.previewChapter))));
    const deploy=$('deploy');
    for(const [on,off] of [['pointerenter','pointerleave'],['focus','blur']]){deploy.addEventListener(on,()=>this.deckControls.setPower(!deploy.disabled));deploy.addEventListener(off,()=>this.deckControls.setPower(false))}
    addEventListener('keydown',e=>{
      if(this.running||this.online?.lobby.visible||$('manual').open||this.loadoutOpen||this.shopOpen||this.boardOpen)return;
      if(this.deckControls.key(e.code)){e.preventDefault();return}
      if(/^Digit[1-5]$/.test(e.code))this.selectChapter(Number(e.code.slice(5))-1);
      else if(e.code==='KeyL'&&!e.repeat)this.openLoadout();
      else if(e.code==='KeyS'&&!e.repeat)this.openShop();
      else if(e.code==='KeyM'&&!e.repeat)this.openBoard();
      else if(e.code==='Enter'&&!e.repeat&&document.activeElement===document.body&&!deploy.disabled)deploy.click();
    });
    this.setPaint(this.profile.paint);this.refreshMenuSummary();
  }
  refreshMenuSummary(){
    const current=this.currentChapter(),selected=this.menuChapter,chapter=CHAPTERS[selected];
    const live=!!this.mission&&this.started&&selected===current;
    const reachable=Math.max(this.profile.unlocked,this.started?Math.min(2,current):0),isLocked=i=>i===3?!this.profile.completed:i===4?false:i>reachable,locked=isLocked(selected);
    $('menu').style.setProperty('--accent',chapter.accent);this.launchDeck?.setAccent(chapter.accent);
    $('menu-briefing-label').textContent=selected===3?(live?'GAUNTLET IN PROGRESS':'BONUS MODE'):live?'CAMPAIGN PAUSED':selected===0&&!this.started?'CAMPAIGN BRIEFING':`CHAPTER ${chapter.number} BRIEFING`;
    $('menu-progress-label').textContent=selected===3?'BONUS':`${chapter.number} — 03`;$('menu-chapter-number').textContent=chapter.number;
    $('menu-objective-label').textContent=live?'CURRENT OBJECTIVE':selected===0&&!this.started?'YOUR FIRST OBJECTIVE':'CHAPTER OBJECTIVE';
    $('menu-objective').textContent=live?this.mission.objective:chapter.objective;
    $('menu-objective-copy').textContent=live?this.mission.title:chapter.copy;
    $('menu-intel').replaceChildren(...chapter.intel.map(text=>{const item=document.createElement('li');item.textContent=text;return item}));
    if(selected===4)this.describeTeamOps(live);
    document.querySelectorAll('[data-preview-chapter]').forEach(button=>{
      const index=Number(button.dataset.previewChapter),state=button.querySelector('.chapter-state'),gauntlet=this.profile.gauntlet,best=index===3?(gauntlet.score>0?{rank:gauntletRank(gauntlet.wave),score:gauntlet.score,wave:gauntlet.wave}:null):this.profile.bests[index],lockedCard=isLocked(index);
      button.classList.toggle('is-selected',index===selected);button.setAttribute('aria-pressed',String(index===selected));
      button.classList.toggle('current-chapter',this.started&&index===current);button.classList.toggle('is-locked-card',lockedCard);
      state.className='chapter-state';
      if(index===4){const totals=this.teamTotals();state.textContent=totals.played?`${totals.wins} WON · ${totals.played} PLAYED`:'NEW';if(!totals.played)state.classList.add('is-new');return}
      if(lockedCard){state.textContent='LOCKED';state.classList.add('is-locked')}
      else if(best){state.textContent=index===3?`WAVE ${best.wave} · ${best.score.toLocaleString()}`:`${best.rank} · ${best.score.toLocaleString()}`;state.classList.add(`rank-${best.rank}`)}
      else if(this.started&&index===current)state.textContent='IN PROGRESS';
      else{state.textContent='NEW';state.classList.add('is-new')}
    });
    $('training').closest('label').classList.toggle('hidden',selected!==0||this.started);
    let text,disabled=false;
    if(this.desktopOnly){text='DESKTOP CONTROLS REQUIRED';disabled=true}
    else if(locked){text=selected===3?'FINISH THE CAMPAIGN TO UNLOCK':`CHAPTER ${chapter.number} LOCKED`;disabled=true}
    else if(this.ended)text='DEPLOY AGAIN';
    else if(selected===4)text=live?'RESUME OPERATION':`DEPLOY · ${this.selectedOp().op.name}`;
    else if(selected===3)text=live?'RESUME GAUNTLET':'ENTER THE GAUNTLET';
    else if(this.started)text=selected===current?'RESUME CAMPAIGN':`RESTART AT CHAPTER ${chapter.number}`;
    else text=selected===0?'BEGIN CAMPAIGN':`DEPLOY · CHAPTER ${chapter.number}`;
    $('deploy-label').textContent=text;$('deploy').disabled=disabled;
  }

  spawnPlayer(initial=false){
    this.consumePendingBuild();
    if(this.realm!=='station'){this.spawnGardenPlayer();return}
    const angle=initial?-.1:safestPlayerAngle(this.bots);
    const p=stationPosition(angle,2.65,0);this.player.position.set(p.x,p.y,p.z);this.player.velocity.set(0,0,0);this.player.health=100;this.player.shield=100;this.player.magnetic=true;
    this.yaw=0;this.pitch=.28;this.roll=0;this.theta=angle;this.player.surfaceUp=null;this.player.radialSign=null;this.player.bootDelay=0;this.grapple?.release();this.invulnerable=5;this.spawnGrace=5;this.deadTimer=0;this.player.lastHit=this.time;
    this.dashTime=0;this.dashCooldown=0;this.bullets=this.bullets.filter(b=>b.owner!=='enemy');
    if(this.tutorial)this.tutorial.previous=null;
  }

  spawnBot(bot,initial=false){
    if(this.mission&&!this.tutorial.active&&!this.mission.combatActive){bot.dead=true;bot.respawn=Infinity;bot.group.visible=false;return}
    const type=this.mission&&!this.tutorial.active?this.mission.composition[bot.index]:bot.archetype;
    if(!type||this.mission&&!this.tutorial.active&&this.mission.encounterKills.has(bot.index)){bot.dead=true;bot.group.visible=false;bot.respawn=Infinity;return}this.configureEnemy(bot,type);
    if(this.realm!=='station'){this.spawnGardenBot(bot,initial);return}
    bot.flying=false;bot.flightPosition=null;bot.flightRoute=null;
    const spawn=planEnemySpawn(initial?-.1:this.theta,bot.index,this.bots,initial);
    bot.angle=spawn.angle;bot.side=spawn.side;const spec=ENEMY_TYPES[bot.archetype],difficulty=this.mission?.difficulty;bot.health=spec.health*(difficulty?.health||1);bot.shield=spec.shield;if(this.realm==='station'&&bot.archetype==='bulwark'&&!this.tutorial.active){bot.health=120;bot.shield=45}bot.maxHealth=bot.health;bot.maxShield=bot.shield;bot.dead=false;bot.group.visible=true;bot.fire=2+Math.random()*1.5;bot.armLost=false;bot.legLost=false;bot.partHealth={arm:70,leg:70};
    bot.moveVelocity=null;bot.volley=null;bot.speed=0;bot.strafe=0;bot.hover=0;bot.recoil=0;bot.hit=0;bot.charge=0;bot.dodge=0;bot.dodgeCooldown=4+Math.random()*4;bot.justSpawned=true;
    Object.values(bot.limbs).forEach(limb=>limb.visible=true);bot.paint.emissive.set('#000000');this.positionBot(bot,0,0);
  }

  positionBot(bot,t,dt=1/60){
    const p=stationPosition(bot.angle,bot.hover||0,bot.side);
    if(this.realm!=='station'){bot.group.position.copy(bot.gardenPosition);bot.group.position.y=this.groundHeight(bot.group.position.x,bot.group.position.z)+(bot.hover||0)}
    else if(bot.flying)bot.group.position.copy(bot.flightPosition);else bot.group.position.set(p.x,p.y,p.z);
    const up=this.realm!=='station'?v3(0,1,0):v3(-Math.sin(bot.angle),Math.cos(bot.angle),0);
    const target=this.player.position.clone().sub(bot.group.position).addScaledVector(up,-2.3),height=target.dot(up);
    const toward=target.clone().addScaledVector(up,-height).normalize();
    if(toward.lengthSq()<.01)toward.set(1,0,0);
    const quaternion=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(v3(),toward,up));
    if(bot.justSpawned){bot.group.quaternion.copy(quaternion);bot.justSpawned=false}else if(bot.archetype==='bulwark')bot.group.quaternion.rotateTowards(quaternion,BULWARK.turnRate*dt);else bot.group.quaternion.slerp(quaternion,1-Math.exp(-dt*10));
    animateMech(bot,{dt,time:t,speed:bot.speed||0,strafe:bot.strafe||0,aimPitch:Math.atan2(height,Math.max(1,target.length())),airborne:bot.flying||(bot.hover||0)>.15,boost:bot.dodge>0,recoil:bot.recoil||0,hit:bot.hit||0,stagger:bot.stagger||0,staggerSide:bot.staggerSide||0,charge:bot.charge||0,backwards:bot.backwards});
  }

  groundHeight(x,z){return this.world.terrainHeight?.(x,z)||0}
  basis(){
    if(this.realm!=='station'){
      this.up.copy(this.player.surfaceUp||v3(0,1,0));
      const reference=v3(0,0,1).addScaledVector(this.up,-this.up.z);if(reference.lengthSq()<.01)reference.set(1,0,0);reference.normalize();
      const side=reference.clone().cross(this.up).normalize();this.forward.copy(reference).multiplyScalar(Math.cos(this.yaw)).addScaledVector(side,Math.sin(this.yaw));this.right.copy(reference).multiplyScalar(-Math.sin(this.yaw)).addScaledVector(side,Math.cos(this.yaw));return;
    }
    this.theta=polarAngle(this.player.position);
    if(this.player.surfaceUp){this.up.copy(this.player.surfaceUp);if(this.player.radialSign)this.up.set(Math.sin(this.theta)*this.player.radialSign,-Math.cos(this.theta)*this.player.radialSign,0)}else this.up.set(-Math.sin(this.theta),Math.cos(this.theta),0);
    const tangent=v3(Math.cos(this.theta),Math.sin(this.theta),0);tangent.addScaledVector(this.up,-tangent.dot(this.up));if(tangent.lengthSq()<.01)tangent.set(0,0,1);tangent.normalize();
    const side=tangent.clone().cross(this.up).normalize();this.forward.copy(tangent).multiplyScalar(Math.cos(this.yaw)).addScaledVector(side,Math.sin(this.yaw));this.right.copy(tangent).multiplyScalar(-Math.sin(this.yaw)).addScaledVector(side,Math.cos(this.yaw));
  }

  updatePlayer(dt){
    const p=this.player,mods=this.mods||NEUTRAL_MODS;this.basis();this.invulnerable=Math.max(0,this.invulnerable-dt);
    this.dashCooldown=Math.max(0,this.dashCooldown-dt);this.dashTime=Math.max(0,this.dashTime-dt);p.bootDelay=Math.max(0,(p.bootDelay||0)-dt);
    const k=this.keys,front=(k.has('KeyW')?1:0)-(k.has('KeyS')?1:0),strafe=(k.has('KeyD')?1:0)-(k.has('KeyA')?1:0);
    const vertical=(k.has('Space')?1:0)-(k.has('ControlLeft')||k.has('ControlRight')?1:0);
    const attached=!!p.surfaceUp;
    if(attached&&this.grapple?.mode!=='pulling'&&!this.raycastWorld(p.position,p.position.clone().addScaledVector(this.up,-4.2))){p.surfaceUp=null;p.radialSign=null;this.grapple?.release();this.basis()}
    this.updateLandingSupport();
    const mag=p.magnetic&&!p.bootDelay&&(this.realm!=='station'||!!p.supportSurface),boost=k.has('ShiftLeft')||k.has('ShiftRight');
    const look=this.forward.clone().multiplyScalar(Math.cos(this.pitch)).addScaledVector(this.up,Math.sin(this.pitch));
    const input=v3().addScaledVector(mag?this.forward:look,front).addScaledVector(this.right,strafe);if(input.lengthSq()>1)input.normalize();
    const reeling=this.grapple?.mode==='pulling';
    if(reeling){
      // The reel owns translation; flight speed limits must not fight its motor.
    }else if(this.dashTime>0){
      p.velocity.copy(this.dashVector).multiplyScalar(43);
      if(mag)p.velocity.addScaledVector(this.up,-3);
    }else if(mag){
      const verticalSpeed=p.velocity.dot(this.up);
      const horizontal=p.velocity.clone().addScaledVector(this.up,-verticalSpeed),desired=input.multiplyScalar((boost?33*mods.boost:14)*mods.speed);
      steerPlanar(horizontal,desired,dt,{grounded:!!p.grounded,boost});
      const rise=clamp(verticalSpeed+(vertical>0?26:vertical<0?-40:-22)*dt,-17,13);
      p.velocity.copy(horizontal).addScaledVector(this.up,rise);
    }else{
      const entrySpeed=p.velocity.length();
      input.addScaledVector(this.up,vertical);if(input.lengthSq()>1)input.normalize();
      p.velocity.addScaledVector(input,(boost?70*mods.boost:42)*mods.speed*dt).multiplyScalar(Math.exp(-dt*(input.lengthSq()>.01?1.5:.4)));
      const flightCap=(boost?44*mods.boost:25)*mods.speed,coastCap=Math.max(flightCap,entrySpeed*Math.exp(-dt*.4));if(p.velocity.length()>coastCap)p.velocity.setLength(coastCap);
    }
    if(!p.magnetic)this.roll+=((k.has('KeyQ')?1:0)-(k.has('KeyE')?1:0))*dt*1.6;else this.roll*=Math.exp(-dt*7);
    this.grapple?.update(dt,p,{brokenWindows:this.world.brokenWindows,raycast:(a,b)=>this.raycastWorld(a,b),onLatch:hit=>{const heading=look.clone();this.yaw=0;this.basis();this.yaw=Math.atan2(heading.dot(this.right),heading.dot(this.forward));this.pitch=clamp(Math.asin(clamp(heading.dot(this.up),-1,1)),-1.48,1.48);this.tutorial?.record('grapple');if(!this.tutorial?.active)this.mission?.recordOpening?.('tether');this.ui.event(`TETHER LOCK · ${hit.label||'SURFACE ATTACHED'}`,1.3)},onRelease:(reason,hit)=>{if(reason==='breach'){this.tutorial?.record('grapple');p.magnetic=true;p.bootDelay=.4;const outward=v3(hit.normal.x,hit.normal.y,hit.normal.z).negate();p.velocity.addScaledVector(outward,Math.max(0,23-p.velocity.dot(outward)));this.ui.event('TETHER RELEASED · BOOT ASSIST ACTIVE',1.5)}else this.ui.event(reason==='blocked'?'TETHER PATH BLOCKED · RELEASED':'TETHER RELEASED · FREE FLIGHT',1)}});
    const next=p.position.clone().addScaledVector(p.velocity,dt);
    if(this.realm!=='station'){const resolved=this.world.resolve(p.position,next,p.velocity,1.45,this.up);p.position.copy(resolved);if(p.position.length()>205){p.position.x=clamp(p.position.x,-145,145);p.position.z=clamp(p.position.z,-145,145);p.velocity.multiplyScalar(.2)}this.finishPlayerUpdate(dt);return}
    const bodyStart=p.position.clone().addScaledVector(this.up,-1.2),bodyEnd=next.clone().addScaledVector(this.up,-1.2);
    const tetherStress=this.grapple?.mode==='pulling'&&this.grapple.hit?.surface==='window'?14:0;
    if(this.world.damageWindow&&Math.max(p.velocity.length(),input.length(),tetherStress)>8){
      const probe=p.velocity.clone();if(Math.abs(input.z)>1)probe.z=input.z;
      const approach=bodyEnd.clone().addScaledVector(probe.normalize(),1.65),hit=firstStationIntersection(bodyStart,approach,this.world);
      if(hit?.surface==='window'&&bodyStart.distanceTo(v3(hit.x,hit.y,hit.z))<1.7+bodyStart.distanceTo(bodyEnd)){
        const normal=v3(hit.normal.x,hit.normal.y,hit.normal.z),height=R-Math.hypot(bodyEnd.x,bodyEnd.y);
        if((hit.roof||(height>3.5&&height<7.6))&&Math.max(-p.velocity.dot(normal),-input.dot(normal),tetherStress)>8&&this.world.damageWindow(hit,100,this.effects)){
          p.surfaceUp=null;p.velocity.addScaledVector(normal,-10);if(!this.tutorial?.active)this.mission?.recordOpening?.('breach');this.ui.event(hit.roof?'SKYLIGHT BREACHED · KESTREL ENTRY':'WINDOW BREACHED · BALCONY AHEAD',2);this.audio.play('glass');
        }
      }
    }
    const resolved=resolveStationMotion(bodyStart,bodyEnd,p.velocity,1.45,this.world);p.position.set(resolved.x,resolved.y,resolved.z).addScaledVector(this.up,1.2);
    const radial=Math.hypot(p.position.x,p.position.y),height=R-radial;
    if(height<4.3&&height>0&&Math.abs(p.position.z)<W){
      for(const cover of this.world.covers){const a=polarAngle(cover.position),along=wrapAngle(this.theta-a)*R,side=p.position.z-cover.position.z,dist=Math.hypot(along,side);if(dist<cover.radius+.65&&dist>.001){const push=cover.radius+.65-dist;p.position.addScaledVector(v3(Math.cos(a),Math.sin(a),0),along/dist*push);p.position.z+=side/dist*push;p.velocity.multiplyScalar(.8)}}
    }
    this.nearAirlock=isAirlock(this.theta)&&Math.abs(p.position.z)<W+5;
    this.finishPlayerUpdate(dt);
    if(p.position.length()>600){this.ui.event('OUT OF RANGE\nEMERGENCY RECALL',2);this.spawnPlayer()}
    this.world.playerLight.position.copy(p.position).addScaledVector(this.up,2);
    if(this.world.sun){this.world.sun.position.copy(p.position).add(v3(-35,65,-65));this.world.sun.target.position.copy(p.position)}
  }
  dash(){
    if(this.dashCooldown>0||this.deadTimer>0)return false;
    this.basis();const k=this.keys,forward=(k.has('KeyW')?1:0)-(k.has('KeyS')?1:0),side=(k.has('KeyD')?1:0)-(k.has('KeyA')?1:0);
    this.grapple?.release();
    this.dashVector.copy(this.forward).multiplyScalar(forward).addScaledVector(this.right,side);if(this.dashVector.lengthSq()<.1)this.dashVector.copy(this.forward);this.dashVector.normalize();
    this.dashTime=.19;this.dashCooldown=this.mission?.upgrades>=2?1.6:2.4;this.tutorial?.record('dash');this.audio.play('dash');this.sense?.event('dash');this.effects.burst(this.player.position.clone().addScaledVector(this.up,-1),'#8cf3ff',9,4);return true;
  }
  finishPlayerUpdate(dt){
    const p=this.player;if(!this.online?.active&&this.time-p.lastHit>5)p.shield=Math.min(100,p.shield+dt*18);this.updateHeartbeat(dt);
    this.updateLandingSupport();
    this.world.playerLight.position.copy(p.position).addScaledVector(this.up,2);
    if(this.world.sun){this.world.sun.position.copy(p.position).add(v3(-35,65,-65));this.world.sun.target.position.copy(p.position)}
  }
  updateLandingSupport(){
    const p=this.player;
    const hit=this.raycastWorld(p.position,p.position.clone().addScaledVector(this.up,-16));
    p.supportSurface=hit&&v3(hit.normal.x,hit.normal.y,hit.normal.z).dot(this.up)>.65?{...hit,distance:p.position.distanceTo(v3(hit.x,hit.y,hit.z))}:null;
    p.grounded=!!p.supportSurface&&p.supportSurface.distance<2.95;
  }
  tetherOrigin(out=v3()){
    if(!this.thirdPerson)return this.guns[0].userData.flash.getWorldPosition(out);
    const limbs=this.playerMech.limbs,hand=limbs.leftGun?.userData.flash||limbs.leftElbow||limbs.leftArm||this.playerMech.group;
    this.playerMech.group.updateMatrixWorld(true);return hand.getWorldPosition(out);
  }
  fireGrapple(){
    if(this.deadTimer>0)return;
    if(this.grapple.mode==='pulling'||this.grapple.mode==='flying'){const pulling=this.grapple.mode==='pulling';this.grapple.release();if(pulling){this.player.magnetic=false;this.player.surfaceUp=null;this.player.radialSign=null}this.ui.event('TETHER RELEASED',.8);return}
    this.grapple.release();
    const {origin,direction}=this.aim();
    if(this.grapple.fire(origin,direction,(a,b)=>this.raycastWorld(a,b))){this.audio.play('missile');this.recoil[0]=.7;this.ui.event('TETHER FIRED · C TO RELEASE',1.2)}else this.ui.event('NO ANCHOR · AIM AT A SURFACE',1.3);
  }
  // `source` is where the fire came from; it points the damage ring at the shooter and tilts the camera away from it.
  hurtPlayer(damage,source){
    if(this.invulnerable>0||this.tutorial?.active||this.spawnGrace>0||this.deadTimer>0||this.mission?.stage==='complete')return;
    damage*=this.damageScale();const p=this.player,shield=p.shield,health=p.health;
    p.lastHit=this.time;if(this.run)this.run.damageTaken+=damage;applyDamage(p,damage);
    const feel=damageFeel(damage,shield,health,p.shield,p.health),bearing=source?this.bearingTo(source):null;
    this.ui.damage(feel,bearing);this.audio.play(feel.shieldBroke?'shieldBreak':feel.shieldOnly?'shieldHit':'hurt',{volume:.65+.35*feel.amount});
    this.shake=Math.max(this.shake,feel.shake);this.kickCamera(feel,bearing);this.sense?.event('hurt',{amount:feel.amount});
    if(feel.shieldBroke&&p.health>0)this.ui.event('SHIELD DOWN',.9);
    if(this.chapterTime>.4)this.chapterTime=.4;
    if(p.health<=0)this.killPlayer();
  }
  bearingTo(point){return bearingOf(this.forward,this.right,this.player.position,point)}
  // A Lancer has started charging at the pilot: tick the ring toward it and beep, so an off-screen lock is never a surprise.
  lockWarning(bot){const bearing=this.bearingTo(bot.group.position);this.ui.warn?.(bearing);this.audio.play('lock',{pan:Math.sin(bearing)})}
  kickCamera(feel,bearing){const k=this.kick||(this.kick={pitch:0,roll:0});k.pitch=Math.max(k.pitch,feel.kick);if(bearing!=null)k.roll=Math.max(-.09,Math.min(.09,k.roll-Math.sin(bearing)*feel.kick*1.6))}
  // Rounds that whip past without hitting still rattle the pilot: a crack on the side they passed, a nudge and a tick on the ring.
  nearMiss(bullet){
    const bearing=this.bearingTo(bullet.origin||bullet.position);this.shake=Math.max(this.shake,.22);this.sense?.event('miss');this.ui.nearMiss?.(bearing);
    this.audio.play('whiz',{volume:.85,pan:Math.sin(this.bearingTo(bullet.position))});
  }
  updateHeartbeat(dt){
    const level=dangerLevel(this.player.health,this.player.shield);
    if(level<.25||this.deadTimer>0){this.beatClock=0;return}
    this.beatClock=(this.beatClock||0)-dt;if(this.beatClock<=0){this.audio.play('heartbeat',{volume:.5+.5*level});this.beatClock=heartInterval(level)}
  }
  spawnGardenPlayer(){
    this.consumePendingBuild();
    const start=this.battle?this.battle.playerSpawn():this.realm==='city'?this.mission?.wave>0&&this.mission.stage!=='gauntlet'?CITY_UPLINKS[this.mission.wave-1]:{x:0,z:-65}:{x:0,z:-44};
    this.player.position.set(start.x,this.groundHeight(start.x,start.z)+2.65,start.z);this.player.velocity.set(0,0,0);this.player.health=100;this.player.shield=100;this.player.magnetic=true;this.player.surfaceUp=null;this.player.radialSign=null;this.player.bootDelay=0;this.yaw=start.yaw||0;this.pitch=.02;this.roll=0;this.invulnerable=5;this.spawnGrace=5;this.deadTimer=0;this.dashTime=0;this.dashCooldown=0;this.grapple?.release();this.bullets=[];this.ui.clearCombat?.();if(this.tutorial)this.tutorial.previous=null;
  }
  configureEnemy(bot,type){
    if(bot.archetype!==type){
      this.scene.remove(bot.group);const forms=bot.forms||(bot.forms=new Map());forms.set(bot.archetype,{group:bot.group,parts:bot.parts,limbs:bot.limbs,paint:bot.paint,glow:bot.glow});const mech=forms.get(type)||makeMech('red',1,type);Object.assign(bot,mech);bot.archetype=type;this.scene.add(bot.group);bot.parts.forEach(part=>part.userData.bot=bot);
    }
    bot.name=ENEMY_TYPES[type].name;bot.navPoint=null;bot.navProbeTime=0;bot.salvo=0;bot.aimLock=null;bot.specialCooldown=5;
  }
  spawnGardenBot(bot){
    const spec=ENEMY_TYPES[bot.archetype],difficulty=this.mission?.difficulty;
    bot.flying=false;bot.dead=false;bot.respawn=Infinity;bot.group.visible=true;
    const center=this.realm==='city'?(this.mission?.stage==='gauntlet'?[{x:0,z:-30},...CITY_UPLINKS][this.mission.wave%4]:this.mission?.wave===0?{x:0,z:-30}:CITY_UPLINKS[(this.mission?.wave||1)-1]):{x:0,z:this.mission?.wave===1?30:4};
    const offsets=[[-12,30],[12,35],[-7,48],[8,56],[-12,63],[4,70]],[dx,dz]=offsets[bot.index];
    bot.gardenPosition=v3(clamp(center.x+dx,-25,25),0,clamp(center.z+dz,-30,85));bot.gardenPosition.y=this.groundHeight(bot.gardenPosition.x,bot.gardenPosition.z);
    bot.health=spec.health*(difficulty?.health||1);bot.shield=spec.shield;bot.maxHealth=bot.health;bot.maxShield=bot.shield;bot.fire=1.4+bot.index*.28;bot.moveVelocity=null;bot.volley=null;bot.hit=0;bot.recoil=0;bot.hover=0;bot.speed=0;bot.charge=0;bot.armLost=false;bot.legLost=false;bot.partHealth={arm:70,leg:70};bot.justSpawned=true;
    Object.values(bot.limbs).forEach(l=>l.visible=true);this.positionBot(bot,this.time||0,0);
  }
  enemyFire(bot,dt,peaceful,range){
    const spec=ENEMY_TYPES[bot.archetype]||ENEMY_TYPES.gunner,difficulty=this.mission?.difficulty||{damage:1,cadence:1};
    bot.fire=peaceful?Math.max(bot.fire,1.2):bot.fire-dt;const windup=spec.attack==='snipe'?1.15:.7;bot.charge=!peaceful&&bot.fire<windup?1-bot.fire/windup:0;
    const up=this.realm!=='station'?v3(0,1,0):v3(-Math.sin(bot.angle),Math.cos(bot.angle),0),from=bot.group.position.clone().addScaledVector(up,2.3),target=this.player.position.clone().addScaledVector(this.up,-.35);
    const gun=bot.limbs[bot.armLost?'rightGun':'leftGun'];if(gun){bot.group.updateMatrixWorld(true);gun.userData.flash.getWorldPosition(from)}
    if(bot.charge>0&&spec.attack==='snipe'){
      if(!bot.aimLock){bot.aimLock=target.clone();this.lockWarning(bot)}if(this.time-(bot.sightTime||0)>.08){this.effects.trace(from,bot.aimLock,'#d696ff',.025,.1);bot.sightTime=this.time}
    }
    bot.specialCooldown=(bot.specialCooldown??5)-dt;
    if(!peaceful&&spec.attack==='boss'&&bot.specialCooldown<=0&&range<100){bot.specialCooldown=bot.health<bot.maxHealth*.5?4.5:6;this.addDangerZone(this.player.position.clone(),6,2,35*difficulty.damage);this.ui.event('GROUND STRIKE · DASH OUT OF THE RED RING',1.8)}
    if(bot.volley){if(peaceful)bot.volley=null;else this.tickVolley(bot,dt,spec,difficulty,from,target,up)}
    if(bot.fire>0||peaceful)return;
    if(bot.archetype==='bulwark'&&bulwarkFacing(bot,target)<.55)return;
    bot.fire=(bot.armLost?spec.cooldown*1.5:spec.cooldown)*difficulty.cadence;
    if(range>100||this.blockedByCover(from,target)){bot.aimLock=null;return}
    if(spec.attack==='rush'&&from.distanceTo(target)<MELEE_REACH){bot.recoil=1;this.hurtPlayer(spec.damage*difficulty.damage,bot.group.position);this.effects.burst(target,'#ffb070',8,5);return}
    bot.volley={left:volleyFor(spec.attack).shots,wait:0,aim:bot.aimLock};bot.aimLock=null;this.tickVolley(bot,0,spec,difficulty,from,target,up);
  }
  // One round (or fan) of a volley. Every round re-aims at the pilot's predicted position, so a burst keeps tracking a strafing
  // target; stepping behind cover ends it. Muzzle flash, report and a long fat bolt make the shot readable from across the arena.
  tickVolley(bot,dt,spec,difficulty,from,target,up){
    const volley=bot.volley;volley.wait-=dt;if(volley.wait>0)return;
    if(this.deadTimer>0||this.blockedByCover(from,target)){bot.volley=null;return}
    const shape=volleyFor(spec.attack),accuracy=accuracyFor(difficulty.tier||1),tmp=this.fireTmp||(this.fireTmp=[v3(),v3(),v3()]);
    const aim=volley.aim||leadPoint(from,target,this.player.velocity,spec.shotSpeed,leadFor(accuracy),tmp[0]);
    tmp[1].copy(aim).sub(from).normalize();jitterDirection(tmp[1],aimCone(spec.attack,accuracy,this.player.velocity.length()),Math.random,tmp[2]);
    const side=tmp[1].clone().cross(up).normalize();
    for(let i=0;i<shape.bolts;i++){
      const direction=tmp[2].clone();if(shape.bolts>1)direction.addScaledVector(side,(i-(shape.bolts-1)/2)*shape.fan).normalize();
      this.bullets.push({position:from.clone(),origin:from.clone(),velocity:direction.multiplyScalar(spec.shotSpeed),life:3,owner:'enemy',weapon:0,kind:spec.attack,damage:spec.damage*difficulty.damage,blast:spec.attack==='blast'?4:0,color:spec.glow});
    }
    bot.recoil=1;this.effects.burst(from,spec.glow,5,3);this.effects.muzzleFlash?.(from,spec.glow,spec.attack==='snipe'||spec.attack==='boss'?1.6:1);
    this.audio.play('enemyShot',{volume:shotVolume(from.distanceTo(this.player.position)),pan:Math.sin(this.bearingTo(from))});
    volley.left--;volley.wait=shape.gap;volley.aim=null;if(volley.left<=0)bot.volley=null;
  }
  addDangerZone(position,radius,delay,damage){
    if(this.realm==='station')return;
    const mesh=new T.Mesh(new T.TorusGeometry(radius,.065,6,48),new T.MeshBasicMaterial({color:'#ff4840',transparent:true,opacity:.9,depthWrite:false}));mesh.rotation.x=-Math.PI/2;position.y=this.groundHeight(position.x,position.z)+.13;mesh.position.copy(position);this.scene.add(mesh);
    (this.dangerZones||=[]).push({position,radius,remaining:delay,total:delay,damage,mesh});
  }
  clearDangerZones(){for(const zone of this.dangerZones||[]){this.scene.remove(zone.mesh);zone.mesh.geometry.dispose();zone.mesh.material.dispose()}this.dangerZones=[]}
  updateDangerZones(dt){
    for(let i=(this.dangerZones||[]).length-1;i>=0;i--){const zone=this.dangerZones[i];zone.remaining-=dt;zone.mesh.material.opacity=.45+.5*Math.abs(Math.sin(this.time*9));zone.mesh.scale.setScalar(.9+.1*zone.remaining/zone.total);
      if(zone.remaining>0)continue;this.effects.explosion(zone.position,2.0);const target=this.player.position.clone().addScaledVector(this.up,-1.5);
      if(target.distanceTo(zone.position)<zone.radius&&!this.blockedByCover(zone.position.clone().add(v3(0,.3,0)),target))this.hurtPlayer(zone.damage,zone.position);
      this.scene.remove(zone.mesh);zone.mesh.geometry.dispose();zone.mesh.material.dispose();this.dangerZones.splice(i,1);
    }
  }
  updateGardenBots(dt){
    const peaceful=this.tutorial?.active||this.spawnGrace>0||this.deadTimer>0||this.mission?.stage==='complete';
    for(const bot of this.bots){
      if(bot.dead)continue;
      const delta=this.player.position.clone().sub(bot.gardenPosition);delta.y=0;const distance=delta.length(),direction=delta.clone().normalize(),spec=ENEMY_TYPES[bot.archetype]||ENEMY_TYPES.gunner,pressure=bot.pressure=this.player.velocity.length()<2.5?Math.min(3,(bot.pressure||0)+dt):Math.max(0,(bot.pressure||0)-dt*2),preferred=combatRange(spec,pressure);
      if(this.time>(bot.strafeUntil||0)){const s=nextStrafe(this.time);bot.strafeDir=s.dir;bot.strafeUntil=s.until}
      const along=T.MathUtils.clamp((distance-preferred)*3,-6,10*spec.speed),velocity=direction.clone().multiplyScalar(along);velocity.add(v3(-direction.z,0,direction.x).multiplyScalar((bot.strafeDir||1)*(spec.attack==='rush'?1.5:4.5)));
      for(const other of this.bots){if(other===bot||other.dead)continue;const push=bot.gardenPosition.clone().sub(other.gardenPosition),d=push.length();if(d>0&&d<5)velocity.addScaledVector(push,(5-d)*2/d)}
      if(distance>6)this.steerAroundCover(bot,velocity);
      // Integrate intent before moving; abrupt strafe choices no longer snap the rig sideways.
      bot.moveVelocity ||= v3();steerPlanar(bot.moveVelocity,velocity,dt,{grounded:true});velocity.copy(bot.moveVelocity);
      const closing=velocity.dot(direction),safeGap=3.6;
      if(closing>0)velocity.addScaledVector(direction,-Math.max(0,closing-Math.max(0,(distance-safeGap)/dt)));
      // Physical pilot separation applies after movement too (including sideways approaches).

      const foot=bot.gardenPosition.clone(),oldHover=bot.hover||0,playerHeight=this.player.position.y-this.groundHeight(this.player.position.x,this.player.position.z),canFly=['striker','gunner','sniper'].includes(bot.archetype);
      const hoverTarget=canFly&&playerHeight>8?clamp(this.player.position.y-foot.y-1.4,0,85):0,newHover=T.MathUtils.damp(oldHover,hoverTarget,1.8,dt),eye=foot.clone().add(v3(0,2.65+oldHover,0)),next=eye.clone().addScaledVector(velocity,dt).add(v3(0,newHover-oldHover,0)),resolved=this.world.resolve(eye,next,velocity,1.2,v3(0,1,0));
      bot.gardenPosition.copy(resolved);bot.gardenPosition.y=this.groundHeight(resolved.x,resolved.z);bot.hover=Math.max(0,resolved.y-bot.gardenPosition.y-2.65);bot.speed=foot.distanceTo(bot.gardenPosition)/dt;bot.strafe=velocity.dot(v3(-direction.z,0,direction.x));bot.backwards=distance<preferred-1;bot.recoil=Math.max(0,bot.recoil-dt*9);bot.hit=Math.max(0,bot.hit-dt*6);bot.stagger=Math.max(0,(bot.stagger||0)-dt*3.2);
      const separation=bot.gardenPosition.clone().sub(this.player.position);separation.y=0;
      if(separation.length()<3.6&&separation.length()>.001&&Math.abs(bot.hover+2.65-playerHeight)<4){
        const push=separation.setLength(3.6-separation.length());const end=resolved.clone().add(push);
        const clear=this.world.resolve(resolved,end,bot.moveVelocity,1.2,v3(0,1,0));bot.gardenPosition.x=clear.x;bot.gardenPosition.z=clear.z;
      }
      this.enemyFire(bot,dt,peaceful,distance);this.positionBot(bot,this.time,dt);
    }
  }
  steerAroundCover(bot,velocity){
    const center=bot.gardenPosition.clone().add(v3(0,2.3+(bot.hover||0),0)),destination=(bot.navTarget||this.player.position).clone();
    if(bot.navPoint&&(bot.navPoint.distanceTo(bot.gardenPosition)<2.5||this.time>bot.navUntil))bot.navPoint=null;
    if(!bot.navPoint&&this.time>=(bot.navProbeTime||0)){
      bot.navProbeTime=this.time+.3;const hit=this.world.raycast(center,destination);if(!hit||center.distanceTo(v3(hit.x,hit.y,hit.z))>25)return;
      const options=[];
      for(const obstacle of this.world.obstacles){const b=obstacle.box;if(!b||b.distanceToPoint(v3(hit.x,hit.y,hit.z))>.3)continue;
        const pad=2.5+Math.max(0,(obstacle.walkReach||0)-obstacle.radius); // trees are wider than their trunk box at body height
        for(const x of [b.min.x-pad,b.max.x+pad])for(const z of [b.min.z-pad,b.max.z+pad]){
          const point=v3(x,this.groundHeight(x,z),z),eye=point.clone().add(v3(0,2.3,0));if(!this.world.raycast(center,eye))options.push({point,cost:center.distanceTo(eye)+point.distanceTo(destination)});
        }
      }
      options.sort((a,b)=>a.cost-b.cost);if(options[0]){bot.navPoint=options[0].point;bot.navUntil=this.time+4}
    }
    if(bot.navPoint){const delta=bot.navPoint.clone().sub(bot.gardenPosition);delta.y=0;velocity.copy(delta.normalize().multiplyScalar(10*(ENEMY_TYPES[bot.archetype]?.speed||1)))}
  }
  updateFlightBot(bot,dt,peaceful){
    const radial=Math.hypot(this.player.position.x,this.player.position.y),outside=Math.abs(this.player.position.z)>W+1||radial<R-H-1||radial>R+1;
    const sign=this.player.position.z<0?-1:1;
    if(!bot.flying){
      let exit=0,best=Infinity;
      for(let i=0;i<96;i++){const angle=i/96*TAU;if(!isAirlock(angle))continue;const cost=Math.abs(wrapAngle(angle-this.theta));if(cost<best){best=cost;exit=angle}}
      const delta=wrapAngle(exit-bot.angle);bot.angle=wrapAngle(bot.angle+Math.sign(delta)*Math.min(Math.abs(delta),dt*.15));bot.speed=10;bot.hover=0;
      if(Math.abs(delta)<.018)bot.side+=sign*dt*8;
      this.positionBot(bot,this.time,dt);
      if(Math.abs(bot.side)>W+2){bot.flying=true;bot.flightPosition=bot.group.position.clone();bot.flightVelocity=v3()}
      return true;
    }
    const up=v3(-Math.sin(bot.angle),Math.cos(bot.angle),0),center=bot.flightPosition.clone().addScaledVector(up,1.7),target=this.player.position.clone().addScaledVector(this.up,-1.5),distance=center.distanceTo(this.player.position);
    if(!outside){
      bot.flightRoute=null;
      let exit=0,best=Infinity;for(let i=0;i<96;i++){const a=i/96*TAU;if(isAirlock(a)&&Math.abs(wrapAngle(a-this.theta))<best){best=Math.abs(wrapAngle(a-this.theta));exit=a}}
      const p=stationPosition(exit,1.5,Math.abs(wrapAngle(bot.angle-exit))<.07?0:(bot.side<0?-1:1)*(W+5));target.set(p.x,p.y,p.z);
    }else{
      // Clear roofs first, then approach occupied compartments through their outer doorway.
      if(bot.flightRoute&&this.time-bot.flightRoute.started>9)bot.flightRoute=null;
      if(!bot.flightRoute&&this.blockedByCover(center,target))bot.flightRoute=this.planExteriorRoute(bot,target);
      if(bot.flightRoute){
        const points=bot.flightRoute.points;
        while(points.length&&bot.flightPosition.distanceTo(points[0])<2.2)points.shift();
        if(points.length)target.copy(points[0]);else bot.flightRoute=null;
      }
    }
    const direction=target.clone().sub(bot.flightPosition),preferred=bot.index%3===0?5.5:13.5,desired=direction.normalize().multiplyScalar(bot.flightRoute||distance>preferred||!outside?17:0);
    for(const other of this.bots){
      if(other===bot||other.dead||!other.flying)continue;
      const offset=bot.flightPosition.clone().sub(other.flightPosition),gap=offset.length();
      if(gap>0.001&&gap<5)desired.addScaledVector(offset,(5-gap)*2/gap);
      else if(gap<=.001)desired.addScaledVector(v3(Math.cos(bot.angle),Math.sin(bot.angle),0),bot.index>other.index?4:-4);
    }
    if(desired.length()>23)desired.setLength(23);bot.flightVelocity.lerp(desired,1-Math.exp(-dt*3));
    const start=bot.flightPosition.clone().addScaledVector(up,1.5),end=start.clone().addScaledVector(bot.flightVelocity,dt),result=resolveStationMotion(start,end,bot.flightVelocity,1.2,this.world);bot.flightPosition.set(result.x,result.y,result.z).addScaledVector(up,-1.5);bot.angle=polarAngle(bot.flightPosition);bot.side=bot.flightPosition.z;bot.speed=bot.flightVelocity.length();bot.recoil=Math.max(0,bot.recoil-dt*9);bot.hit=Math.max(0,bot.hit-dt*6);bot.stagger=Math.max(0,(bot.stagger||0)-dt*3.2);
    if(!outside&&Math.abs(bot.side)<W-2&&R-Math.hypot(bot.flightPosition.x,bot.flightPosition.y)<4){bot.flying=false;bot.side=clamp(bot.side,-2.3,2.3)}
    this.positionBot(bot,this.time,dt);this.enemyFire(bot,dt,peaceful,distance);return true;
  }
  planExteriorRoute(bot,target){
    const docks=this.world.exteriorLayout?.docks||[],findDock=point=>docks.find(d=>R-Math.hypot(point.x,point.y)<7&&Math.abs(wrapAngle(polarAngle(point)-d.angle))<.10&&point.z>=d.floor.minZ&&point.z<=d.floor.maxZ);
    const from=bot.flightPosition,fromDock=findDock(from),toDock=findDock(target),points=[];
    const point=(angle,height,z)=>{const p=stationPosition(angle,height,z);return v3(p.x,p.y,p.z)};
    const exit=fromDock?point(fromDock.angle,1.0,fromDock.side*34):from.clone();
    if(fromDock)points.push(exit);
    points.push(point(polarAngle(exit),17,exit.z));
    const approach=toDock?point(toDock.angle,1.0,toDock.side*34):target.clone();
    points.push(point(polarAngle(approach),17,approach.z),approach);
    return{points,started:this.time};
  }
  setRealm(realm){
    if(this.realm===realm)return;
    for(const missile of this.projectiles){this.scene.remove(missile.mesh);missile.mesh.geometry.dispose();missile.mesh.material.dispose()}this.projectiles=[];this.bullets=[];this.grapple.release();
    this.clearDangerZones();this.chapterTime=6;this.realm=realm;this.world=realm==='city'?this.cityWorld:realm==='eden'?this.edenWorld:this.stationWorld;this.scene=this.world.scene;this.effects=this.effectsByRealm[realm];this.renderPass.scene=this.scene;
    this.scene.add(this.camera,this.playerMech.group,this.tether.root);this.bots.forEach(bot=>this.scene.add(bot.group));this.player.surfaceUp=null;this.player.radialSign=null;this.player.magnetic=true;this.portalCooldown=3;this.transition=1;this.renderer.shadowMap.needsUpdate=true;
  }
  enterEden(){
    if(!this.mission?.enterEden())return false;this.completeChapter(1);
    this.unlock(2);this.setRealm('eden');this.bots.forEach(b=>{b.dead=true;b.group.visible=false});this.spawnGardenPlayer();this.syncEncounter(true);this.ui.event('EDEN\nTHE LAST SANCTUARY',4);return true;
  }
  enterCity(){
    if(!this.mission?.enterCity())return false;this.completeChapter(0);this.unlock(1);this.setRealm('city');this.spawnGardenPlayer();this.syncEncounter(true);this.ui.event('MERIDIAN\nTHE SILENT CITY',4);return true;
  }
  syncEncounter(force=false){
    if(!this.mission||this.battle||this.tutorial.active||!force&&this.encounterRevision===this.mission.revision)return;
    this.encounterRevision=this.mission.revision;this.bots.forEach(bot=>{bot.dead=true;bot.group.visible=false});
    this.bots.forEach(bot=>this.spawnBot(bot,true));
    if(this.mission.combatActive){if(this.mission.stage==='gauntlet')this.cityWorld?.pulseGates?.();this.player.health=100;this.player.shield=100;this.spawnGrace=3;this.invulnerable=3;this.chapterTime=this.mission.stage==='gauntlet'&&this.mission.wave>0?0:5;this.bullets=[];this.ui.event(`THREAT ${this.mission.difficulty.tier} · ${this.mission.composition.length} HOSTILES INBOUND`,3)}
  }
  interact(){
    if(!this.mission||this.battle||this.tutorial.active)return;
    if(this.realm==='station'&&this.mission.stage==='briefing'&&this.player.position.distanceTo(this.world.launchConsole.position)<7){this.mission.launch();this.syncEncounter(true);this.chapterTime=0;return}
    if(this.realm==='city'&&this.mission.stage==='city-uplink'){
      const relay=this.world.uplinks[this.mission.wave];if(this.player.position.distanceTo(relay.position)<6){this.mission.activateUplink();this.syncEncounter(true);this.player.health=100;this.player.shield=100;this.ui.event(`${['TRANSIT','CIVIC','GATE'][this.mission.upgrades-1]} DISTRICT POWER RESTORED · SUIT REFIT`,3);this.audio.play('ui')}return;
    }
    if(this.realm==='eden'&&this.player.position.distanceTo(this.world.archive.position)<5.5){
      if(this.mission.restore()){this.completeChapter(2);this.clearDangerZones();this.ui.event('EDEN RESTORED\nTHE SEED ARCHIVE IS SAFE',5);this.audio.play('kill')}
      else this.ui.event(this.mission.stage==='complete'?'ARCHIVE SECURED':'DEFEAT THE REMAINING WARDENS FIRST',2);
    }else if((this.realm==='station'||this.realm==='city')&&this.player.position.distanceTo(this.world.portal.position)<7){if(this.mission.gateOpen){if(this.realm==='station')this.enterCity();else this.enterEden()}else this.ui.event('GATEWAY OFFLINE · COMPLETE THE CHAPTER OBJECTIVE',2)}
  }
  updateMission(dt){
    if(!this.mission)return;
    if(!this.tutorial.active){this.mission.tick(dt);this.syncEncounter()}this.chapterTime=Math.max(0,(this.chapterTime||0)-dt);
    this.portalCooldown=Math.max(0,this.portalCooldown-dt);this.transition=Math.max(0,this.transition-dt*1.2);
    for(let i=this.pickups.length-1;i>=0;i--){const cell=this.pickups[i];cell.update(this.time);if(this.realm==='station'&&cell.root.position.distanceTo(this.player.position)<3.8){this.mission.recoverCell();cell.dispose();this.pickups.splice(i,1);this.ui.event('RELAY CELL RECOVERED',1.5);this.audio.play('ui')}}
    if(this.realm==='station'&&this.mission.stage==='portal'&&this.portalCooldown===0&&this.world.portal.contains(this.player.position))this.enterCity();
    if(this.realm==='city'&&this.mission.stage==='city-portal'&&this.portalCooldown===0&&this.world.portal.contains(this.player.position))this.enterEden();
    if(this.mission.stage==='gauntlet'){const best=this.profile?.gauntlet;this.cityWorld?.setArenaBoard?.({wave:this.mission.wave+1,score:this.run?.score||0,lives:this.mission.lives,best:best?.score>0?{wave:best.wave,score:best.score}:null})}
    if(this.radio)this.radio.remaining-=dt;
    if(this.radioStage!==this.mission.stage){this.radio=null;this.radioStage=this.mission.stage}
    if(!this.tutorial.active&&(!this.radio||this.radio.remaining<=0)&&this.mission.messages.length){const message=this.mission.messages.shift();this.radio={...message,remaining:Math.max(7,Math.min(13,message.text.length/17))};this.audio.play('ui')}
  }
  objectiveTarget(){
    if(!this.mission)return null;
    if(this.battle)return this.battle.objectiveMarker();
    if(this.realm==='station'){
      if(this.mission.stage==='briefing')return{position:this.world.launchConsole.position,label:'LAUNCH CONSOLE'};
      if(this.mission.stage==='portal')return{position:this.world.portal.position,label:'MERIDIAN GATEWAY'};
      if(!this.tutorial?.active&&!this.pickups.length&&this.mission.openingStep==='breach'&&this.bots.some(b=>!b.dead&&b.archetype==='bulwark')){const p=stationPosition(0,5,8.5);return{position:v3(p.x,p.y,p.z),label:'BREACH GLASS · FIRE / JUMP + BOOST'}}
      if(!this.tutorial?.active&&!this.pickups.length&&this.mission.openingStep==='tether'&&this.bots.some(b=>!b.dead&&b.archetype==='bulwark')){const p=stationPosition(0,.09,40.5);return{position:v3(p.x,p.y,p.z),label:'EXTERIOR PAD · AIM + C'}}
      const cell=this.pickups.slice().sort((a,b)=>a.root.position.distanceTo(this.player.position)-b.root.position.distanceTo(this.player.position))[0];if(cell)return{position:cell.root.position,label:'GATE CELL'};
    }
    if(this.realm==='city'){
      if(this.mission.stage==='city-uplink'){const relay=this.world.uplinks[this.mission.wave];return{position:relay.position.clone().add(v3(0,2,0)),label:relay.name}}
      if(this.mission.stage==='city-portal')return{position:this.world.portal.position,label:'EDEN GATEWAY'};
    }
    if(this.realm==='eden'&&['beacon','complete'].includes(this.mission.stage))return{position:this.world.archive.position,label:'HEART TREE'};
    if(!this.tutorial?.active&&this.mission.openingStep==='reactor'){
      const heavy=this.bots.find(b=>!b.dead&&b.archetype==='bulwark');if(heavy)return{position:heavy.group.position.clone().addScaledVector(v3(-Math.sin(heavy.angle||0),Math.cos(heavy.angle||0),0),4),label:'BULWARK · FLANK REAR REACTOR',hostile:true};
    }
    const bot=this.bots.filter(b=>!b.dead).sort((a,b)=>a.group.position.distanceTo(this.player.position)-b.group.position.distanceTo(this.player.position))[0];return bot?{position:bot.group.position.clone().add(v3(0,4,0)),label:bot.name,hostile:true}:null;
  }

  // Where the hero should stand on the launch deck: the middle of the open band between the briefing and the frame card (or the
  // right edge when the card folds under the briefing on narrow windows). Measured from the real layout, cached per window size.
  deckFocus(){
    const key=innerWidth+'x'+innerHeight;
    if(this.focusKey!==key){
      const left=document.querySelector('#menu .menu-content')?.getBoundingClientRect(),card=document.querySelector('#menu .pilot-readout')?.getBoundingClientRect();
      if(!left?.width)return this.focus??.62;
      const from=left.right,to=card?.width&&card.left>from+160?card.left:innerWidth;
      this.focus=Math.min(.78,Math.max(.4,(from+to)/2/innerWidth));this.focusKey=key;
    }
    return this.focus;
  }
  setCamera(dt){
    if(!this.running){
      const t=reducedMotion?0:this.menuTime,power=this.deckControls.update(dt).power;this.heroMech.group.visible=true;this.launchDeck.update(t,dt,this.deckControls);this.renderPass.scene=this.launchDeck.scene;frameLaunchDeck(this.camera,this.launchDeck.center,innerWidth/innerHeight,this.deckControls,this.deckFocus());animateMech(this.heroMech,{dt,time:t,aimPitch:power*.22});this.heroMech.glow.emissiveIntensity=1.2+power*2.4;for(const jet of [this.heroMech.limbs.leftJet,this.heroMech.limbs.rightJet])if(jet){jet.visible=power>.3;jet.scale.set(1,.45+power*.5,1)}return;
    }
    this.renderPass.scene=this.scene;this.camera.clearViewOffset();
    this.basis();const p=this.player,aim=this.forward.clone().multiplyScalar(Math.cos(this.pitch)).addScaledVector(this.up,Math.sin(this.pitch));
    if(this.lastYaw!=null&&dt>0){const d=Math.atan2(Math.sin(this.yaw-this.lastYaw),Math.cos(this.yaw-this.lastYaw));this.turnRate=T.MathUtils.damp(this.turnRate||0,Math.abs(d)>.6?0:d/dt,10,dt)}this.lastYaw=this.yaw;
    this.cameraUp=smoothSurfaceUp(this.cameraUp||this.up.clone(),this.up,dt);
    // Both cameras and the visible mech share the same interpolated position.
    const eye=blendPosition(this.prevPos,p.position,this.alpha??1,this.eye||(this.eye=v3()));
    this.camera.up.copy(this.cameraUp);this.camera.position.copy(eye);
    const moving=p.velocity.length(),boost=this.keys.has('ShiftLeft')||this.keys.has('ShiftRight');
    if(this.thirdPerson){
      // Chase camera (chase-camera.js): orbit with a limited pitch, spring-arm in front of anything solid, hide the mech if it gets too close.
      const pivot=eye.clone().addScaledVector(this.up,.4),offset=chaseOffset(this.forward,this.up,this.pitch),wanted=offset.length(),desired=pivot.clone().add(offset);
      const blocker=this.raycastWorld(pivot,desired),want=armTarget(wanted,blocker?pivot.distanceTo(v3(blocker.x,blocker.y,blocker.z)):null);
      this.armLength=armEase(this.armLength??want,want,dt||.016);
      const arm=pivot.clone().addScaledVector(offset.normalize(),this.armLength),result=this.realm!=='station'?this.world.resolve(pivot,arm,v3(),.3,this.up):resolveStationMotion(pivot,arm,v3(),.3,this.world);
      this.camera.position.set(result.x,result.y,result.z);this.camera.lookAt(eye.clone().addScaledVector(aim,35));
      this.playerMech.group.visible=mechVisible(pivot.distanceTo(this.camera.position));
    }else{
      if(!reducedMotion&&this.running&&p.magnetic)this.camera.position.addScaledVector(this.up,Math.sin(this.time*(boost?15:10))*Math.min(moving/14,1)*.045);
      this.camera.lookAt(eye.clone().addScaledVector(aim,100));
    }
    if(this.roll)this.camera.rotateZ(this.roll);
    this.shake=Math.max(0,this.shake-dt*3.5);
    if(!reducedMotion){this.camera.rotateX(Math.sin(this.time*63)*this.shake*.02);this.camera.rotateZ((this.keys.has('KeyA')?.012:this.keys.has('KeyD')?-.012:0)+Math.cos(this.time*52)*this.shake*.014)}
    if(this.recoilKick){if(!reducedMotion)this.camera.rotateX(this.recoilKick);this.recoilKick*=Math.exp(-(dt||.016)*7.5);if(this.recoilKick<1e-4)this.recoilKick=0}
    const kick=this.kick;if(kick){if(!reducedMotion){this.camera.rotateX(kick.pitch);this.camera.rotateZ(kick.roll)}const decay=Math.exp(-(dt||.016)*9);kick.pitch*=decay;kick.roll*=decay}
    // 4D body motion (sensation.js): the view carries weight. Lean into strafes and turns, tip under acceleration, dip on landing.
    const body=this.sense?.out;if(body){this.camera.rotateX(body.pitch);this.camera.rotateZ(body.roll);this.camera.position.addScaledVector(this.up,-body.drop)}
    const targetFov=reducedMotion?80:this.dashTime>0?94:boost&&moving>8?90:80;
    // the FOV punch (a dash, a nearby blast) rides on top of the damped base FOV: written into camera.fov directly it would be smoothed away
    this.baseFov=T.MathUtils.damp(this.baseFov??this.camera.fov,targetFov,9,dt||.016);this.camera.fov=this.baseFov+(body?.fov||0);this.camera.updateProjectionMatrix();
    this.guns.forEach((gun,i)=>{
      this.recoil[i]=Math.max(0,this.recoil[i]-dt*(i===0?15:7));
      const kick=this.recoil[i],sway=reducedMotion?0:Math.min(moving/14,1);
      gun.position.set((i===0?-.56:.56)+Math.sin(this.time*5+i)*sway*.012,-.5+Math.sin(this.time*10+i)*sway*.018-(boost?.06:0),-1.02+kick*(i===0?.08:.16));
      gun.rotation.x=kick*(i===0?.08:.19)+(boost?.09:0);gun.rotation.z=(i===0?-1:1)*kick*.025;gun.userData.flash.visible=kick>.45;
      if(gun.userData.flash.visible){gun.userData.flash.rotation.z=this.time*37;gun.userData.flash.scale.setScalar(.7+Math.random()*.5)}
      gun.userData.barrels.rotation.z+=dt*(this.buttons[i]&&!this.overheated[i]?(i===0?50:22):4);
    });
    this.cameraLight.intensity=.8+Math.max(...this.recoil)*2.4;
    this.playerMech.group.position.copy(eye).addScaledVector(this.up,-2.6);
    this.playerMech.group.quaternion.setFromRotationMatrix(new T.Matrix4().lookAt(v3(),this.forward,this.up));
    animateMech(this.playerMech,{dt,time:this.time,speed:moving,strafe:p.velocity.dot(this.right),forward:p.velocity.dot(this.forward),turn:this.turnRate||0,vertical:p.velocity.dot(this.up),dash:this.dashTime>0,aimPitch:this.pitch,airborne:!p.magnetic||!p.grounded,boost,recoil:Math.max(...this.recoil)});
  }

  aim(){
    this.basis();return {origin:this.player.position.clone(),direction:this.forward.clone().multiplyScalar(Math.cos(this.pitch)).addScaledVector(this.up,Math.sin(this.pitch)).normalize()};
  }
  liveParts(bot){
    return bot.parts.filter(part=>{for(let parent=part;parent&&parent!==bot.group;parent=parent.parent)if(!parent.visible)return false;return true});
  }

  blockedByCover(a,b){return !!this.raycastWorld(a,b)}

  raycastWorld(a,b){
    if(this.realm!=='station')return this.world.raycast(a,b);
    const hit=firstStationIntersection(a,b,this.world);let result=hit,closest=hit?a.distanceTo(v3(hit.x,hit.y,hit.z)):a.distanceTo(b)+.001;
    const direction=b.clone().sub(a).normalize(),ray=new T.Ray(a,direction);
    for(const cover of this.world.covers){
      const angle=polarAngle(cover.position),center=cover.position.clone().addScaledVector(v3(-Math.sin(angle),Math.cos(angle),0),.9),point=ray.intersectSphere(new T.Sphere(center,1.2),v3());
      if(point&&a.distanceTo(point)<closest&&a.distanceTo(point)>.03){closest=a.distanceTo(point);result={x:point.x,y:point.y,z:point.z,surface:'cover',normal:point.clone().sub(center).normalize()}}
    }
    return result;
  }
  firstImpact(a,b){const hit=this.raycastWorld(a,b);return hit?v3(hit.x,hit.y,hit.z):b.clone()}
  // Where the crosshair points: the first world surface or enemy along the ray through the centre of the screen. In the chase view that
  // ray starts at the camera, not at the pilot's eye, so a shot from the gun barrel lands where the crosshair says at any range
  // (aiming from the eye put close-range shots a metre off). Enemies are tested too, otherwise the shot would converge on the wall
  // behind them and pass beside them.
  aimPoint(range=100){
    const {origin,direction}=this.aim();let from=origin,dir=direction;
    if(this.thirdPerson&&this.running){
      const pivot=this.player.position.clone().addScaledVector(this.up,.4),offset=chaseOffset(this.forward,this.up,this.pitch);
      from=pivot.addScaledVector(offset.clone().normalize(),this.armLength??offset.length());dir=origin.clone().addScaledVector(direction,35).sub(from).normalize();
    }
    const world=this.firstImpact(from,from.clone().addScaledVector(dir,range));let best=from.distanceTo(world),point=world;
    this.ray.set(from,dir);this.ray.far=best;
    for(const bot of this.bots){
      if(bot.dead)continue;
      const lift=this.realm!=='station'?v3(0,1,0):v3(-Math.sin(bot.angle||0),Math.cos(bot.angle||0),0),center=bot.group.position.clone().addScaledVector(lift,1.7);
      if(this.ray.ray.distanceSqToPoint(center)>12.25)continue;
      const hit=this.ray.intersectObjects(this.liveParts(bot),false)[0];if(hit&&hit.distance<best){best=hit.distance;point=hit.point}
    }
    return point;
  }

  shoot(index){
    const fire=this.armPart(index)?.fire;
    if(!fire||this.cooldowns[index]>0||this.overheated[index]||this.deadTimer>0)return;
    const mods=this.mods||NEUTRAL_MODS;
    this.cooldowns[index]=fire.cd;this.heat[index]=Math.min(1,this.heat[index]+fire.heat*mods.heatGain);this.recoil[index]=1;
    this.shake=Math.max(this.shake,fire.shake);this.sense?.event('fire',{heavy:index===1});if(this.heat[index]>=1)this.overheated[index]=true;
    this.tutorial?.record(index===0?'left':'right');this.audio.play(fire.audio);
    const {origin,direction}=this.aim();
    const muzzle=origin.clone().addScaledVector(this.right,index===0?-.46:.46).addScaledVector(this.up,-.4).addScaledVector(direction,1.4);
    // chase view: the round leaves the visible gun's barrel, not the pilot's eye
    const tip=this.thirdPerson?this.playerMech.limbs[index===0?'leftGun':'rightGun']?.userData.flash:null;if(tip){this.playerMech.group.updateWorldMatrix(true,true);tip.getWorldPosition(muzzle)}
    const aimPoint=this.aimPoint(),shotId=this.tutorial?.active?0:this.run?.registerShot();
    if(this.online?.active){this.online.fire(index,direction);this.effects.gunfire?.(muzzle,{dir:direction,right:this.right,up:this.up,side:index===0?-1:1},this.armPart(index)?.model);return}
    this.recoilKick=Math.min(.1,(this.recoilKick||0)+.008+fire.shake*.045); // the muzzle climbs a little with every shot and settles back (setCamera)
    for(let i=0;i<fire.pellets;i++){
      const dir=aimPoint.clone().sub(muzzle).normalize();
      if(fire.spread)dir.add(v3((Math.random()-.5)*fire.spread,(Math.random()-.5)*fire.spread,(Math.random()-.5)*fire.spread)).normalize();
      this.bullets.push({position:muzzle.clone(),velocity:dir.multiplyScalar(fire.speed),life:fire.life,owner:'player',weapon:index,damage:fire.damage,splash:fire.splash||0,shot:shotId});
    }
    this.effects.gunfire?.(muzzle,{dir:aimPoint.clone().sub(muzzle).normalize(),right:this.right,up:this.up,side:index===0?-1:1},this.armPart(index)?.model);
    if(this.bullets.length>160)this.bullets.splice(0,this.bullets.length-160);
  }
  updateBullets(dt){
    this.scene.updateMatrixWorld(true);
    for(let i=this.bullets.length-1;i>=0;i--){
      const bullet=this.bullets[i],start=bullet.position.clone(),end=start.clone().addScaledVector(bullet.velocity,dt),travel=start.distanceTo(end);
      bullet.life-=dt;let endpoint=this.firstImpact(start,end),limit=start.distanceTo(endpoint),hitBot=null,part='core',hitPlayer=false;
      this.ray.set(start,bullet.velocity.clone().normalize());this.ray.far=Math.min(travel,limit)+.0001;
      if(bullet.owner==='player'){
        for(const bot of this.bots){
          if(bot.dead)continue;
          const up=this.realm!=='station'?v3(0,1,0):v3(-Math.sin(bot.angle||0),Math.cos(bot.angle||0),0),center=bot.group.position.clone().addScaledVector(up,1.7);
          if(this.ray.ray.distanceSqToPoint(center)>12.25)continue;
          const hit=this.ray.intersectObjects(this.liveParts(bot),false)[0];
          if(hit&&hit.distance<=limit){limit=hit.distance;endpoint=hit.point;hitBot=bot;part=hit.object.userData.part}
        }
      }else if(this.deadTimer<=0){
        const center=this.player.position.clone().addScaledVector(this.up,-.7),hit=this.ray.ray.intersectSphere(new T.Sphere(center,1.05),v3());
        if(hit&&start.distanceTo(hit)<=Math.min(travel,limit)){endpoint=hit;limit=start.distanceTo(hit);hitPlayer=true}
        else if(!bullet.passed&&this.spawnGrace<=0&&passDistance(start,endpoint,center)<2.7){bullet.passed=true;this.nearMiss(bullet)}
      }
      const impact=hitBot||hitPlayer||limit<travel-.001;
      bullet.position.copy(endpoint);
      if(impact){
        if(hitBot)this.damageBot(hitBot,bullet.damage,part,endpoint,bullet.shot,{source:start,direct:true});
        else if(hitPlayer){this.hurtPlayer(bullet.damage,bullet.origin||start);this.effects.burst(endpoint,bullet.color||'#ff9a70',8,6)}
        else this.worldImpact(this.raycastWorld(start,end),endpoint,bullet);
      }
      if(impact&&bullet.splash&&bullet.owner==='player')this.splashDamage(endpoint,bullet.splash,bullet.damage,bullet.shot,hitBot);
      if(impact&&bullet.blast){this.effects.explosion(endpoint,.7);const target=this.player.position.clone().addScaledVector(this.up,-.7),distance=target.distanceTo(endpoint);if(!hitPlayer&&distance<bullet.blast&&!this.blockedByCover(endpoint.clone().addScaledVector(bullet.velocity.clone().normalize(),-.1),target))this.hurtPlayer(bullet.damage*(1-distance/bullet.blast),endpoint)}
      if(impact||bullet.life<=0)this.bullets.splice(i,1);
    }
  }

  // A round hit the world (not a mech): break glass if it is glass, then show and sound what it hit.
  worldImpact(hit,point,bullet){
    if(hit?.surface==='window'&&this.world.damageWindow?.(hit,bullet.damage,this.effects)){if(!this.tutorial?.active&&bullet.owner==='player')this.mission?.recordOpening?.('breach');this.ui.event(hit.roof?'SKYLIGHT BREACHED · ENTER KESTREL':'GLASS BREACHED',1);this.audio.play('glass')}
    const enemy=bullet.owner==='enemy',color=enemy?(bullet.color||'#ffbe8b'):bullet.weapon===1?'#ffd694':'#b8f3ff';
    if(!this.effects.impact){this.effects.burst(point,color,5,5);return}
    const plan=this.effects.impact(point,hit?.normal,materialOf(hit),{dir:bullet.velocity,power:(bullet.damage||20)/20,color});
    this.audio.play(plan.sound,{volume:impactVolume(this.camera.position.distanceTo(point),plan.loudness),pan:Math.sin(this.bearingTo(point))});
  }

  damageBot(bot,damage,part,point,shotId=0,context={}){
    if(bot.dead)return;this.run?.registerHit(shotId);
    if(this.battle){this.ui.hit();this.audio.play('hit');this.battle.playerHit(bot,damage,part,point,context);return}
    this.ui.hit();this.audio.play('hit');bot.hit=1;
    const shieldBefore=bot.shield>0,toPlayer=this.player.position.clone().sub(point).normalize();
    const strike=applyBulwarkDamage(bot,damage*(1+(this.mission?.upgrades||0)*.12),part,context.source||this.player.position,context),dead=strike.dead;
    if(strike.armored&&this.time>(this.armorTipUntil||0)){this.armorTipUntil=this.time+4;this.ui.event('FRONT ARMOR · GRAPPLE BEHIND THE BULWARK',1.6)}
    if(strike.reactor){bot.reactorHit=this.time;if(!this.tutorial?.active)this.mission?.recordOpening?.('reactor')}
    // Hit feedback is decided once, after the damage lands, so a shield pop or a kill can look and feel different from a graze.
    const plan=hitReaction({damage:strike.damage,part,shield:shieldBefore&&!strike.bypass,shieldBroke:shieldBefore&&bot.shield<=0,killed:dead,big:bot.archetype==='archon'});
    if(this.effects.mechHit)this.effects.mechHit(point,toPlayer,plan);
    else{this.effects.burst(point,shieldBefore?'#7ceaff':'#ffba78',shieldBefore?6:12,7);if(shieldBefore)this.effects.shieldHit(point,toPlayer)}
    bot.stagger=Math.max(bot.stagger||0,plan.flinch);bot.staggerSide=hitSide(v3(1,0,0).applyQuaternion(bot.group.quaternion),bot.group.position,point);
    this.hitStop=Math.max(this.hitStop||0,plan.stop);
    if(plan.shake)this.shake=Math.max(this.shake||0,shakeFalloff(this.camera.position.distanceTo(bot.group.position),plan.shake));
    if(bot.shield===0&&(part==='arm'||part==='leg')){
      bot.partHealth[part]-=damage;
      if(bot.partHealth[part]<=0&&!(part==='arm'?bot.armLost:bot.legLost)){
        if(part==='arm'){bot.armLost=true;bot.limbs.leftArm.visible=false}else{bot.legLost=true;bot.limbs.rightLeg.visible=false}
        this.effects.explosion(point,.3);this.ui.event(part==='arm'?'ARM DISABLED':'LEG ACTUATOR DISABLED',.8);
      }
    }
    if(dead){
      const dashReward=strike.reactor&&this.rewardReactorKill();
      let award=null;bot.dead=true;bot.volley=null;bot.respawn=4+Math.random()*2;bot.group.visible=false;
      if(!this.tutorial?.active){this.score++;this.combo=this.comboTime>0?this.combo+1:1;this.comboTime=COMBO_WINDOW;award=this.run?.kill(bot.archetype,{combo:this.combo,headshot:part==='head',airborne:!this.player.grounded,reactor:strike.reactor})||null}
      if(!this.tutorial?.active&&this.mission){this.mission.defeatEnemy(bot.index);if(this.realm==='station'&&this.mission.stage==='relays'&&this.mission.cells+this.pickups.length<3){const up=v3(-Math.sin(bot.angle||0),Math.cos(bot.angle||0),0);this.pickups.push(makeCell(this.scene,bot.group.position,up))}}
      const up=this.realm!=='station'?v3(0,1,0):v3(-Math.sin(bot.angle||0),Math.cos(bot.angle||0),0);const burstAt=bot.group.position.clone().addScaledVector(up,1.8);this.effects.breakMech?.(bot);this.effects.explosion(burstAt,1.25);this.effects.killBurst?.(burstAt,up,1.25);this.audio.play('kill');this.sense?.event('kill',{distance:this.camera.position.distanceTo(burstAt),big:bot.archetype==='archon'});
      this.ui.event(`${this.tutorial?.active?'PRACTICE · ':this.combo>1?this.combo+' × COMBO · ':''}${bot.name} ELIMINATED${dashReward?' · AIR REACTOR KILL · DASH READY':strike.reactor?' · REACTOR DESTROYED':''}`,dashReward?2:1.3);this.ui.kill(bot.name,true);if(award)this.ui.popup?.(award,bot.group.position.clone().addScaledVector(up,3.4));
      this.player.shield=Math.min(100,this.player.shield+18);
    }
  }

  rewardReactorKill(){
    if(this.tutorial?.active||this.player.grounded!==false||this.deadTimer>0)return false;
    this.dashCooldown=0;this.audio.play('ui');return true;
  }

  // Shoulder mounts: G fires both. Slot 0 is the right shoulder (it also owns the legacy missileCooldown).
  fireMissile(){return this.fireShoulder(0)}
  fireShoulders(){const right=this.fireShoulder(0),left=this.fireShoulder(1);return right||left}
  shoulderCooldownOf(slot){return slot===0?this.missileCooldown||0:this.leftShoulderCooldown||0}
  setShoulderCooldown(slot,value){if(slot===0)this.missileCooldown=value;else this.leftShoulderCooldown=value}
  fireShoulder(slot){
    const fire=this.shoulderPart(slot)?.fire;
    if(!fire||this.deadTimer>0||this.shoulderCooldownOf(slot)>0)return false;
    this.setShoulderCooldown(slot,fire.kind==='missile'&&this.mission?.upgrades>=2?5:fire.cd);
    if(this.online?.active){const {direction}=this.aim();this.online.fire(2+slot,direction);this.audio.play(fire.kind==='gun'?'gatling':fire.kind==='chaff'?'ui':'missile');this.recoil=[.7,.7];return true}
    this.recoil=[.7,.7];this.shake=Math.max(this.shake||0,fire.kind==='gun'?.15:.7);this.tutorial?.record('missile');
    if(fire.kind==='chaff'){this.deployChaff(fire);return true}
    const {origin,direction}=this.aim(),side=slot===0?1:-1,shotId=this.tutorial?.active?0:this.run?.registerShot();
    const muzzle=origin.clone().addScaledVector(this.right,side*.5).addScaledVector(this.up,.15).addScaledVector(direction,1.4);
    if(fire.kind==='gun'){
      this.audio.play('gatling');const aimPoint=this.aimPoint(),dir=aimPoint.clone().sub(muzzle).normalize();
      dir.add(v3((Math.random()-.5)*fire.spread,(Math.random()-.5)*fire.spread,(Math.random()-.5)*fire.spread)).normalize();
      this.bullets.push({position:muzzle.clone(),velocity:dir.multiplyScalar(fire.speed),life:fire.life,owner:'player',weapon:2+slot,damage:fire.damage,shot:shotId});
      this.effects.gunfire?.(muzzle,{dir:direction,right:this.right,up:this.up,side:slot===0?1:-1},this.shoulderPart(slot)?.model);return true;
    }
    this.audio.play('missile');
    for(let i=0;i<(fire.count||1);i++){
      const dir=direction.clone();if(fire.spread)dir.add(v3((Math.random()-.5)*fire.spread*2,(Math.random()-.5)*fire.spread*2,(Math.random()-.5)*fire.spread*2)).normalize();
      const big=fire.kind==='missile'||fire.kind==='shell',mesh=new T.Mesh(new T.CylinderGeometry(big?.09:.045,big?.14:.07,big?.8:.5,8),new T.MeshBasicMaterial({color:fire.kind==='shell'?'#ffe2a0':'#ffc28a'}));
      mesh.quaternion.setFromUnitVectors(v3(0,1,0),dir);mesh.position.copy(muzzle);this.scene.add(mesh);
      this.projectiles.push({mesh,direction:dir,life:fire.life||3.5,previous:mesh.position.clone(),shot:shotId,speed:fire.speed,damage:fire.damage,splash:fire.splash,blastScale:fire.kind==='salvo'?.9:fire.kind==='shell'?2.4:1.8});
    }
    return true;
  }
  // Flares scramble every enemy round nearby and blunt damage for a few seconds.
  deployChaff(fire){
    this.chaffTime=fire.duration;this.chaffReduction=fire.reduction;this.audio.play('ui');
    this.bullets=this.bullets.filter(b=>b.owner!=='enemy'||b.position.distanceTo(this.player.position)>fire.radius);
    for(let i=0;i<10;i++)this.effects.burst?.(this.player.position.clone().add(v3((Math.random()-.5)*5,(Math.random()-.2)*3,(Math.random()-.5)*5)),'#ffd27a',6,9);
    this.ui.event('CHAFF DEPLOYED · INCOMING FIRE SCRAMBLED',1.4);
  }
  splashDamage(center,radius,damage,shotId,skip){
    this.effects.explosion(center,Math.min(2.6,radius/3));
    for(const bot of this.bots){
      if(bot.dead||bot===skip)continue;
      const up=this.realm!=='station'?v3(0,1,0):v3(-Math.sin(bot.angle||0),Math.cos(bot.angle||0),0),bp=bot.group.position.clone().addScaledVector(up,1.7),d=center.distanceTo(bp);
      if(d<radius&&!this.blockedByCover(center,bp))this.damageBot(bot,damage*(1-d/(radius+1.5))*.8,'core',bp,shotId,{source:center,direct:false});
    }
  }
  shoulderStatus(){
    const mounted=[0,1].map(slot=>({fire:this.shoulderPart(slot)?.fire,cd:this.shoulderCooldownOf(slot)})).filter(m=>m.fire);
    return mounted.length?mounted.map(m=>m.cd>0?`${Math.ceil(m.cd)} S`:m.fire.kind==='chaff'&&this.chaffTime>0?'ACTIVE':'READY').join(' · '):'NONE';
  }
  updateProjectiles(dt){
    for(let i=this.projectiles.length-1;i>=0;i--){
      const p=this.projectiles[i];p.life-=dt;p.previous.copy(p.mesh.position);
      const end=p.previous.clone().addScaledVector(p.direction,(p.speed||72)*dt),impact=this.firstImpact(p.previous,end),travel=p.previous.distanceTo(end);p.mesh.position.copy(impact);
      let explode=impact.distanceTo(end)>.001||p.life<=0;
      const ray=new T.Ray(p.previous,p.direction);
      for(const bot of this.bots){if(bot.dead)continue;const center=bot.group.position.clone().addScaledVector((this.realm!=='station'?v3(0,1,0):v3(-Math.sin(bot.angle),Math.cos(bot.angle),0)),1.7),hit=ray.intersectSphere(new T.Sphere(center,1.8),v3());if(hit&&hit.distanceTo(p.previous)<=travel&&hit.distanceTo(p.previous)<p.mesh.position.distanceTo(p.previous)){p.mesh.position.copy(hit);explode=true}}
      this.effects.trace(p.previous,p.mesh.position,'#ffc38e',.055,.08);
      if(explode){
        const center=p.mesh.position.clone();this.effects.explosion(center,p.blastScale||1.8);const glass=this.raycastWorld(p.previous,end);if(glass?.surface==='window'&&this.world.damageWindow?.(glass,100,this.effects)&&!this.tutorial?.active)this.mission?.recordOpening?.('breach');
        for(const bot of this.bots){const bp=bot.group.position.clone().addScaledVector((this.realm!=='station'?v3(0,1,0):v3(-Math.sin(bot.angle),Math.cos(bot.angle),0)),1.7),d=center.distanceTo(bp);if(!bot.dead&&d<(p.splash||9)&&!this.blockedByCover(center,bp))this.damageBot(bot,(p.damage||150)*(1-d/((p.splash||9)+2)),'core',bp,p.shot,{source:center,direct:false})}
        this.scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();this.projectiles.splice(i,1);
      }
    }
  }
  updateBots(dt){
    if(this.battle){this.battle.update(dt);return}
    if(this.realm!=='station'){this.updateGardenBots(dt);return}
    const peaceful=this.tutorial?.active||this.spawnGrace>0||this.deadTimer>0;
    for(const bot of this.bots){
      if(bot.dead){if(this.mission&&!this.tutorial.active)continue;bot.respawn-=dt;if(bot.respawn<=0)this.spawnBot(bot);continue}
      if((Math.abs(this.player.position.z)>W+1||Math.hypot(this.player.position.x,this.player.position.y)<R-H-1||Math.hypot(this.player.position.x,this.player.position.y)>R+1||bot.flying)&&this.updateFlightBot(bot,dt,peaceful))continue;
      const steering=steerEnemy(bot,this.theta,this.bots,this.time,!!this.tutorial?.active);
      bot.backwards=steering.along*Math.sign(wrapAngle(this.theta-bot.angle))<0;
      bot.dodgeCooldown-=dt;bot.dodge=Math.max(0,bot.dodge-dt);
      if(bot.dodgeCooldown<=0&&!peaceful&&steering.distance<55){bot.dodge=.55;bot.dodgeCooldown=4+Math.random()*4;bot.dodgeDirection=Math.random()>.5?1:-1}
      const slow=bot.legLost?.5:1;
      bot.angle=wrapAngle(bot.angle+steering.along/R*dt*slow);
      const oldSide=bot.side;bot.side=clamp(bot.side+(steering.lateral+(bot.dodge>0?bot.dodgeDirection*5:0))*dt,-2.3,2.3);
      bot.speed=Math.hypot(steering.along*slow,(bot.side-oldSide)/dt);bot.strafe=(bot.side-oldSide)/dt;
      bot.hover=bot.dodge>0?Math.sin((1-bot.dodge/.55)*Math.PI)*1.15:0;
      bot.recoil=Math.max(0,bot.recoil-dt*9);bot.hit=Math.max(0,bot.hit-dt*6);bot.stagger=Math.max(0,(bot.stagger||0)-dt*3.2);
      this.positionBot(bot,this.time,dt);this.enemyFire(bot,dt,peaceful,steering.distance);
    }
  }

  killPlayer(){
    if(this.deadTimer>0)return;
    if(this.battle){this.deadTimer=4;this.combo=0;this.comboTime=0;if(this.run)this.run.deaths++;this.buttons=[false,false];this.ui.event('CORE DESTROYED\nREDEPLOYING…',2.5);this.effects.explosion(this.player.position,1);this.battle.onPlayerKilled();return}
    this.deadTimer=2.5;this.combo=0;this.comboTime=0;this.enemyScore++;if(this.run)this.run.deaths++;this.buttons=[false,false];const gauntlet=this.mission?.stage==='gauntlet'&&!this.tutorial.active;if(gauntlet)this.mission.lives=Math.max(0,this.mission.lives-1);const lives=this.mission?.lives;this.ui.event(gauntlet?(lives>0?`CORE DESTROYED\n${lives} ${lives===1?'LIFE':'LIVES'} LEFT`:'CORE DESTROYED\nGAUNTLET OVER'):'CORE DESTROYED\nRETURNING TO CHAPTER CHECKPOINT',2.5);this.ui.kill('YOU',false);this.effects.explosion(this.player.position,1);
  }
  updateTarget(){
    if(this.time-(this.lastTargetTime||0)<.12)return;this.lastTargetTime=this.time;
    const {origin,direction}=this.aim();this.ray.set(origin,direction);this.ray.far=100;
    const hits=this.ray.intersectObjects(this.bots.filter(b=>!b.dead).flatMap(b=>this.liveParts(b)),false);
    const hit=hits.find(h=>!this.blockedByCover(origin,h.point));
    const reactor=hit?.object.userData.part==='reactor'&&bulwarkFacing(hit.object.userData.bot,origin)<-.35;
    $('target-label').textContent=hit?(reactor?`REAR REACTOR · 2.5×\n${Math.ceil(hit.object.userData.bot.health)} CORE · AIR KILL RECHARGES DASH`:`${hit.object.userData.bot.name}\n${Math.ceil(hit.object.userData.bot.shield)} SHIELD / ${Math.ceil(hit.object.userData.bot.health)} CORE`):'';
  }
  resetMatch(){
    this.dropTeamMatch();this.cityWorld?.setArena?.(false);
    if(this.mission){this.mission.reset();this.setRealm('station');this.stationWorld.restoreWindows();for(const cell of this.pickups)cell.dispose();this.pickups=[]}
    this.ended=false;this.score=0;this.enemyScore=0;this.remaining=SOLO_SECONDS;this.run=new ChapterRun();this.runResults=[];this.resultsOpen=false;this.heat=[0,0];this.overheated=[false,false];this.cooldowns=[0,0];this.missileCooldown=0;this.leftShoulderCooldown=0;this.chaffTime=0;this.bullets=[];this.spawnPlayer(true);this.bots.forEach(bot=>this.spawnBot(bot,true));
    for(const p of this.projectiles){this.scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose()}this.projectiles=[];
    this.radio=null;this.radioStage=null;this.ui.radioId=null;this.ui.feed=[];this.ui.renderFeed();this.combo=0;this.comboTime=0;this.accumulator=0;this.trainingReplay=false;this.encounterRevision=-1;this.tutorial.active=false;this.tutorial.justCompleted=false;this.clearDangerZones();this.chapterTime=6;
    document.querySelector('.intro').textContent='Escape Kestrel. Reconnect Meridian. Bring the forest home.';
  }
  timeoutChapter(){
    if(this.resultsOpen||this.ended)return;
    const index=this.currentChapter(),result={...finishRun(this.run,index,0),timedOut:true};
    this.ended=true;this.buttons=[false,false];this.keys.clear();
    this.resultsOpen=!!this.ui.showResults?.(result,{onRetry:()=>this.retryChapter(index),onContinue:()=>{this.ui.hideResults?.();this.resultsOpen=false;this.pause()}});
    if(this.resultsOpen){document.exitPointerLock?.();$('results-continue-label').textContent='BACK TO MENU'}else this.running=false;
  }
  endMatch(){
    this.ended=true;this.pause();const victory=this.score>this.enemyScore;document.querySelector('.intro').textContent=`${victory?'Station secured.':'Skirmish complete.'} Cobalt ${this.score} / Ember ${this.enemyScore}. Deploy again for a new match.`;
  }
  advance(elapsed){
    this.accumulator+=Math.min(elapsed,.15);
    let steps=0;
    while(this.accumulator>=1/60-1e-9&&steps<9){this.simulate(1/60);this.accumulator-=1/60;steps++;if(!this.running){this.accumulator=0;break}}
    this.alpha=blendAlpha(this.accumulator); // where this frame sits between the last two sim states (see frame-pacing.js)
    return steps;
  }
  simulate(dt){
    if(this.online?.active){this.online.simulate(dt);return}
    (this.prevPos||(this.prevPos=v3())).copy(this.player.position);
    this.time+=dt;this.spawnGrace=Math.max(0,this.spawnGrace-dt);this.comboTime=Math.max(0,this.comboTime-dt);
    if(!this.tutorial.active){this.remaining-=dt;if(this.mission)this.mission.elapsed+=dt;if(this.run)this.run.time+=dt}
    if(!this.battle&&!this.tutorial.active&&this.mission&&this.mission.stage!=='complete'&&this.run?.time>=SOLO_SECONDS){this.run.time=SOLO_SECONDS;if(this.mission.stage==='gauntlet')this.endGauntlet();else this.timeoutChapter();return}
    if(this.deadTimer>0){this.deadTimer-=dt;if(this.mission?.stage==='gauntlet'&&this.mission.lives===0&&this.deadTimer<=1){this.endGauntlet();return}if(this.deadTimer<=0){this.spawnPlayer();this.ui.event('SYSTEMS RESTORED · 5 SECOND SPAWN SHIELD',2)}}else this.updatePlayer(dt);
    this.tutorial.update(dt,this);
    if(this.tutorial.justCompleted)this.beginCombat();
    for(let i=0;i<2;i++){
      this.cooldowns[i]=Math.max(0,this.cooldowns[i]-dt);this.heat[i]=Math.max(0,this.heat[i]-dt*(this.buttons[i]?.17:.36)*(this.mods?.cooling||1));
      if(this.overheated[i]&&this.heat[i]<.25)this.overheated[i]=false;if(this.buttons[i])this.shoot(i);
    }
    this.missileCooldown=Math.max(0,this.missileCooldown-dt);this.leftShoulderCooldown=Math.max(0,(this.leftShoulderCooldown||0)-dt);this.chaffTime=Math.max(0,(this.chaffTime||0)-dt);if(this.keys.has('KeyG'))for(const slot of [0,1])if(this.shoulderPart(slot)?.fire?.kind==='gun')this.fireShoulder(slot);this.updateBots(dt);this.updateBullets(dt);this.updateProjectiles(dt);
    this.sense?.step(dt,{velocity:this.player.velocity,forward:this.forward,right:this.right,up:this.up,grounded:!!this.player.grounded,boosting:this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')});
    this.updateMission(dt);this.updateDangerZones(dt);
    if(!this.mission&&(this.remaining<=0||this.score>=25||this.enemyScore>=25))this.endMatch();
  }
  beginCombat(){
    this.tutorial.justCompleted=false;this.spawnGrace=3;this.invulnerable=5;this.combo=0;this.comboTime=0;
    const replay=this.trainingReplay;this.trainingReplay=false;if(!replay){this.remaining=SOLO_SECONDS;this.score=0;this.enemyScore=0}
    this.player.health=100;this.player.shield=100;this.bullets=[];
    for(const missile of this.projectiles){this.scene.remove(missile.mesh);missile.mesh.geometry.dispose();missile.mesh.material.dispose()}this.projectiles=[];
    if(this.mission){this.syncEncounter(true)}else{this.bots.forEach(bot=>{bot.dead=true});this.bots.forEach(bot=>this.spawnBot(bot))}
    this.ui.event(`${replay?'MISSION RESUMES':'MISSION BEGINS'} IN 3\n${this.mission?this.mission.objective.toUpperCase():'ELIMINATE 25 HOSTILE MECHS'}`,3);this.audio.play('ui');
  }
  // The 4D layer, once per rendered frame: integrate the body springs, then drive the post pass, the wind streaks and the wind sound.
  updateSensation(dt){
    const out=this.sense.update(dt,{yaw:this.yaw,tethering:this.grapple?.mode==='pulling'||this.grapple?.mode==='flying'});
    applySensation(this.sensePass,out);
    this.air.attach(this.scene);this.air.update(dt,this.camera.position,this.player.velocity,out.streaks);
    this.audio.wind(out.wind);
  }
  // Menus, pause and the launch deck: nothing moves, so nothing is felt.
  quietSensation(){
    if(this.sensePass)this.sensePass.enabled=false;this.air?.hide();this.audio.wind(0);
  }
  frame(){
    const dt=Math.min(this.clock.getDelta(),.15);
    if(this.online?.render(dt))return;
    // Hit-stop: a kill freezes the simulation for a few frames so it lands. Effects and the camera keep real time, so sparks
    // fly and the screen shakes through the freeze; that contrast is what sells the impact. Skipped for reduced motion.
    const frozen=this.hitStop>0&&!reducedMotion;this.hitStop=Math.max(0,this.hitStop-dt);
    if(this.running){
      if(!this.modalOpen)this.advance(frozen&&!this.online?.active?dt*.06:dt);this.setCamera(dt);this.effects.update(dt);this.effects.renderBolts(this.battle?this.bullets.concat(this.battle.bullets):this.bullets,this.camera.position);this.updateTarget();this.ui.update(this,dt);this.online?.hud();this.updateSensation(dt);
    }else{this.menuTime+=dt;this.setCamera(dt);this.ui.clearCombat?.();this.quietSensation()}
    this.world.update(this.running?this.time:this.menuTime,this.mission?.gateOpen,this.mission?.stage==='complete',this.mission?.wave||0,this.online?.active||this.battle||this.mission?.stage==='gauntlet'?3:this.mission?.upgrades||0);
    if(this.grapple&&this.started){this.camera.updateMatrixWorld(true);this.tether.update(this.tetherOrigin(),this.grapple,this.up)}
    if(this.running&&(this.realm==='station'||this.realm==='city')&&this.mission?.gateOpen){this.portalPreviewClock+=dt;if(this.portalPreviewClock>.6&&this.player.position.distanceTo(this.world.portal.position)<60){this.world.portal.preview(this.renderer,this.realm==='station'?this.cityWorld.scene:this.edenWorld.scene,this.realm==='station'?this.cityWorld.previewCamera:this.edenWorld.previewCamera);this.portalPreviewClock=0}}
    // Refresh shadows every frame while the machine keeps up, backing off only when frames slip (frame-pacing.js).
    if(this.shadowGov.tick(dt)&&this.renderer.shadowMap.enabled)this.renderer.shadowMap.needsUpdate=true;
    if(this.running&&this.quality==='balanced'&&this.resolutionGov.tick(dt))this.sizeRenderTargets();
    this.composer.render();
  }

  resize(){
    this.sizeRenderTargets();
    this.shadowGov.setIntervals(this.quality==='high'?[0,1/45]:[0,1/30,1/20]);
    this.renderer.shadowMap.enabled=this.quality!=='low';
    for(const world of [this.stationWorld,this.cityWorld,this.edenWorld]){
      const shadow=world.sun?.shadow;if(!shadow)continue;const size=this.quality==='high'?2048:1024;
      if(shadow.mapSize.x!==size){shadow.map?.dispose();shadow.map=null;shadow.mapSize.setScalar(size)}
    }
    this.renderer.shadowMap.needsUpdate=true;
    this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();
  }
  sizeRenderTargets(){
    const ratios={high:Math.min(devicePixelRatio,1.7),balanced:Math.min(devicePixelRatio,1.15)*(this.resolutionGov?.scale||1),low:Math.min(devicePixelRatio,.8)};
    this.renderer.setPixelRatio(ratios[this.quality]);this.renderer.setSize(innerWidth,innerHeight);
    this.composer.setPixelRatio(ratios[this.quality]);this.composer.setSize(innerWidth,innerHeight);this.bloom.enabled=this.quality!=='low';

  }
}

export function showFatal(message,error){
  const box=$('fatal');box.classList.remove('hidden');box.replaceChildren();const title=document.createElement('strong');title.textContent='Unable to establish the simulation.';const p=document.createElement('p');p.textContent=message;const small=document.createElement('small');small.textContent=error?.message||'Use a desktop browser with hardware acceleration and WebGL 2 enabled.';const button=document.createElement('button');button.textContent='RECONNECT';button.addEventListener('click',()=>location.reload());box.append(title,p,small,button);
}
