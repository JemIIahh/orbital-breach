// Mech parts, builds and the stat rules that turn a build into gameplay.
// Pure data and maths: no DOM and no Three.js, so every rule here is unit-testable.
//
// A build names one part per slot. Eight slots carry gear (head, legs, torso, back, two arms, two shoulders) and two are pure
// looks (decal, boost trail). Every part has a `price`: 0 means it comes with the factory kit, anything above is bought in the
// Gear Shop (see shop-items.js). `none` mounts are always free.

// Tabs of the Field Refit screen. Decals and boost trails are build slots too, but they live inside the Livery tab.
export const SLOTS = [
  { id: 'head', label: 'HEAD', key: '1', title: 'Headgear', fires: '' },
  { id: 'legs', label: 'LEGS', key: '2', title: 'Legs', fires: '' },
  { id: 'torso', label: 'TORSO', key: '3', title: 'Torso', fires: '' },
  { id: 'back', label: 'BACK', key: '4', title: 'Back mount', fires: '' },
  { id: 'rArm', label: 'R ARM', key: '5', title: 'Right arm', fires: 'RMB' },
  { id: 'lArm', label: 'L ARM', key: '6', title: 'Left arm', fires: 'LMB' },
  { id: 'rShoulder', label: 'R SHOULDER', key: '7', title: 'Right shoulder', fires: 'G' },
  { id: 'lShoulder', label: 'L SHOULDER', key: '8', title: 'Left shoulder', fires: 'G' },
  { id: 'builds', label: 'BUILDS', key: '9', title: 'Saved builds', fires: '' },
  { id: 'livery', label: 'LIVERY', key: '0', title: 'Paint and trim', fires: '' },
];
export const LOOK_SLOTS = ['decal', 'trail'];
export const PART_SLOTS = [...SLOTS.filter(s => !['builds', 'livery'].includes(s.id)).map(s => s.id), ...LOOK_SLOTS];
// Slots that change how the mech looks far more than how it plays: ignored when matching a build to a ready-made one.
export const COSMETIC_SLOTS = ['head', ...LOOK_SLOTS];
export const GEAR_SLOTS = PART_SLOTS.filter(s => !COSMETIC_SLOTS.includes(s));
export const SLOT_TITLES = { ...Object.fromEntries(SLOTS.map(s => [s.id, s.title])), decal: 'Decal', trail: 'Boost trail' };

const KESSLER = 'KESSLER HEAVY INDUSTRIES', ASTER = 'ASTER DYNAMICS', VANTA = 'VANTA ORDNANCE', KESTREL = 'KESTREL STATION SURPLUS', EDEN = 'EDEN RECLAMATION GUILD';

