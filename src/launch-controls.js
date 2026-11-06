import { MathUtils } from 'three';

const TAU = Math.PI * 2;
const INTERACTIVE = 'button, a, select, label, input, dialog, textarea';

// Pointer, keyboard and hover state for the launch deck: drag-to-rotate with inertia,
// mouse parallax, a "power up" pose when the player hovers Deploy, and a per-chapter accent.
export class DeckControls {
  constructor(menu, { reducedMotion = false } = {}) {
    this.menu = menu;
    this.reducedMotion = reducedMotion;
    this.yaw = 0; this.velocity = 0; this.dragging = false; this.idle = 10;
    this.pointer = { x: 0, y: 0 }; this.parallax = { x: 0, y: 0 };
    this.power = 0; this.powerTarget = 0; this.pulse = 0; this.lastX = 0;
    this.accent = 0; this.enabled = true;

    menu.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !this.enabled || e.target.closest(INTERACTIVE)) return;
      this.dragging = true; this.lastX = e.clientX; this.velocity = 0; this.idle = 0;
      menu.classList.add('dragging');
      try { menu.setPointerCapture(e.pointerId); } catch { /* synthetic events have no capture */ }
    });
    menu.addEventListener('pointermove', e => {
      this.pointer.x = (e.clientX / innerWidth) * 2 - 1;
      this.pointer.y = (e.clientY / innerHeight) * 2 - 1;
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX; this.lastX = e.clientX;
      this.yaw += dx * 0.009; this.velocity = MathUtils.clamp(dx * 0.009 * 30, -4.5, 4.5); this.idle = 0;
    });
    const release = () => { this.dragging = false; menu.classList.remove('dragging'); };
    menu.addEventListener('pointerup', release);
    menu.addEventListener('pointercancel', release);
    menu.addEventListener('lostpointercapture', release);
    menu.addEventListener('dblclick', e => { if (!e.target.closest(INTERACTIVE)) this.reset(); });
  }

  // Keys are routed from the game so dialogs and the HUD keep priority.
  key(code) {
    if (!this.enabled) return false;
    if (code === 'ArrowLeft') { this.velocity -= 2.4; this.idle = 0; return true; }
    if (code === 'ArrowRight') { this.velocity += 2.4; this.idle = 0; return true; }
    if (code === 'Home') { this.reset(); return true; }
    return false;
  }

  reset() { this.velocity = 0; this.idle = 10; }
  setPower(on) { this.powerTarget = on ? 1 : 0; }
  flash() { this.pulse = 1; }

  update(dt) {
    dt = Math.min(dt || 0.016, 0.1);
    const move = this.reducedMotion ? 0 : 1;
    this.parallax.x = MathUtils.damp(this.parallax.x, this.pointer.x * move, 4, dt);
    this.parallax.y = MathUtils.damp(this.parallax.y, this.pointer.y * move, 4, dt);
    this.power = MathUtils.damp(this.power, this.powerTarget, 6, dt);
    this.pulse = Math.max(0, this.pulse - dt * 2.2);
    this.idle += dt;
    if (!this.dragging) {
      this.yaw += this.velocity * dt;
      this.velocity *= Math.exp(-dt * 3.2);
      if (Math.abs(this.velocity) < 0.02) this.velocity = 0;
      if (this.idle > 3.5) {
        // Ease back toward the nearest facing of the display pose.
        const nearest = Math.round(this.yaw / TAU) * TAU;
        this.yaw = MathUtils.damp(this.yaw, nearest, 1.6, dt);
      }
    }
    return this;
  }
}
