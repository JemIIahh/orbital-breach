// Street-level life-after-people for Meridian: wrecks, barricades, market stalls, signals, cables, hydrants, overgrowth.
// Everything is a box or cylinder pushed through the kit, so it adds no draw calls beyond the shared batches. Pieces
// marked solid register collision through the same box() mechanism as the buildings.
import * as T from 'three';
import { glowMaterial, ANIM } from './city-shaders.js';
import { hash, blocked, TOWER_ROWS, towerHeight } from './city-layout.js';

// "prop" is lit paint, "glow" is HDR emissive trim and "facade" carries the procedural windows. Per-instance colours
// (InstancedMesh.setColorAt) give variety, so the city stays at a handful of instanced draw batches.
export function cityPropMaterials(uniforms) {
  return { vehicleGlass: new T.MeshStandardMaterial({color:'#688c99',metalness:.68,roughness:.19}), vehiclePaint: new T.MeshStandardMaterial({color:'#ffffff',metalness:.55,roughness:.32}), prop: new T.MeshStandardMaterial({ color: '#ffffff', roughness: .72, metalness: .12 }), glow: glowMaterial(uniforms) };
}
const paint = (hex, shadow = true) => ({ base: 'prop', color: new T.Color(hex), shadow });
const auto = hex => ({base:'vehiclePaint',color:new T.Color(hex)});
const wall = hex => ({ base: 'facade', color: new T.Color(hex) });
const emit = (hex, intensity, anim = 0) => ({ base: 'glow', color: new T.Color(hex).multiplyScalar(intensity), anim });
export const PROP_TINTS = {
  autoGlass:{base:'vehicleGlass',color:new T.Color('#ffffff')},
  rubber: paint('#13181b'), rust: paint('#7a4d37'), bark: paint('#5a4636'), foliage: paint('#3f6e4a'), foliageLight: paint('#5f8f55'), foliageDark: paint('#2c4d33'),
  weed: paint('#4f7f3a', false), weedDry: paint('#8a8a45', false), vine: paint('#27522c', false), moss: paint('#3a5a2a', false),
  carRed: auto('#8f3b34'), carBlue: auto('#2f4f73'), carWhite: auto('#c9d0d3'), carYellow: auto('#b0912f'), carGreen: auto('#3c6652'), carGrey: auto('#6b7378'),
  wire: paint('#2a3236', false), charred: paint('#1b1a19'), charredRust: paint('#4a2f22'), shelter: paint('#31434d'), kerb: paint('#a9a493'), trim: paint('#d7c3a1'), green: paint('#527560'),
  barrier: paint('#9aa0a0'), rubble: paint('#7d8584'), rubbleDark: paint('#5d6362'), hydrant: paint('#b53a2d'), binGreen: paint('#2c5a43'), binBlue: paint('#274e7a'),
  binGrey: paint('#4a5357'), steel: paint('#6a757a'), steelDark: paint('#2f383d'), wood: paint('#7c5a3a'), woodDark: paint('#4d3828'), plaster: paint('#b9b2a0'),
  sand: paint('#a79468'), sandDark: paint('#8a7850'), canvasRed: paint('#a8443b'), canvasTeal: paint('#2f7d7a'), canvasYellow: paint('#c79a35'),
  canvasWhite: paint('#cfc9b8'), canvasBlue: paint('#35588a'), canvasGreen: paint('#47773f'), paintWhite: paint('#bdbab0'), paintYellow: paint('#d4a82a'),
  orange: paint('#e2711d'), tankRust: paint('#80533c'), tankWood: paint('#6a5240'), ac: paint('#aab1b3'), acDark: paint('#4b5256'), crate: paint('#8a6a44'),
  crateGrey: paint('#59636a'), paper: paint('#d5d2c6', false), produceRed: paint('#b8392e'), produceGreen: paint('#5f9a3d'), produceYellow: paint('#d6a92f'), produceOrange: paint('#d97a22'),
  slab: paint('#59646a'), seat: paint('#3b5f7a'), seatRed: paint('#8a3b3b'), pennantA: paint('#b83e36'), pennantB: paint('#d6a334'), pennantC: paint('#2f6f8f'),
  signAmber: emit('#ffa23d', 1.05), signMagenta: emit('#ff3f98', 1.1), signGreen: emit('#3fe28a', .95), signRed: emit('#ff3d2e', 1.8), litWindow: emit('#ffc880', .95),
  warn: emit('#ffa23d', 1.1), lamp: emit('#fff1c9', 1.8), light: emit('#5bc3d2', 2.2),
  neonCyan: emit('#3fd9e8', 1.3), neonBlue: emit('#4b7bff', 1.3), neonPink: emit('#ff4aa8', 1.3), neonAmber: emit('#ffb040', 1.3),
  flickerPink: emit('#ff4aa8', 1.5, ANIM.flicker), flickerCyan: emit('#3fd9e8', 1.5, ANIM.flicker), flickerAmber: emit('#ffb040', 1.5, ANIM.flicker),
  beaconRed: emit('#ff3d2e', 3.2, ANIM.beacon), beaconWhite: emit('#fff6e0', 3.2, ANIM.beacon), pulseAmber: emit('#ffa23d', 1.3, ANIM.pulse),
  signalAmber: emit('#ffa23d', 2.2, ANIM.hazard), signalDead: emit('#3a2418', .5), signalRed: emit('#ff3d2e', 1.6), signalGreen: emit('#3fe28a', .9),
  shopWarm: emit('#ffc880', .7), shopCool: emit('#9fe6ff', .55), shopDim: emit('#6d5a45', .2), ember: emit('#ff6a1f', 1.7, ANIM.pulse),
  arenaChase: emit('#ffb24a', 1.6, ANIM.chase), arenaGate: emit('#ff9a30', 1.7, ANIM.gate), arenaStrobe: emit('#ffb340', 3.2, ANIM.strobe),
  arenaCyan: emit('#5be8ff', 1.8, ANIM.pulse), arenaWhite: emit('#f4fbff', 2.6),
  wallConcrete: wall('#8d9798'), wallSand: wall('#a4977e'), wallBrick: wall('#8e5a47'), wallSlate: wall('#566670'), wallTeal: wall('#5d7f84'),
  wallPlaster: wall('#b7b3a6'), wallOlive: wall('#6f7566'), wallDark: wall('#3f4a51'), wallRose: wall('#a07a70'),
};
export const WALL_TINTS = ['wallConcrete', 'wallSand', 'wallBrick', 'wallSlate', 'wallTeal', 'wallPlaster', 'wallOlive', 'wallDark', 'wallRose'];

