import { Vector3 } from 'three';
import { hasStationLineOfSight, RADIUS } from './physics.js';
import { ENEMY_TYPES } from './encounters.js';
import { FLIGHT_LESSONS } from './onboarding.js';
import { selectMarkerLabels } from './hud-layout.js';
import { CHAPTERS } from './chapters.js';
import { resolveBuild } from './parts.js';
import { COMBO_WINDOW, comboMultiplier, formatTime } from './scoring.js';
import { locationLabel } from './station-zones.js';
import { CombatHud } from './combat-hud.js';
import { bulwarkFacing } from './bulwark.js';
import { dangerLevel } from './combat-feel.js';
export const $ = id => document.getElementById(id);
export class UI {
  constructor(){
    this.eventTimer=0;this.hitTimer=0;this.damageTimer=0;this.damageStrength=1;this.combat=new CombatHud();this.combatLive=false;this.feed=[];this.radar=$('radar').getContext('2d');this.last=0;this.lessonIndex=-1;this.lastTip='';this.tipUntil=0;
    this.popups=[];this.resultHandlers=null;this.countFrame=0;
    $('results-continue')?.addEventListener('click',()=>this.resultHandlers?.onContinue?.());$('results-retry')?.addEventListener('click',()=>this.resultHandlers?.onRetry?.());
    this.markers=Array.from({length:12},()=>{
      const element=document.createElement('div');element.className='enemy-marker hidden';
      const label=document.createElement('span'),state=document.createElement('small'),bar=document.createElement('i'),fill=document.createElement('b');bar.append(fill);element.append(label,state,bar);$('enemy-markers').append(element);return{element,label,state,fill};
    });
  }
  // Weapon names on the HUD follow the fitted build.
  setBuild(build){
    const parts=resolveBuild(build),name=part=>part.fire?part.name:'EMPTY',short=part=>part.name.replace(/^[A-Z0-9]+-[A-Z0-9]+ /,'');
    $('weapon-left').textContent=name(parts.lArm);$('weapon-right').textContent=name(parts.rArm);
    const shoulders=[parts.rShoulder,parts.lShoulder].filter(p=>p.fire).map(short);$('shoulder-names').textContent=shoulders.length?shoulders.join(' + '):'SHOULDER';
  }
  event(text,duration=2){$('event').textContent=text;this.eventTimer=duration}
  hit(){this.hitTimer=.12;$('hitmarker').style.opacity='1'}
  // `feel` comes from damageFeel(): how hard the hit was and whether only the shield took it; `bearing` points at the shooter.
  damage(feel,bearing){const f=feel||{amount:1,shieldOnly:false};this.damageTimer=.22+.4*f.amount;this.damageStrength=.55+.45*f.amount;const el=$('damage');el.classList.toggle('shield',!!f.shieldOnly);el.style.opacity=String(this.damageStrength);this.combatLive=true;this.combat.hurt(f,bearing)}
  nearMiss(bearing){this.combatLive=true;this.combat.nearMiss(bearing)}
  warn(bearing){this.combatLive=true;this.combat.warn(bearing)}
  clearCombat(){if(!this.combatLive)return;this.combatLive=false;this.combat.reset();this.damageTimer=0}
  kill(name,friendly=true){this.feed.unshift({name,friendly,time:5});this.feed=this.feed.slice(0,4);this.renderFeed()}
  killFeed(killer,victim,team){this.feed.unshift({name:victim,killer,team,friendly:killer==='YOU',time:5});this.feed=this.feed.slice(0,5);this.renderFeed()}
  renderFeed(){const feed=$('feed');feed.replaceChildren();for(const f of this.feed){const line=document.createElement('div');const who=document.createElement('span');who.textContent=f.killer||(f.friendly?'YOU':'EMBER');if(f.friendly)who.className='friendly';if(f.team)who.dataset.team=f.team;line.append(who,document.createTextNode(`  ▸  ${f.name}`));feed.append(line)}}
  // Floating "+points" readouts that rise from a defeated enemy.
  popup(award,position){
    const layer=$('popups');if(!layer)return;
    const element=document.createElement('div');element.className='score-pop';
    const points=document.createElement('b');points.textContent=`+${award.points}`;element.append(points);
    const extra=[award.mult>1?`×${award.mult.toFixed(1)}`:'',...award.tags].filter(Boolean).join(' · ');
    if(extra){const small=document.createElement('small');small.textContent=extra;element.append(small)}
    layer.append(element);this.popups.push({element,position:position.clone(),age:0});
    while(this.popups.length>8)this.popups.shift().element.remove();
  }
  updatePopups(game,dt){
    for(let i=this.popups.length-1;i>=0;i--){
      const pop=this.popups[i];pop.age+=dt;
      if(pop.age>1.4){pop.element.remove();this.popups.splice(i,1);continue}
      const p=pop.position.clone().project(game.camera);
      if(p.z>1){pop.element.style.opacity='0';continue}
      const x=(p.x*.5+.5)*innerWidth,y=(-p.y*.5+.5)*innerHeight-pop.age*46;
      pop.element.style.opacity=String(Math.min(1,(1.4-pop.age)*1.6));pop.element.style.transform=`translate3d(${x}px,${y}px,0) translate(-50%,-50%) scale(${1+Math.max(0,.25-pop.age)*1.2})`;
    }
  }
  showResults(result,{campaign=null,onContinue,onRetry}={}){
    const root=$('results');if(!root)return false;
    root.classList.remove('is-team');
    if(result.mode==='team')return this.showTeamResults(result,{onContinue,onRetry});
    const chapter=CHAPTERS[result.chapter],rank=$('results-rank'),gauntlet=result.mode==='gauntlet';
    $('results-kicker').textContent=result.timedOut?'TIME LIMIT REACHED':gauntlet?'GAUNTLET OVER':`CHAPTER ${chapter.number} COMPLETE`;$('results-title').textContent=gauntlet?`${result.waves} ${result.waves===1?'WAVE':'WAVES'} CLEARED`:chapter.name;
    rank.dataset.rank=result.rank;rank.querySelector('b').textContent=result.rank;
    const rows=gauntlet?[
      ['Eliminations',`${result.stats.kills} destroyed`,result.breakdown.eliminations],
      ['Waves cleared',`${result.waves} × 250 · survived ${formatTime(result.time)}`,result.breakdown.waveBonus],
      ['Accuracy',result.stats.accuracy?`${result.stats.accuracy}% of shots hit`:'Not enough shots',result.breakdown.accuracyBonus],
    ]:[
      ['Eliminations',`${result.stats.kills} destroyed`,result.breakdown.eliminations],
      ['Clear time',`${formatTime(result.time)} · par ${formatTime(result.par)}`,result.breakdown.timeBonus],
      ['Accuracy',result.stats.accuracy?`${result.stats.accuracy}% of shots hit`:'Not enough shots',result.breakdown.accuracyBonus],
      ['Survival',`${result.stats.damageTaken} damage taken · ${result.stats.deaths} downed`,result.breakdown.survival],
    ];
    $('results-table').replaceChildren(...rows.map(([label,detail,points],i)=>{
      const row=document.createElement('div');row.className='results-row';row.style.setProperty('--i',i);
      const name=document.createElement('span');name.className='results-label';name.textContent=label;
      const note=document.createElement('small');note.textContent=detail;name.append(note);
      const value=document.createElement('b');value.textContent=`${points>0?'+':''}${points.toLocaleString()}`;
      row.append(name,value);return row;
    }));
    const stats=[[`×${result.stats.peakCombo>1?comboMultiplier(result.stats.peakCombo).toFixed(1):'1.0'}`,'PEAK COMBO'],[String(result.stats.headshots),'HEADSHOTS'],[String(result.stats.kills),'KILLS']];
    $('results-stats').replaceChildren(...stats.map(([value,label])=>{const cell=document.createElement('div');const v=document.createElement('strong');v.textContent=value;const l=document.createElement('span');l.textContent=label;cell.append(v,l);return cell}));
    const record=result.record,best=$('results-best');
    best.textContent=record?.improved?(record.previous?`NEW PERSONAL BEST · was ${record.previous.score.toLocaleString()}`:gauntlet?'FIRST RUN · RECORD SET':'FIRST CLEAR · RECORD SET'):record?.best?(gauntlet?`PERSONAL BEST ${record.best.score.toLocaleString()} · WAVE ${record.best.wave}`:`PERSONAL BEST ${record.best.score.toLocaleString()} · RANK ${record.best.rank}`):'';
    best.classList.toggle('is-new',!!record?.improved);
    const total=$('results-campaign'),earned=result.credits>0?`+${result.credits} CREDITS${Number.isFinite(result.balance)?` · BALANCE ${result.balance.toLocaleString()}`:''}`:'';total.classList.toggle('hidden',!campaign&&!earned);
    total.textContent=[campaign?`CAMPAIGN TOTAL ${campaign.score.toLocaleString()} · ${campaign.ranks.join(' / ')}`:'',earned].filter(Boolean).join(' · ');
    $('results-retry').textContent=gauntlet?'GO AGAIN':'RETRY CHAPTER';$('results-continue-label').textContent=gauntlet?'BACK TO MENU':result.chapter===2?'EXPLORE EDEN':'CONTINUE';
    this.resultHandlers={onContinue,onRetry};
    // Count the score up unless the player prefers reduced motion.
    const scoreEl=$('results-score'),target=result.score,started=performance.now(),reduce=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    cancelAnimationFrame(this.countFrame);
    const tick=now=>{const t=reduce?1:Math.min(1,(now-started)/1100);scoreEl.textContent=Math.round(target*(1-Math.pow(1-t,3))).toLocaleString();if(t<1)this.countFrame=requestAnimationFrame(tick)};
    tick(started);
    root.classList.remove('hidden');setTimeout(()=>$('results-continue').focus(),50);
    return true;
  }
  // Results for a team operation: standings instead of the campaign score breakdown.
  showTeamResults(result,{onContinue,onRetry}){
    const root=$('results'),rank=$('results-rank'),me=result.table.find(p=>p.name==='YOU');root.classList.add('is-team');
    $('results-kicker').textContent=result.draw?'DRAW':result.won?'VICTORY':'DEFEAT';$('results-title').textContent=result.op.name;
    rank.dataset.rank=result.rank;rank.querySelector('b').textContent=result.rank;
    $('results-table').replaceChildren(...result.table.slice(0,8).map((pilot,i)=>{
      const row=document.createElement('div');row.className='results-row team-row';row.style.setProperty('--i',i);row.dataset.team=pilot.team;if(pilot.name==='YOU')row.classList.add('is-you');
      const name=document.createElement('span');name.className='results-label';name.textContent=pilot.name;const note=document.createElement('small');note.textContent=`${pilot.team==='blue'?'COBALT':'OXBLOOD'} · ${pilot.kills} K / ${pilot.deaths} D`;name.append(note);
      const value=document.createElement('b');value.textContent=String(pilot.kills);row.append(name,value);return row;
    }));
    const stats=[[`${result.teams.blue} : ${result.teams.red}`,'COBALT : OXBLOOD'],[String(result.stats.kills),'YOUR KILLS'],[String(result.stats.headshots),'HEADSHOTS'],[`+${result.credits}`,'CREDITS']];
    $('results-stats').replaceChildren(...stats.map(([value,label])=>{const cell=document.createElement('div');const v=document.createElement('strong');v.textContent=value;const l=document.createElement('span');l.textContent=label;cell.append(v,l);return cell}));
    const record=result.record,best=$('results-best');
    best.textContent=record?.improved?'NEW PERSONAL BEST FOR THIS OPERATION':record?.best?`PERSONAL BEST ${record.best.bestScore.toLocaleString()}`:'';best.classList.toggle('is-new',!!record?.improved);
    const total=$('results-campaign');total.classList.remove('hidden');total.textContent=`${me&&me.kills>=Math.max(...result.table.map(p=>p.kills))?'MATCH MVP · ':''}${Number.isFinite(result.balance)?`BALANCE ${result.balance.toLocaleString()} CREDITS · SPEND THEM IN THE SHOP`:'CREDITS ADDED TO YOUR ACCOUNT'}`;
    $('results-retry').textContent='PLAY AGAIN';$('results-continue-label').textContent='BACK TO MENU';
    this.resultHandlers={onContinue,onRetry};
    const scoreEl=$('results-score'),target=result.score,started=performance.now(),reduce=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    cancelAnimationFrame(this.countFrame);
    const tick=now=>{const t=reduce?1:Math.min(1,(now-started)/1100);scoreEl.textContent=Math.round(target*(1-Math.pow(1-t,3))).toLocaleString();if(t<1)this.countFrame=requestAnimationFrame(tick)};
    tick(started);root.classList.remove('hidden');setTimeout(()=>$('results-continue').focus({preventScroll:true}),50);return true;
  }
  // Scoreboard strip in the top bar for team operations.
  teamHud(game){
    const b=game.battle,mine=b.board.teamScore(b.team),theirs=b.board.teamScore(b.foeTeam),spans=document.querySelectorAll('.match .team span');
    if(!this.teamCaptions){this.teamCaptions=true;document.querySelector('.match .team.blue')?.classList.add('team-mode');document.querySelector('.match .team.red')?.classList.add('team-mode')}
    document.querySelector('.match').dataset.side=b.team;
    if(spans[0])spans[0].textContent=b.teamName(b.team);if(spans[1])spans[1].textContent=b.teamName(b.foeTeam);
    $('score-blue').textContent=String(mine).padStart(2,'0');$('score-red').textContent=String(theirs).padStart(2,'0');$('combo-bar').style.transform='scaleX(0)';
    $('timer').textContent=formatTime(Math.max(0,b.remaining));$('match-goal').textContent=`FIRST TO ${b.op.limit}`;
  }
  clearTeamHud(){
    this.teamCaptions=false;const spans=document.querySelectorAll('.match .team span');if(spans[0])spans[0].textContent='SCORE';if(spans[1])spans[1].textContent='COMBO';
    document.querySelectorAll('.match .team').forEach(el=>el.classList.remove('team-mode'));delete document.querySelector('.match')?.dataset.side;
  }
  // Everyone shown on the radar and as floating labels: the opposing squad plus, in a team operation, the pilot's allies.
  trackedBots(game){return game.battle?[...game.bots,...game.battle.allies]:game.bots}
  hideResults(){$('results')?.classList.add('hidden');cancelAnimationFrame(this.countFrame)}
  update(game,dt){
    this.eventTimer-=dt;if(this.eventTimer<=0)$('event').textContent='';
    this.hitTimer-=dt;if(this.hitTimer<=0)$('hitmarker').style.opacity='0';
    this.damageTimer-=dt;$('damage').style.opacity=String(Math.min(1,Math.max(0,this.damageTimer)*2.2)*this.damageStrength);this.combatLive=true;this.combat.update(dt,dangerLevel(game.player.health,game.player.shield),game.time);
    const quiet=game.time>45;if(quiet!==this.keysQuiet){this.keysQuiet=quiet;(this.keyStrip||(this.keyStrip=document.querySelector('.key-strip')))?.classList.toggle('is-quiet',quiet)}
    this.updatePopups(game,dt);let feedChanged=false;for(let i=this.feed.length-1;i>=0;i--){this.feed[i].time-=dt;if(this.feed[i].time<=0){this.feed.splice(i,1);feedChanged=true}}if(feedChanged)this.renderFeed();
    this.last+=dt;if(this.last<.08)return;this.last=0;
    const p=game.player;
    $('shield-value').textContent=Math.ceil(p.shield);$('health-value').textContent=Math.ceil(p.health);
    $('shield-bar').style.width=`${p.shield}%`;$('health-bar').style.width=`${p.health}%`;
    const run=game.run;$('score-blue').textContent=String(run?.score||0).padStart(5,'0');$('score-red').textContent=game.comboTime>0?`×${comboMultiplier(game.combo).toFixed(1)}`:'×1.0';$('combo-bar').style.transform=`scaleX(${Math.max(0,game.comboTime/COMBO_WINDOW)})`;
    $('timer').textContent=formatTime(game.mission&&run?Math.max(0,180-run.time):game.remaining);
    $('match-goal').textContent=game.tutorial.active?'FLIGHT CHECK':game.mission?game.mission.stage==='gauntlet'?`${game.mission.lives} ${game.mission.lives===1?'LIFE':'LIVES'}`:'LIMIT 03:00':'FIRST TO 25';
    if(game.battle)this.teamHud(game);else if(this.teamCaptions)this.clearTeamHud();
    $('heat-left').style.width=`${game.heat[0]*100}%`;$('heat-right').style.width=`${game.heat[1]*100}%`;
    $('crosshair').style.transform=`translate(-50%,-50%) scale(${1+Math.max(...game.recoil)*.22})`;
    $('left-state').textContent=!game.armPart(0).fire?'NO GUN':game.overheated[0]?'OVERHEATED':game.heat[0]>.5?'HEAT RISING':'READY';$('right-state').textContent=!game.armPart(1).fire?'NO GUN':game.overheated[1]?'OVERHEATED':game.cooldowns[1]>.05?'CYCLING':'READY';
    $('missile-state').textContent=game.shoulderStatus();
    $('speed').textContent=Math.round(p.velocity.length());
    const inside=game.realm!=='station'||Math.abs(p.position.z)<8.5&&Math.hypot(p.position.x,p.position.y)<72&&Math.hypot(p.position.x,p.position.y)>60.4;
    const supported=game.realm!=='station'||!!p.supportSurface;
    $('flight-mode').textContent=p.magnetic?(p.grounded?'DECK LOCK':supported?'BOOT ASSIST':'FREE SPACE · C TO RETURN'):'FREE FLIGHT';
    $('gravity').textContent=p.magnetic&&supported?(p.grounded?'MAGNETIC CONTACT · DECK SECURE':'BOOT ASSIST · DESCENDING TO DECK'):'THRUSTERS ACTIVE · F FOR BOOT ASSIST';
    const bay=((Math.round(game.theta/Math.PI/2*96)%96)+96)%96;
    const surfaceLabel=p.supportSurface?.label==='HULL ROOF'&&p.supportSurface.radialSign>0?'PROMENADE CEILING':p.supportSurface?.label;
    $('sector').textContent=game.realm==='city'?'MERIDIAN / CENTRAL AVENUE':game.realm==='eden'?'EDEN / THE LIVING SANCTUARY':surfaceLabel&&(!inside||p.surfaceUp)?surfaceLabel:inside?locationLabel(bay):`EXTERIOR / ${String(bay+1).padStart(2,'0')}`;
    $('heading').textContent=String(Math.round(((game.yaw*180/Math.PI)%360+360)%360)).padStart(3,'0');
    $('notice').style.opacity=game.nearAirlock&&!game.tutorial.active?'1':'0';
    $('dash-state').textContent=game.dashCooldown>0?`DASH ${game.dashCooldown.toFixed(1)} S`:'DASH READY';
    $('dash-meter').style.transform=`scaleX(${Math.max(0,1-game.dashCooldown/(game.mission?.upgrades>=2?1.6:2.4))})`;
    this.updateCoach(game);this.updateTips(game);this.updateMission(game);this.updateMarkers(game);
    this.drawRadar(game);
  }
  updateCoach(game){
    const tutorial=game.tutorial,coach=$('coach');coach.classList.toggle('hidden',!tutorial.active);
    if(!tutorial.active){this.lessonIndex=-1;return}
    coach.classList.toggle('complete',tutorial.confirm>0);
    const remaining=tutorial.tasks.filter(task=>!task.done);$('coach-step-status').textContent=remaining.length?`NEXT: ${remaining.map(task=>task.label).join(' + ')}`:'CONFIRMED';
    if(this.lessonIndex===tutorial.index)return;this.lessonIndex=tutorial.index;
    $('coach-step').textContent=`FLIGHT CHECK ${tutorial.index+1} / ${FLIGHT_LESSONS.length}`;
    $('coach-title').textContent=tutorial.lesson.title;$('coach-copy').textContent=tutorial.lesson.text;
    $('coach-keys').replaceChildren(...tutorial.lesson.keys.map(key=>{const k=document.createElement('kbd');k.textContent=key;return k}));
    $('coach-progress').replaceChildren(...Array.from({length:FLIGHT_LESSONS.length},(_,i)=>{const pip=document.createElement('i');pip.classList.toggle('done',i<tutorial.index);pip.classList.toggle('current',i===tutorial.index);return pip}));
  }
  updateMarkers(game){
    game.camera.updateMatrixWorld(true);
    const candidates=[];this.markers.forEach(marker=>marker.element.classList.add('hidden'));
    this.trackedBots(game).forEach((bot,index)=>{
      const marker=this.markers[index];if(!marker)return;const ally=!!game.battle&&bot.team===game.battle.team;
      const up=game.realm!=='station'?new Vector3(0,1,0):new Vector3(-Math.sin(bot.angle),Math.cos(bot.angle),0),center=bot.group.position.clone().addScaledVector(up,2),distance=center.distanceTo(game.player.position);
      const point=bot.group.position.clone().addScaledVector(up,3.8).project(game.camera);
      const visible=!bot.dead&&distance<(ally?70:100)&&point.z>-1&&point.z<1&&Math.abs(point.x)<.93&&Math.abs(point.y)<.85&&!game.blockedByCover(game.player.position,center);
      if(!visible)return;
      const x=(point.x*.5+.5)*innerWidth,y=(-point.y*.5+.5)*innerHeight,priority=game.tutorial.active?0:(bot.charge>.1?2:0)+(Math.hypot(x-innerWidth*.5,y-innerHeight*.5)<150?1:0);candidates.push({index,x,y,distance,priority:ally?priority-2:priority,bot,ally});
    });
    const reserved=['mission-card','coach','radio','chapter-card','boss-status'].map(id=>$(id).getBoundingClientRect());
    for(const {index,x,y,distance,bot,ally} of selectMarkerLabels(candidates,reserved,game.tutorial.active?1:game.battle?4:3)){
      const marker=this.markers[index];marker.element.classList.remove('hidden');marker.element.style.transform=`translate3d(${x}px,${y}px,0)`;
      marker.label.textContent=`${bot.name} · ${Math.round(distance)} M`;marker.state.textContent=ally?'ALLY':game.tutorial.active?'PRACTICE TARGET':bot.charge>.1?'ATTACK INCOMING':bot.armLost?'ARM DISABLED':bot.archetype==='bulwark'?(bulwarkFacing(bot,game.player.position)>.35?'FRONT ARMOR · FLANK':bulwarkFacing(bot,game.player.position)<-.35?'REAR REACTOR · 2.5×':'GET BEHIND · REAR REACTOR'):ENEMY_TYPES[bot.archetype]?.attack.toUpperCase()||'HOSTILE';
      marker.element.classList.toggle('charging',bot.charge>.1&&!ally);marker.element.classList.toggle('ally',!!ally);marker.fill.style.transform=`scaleX(${Math.max(0,(bot.health+bot.shield)/((bot.maxHealth||100)+(bot.maxShield||45)))})`;
    }
  }
  updateTips(game){
    const protection=$('spawn-protection'),tip=$('context-tip');
    const protectedNow=!game.tutorial.active&&game.invulnerable>0;
    protection.classList.toggle('hidden',!protectedNow);if(protectedNow)protection.textContent=`SPAWN SHIELD · ${Math.ceil(game.invulnerable)} S`;
    if(game.tutorial.active){tip.classList.add('hidden');return}
    let key='',copy='';
    if(game.overheated.some(Boolean)){key='heat';copy='Weapon overheated. Release fire to cool down, or press R to vent.'}
    else if(game.player.health<35){key='health';copy='Core critical. Keep moving! Eliminating a mech restores 18 shield.'}
    else if(game.bots.some(b=>!b.dead&&b.archetype==='bulwark'&&b.group.position.distanceTo(game.player.position)<55)){key='reactor';copy='Bulwark armor resists frontal fire. Grapple behind it with C and shoot the orange reactor. An airborne reactor kill recharges X.'}
    else if(game.bots.some(b=>!b.dead&&b.charge>.2)){key='incoming';copy='Incoming shot! Strafe with A / D, or tap X to dash out of its path.'}
    else if(game.realm==='station'&&game.player.supportSurface?.surface==='balcony'){key='balcony';copy='Balcony secured. Jump back through broken windows, follow the rails to a dock, or grapple to a roof pad with C.'}
    else if(!game.player.magnetic){key='flight';copy='Free flight: SPACE rises, CTRL descends. Press F to engage magnetic boots.'}
    if(game.dangerZones?.length){key='ground-strike';copy='Ground strike! Leave the red circle now. X dashes; Space jumps.'}
    if(key&&key!==this.lastTip&&game.time>this.tipUntil){this.lastTip=key;this.tipUntil=game.time+5;tip.textContent=copy}
    tip.classList.toggle('hidden',game.time>this.tipUntil||!tip.textContent||game.deadTimer>0);
  }
  updateMission(game){
    $('realm-transition').style.opacity=String(game.transition||0);
    if(!game.mission)return;
    $('mission-chapter').textContent=game.tutorial.active?'TRAINING · STORY PAUSED':game.mission.title;$('mission-objective').textContent=game.tutorial.active?'Finish the flight check or press Tab':game.mission.objective;
    const hints={team:game.battle?game.battle.hint():'',gauntlet:'Survive wave after wave. Chain kills for a bigger multiplier. Lose all three lives and the run ends.',briefing:'You are at the Kestrel launch point. Approach the cyan console ahead and press E to begin.',relays:'Recover three gate cells. Strikers rush you; the Bulwark has an exposed orange rear reactor.',portal:'Cross the green ring to reach Meridian City.','city-combat':'Use the streets and cover. Violet lancers charge aimed shots; heavies launch slow explosive rounds.','city-uplink':'Follow the relay marker and press E nearby. Restores your suit and unlocks the next sector.','city-portal':'All city relays are online. Head north through the green gateway.',sanctuary:game.mission.wave?'ARCHON marks the ground before striking. Dash out of the red ring. Use missiles on its core.':'The final forest is under attack. Clear its defenders and prepare for ARCHON.',beacon:'Reach the Heart Tree. Press E at the glowing archive to finish the campaign.',complete:'The archive is safe. Explore Eden, or start a new campaign from pause.'};$('mission-hint').textContent=game.tutorial.active?'Enemy fire is disabled during optional training. Tab returns to the campaign.':hints[game.mission.stage];
    if(!game.tutorial.active&&game.mission.openingStep){
      const steps={breach:'Breach the marked glass: shoot it, or jump and boost through its middle. The route is optional; recover all three gate cells to open the portal.',tether:'Aim at the marked exterior pad and press C. The tether reels you in and lands your boots. Press C during a pull to release.',reactor:'The Bulwark turns slowly. Tether around cover, shoot its orange rear reactor, then dash away. An airborne reactor kill recharges X.',cells:'Recover the green gate cells dropped by all three sentries, then cross the awakened portal.'};
      $('mission-hint').textContent=steps[game.mission.openingStep];
    }
    if(game.realm==='station'&&!game.tutorial.active&&Math.hypot(game.player.position.x,game.player.position.y)<RADIUS-12)$('mission-hint').textContent='Shoot a cyan-framed roof skylight to shatter it, then descend through the breach into Kestrel. Magnetic boots help you land.';
    $('campaign-threat').textContent=`THREAT ${game.mission.difficulty.tier} · ${game.mission.combatActive?game.mission.alive+' HOSTILES':game.mission.stage==='briefing'?'SAFE LAUNCH':game.mission.stage==='complete'?'WORLD RESTORED':'SECTOR CLEAR'}`;
    $('campaign-upgrade').textContent=game.mission.upgrades?`SUIT MK ${1+game.mission.upgrades} · DAMAGE +${game.mission.upgrades*12}%${game.mission.upgrades>=2?' · FAST THRUSTERS':''}`:game.realm==='station'?'SUIT MK 1 · RECOVER THE GATE CELLS':'SUIT MK 1 · RESTORE A RELAY TO UPGRADE';
    if(game.battle){$('campaign-threat').textContent=game.battle.threatText();$('campaign-upgrade').textContent=game.battle.suitText()}
    const chapter=$('chapter-card');chapter.classList.toggle('hidden',!(game.chapterTime>0)||game.tutorial.active);$('event').style.top=chapter.classList.contains('hidden')?'':`${Math.round(chapter.getBoundingClientRect().bottom+16)}px`;$('chapter-number').textContent=game.mission.title;$('chapter-name').textContent=game.mission.stage==='gauntlet'?'Hold the avenue.':game.realm==='station'?'Wake up, pilot.':game.realm==='city'?['The silent city.','Heavy resistance.','The north gate.'][game.mission.wave]:game.mission.wave?'The last commander.':'A world worth saving.';$('chapter-copy').textContent=game.mission.stage==='gauntlet'?'Squads keep coming and keep growing. ARCHON commands every fifth wave. Three lives. One run.':game.realm==='station'?'Earth has gone silent. ARCHON controls the gates. You are the last pilot who can reconnect them. Start at the launch console.':game.realm==='city'?['Reconnect three city relays. Each sector brings tougher machines and upgrades for your suit.','Bulwarks hold the civic district. Your weapon amplifier is online. Use cover and dodge their explosive rounds.','The final city defense line. Your thrusters and missile recharge are upgraded. Clear the north gate to reach Eden.'][game.mission.wave]:'Protect the seed archive. Defeat ARCHON, then restore the Heart Tree.';
    if(game.battle){$('chapter-name').textContent=game.battle.op.name;$('chapter-copy').textContent=game.battle.op.blurb}
    const radio=game.radio;$('radio').classList.toggle('hidden',!radio||radio.remaining<=0||game.tutorial.active);if(radio&&this.radioId!==radio.id){this.radioId=radio.id;$('radio-speaker').textContent=`${radio.speaker} / ${radio.speaker==='IRIS'?'FIELD GUIDE':'HOSTILE TRANSMISSION'}`;$('radio-text').textContent=radio.text}
    const boss=game.bots.find(bot=>!bot.dead&&bot.archetype==='archon'&&!game.tutorial.active);$('boss-status').classList.toggle('hidden',!boss);if(boss){$('boss-phase').textContent=boss.shield>0?'ARCHON · ARMOR ACTIVE':boss.health>boss.maxHealth*.5?'ARCHON · CORE EXPOSED':'ARCHON · OVERDRIVE';$('boss-integrity').style.transform=`scaleX(${Math.max(0,(boss.health+boss.shield)/(boss.maxHealth+boss.maxShield))})`}
    const tether=game.grapple;$('grapple-label').textContent=tether.mode==='idle'?(game.player.surfaceUp?'SURFACE LOCK · F TO DETACH':'TETHER READY · AIM + C'):`${tether.mode==='flying'?'TETHER FIRED':tether.mode==='latched'?'SURFACE LOCK':'REELING IN'} · ${Math.round(tether.distance||game.player.position.distanceTo(tether.hit.point))} M · C RELEASE`;
    let action='';
    if(!game.tutorial.active&&game.realm==='station'&&game.mission.stage==='briefing'&&game.player.position.distanceTo(game.world.launchConsole.position)<7)action='ACTIVATE KESTREL LAUNCH';
    if(game.realm==='city'&&game.mission.stage==='city-uplink'&&game.player.position.distanceTo(game.world.uplinks[game.mission.wave].position)<6)action='RESTORE RELAY · REFIT SUIT';
    if((game.realm==='station'||game.realm==='city')&&game.player.position.distanceTo(game.world.portal.position)<7)action=game.mission.gateOpen?(game.realm==='station'?'ENTER MERIDIAN CITY':'ENTER EDEN'):'GATEWAY OFFLINE · COMPLETE OBJECTIVE';
    if(game.realm==='eden'&&game.player.position.distanceTo(game.world.archive.position)<5.5)action=game.mission.stage==='beacon'?'RESTORE THE SEED ARCHIVE':game.mission.stage==='complete'?'ARCHIVE RESTORED':'SECURE THE SANCTUARY FIRST';
    if(game.battle)action='';$('interact-prompt').classList.toggle('hidden',!action);$('interact-label').textContent=action;
    const target=game.objectiveTarget(),marker=$('objective-marker');
    // A hostile already in view carries its own enemy marker; only point at it when it is off-screen.
    const projected=target?target.position.clone().project(game.camera):null;
    const hostileInView=!!target?.hostile&&projected.z<1&&Math.abs(projected.x)<.9&&Math.abs(projected.y)<.85;
    marker.classList.toggle('hidden',!target||hostileInView);if(target&&!hostileInView){
      const p=projected,behind=p.z>1,x=Math.max(-.8,Math.min(.8,behind?-p.x:p.x)),y=Math.max(-.55,Math.min(.7,behind?-p.y:p.y));marker.style.left=`${(x*.5+.5)*innerWidth}px`;marker.style.top=`${(-y*.5+.5)*innerHeight}px`;$('objective-marker-label').textContent=`${behind?'TURN · ':''}${target.label} · ${Math.round(game.player.position.distanceTo(target.position))} M`;
    }
  }
  drawRadar(game){
    const c=this.radar,w=180,h=180;c.clearRect(0,0,w,h);c.save();c.translate(w/2,h/2);
    c.strokeStyle='#9ed7e337';c.lineWidth=1;
    for(const r of [31,63,77]){c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.stroke()}
    c.beginPath();c.moveTo(-77,0);c.lineTo(77,0);c.moveTo(0,-77);c.lineTo(0,77);c.stroke();
    for(let i=0;i<24;i++){const a=i/24*Math.PI*2;c.beginPath();c.moveTo(Math.cos(a)*73,Math.sin(a)*73);c.lineTo(Math.cos(a)*77,Math.sin(a)*77);c.stroke()}
    for(const bot of this.trackedBots(game)){if(bot.dead)continue;const delta=bot.group.position.clone().sub(game.player.position),f=delta.dot(game.forward),s=delta.dot(game.right);let x=s*1.8,y=-f*1.8;const length=Math.hypot(x,y);if(length>69){x*=69/length;y*=69/length}c.fillStyle=game.battle&&bot.team===game.battle.team?'#7fd6ff':'#f8aa8b';c.beginPath();c.arc(x,y,2.5,0,Math.PI*2);c.fill()}
    c.fillStyle='#b4f3f7';c.beginPath();c.moveTo(0,-5);c.lineTo(-3,3);c.lineTo(3,3);c.closePath();c.fill();c.restore();
  }
}