// Weapons that mount on an arm. fire.* drives the simulation; range is the nominal effective range shown to the pilot.
const ARM_WEAPONS = [
  { id: 'mx9', name: 'MX-9 GATLING', maker: KESSLER, role: 'SUPPORT GUN', model: 'gatling', weight: 4.2, range: 110, tag: 'KINETIC', price: 0,
    blurb: 'Rapid-fire rotary. Heats slowly and strips shields before the core opens up.',
    fire: { cd: .075, damage: 17, pellets: 1, spread: 0, speed: 165, life: 1.7, heat: .052, shake: .12, audio: 'gatling' } },
  { id: 'gx6', name: 'GX-6 BUZZSAW', maker: KESSLER, role: 'RAPID GUN', model: 'buzzsaw', weight: 3.4, range: 80, tag: 'KINETIC', price: 160,
    blurb: 'A tight, screaming stream of light rounds. Short on reach, long on volume.',
    fire: { cd: .058, damage: 11, pellets: 1, spread: .018, speed: 150, life: 1.1, heat: .04, shake: .1, audio: 'gatling' } },
  { id: 'fk40', name: 'FK-40 FLAK CANNON', maker: KESSLER, role: 'SCATTER GUN', model: 'flak', weight: 5.1, range: 55, tag: 'SPREAD', price: 0,
    blurb: 'Seven-pellet blast that wrecks anything inside fifty metres. Cycles slowly.',
    fire: { cd: .53, damage: 13, pellets: 7, spread: .052, speed: 112, life: 1.7, heat: .22, shake: .45, audio: 'flak' } },
  { id: 'lc7', name: 'LC-7 CUTTER', maker: ASTER, role: 'CLOSE GUN', model: 'cutter', weight: 3, range: 32, tag: 'SHORT RANGE', price: 180,
    blurb: 'Three bright cutting bolts per pull. Devastating up close, useless past thirty metres.',
    fire: { cd: .16, damage: 12, pellets: 3, spread: .09, speed: 140, life: .3, heat: .07, shake: .22, audio: 'flak' } },
  { id: 'px3', name: 'PX-3 STITCHER', maker: ASTER, role: 'PRECISION GUN', model: 'stitcher', weight: 4, range: 160, tag: 'PRECISION', price: 320,
    blurb: 'Paired slugs on a dead-straight line. Reward patience and head height.',
    fire: { cd: .26, damage: 24, pellets: 2, spread: .004, speed: 230, life: 1.6, heat: .1, shake: .2, audio: 'gatling' } },
  { id: 'mp6', name: 'MP-6 MISSILE POD', maker: VANTA, role: 'SALVO', model: 'pod', weight: 5.5, range: 90, tag: 'EXPLOSIVE', price: 360,
    blurb: 'Three small rockets per salvo. Each one bursts for splash damage on impact.',
    fire: { cd: .95, damage: 22, pellets: 3, spread: .035, speed: 85, life: 2.4, heat: .2, shake: .4, splash: 3.2, audio: 'missile' } },
  { id: 'hc1', name: 'HC-1 THUNDERCLAP', maker: KESSLER, role: 'HEAVY', model: 'thunder', weight: 7.5, range: 120, tag: 'HEAVY · EXPLOSIVE', price: 540,
    blurb: 'One huge shell every second and a half. The blast knocks armour off whatever is nearby.',
    fire: { cd: 1.5, damage: 100, pellets: 1, spread: 0, speed: 68, life: 2.6, heat: .42, shake: .9, splash: 6.5, audio: 'missile' } },
  { id: 'bc4', name: 'BC-4 BURST CARBINE', maker: ASTER, role: 'BURST RIFLE', model: 'carbine', weight: 2.8, range: 95, tag: 'LIGHT · BURST', price: 260,
    blurb: 'Three tight rounds on every pull from a compact frame. Light on the chassis, easy on the heat.',
    fire: { cd: .22, damage: 12, pellets: 3, spread: .012, speed: 185, life: 1.3, heat: .08, shake: .18, audio: 'gatling' } },
  { id: 'sc9', name: 'SC-9 STORM COIL', maker: KESSLER, role: 'ARC GUN', model: 'coil', weight: 4.4, range: 38, tag: 'ARC · SHORT RANGE', price: 400,
    blurb: 'A stacked induction coil that throws a crackling cone of arcs. Brutal inside forty metres.',
    fire: { cd: .1, damage: 5, pellets: 4, spread: .075, speed: 160, life: .26, heat: .05, shake: .1, audio: 'flak' } },
  { id: 'pl2', name: 'PL-2 PLASMA LANCE', maker: VANTA, role: 'PLASMA', model: 'lance', weight: 5.2, range: 100, tag: 'PLASMA · SPLASH', price: 720,
    blurb: 'A spear of superheated plasma that scorches a small area on impact. Runs hot, hits hard.',
    fire: { cd: .3, damage: 30, pellets: 1, spread: .008, speed: 105, life: 1.5, heat: .15, shake: .25, splash: 2.4, audio: 'flak' } },
  { id: 'rg5', name: 'RG-5 RAILGUN', maker: ASTER, role: 'LONG RIFLE', model: 'railgun', weight: 6.4, range: 220, tag: 'LONG RANGE', price: 860,
    blurb: 'Twin magnetic rails and a slug that arrives before the sound does. Slow to cycle, the longest reach on offer.',
    fire: { cd: 1, damage: 90, pellets: 1, spread: 0, speed: 320, life: 1.2, heat: .3, shake: .55, audio: 'missile' } },
  { id: 'none', name: 'NONE', maker: 'EMPTY SLOT', role: 'NOTHING MOUNTED', model: 'none', weight: 0, range: 0, tag: 'LIGHT', price: 0,
    blurb: 'Leave the arm bare. Lighter, quicker, and nothing to fire.', fire: null },
];

