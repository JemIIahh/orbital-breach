// The Mission Board: pick a team operation, choose your side and the opposition's skill, or jump to a campaign chapter.
// The board owns only its DOM and a local selection; the game supplies data and handles the choices through `api`.
import { OPERATIONS, TEAMS, SKILLS, ARENAS, opById, otherTeam, payoutFor, rosterFor, skillById } from './team-ops.js';

const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const MODE_NAME = { tdm: 'TEAM DEATHMATCH', control: 'HOLD THE BEACON' };
const TYPE_NAME = { striker: 'STRIKER', gunner: 'GUNNER', sniper: 'SNIPER', bulwark: 'BULWARK' };
const SKILL_ORDER = ['rookie', 'veteran', 'elite'];

// Banner art for the detail panel: a drawn skyline for Meridian, a ridge and conifers for Eden. Pure SVG, no assets.
const CITY = [[0, 34, 50], [34, 26, 80], [60, 40, 60], [100, 30, 95], [130, 44, 70], [174, 28, 105], [202, 38, 60], [240, 32, 88], [272, 46, 66], [318, 30, 100], [348, 36, 72], [384, 28, 84], [412, 44, 58], [456, 32, 92], [488, 40, 68], [528, 30, 78], [558, 42, 56]];
const TREES = [[8, 46], [34, 62], [62, 40], [96, 70], [128, 48], [162, 58], [210, 44], [252, 74], [284, 52], [330, 64], [366, 46], [402, 72], [440, 50], [478, 66], [520, 44], [556, 60], [584, 48]];
function bannerSvg(arena) {
  let body;
  if (arena === 'eden') {
    body = '<path d="M0 120V82c60-20 110-14 170 2s120-18 200-12 140 18 230 4v44z" fill="#0b1b15"/>' + TREES.map(([x, h]) => `<polygon points="${x},120 ${x + 11},${120 - h} ${x + 22},120" fill="#0a1914"/><polygon points="${x + 3},${120 - h * .45} ${x + 11},${120 - h * .85} ${x + 19},${120 - h * .45}" fill="#0f251c"/>`).join('');
  } else {
    const lit = CITY.flatMap(([x, w, ht], i) => Array.from({ length: Math.floor(ht / 18) }, (_, k) => ((i * 7 + k * 3) % 5 === 0 ? `<rect x="${x + 5 + ((k * 9 + i * 5) % Math.max(8, w - 13))}" y="${120 - ht + 8 + k * 16}" width="4" height="5" fill="#ffc47a" opacity=".8"/>` : ''))).join('');
    body = CITY.map(([x, w, ht]) => `<rect x="${x}" y="${120 - ht}" width="${w}" height="${ht}" fill="#0a141d"/>`).join('') + lit;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 120" preserveAspectRatio="none">${body}</svg>`;
}

export class MissionBoard {
  constructor(root, api) {
    this.root = root; this.api = api; this.tab = 'ops'; this.sel = { id: OPERATIONS[0].id, team: 'blue', skill: OPERATIONS[0].skill }; this.focusKey = ''; this.previews = new Map();
    root?.addEventListener('keydown', event => this.onKey(event));
  }
  get isOpen() { return !!this.root && !this.root.classList.contains('hidden'); }
  open() {
    if (!this.root) return;
    this.previews.clear();
    const s = this.api.state(); this.sel = { id: s.selection.op.id, team: s.selection.team, skill: s.selection.skill };
    this.tab = 'ops'; this.root.classList.remove('hidden'); this.render('deploy');
  }
  close() {
    if (!this.isOpen) return;
    this.root.classList.add('hidden'); this.root.replaceChildren(); this.api.closed?.();
  }
  onKey(event) {
    if (event.code === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); return; }
    if (event.code === 'Tab') { // keep focus inside the dialog
      const items = [...this.root.querySelectorAll('button:not([disabled])')]; if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  setTab(tab) { this.tab = tab; this.render(`tab-${tab}`); }
  pickOp(id) { const op = opById(id); this.sel = { id: op.id, team: this.sel.team, skill: op.skill }; this.api.choose(this.sel); this.render(`op-${op.id}`); }
  pickTeam(team) { this.sel = { ...this.sel, team }; this.api.choose(this.sel); this.render(`team-${team}`); }
  pickSkill(skill) { this.sel = { ...this.sel, skill }; this.api.choose(this.sel); this.render(`skill-${skill}`); }

  render(focusKey = this.focusKey) {
    const s = this.api.state(); this.focusKey = focusKey;
    const shell = h('div', 'mb-shell');
    shell.append(this.head(s), this.tabs(), this.tab === 'ops' ? this.opsBody(s) : this.campaignBody(s));
    this.root.replaceChildren(shell);
    const target = this.root.querySelector(`[data-key="${focusKey}"]`) || this.root.querySelector('button');
    target?.focus({ preventScroll: true });
  }
  arenaArt(arena) {
    if(!this.previews.has(arena)){
      let image=null;try{image=this.api.preview?.(arena)}catch{/* SVG is the fallback when a capture is unavailable. */}
      this.previews.set(arena,image||`data:image/svg+xml,${encodeURIComponent(bannerSvg(arena))}`);
    }
    return `url("${this.previews.get(arena)}")`;
  }
  head(s) {
    const head = h('header', 'mb-head'), title = h('div', 'mb-title');
    const kicker = h('span', 'mb-kicker', 'KESTREL OPERATIONS / MISSION BOARD'), heading = h('h2', '', 'Choose your fight.'); heading.id = 'mb-title';
    title.append(kicker, heading,h('p','mb-subtitle','Pick the battlefield. Assemble your squad. Make it count.'));
    const credits = h('div', 'mb-credits'); credits.append(h('span', '', 'CREDITS'), h('b', '', Number.isFinite(s.credits) ? s.credits.toLocaleString() : '—'));
    const close = h('button', 'mb-close', 'CLOSE · ESC'); close.type = 'button'; close.dataset.key = 'close'; close.addEventListener('click', () => this.close());
    head.append(title, credits, close); return head;
  }
  tabs() {
    const bar = h('div', 'mb-tabs'); bar.setAttribute('role', 'tablist');
    for (const [id, label, note] of [['ops', 'TEAM OPERATIONS', 'Squad vs squad'], ['campaign', 'CAMPAIGN', 'Story missions']]) {
      const b = h('button', 'mb-tab'); b.type = 'button'; b.dataset.key = `tab-${id}`; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(this.tab === id));
      b.append(h('b', '', label), h('small', '', note)); b.addEventListener('click', () => this.setTab(id)); bar.append(b);
    }
    return bar;
  }

  // ---- Team operations ------------------------------------------------------------------------------------------
  opsBody(s) {
    const body = h('div', 'mb-body mb-ops'), op = opById(this.sel.id), record = s.record?.ops?.[op.id];
    body.append(this.opList(s), this.opDetail(op, record), this.setupPanel(op));
    return body;
  }
  opList(s) {
    const list = h('div', 'mb-list'); list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Team operations');
    for (const op of OPERATIONS) {
      const rec = s.record?.ops?.[op.id], selected = op.id === this.sel.id, skill = SKILLS[op.skill];
      const card = h('button', 'mb-card'); card.type = 'button'; card.dataset.key = `op-${op.id}`; card.setAttribute('role', 'option'); card.setAttribute('aria-selected', String(selected)); card.classList.toggle('is-selected', selected);
      card.dataset.arena = op.arena;
      const thumb=h('span','mb-card-image');thumb.style.backgroundImage=this.arenaArt(op.arena);thumb.setAttribute('aria-hidden','true');
      thumb.append(h('b','',String(OPERATIONS.indexOf(op)+1).padStart(2,'0')));card.append(thumb);
      const top = h('span', 'mb-card-top'); top.append(h('small', '', ARENAS[op.arena].name), h('i', `mb-pill skill-${op.skill}`, skill.label));
      card.append(top, h('strong', '', op.name), h('em', '', op.tag));
      card.append(h('span', 'mb-card-rec', rec?.played ? `${rec.wins} WON · ${rec.played} PLAYED · BEST ${rec.bestScore.toLocaleString()}` : selected ? 'SELECTED OPERATION' : 'READY TO DEPLOY'));
      card.addEventListener('click', () => this.pickOp(op.id)); list.append(card);
    }
    return list;
  }
  opDetail(op, record) {
    const panel = h('section', 'mb-detail'); panel.dataset.arena = op.arena;
    const art=h('div','mb-art');art.setAttribute('aria-hidden','true');
    const skyline=h('i','mb-skyline');skyline.style.backgroundImage=this.arenaArt(op.arena);
    const meta=h('div','mb-art-meta');meta.append(h('b','','FIELD INTELLIGENCE'),h('span','',`OP / ${String(OPERATIONS.indexOf(op)+1).padStart(2,'0')}`));
    const caption=h('div','mb-art-caption');caption.append(h('small','','BATTLEFIELD'),h('strong','',ARENAS[op.arena].name),h('span','',op.arena==='city'?'MERIDIAN / URBAN COMBAT ZONE':'EDEN / FOREST SANCTUARY'));
    art.append(skyline,meta,caption);
    const stats=h('div','mb-operation-stats');
    for(const [value,label] of [[`${op.size} vs ${op.size}`,'SQUAD SIZE'],[`${op.limit}`,op.mode==='control'?'POINTS TO WIN':'ELIMINATIONS'],[`${Math.floor(op.time/60)} min`,'TIME LIMIT']]){const stat=h('div');stat.append(h('strong','',value),h('small','',label));stats.append(stat)}
    const rules = h('dl', 'mb-rules');
    const rows = [['OBJECTIVE', op.mode === 'control' ? `First to ${op.limit} points. Kills and holding the beacon both score.` : `First to ${op.limit} eliminations.`], ['RESPAWN', 'Downed pilots redeploy after a few seconds'], ['FRIENDLY FIRE', 'Off']];
    for (const [k, v] of rows) { const row = h('div'); row.append(h('dt', '', k), h('dd', '', v)); rules.append(row); }
    panel.append(art,stats,h('span','mb-detail-mode',MODE_NAME[op.mode]), h('h3', '', op.name), h('p', 'mb-blurb', op.blurb), rules);
    if (record?.played) panel.append(h('p', 'mb-record', `Your record: ${record.wins} won of ${record.played} · best kills ${record.bestKills} · best score ${record.bestScore.toLocaleString()}`));
    return panel;
  }
  setupPanel(op) {
    const panel = h('section', 'mb-setup'), me = TEAMS[this.sel.team], foe = TEAMS[otherTeam(this.sel.team)], roster = rosterFor(op, this.sel.team);
    const setupHead=h('div','mb-setup-head');setupHead.append(h('span','','DEPLOYMENT SETUP'),h('small','','01 / 02'));panel.append(setupHead,h('h4', '', '01 / CHOOSE YOUR SIDE'));
    const teams = h('div', 'mb-teams'); teams.setAttribute('role', 'radiogroup'); teams.setAttribute('aria-label', 'Choose your team');
    for (const t of Object.values(TEAMS)) {
      const b = h('button', 'mb-team'); b.type = 'button'; b.dataset.key = `team-${t.id}`; b.dataset.team = t.id; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(t.id === this.sel.team)); b.classList.toggle('is-selected', t.id === this.sel.team);
      b.style.setProperty('--team', t.color); b.append(h('i','mb-team-mark',t.id==='blue'?'◇':'⌁'),h('b', '', t.name), h('small', '', t.id === 'blue' ? 'Hold lines · trade range' : 'Push forward · no ground given'));
      b.addEventListener('click', () => this.pickTeam(t.id)); teams.append(b);
    }
    panel.append(teams, h('p', 'mb-team-blurb', me.blurb));
    panel.append(h('h4', '', '02 / OPPOSITION SKILL'));
    const skills = h('div', 'mb-skills'); skills.setAttribute('role', 'radiogroup'); skills.setAttribute('aria-label', 'Opposition skill');
    for (const id of SKILL_ORDER) {
      const k = SKILLS[id], b = h('button', `mb-skill skill-${id}`); b.type = 'button'; b.dataset.key = `skill-${id}`; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(id === this.sel.skill)); b.classList.toggle('is-selected', id === this.sel.skill);
      b.append(h('b', '', k.label), h('small', '', `×${k.reward.toFixed(1)} credits`)); b.title = k.blurb; b.addEventListener('click', () => this.pickSkill(id)); skills.append(b);
    }
    panel.append(skills, h('p', 'mb-skill-blurb', skillById(this.sel.skill).blurb));
    panel.append(this.squads(roster, me, foe));
    const pay = payoutFor({ ...op, skill: this.sel.skill }, { won: true, kills: Math.round(op.limit / op.size) });
    const deploy = h('button', 'mb-deploy'); deploy.type = 'button'; deploy.dataset.key = 'deploy';
    deploy.append(h('span', '', `DEPLOY AS ${me.name}`), h('small', '', `A win pays about ${pay} credits`));
    deploy.addEventListener('click', () => this.api.deploy({ ...this.sel }));
    panel.append(deploy,h('p','mb-ready-note','AI squadmates · No friendly fire · Automatic redeploy')); return panel;
  }
  squads(roster, me, foe) {
    const wrap = h('div', 'mb-squads');
    const column = (team, entries, you) => {
      const col = h('div', 'mb-squad'); col.style.setProperty('--team', team.color); col.append(h('b', '', team.name));
      const list = h('ul'); if (you) {const pilot=h('li','is-you');pilot.append(h('i','mb-pilot-mark','◆'),h('span','','YOU'),h('small','','PILOT'));list.append(pilot)} for (const e of entries) { const li = h('li'); li.append(h('i',`mb-pilot-mark role-${e.type}`,e.type==='striker'?'╱':e.type==='sniper'?'⊕':e.type==='bulwark'?'▣':'Ⅱ'),h('span', '', e.callsign), h('small', '', TYPE_NAME[e.type] || e.type.toUpperCase())); list.append(li); }
      col.append(list); return col;
    };
    wrap.append(column(me, roster.allies, true), column(foe, roster.foes, false)); return wrap;
  }

  // ---- Campaign -------------------------------------------------------------------------------------------------
  campaignBody(s) {
    const body = h('div', 'mb-body mb-campaign'), reachable = Math.max(s.unlocked, s.current >= 0 ? Math.min(2, s.current) : 0);
    s.chapters.forEach((chapter, index) => {
      const locked = index === 3 ? !s.completed : index > reachable, best = index === 3 ? (s.gauntlet?.score > 0 ? { score: s.gauntlet.score, wave: s.gauntlet.wave } : null) : s.bests?.[index];
      const card = h('button', 'mb-chapter'); card.type = 'button'; card.dataset.key = `chapter-${index}`; card.style.setProperty('--accent', chapter.accent); card.disabled = locked; card.classList.toggle('is-locked', locked);
      card.append(h('small', '', `${chapter.number} / ${chapter.tag.toUpperCase()}`), h('strong', '', chapter.name), h('p', '', chapter.copy));
      const meta = h('span', 'mb-chapter-meta');
      meta.append(h('b', '', locked ? (index === 3 ? 'FINISH THE CAMPAIGN TO UNLOCK' : 'LOCKED') : best ? (index === 3 ? `BEST · WAVE ${best.wave}` : `RANK ${best.rank}`) : 'NOT PLAYED'), h('i', '', best?.score ? best.score.toLocaleString() : ''));
      card.append(meta, h('em', '', chapter.objective));
      card.addEventListener('click', () => { this.api.chapter(index); this.close(); }); body.append(card);
    });
    return body;
  }
}
