// The Gear Shop: browse every part and cosmetic by category, try it on the turning mech, buy it with credits and equip it.
// Like the Field Refit screen it shares the mech stage (mech-stage.js) and never touches game state: it changes the profile's
// wallet through profile.js (purchase) and reports every change through callbacks, so the game decides what to save and apply.
import { MechStage } from './mech-stage.js';
import { CATEGORIES, categoryById, itemsIn, itemById, itemFor, TIERS } from './shop-items.js';
import { DEFAULT_BUILD, sanitizeBuild, partById, partBars, computeStats, gameplayMods, statDeltas, itemGroup } from './parts.js';
import { paintById, lightsById } from './livery.js';
import { ownsItem, canAfford, purchase } from './profile.js';
import { FOCUS } from './loadout.js';

const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = n => Math.round(n).toLocaleString('en-US');
const MODE_TEXT = { pad: 'Equipping fits at once.', field: 'Equipping fits at once.', combat: 'Under fire: gear fits on your next spawn.' };
// Camera framing per category (the arm and shoulder shots follow the side you are shopping for).
const SHOP_FOCUS = { head: FOCUS.head, legs: FOCUS.legs, back: FOCUS.back, torso: FOCUS.torso, paint: FOCUS.livery, decal: { az: 2.75, y: 2.45, dist: 5.8 }, trail: { az: .5, y: 2.1, dist: 6.6 } };
const CONFIRM_FROM = 400; // purchases at or above this price ask for a second press
const SIDES = { arm: [['rArm', 'R ARM'], ['lArm', 'L ARM']], shoulder: [['rShoulder', 'R SHOULDER'], ['lShoulder', 'L SHOULDER']] };
const STAT_ROWS = [['mass', 'MASS', ' t'], ['armour', 'ARMOUR', ''], ['dps', 'FIREPOWER', '/s']];
// The empty mounts have nothing to sell; the decal and trail defaults stay listed so they can be put back.
const listed = item => !(item.empty && ['arm', 'shoulder', 'back'].includes(item.group));

export class ShopScreen {
  constructor({ root, reducedMotion = false, onFit = () => {}, onLivery = () => {}, onPurchase = () => {}, onRefit = () => {}, onClose = () => {} }) {
    Object.assign(this, { root, reducedMotion, onFit, onLivery, onPurchase, onRefit, onClose });
    this.profile = null; this.draft = { ...DEFAULT_BUILD }; this.mode = 'pad'; this.category = 'head'; this.selectedId = null; this.showMine = false; this.armed = null;
    this.side = { arm: 'rArm', shoulder: 'rShoulder' }; this.isOpen = false; this.shownCredits = 0; this.previewLivery = null;
    this.renderMarkup(); this.keydown = event => this.onKey(event);
  }

