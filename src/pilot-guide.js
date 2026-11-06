import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeMech } from './world.js';
import { animateMech } from './animation.js';
import { ENEMY_TYPES } from './encounters.js';

const key=text=>`<kbd>${text}</kbd>`;
const missions=[
  {name:'Escape Kestrel',location:'01 / ORBITAL STATION',copy:'Your journey starts at the cyan launch console. Iris will guide you from there.',steps:['Press E at the console to begin.','Defeat three sentries. Collect their green cells.','Cross the awakened gateway to Meridian.'],action:'Use a console or gateway',keys:['E']},
  {name:'Reconnect Meridian',location:'02 / THE SILENT CITY',copy:'Three city sectors. Each relay unlocks a harder encounter and refits your suit.',steps:['Clear the enemies in the current sector.','Follow the relay marker and press E nearby.','Restore all three relays to open the Eden gate.'],action:'Restore a relay',keys:['E']},
  {name:'Bring the forest home',location:'03 / THE LAST SANCTUARY',copy:'Defend Eden’s seed archive, then face ARCHON and its escorts.',steps:['Stop the forest defenders.','Defeat ARCHON. Dash out of its red strike rings.','Press E at the Heart Tree to restore the archive.'],action:'Restore the archive',keys:['E']}
];
const systems=[
  {id:'left',title:'MX-9 Gatling',tag:'LEFT ARM',keys:['LEFT CLICK','R'],copy:'Hold left click for sustained fire. Watch the heat bar; release to cool, or press R to vent.',tip:'Use it to strip shields and track moving targets.',anchor:'leftGun'},
  {id:'right',title:'FK-40 Flak',tag:'RIGHT ARM',keys:['RIGHT CLICK'],copy:'Right click fires a spread of heavy rounds. Close the distance for more pellets to connect.',tip:'Combine flak with the Gatling while staying mobile.',anchor:'rightGun'},
  {id:'shoulder',title:'Shoulder missile',tag:'SHOULDER SYSTEM',keys:['G'],copy:'Aim and press G for an explosive missile. It recharges automatically after firing.',tip:'Use missiles against clustered enemies and heavy armor.',anchor:'body'},
  {id:'boots',title:'Magnetic boots',tag:'TRAVERSAL SYSTEM',keys:['F','C'],copy:'F toggles boots. Aim at a wall or roof and press C to reel in and attach to the surface.',tip:'Keep boots enabled to settle onto balconies and landing pads.',anchor:'leftAnkle'}
];
const movements=[
  {id:'walk',title:'Move and look',tag:'01 / ON FOOT',keys:['W','A','S','D','MOUSE'],copy:'WASD moves your mech. Move your mouse to aim and turn. Hold Shift to boost while moving.',tip:'Keep strafing during a fight. Standing still makes you an easy target.',extra:[['Boost','SHIFT'],['Quick dash','X']]},
  {id:'jets',title:'Jump. Boost. Break through.',tag:'02 / JET FLIGHT',keys:['SPACE','CTRL','SHIFT','X'],copy:'Tap Space to jump; hold it to rise. Ctrl descends. Shift boosts and X gives a short directional dash.',tip:'Jump and move into the middle of a window to shatter it. Land on the balcony outside.',extra:[['Toggle boots','F'],['Roll in free flight','Q / E']]},
  {id:'tether',title:'Hook. Reel. Land.',tag:'03 / THE TETHER',keys:['C','MIDDLE CLICK'],copy:'Aim at a solid surface and press C or middle click. The hook pulls you in and attaches your boots.',tip:'Press C to release the cable. F detaches your boots for free flight.',extra:[['Release tether','C'],['Detach boots','F']]}
];

