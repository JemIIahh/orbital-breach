import { heartInterval } from './combat-feel.js';

// Directional damage ring, near-miss ticks and the low-health pulse. Plain DOM, no game state: the game tells it where
// a hit came from (a bearing, 0 = ahead, clockwise) and how bad things are, and it fades itself.
const SLOTS = 6;
const wrap = degrees => ((degrees + 540) % 360) - 180;

export class CombatHud {
  constructor(doc = document, reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) {
    this.reducedMotion = reducedMotion;
    this.root = doc.createElement('div'); this.root.className = 'ch-root'; this.root.setAttribute('aria-hidden', 'true');
    this.danger = doc.createElement('div'); this.danger.className = 'ch-danger';
    this.slots = Array.from({ length: SLOTS }, () => { const el = doc.createElement('i'); el.className = 'ch-dir'; return { el, life: 0, max: 1, angle: 0, kind: 'health', strength: 1, shown: false }; });
    this.root.append(this.danger, ...this.slots.map(slot => slot.el)); doc.body.append(this.root);
    this.dangerShown = 0;
  }
  // A hit landed from `bearing`; shield-only hits are cyan, hits that reach the core are red and linger longer.
  hurt(feel, bearing) { if (bearing == null || !Number.isFinite(bearing)) return; this.mark(bearing, feel.shieldOnly ? 'shield' : 'health', feel.shieldOnly ? 1.1 : 1.9, .55 + feel.amount * .45); }
  // A round whipped past; a short, faint tick on the side it came from.
  nearMiss(bearing) { if (bearing == null || !Number.isFinite(bearing)) return; this.mark(bearing, 'near', .5, .55); }
  // A Lancer is locking on from `bearing`: an amber, flashing tick for the length of its charge.
  warn(bearing) { if (bearing == null || !Number.isFinite(bearing)) return; this.mark(bearing, 'warn', 1.2, 1); }
  mark(bearing, kind, seconds, strength) {
    const degrees = bearing * 180 / Math.PI;
    const slot = this.slots.find(s => s.life > 0 && s.kind === kind && Math.abs(wrap(s.angle - degrees)) < 22) || this.slots.reduce((a, b) => (a.life <= b.life ? a : b));
    slot.angle = degrees; slot.kind = kind; slot.life = slot.max = seconds; slot.strength = strength; slot.shown = true;
    slot.el.dataset.kind = kind; slot.el.style.setProperty('--a', `${degrees.toFixed(1)}deg`);
  }
  // level 0..1 from dangerLevel(); `time` drives the heartbeat pulse so it lines up with the audio cadence.
  update(dt, level, time) {
    for (const slot of this.slots) {
      if (slot.life <= 0) { if (slot.shown) { slot.el.style.opacity = '0'; slot.shown = false; } continue; }
      slot.life -= dt; slot.el.style.opacity = (Math.min(1, Math.max(0, slot.life / slot.max) * 1.7) * slot.strength).toFixed(3);
    }
    const pulse = this.reducedMotion ? .55 : .5 + .5 * Math.sin(time * Math.PI * 2 / heartInterval(level)), target = level > 0 ? level * (.5 + .5 * pulse) : 0;
    this.dangerShown += (target - this.dangerShown) * Math.min(1, dt * 14);
    this.danger.style.opacity = this.dangerShown < .004 ? '0' : this.dangerShown.toFixed(3);
  }
  reset() { for (const slot of this.slots) { slot.life = 0; slot.shown = false; slot.el.style.opacity = '0'; } this.dangerShown = 0; this.danger.style.opacity = '0'; }
}
