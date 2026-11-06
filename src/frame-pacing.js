import * as T from 'three';

// Frame pacing: smoothing what the pilot SEES without changing what the simulation DOES.
//
// The simulation advances in fixed 1/60 s steps (so physics is identical at any frame rate; tests pin that down), but the
// display does not run in lock-step with it. Rendering the raw last-stepped state meant a frame that happened to contain
// zero steps showed the previous frame again, and the next contained two: a visible hitch every few seconds on a 60 Hz
// screen and constant judder on a 120 Hz one. Blending between the last two states removes it.

export const STEP = 1 / 60;
// A pose that moved further than this in one step was a teleport (respawn, portal, realm change), not motion: never blend it.
export const SNAP_DISTANCE = 4;

// How far between the previous and the current simulation state this frame sits (0 = previous, 1 = current).
export const blendAlpha = (leftover, step = STEP) => Math.min(1, Math.max(0, leftover / step));

// out = prev -> curr at `alpha`, or curr unchanged when there is no previous pose or the pose teleported.
export function blendPosition(prev, curr, alpha, out = new T.Vector3()) {
  if (!prev || prev.distanceToSquared(curr) > SNAP_DISTANCE * SNAP_DISTANCE) return out.copy(curr);
  return out.lerpVectors(prev, curr, alpha);
}

// Shadow maps cannot be re-rendered for free, so they used to refresh on a fixed 20 Hz clock. Every moving shadow (the
// mech's own, every enemy's) then stepped at a third of the frame rate and swam against the geometry that casts it.
//
// The governor refreshes every frame while the machine is keeping up, and only backs off (to the old cadence at worst)
// when frames start to slip. Display frame times are quantised to the refresh rate, so "keeping up" cannot be read from
// the absolute frame time; it is read relative to the best frame time recently seen on this display.
export class ShadowGovernor {
  // intervals[level] = seconds between refreshes; level 0 is every frame, the last is the old fixed cadence.
  constructor(intervals = [0, 1 / 30, 1 / 20]) {
    this.setIntervals(intervals);
    this.ema = 16.7; this.best = 16.7; this.level = 0; this.clock = 0;
    this.hold = 1.5;   // seconds before the first level change is considered (lets the first frames settle)
    this.calm = 0;     // seconds spent not under load
    this.backoff = 3;  // seconds of calm required before trying a more frequent level; doubles after each failed attempt
    this.promoted = false;
  }
  setIntervals(intervals) { this.intervals = intervals; this.level = Math.min(this.level ?? 0, intervals.length - 1); }

  // Feed one frame's real duration (seconds). Returns true when the shadow map should be re-rendered this frame.
  tick(dt) {
    const ms = dt * 1000;
    if (ms > 0 && ms < 250) { // a long gap is a pause or a background tab, not load
      this.ema += (ms - this.ema) * .08;
      this.best = Math.max(4, Math.min(ms, this.best * 1.0008));
    }
    const loaded = this.ema > this.best * 1.25;
    this.hold -= dt;
    if (this.hold <= 0) {
      if (loaded) {
        this.calm = 0;
        if (this.level < this.intervals.length - 1) {
          this.level++; this.hold = 1.5;
          // We stepped back down right after trying a cheaper-to-see level: be slower to try it again.
          if (this.promoted) this.backoff = Math.min(60, this.backoff * 2);
          this.promoted = false;
        }
      } else {
        this.calm += dt;
        if (this.calm >= this.backoff && this.level > 0) { this.level--; this.calm = 0; this.hold = 1.5; this.promoted = true }
        else if (this.calm >= this.backoff * 2) this.promoted = false; // it held: the attempt counts as a success
      }
    }
    this.clock += dt;
    if (this.clock >= this.intervals[this.level] - 1e-6) { this.clock = 0; return true }
    return false;
  }
}

// Balanced mode trades a small amount of render resolution for a stable frame
// budget. Hysteresis avoids oscillation and ignores tab switches/loading gaps.
export class ResolutionGovernor {
  constructor(){this.reset()}
  reset(){this.scale=1;this.ema=1/60;this.warmup=3;this.slow=0;this.fast=0;this.hold=0}
  tick(dt){
    if(dt<=0||dt>.1)return false;
    this.ema+=(dt-this.ema)*.04;this.hold=Math.max(0,this.hold-dt);
    if(this.warmup>0){this.warmup-=dt;return false}
    this.slow=this.ema>1/45?this.slow+dt:0;
    this.fast=this.ema<1/58?this.fast+dt:0;
    if(this.hold>0)return false;
    let next=this.scale;
    if(this.slow>2)next=Math.max(.75,this.scale-.1);
    else if(this.fast>8)next=Math.min(1,this.scale+.05);
    if(Math.abs(next-this.scale)<1e-6)return false;
    this.scale=next;this.hold=4;this.slow=this.fast=0;return true;
  }
}
