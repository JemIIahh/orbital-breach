import { MechStage } from './mech-stage.js';
import { MAPS, MAX_PLAYERS, MIN_PLAYERS } from './online-rules.js';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class OnlineLobby {
  constructor(session){
    this.session=session;this.visible=false;this.portraits=new Map();this.selected=null;
    this.root=document.createElement('section');this.root.id='online-lobby';this.root.className='hidden';this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-labelledby','online-title');document.body.append(this.root);
    this.root.innerHTML=`<div class="ol-shell"><header class="ol-header"><div><span class="ol-eyebrow">KESTREL // PILOT NETWORK</span><h1 id="online-title">YOUR NEXT RIVAL<br>IS ALREADY HERE.</h1></div><button data-action="close" class="ol-quiet" aria-label="Close multiplayer lobby">CLOSE ×</button></header><div class="ol-layout"><div class="ol-main"><div class="ol-roomline"><div><span class="ol-eyebrow">FREE-FOR-ALL · 3–8 PILOTS</span><h2 id="ol-room-name">Assemble your room.</h2></div><button id="ol-copy" data-action="copy" class="ol-code hidden" title="Copy invitation link"></button></div><div id="ol-status" role="status" aria-live="polite">Create a room or join a friend with their code.</div><div class="ol-roster" id="ol-roster"></div><div id="ol-setup"><label>YOUR CALLSIGN<input id="ol-name" maxlength="18" autocomplete="nickname" placeholder="PILOT"></label><div class="ol-connect"><button data-action="create" class="ol-primary">CREATE ROOM ↗</button><form id="ol-join-form"><label class="sr-only" for="ol-code-input">Room code</label><input id="ol-code-input" maxlength="6" placeholder="ROOM CODE" pattern="[A-Za-z0-9]{6}" required><button class="ol-quiet" type="submit">JOIN ↗</button></form></div></div><div id="ol-controls" class="hidden"><label>ARENA<select id="ol-map">${Object.entries(MAPS).map(([id,m])=>`<option value="${id}">${esc(m.name)}</option>`).join('')}</select></label><p id="ol-map-copy"></p><div class="ol-actions"><button data-action="ready" id="ol-ready" class="ol-quiet">READY UP</button><button data-action="start" id="ol-start" class="ol-primary">LAUNCH MATCH ↗</button><button data-action="leave" class="ol-quiet">LEAVE ROOM</button></div></div><p class="ol-footnote">15 eliminations · 5 minutes · 4-second redeploys<br>Repair stations restore your suit. Firing cancels spawn protection.</p></div><aside class="ol-inspect"><div class="ol-stage" id="ol-stage"><div class="ol-stage-grid"></div><span class="ol-eyebrow ol-stage-label">FRAME INSPECTION // LIVE</span></div><div class="ol-inspect-copy"><span class="ol-eyebrow" id="ol-selected-label">YOUR FRAME</span><h2 id="ol-selected-name">READY FOR LAUNCH.</h2><p>Select a pilot to inspect their equipped mech.<br>Drag to rotate. Scroll to zoom.</p></div></aside></div><footer class="ol-footer"><span id="ol-connection">OFFLINE</span><span>EVERY PILOT FOR THEMSELVES.</span></footer></div>`;
    try{this.root.querySelector('#ol-name').value=localStorage.getItem('orbital.callsign')||''}catch{}
    this.root.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)this.action(b.dataset.action);const p=e.target.closest('[data-pilot]');if(p){this.selected=p.dataset.pilot;this.inspect()}});
    this.root.querySelector('#ol-join-form').addEventListener('submit',e=>{e.preventDefault();this.session.join(this.root.querySelector('#ol-code-input').value)});
    this.root.querySelector('#ol-map').addEventListener('change',e=>this.session.send({type:'map',map:e.target.value}));
    this.root.addEventListener('keydown',e=>{if(e.code==='Escape'){e.stopPropagation();this.action('close')}});
    this.root.addEventListener('keydown',e=>{if(e.key==='Tab'){const focus=[...this.root.querySelectorAll('button:not(:disabled),input,select')].filter(n=>n.getClientRects().length);if(!focus.length)return;const first=focus[0],last=focus.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
  }
  el(id){return this.root.querySelector('#'+id)}
  open(){this.visible=true;this.previousFocus=document.activeElement;this.root.classList.remove('hidden');this.stage=MechStage.shared(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);this.stage.mount(this.el('ol-stage'));this.stage.frame({az:2.85,y:1.85,dist:8.8});this.render();this.root.querySelector('[data-action=close]').focus()}
  close(){this.visible=false;this.root.classList.add('hidden');this.stage?.unmount();this.previousFocus?.focus?.()}
  profile(){return this.session.game.profile}
  credentials(){const name=this.el('ol-name').value||'PILOT';try{localStorage.setItem('orbital.callsign',name)}catch{}return{name,build:this.session.game.build,paint:this.profile().paint,lights:this.profile().lights}}
  message(text){this.el('ol-status').textContent=text}
  async action(type){const s=this.session,r=s.room;
    if(type==='create')s.create();if(type==='leave')s.leave();
    if(type==='close'){if(s.active)s.resume();else if(r)this.message('Leave this room to return to the campaign.');else this.close()}
    if(type==='ready')s.send({type:'ready',ready:!r?.players.find(p=>p.id===s.id)?.ready});
    if(type==='start'){if(r?.state==='playing')s.resume();else s.send({type:r?.state==='finished'?'rematch':'start'})}
    if(type==='copy'){try{const u=new URL(location.href);u.searchParams.set('room',r.code);await navigator.clipboard.writeText(u.href);this.message('Invitation copied. Send it to your friends.')}catch{this.message(`Share room code ${r.code} and this game’s address.`)}}
  }
  render(){
    const s=this.session,r=s.room,players=r?.players||[],mine=players.find(p=>p.id===s.id),host=r?.host===s.id,finished=r?.state==='finished',playing=r?.state==='playing';
    this.el('ol-setup').classList.toggle('hidden',!!r);this.el('ol-controls').classList.toggle('hidden',!r);this.el('ol-copy').classList.toggle('hidden',!r);this.el('ol-copy').textContent=r?.code||'';
    this.el('ol-room-name').textContent=finished?'Final standings.':playing?'Match in progress.':r?`${players.length} / ${MAX_PLAYERS} pilots aboard.`:'Assemble your room.';
    if(r){this.el('ol-map').value=r.map;this.el('ol-map').disabled=!host||r.state!=='lobby';this.el('ol-map-copy').textContent=MAPS[r.map].description;
      this.el('ol-ready').classList.toggle('hidden',r.state!=='lobby');this.el('ol-ready').textContent=mine?.ready?'READY ✓ · CANCEL':'READY UP';
      const start=this.el('ol-start');start.textContent=playing?'ENTER ARENA ↗':finished?(host?'RETURN TO LOBBY ↗':'WAITING FOR HOST'):'LAUNCH MATCH ↗';start.disabled=!playing&&(!host||!finished&&(players.length<MIN_PLAYERS||players.some(p=>!p.ready)));
      this.message(finished?`${players[0]?.name||'PILOT'} leads with ${players[0]?.kills||0} eliminations.`:playing?'The match keeps running while you are in this room.':players.length<MIN_PLAYERS?`${MIN_PLAYERS-players.length} more ${MIN_PLAYERS-players.length===1?'pilot':'pilots'} needed to launch. Share the room code.`:players.some(p=>!p.ready)?'Waiting for every pilot to ready up.':host?'All pilots ready. Launch when you’re ready.':'All pilots ready. Waiting for the host to launch.');
    }
    const roster=this.el('ol-roster');roster.replaceChildren();
    for(let i=0;i<MAX_PLAYERS;i++){
      const p=players[i],card=document.createElement(p?'button':'div');card.className='ol-pilot'+(!p?' ol-empty':'');if(!p){card.innerHTML=`<span class="ol-seat">${String(i+1).padStart(2,'0')}</span><span>OPEN BERTH</span>`;roster.append(card);continue}
      card.type='button';card.dataset.pilot=p.id;card.setAttribute('aria-label',`Inspect ${p.name}${p.id===s.id?', your frame':''}`);
      const key=JSON.stringify([p.build,p.paint,p.lights]);let url=this.portraits.get(key);
      if(!url&&this.stage?.renderer){url=this.stage.snapshot(p.build,{paint:p.paint,lights:p.lights,az:2.9,y:1.85,dist:8.4,w:240,h:260});if(url)this.portraits.set(key,url)}
      if(url){const img=document.createElement('img');img.src=url;img.alt='';card.append(img)}
      const name=document.createElement('strong');name.textContent=p.name;const label=document.createElement('span');label.textContent=finished?`${p.kills} K / ${p.deaths} D`:`${p.id===s.id?'YOU · ':''}${p.id===r.host?'HOST · ':''}${p.ready?'READY ✓':'FITTING'}`;label.classList.toggle('is-ready',p.ready);card.append(name,label);roster.append(card);
    }
    if(!players.some(p=>p.id===this.selected))this.selected=mine?.id||players[0]?.id;this.inspect();
  }
  inspect(){const s=this.session,p=s.room?.players.find(p=>p.id===this.selected)||{...this.credentials(),id:s.id};if(!this.stage)return;const key=JSON.stringify([p.id,p.build,p.paint,p.lights]);if(key!==this.inspected){this.inspected=key;this.stage.setBuild(p.build);this.stage.setLivery(p.paint,p.lights)}this.el('ol-selected-name').textContent=p.name||'YOUR FRAME';this.el('ol-selected-label').textContent=p.id===s.id?'YOUR EQUIPPED FRAME':'RIVAL FRAME';for(const b of this.root.querySelectorAll('[data-pilot]'))b.setAttribute('aria-pressed',String(b.dataset.pilot===p.id))}
  update(now){this.stage?.update(now)}
}