// Shoulder mounts fire together on G, each on its own cooldown.
const SHOULDER_WEAPONS = [
  { id: 'hx2', name: 'HX-2 HELIX MISSILE', maker: KESSLER, role: 'SHOULDER MISSILE', model: 'helix', weight: 5, range: 140, tag: 'EXPLOSIVE', price: 0,
    blurb: 'One heavy rocket with a wide burst. Recharges faster once the second relay is online.',
    fire: { kind: 'missile', cd: 7, damage: 150, count: 1, speed: 72, splash: 9 } },
  { id: 'rs1', name: 'RS-1 ROTARY SHOULDER GUN', maker: KESSLER, role: 'SUPPORT GUN', model: 'rotary', weight: 3.6, range: 85, tag: 'KINETIC', price: 140,
    blurb: 'A small auto-gun above the shoulder. Hold G and it chatters away while your arms do the real work.',
    fire: { kind: 'gun', cd: .11, damage: 9, count: 1, speed: 150, life: 1.2, spread: .012 } },
  { id: 'th3', name: 'TH-3 THUMPER MORTAR', maker: VANTA, role: 'AREA', model: 'mortar', weight: 6, range: 110, tag: 'EXPLOSIVE', price: 380,
    blurb: 'Slow, heavy shells with a massive blast. Clears a cluster rather than a single target.',
    fire: { kind: 'shell', cd: 3.2, damage: 110, count: 1, speed: 52, life: 3, splash: 7.5 } },
  { id: 'sr6', name: 'SR-6 SWARM RACK', maker: VANTA, role: 'SALVO', model: 'swarm', weight: 5, range: 90, tag: 'EXPLOSIVE', price: 340,
    blurb: 'Six mini-rockets fanned in one salvo. Keeps armour busy and shields down.',
    fire: { kind: 'salvo', cd: 4.2, damage: 20, count: 6, speed: 78, life: 2.2, spread: .1, splash: 2.6 } },
  { id: 'cm12', name: 'CM-12 CHAFF KING', maker: KESSLER, role: 'UTILITY', model: 'chaff', weight: 2.2, range: 30, tag: 'UTILITY · FLARES', price: 240,
    blurb: 'Flares break incoming fire. Pop it, wipe nearby rounds from the air and take half damage for a few seconds.',
    fire: { kind: 'chaff', cd: 14, damage: 0, count: 0, duration: 3.5, reduction: .5, radius: 30 } },
  { id: 'hr4', name: 'HR-4 HORNET RACK', maker: VANTA, role: 'MICRO SALVO', model: 'hornet', weight: 4.2, range: 100, tag: 'EXPLOSIVE · FAST', price: 300,
    blurb: 'Four quick micro-missiles from a slim rack. Recycles faster than a swarm rack and stings at range.',
    fire: { kind: 'salvo', cd: 3, damage: 18, count: 4, speed: 90, life: 2, spread: .07, splash: 2.2 } },
  { id: 'pd2', name: 'PD-2 PHALANX TWIN', maker: KESSLER, role: 'SUPPORT GUN', model: 'phalanx', weight: 4.6, range: 95, tag: 'KINETIC · HEAVY', price: 420,
    blurb: 'A twin-barrel autocannon on a belt feed. Hold G for heavier rounds than the rotary, at a steadier rate.',
    fire: { kind: 'gun', cd: .13, damage: 12, count: 1, speed: 160, life: 1.3, spread: .014 } },
  { id: 'hw1', name: 'HW-1 SIEGE HOWITZER', maker: KESSLER, role: 'HEAVY AREA', model: 'howitzer', weight: 7.4, range: 150, tag: 'HEAVY · EXPLOSIVE', price: 640,
    blurb: 'A long-barrel gun that lobs one enormous shell every few seconds. Nothing close to the blast keeps its footing.',
    fire: { kind: 'shell', cd: 5.5, damage: 220, count: 1, speed: 48, life: 3.4, splash: 10 } },
  { id: 'none', name: 'NONE', maker: 'EMPTY SLOT', role: 'NOTHING MOUNTED', model: 'none', weight: 0, range: 0, tag: 'LIGHT', price: 0,
    blurb: 'Leave the shoulder bare. Lighter, and nothing extra on G.', fire: null },
];

const LEGS = [
  { id: 'rj7', name: 'RJ-7 REVERSE JOINT', maker: KESSLER, role: 'BIPED', model: 'biped', weight: 18, armour: 520, speed: 1, tag: 'BALANCED', price: 0,
    blurb: 'The standard digitigrade frame. Steady, sprung, and easy to repair in the field.' },
  { id: 'arachne', name: 'ARACHNE QUAD', maker: ASTER, role: 'QUAD', model: 'quad', weight: 15, armour: 430, speed: 1.1, tag: 'FAST · LOW', price: 260,
    blurb: 'Four splayed legs hold the hull low and wide. Quick to strafe, lighter armour.' },
  { id: 'at9', name: 'AT-9 ATLAS PLANT', maker: KESSLER, role: 'HEAVY BIPED', model: 'heavy', weight: 26, armour: 760, speed: .9, tag: 'HEAVY', price: 300,
    blurb: 'Thick stub legs that shrug off hits and slow you down. Anchors the heaviest builds.' },
  { id: 'tread', name: 'CR-3 CRAWLER TRACKS', maker: KESSLER, role: 'TRACKED', model: 'tread', weight: 29, armour: 820, speed: .86, tag: 'TRACKED · HEAVY', price: 440,
    blurb: 'Armoured track runs on both sides. The slowest and best protected way to cross a battlefield.' },
  { id: 'sprint', name: 'SK-11 SPRINTER', maker: ASTER, role: 'LIGHT BIPED', model: 'sprinter', weight: 14, armour: 380, speed: 1.18, tag: 'SPEED', price: 520,
    blurb: 'Tall digitigrade shins ending in running blades. Fast and light, and every hit tells.' },
  { id: 'hover', name: 'HV-2 HOVER SKIRT', maker: VANTA, role: 'HOVER', model: 'hover', weight: 16, armour: 400, speed: 1.12, tag: 'HOVER · FAST', price: 780,
    blurb: 'No legs at all: a ring of lift fans carries the hull a hand above the ground. Quick, quiet, and exposed.' },
];