  // ---- Markup -----------------------------------------------------------------------------------------------
  renderMarkup() {
    this.root.innerHTML = `
      <div class="sh-shell">
        <header class="sh-head">
          <div class="sh-title"><span class="sh-kicker">ASTER · KESSLER · VANTA · EDEN GUILD — SUPPLY COUNTER</span><h2 id="sh-title">Gear Shop</h2></div>
          <div class="sh-wallet" role="status" aria-live="polite"><span>CREDITS</span><b id="sh-credits">0</b></div>
          <button class="sh-btn" type="button" data-act="refit">FIELD REFIT <kbd>F</kbd></button>
          <button class="sh-close" type="button" data-act="close" aria-label="Close the Gear Shop">ESC · BACK</button>
        </header>
        <nav class="sh-tabs" id="sh-tabs" aria-label="Shop categories">${CATEGORIES.map((c, i) => `<button type="button" class="sh-tab" data-cat="${c.id}" aria-label="${c.title}" aria-pressed="false"><kbd>${i + 1}</kbd><span>${c.short}</span><i class="sh-tab-count"></i></button>`).join('')}</nav>
        <section class="sh-stage" id="sh-stage" aria-label="Mech preview">
          <div class="sh-stage-tag"><b id="sh-stage-name"></b><span id="sh-stage-note"></span></div>
          <button type="button" class="sh-mine" id="sh-mine" data-act="mine" aria-pressed="false">SHOW MY MECH <kbd>M</kbd></button>
          <div class="sh-stage-hint">DRAG TO TURN · SCROLL TO ZOOM</div>
          <div class="sh-info" id="sh-info"></div>
        </section>
        <section class="sh-panel">
          <div class="sh-panel-head"><h3 id="sh-cat-title"></h3><span id="sh-cat-note"></span></div>
          <div class="sh-grid" id="sh-grid" role="listbox" tabindex="0" aria-label="Items for sale"></div>
        </section>
        <footer class="sh-foot" id="sh-foot">
          <div class="sh-totals" id="sh-totals"></div>
          <div class="sh-keys"><span><kbd>1</kbd>-<kbd>9</kbd> CATEGORY</span><span><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> BROWSE</span><span><kbd>ENTER</kbd> BUY / EQUIP</span><span><kbd>A</kbd> SIDE</span><span><kbd>ESC</kbd> BACK</span></div>
          <div class="sh-toast" id="sh-toast" role="status" aria-live="polite"></div>
        </footer>
      </div>`;
    const q = id => this.root.querySelector(id);
    Object.assign(this, { tabsEl: q('#sh-tabs'), gridEl: q('#sh-grid'), infoEl: q('#sh-info'), stageEl: q('#sh-stage'), totalsEl: q('#sh-totals'), toastEl: q('#sh-toast'), footEl: q('#sh-foot'), walletEl: q('#sh-credits'), mineEl: q('#sh-mine') });
    this.root.addEventListener('click', event => {
      const hit = key => event.target.closest(`[data-${key}]`)?.dataset[key];
      const act = hit('act'), cat = hit('cat'), item = hit('item'), side = hit('side');
      if (act) this.act(act); else if (cat) this.setCategory(cat); else if (side) this.setSide(side); else if (item) { this.select(item); this.gridEl.focus({ preventScroll: true }); }
    });
    this.root.addEventListener('dblclick', event => { const id = event.target.closest('[data-item]')?.dataset.item; if (id) { this.select(id); this.primary(); } });
  }

  // ---- Lifecycle --------------------------------------------------------------------------------------------
  // opts: { profile, mode, slot, partId, paint, lights, draft } - slot/partId/paint/lights say what to put on show first.
  open({ profile, mode = 'pad', slot = null, partId = null, paint = null, lights = null, draft = null }) {
    this.profile = profile; this.mode = mode; this.draft = sanitizeBuild(draft || profile.build); this.showMine = false; this.armed = null; this.shownCredits = profile.credits;
    let wanted = null;
    if (slot && partId && itemFor(slot, partId)) wanted = itemFor(slot, partId);
    if (!wanted && paint && !ownsItem(profile, `paint:${paint}`)) wanted = itemById(`paint:${paint}`);
    if (!wanted && lights && !ownsItem(profile, `lights:${lights}`)) wanted = itemById(`lights:${lights}`);
    this.category = wanted?.category || (slot === 'livery' ? 'paint' : CATEGORIES.find(c => c.slots.includes(slot))?.id) || this.category;
    if (wanted && SIDES[wanted.group] && slot) this.side[wanted.group] = slot;
    this.selectedId = wanted && listed(wanted) ? wanted.id : this.firstItem()?.id ?? null;
    this.previousFocus = document.activeElement; this.isOpen = true; this.root.classList.remove('hidden');
    this.stage = MechStage.shared(this.reducedMotion); this.stage.reducedMotion = this.reducedMotion;
    this.hasGL = this.stage.mount(this.stageEl); this.stage.onThumb = (key, url) => this.root.querySelectorAll(`img[data-thumb="${key}"]`).forEach(img => { img.src = url; });
    this.refreshAll(); this.frameCamera(); this.rebuildStage(); this.warmThumbs();
    addEventListener('keydown', this.keydown, true);
    this.last = performance.now(); this.frame = requestAnimationFrame(t => this.tick(t));
    this.gridEl.focus({ preventScroll: true });
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false; removeEventListener('keydown', this.keydown, true); cancelAnimationFrame(this.frame); clearTimeout(this.armTimer); clearTimeout(this.toastTimer);
    this.stage?.unmount(); this.root.classList.add('hidden');
    try { this.previousFocus?.focus?.({ preventScroll: true }); } catch { /* the opener may be gone */ }
  }
  // The build the pilot is wearing right now (what the game has fitted), plus any carried-over try-ons.
  get fitted() { return sanitizeBuild(this.profile?.build); }

