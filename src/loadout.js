// The Field Refit screen: pick parts for every slot, preview the mech turning on a service pad, and fit the result.
// The screen shares one small WebGL stage with the Gear Shop (mech-stage.js) and never touches game state:
// it reports through onFit / onLivery / onShop / onClose and the game decides when a build takes effect.
// Parts the pilot does not own can be tried on and are marked locked with their price; fitting leaves them out.
import { MechStage } from './mech-stage.js';
import { SLOTS, PART_SLOTS, LOOK_SLOTS, PRESETS, DEFAULT_BUILD, partsFor, partById, resolveBuild, sanitizeBuild, sameBuild, sameGear, buildName, randomBuild, computeStats, gameplayMods, partBars, statDeltas, describeFire, ownedPart, ownedBuild, lockedSlots, GEAR_SLOTS } from './parts.js';
import { PAINTS, LIGHTS, liveryFor, paintById, lightsById } from './livery.js';
import { paintItemId, lightsItemId } from './shop-items.js';

const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const MODE_TEXT = {
  pad: ['ON THE LAUNCH PAD', 'Fits as soon as you confirm.'],
  field: ['NO HOSTILES CLOSE', 'Fits as soon as you confirm.'],
  combat: ['UNDER FIRE', 'Hostiles are close, so it fits on your next spawn.'],
};
// Where the preview camera sits for each slot: azimuth (0 = behind the mech, PI = in front), height and distance.
export const FOCUS = {
  head: { az: 2.7, y: 3.0, dist: 5.4 }, legs: { az: 2.55, y: 1.3, dist: 7.4 }, torso: { az: 2.75, y: 2.2, dist: 7 }, back: { az: .45, y: 2.3, dist: 7 },
  rArm: { az: 1.95, y: 2.1, dist: 7 }, lArm: { az: -1.95, y: 2.1, dist: 7 }, rShoulder: { az: 2.2, y: 2.6, dist: 6.4 }, lShoulder: { az: -2.2, y: 2.6, dist: 6.4 },
  builds: { az: 2.7, y: 2.0, dist: 8.6 }, livery: { az: 2.5, y: 2.0, dist: 8.6 },
};
const CALL_W = 172;
const CALLOUT_ORDER = ['head', 'rShoulder', 'lShoulder', 'torso', 'rArm', 'lArm', 'back', 'legs'];
const STAT_ROWS = [['mass', 'MASS', ' t'], ['armour', 'ARMOUR', ''], ['dps', 'FIREPOWER', '/s']];
const SHOWS_FLAMES = new Set(['back', 'livery']);

export class LoadoutScreen {
  constructor({ root, reducedMotion = false, onFit = () => {}, onLivery = () => {}, onShop = () => {}, onClose = () => {} }) {
    Object.assign(this, { root, reducedMotion, onFit, onLivery, onShop, onClose });
    this.slot = 'rArm'; this.draft = { ...DEFAULT_BUILD }; this.fitted = { ...DEFAULT_BUILD }; this.paint = 'cobalt'; this.lights = 'auto'; this.mode = 'pad';
    this.owned = new Set(); this.credits = 0; this.preview = { paint: null, lights: null }; this.isOpen = false;
    this.renderMarkup();
    this.keydown = event => this.onKey(event);
  }