const TORSOS = [
  { id: 't40', name: 'T-40', maker: KESSLER, role: 'TORSO', model: 't40', weight: 15, armour: 600, heatRoom: 100, cooling: 100, tag: 'STANDARD', price: 0,
    blurb: 'The factory chassis. Even on armour, even on heat, no surprises.' },
  { id: 'c7', name: 'CIRRUS C-7', maker: ASTER, role: 'TORSO', model: 'cirrus', weight: 12, armour: 560, heatRoom: 110, cooling: 140, tag: 'RUNS COOL', price: 280,
    blurb: 'Moulded ceramic hull under a bubble canopy with liquid cooling. Lighter and slow to overheat.' },
  { id: 'b90', name: 'B-90 BASTION', maker: KESSLER, role: 'TORSO', model: 'bastion', weight: 23, armour: 760, heatRoom: 90, cooling: 90, tag: 'ARMOURED', price: 340,
    blurb: 'Layered plate and a broad chest. The most armour on offer, with a hotter core to match.' },
];

const BACKS = [
  { id: 'helion', name: 'HELION AFTERBURNER', maker: KESSLER, role: 'BACK MOUNT', model: 'helion', weight: 4.5, armour: 0, boost: 1, cooling: 100, tag: 'BOOST', price: 0,
    blurb: 'Twin afterburners for the best sprint and flight burst. The default for a reason.' },
  { id: 'vane', name: 'VANE RADIATORS', maker: ASTER, role: 'BACK MOUNT', model: 'vane', weight: 3.8, armour: 0, boost: .95, cooling: 135, tag: 'COOLING', price: 220,
    blurb: 'Folding radiator vanes that dump heat. Keeps the guns firing far longer.' },
  { id: 'aegis', name: 'AEGIS CELL', maker: KESSLER, role: 'BACK MOUNT', model: 'aegis', weight: 6.2, armour: 220, boost: .92, cooling: 100, tag: 'ARMOURED', price: 300,
    blurb: 'A plated power cell that soaks hits meant for the core. Heavy, and the afterburner suffers.' },
  { id: 'ring', name: 'ORBIT BOOSTER RING', maker: ASTER, role: 'BACK MOUNT', model: 'ring', weight: 3.2, armour: 0, boost: 1.03, cooling: 105, tag: 'COMPACT', price: 260,
    blurb: 'A slim ring-frame booster that sits close to the spine. Light, cool, and a touch more kick than stock.' },
  { id: 'turbine', name: 'TT-2 TWIN TURBINE', maker: KESSLER, role: 'BACK MOUNT', model: 'turbine', weight: 5.6, armour: 40, boost: 1.07, cooling: 95, tag: 'SPRINT', price: 480,
    blurb: 'Two bladed turbines in armoured drums. The hardest sprint and flight burst money can buy, with a little plate on the side.' },
  { id: 'wing', name: 'WP-8 WING PACK', maker: VANTA, role: 'BACK MOUNT', model: 'wing', weight: 4.4, armour: 0, boost: .99, cooling: 118, tag: 'AIRFRAME', price: 520,
    blurb: 'Swept blade wings with trailing vents. Sheds heat in the air and looks the part on every approach.' },
  { id: 'phoenix', name: 'PHOENIX FEATHERS', maker: EDEN, role: 'BACK MOUNT', model: 'phoenix', weight: 5.8, armour: 60, boost: 1.1, cooling: 112, tag: 'LEGENDARY', price: 950,
    blurb: 'A fan of glowing plates grown from Eden alloy. The best boost in the catalogue, and impossible to miss.' },
  { id: 'none', name: 'NONE', maker: 'EMPTY SLOT', role: 'NOTHING MOUNTED', model: 'none', weight: 0, armour: 0, boost: .9, cooling: 100, tag: 'LIGHT', price: 0,
    blurb: 'A clean back. Lightest option, gives up the afterburner kick.' },
];

