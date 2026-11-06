// Frame paints and light colours. Pure data, shared by the profile, the Field Refit screen and the Gear Shop.
// `price` is in credits: 0 comes with the factory kit (Cobalt paint, lights that match the paint).

// paint colours the hull, armor colours the plates. glow/trim are the paint's own light colours.
export const PAINTS = [
  { id: 'cobalt', name: 'COBALT', paint: '#345e85', armor: '#a5b1b5', glow: '#43dafa', trim: '#a5f6ff', price: 0, tag: 'FACTORY', blurb: 'The factory blue-steel hull with ice-cyan lights.' },
  { id: 'ember', name: 'EMBER', paint: '#b5582a', armor: '#d6c6b2', glow: '#ffb35a', trim: '#ffd9a0', price: 100, tag: 'WARM', blurb: 'Burnt copper hull over sand plates. Reads well against green and grey.' },
  { id: 'verdant', name: 'VERDANT', paint: '#3d7a53', armor: '#b9c9b8', glow: '#8dffae', trim: '#c9ffd8', price: 100, tag: 'FIELD', blurb: 'Forest green with pale sage plates, for the pilot who is going home to Eden.' },
  { id: 'ghost', name: 'GHOST', paint: '#8d99a2', armor: '#dbe3e8', glow: '#e4f4ff', trim: '#ffffff', price: 160, tag: 'STEALTH', blurb: 'Slate and white. Hard to pick out of a rainy skyline.' },
  { id: 'obsidian', name: 'OBSIDIAN', paint: '#232a31', armor: '#56626d', glow: '#ff5fb0', trim: '#ffc2e8', price: 220, tag: 'NIGHT', blurb: 'Matte black with magenta lights. The one everyone asks about.' },
  { id: 'sandstone', name: 'SANDSTONE', paint: '#a98f68', armor: '#e2d6bd', glow: '#ffb35a', trim: '#ffe3b4', price: 100, tag: 'DESERT', blurb: 'Dusty tan with cream plates and amber lights.' },
  { id: 'arctic', name: 'ARCTIC', paint: '#c3d0d8', armor: '#f2f6f8', glow: '#43dafa', trim: '#d6faff', price: 160, tag: 'SNOW', blurb: 'Near-white frost paint with cyan lights.' },
  { id: 'violet', name: 'VIOLET', paint: '#5a4a96', armor: '#b8b0d6', glow: '#c79bff', trim: '#e8d6ff', price: 180, tag: 'ROYAL', blurb: 'Deep violet hull with lilac plates and lights.' },
];
// Light colours can override the paint's own. 'auto' keeps the paint's.
export const LIGHTS = [
  { id: 'auto', name: 'MATCH PAINT', price: 0, tag: 'FACTORY', blurb: 'Visor, thruster and trim lights follow the paint.' },
  { id: 'cyan', name: 'CYAN', glow: '#43dafa', trim: '#a5f6ff', price: 40, tag: 'LIGHTS', blurb: 'Ice-cyan visor, thrusters and trim.' },
  { id: 'amber', name: 'AMBER', glow: '#ffb35a', trim: '#ffd9a0', price: 40, tag: 'LIGHTS', blurb: 'Warm amber visor, thrusters and trim.' },
  { id: 'green', name: 'GREEN', glow: '#8dffae', trim: '#c9ffd8', price: 40, tag: 'LIGHTS', blurb: 'Bright green visor, thrusters and trim.' },
  { id: 'white', name: 'WHITE', glow: '#e4f4ff', trim: '#ffffff', price: 60, tag: 'LIGHTS', blurb: 'Cold white visor, thrusters and trim.' },
  { id: 'magenta', name: 'MAGENTA', glow: '#ff5fb0', trim: '#ffc2e8', price: 80, tag: 'LIGHTS', blurb: 'Hot magenta visor, thrusters and trim.' },
];

export const paintById = id => PAINTS.find(p => p.id === id) || PAINTS[0];
export const lightsById = id => LIGHTS.find(l => l.id === id) || LIGHTS[0];
// The colours a mech actually wears: the paint, with its lights optionally replaced.
export function liveryFor(profile) {
  const paint = paintById(profile?.paint), lights = lightsById(profile?.lights);
  return { paint: paint.paint, armor: paint.armor, trim: lights.trim || paint.trim, glow: lights.glow || paint.glow };
}