export class PilotGuide {
  constructor(){
    this.dialog=document.getElementById('manual');this.tab='mission';this.mission=0;this.system=0;this.movement=0;this.enemy='striker';
    this.tabs=[...this.dialog.querySelectorAll('[role="tab"]')];
    this.tabs.forEach((button,index)=>{
      button.addEventListener('click',()=>this.select(button.dataset.guideTab));
      button.addEventListener('keydown',event=>{
        const next=event.key==='ArrowRight'?(index+1)%this.tabs.length:event.key==='ArrowLeft'?(index+this.tabs.length-1)%this.tabs.length:event.key==='Home'?0:event.key==='End'?this.tabs.length-1:null;
        if(next==null)return;event.preventDefault();this.select(this.tabs[next].dataset.guideTab);this.tabs[next].focus();
      });
    });
    for(const id of ['manual-close','guide-done'])document.getElementById(id).addEventListener('click',()=>this.dialog.close());
    this.dialog.addEventListener('close',()=>this.viewer?.stop());
    this.dialog.addEventListener('click',event=>{if(event.target!==this.dialog)return;const r=this.dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)this.dialog.close()});
    this.select('mission');
  }
  open(){if(!this.dialog.open)this.dialog.showModal();this.select(this.tab)}
  select(tab){
    this.tab=tab;this.tabs.forEach(button=>{const selected=button.dataset.guideTab===tab;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1});
    document.getElementById('guide-panel').setAttribute('aria-labelledby',`guide-tab-${tab}`);
    document.getElementById('guide-map').hidden=tab!=='mission';document.getElementById('guide-model').hidden=tab==='mission';
    document.getElementById('guide-visual-label').textContent={mission:'THE EDEN PROTOCOL / FLIGHT PATH',mech:'COBALT / SYSTEM INSPECTION',movement:'COBALT / MOVEMENT STUDY',combat:'THREAT RECOGNITION / HOSTILE UNITS'}[tab];
    document.getElementById('guide-visual-caption').textContent=tab==='mission'?'Three worlds. One route home.':'Drag the model to inspect · Illustrated controls';
    this.renderDetail();
    if(tab==='mission'){this.viewer?.stop();return}
    if(!this.dialog.open)return;
    if(!this.viewer){
      try{this.viewer=new GuideViewer(document.getElementById('guide-preview'))}catch(error){document.getElementById('guide-model-fallback').hidden=false;document.getElementById('guide-visual-caption').textContent='Select a system to see its controls.';return}
    }
    this.viewer.setMode(tab,tab==='combat'?this.enemy:'pilot',tab==='mech'?systems[this.system].id:tab==='movement'?movements[this.movement].id:null);this.viewer.start();
  }
  renderDetail(){
    const detail=document.getElementById('guide-detail'),active=document.activeElement,focusData=detail.contains(active)?Object.entries(active.dataset).find(([name])=>['chapter','system','movement','enemy'].includes(name)):null;let content='';
    if(this.tab==='mission'){
      const m=missions[this.mission];content=`<div class="guide-chapter-select" aria-label="Campaign chapters">${missions.map((chapter,index)=>`<button type="button" data-chapter="${index}" aria-pressed="${index===this.mission}"><b>0${index+1}</b><span>${['Kestrel','Meridian','Eden'][index]}</span></button>`).join('')}</div><span class="guide-overline">${m.location}</span><h3>${m.name}</h3><p>${m.copy}</p><ol class="guide-steps">${m.steps.map((step,index)=>`<li><span>${index+1}</span>${step}</li>`).join('')}</ol><div class="guide-primary-key">${key('E')}<span>${m.action}</span></div>`;
    }else if(this.tab==='mech'){
      const s=systems[this.system];content=`<span class="guide-overline">YOUR MECH / SELECT A SYSTEM</span><h3>Built to breach.</h3><div class="guide-system-select">${systems.map((system,index)=>`<button type="button" data-system="${index}" aria-pressed="${index===this.system}">${key(system.keys[0])}<span>${system.title}<small>${system.tag}</small></span><b aria-hidden="true">↗</b></button>`).join('')}</div><div class="guide-selection-copy" aria-live="polite"><p>${s.copy}</p><span>${s.tip}</span></div><div class="guide-shortcuts"><span>${key('V')} Change camera</span><span>${key('R')} Vent heat</span></div>`;
    }else if(this.tab==='movement'){
      const m=movements[this.movement];content=`<span class="guide-overline">TRAVERSAL / SELECT A MANEUVER</span><div class="guide-move-select">${movements.map((mode,index)=>`<button type="button" data-movement="${index}" aria-pressed="${index===this.movement}">${['Walk','Jet flight','Tether'][index]}</button>`).join('')}</div><h3>${m.title}</h3><div class="guide-keyboard ${m.id==='walk'?'guide-wasd':''}" aria-label="${m.keys.join(', ')}">${m.keys.map(key).join('')}</div><p>${m.copy}</p><div class="guide-technique"><span>TRY THIS</span><p>${m.tip}</p></div><div class="guide-shortcuts">${m.extra.map(([label,input])=>`<span>${key(input)} ${label}</span>`).join('')}</div>`;
    }else{
      const e=ENEMY_TYPES[this.enemy];content=`<span class="guide-overline">ENEMY INTELLIGENCE / FIVE CLASSES</span><h3>Read the threat.</h3><div class="guide-enemy-select">${Object.entries(ENEMY_TYPES).map(([type,spec])=>`<button type="button" data-enemy="${type}" aria-pressed="${this.enemy===type}"><i style="--unit-color:${spec.color}" aria-hidden="true"></i>${spec.name}</button>`).join('')}</div><div class="guide-enemy-copy" aria-live="polite"><span class="guide-overline">${e.name} / ${({rush:'CLOSE ASSAULT',burst:'RANGED VOLLEYS',snipe:'CHARGED SHOT',blast:'HEAVY ARMOR',boss:'FINAL COMMANDER'})[e.attack]}</span><p>${e.tip}</p><div class="guide-technique"><span>YOUR RESPONSE</span><p>${({striker:'Strafe with A / D, then tap X to escape its charge.',gunner:'Move across its aim. Fire from cover between volleys.',sniper:'Wait for the violet sight line, then move away from its locked aim.',bulwark:'Use C to grapple behind its slow-turning armor. Shoot the orange rear reactor for 2.5× damage that bypasses shields. An airborne reactor kill recharges X. Missiles are another way through.',archon:'Leave the red ground rings before they detonate. Keep moving and attack its core.'})[this.enemy]}</p></div></div><div class="guide-shortcuts"><span>${key('X')} Dodge</span><span>${key('G')} Missile</span></div>`;
    }
    detail.innerHTML=content;
    for(const button of detail.querySelectorAll('[data-chapter]'))button.addEventListener('click',()=>{this.mission=Number(button.dataset.chapter);this.select(this.tab)});
    for(const button of detail.querySelectorAll('[data-system]'))button.addEventListener('click',()=>{this.system=Number(button.dataset.system);this.select(this.tab)});
    for(const button of detail.querySelectorAll('[data-movement]'))button.addEventListener('click',()=>{this.movement=Number(button.dataset.movement);this.select(this.tab)});
    for(const button of detail.querySelectorAll('[data-enemy]'))button.addEventListener('click',()=>{this.enemy=button.dataset.enemy;this.select(this.tab)});
    if(focusData)detail.querySelector(`[data-${focusData[0]}="${focusData[1]}"]`)?.focus({preventScroll:true});
    const diagram=document.getElementById('guide-map');diagram.dataset.chapter=this.mission;diagram.querySelectorAll('[data-map-chapter]').forEach(button=>{button.setAttribute('aria-pressed',String(Number(button.dataset.mapChapter)===this.mission));button.onclick=()=>{this.mission=Number(button.dataset.mapChapter);this.select('mission')}});
  }
}