// Headgear is mostly a look. The heavier helms add a little plate and a little mass; the stock visor is exactly the factory head.
const HEADS = [
  { id: 'visor', name: 'STOCK VISOR', maker: KESSLER, role: 'HEADGEAR', model: 'visor', weight: 0, armour: 0, tag: 'FACTORY', price: 0,
    blurb: 'The head Cobalt rolled off the line with. Slim visor, brow plate, nothing to apologise for.' },
  { id: 'recon', name: 'RECON ARRAY', maker: ASTER, role: 'HEADGEAR', model: 'recon', weight: .3, armour: 0, tag: 'RECON', price: 120,
    blurb: 'Whip antennas, a side dish and a brow sensor bar. Looks like it hears everything.' },
  { id: 'dome', name: 'CLEARVIEW DOME', maker: ASTER, role: 'HEADGEAR', model: 'dome', weight: .5, armour: 0, tag: 'CLEAR VIEW', price: 260,
    blurb: 'A glass canopy helmet over the sensor head. Light, clean, and you can see the glow inside.' },
  { id: 'crest', name: 'HORNED CREST HELM', maker: KESSLER, role: 'HEADGEAR', model: 'crest', weight: .7, armour: 20, tag: 'COMMAND', price: 220,
    blurb: 'Swept horns, a tall crest and cheek guards. A commander is on the field.' },
  { id: 'cyclops', name: 'TWIN-LENS CYCLOPS', maker: VANTA, role: 'HEADGEAR', model: 'cyclops', weight: .6, armour: 10, tag: 'TARGETING', price: 300,
    blurb: 'A heavy visor bar with two big lenses and a central sight. Everything it looks at is already a target.' },
  { id: 'warmask', name: 'WAR MASK', maker: KESSLER, role: 'HEADGEAR', model: 'warmask', weight: 1.4, armour: 70, tag: 'ARMOURED', price: 380,
    blurb: 'A full-face mask with a slit visor, jaw guard and cheek vents. The most plate you can put on a head.' },
  { id: 'halo', name: 'COMMS HALO', maker: VANTA, role: 'HEADGEAR', model: 'halo', weight: .9, armour: 0, tag: 'COMMS', price: 480,
    blurb: 'A mast and floating halo ring over a pair of headset cups. For the pilot who talks to the whole sky.' },
  { id: 'fin', name: 'ACE FIN HELM', maker: ASTER, role: 'HEADGEAR', model: 'fin', weight: .5, armour: 15, tag: 'AERO', price: 620,
    blurb: 'A swept flight helm with a long dorsal fin and a raked visor. Built to look fast standing still.' },
  { id: 'crown', name: 'ARCHON CROWN', maker: EDEN, role: 'HEADGEAR', model: 'crown', weight: 1, armour: 40, tag: 'RADIANT', price: 1200,
    blurb: 'A halo of glowing spires and a floating core, salvaged from the machines you came here to stop.' },
];

// Pure looks. `color` is what the swatch and the plate wear; weight is always zero.
const DECALS = [
  { id: 'none', name: 'NO MARKINGS', maker: 'FACTORY', role: 'DECAL', model: 'none', weight: 0, tag: 'CLEAN', price: 0, color: '#8fa7b0', blurb: 'Bare plates. Nothing on the shoulders or the chest.' },
  { id: 'chevron', name: 'KESTREL CHEVRONS', maker: KESTREL, role: 'DECAL', model: 'chevron', weight: 0, tag: 'AMBER', price: 80, color: '#f2b04a', blurb: 'Stacked amber chevrons on both shoulders and a pair on the chest.' },
  { id: 'roundel', name: 'RIDGE ROUNDEL', maker: KESTREL, role: 'DECAL', model: 'roundel', weight: 0, tag: 'RED', price: 80, color: '#e5563f', blurb: 'A red ringed roundel on each shoulder and the chest plate.' },
  { id: 'hazard', name: 'HAZARD BAND', maker: KESTREL, role: 'DECAL', model: 'hazard', weight: 0, tag: 'YELLOW', price: 100, color: '#f2c230', blurb: 'Yellow and black warning stripes along both shoulders and across the chest.' },
  { id: 'tally', name: 'TALLY MARKS', maker: KESTREL, role: 'DECAL', model: 'tally', weight: 0, tag: 'WHITE', price: 90, color: '#e8f0f2', blurb: 'Rows of kill tallies scratched into the left shoulder, with a long bar on the right.' },
  { id: 'wings', name: 'EDEN WINGS', maker: EDEN, role: 'DECAL', model: 'wings', weight: 0, tag: 'GREEN', price: 160, color: '#7fe39a', blurb: 'Swept green wings across the chest plate and a leaf on each shoulder.' },
  { id: 'star', name: 'ACE STAR', maker: KESTREL, role: 'DECAL', model: 'star', weight: 0, tag: 'GOLD', price: 200, color: '#ffd36b', blurb: 'A gold five-point star on the chest and both shoulders. For pilots with a count to show.' },
  { id: 'skull', name: 'DEATH HEAD', maker: VANTA, role: 'DECAL', model: 'skull', weight: 0, tag: 'BONE', price: 240, color: '#e8e2d0', blurb: 'A bone-white skull on the chest and crossed bars on the shoulders. Subtle it is not.' },
  { id: 'eye', name: 'ARCHON EYE', maker: EDEN, role: 'DECAL', model: 'eye', weight: 0, tag: 'GLOWING', price: 300, color: '#ff5fb0', blurb: 'A glowing magenta eye on the chest, watching whatever you are looking at.' },
];