export function addCityProps(kit, ctx, fp) {
  const { box, cyl } = kit, H = hash;
  const pick = (list, n) => list[Math.floor(H(n) * list.length) % list.length];
  const carColors = ['carRed', 'carBlue', 'carWhite', 'carYellow', 'carGreen', 'carGrey'];

  // Detailed vehicles share instanced paint, glass, rubber and trim batches.
  const car = (x,z,along,color,mode='whole') => {
    if(blocked(x,z,6))return;
    const ry=along==='z'?0:Math.PI/2, c=Math.cos(ry),sn=Math.sin(ry),flipped=mode==='flip',burnt=mode==='burnt';
    fp.claim(x,z,along==='z'?1.05:2.3,along==='z'?2.3:1.05);
    // Keep collision as two simple hulls; cosmetic details never obstruct navigation.
    kit.collider(x,.65,z,along==='z'?1.9:4.4,1.05,along==='z'?4.4:1.9);
    kit.collider(x,flipped?1.6:1.41,z,along==='z'?1.64:2.3,flipped?.9:.84,along==='z'?2.3:1.64);
    const shape=(kind,mat,px,y,pz,sx,sy,sz,rz=0)=>kit.shaped(kind,mat,x+c*px+sn*pz,flipped?2.05-y:y,z-sn*px+c*pz,sx,sy,sz,false,[0,ry,flipped?Math.PI+rz:rz]);
    const p=(mat,px,y,pz,sx,sy,sz)=>shape('round',mat,px,y,pz,sx,sy,sz);
    const body=burnt?'charredRust':color;
    shape('round',body,0,.72,0,1.98,.65,4.48);
    p(body,0,1.02,-1.5,1.9,.22,1.25);p(body,0,.98,1.7,1.9,.2,.85);
    shape('cabin',burnt?'charred':'autoGlass',0,1.37,.05,1.78,.75,2.55);
    p(body,0,1.78,.05,1.49,.1,1.63);
    for(const side of [-1,1]){
      // Door seams, B-pillars, handles, mirrors and rocker panels.
      p('steelDark',side*.88,1.4,.13,.06,.57,.07);
      p(body,side*.96,.98,.1,.04,.035,2.45);
      p('steel',side*.97,1.09,.6,.03,.055,.22);
      p(body,side*1.05,1.25,-.85,.24,.14,.28);
      p('steelDark',side*.94,.39,0,.08,.13,2.65);
      for(const wz of [-1.43,1.43]){
        shape('cyl','rubber',side*.98,.44,wz,.87,.28,.87,Math.PI/2);
        shape('cyl','steel',side*1.13,.44,wz,.48,.025,.48,Math.PI/2);
        shape('cyl','steelDark',side*1.15,.44,wz,.2,.035,.2,Math.PI/2);
      }
      p(burnt?'charred':'lamp',side*.64,.91,-2.24,.4,.16,.035);
      p('signRed',side*.7,.91,2.24,.3,.14,.035);
    }
    for(const end of [-1,1])p('steelDark',0,.5,end*2.24,1.82,.18,.13);
    p('rubber',0,.72,-2.255,.78,.19,.035);p('paintWhite',0,.66,2.26,.4,.12,.022);
    if(burnt){ctx.vents.push({x,y:1.8,z,kind:'smoke'});p('ember',0,1.05,-1.5,.4,.03,.5)}
  };
  const avenue=[[-10,-84],[12,-72],[-13,-58],[8.5,-38],[-9,-24],[12,-2],[-11,4],[9,22],[-9.5,40],[12.5,52],[-11,65],[8,80]];
  const modes=['whole','whole','burnt','whole','flip','whole','whole','burnt','whole','whole','flip','whole'];
  avenue.forEach(([x,z],i)=>car(x,z,'z',carColors[i%6],modes[i]));
  [[-26,-50],[28,-10],[-28,30],[27,70],[32,-50],[-30,-10]].forEach(([x,z],i)=>car(x,z,'x',carColors[(i+2)%6],i===1?'burnt':i===4?'flip':'whole'));
  const bus=(x,z)=>{
    if(blocked(x,z,8)||!fp.free(x,z,1.5,5.6))return;fp.claim(x,z,1.4,5.5);
    kit.collider(x,1.4,z,2.5,2.5,11);
    const r=(mat,dx,y,dz,sx,sy,sz)=>kit.shaped('round',mat,x+dx,y,z+dz,sx,sy,sz);
    r('carGreen',0,1.42,0,2.5,2.55,11);
    r('carWhite',0,2.86,0,2.52,.24,10.9);r('steelDark',0,.42,0,2.5,.32,10.8);
    r('carWhite',0,1.15,0,2.53,.15,10.8);
    for(const side of [-1,1]){
      for(let i=0;i<7;i++)r('autoGlass',side*1.26,2.12,-4.35+i*1.38,.035,1.02,1.2);
      // Passenger doors and step wells, with separate panes.
      for(const dz of [-3.1,2.6]){
        r('steelDark',side*1.28,1.43,dz,.04,2.25,1.15);
        for(const o of [-.27,.27])r('autoGlass',side*1.31,1.91,dz+o,.03,1.11,.45);
        r('steel',side*1.32,.4,dz,.06,.07,1.03);
      }
      for(const dz of [-3.65,3.65]){
        kit.shaped('cyl','rubber',x+side*1.22,.6,z+dz,1.16,.32,1.16,false,[0,0,Math.PI/2]);
        kit.shaped('cyl','steel',x+side*1.39,.6,z+dz,.67,.025,.67,false,[0,0,Math.PI/2]);
      }
      r('steelDark',side*1.43,2.45,-5.05,.23,.32,.25);
      r('lamp',side*.94,.87,-5.52,.32,.19,.04);r('signRed',side*.95,.87,5.52,.24,.27,.04);
    }
    for(const end of [-1,1])r('autoGlass',0,2.02,end*5.51,2.17,1.18,.035);
    r('steelDark',0,2.65,-5.53,1.9,.28,.04);r('signAmber',0,2.65,-5.56,1.5,.13,.025);
    r('ac',0,3.08,.7,1.55,.25,2.5);
    for(let i=0;i<8;i++)r('steelDark',0,.8+i*.07,5.53,1.4,.025,.025);
  };
  bus(-13.2,14);bus(13.6,62);

  // --- Jersey barriers form chicanes that break up long sight lines down the avenue. -----------------------------
  const barrier = (x, z, length) => { if (blocked(x, z, 5) || !fp.free(x, z, length / 2, .35, .3)) return; fp.claim(x, z, length / 2, .35); box('barrier', x, .55, z, length, 1.1, .7, true); box('warn', x, 1.12, z, length * .92, .07, .74); };
  for (const z of [-76, -20, 36]) { barrier(-9.5, z, 6.5); barrier(9.5, z, 6.5); barrier(0, z + 3, 3); }
  for (const z of [-44, 14, 58]) { barrier(-14, z, 3.2); barrier(14, z, 3.2); }

  // Sandbag emplacements: a solid core with courses of bags laid over it. They are crescents of low cover.
  const sandbags = (x, z, length, along = 'x') => {
    if (blocked(x, z, 7)) return;
    const long = along === 'x', hx = long ? length / 2 : .6, hz = long ? .6 : length / 2;
    if (!fp.free(x, z, hx, hz, .8)) return;
    fp.claim(x, z, hx, hz);
    box('sandDark', x, .55, z, long ? length : .9, 1.1, long ? .9 : length, true);
    const count = Math.round(length / .95);
    for (let layer = 0; layer < 3; layer++) for (let i = 0; i < count; i++) {
      const o = -length / 2 + (i + .5 + (layer % 2) * .5) * (length / count);
      if (Math.abs(o) > length / 2 - .2) continue;
      box(H(i * 7 + layer * 3 + x) > .5 ? 'sand' : 'sandDark', long ? x + o : x, .2 + layer * .34, long ? z : z + o, long ? .95 : .62, .34, long ? .62 : .95, false, [0, (H(i + layer) - .5) * .2, 0]);
    }
    box('woodDark', x + (long ? 0 : .8), 1.25, z + (long ? .8 : 0), .06, .5, .06); box('signRed', x + (long ? 0 : .8), 1.55, z + (long ? .8 : 0), .5, .12, .04);
  };
  sandbags(-11.5, -36, 6.5); sandbags(11, -30, 5.5, 'z'); sandbags(-4.5, 27, 6); sandbags(13, 36, 5, 'z'); sandbags(5.5, 62, 5.5); sandbags(-8.5, 78, 6);
  sandbags(-20.5, -74, 5, 'z'); sandbags(20.5, -80, 5, 'z');

  // Roadworks and closures: striped A-frame barricades, cones and flashing amber lights at the cross-street mouths.
  const barricade = (x, z, ry = 0) => {
    if (blocked(x, z, 5)) return;
    for (let i = 0; i < 3; i++) box(i % 2 ? 'paintWhite' : 'orange', x, .55 + i * .22, z, 2.1, .18, .06, false, [0, ry, 0]);
    for (const s of [-.9, .9]) box('steelDark', x + Math.cos(ry) * s, .4, z - Math.sin(ry) * s, .07, .8, .07);
    box('signalAmber', x + Math.cos(ry) * .9, .98, z - Math.sin(ry) * .9, .16, .16, .16);
  };
  [[-7, -43.5], [3.5, -43.5, .2], [-5, 16.5], [6, 16.5, -.2], [-3.5, 37], [7.5, -16.5], [-8, 63.5, .15]].forEach(([x, z, ry], i) => barricade(x, z, ry || 0));
  for (let i = 0; i < 18; i++) {
    const x = (H(i * 9) > .5 ? 1 : -1) * (3 + H(i * 5 + 2) * 12), z = -90 + H(i * 13) * 175;
    if (blocked(x, z, 6)) continue;
    box('orange', x, .26, z, .26, .52, .26, false, [0, H(i) * 3, 0]); box('paintWhite', x, .32, z, .27, .08, .27, false, [0, H(i) * 3, 0]); box('orange', x, .03, z, .42, .05, .42, false, [0, H(i) * 3, 0]);
  }

  // --- Bus shelters and benches on the pavement. ------------------------------------------------------------------
  const shelter = (x, z, side) => {
    if (blocked(x, z, 8)) return;
    box('shelter', x, 3.05, z, 3.4, .16, 6.6); box('glass', x + side * 1.55, 1.6, z, .08, 2.8, 6.2);
    for (const dz of [-3, 3]) box('shelter', x - side * 1.4, 1.5, z + dz, .16, 3, .16);
    box('kerb', x, .5, z, 1.1, .14, 4.6); box('signAmber', x + side * 1.5, 2.2, z, .06, 1.3, 2.6);
    box('wood', x - side * .2, .5, z, .5, .06, 3); box('steelDark', x - side * .2, .26, z - 1.2, .4, .5, .06); box('steelDark', x - side * .2, .26, z + 1.2, .4, .5, .06);
  };
  shelter(-21.5, -22, -1); shelter(21.5, -22, 1); shelter(-21.5, 48, -1); shelter(21.5, 54, 1);
  const bench = (x, z, side) => {
    if (blocked(x, z, 4) || !fp.free(x, z, .6, 1.1, .3)) return; fp.claim(x, z, .6, 1.1);
    box('wood', x, .48, z, .55, .07, 2.1); box('wood', x + side * .26, .85, z, .07, .5, 2.1);
    for (const dz of [-.8, .8]) box('steelDark', x, .24, z + dz, .46, .48, .08);
  };

  // --- Irregular branching street trees with clustered crowns. -------------------------------
  for (let z = -92; z <= 86; z += 14) for (const side of [-1, 1]) {
    const x = side * (20.5 + H(z + side) * 1.6), zz = z + H(z * 3 + side) * 3;
    if (blocked(x, zz, 8) || Math.abs(((zz + 30) % 40) - 13) < 4 || !fp.free(x, zz, .5, .5, .4)) continue;
    const lift = H(zz) * .6;
    fp.claim(x, zz, .5, .5);
    cyl('bark',x,1.8,zz,.24,3.6,true);
    for(let i=0;i<5;i++){
      const a=i*2.4+H(zz)*3,dx=Math.cos(a)*(i?1.05:0),dz=Math.sin(a)*(i?1.1:0),y=i?4.1+lift+H(i+zz)*1.8:4.4+lift;
      kit.line('bark',x,2.2,zz,x+dx,y,zz+dz,.16);
      kit.shaped('leaf',i%3===0?'foliageLight':i%3===1?'foliage':'foliageDark',x+dx,y+.4,zz+dz,i?2.7:4.1,2.8,i?2.6:4.1,'body');
    }
    // Raised tree bed anchors the trunk to the pavement.
    box('steelDark',x,.08,zz,1.2,.08,1.2);

  }

  // --- Pavement furniture beside the shopfronts: bins, dumpsters, hydrants, benches, newsstands. ----------------------
  TOWER_ROWS.forEach((z0, row) => [-1, 1].forEach(side => {
    const n = row * 17 + side * 5, xf = side * 27.6;
    // hydrants and bollards on the kerb
    const hz = z0 + (H(n + 1) - .5) * 16;
    if (!blocked(side * 19.9, hz, 4)) { cyl('hydrant', side * 19.9, .36, hz, .17, .72); cyl('hydrant', side * 19.9, .78, hz, .21, .12); box('hydrant', side * 19.9, .55, hz, .5, .14, .14); }
    // bins
    for (let k = 0; k < 2; k++) {
      const bz = z0 + (H(n + 4 + k) - .5) * 20, bx = xf + (H(n + k) - .5) * .8;
      if (blocked(bx, bz, 4)) continue;
      const tip = H(n + 9 + k) > .8;
      cyl(pick(['binGreen', 'binBlue', 'binGrey'], n + k), bx, tip ? .38 : .55, bz, .38, tip ? .76 : 1.1, false, tip ? [0, 0, 1.45] : null); if (!tip) cyl('steelDark', bx, 1.13, bz, .4, .08);
      else for (let i = 0; i < 5; i++) box(i % 2 ? 'paper' : 'crateGrey', bx - side * (.7 + H(i + n) * 1.4), .06, bz + (H(i * 3 + n) - .5) * 1.4, .3, .1, .25, false, [0, H(i) * 6, 0]);
    }
    // dumpster (solid, kept hard against the building so it never narrows the avenue)
    const dz = z0 + (H(n + 11) > .5 ? 9 : -9) + (H(n + 12) - .5) * 2;
    if (!blocked(xf, dz, 4)) {
      fp.claim(xf, dz, .7, 1.1); box(pick(['binGreen', 'binBlue', 'rust'], n + 2), xf, .7, dz, 1.3, 1.1, 2.2, true); box('steelDark', xf - side * .05, 1.3, dz, 1.4, .12, 2.3, false, [0, 0, side * -.12]);
      for (const sz of [-.9, .9]) box('rubber', xf + side * .55, .15, dz + sz, .12, .3, .3);
    }
    if (row % 2 === side * .5 + .5) bench(side * 26.6, z0 + (H(n + 3) - .5) * 6, side);
    // newsstand kiosk: a small solid shop with a glowing sign and magazine racks
    if ((row + (side > 0 ? 1 : 0)) % 3 === 1) {
      const kz = z0 + 4.5 * (H(n + 6) > .5 ? 1 : -1), kx = side * 25.2;
      if (!blocked(kx, kz, 5) && fp.free(kx, kz, .9, 1.3)) {
        fp.claim(kx, kz, .9, 1.3);
        box('steel', kx, 1.05, kz, 1.5, 2.1, 2.4, true); box(pick(['canvasRed', 'canvasYellow', 'canvasBlue'], n), kx, 2.3, kz, 1.9, .14, 2.8);
        box('signAmber', kx - side * .78, 1.6, kz, .06, .6, 1.8); box('shopWarm', kx - side * .78, 1.0, kz, .06, .5, 1.9);
        for (let i = 0; i < 4; i++) box(pick(['produceRed', 'canvasBlue', 'produceYellow', 'produceGreen'], n + i), kx - side * .82, 1.35, kz - .9 + i * .6, .08, .35, .42);
      }
    }
  }));

  // --- Traffic signals at each cross street, flashing amber on emergency power. -----------------------------------------
  for (const zc of [-50, -10, 30, 70]) for (const sz of [-1, 1]) for (const side of [-1, 1]) {
    const px = side * 18.6, pz = zc + sz * 8.4, dead = H(zc + sz * 3 + side) > .6;
    cyl('steelDark', px, 3.1, pz, .1, 6.2); box('steelDark', px - side * 2.5, 5.85, pz, 5, .13, .13);
    for (const reach of [2.6, 4.7]) {
      const cx = px - side * reach;
      box('steelDark', cx, 5.3, pz, .42, 1.15, .4);
      for (const f of [-1, 1]) {
        box(dead ? 'signalDead' : 'signalRed', cx, 5.65, pz + f * .21, .24, .24, .05); box(dead ? 'signalDead' : 'signalAmber', cx, 5.3, pz + f * .21, .24, .24, .05);
        box('signalDead', cx, 4.95, pz + f * .21, .24, .24, .05);
      }
    }
    // stop line and zebra
    if (side === 1) {
      box('paintWhite', 0, .045, zc + sz * 8.2, 32, .03, .35);
      for (let i = -9; i <= 9; i++) box('paintWhite', i * 1.6, .045, zc + sz * 9.4, .7, .03, 2);
    }
  }

  // --- Road markings, manholes and arrows. -----------------------------------------------------------------------------
  for (let z = -95; z < 130; z += 9) for (const x of [-15.8, 15.8]) box('paintWhite', x, .045, z, .16, .03, 7);
  for (const z of [-82, -40, 2, 44, 84]) for (const x of [-8, 8]) {
    box('paintWhite', x, .045, z, .35, .03, 3.2);
    box('paintWhite', x - .7, .045, z + 1.75, .35, .03, 1.5, false, [0, -.8, 0]); box('paintWhite', x + .7, .045, z + 1.75, .35, .03, 1.5, false, [0, .8, 0]);
  }
  for (let i = 0; i < 16; i++) {
    const x = (H(i * 4) - .5) * 26, z = -92 + H(i * 8 + 1) * 180;
    if (blocked(x, z, 6)) continue;
    cyl('steelDark', x, .04, z, .55, .04); cyl('steel', x, .035, z, .62, .03);
  }

  // --- Steam stacks and vents (animated plumes come from city-life.js). ----------------------------------------------
  const stack = (x, z) => {
    if (blocked(x, z, 5)) return;
    cyl('orange', x, .8, z, .34, 1.6); cyl('paintWhite', x, .5, z, .35, .22); cyl('paintWhite', x, 1.1, z, .35, .22); cyl('steelDark', x, 1.62, z, .22, .08);
    ctx.vents.push({ x, y: 1.7, z, kind: 'steam' });
  };
  [[-19.6, -78], [19.4, -34], [-19.5, 17], [19.6, 74], [-19.4, 62]].forEach(([x, z]) => stack(x, z));
  for (const [x, z] of [[-6.5, -73], [5, -52], [-4, -18], [6.5, 6], [-5.5, 41], [4.5, 70]]) {
    if (blocked(x, z, 6)) continue;
    box('steelDark', x, .05, z, 1.4, .06, 1.4); for (let k = -2; k <= 2; k++) box('steel', x + k * .26, .09, z, .06, .04, 1.2);
    ctx.vents.push({ x, y: .2, z, kind: 'steam' });
  }

  // --- Market stalls in the southern plaza: striped canopies over tables of produce and crates. -------------------------
  const stall = (x, z, color, ry = 0) => {
    if (blocked(x, z, 8) || !fp.free(x, z, 1.6, 1.3)) return; fp.claim(x, z, 1.6, 1.3);
    for (const [dx, dz] of [[-1.5, -1.1], [1.5, -1.1], [-1.5, 1.1], [1.5, 1.1]]) cyl('steel', x + dx, 1.3, z + dz, .06, 2.6);
    box(color, x, 2.7, z, 3.4, .1, 2.6, false, [.1, 0, 0]); box('canvasWhite', x, 2.5, z + 1.3, 3.4, .35, .06);
    box('wood', x, .5, z - .2, 2.7, 1, 1, true); box('woodDark', x, 1.02, z - .2, 2.8, .05, 1.1);
    for (let i = 0; i < 7; i++) box(pick(['produceRed', 'produceGreen', 'produceYellow', 'produceOrange', 'crate'], x + i + z), x - 1.15 + i * .38, 1.2, z - .2 + (H(i + x) - .5) * .5, .3, .24, .3);
    box('crate', x + 1.9, .3, z + 1.3, .6, .6, .6); box('crateGrey', x - 1.9, .25, z + 1.6, .6, .5, .6, false, [0, .4, 0]);
    box('signAmber', x, 2.2, z + 1.3, 1.2, .26, .05);
  };
  const awn = ['canvasRed', 'canvasTeal', 'canvasYellow', 'canvasBlue', 'canvasGreen'];
  [[-22, -90], [22, -88], [-26.5, -80], [24.5, -78.5], [-22.5, -70], [23, -68], [-25, -58], [-21.5, -49], [24, -52]].forEach(([x, z], i) => stall(x, z, awn[i % 5]));

  // --- Overhead wires: poles carry a cross-span at lamp height and tram cables run down the avenue. ---------------------------
  const wire = (x0, y0, z0, x1, y1, z1) => kit.line('wire', x0, y0, z0, x1, y1, z1, .05);
  const spans = []; for (let z = -88; z <= 88; z += 22) spans.push(z);
  for (const z of spans) for (const side of [-1, 1]) if (!blocked(side * 17.4, z, 4)) cyl('shelter', side * 17.4, 7.7, z, .09, 2.6);
  for (const z of spans) {
    const pts = [[-17.4, 8.9], [-9, 8.45], [0, 8.2], [9, 8.45], [17.4, 8.9]];
    for (let i = 0; i < pts.length - 1; i++) wire(pts[i][0], pts[i][1], z, pts[i + 1][0], pts[i + 1][1], z);
  }
  for (let i = 0; i < spans.length - 1; i++) for (const x of [-3.6, 3.6]) {
    const za = spans[i], zb = spans[i + 1], n = 5;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, sag = t => 8.3 - 1.05 * Math.sin(Math.PI * t);
      wire(x, sag(t0) - .1, za + (zb - za) * t0, x, sag(t1) - .1, za + (zb - za) * t1);
    }
  }

  // --- Overgrowth: Eden creeping back through the cracks. -------------------------------------------------------------
  for (let i = 0; i < 210; i++) {
    const edge = i % 3 === 0, x = edge ? (H(i * 3) > .5 ? 1 : -1) * (15.6 + H(i * 5) * 4.5) : (H(i * 7 + 1) - .5) * 34, z = -96 + H(i * 11 + 2) * 196;
    if (blocked(x, z, 4)) continue;
    const g = pick(['weed', 'weed', 'foliageLight', 'weedDry', 'foliage'], i);
    for (let k = 0; k < 3; k++) box(g, x + (H(i + k) - .5) * .5, .1 + H(i * 2 + k) * .2, z + (H(i + k * 5) - .5) * .5, .05, .2 + H(i * 5 + k) * .45, .05, false, [(H(i + k) - .5) * .6, 0, (H(i * 3 + k) - .5) * .6]);
  }
  for (let i = 0; i < 46; i++) {
    const side = H(i * 3) > .5 ? 1 : -1, x = side * (19.5 + H(i * 5) * 9), z = -95 + H(i * 7 + 4) * 195;
    if (blocked(x, z, 5)) continue;
    box('moss', x, .03, z, .8 + H(i) * 2.4, .03, .8 + H(i * 2) * 2.2, false, [0, H(i * 4) * 3, 0]);
  }
  const sapling = (x, z, s = 1) => {
    if (blocked(x, z, 6)) return;
    cyl('bark', x, 1.4 * s, z, .1 * s + .05, 2.8 * s, false, [0, 0, (H(x + z) - .5) * .12]);
    box('foliageLight', x, 3.1 * s, z, 1.5 * s, 1 * s, 1.5 * s); box('foliage', x + .4 * s, 3.9 * s, z - .2 * s, 1 * s, .8 * s, 1 * s);
    for (let k = 0; k < 6; k++) box('weed', x + (H(k + x) - .5) * 1.6, .25, z + (H(k * 3 + z) - .5) * 1.6, .06, .5, .06, false, [(H(k) - .5) * .5, 0, 0]);
  };
  [[-15.3, -88], [15.4, -61], [-15.5, -33], [15.2, -8], [-15.4, 30], [15.1, 45], [-15.2, 72], [15.3, 88], [-14.7, 55]].forEach(([x, z], i) => sapling(x, z, .9 + H(i) * .5));
  for (let i = 0; i < 26; i++) {
    const x = (H(i * 5) > .5 ? 1 : -1) * (22.5 + H(i * 3) * 5), z = -95 + H(i * 9 + 5) * 195;
    if (blocked(x, z, 5) || !fp.free(x, z, .9, .8, .1)) continue;
    box(i % 2 ? 'foliage' : 'foliageDark', x, .45, z, 1.6, .9, 1.3, false, [0, H(i) * 3, 0]); box('foliageLight', x + .3, .8, z - .2, 1, .7, .9, false, [0, H(i + 1) * 3, 0]);
  }

  // --- Debris: tyres, crates, drifting paper and concrete rubble, kept off the central lane. ----------------------------
  for (let i = 0; i < 40; i++) {
    const x = (H(i * 7 + 5) - .5) * 30, z = -95 + H(i * 17 + 9) * 205;
    if (blocked(x, z, 5)) continue;
    box('paper', x, .035, z, .32, .012, .24, false, [0, H(i) * 6.28, 0]);
  }
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1, x = side * (7 + H(i * 5 + 1) * 8), z = -92 + H(i * 19) * 180;
    if (blocked(x, z, 6)) continue;
    cyl('rubber', x, .17, z, .46, .3); if (i % 3 === 0) cyl('rubber', x + .1, .47, z, .46, .3);
  }
  for (let i = 0; i < 34; i++) {
    const side = i % 2 ? 1 : -1, x = side * (6 + H(i * 5) * 10), z = -95 + H(i * 11 + 3) * 205;
    if (blocked(x, z, 6)) continue;
    const s = .35 + H(i * 17) * .7;
    box(i % 3 ? 'rubble' : i % 5 ? 'rust' : 'rubbleDark', x, s * .35, z, s * 1.6, s * .7, s, false, [0, H(i) * 3, 0]);
  }
  // A collapsed lamp post lies across the kerb, and a toppled billboard panel leans on the planter wall.
  cyl('shelter', -12.5, .25, -60, .11, 9, false, [0, 0, Math.PI / 2 - .04]); box('shelter', -16.8, .2, -60.1, 1.8, .16, .2, false, [0, .1, 0]);
}
