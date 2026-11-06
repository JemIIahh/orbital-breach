// Hit feel: what a pilot's round does to an enemy, expressed as plain numbers so it can be tested and tuned without a GPU.
//
// A hit used to be a paint flash, a 10 cm body shove and six to twelve 2-8 cm dots. Nothing about it said "I hit something
// solid". A convincing hit is several short layers stacked: a hot flash at the point of impact, thin streaking sparks that
// fly off the surface, embers that hang and drift up, a visible reaction in the target, and (on a kill) a brief freeze so the
// moment lands. effects.js draws the layers; this module decides how big each one is.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Hot, in linear HDR. Values above 1 are deliberate: the scene is rendered to a half-float target and only bloomed above
// a luminance threshold, so ordinary 0-1 colours can never glow no matter how bright they look.
export const PALETTE = {
  hull:   { hot: [7, 4.2, 1.6], cool: [2.2, .5, .1],  flash: [6, 3.4, 1.4] },
  shield: { hot: [1.6, 5.5, 7.5], cool: [.2, 1.2, 2.6], flash: [1.6, 4.6, 6.5] },
};

// damage    hit strength (campaign damage per round, ~8-60)
// part      'head' | 'core' | 'arm' | 'leg'
// shield    true while the target's shield absorbed the round
// killed    the round destroyed the target
// big       archon-class target (heavier everything)
export function hitReaction({ damage = 20, part = 'core', shield = false, shieldBroke = false, killed = false, big = false } = {}) {
  const head = part === 'head' ? 1.25 : 1;
  const power = clamp(damage / 24, .35, 2.2) * head;
  const kill = killed ? 1 : 0;
  const palette = shield ? PALETTE.shield : PALETTE.hull;
  return {
    power, shield, killed: !!killed, palette,
    // layers
    flash: clamp(.7 + power * .55, .7, 2.4) * (1 + kill * .8),                 // metres across the hot core
    streaks: Math.round(clamp(7 + power * 7, 7, 22) * (1 + kill * 1.2)),        // thin streaking sparks
    embers: shield ? 0 : Math.round(clamp(2 + power * 4, 2, 10) * (1 + kill)),  // slow, rising, glowing specks
    smoke: !shield && (power > .9 || killed),                                   // a dark puff off scorched armour
    ring: shield,                                                               // the expanding shield ripple
    speed: 7 + power * 5 + kill * 6,                                            // m/s the fastest streak leaves at
    spread: shield ? 1.9 : 1.35,                                                // how wide they fan around the surface normal
    // the target's reaction
    flinch: clamp(.3 + power * .4, .3, 1) * (big ? .55 : 1),                    // 0-1 lean-back and body shove
    // the pilot's reaction
    stop: freezeFor(kill, big, shieldBroke),                                    // seconds the world freezes
    shake: killed ? (big ? .8 : .42) : shieldBroke ? .22 : 0,
  };
}

// A freeze long enough to register (about four frames at 60 Hz) but short enough never to feel like lag, and only on the
// events that deserve it: kills, and the moment a shield pops.
function freezeFor(kill, big, shieldBroke) {
  if (kill) return big ? .13 : .065;
  return shieldBroke ? .03 : 0;
}

// Which side of a target (whose right-hand direction is `right`, standing at `origin`) a hit landed on: -1 left ... +1 right.
export function hitSide(right, origin, point) {
  const x = point.x - origin.x, y = point.y - origin.y, z = point.z - origin.z;
  const len = Math.hypot(x, y, z) || 1;
  return clamp((x * right.x + y * right.y + z * right.z) / len, -1, 1);
}

// Proximity falloff for the pilot's camera shake when something explodes nearby.
export const shakeFalloff = (distance, base) => clamp(base * (1.15 - distance / 45), 0, base);
