// Meridian's architecture: ground and road, stepped towers with shopfronts, balconies, fire escapes, rooftop plant and
// crowns, skybridges, the gate, and a ring of far towers that fade into the haze. Collision boxes (solid=true) keep the
// geometry of the buildings and traversable slabs; small trim stays decorative.
import { hash as H, TOWER_ROWS, towerHeight } from './city-layout.js';
import { WALL_TINTS } from './city-props.js';

export function addArchitecture(kit, ctx, fp) {
  const { box, cyl } = kit;
  const wallTint = n => WALL_TINTS[((n % WALL_TINTS.length) + WALL_TINTS.length) % WALL_TINTS.length];
  const signs = ['signAmber', 'signMagenta', 'signGreen'], neons = ['flickerPink', 'neonCyan', 'flickerCyan', 'neonAmber', 'flickerAmber', 'neonPink', 'neonBlue'];
  const awnings = ['canvasRed', 'canvasTeal', 'canvasYellow', 'canvasBlue', 'canvasGreen', 'canvasWhite'], shops = ['shopWarm', 'shopCool', 'shopDim', 'shopWarm', 'shopDim'];

  // Ground, avenue and cross streets. The ground is huge so the world never ends at a visible edge.
  box('concrete', 0, -.25, 15, 1600, .5, 1600); box('road', 0, .015, 110, 33, .025, 540);
  for (const x of [-18, 18]) box('kerb', x, .055, 110, 2.5, .11, 540);
  for (let z = -95; z < 340; z += 9) { for (const x of [-2, 2]) box('paintYellow', x, .04, z, .12, .035, 4); for (const x of [-14.8, 14.8]) box('light', x, .045, z, .09, .035, 1.6); }
  for (const z of [-50, -10, 30, 70]) { box('road', 0, .025, z, 230, .03, 14); for (const x of [-12, 12]) for (let k = -3; k <= 3; k++) box('paintWhite', x, .05, z + k * 1.3, 4, .035, .55); }

  // --- The eight towers that line the avenue. --------------------------------------------------------------------------
  const dishes = ctx.dishes;
  for (const side of [-1, 1]) TOWER_ROWS.forEach((z0, row) => {
    const x = side * 40, height = towerHeight(row, side), roofY = height + .8, xf = side * 29.5, out = -side, n = row * 31 + side * 7;
    const wall = wallTint(row * 4 + (side > 0 ? 3 : 0)), crownWall = wallTint(row * 4 + (side > 0 ? 3 : 0) + 3);
    box(wall, x, height / 2, z0, 21, height, 23, true); box('dark', x, height + .4, z0, 23, .8, 25, true);
    box('trim', x - side * 11.1, roofY + .27, z0, .35, .54, 24.4); for (const e of [-12.4, 12.4]) box('trim', x - side * .5, roofY + .27, z0 + e, 22, .54, .35);
    box('trim', x - side * 11.05, height - .65, z0, .5, .5, 23.2);
    for (const band of [11.5 + (row % 2) * 3, 24 + (row % 2) * 3, 35]) if (band < height - 3) box('trim', xf + out * .13, band, z0, .26, .35, 23);
    for (const dz of [-11.2, 11.2]) box('trim', xf + out * .22, height / 2, z0 + dz, .44, height, .9);
    for (const offset of [-7, 7]) box('trim', x + offset, height / 2, z0 - 11.65, .55, height, .45);
    box('light', xf + out * .3, 5, z0, .2, .12, 13);

    // Holographic billboard and neon corner strips, as before, but some of the neon flickers.
    const sign = signs[(row + (side > 0 ? 1 : 0)) % 3];
    box('dark', side * 29.35, 15, z0, .2, 6.4, 10.6); box(sign, side * 29.1, 15, z0, .24, 5.6, 9.6);
    for (const dz of [-11.6, 11.6]) box(row % 2 ? signs[(row + 1) % 3] : (dz < 0 ? 'neonCyan' : 'flickerPink'), side * 29.3, 9, z0 + dz, .22, 14, .2);

    // Street-level shopfronts: lit or dark windows, awnings, shop signs and blade signs, five bays per tower.
    for (let bay = 0; bay < 5; bay++) {
      const dz = -9.2 + bay * 4.6, r = n + bay * 3.1, shutter = H(r + .5) > .82;
      box('dark', xf + out * .12, 1.95, z0 + dz, .26, 3.4, 4.3);
      if (shutter) { box('steel', xf + out * .28, 1.7, z0 + dz, .1, 2.8, 3.8); for (let k = 0; k < 6; k++) box('steelDark', xf + out * .34, .5 + k * .45, z0 + dz, .04, .05, 3.8); }
      else {
        box(shops[Math.floor(H(r) * shops.length) % shops.length], xf + out * .27, 1.75, z0 + dz, .08, 2.3, 3.7);
        for (const m of [-1.2, 0, 1.2]) box('dark', xf + out * .3, 1.75, z0 + dz + m, .06, 2.3, .09);
        if (H(r + 2) > .5) box('dark', xf + out * .3, 2.3, z0 + dz, .07, .08, 3.7);
      }
      box(awnings[Math.floor(H(r + 4) * awnings.length) % awnings.length], xf + out * .95, 3.35, z0 + dz, 1.9, .1, 4.1, false, [0, 0, side * .3]);
      box('dark', xf + out * .22, 3.95, z0 + dz, .24, .75, 4.1);
      box(H(r + 6) > .7 ? neons[Math.floor(H(r + 7) * neons.length) % neons.length] : signs[Math.floor(H(r + 8) * 3) % 3], xf + out * .37, 3.95, z0 + dz, .06, .5, 3.6);
      if (H(r + 9) > .55) {
        const by = 5.2 + H(r + 10) * 2, blade = neons[Math.floor(H(r + 11) * neons.length) % neons.length];
        box('dark', xf + out * .6, by + 1.3, z0 + dz + 1.7, 1.2, .1, .1); box(blade, xf + out * 1.25, by, z0 + dz + 1.7, .1, 2.6, .5); box('dark', xf + out * 1.25, by, z0 + dz + 1.7, .14, 2.7, .12);
      }
    }

    // Balconies with railings and the odd air conditioner or washing line on the avenue face.
    for (let level = 2; level < Math.floor(height / 3) - 1; level++) for (const dz of [-8.4, -2.4, 3.6, 8.4]) {
      if (Math.abs(dz) < 6 && level * 3 + 2 > 11 && level * 3 + 2 < 19) continue;
      const r = n * 3 + level * 13 + dz, y = 2 + level * 3;
      if (H(r) < .17) {
        box('plaster', xf + out * .85, y - 1.05, z0 + dz, 1.7, .14, 3.2); box('dark', xf + out * 1.68, y - .5, z0 + dz, .05, .9, 3.2);
        for (const e of [-1.58, 1.58]) box('dark', xf + out * .85, y - .5, z0 + dz + e, 1.7, .9, .05);
        if (H(r + 1) > .5) box('foliage', xf + out * 1.3, y - .55, z0 + dz + (H(r + 2) - .5) * 1.6, .5, .5, .8); else if (H(r + 3) > .5) box(awnings[Math.floor(H(r + 4) * 6) % 6], xf + out * 1.55, y - .5, z0 + dz, .04, .55, 2.4);
      } else if (H(r + 5) < .1) { box('ac', xf + out * .4, y - .6, z0 + dz, .8, .6, .75); box('acDark', xf + out * .79, y - .6, z0 + dz, .05, .5, .5); }
    }

    // Fire escape on the south face: platforms, rails and zig-zag stairs, up to the roof edge.
    if ((row + (side > 0 ? 1 : 0)) % 2 === 0) {
      const zf = z0 - 11.5 - .7, cx = x + side * 2, top = Math.floor((height - 2) / 3);
      for (let level = 1; level <= top; level++) {
        const y = level * 3 + .1;
        box('steelDark', cx, y, zf, 5.2, .1, 1.4); box('steelDark', cx, y + .5, zf - .68, 5.2, .9, .05); for (const e of [-2.6, 2.6]) box('steelDark', cx + e, y + .5, zf, .05, .9, 1.4);
        if (level < top) box('steelDark', cx, y + 1.5, zf - .3, 5, .08, .8, false, [0, 0, (level % 2 ? 1 : -1) * Math.atan2(3, 4.6)]);
      }
    }

    // --- Roof: stepped crown on alternate towers, plant, tanks and aerials. The middle of each roof stays open. -------------
    const crowned = (row + (side > 0 ? 1 : 0)) % 2 === 0;
    if (crowned) {
      box(crownWall, x + side * 7.5, roofY + 3, z0, 8, 6, 9, true); box(crownWall, x + side * 7.5, roofY + 8, z0, 6, 4, 5.5, true); box('wallDark', x + side * 7.5, roofY + 11.5, z0, 3.6, 3, 3.2, true);
      box('light', x + side * 3.4, roofY + 2.4, z0, .1, .18, 8.8); box('light', x + side * 4.45, roofY + 8, z0, .1, .18, 5.3);
      cyl('steelDark', x + side * 7.5, roofY + 17.5, z0, .12, 6); box('beaconRed', x + side * 7.5, roofY + 20.8, z0, .55, .55, .55);
      dishes.push({ x: x + side * 7.5, y: roofY + 14.3, z: z0 + 1.2, s: 1 });
    } else {
      cyl('tankWood', x + side * 7.5, roofY + 3.1, z0 + 8.5, 1.5, 2.6); box('tankRust', x + side * 7.5, roofY + 4.55, z0 + 8.5, 3.1, .22, 3.1);
      for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) box('steelDark', x + side * 7.5 + dx, roofY + 1.0, z0 + 8.5 + dz, .16, 2, .16);
      cyl('steelDark', x + side * 9.5, roofY + 2.4, z0 + 2.5, .2, 4.8);
      dishes.push({ x: x + side * 9.5, y: roofY + 5.6, z: z0 + 2.5, s: .8 });
    }
    for (let k = 0; k < 4; k++) { box('ac', x - side * 3 + side * k * 1.9, roofY + .55, z0 + 10.8, 1.5, 1.1, 1.3); box('acDark', x - side * 3 + side * k * 1.9, roofY + 1.12, z0 + 10.8, 1.1, .06, .9); }
    box('dark', x + side * 6.5, roofY + .7, z0 - 8, 3.2, 1.4, 2.6, true); box('rust', x - side * 6, roofY + 1.3, z0 + 8, 3, 2.6, 3, true);
    box('dark', x - side * 7.5, roofY + 7, z0 - 9, .3, 14, .3); box('beaconRed', x - side * 7.5, roofY + 14.2, z0 - 9, .55, .55, .55);
    for (const e of [-1.5, 1.5]) box('steelDark', x - side * 7.5, roofY + 11 + (e > 0 ? 0 : 1.5), z0 - 9 + e, .08, .08, 1.4);
    box('dark', x - side * 10, roofY + 4, z0 - 11, .12, 8, .12); box('beaconWhite', x - side * 10, roofY + 8.2, z0 - 11, .3, .3, .3);

    // Vines hang off the cornice and creep up the avenue face; the shader tints the lowest storeys green.
    for (let k = 0; k < 7; k++) {
      const dz = -10 + H(n + k * 3) * 20, len = 3 + H(n + k * 5) * 11, top = H(k * 2 + n) > .5 ? height : 5 + H(n + k) * 10;
      box('vine', xf + out * .18, top - len / 2 + .2, z0 + dz, .22, len, .35 + H(k + n) * .5);
    }
  });

  // Back buildings behind each tower row, with their own crowns and aerials.
  for (const side of [-1, 1]) TOWER_ROWS.forEach((z0, row) => {
    const back = side * 73, h = 38 + (row % 2) * 20, z = z0 + 2, wall = wallTint(row * 3 + (side > 0 ? 5 : 2) + 1);
    box(wall, back, h / 2, z, 28, h, 29, true);
    // Service alleys have a grounded base, entrances, ventilation and drainage;
    // the upper curtain wall no longer runs uninterrupted into the pavement.
    const face=back-side*14.05;
    box('plaster',face,1.1,z,.14,2.2,28.8);
    for(const dz of [-9,0,9]){
      box('steelDark',face-side*.12,1.35,z+dz,.13,2.7,2.1);
      box('steel',face-side*.2,1.35,z+dz,.07,2.48,1.88);
      box('dark',face-side*.245,1.8,z+dz,.04,.55,1.3);
      box('lamp',face-side*.26,2.88,z+dz,.4,.1,1.4);
      box('steelDark',face-side*.25,.12,z+dz,1.2,.12,2.4);
    }
    for(const dz of [-12.8,5.4]){
      cyl('steelDark',face-side*.22,h*.43,z+dz,.1,h*.86);
      for(let y=2;y<h*.85;y+=5)box('steel',face-side*.2,y,z+dz,.28,.08,.35);
    }
    for(let j=0;j<5;j++)box('steelDark',face-side*.12,3.8+j*.13,z-4,.08,.065,2.1);
    // A shallow foundation course gives the facade thickness at walking height.
    box('steelDark',face-side*.1,.25,z,.22,.5,29);
    box('trim', back - side * 14.1, h - .3, z, .5, .5, 29.4); box('dark', back, h + .25, z, 28.6, .5, 29.6, true);
    box(wallTint(row + 4), back + side * 4, h + 3, z, 12, 6, 14, true); box('wallDark', back + side * 4, h + 7.5, z, 7, 3, 8, true);
    cyl('steelDark', back + side * 4, h + 14, z, .14, 8); box('beaconRed', back + side * 4, h + 18.3, z, .6, .6, .6);
    box('light', back - side * 1.9, h + 3, z, .1, .16, 13.8);
    box('ac', back - side * 7, h + .8, z + 9, 2.4, 1.5, 2); box('ac', back - side * 7, h + .8, z - 9, 2.4, 1.5, 2); cyl('tankWood', back - side * 8, h + 2.6, z, 1.8, 2.8);
  });

  // Skybridge roofs and decks are solid at every height. Automatic prop collision
  // only covers low street furniture, so these thin elevated slabs must opt in.
  for (const side of [-1, 1]) [[-10, 15], [30, 17], [70, 15]].forEach(([z, y]) => {
    box('dark', side * 40, y, z, 7, 1.1, 17, true); box('glass', side * 40, y + 1.5, z, 6.4, 2, 16.6); box('light', side * 40, y - .6, z, 5.8, .1, 16.6); box('dark', side * 40, y + 2.65, z, 7, .35, 17, true);
    for (const e of [-3.2, 3.2]) { box('steelDark', side * 40 + e, y - 2.2, z - 7.2, .2, 3.4, .2, false, [0, 0, e * .03]); box('steelDark', side * 40 + e, y - 2.2, z + 7.2, .2, 3.4, .2); }
    box('beaconRed', side * 40, y + 3, z, .35, .35, .35);
  });

  // Planters divide cover from clear pedestrian routes; foliage and weeds spill out of them.
  for (const side of [-1, 1]) TOWER_ROWS.forEach((z0, row) => {
    const z = z0;
    box('dark', side * 24, .6, z + 13, 5, 1.2, 3, true); box('green', side * 24, 1.3, z + 13, 4.5, .8, 2.5);
    for (let k = 0; k < 4; k++) box(k % 2 ? 'foliage' : 'foliageLight', side * 24 + (k - 1.5) * 1.05, 1.9 + H(k + z) * .4, z + 13 + (H(k * 3 + z + side) - .5) * 1.2, 1, .8 + H(k + side) * .5, 1);
    for (const zz of [z - 12, z + 12]) { box('dark', side * 18.5, 3, zz, .17, 6, .17); box('light', side * 18.5, 5.9, zz, 1.6, .12, .3) }
  });
  for (const [x, z] of [[-8, -28], [9, 13], [-9, 50], [9, 79]]) {
    box('dark', x, .95, z, 4.5, 1.9, 2.2, true); box('trim', x, 1.94, z, 4.6, .12, 2.3); box('light', x, 1.3, z - 1.12, 3.5, .12, .04);
    box('foliage', x - 1.2, 2.3, z, 1.3, .7, 1.3); box('foliageLight', x + 1, 2.2, z + .2, 1, .5, 1.2);
  }

  // The gate tower frames the north avenue and stays clear through its centre.
  for (const x of [-13, 13]) { box('dark', x, 12, 99, 4, 24, 5, true); box('light', x, 12, 96.4, .15, 20, .1); box('beaconRed', x, 24.6, 99, .7, .7, .7); box('steelDark', x, 26.5, 99, .2, 4, .2); }
  box('trim', 0, 24, 99, 30, 2, 5); box('light', 0, 22.7, 96.4, 22, .15, .12);
  for (let k = -3; k <= 3; k++) box(k % 2 ? 'paintYellow' : 'steelDark', k * 3.6, 24, 96.45, 1.6, 1.6, .06, false, [0, 0, .5]);

  // --- Far towers: nearly all non-solid skyline that thickens with distance and fades into the haze. ----------------------
  const tower = (x, z, w, d, h, n) => {
    const wallA = wallTint(Math.floor(H(n * 3.1) * 9)), wallB = wallTint(Math.floor(H(n * 1.7 + 3) * 9));
    box(wallA, x, h / 2, z, w, h, d); box('dark', x, h + .2, z, w + .5, .4, d + .5);
    let top = h + .4;
    if (H(n + 5) > .3) { const th = h * (.12 + H(n + 6) * .12); box(wallB, x + (H(n + 7) - .5) * w * .2, top + th / 2, z, w * .7, th, d * .7); top += th; if (H(n + 8) > .5) { const t2 = h * .1; box(wallA, x, top + t2 / 2, z, w * .4, t2, d * .4); top += t2; } }
    if (H(n + 9) > .5) { box('steelDark', x, top + 9, z, .5, 18, .5); box('beaconRed', x, top + 18.5, z, 1.1, 1.1, 1.1); }
    if (H(n + 10) > .6) box('light', x, top - 1.2, z, w * .72 + .1, .22, d * .72 + .1);
  };
  for (const side of [-1, 1]) for (let row = 0; row < 6; row++) tower(side * (105 + row % 2 * 25), -75 + row * 44, 20, 24, 50 + ((row * 7) % 4) * 13, row * 2 + side + 20);
  let id = 100;
  for (const side of [-1, 1]) for (const px of [160, 205, 250, 295]) for (let z = -250; z <= 320; z += 46) {
    id++; const x = side * (px + (H(id) - .5) * 14), zz = z + (H(id * 3) - .5) * 14, h = 55 + H(id * 7) * 90 + (px - 160) * .45;
    tower(x, zz, 22 + H(id * 5) * 16, 22 + H(id * 11) * 14, h, id);
  }
  for (const list of [[-160, -205, -250, -295], [175, 215, 260, 310, 360]]) for (const z of list) for (let x = -120; x <= 120; x += 42) {
    if (Math.abs(x) < 30) continue;
    id++; tower(x + (H(id) - .5) * 14, z + (H(id * 3) - .5) * 14, 24 + H(id * 5) * 14, 24 + H(id * 11) * 14, 70 + H(id * 7) * 110 + Math.abs(z) * .12, id);
  }
  // The skyline at the end of the avenue stands behind the gateway, clear of the roadway.
  for (const [x, z, h] of [[-52, 205, 150], [52, 215, 170], [-34, 280, 190], [38, 300, 210], [0, 380, 230]]) { id++; tower(x, z, 28, 28, h, id); }
  return { wallTint };
}