  // ---- Catalogue helpers --------------------------------------------------------------------------------------
  items() { // paint before lights, then cheapest first
    const rank = item => (item.group === 'lights' ? 1 : 0);
    return itemsIn(this.category).filter(listed).sort((a, b) => rank(a) - rank(b) || a.price - b.price || (a.group < b.group ? -1 : a.group > b.group ? 1 : 0));
  }
  firstItem() { return this.items()[0] || null; }
  selected() { return itemById(this.selectedId); }
  targetSlot(item) { return SIDES[item.group] ? this.side[item.group] : item.slot; }
  slotsOf(item) { return SIDES[item.group] ? SIDES[item.group].map(s => s[0]) : [item.slot]; }
  owns(item) { return ownsItem(this.profile, item.id); }
  isEquipped(item) {
    if (item.kind === 'paint') return this.profile.paint === item.ref;
    if (item.kind === 'lights') return this.profile.lights === item.ref;
    return this.slotsOf(item).some(slot => this.fitted[slot] === item.ref);
  }
  state(item) { return !this.owns(item) ? 'locked' : this.isEquipped(item) ? 'equipped' : 'owned'; }
  // What the stage shows: your build, with the selected part tried on unless "show my mech" is on.
  shownBuild() {
    const item = this.selected();
    return this.showMine || !item || item.kind !== 'part' ? { ...this.draft } : { ...this.draft, [this.targetSlot(item)]: item.ref };
  }
  shownLivery() {
    const item = this.selected(), base = { paint: this.profile.paint, lights: this.profile.lights };
    if (this.showMine || !item) return base;
    return item.kind === 'paint' ? { ...base, paint: item.ref } : item.kind === 'lights' ? { ...base, lights: item.ref } : base;
  }
  thumbSpec(item) { return item.kind === 'part' ? { kind: 'part', slot: item.slot, id: item.ref } : { kind: item.kind, id: item.ref }; }

