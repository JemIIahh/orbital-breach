import * as T from 'three';

const HERO_X = -2.6;

// Diagonal hazard stripes built from raw pixels so no canvas/DOM is needed (keeps scene construction testable).
function hazardTexture() {
  const width = 128, height = 16, data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const on = ((x + y * 2) >> 4) & 1, i = (y * width + x) * 4;
    data[i] = on ? 217 : 26; data[i + 1] = on ? 164 : 29; data[i + 2] = on ? 63 : 31; data[i + 3] = 255;
  }
  const texture = new T.DataTexture(data, width, height, T.RGBAFormat);
  texture.colorSpace = T.SRGBColorSpace; texture.wrapS = T.RepeatWrapping; texture.repeat.set(10, 1);
  texture.magFilter = T.LinearFilter; texture.minFilter = T.LinearFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
  return texture;
}

export function makeLaunchDeck(hero, environment = null, earth = null) {
  const scene = new T.Scene();
  scene.background = new T.Color('#071019'); scene.fog = new T.FogExp2('#071019', .016);
  scene.environment = environment; scene.environmentIntensity = .65;
  scene.add(new T.HemisphereLight('#c1dce8', '#19242c', 1.8));
  const key = new T.DirectionalLight('#e6eff0', 3.4); key.position.set(-4, 9, -7); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: .1, far: 35 });
  key.shadow.normalBias = .03; scene.add(key);
  const rim = new T.DirectionalLight('#6ba6c6', 2.6); rim.position.set(-6, 5, 6); scene.add(rim);
  const warm = new T.PointLight('#e6b481', 18, 20, 2); warm.position.set(3, 5, 2); scene.add(warm);

  const materials = {
    floor: new T.MeshStandardMaterial({ color: '#17232c', metalness: .65, roughness: .4 }),
    dark: new T.MeshStandardMaterial({ color: '#0e1923', metalness: .8, roughness: .45 }),
    steel: new T.MeshStandardMaterial({ color: '#52636b', metalness: .8, roughness: .35 }),
    light: new T.MeshStandardMaterial({ color: '#b5e5e8', emissive: '#8cc6d7', emissiveIntensity: 2.0 }),
    amber: new T.MeshStandardMaterial({ color: '#a89069', metalness: .5, roughness: .5 }),
    crate: new T.MeshStandardMaterial({ color: '#33454b', metalness: .55, roughness: .55 }),
    crateTrim: new T.MeshStandardMaterial({ color: '#c8873a', metalness: .4, roughness: .5 }),
  };
  const geometry = new T.BoxGeometry(1, 1, 1), batches = new Map(), dummy = new T.Object3D();
  const box = (material, x, y, z, sx, sy, sz, ry = 0) => {
    dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(dummy.matrix.clone());
  };

  box('floor', 0, -.45, 2, 44, .4, 34);
  for (let x = -14; x <= 14; x += 2.2) for (let z = -9; z <= 15; z += 3.2) { box('dark', x, -.22, z, 2.12, .04, 3.1); box('steel', x, -.19, z - 1.5, 2.05, .015, .025); }
  // A framed orbital window sits behind the frame, inside a working maintenance bay.
  for (const x of [-12, 8]) box('dark', x, 5, 9, 8, 10, 1);
  box('dark', -2, 9.7, 9, 14, 2, 1); box('dark', -2, 1.0, 9, 14, 2, 1);
  for (const x of [-8.1, 4.1]) { box('steel', x, 5, 8.6, .22, 7, .35); box('light', x, 5, 8.38, .035, 6.5, .03); }
  for (const x of [-7, -3, 1, 5]) { box('dark', x, 8.1, 1, .25, .6, 16); box('light', x, 7.76, 1, .12, .055, 10); }
  box('dark', 5, .7, 4, 2.5, 1.8, 3); box('steel', 5, 1.65, 4, 2.6, .15, 3.1); box('light', 3.7, 1.1, 4, .035, .08, 1.8);
  for (const x of [-7, 3]) box('amber', x, -.18, -1, .08, .025, 13);

  // Working-bay clutter: stacked cargo, a tool rack and bollards frame the platform without hiding it.
  const crate = (x, y, z, s, ry = 0) => { box('crate', x, y, z, s, s * .82, s, ry); box('crateTrim', x, y, z, s * 1.02, s * .08, s * 1.02, ry); box('light', x, y + s * .3, z - s * .51, s * .5, .03, .02, ry); };
  crate(-9.6, .55, 4.2, 1.5, .2); crate(-9.8, 1.8, 4.0, 1.1, -.12); crate(-8.2, .4, 5.6, 1.1, .5); crate(-11.2, .5, 2.4, 1.3, -.3);
  crate(7.4, .5, 1.6, 1.3, .1); crate(8.6, .4, 3.4, 1.0, -.4); crate(6.9, 1.5, 1.5, .9, .3);
  box('dark', -6.2, 1.5, 6.9, 3.4, 3, .35); for (let i = 0; i < 4; i++) { box('steel', -6.2, .55 + i * .7, 6.6, 3.2, .06, .3); box('crateTrim', -7.4 + i * .8, 1.3, 6.55, .18, .5, .18); }
  for (const x of [-7.6, 2.6]) for (const z of [-3.2, 3.4]) { box('dark', x, .3, z, .28, .75, .28); box('light', x, .72, z, .3, .04, .3); }
  box('dark', -2.6, 8.9, 3, .5, .5, 14); for (const z of [-2, 2, 6]) box('steel', -2.6, 8.55, z, 1.4, .25, .5);

  for (const [name, matrices] of batches) {
    const mesh = new T.InstancedMesh(geometry, materials[name], matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = name !== 'light'; mesh.receiveShadow = true; mesh.computeBoundingSphere(); scene.add(mesh);
  }

  hero.group.position.set(HERO_X, 0, 0); hero.group.rotation.set(0, .17, 0); scene.add(hero.group);
  const platform = new T.Mesh(new T.CylinderGeometry(3.1, 3.3, .35, 64), materials.floor); platform.position.set(HERO_X, -.17, 0); platform.receiveShadow = true; scene.add(platform);
  const hazard = new T.Mesh(new T.CylinderGeometry(3.32, 3.32, .1, 96, 1, true), new T.MeshStandardMaterial({ map: hazardTexture(), metalness: .3, roughness: .6, side: T.DoubleSide }));
  hazard.position.set(HERO_X, -.04, 0); scene.add(hazard);
  const ring = new T.Mesh(new T.TorusGeometry(3.02, .025, 6, 80), materials.light); ring.rotation.x = -Math.PI / 2; ring.position.set(HERO_X, .015, 0); scene.add(ring);
  const inner = new T.Mesh(new T.RingGeometry(2.6, 2.63, 64), materials.amber); inner.rotation.x = -Math.PI / 2; inner.position.set(HERO_X, .02, 0); scene.add(inner);

  // Scanner ring that sweeps the frame, and slow drifting dust for depth.
  const scanMaterial = new T.MeshBasicMaterial({ color: '#8cc6d7', transparent: true, opacity: .55, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
  const scan = new T.Mesh(new T.TorusGeometry(1.7, .014, 6, 72), scanMaterial); scan.rotation.x = Math.PI / 2; scan.position.set(HERO_X, 0, 0); scene.add(scan);
  const dustCount = 140, dust = new Float32Array(dustCount * 3), seeds = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) { dust[i * 3] = -14 + ((i * 37.7) % 20); dust[i * 3 + 1] = (i * 13.3) % 8; dust[i * 3 + 2] = -5 + ((i * 29.1) % 13); seeds[i] = i * 1.7; }
  const dustGeometry = new T.BufferGeometry(); dustGeometry.setAttribute('position', new T.BufferAttribute(dust, 3));
  const dustPoints = new T.Points(dustGeometry, new T.PointsMaterial({ color: '#cfe6ee', size: .045, transparent: true, opacity: .45, depthWrite: false }));
  dustPoints.frustumCulled = false; scene.add(dustPoints);

  if (earth) { const planet = earth.clone(); planet.position.set(-20, 13, 135); planet.scale.setScalar(.18); planet.rotation.z = -.2; scene.add(planet); }
  const starGeometry = new T.BufferGeometry(), positions = [];
  for (let i = 0; i < 180; i++) { const n = i * 127.1; positions.push(Math.sin(n) * 55, 8 + Math.cos(n * .7) * 30, 100 + Math.sin(n * .3) * 30); }
  starGeometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  scene.add(new T.Points(starGeometry, new T.PointsMaterial({ color: '#d1e1e9', size: .13, transparent: true, opacity: .65 })));

  const accent = { current: new T.Color('#8cc6d7'), target: new T.Color('#8cc6d7') }, white = new T.Color('#ffffff'), warmBase = new T.Color('#e6b481'), scratch = new T.Color();
  let scanClock = 0;

  return {
    scene,
    center: new T.Vector3(HERO_X, 2.25, 0),
    setAccent(hex) { accent.target.set(hex); },
    update(time, dt = 1 / 60, controls = null) {
      const power = controls?.power || 0, pulse = controls?.pulse || 0;
      hero.group.rotation.y = .17 + Math.sin(time * .16) * .055 + (controls?.yaw || 0);
      accent.current.lerp(accent.target, 1 - Math.exp(-dt * 4));
      materials.light.emissive.copy(accent.current);
      materials.light.color.copy(accent.current).lerp(white, .55);
      materials.light.emissiveIntensity = 2 + pulse * 3.2 + power * .9;
      warm.color.copy(warmBase).lerp(accent.current, .45); warm.intensity = 18 + power * 10;
      scanMaterial.color.copy(scratch.copy(accent.current).lerp(white, .25));
      scanClock += dt * (1 + power * 1.5);
      const sweep = (scanClock % 6) / 6; scan.position.y = sweep * 4.6; scanMaterial.opacity = .55 * Math.sin(sweep * Math.PI);
      const pos = dustGeometry.attributes.position;
      for (let i = 0; i < dustCount; i++) {
        pos.array[i * 3 + 1] += dt * (.05 + (seeds[i] % 1) * .06); if (pos.array[i * 3 + 1] > 8) pos.array[i * 3 + 1] = 0;
        pos.array[i * 3] += Math.sin(time * .3 + seeds[i]) * dt * .04;
      }
      pos.needsUpdate = true;
    },
  };
}

// `focus` is the fraction of the viewport width the hero should be centred on. The menu measures the open band between the
// briefing and the frame card and passes it in, so the mech never stands behind a panel at any window size.
export function frameLaunchDeck(camera, center, aspect, controls = null, focus = 0.62) {
  const px = controls?.parallax.x || 0, py = controls?.parallax.y || 0, power = controls?.power || 0;
  camera.fov = 42; camera.aspect = aspect; camera.up.set(0, 1, 0);
  camera.position.copy(center).add(new T.Vector3(3.6 - px * .9, 1.6 - py * .35, -10.8 + power * .9));
  camera.lookAt(center);
  const width = 1000 * aspect; camera.setViewOffset(width, 1000, -width * (focus - .5), 80, width, 1000);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
}