// Boost trails recolour the thruster flame (the flame you see when you boost or fly). 'auto' follows the lights.
const TRAILS = [
  { id: 'auto', name: 'MATCH LIGHTS', maker: 'FACTORY', role: 'BOOST TRAIL', model: 'auto', weight: 0, tag: 'DEFAULT', price: 0, color: null, blurb: 'The flame takes the colour of your lights.' },
  { id: 'ion', name: 'ION BLUE', maker: ASTER, role: 'BOOST TRAIL', model: 'tint', weight: 0, tag: 'COOL', price: 90, color: '#4aa8ff', blurb: 'A cold blue flame with a white-hot core.' },
  { id: 'solar', name: 'SOLAR GOLD', maker: KESSLER, role: 'BOOST TRAIL', model: 'tint', weight: 0, tag: 'WARM', price: 90, color: '#ffcf4a', blurb: 'A warm gold exhaust that looks like a sunrise.' },
  { id: 'verdant', name: 'VERDANT', maker: EDEN, role: 'BOOST TRAIL', model: 'tint', weight: 0, tag: 'GREEN', price: 110, color: '#6dff9a', blurb: 'A bright green flame, straight out of the Eden canopy.' },
  { id: 'ember', name: 'EMBER RED', maker: VANTA, role: 'BOOST TRAIL', model: 'tint', weight: 0, tag: 'HOT', price: 130, color: '#ff5a3a', blurb: 'A furnace-red burn that leaves a mean line across the sky.' },
  { id: 'plasma', name: 'PLASMA VIOLET', maker: VANTA, role: 'BOOST TRAIL', model: 'tint', weight: 0, tag: 'RARE', price: 160, color: '#c27bff', blurb: 'An electric violet trail with a pale core.' },
  { id: 'pulse', name: 'WHITE PULSE', maker: ASTER, role: 'BOOST TRAIL', model: 'tint', weight: 0, tag: 'BRIGHT', price: 200, color: '#ffffff', blurb: 'A blinding white flame. You will be seen from orbit.' },
];

export const POOLS = { head: HEADS, legs: LEGS, torso: TORSOS, back: BACKS, rArm: ARM_WEAPONS, lArm: ARM_WEAPONS, rShoulder: SHOULDER_WEAPONS, lShoulder: SHOULDER_WEAPONS, decal: DECALS, trail: TRAILS };
export const partsFor = slot => POOLS[slot] || [];
export const isWeaponSlot = slot => ['rArm', 'lArm', 'rShoulder', 'lShoulder'].includes(slot);

export const DEFAULT_BUILD = Object.freeze({ head: 'visor', legs: 'rj7', torso: 't40', back: 'helion', rArm: 'fk40', lArm: 'mx9', rShoulder: 'hx2', lShoulder: 'none', decal: 'none', trail: 'auto' });

export const partById = (slot, id) => partsFor(slot).find(p => p.id === id) || null;

// Any slot with an unknown or missing part falls back to the default, so corrupt saves can never break a spawn.
export function sanitizeBuild(build) {
  const clean = {};
  for (const slot of PART_SLOTS) clean[slot] = partById(slot, build?.[slot]) ? build[slot] : DEFAULT_BUILD[slot];
  return clean;
}
// Whole-build equality, and equality of the gear alone (head, decal and trail are looks and do not rename a build).
export const sameBuild = (a, b) => PART_SLOTS.every(slot => a?.[slot] === b?.[slot]);
export const sameGear = (a, b) => GEAR_SLOTS.every(slot => a?.[slot] === b?.[slot]);