  // ---- Actions ----------------------------------------------------------------------------------------------
  act(name) {
    if (name === 'close') this.onClose();
    else if (name === 'refit') this.onRefit({ draft: { ...this.draft }, category: this.category });
    else if (name === 'mine') this.toggleMine();
    else if (name === 'buy') this.buy();
    else if (name === 'equip') this.equip();
  }
  toggleMine() { this.showMine = !this.showMine; this.refreshInfo(); this.rebuildStage(); this.markSelection(); }
  setSide(slot) {
    const item = this.selected(); if (!item || !SIDES[item.group] || !this.slotsOf(item).includes(slot)) return;
    this.side[item.group] = slot; this.armed = null; this.frameCamera(); this.refreshInfo(); this.rebuildStage();
  }
  setCategory(id) {
    if (!categoryById(id)) return;
    this.category = id; this.armed = null; this.showMine = false; this.selectedId = this.firstItem()?.id ?? null;
    this.refreshAll(); this.frameCamera(); this.rebuildStage(); this.gridEl.scrollTop = 0;
  }
  select(id) {
    const item = itemById(id); if (!item || item.category !== this.category) return;
    this.selectedId = id; this.showMine = false; this.armed = null; clearTimeout(this.armTimer);
    this.markSelection(); this.refreshInfo(); this.frameCamera(); this.rebuildStage(); this.scrollToSelected();
  }
  // Moves the selection through the grid by `delta` places (or by whole rows with the up and down keys).
  move(delta) {
    const list = this.items(); if (!list.length) return;
    const i = Math.max(0, list.findIndex(it => it.id === this.selectedId)), next = Math.min(list.length - 1, Math.max(0, i + delta));
    this.select(list[next].id);
  }
  columns() { const cols = getComputedStyle(this.gridEl).gridTemplateColumns; return Math.max(1, cols.split(' ').filter(Boolean).length); }
  // Enter and double-click: buy it if it is for sale and affordable, equip it if you own it.
  primary() {
    const item = this.selected(); if (!item) return;
    if (!this.owns(item)) this.buy(); else if (!this.isEquipped(item)) this.equip();
  }
  buy() {
    const item = this.selected(); if (!item || this.owns(item)) return;
    if (!canAfford(this.profile, item.id)) { this.toast(`NEED ${fmt(item.price - this.profile.credits)} MORE CREDITS`, 'bad'); return; }
    if (item.price >= CONFIRM_FROM && this.armed !== item.id) { // a second press confirms the bigger purchases
      this.armed = item.id; clearTimeout(this.armTimer); this.armTimer = setTimeout(() => { this.armed = null; this.refreshInfo(); }, 4000); this.refreshInfo(); this.toast(`PRESS AGAIN TO BUY ${item.name} FOR ${fmt(item.price)} CR`, 'warn'); return;
    }
    const before = this.profile.credits, result = purchase(this.profile, item.id);
    if (!result.ok) { this.toast(result.message.toUpperCase(), 'bad'); return; }
    this.armed = null; clearTimeout(this.armTimer); this.onPurchase(result);
    this.toast(`PURCHASED · ${item.name} · −${fmt(item.price)} CR`, 'good');
    this.countTo(before, this.profile.credits); this.refreshAll(); this.flashCard(item.id);
    this.root.querySelector('[data-act="equip"]')?.focus?.({ preventScroll: true });
  }
  equip() {
    const item = this.selected(); if (!item || !this.owns(item)) return;
    if (item.kind === 'paint') this.onLivery(item.ref, this.profile.lights);
    else if (item.kind === 'lights') this.onLivery(this.profile.paint, item.ref);
    else { const slot = this.targetSlot(item); this.onFit({ ...this.fitted, [slot]: item.ref }); this.draft = { ...this.draft, [slot]: item.ref }; }
    this.showMine = false; this.toast(`EQUIPPED · ${item.name}${this.mode === 'combat' && item.kind === 'part' ? ' · FITS ON YOUR NEXT SPAWN' : ''}`, 'good');
    this.refreshAll(); this.rebuildStage(); this.flashCard(item.id);
  }
  toast(text, tone = 'good') {
    this.toastEl.textContent = text; this.toastEl.dataset.tone = tone; this.toastEl.classList.add('on'); this.footEl.classList.add('toasting'); clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastEl.classList.remove('on'); this.footEl.classList.remove('toasting'); }, 3200);
  }
  flashCard(id) { const card = this.gridEl.querySelector(`[data-item="${id}"]`); if (card && !this.reducedMotion) { card.classList.remove('bought'); void card.offsetWidth; card.classList.add('bought'); } }
  // The wallet counts down to the new balance (instantly with reduced motion).
  countTo(from, to) {
    cancelAnimationFrame(this.countFrame);
    if (this.reducedMotion || from === to) { this.shownCredits = to; this.walletEl.textContent = fmt(to); return; }
    const start = performance.now(), run = now => { const t = Math.min(1, (now - start) / 600); this.shownCredits = from + (to - from) * (1 - Math.pow(1 - t, 3)); this.walletEl.textContent = fmt(this.shownCredits); if (t < 1) this.countFrame = requestAnimationFrame(run); };
    this.countFrame = requestAnimationFrame(run);
  }

  onKey(event) {
    if (!this.isOpen) return;
    const key = event.key, eat = () => { event.preventDefault(); event.stopPropagation(); };
    if (key === 'Escape') { eat(); this.onClose(); }
    else if (key === 'Enter' && !event.target.closest?.('button')) { eat(); this.primary(); }
    else if (/^[1-9]$/.test(key)) { eat(); this.setCategory(CATEGORIES[Number(key) - 1]?.id); }
    else if (key === 'PageDown' || key === 'PageUp') { eat(); const i = CATEGORIES.findIndex(c => c.id === this.category); this.setCategory(CATEGORIES[(i + (key === 'PageDown' ? 1 : CATEGORIES.length - 1)) % CATEGORIES.length].id); }
    else if (key === 'ArrowRight' || key === 'ArrowLeft') { eat(); this.move(key === 'ArrowRight' ? 1 : -1); }
    else if (key === 'ArrowDown' || key === 'ArrowUp') { eat(); this.move((key === 'ArrowDown' ? 1 : -1) * this.columns()); }
    else if (key === 'a' || key === 'A') { eat(); const item = this.selected(); if (item && SIDES[item.group]) this.setSide(SIDES[item.group].map(s => s[0]).find(s => s !== this.side[item.group])); }
    else if (key === 'm' || key === 'M') { eat(); this.toggleMine(); }
    else if (key === 'f' || key === 'F') { eat(); this.act('refit'); }
    else if (key === ' ' && !event.target.closest?.('button')) { eat(); this.primary(); }
    else if (key === 'Tab') { // keep focus inside the dialog
      const stops = [...this.root.querySelectorAll('button:not(:disabled), [tabindex="0"]')].filter(el => el.offsetParent !== null), first = stops[0], last = stops[stops.length - 1], here = document.activeElement;
      if (first && event.shiftKey && (here === first || !this.root.contains(here))) { eat(); last.focus(); } else if (first && !event.shiftKey && (here === last || !this.root.contains(here))) { eat(); first.focus(); }
    }
    else event.stopPropagation();
  }

  // ---- Rendering --------------------------------------------------------------------------------------------
  refreshAll() { this.refreshHead(); this.refreshTabs(); this.renderGrid(); this.refreshInfo(); this.refreshTotals(); }
  refreshHead() {
    this.walletEl.textContent = fmt(this.shownCredits); this.root.querySelector('#sh-stage-note').textContent = MODE_TEXT[this.mode] || MODE_TEXT.pad;
    const cat = categoryById(this.category); this.root.querySelector('#sh-cat-title').textContent = cat.title; this.root.querySelector('#sh-cat-note').textContent = cat.note;
  }
  refreshTabs() {
    this.tabsEl.querySelectorAll('.sh-tab').forEach(tab => {
      const id = tab.dataset.cat, on = id === this.category, list = itemsIn(id).filter(listed), owned = list.filter(i => this.owns(i)).length;
      tab.classList.toggle('on', on); tab.setAttribute('aria-pressed', on);
      tab.querySelector('.sh-tab-count').textContent = `${owned}/${list.length}`;
    });
  }
  renderGrid() {
    const list = this.items(); let html = '', last = null;
    for (const item of list) {
      if (this.category === 'paint' && item.group !== last) { html += `<div class="sh-section" role="presentation">${item.group === 'paint' ? 'PAINT' : 'LIGHTS'}</div>`; last = item.group; }
      html += this.cardHtml(item);
    }
    this.gridEl.innerHTML = html || '<p class="sh-empty">Nothing for sale here.</p>';
    this.markSelection();
  }
  cardHtml(item) {
    const state = this.state(item), spec = this.thumbSpec(item), key = this.stage?.thumbKey(spec) || '', src = this.stage?.thumb(spec, true), poor = state === 'locked' && !canAfford(this.profile, item.id);
    const label = state === 'equipped' ? 'EQUIPPED' : state === 'owned' ? 'OWNED' : null;
    return `<div class="sh-card ${state}${poor ? ' poor' : ''}" role="option" id="sh-opt-${item.id.replace(/\W/g, '-')}" data-item="${item.id}" aria-selected="false">
      <div class="sh-thumb"><img alt="" data-thumb="${key}"${src ? ` src="${src}"` : ''}>
        ${label ? `<span class="sh-badge ${state}">${label}</span>` : '<span class="sh-badge locked"><i class="sh-lock" aria-hidden="true"></i><span class="sr">LOCKED</span></span>'}
        ${this.dotsHtml(item)}<span class="sh-try-flag" aria-hidden="true">TRYING</span></div>
      <div class="sh-card-body"><b>${esc(item.name)}</b><span class="sh-maker">${esc(item.maker)}</span>
        <span class="sh-card-foot"><em class="sh-tier tier-${item.tier.id}">${item.tier.label}</em><strong class="sh-price">${state === 'locked' ? `${fmt(item.price)} CR` : item.price === 0 ? 'STARTER' : 'OWNED'}</strong></span></div>
    </div>`;
  }
  // Colour chips on the thumbnail for items whose whole point is a colour.
  dotsHtml(item) {
    const colours = item.kind === 'paint' ? [item.paint.paint, item.paint.armor, item.paint.glow] : item.kind === 'lights' ? [item.light.glow, item.light.trim] : item.part?.color && ['trail', 'decal'].includes(item.group) ? [item.part.color] : [];
    return colours.filter(Boolean).length ? `<span class="sh-dots" aria-hidden="true">${colours.filter(Boolean).map(c => `<i style="background:${c}"></i>`).join('')}</span>` : '';
  }
  markSelection() {
    for (const card of this.gridEl.querySelectorAll('.sh-card')) {
      const on = card.dataset.item === this.selectedId; card.classList.toggle('sel', on); card.setAttribute('aria-selected', on); card.classList.toggle('mine', on && this.showMine);
      if (on) this.gridEl.setAttribute('aria-activedescendant', card.id);
    }
    this.mineEl.setAttribute('aria-pressed', this.showMine); this.mineEl.classList.toggle('on', this.showMine);
  }
  scrollToSelected() {
    const card = this.gridEl.querySelector('.sh-card.sel'); if (!card) return;
    const list = this.gridEl.getBoundingClientRect(), box = card.getBoundingClientRect();
    if (box.top < list.top) this.gridEl.scrollTop -= list.top - box.top + 8; else if (box.bottom > list.bottom) this.gridEl.scrollTop += box.bottom - list.bottom + 8;
  }
  // The detail strip at the bottom of the stage: what it is, what it does to your build, and the buy or equip action.
  refreshInfo() {
    const item = this.selected(), mineNote = this.showMine;
    this.root.querySelector('#sh-stage-name').textContent = item && !mineNote ? `${{ locked: 'TRYING ON', owned: 'PREVIEW', equipped: 'EQUIPPED' }[this.state(item)]} · ${item.name}` : 'YOUR MECH';
    this.stageEl.classList.toggle('trying', !!item && !mineNote && this.state(item) === 'locked');
    if (!item) { this.infoEl.innerHTML = '<p class="sh-hint">Select an item to try it on.</p>'; return; }
    const state = this.state(item), part = item.kind === 'part' ? item.part : null, slot = item.kind === 'part' ? this.targetSlot(item) : null;
    let stats = '';
    if (part && item.slot) {
      const baseline = computeStats(this.fitted), deltas = statDeltas(baseline, computeStats({ ...this.fitted, [slot]: item.ref }));
      const bars = partBars(item.slot, part);
      stats = `<div class="sh-stats">${bars.map(b => `<span class="sh-stat${b.better === 'low' ? ' low' : ''}"><i>${b.label}</i><u><s style="width:${Math.max(4, Math.round(b.value / (b.max || 1) * 100))}%"></s></u><b>${b.value}${b.unit}</b></span>`).join('')}</div>`
        + (state === 'equipped' ? '' : `<div class="sh-deltas" aria-label="Change to your totals">${STAT_ROWS.map(([key, label, unit]) => { const d = deltas[key]; return `<span class="${d.delta === 0 ? 'flat' : d.good ? 'good' : 'bad'}">${label} ${d.delta > 0 ? '+' : ''}${d.delta}${unit}</span>`; }).join('')}</div>`);
    } else if (item.kind === 'paint') {
      const p = item.paint; stats = `<div class="sh-swatch" aria-hidden="true"><i style="background:${p.paint}"></i><i style="background:${p.armor}"></i><i style="background:${p.glow}"></i><i style="background:${p.trim}"></i></div>`;
    } else if (item.kind === 'lights' && item.light.glow) stats = `<div class="sh-swatch" aria-hidden="true"><i style="background:${item.light.glow}"></i><i style="background:${item.light.trim}"></i></div>`;
    else if (item.group === 'trail' && item.part.color) stats = `<div class="sh-swatch" aria-hidden="true"><i style="background:${item.part.color}"></i></div>`;
    else if (item.group === 'decal' && item.part.color) stats = `<div class="sh-swatch" aria-hidden="true"><i style="background:${item.part.color}"></i></div>`;
    const sides = SIDES[item.group] ? `<div class="sh-sides" role="group" aria-label="Which mount">${SIDES[item.group].map(([s, label]) => `<button type="button" class="sh-side${this.side[item.group] === s ? ' on' : ''}" data-side="${s}" aria-pressed="${this.side[item.group] === s}">${label}</button>`).join('')}<kbd>A</kbd></div>` : '';
    const where = SIDES[item.group] && state === 'equipped' ? `ON ${this.slotsOf(item).filter(s => this.fitted[s] === item.ref).map(s => SIDES[item.group].find(x => x[0] === s)[1]).join(' + ')}` : '';
    let action, reason = '';
    if (state === 'locked') {
      const afford = canAfford(this.profile, item.id), armed = this.armed === item.id;
      action = `<button type="button" class="sh-btn buy${armed ? ' armed' : ''}" data-act="buy"${afford ? '' : ' disabled'} aria-describedby="sh-reason">${armed ? 'CONFIRM · ' : 'BUY · '}${fmt(item.price)} CR</button>`;
      reason = afford ? (item.price >= CONFIRM_FROM ? (armed ? 'PRESS AGAIN TO CONFIRM' : `${fmt(this.profile.credits - item.price)} CR LEFT AFTER BUYING`) : `${fmt(this.profile.credits - item.price)} CR LEFT AFTER BUYING`) : `NEED ${fmt(item.price - this.profile.credits)} MORE CREDITS`;
    } else if (state === 'owned') action = `<button type="button" class="sh-btn primary" data-act="equip">EQUIP${SIDES[item.group] ? ' · ' + SIDES[item.group].find(x => x[0] === this.side[item.group])[1] : ''} <kbd>ENTER</kbd></button>`;
    else { const moves = SIDES[item.group] && this.fitted[this.side[item.group]] !== item.ref; action = moves ? `<button type="button" class="sh-btn" data-act="equip">EQUIP · ${SIDES[item.group].find(x => x[0] === this.side[item.group])[1]}</button>` : ''; reason = where; }
    this.infoEl.innerHTML = `<div class="sh-info-main">
        <div class="sh-info-top"><h3>${esc(item.name)}</h3><em class="sh-tier tier-${item.tier.id}">${item.tier.label}</em><em class="sh-tag">${esc(item.tag)}</em></div>
        <div class="sh-info-sub">${esc(item.maker)} · ${esc(item.role)}</div>
        <p>${esc(item.blurb)}</p>${stats}</div>
      <div class="sh-info-buy">${state === 'locked' ? `<div class="sh-bigprice">${fmt(item.price)}<small>CR</small></div>` : `<div class="sh-bigprice own ${state}">${state === 'equipped' ? 'EQUIPPED' : 'OWNED'}</div>`}${sides}${action}<small class="sh-reason" id="sh-reason">${esc(reason)}</small></div>`;
    this.stage?.setShift(this.infoEl.offsetHeight * .5);
  }
  refreshTotals() {
    const build = this.shownBuild(), now = computeStats(build), base = computeStats(this.fitted), d = statDeltas(base, now), mods = gameplayMods(build);
    this.totalsEl.innerHTML = [
      ...STAT_ROWS.map(([key, label, unit]) => `<div><span>${label}</span><b>${now[key]}${unit}</b>${d[key].delta ? `<em class="${d[key].good ? 'good' : 'bad'}">${d[key].delta > 0 ? '+' : ''}${d[key].delta}</em>` : ''}</div>`),
      `<div><span>SPEED</span><b>${Math.round(mods.speed * 100)}%</b></div>`, `<div><span>BOOST</span><b>${Math.round(mods.boost * 100)}%</b></div>`,
    ].join('');
  }

  // ---- Preview ----------------------------------------------------------------------------------------------
  frameCamera() {
    const item = this.selected(); let focus = SHOP_FOCUS[this.category];
    if (this.category === 'arm' || this.category === 'shoulder') focus = FOCUS[item ? this.side[item.group] : this.category === 'arm' ? 'rArm' : 'rShoulder'];
    if (this.stage) { this.stage.frame(focus); this.stage.pose = ['back', 'trail'].includes(this.category) ? { boost: true } : {}; }
  }
  rebuildStage() {
    if (!this.stage?.renderer) return;
    const livery = this.shownLivery(); this.stage.paint = livery.paint; this.stage.lights = livery.lights; this.stage.setBuild(this.shownBuild());
    this.refreshTotals(); this.markSelection();
  }
  warmThumbs() { if (!this.stage?.renderer) return; for (const cat of CATEGORIES) for (const item of itemsIn(cat.id).filter(listed)) this.stage.thumb(this.thumbSpec(item)); }
  tick(now) {
    if (!this.isOpen) return;
    this.frame = requestAnimationFrame(t => this.tick(t));
    if (!this.stage?.renderer) return;
    const h = this.infoEl.offsetHeight; if (h !== this.lastInfoHeight) { this.lastInfoHeight = h; this.stage.setShift(h * .5); }
    this.stage.update(now);
  }
}