class GuideViewer {
  constructor(canvas){
    this.canvas=canvas;this.renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
    this.scene=new T.Scene();this.camera=new T.PerspectiveCamera(35,1,.1,100);this.models=new Map();this.rotation=0;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.scene.add(new T.HemisphereLight('#c8eafa','#22394c',2.4));
    const keyLight=new T.DirectionalLight('#e5f5ff',3);keyLight.position.set(-3,6,-5);this.scene.add(keyLight);const rim=new T.DirectionalLight('#6ebbe2',2.7);rim.position.set(4,3,4);this.scene.add(rim);
    const environment=new RoomEnvironment(),pmrem=new T.PMREMGenerator(this.renderer);this.environment=pmrem.fromScene(environment,.06);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.8;environment.dispose();pmrem.dispose();
    this.floor=new T.GridHelper(9,18,'#5b8998','#2b4657');this.floor.material.transparent=true;this.floor.material.opacity=.35;this.scene.add(this.floor);
    this.pad=new T.Mesh(new T.RingGeometry(1.7,1.72,64),new T.MeshBasicMaterial({color:'#83c2ce',transparent:true,opacity:.5,side:T.DoubleSide}));this.pad.rotation.x=-Math.PI/2;this.pad.position.y=.015;this.scene.add(this.pad);
    this.marker=new T.Mesh(new T.TorusGeometry(.32,.018,6,40),new T.MeshBasicMaterial({color:'#acf2ec',transparent:true,opacity:.9,depthTest:false}));this.marker.renderOrder=2;this.scene.add(this.marker);
    this.tether=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3(-1.8,3.4,.6)]),new T.LineBasicMaterial({color:'#91e9e2'}));this.scene.add(this.tether);this.tetherAnchor=new T.Mesh(new T.BoxGeometry(.5,.5,.16),new T.MeshStandardMaterial({color:'#566e7b',metalness:.6,roughness:.4,emissive:'#35656a',emissiveIntensity:.5}));this.tetherAnchor.position.set(-1.8,3.4,.6);this.scene.add(this.tetherAnchor);
    this.anchors=document.getElementById('guide-anchor');this.line=document.getElementById('guide-anchor-line');this.badge=document.getElementById('guide-model-badge');
    canvas.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home'].includes(event.key))return;event.preventDefault();this.rotation=event.key==='Home'?0:this.rotation+(event.key==='ArrowLeft'?-.2:.2)});
    let drag=null;canvas.addEventListener('pointerdown',event=>{drag=event.clientX;canvas.setPointerCapture(event.pointerId)});canvas.addEventListener('pointermove',event=>{if(drag==null)return;this.rotation+=(event.clientX-drag)*.012;drag=event.clientX});canvas.addEventListener('pointerup',()=>{drag=null});canvas.addEventListener('pointercancel',()=>{drag=null});canvas.addEventListener('lostpointercapture',()=>{drag=null});
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas.parentElement);
  }
  setMode(mode,type,system){
    if(this.mech)this.scene.remove(this.mech.group);this.mode=mode;this.type=type;this.system=system;this.time=0;
    if(!this.models.has(type))this.models.set(type,makeMech(type==='pilot'?'blue':'red',1,type==='pilot'?'gunner':type));this.mech=this.models.get(type);this.scene.add(this.mech.group);this.mech.group.position.set(0,0,0);this.mech.group.rotation.set(0,0,0);
    const bounds=new T.Box3().setFromObject(this.mech.group);this.center=bounds.getCenter(new T.Vector3());this.size=bounds.getSize(new T.Vector3());if(mode==='movement'&&system!=='walk'){this.center.y+=.8;this.size.y+=1.1}this.tether.visible=this.tetherAnchor.visible=mode==='movement'&&system==='tether';this.pad.material.color.set(type==='archon'?'#df706a':'#83c2ce');this.badge.textContent=type==='pilot'?'COBALT / MK 1':ENEMY_TYPES[type].name;this.marker.visible=mode==='mech';this.anchors.hidden=mode!=='mech';this.resize();
  }
  resize(){
    const {width,height}=this.canvas.parentElement.getBoundingClientRect();if(width<1||height<1)return;this.renderer.setSize(width,height,false);this.camera.aspect=width/height;
    if(this.size){const fit=Math.max(this.size.y,this.size.x/this.camera.aspect),distance=fit/(2*Math.tan(T.MathUtils.degToRad(35/2)))*1.28;this.camera.position.copy(this.center).add(new T.Vector3(2.8,1.3,-7).normalize().multiplyScalar(distance));this.camera.lookAt(this.center);}
    this.camera.updateProjectionMatrix();
  }
  start(){if(this.active)return;this.active=true;this.last=performance.now();this.renderer.setAnimationLoop(()=>this.frame())}
  stop(){this.active=false;this.renderer.setAnimationLoop(null)}
  frame(){
    const now=performance.now(),dt=Math.min((now-this.last)/1000,.05);this.last=now;this.time+=dt;const t=this.reduced?0:this.time,walk=this.mode==='movement'&&this.system==='walk',fly=this.mode==='movement'&&this.system!=='walk',combat=this.mode==='combat';
    this.mech.group.rotation.y=this.rotation+(!this.reduced?Math.sin(t*.3)*.08:0);this.mech.group.position.y=fly?1.1+Math.sin(t*2)*.15:0;
    const recoil=this.reduced?0:(combat||this.mode==='mech'&&this.system!=='boots')?Math.max(0,1-(t%1.5)*7):0;
    animateMech(this.mech,{dt,time:t,speed:walk&&!this.reduced?6:0,airborne:fly,boost:fly&&this.system==='jets',recoil,charge:combat&&this.type==='sniper'?(t%2.5)/2.5:0});
    if(this.mode==='mech'){
      for(const side of ['left','right'])this.mech.limbs[`${side}Gun`].userData.flash.visible=this.system===side&&recoil>.6;
      const selected=systems.find(s=>s.id===this.system),limb=this.mech.limbs[selected?.anchor||'body'],point=new T.Vector3();limb.getWorldPosition(point);if(this.system==='shoulder')point.y+=2.7;
      this.marker.position.copy(point);this.marker.quaternion.copy(this.camera.quaternion);this.marker.scale.setScalar(1+Math.sin(t*3)*.08);
      const projected=point.clone().project(this.camera),x=(projected.x*.5+.5)*100,y=(-projected.y*.5+.5)*100;this.line.setAttribute('d',`M ${x} ${y} H ${x<50?15:85} V 79`);const label=document.getElementById('guide-anchor-label');label.textContent=selected?.title||'';label.style.left=x<50?'17px':'auto';label.style.right=x<50?'auto':'17px';
    }
    if(this.tether.visible){const point=this.mech.limbs.leftGun.userData.flash.getWorldPosition(new T.Vector3()),positions=this.tether.geometry.attributes.position;positions.setXYZ(0,point.x,point.y,point.z);positions.needsUpdate=true;this.tether.geometry.computeBoundingSphere()}
    this.renderer.render(this.scene,this.camera);
  }
}