  // ---- Markup -----------------------------------------------------------------------------------------------
  renderMarkup() {
    this.root.innerHTML = `
      <div class="ld-shell">
        <header class="ld-head">
          <div class="ld-title"><span class="ld-kicker">KESSLER HEAVY INDUSTRIES · SERVICE BAY</span><h2 id="ld-title">Field Refit</h2></div>
          <div class="ld-mode" id="ld-mode"><b></b><span></span></div>
          <button class="ld-btn ld-shopbtn" type="button" data-act="shop" aria-label="Open the Gear Shop"><span class="ld-shop-label">GEAR SHOP</span><b id="ld-credits">0 CR</b><kbd>S</kbd></button>
          <button class="ld-close" type="button" data-act="close" aria-label="Close the refit bay without fitting">ESC · BACK</button>
        </header>
        <nav class="ld-slots" id="ld-slots" aria-label="Mech slots">${SLOTS.map(s => `<button type="button" class="ld-slot" data-slot="${s.id}"><kbd>${s.key}</kbd><span class="ld-slot-name">${s.label}</span><span class="ld-slot-part"></span></button>`).join('')}</nav>
        <section class="ld-stage" id="ld-stage" aria-label="Mech preview">
          <div class="ld-calls" id="ld-calls"><svg class="ld-lines" aria-hidden="true"></svg>${CALLOUT_ORDER.map(id => { const s = SLOTS.find(x => x.id === id); return `<button type="button" class="ld-call" data-slot="${id}" tabindex="-1"><b>${s.label}${s.fires ? ' · ' + s.fires : ''}</b><span></span></button>`; }).join('')}</div>
          <div class="ld-stage-tag"><b id="ld-build-name"></b><span id="ld-build-note"></span></div>
          <div class="ld-stage-hint">DRAG TO TURN · SCROLL TO ZOOM</div>
        </section>
        <section class="ld-panel" aria-live="polite">
          <div class="ld-panel-head"><h3 id="ld-panel-title"></h3><span id="ld-panel-sub"></span></div>
          <div class="ld-list" id="ld-list" role="listbox" tabindex="0" aria-label="Parts"></div>
          <div class="ld-detail" id="ld-detail"></div>
        </section>
        <footer class="ld-foot">
          <div class="ld-totals" id="ld-totals"></div>
          <div class="ld-fire" id="ld-fire"></div>
          <div class="ld-actions">
            <span class="ld-lock-note" id="ld-lock-note" hidden></span>
            <button type="button" class="ld-btn" data-act="random">RANDOM <kbd>R</kbd></button>
            <button type="button" class="ld-btn" data-act="reset">FACTORY <kbd>F</kbd></button>
            <button type="button" class="ld-btn primary" data-act="fit" id="ld-fit">FIT LOADOUT <kbd>ENTER</kbd></button>
          </div>
        </footer>
      </div>`;
    const q = id => this.root.querySelector(id);
    Object.assign(this, { slotsEl: q('#ld-slots'), listEl: q('#ld-list'), detailEl: q('#ld-detail'), totalsEl: q('#ld-totals'), fireEl: q('#ld-fire'), stageEl: q('#ld-stage'), fitButton: q('#ld-fit'), callsEl: q('#ld-calls'), lockNote: q('#ld-lock-note') });
    this.lines = [...this.callsEl.querySelectorAll('.ld-call')].map(chip => { const line = document.createElementNS('http://www.w3.org/2000/svg', 'g'); line.innerHTML = '<line></line><circle r="3.5"></circle>'; this.callsEl.querySelector('svg').appendChild(line); return { chip, line, slot: chip.dataset.slot }; });
    this.root.addEventListener('click', event => {
      const hit = key => event.target.closest(`[data-${key}]`)?.dataset[key];
      const act = hit('act'), slot = hit('slot'), part = hit('part'), preset = hit('preset'), paint = hit('paint'), lights = hit('lights'), decal = hit('decal'), trail = hit('trail');
      if (act) this.act(act); else if (slot) this.selectSlot(slot); else if (part) this.choose(part); else if (preset) this.loadPreset(preset);
      else if (paint) this.pickPaint(paint); else if (lights) this.pickLights(lights); else if (decal) this.chooseLook('decal', decal); else if (trail) this.chooseLook('trail', trail);
    });
  }

  // ---- Lifecycle --------------------------------------------------------------------------------------------
  // build is the fitted build; draft (optional) carries unfitted changes in from another screen. owned is the set of item ids.
  open({ build, draft, mode = 'pad', paint = 'cobalt', lights = 'auto', owned = [], credits = 0 }) {
    this.fitted = sanitizeBuild(build); this.draft = draft ? sanitizeBuild(draft) : { ...this.fitted }; this.mode = mode; this.paint = paint; this.lights = lights;
    this.owned = owned instanceof Set ? owned : new Set(owned); this.credits = credits; this.preview = { paint: null, lights: null };
    this.previousFocus = document.activeElement; this.isOpen = true;
    this.root.classList.remove('hidden');
    this.stage = MechStage.shared(this.reducedMotion); this.stage.reducedMotion = this.reducedMotion;
    this.hasGL = this.stage.mount(this.stageEl); this.stage.onThumb = (key, url) => this.root.querySelectorAll(`img[data-thumb="${key}"]`).forEach(img => { img.src = url; });
    this.selectSlot(this.slot, true); this.refreshAll(); this.rebuildMech(); this.warmThumbs();
    addEventListener('keydown', this.keydown, true);
    this.last = performance.now(); this.frame = requestAnimationFrame(t => this.tick(t));
    this.listEl.focus({ preventScroll: true });
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false; removeEventListener('keydown', this.keydown, true); cancelAnimationFrame(this.frame);
    this.stage?.unmount(); this.root.classList.add('hidden');
    try { this.previousFocus?.focus?.({ preventScroll: true }); } catch { /* the opener may be gone */ }
  }
  get dirty() { return !sameBuild(this.draft, this.fitted); }
  isOwned(slot, partId) { return ownedPart(slot, partById(slot, partId), this.owned); }
  lockedNow() { return lockedSlots(this.draft, this.owned); }