// Ready-made loadouts. They name gear only; looks (head, decal, trail) stay as the pilot chose them.
export const PRESETS = [
  { id: 'standard', name: 'STANDARD ISSUE', blurb: 'Gatling, flak and a helix missile on the factory frame.', build: { ...DEFAULT_BUILD } },
  { id: 'brawler', name: 'BRAWLER', blurb: 'Armour and close-range cutters. Walk up and take what you want.', build: { legs: 'at9', torso: 'b90', back: 'aegis', rArm: 'hc1', lArm: 'lc7', rShoulder: 'sr6', lShoulder: 'cm12' } },
  { id: 'skirmisher', name: 'SKIRMISHER', blurb: 'Low, quick and cool. Strafe around a fight and stitch it up.', build: { legs: 'arachne', torso: 'c7', back: 'helion', rArm: 'px3', lArm: 'gx6', rShoulder: 'sr6', lShoulder: 'none' } },
  { id: 'siege', name: 'SIEGE', blurb: 'Mortar and thunderclap. Everything dies in a blast radius.', build: { legs: 'at9', torso: 'b90', back: 'vane', rArm: 'hc1', lArm: 'mp6', rShoulder: 'th3', lShoulder: 'hx2' } },
  { id: 'ghost', name: 'GHOST', blurb: 'Light chassis, precise guns and flares for when it goes wrong.', build: { legs: 'arachne', torso: 'c7', back: 'vane', rArm: 'px3', lArm: 'px3', rShoulder: 'hx2', lShoulder: 'cm12' } },
  { id: 'railrunner', name: 'RAILRUNNER', blurb: 'Sprinter legs, a railgun and a burst carbine. Run, line up, and delete the biggest thing in view.', build: { legs: 'sprint', torso: 'c7', back: 'ring', rArm: 'rg5', lArm: 'bc4', rShoulder: 'hr4', lShoulder: 'none' } },
].map(preset => ({ ...preset, build: sanitizeBuild(preset.build) }));

export function buildName(build) { return PRESETS.find(p => sameGear(p.build, build))?.name || 'CUSTOM BUILD'; }

export function resolveBuild(build) {
  const clean = sanitizeBuild(build), parts = {};
  for (const slot of PART_SLOTS) parts[slot] = partById(slot, clean[slot]);
  return parts;
}

// ---- Ownership -------------------------------------------------------------------------------------------------------
// An item id names one purchasable thing. An arm weapon is one item for either arm, and so is a shoulder weapon.
const GROUP_OF = { head: 'head', legs: 'legs', torso: 'torso', back: 'back', rArm: 'arm', lArm: 'arm', rShoulder: 'shoulder', lShoulder: 'shoulder', decal: 'decal', trail: 'trail' };
export const itemGroup = slot => GROUP_OF[slot] || null;
export const itemId = (slot, partId) => `${GROUP_OF[slot]}:${partId}`;
export const ownedPart = (slot, part, owned) => !!part && (part.price === 0 || (owned instanceof Set ? owned : new Set(owned || [])).has(itemId(slot, part.id)));

// Keeps the parts a pilot owns (or that cost nothing) and swaps every other slot back to the factory default.
export function ownedBuild(build, owned) {
  const have = owned instanceof Set ? owned : new Set(owned || []), clean = sanitizeBuild(build), out = {};
  for (const slot of PART_SLOTS) out[slot] = ownedPart(slot, partById(slot, clean[slot]), have) ? clean[slot] : DEFAULT_BUILD[slot];
  return out;
}
// Slots of a build that the pilot does not own.
export const lockedSlots = (build, owned) => { const have = ownedBuild(build, owned), clean = sanitizeBuild(build); return PART_SLOTS.filter(slot => have[slot] !== clean[slot]); };

// A deterministic generator keeps random builds testable; the UI passes Math.random. `owned` limits the draw to owned parts.
export function randomBuild(rng = Math.random, owned = null) {
  const build = {}, have = owned && (owned instanceof Set ? owned : new Set(owned));
  for (const slot of PART_SLOTS) { const pool = partsFor(slot).filter(p => !have || ownedPart(slot, p, have)); build[slot] = pool[Math.floor(rng() * pool.length) % pool.length].id; }
  return build;
}

const BASE_ARMOUR = 1200, FRAME_MASS = 14;

export const armDps = part => (part?.fire ? part.fire.damage * part.fire.pellets / part.fire.cd : 0);
export const shoulderDps = part => (part?.fire && part.fire.count ? part.fire.damage * part.fire.count / part.fire.cd : 0);
export const armHeatRate = part => (part?.fire ? part.fire.heat / part.fire.cd * 100 : 0);