  // ---- Actions ----------------------------------------------------------------------------------------------
  act(name) {
    if (name === 'close') this.onClose();
    else if (name === 'fit') this.fit();
    else if (name === 'shop') this.openShop();
    else if (name === 'random') this.setDraft({ ...randomBuild(Math.random, this.owned) });
    else if (name === 'reset') this.setDraft({ ...DEFAULT_BUILD });
  }
  // Fitting keeps owned parts and returns every locked slot to its factory part.
  fit() {
    const left = this.lockedNow().length, build = ownedBuild(this.draft, this.owned);
    this.draft = build; this.fitted = { ...build }; this.onFit({ ...build }); this.refreshAll();
    this.flash(left ? `FITTED · ${left} LOCKED PART${left > 1 ? 'S' : ''} LEFT OUT` : this.mode === 'combat' ? 'FITTED FOR YOUR NEXT SPAWN' : 'LOADOUT FITTED');
    this.onClose();
  }
  // Hands over to the shop, carrying the current slot and any unfitted draft with it.
  openShop() {
    const partId = PART_SLOTS.includes(this.slot) ? this.draft[this.slot] : null;
    this.onShop({ slot: this.slot, partId, draft: { ...this.draft }, paint: this.preview.paint, lights: this.preview.lights });
  }
  flash(text) { const el = this.root.querySelector('#ld-build-note'); el.textContent = text; }
  setDraft(build) { this.draft = sanitizeBuild(build); this.refreshAll(); this.rebuildMech(); }
  choose(partId) {
    if (!PART_SLOTS.includes(this.slot) || this.draft[this.slot] === partId) return;
    this.draft = { ...this.draft, [this.slot]: partId }; this.refreshAll(); this.rebuildMech();
  }
  chooseLook(slot, id) { if (this.draft[slot] === id) return; this.draft = { ...this.draft, [slot]: id }; this.refreshAll(); this.rebuildMech(); }
  // Presets set the gear only: the head, decal and boost trail you picked stay on.
  loadPreset(id) { const preset = PRESETS.find(p => p.id === id); if (preset) this.setDraft({ ...this.draft, ...Object.fromEntries(GEAR_SLOTS.map(s => [s, preset.build[s]])) }); }
  // An owned paint is applied and saved at once; a locked one is only shown on the mech until you buy it.
  pickPaint(id) {
    if (this.owned.has(paintItemId(id)) || paintById(id).price === 0) { this.preview.paint = null; this.setLivery(id, this.lights); } else { this.preview.paint = id; this.afterLivery(); }
  }
  pickLights(id) {
    if (this.owned.has(lightsItemId(id)) || lightsById(id).price === 0) { this.preview.lights = null; this.setLivery(this.paint, id); } else { this.preview.lights = id; this.afterLivery(); }
  }
  setLivery(paint, lights) { this.paint = paint; this.lights = lights; this.onLivery(paint, lights); this.afterLivery(); }
  afterLivery() { this.applyLivery(); this.refreshList(); this.refreshSlotTabs(); this.refreshFoot(); }
  shownLivery() { return { paint: this.preview.paint || this.paint, lights: this.preview.lights || this.lights }; }
  selectSlot(slot, silent = false) {
    if (!SLOTS.some(s => s.id === slot)) return;
    this.slot = slot; this.stage?.frame(FOCUS[slot]); if (this.stage) this.stage.pose = SHOWS_FLAMES.has(slot) ? { boost: true } : {};
    if (!silent) this.refreshAll();
  }
  onKey(event) {
    if (!this.isOpen) return;
    const key = event.key, ids = SLOTS.map(s => s.id), index = ids.indexOf(this.slot);
    const eat = () => { event.preventDefault(); event.stopPropagation(); };
    if (key === 'Escape') { eat(); this.onClose(); }
    else if (key === 'Enter' && !event.target.closest?.('button[data-act]')) { eat(); this.fit(); }
    else if (/^[0-9]$/.test(key)) { eat(); this.selectSlot(ids[(Number(key) + 9) % 10]); }
    else if (key === 'f' || key === 'F') { eat(); this.act('reset'); }
    else if (key === 'r' || key === 'R') { eat(); this.act('random'); }
    else if (key === 's' || key === 'S') { eat(); this.openShop(); }
    else if (key === 'ArrowLeft' || key === 'ArrowRight') { eat(); this.selectSlot(ids[(index + (key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length]); }
    else if (key === 'ArrowDown' || key === 'ArrowUp') { eat(); this.step(key === 'ArrowDown' ? 1 : -1); }
    else if (key === 'Tab') { /* native focus order */ }
    else event.stopPropagation(); // nothing under the screen should react to a key pressed here
  }
  // Up and down walk the part list (or presets, or paints), applying each as you go so the preview follows.
  step(direction) {
    if (this.slot === 'builds') { const i = PRESETS.findIndex(p => sameGear(p.build, this.draft)); this.loadPreset(PRESETS[(Math.max(0, i) + direction + PRESETS.length) % PRESETS.length].id); return; }
    if (this.slot === 'livery') { const now = this.shownLivery().paint, i = PAINTS.findIndex(p => p.id === now); this.pickPaint(PAINTS[(i + direction + PAINTS.length) % PAINTS.length].id); return; }
    const pool = partsFor(this.slot), i = pool.findIndex(p => p.id === this.draft[this.slot]);
    this.choose(pool[(i + direction + pool.length) % pool.length].id);
  }

  // ---- Rendering of the panels --------------------------------------------------------------------------------
  refreshAll() { this.refreshHead(); this.refreshSlotTabs(); this.refreshList(); this.refreshTotals(); this.refreshFoot(); }
  refreshHead() {
    const [title, note] = MODE_TEXT[this.mode] || MODE_TEXT.pad, mode = this.root.querySelector('#ld-mode');
    mode.dataset.mode = this.mode; mode.querySelector('b').textContent = title; mode.querySelector('span').textContent = note;
    this.root.querySelector('#ld-build-name').textContent = buildName(this.draft);
    this.root.querySelector('#ld-build-note').textContent = this.dirty ? 'UNFITTED CHANGES' : 'FITTED';
    this.root.querySelector('#ld-credits').textContent = `${this.credits.toLocaleString('en-US')} CR`;
  }
  // The Fit button and the note beside it say what will really be fitted when some parts are locked.
  refreshFoot() {
    const left = this.lockedNow().length;
    this.fitButton.classList.toggle('pulse', this.dirty);
    this.fitButton.firstChild.textContent = left ? 'FIT OWNED PARTS ' : this.mode === 'combat' ? 'FIT FOR NEXT SPAWN ' : 'FIT LOADOUT ';
    this.lockNote.hidden = !left; this.lockNote.textContent = left ? `${left} LOCKED PART${left > 1 ? 'S' : ''} WON'T FIT · SEE GEAR SHOP` : '';
  }
  refreshSlotTabs() {
    const parts = resolveBuild(this.draft);
    this.slotsEl.querySelectorAll('.ld-slot').forEach(el => {
      const id = el.dataset.slot, on = id === this.slot, locked = parts[id] && !this.isOwned(id, parts[id].id);
      el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); el.classList.toggle('locked', !!locked);
      el.querySelector('.ld-slot-part').textContent = parts[id] ? parts[id].name : id === 'builds' ? buildName(this.draft) : paintById(this.shownLivery().paint).name;
      el.classList.toggle('changed', !!parts[id] && parts[id].id !== partById(id, this.fitted[id])?.id);
    });
    for (const { chip, slot } of this.lines) { chip.querySelector('span').textContent = parts[slot].name; chip.classList.toggle('on', slot === this.slot); chip.classList.toggle('locked', !this.isOwned(slot, parts[slot].id)); chip.classList.toggle('empty', !parts[slot].fire && ['rArm', 'lArm', 'rShoulder', 'lShoulder'].includes(slot)); }
  }
  priceChip(part) { return `<span class="ld-price" title="Not owned. Buy it in the Gear Shop"><i class="ld-lock" aria-hidden="true"></i><span class="sr">LOCKED, </span>${part.price} CR</span>`; }
  refreshList() {
    const slot = this.slot, meta = SLOTS.find(s => s.id === slot);
    this.root.querySelector('#ld-panel-title').textContent = slot === 'builds' ? 'Ready-made builds' : meta.title;
    this.root.querySelector('#ld-panel-sub').textContent = meta.fires ? `FIRES ON ${meta.fires}` : slot === 'builds' ? 'READY-MADE LOADOUTS' : slot === 'livery' ? 'PAINT · LIGHTS · DECAL · TRAIL' : slot === 'head' ? 'MOSTLY LOOKS' : 'CHASSIS';
    if (slot === 'builds') return this.renderPresets();
    if (slot === 'livery') return this.renderLivery();
    const pool = partsFor(slot), current = this.draft[slot], baseline = computeStats(this.draft);
    this.listEl.innerHTML = pool.map(part => {
      const bars = partBars(slot, part), on = part.id === current, locked = !this.isOwned(slot, part.id);
      const after = computeStats({ ...this.draft, [slot]: part.id }), d = statDeltas(baseline, after);
      const spec = { kind: 'part', slot, id: part.id }, key = this.stage?.thumbKey(spec) || '', src = part.model === 'none' ? null : this.stage?.thumb(spec, true);
      return `<div class="ld-part${on ? ' on' : ''}${locked ? ' locked' : ''}" role="option" aria-selected="${on}" data-part="${part.id}">
        ${part.model === 'none' ? '<div class="ld-thumb empty" aria-hidden="true"><i></i></div>' : `<img class="ld-thumb" alt="" data-thumb="${key}"${src ? ` src="${src}"` : ''}>`}
        <div class="ld-part-body">
        <div class="ld-part-top"><b>${esc(part.name)}</b>${part.id === this.fitted[slot] ? '<span class="ld-fitted">FITTED</span>' : locked ? this.priceChip(part) : ''}<em class="ld-tag">${esc(part.tag)}</em></div>
        <div class="ld-part-sub">${esc(part.maker)} · ${esc(part.role)}</div>
        <div class="ld-bars">${bars.map(bar => `<span class="ld-bar${bar.better === 'low' ? ' low' : ''}" title="${bar.label}"><i>${bar.label}</i><u><s style="width:${Math.max(4, Math.round(bar.value / (bar.max || 1) * 100))}%"></s></u><b>${bar.value}${bar.unit}</b></span>`).join('')}</div>
        ${on ? '' : `<div class="ld-deltas">${STAT_ROWS.map(([key, label, unit]) => { const x = d[key]; return x.delta ? `<span class="${x.good ? 'good' : 'bad'}">${label} ${x.delta > 0 ? '+' : ''}${x.delta}${unit}</span>` : ''; }).join('')}</div>`}
        </div>
      </div>`;
    }).join('');
    const part = partById(slot, current);
    this.detailEl.innerHTML = this.detailHtml(part.name, part.blurb, !this.isOwned(slot, part.id) && part);
    const on = this.listEl.querySelector('.ld-part.on');
    if (on) { const list = this.listEl.getBoundingClientRect(), item = on.getBoundingClientRect(); if (item.top < list.top) this.listEl.scrollTop -= list.top - item.top + 8; else if (item.bottom > list.bottom) this.listEl.scrollTop += item.bottom - list.bottom + 8; }
  }
  // Detail text; for a locked item it says so and offers a shortcut into the shop.
  detailHtml(name, blurb, locked) {
    return `<h4>${esc(name)}</h4><p>${esc(blurb)}</p>${locked ? `<div class="ld-getit"><span><i class="ld-lock" aria-hidden="true"></i>NOT OWNED · ${locked.price} CR</span><button type="button" class="ld-btn small" data-act="shop">GET IN SHOP</button></div>` : ''}`;
  }
  renderPresets() {
    this.listEl.innerHTML = PRESETS.map(p => {
      const on = sameGear(p.build, this.draft), stats = computeStats(p.build), parts = resolveBuild(p.build), locked = lockedSlots(p.build, this.owned).filter(s => GEAR_SLOTS.includes(s));
      return `<div class="ld-part${on ? ' on' : ''}" role="option" aria-selected="${on}" data-preset="${p.id}">
        <div class="ld-part-top"><b>${esc(p.name)}</b><em class="ld-tag">${stats.mass} t · ${stats.armour} ARMOUR</em></div>
        <div class="ld-part-sub">${esc(p.blurb)}</div>
        <div class="ld-preset-parts">${['lArm', 'rArm', 'rShoulder', 'lShoulder'].filter(s => parts[s].fire).map(s => `<span>${esc(parts[s].name)}</span>`).join('')}</div>
        ${locked.length ? `<div class="ld-preset-lock"><i class="ld-lock" aria-hidden="true"></i>${locked.length} PART${locked.length > 1 ? 'S' : ''} LOCKED · ${locked.reduce((sum, s) => sum + partById(s, p.build[s]).price, 0)} CR TO COMPLETE</div>` : ''}
      </div>`;
    }).join('');
    this.detailEl.innerHTML = '<h4>Ready-made builds</h4><p>Pick one as a starting point, then change any part. Parts you do not own can be tried on but will not fit until you buy them. Nothing is fitted until you press Enter.</p>';
  }
  renderLivery() {
    const now = this.shownLivery(), draft = this.draft;
    const mark = (price, owned) => (!owned && price ? `<small class="ld-chip-price"><i class="ld-lock" aria-hidden="true"></i><span class="sr">LOCKED, </span>${price} CR</small>` : '');
    const swatch = p => { const own = p.price === 0 || this.owned.has(paintItemId(p.id)); return `<button type="button" class="ld-swatch${p.id === now.paint ? ' on' : ''}${own ? '' : ' locked'}" data-paint="${p.id}" aria-pressed="${p.id === now.paint}" title="${p.name}"><i style="--c:${p.paint};--a:${p.armor};--g:${p.glow}"></i><span>${p.name}</span>${mark(p.price, own)}</button>`; };
    const light = l => { const own = l.price === 0 || this.owned.has(lightsItemId(l.id)), c = l.glow || paintById(now.paint).glow; return `<button type="button" class="ld-light${l.id === now.lights ? ' on' : ''}${own ? '' : ' locked'}" data-lights="${l.id}" aria-pressed="${l.id === now.lights}"><i style="--c:${c}"></i>${l.name}${mark(l.price, own)}</button>`; };
    const look = (slot, attr) => partsFor(slot).map(p => { const own = this.isOwned(slot, p.id), on = draft[slot] === p.id; return `<button type="button" class="ld-light${on ? ' on' : ''}${own ? '' : ' locked'}" data-${attr}="${p.id}" aria-pressed="${on}"><i style="--c:${p.color || '#8fa7b0'}"></i>${esc(p.name)}${mark(p.price, own)}</button>`; }).join('');
    this.listEl.innerHTML = `<div class="ld-livery"><h5>PAINT</h5><div class="ld-swatches">${PAINTS.map(swatch).join('')}</div><h5>LIGHTS</h5><div class="ld-lights">${LIGHTS.map(light).join('')}</div><h5>DECAL</h5><div class="ld-lights">${look('decal', 'decal')}</div><h5>BOOST TRAIL</h5><div class="ld-lights">${look('trail', 'trail')}</div></div>`;
    const lockedPaint = now.paint !== this.paint ? paintById(now.paint) : null, lockedLights = now.lights !== this.lights ? lightsById(now.lights) : null, lockedDecal = !this.isOwned('decal', draft.decal) && partById('decal', draft.decal), lockedTrail = !this.isOwned('trail', draft.trail) && partById('trail', draft.trail);
    const first = [lockedPaint && { name: lockedPaint.name, price: lockedPaint.price }, lockedLights && { name: lockedLights.name, price: lockedLights.price }, lockedDecal, lockedTrail].find(Boolean);
    this.detailEl.innerHTML = first ? `<h4>${esc(first.name)} · trying on</h4><p>Not owned yet. It shows on the mech, but only owned colours and decals are saved and fitted.</p><div class="ld-getit"><span><i class="ld-lock" aria-hidden="true"></i>NOT OWNED · ${first.price} CR</span><button type="button" class="ld-btn small" data-act="shop">GET IN SHOP</button></div>` : '<h4>Paint, lights, decal and trail</h4><p>Paint colours the hull and plates. Lights colour the visor and thrusters. Decals mark the shoulders and chest, and the trail colours your boost flame. Paint and lights save at once; the rest fit with the build.</p>';
  }
  refreshTotals() {
    const now = computeStats(this.draft), base = computeStats(this.fitted), d = statDeltas(base, now), mods = gameplayMods(this.draft);
    this.totalsEl.innerHTML = [
      ...STAT_ROWS.map(([key, label, unit]) => `<div><span>${label}</span><b>${now[key]}${unit}</b>${d[key].delta ? `<em class="${d[key].good ? 'good' : 'bad'}">${d[key].delta > 0 ? '+' : ''}${d[key].delta}</em>` : ''}</div>`),
      `<div><span>SPEED</span><b>${Math.round(mods.speed * 100)}%</b></div>`, `<div><span>HEAT ROOM</span><b>${now.heatRoom}%</b></div>`, `<div><span>COOLING</span><b>${now.cooling}%</b></div>`,
    ].join('');
    this.fireEl.innerHTML = describeFire(this.draft).map(f => `<div><kbd>${f.key}</kbd><span>${esc(f.text)}</span></div>`).join('');
  }

  // ---- Preview ----------------------------------------------------------------------------------------------
  rebuildMech() {
    if (!this.stage?.renderer) return;
    const shown = this.shownLivery(); this.stage.paint = shown.paint; this.stage.lights = shown.lights; this.stage.setBuild(this.draft);
  }
  applyLivery() { const shown = this.shownLivery(); this.stage?.setLivery(shown.paint, shown.lights); }
  // Queues a thumbnail for every part so the lists are filled by the time you browse to them.
  warmThumbs() { if (!this.stage?.renderer) return; for (const slot of ['head', 'legs', 'torso', 'back', 'rArm', 'rShoulder']) for (const part of partsFor(slot)) if (part.model !== 'none') this.stage.thumb({ kind: 'part', slot, id: part.id }); }
  // Call-out chips follow their slot on the turning mech and stack down either side of the stage, with a leader line to the part.
  updateCalls() {
    const w = this.stageEl.clientWidth, h = this.stageEl.clientHeight, mech = this.stage?.mech, camera = this.stage?.camera, show = w >= 600 && !!mech;
    this.callsEl.classList.toggle('off', !show); if (!show) return;
    const L = mech.limbs, v = this._v ||= { project: null }, pts = {};
    const local = { head: [0, 3.0, 0], legs: [0, .9, 0], torso: [0, 2.3, -.1], back: [0, 2.45, .95], rShoulder: [.96, 3.2, .06], lShoulder: [-.96, 3.2, .06], rArm: [.85, 2.05, -.35], lArm: [-.85, 2.05, -.35] };
    const source = { head: L.head, rArm: L.rightGun, lArm: L.leftGun, rShoulder: L.rightShoulderPod, lShoulder: L.leftShoulderPod };
    const vec = this._vec ||= camera.position.clone();
    for (const { slot } of this.lines) {
      if (source[slot]) source[slot].getWorldPosition(vec); else vec.set(...local[slot]);
      vec.project(camera); pts[slot] = { x: (vec.x * .5 + .5) * w, y: (-vec.y * .5 + .5) * h };
    }
    const sides = { left: [], right: [] };
    for (const item of this.lines) (pts[item.slot].x < w / 2 ? sides.left : sides.right).push(item);
    for (const [side, items] of Object.entries(sides)) {
      items.sort((a, b) => pts[a.slot].y - pts[b.slot].y);
      let top = 66; for (const item of items) { top = Math.max(pts[item.slot].y - 24, top); item.top = top; top += 56; }
      let limit = h - 62; for (let i = items.length - 1; i >= 0; i--) { items[i].top = Math.min(items[i].top, limit); limit = items[i].top - 56; }
      const x = side === 'left' ? 12 : w - 12 - CALL_W, edge = side === 'left' ? x + CALL_W : x;
      for (const item of items) {
        const p = pts[item.slot], [line, dot] = [item.line.firstChild, item.line.lastChild];
        item.chip.style.transform = `translate(${x}px, ${item.top}px)`;
        line.setAttribute('x1', edge); line.setAttribute('y1', item.top + 24); line.setAttribute('x2', p.x); line.setAttribute('y2', p.y);
        dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y); item.line.classList.toggle('on', item.slot === this.slot);
      }
    }
  }
  tick(now) {
    if (!this.isOpen) return;
    this.frame = requestAnimationFrame(t => this.tick(t));
    if (!this.stage?.renderer) return;
    this.stage.update(now); this.updateCalls();
  }
}