export function computeStats(build) {
  const p = resolveBuild(build);
  const mass = FRAME_MASS + PART_SLOTS.reduce((sum, slot) => sum + p[slot].weight, 0);
  const armour = BASE_ARMOUR + p.legs.armour + p.torso.armour + p.back.armour + p.head.armour;
  const dps = armDps(p.lArm) + armDps(p.rArm) + shoulderDps(p.lShoulder) + shoulderDps(p.rShoulder);
  const cooling = Math.round(p.torso.cooling * p.back.cooling / 100);
  return { mass: Math.round(mass * 10) / 10, armour: Math.round(armour), dps: Math.round(dps), heatRoom: p.torso.heatRoom, cooling, speed: p.legs.speed, boost: p.back.boost };
}

const REFERENCE = computeStats(DEFAULT_BUILD);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Multipliers the simulation applies. The default build is exactly 1 on every axis, so the base game plays as it always did.
export function gameplayMods(build) {
  const s = computeStats(build);
  return {
    speed: clamp(s.speed * (1 - (s.mass - REFERENCE.mass) * .004), .8, 1.25),
    boost: s.boost,
    damageTaken: clamp(Math.pow(REFERENCE.armour / s.armour, .7), .72, 1.35),
    heatGain: REFERENCE.heatRoom / s.heatRoom,
    cooling: s.cooling / REFERENCE.cooling,
  };
}

export function describeFire(build) {
  const p = resolveBuild(build), shoulders = [p.rShoulder, p.lShoulder].filter(x => x.fire).map(x => x.name);
  return [
    { key: 'LMB', text: p.lArm.fire ? p.lArm.name : 'NO GUN' },
    { key: 'RMB', text: p.rArm.fire ? p.rArm.name : 'NO GUN' },
    { key: 'G', text: shoulders.length ? shoulders.join(' + ') : 'NO SHOULDER MOUNT' },
  ];
}

// Per-part stat bars shown in the list and detail panels. max is the highest value in the pool so bars compare across parts.
// Decals and trails have no numbers: they return no bars.
export function partBars(slot, part) {
  const pool = partsFor(slot), top = key => Math.max(...pool.map(p => key(p)));
  const bar = (label, value, max, unit, better = 'high', digits = 0) => { const r = v => Math.round(v * 10 ** digits) / 10 ** digits; return { label, value: r(value), max: r(max), unit, better }; };
  if (slot === 'rArm' || slot === 'lArm') return [
    bar('DAMAGE', armDps(part), top(armDps), '/s'), bar('RANGE', part.range, top(p => p.range), ' m'),
    bar('HEAT', armHeatRate(part), top(armHeatRate), '%/s', 'low'), bar('WEIGHT', part.weight, top(p => p.weight), ' t', 'low', 1),
  ];
  if (slot === 'rShoulder' || slot === 'lShoulder') return [
    bar('DAMAGE', shoulderDps(part), top(shoulderDps), '/s'), bar('RANGE', part.range, top(p => p.range), ' m'),
    bar('COOLDOWN', part.fire?.cd || 0, top(p => p.fire?.cd || 0), ' s', 'low', 1), bar('WEIGHT', part.weight, top(p => p.weight), ' t', 'low', 1),
  ];
  if (slot === 'head') return [bar('ARMOUR', part.armour, top(p => p.armour), ''), bar('WEIGHT', part.weight, top(p => p.weight), ' t', 'low', 1)];
  if (slot === 'legs') return [bar('ARMOUR', part.armour, top(p => p.armour), ''), bar('SPEED', part.speed * 100, top(p => p.speed * 100), '%'), bar('WEIGHT', part.weight, top(p => p.weight), ' t', 'low', 1)];
  if (slot === 'torso') return [bar('ARMOUR', part.armour, top(p => p.armour), ''), bar('HEAT ROOM', part.heatRoom, top(p => p.heatRoom), '%'), bar('COOLING', part.cooling, top(p => p.cooling), '%'), bar('WEIGHT', part.weight, top(p => p.weight), ' t', 'low', 1)];
  if (slot === 'back') return [bar('BOOST', part.boost * 100, top(p => p.boost * 100), '%'), bar('COOLING', part.cooling, top(p => p.cooling), '%'), bar('ARMOUR', part.armour, top(p => p.armour), ''), bar('WEIGHT', part.weight, top(p => p.weight), ' t', 'low', 1)];
  return [];
}

// Before/after totals for the header and the detail panel. Positive delta is an increase, `good` says whether that helps.
export function statDeltas(before, after) {
  const mk = (key, better) => { const d = Math.round((after[key] - before[key]) * 10) / 10; return { key, delta: d, good: d === 0 ? null : better === 'high' ? d > 0 : d < 0 }; };
  return { mass: mk('mass', 'low'), armour: mk('armour', 'high'), dps: mk('dps', 'high') };
}
