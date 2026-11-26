// world.js — the Nusa archipelago: terrain, ocean, sky, volcano, clouds, trees,
// target rings and the runway. All art is procedural and original.

import * as THREE from 'three';
import { WORLD, ISLANDS, VOLCANO, RUNWAY, RINGS, makeNoise, mulberry32 } from './config.js';

const noise = makeNoise(WORLD.seed);

// Flight corridor: the ring route AND the southern final approach (from the sea
// at z=1200 up the valley to the strip) are carved into a valley so the mission
// is flyable — terrain along the route is pulled down to a low valley floor.
const ROUTE_POINTS = [[0, 1600], [0, 150], ...RINGS.map(([x, , z]) => [x, z]), [0, 150], [0, 1600]];
function distToRoute(x, z) {
  let best = Infinity;
  for (let i = 0; i < ROUTE_POINTS.length - 1; i++) {
    const [ax, az] = ROUTE_POINTS[i], [bx, bz] = ROUTE_POINTS[i + 1];
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / len2));
    const px = ax + t * dx, pz = az + t * dz;
    best = Math.min(best, Math.hypot(x - px, z - pz));
  }
  return best;
}

// Height of the land at (x, z). Islands are gaussian bumps shaped by noise;
// the ring route is carved into a valley, and the runway strip is flattened
// to the runway elevation.
export function terrainHeightAt(x, z) {
  let h = 0;
  for (const [cx, cz, r, peak] of ISLANDS) {
    const dx = (x - cx) / r, dz = (z - cz) / r;
    const d2 = dx * dx + dz * dz;
    if (d2 > 4) continue;
    const fall = Math.exp(-d2 * 1.6);
    const rough = 1 + 0.45 * noise(x * 0.0016 + 7, z * 0.0016 - 3);
    h += peak * fall * rough;
  }
  // Volcano cone sharpening on its island.
  const vdx = (x - VOLCANO.x) / 420, vdz = (z - VOLCANO.z) / 420;
  const vd2 = vdx * vdx + vdz * vdz;
  if (vd2 < 1.2) h += (VOLCANO.craterY - h) * (1 - vd2 / 1.2) * 0.55;
  // Carve the flight corridor: a valley floor (~12 m) within 300 m of the
  // route, blending back to the hills by 700 m. Low enough that the runway
  // (6 m) is only a gentle step down from the valley floor, so a normal
  // glide path clears the ground all the way to the numbers.
  const d = distToRoute(x, z);
  if (d < 700) {
    const t = Math.min(1, Math.max(0, (700 - d) / 400));
    const k = t * t * (3 - 2 * t);
    h = h * (1 - k) + 12 * k;
  }
  // Flatten the runway shelf so takeoffs and landings are level.
  const rx = Math.abs(x - RUNWAY.x), rz = Math.abs(z - RUNWAY.z);
  const flat = Math.max(0, 1 - Math.max(rx / 260, rz / 420));
  const shelf = WORLD.runwayElevation + 0.5 * noise(x * 0.01, z * 0.01);
  h = h * (1 - flat) + shelf * flat;
  return Math.max(h, -6);
}

function colorForHeight(h, slope) {
  const c = new THREE.Color();
  if (h < 3) c.setHex(0xd9c28a); // beach sand
  else if (h < 90) c.setHex(0x4d8a3f); // lowland jungle green
  else if (h < 220) c.setHex(0x3a6e35); // highland forest
  else if (h < 420) c.setHex(0x6e6a58); // rock
  else c.setHex(0x8a8f96); // high rock / ash
  if (slope > 0.55) c.multiplyScalar(0.72); // steep faces read darker
  if (h > 620) c.setHex(0x3a3230); // volcano ash near the crater
  return c;
}

export function buildTerrain() {
  const seg = 220;
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const h = terrainHeightAt(v.x, v.z);
    pos.setY(i, h);
    const hx = terrainHeightAt(v.x + 8, v.z) - terrainHeightAt(v.x - 8, v.z);
    const hz = terrainHeightAt(v.x, v.z + 8) - terrainHeightAt(v.x, v.z - 8);
    const slope = Math.min(1, Math.hypot(hx, hz) / 16);
    const c = colorForHeight(h, slope);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  return mesh;
}

export function buildOcean() {
  const geo = new THREE.PlaneGeometry(WORLD.size * 2.2, WORLD.size * 2.2, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshPhongMaterial({
    color: 0x1b6f9e, shininess: 90, specular: 0x99ccff, transparent: true, opacity: 0.94,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WORLD.seaLevel;
  mesh.name = 'ocean';
  return mesh;
}

// Golden-hour sky dome: warm horizon band, deep blue zenith, low sun disc.
export function buildSky(scene) {
  const geo = new THREE.SphereGeometry(9000, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x3a6db0) },
      mid: { value: new THREE.Color(0x8fc0e8) },
      low: { value: new THREE.Color(0xffc07a) },
      sunDir: { value: new THREE.Vector3(-0.45, 0.42, -0.78).normalize() },
      sunColor: { value: new THREE.Color(0xffe0b0) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sunDir; uniform vec3 sunColor;
      void main(){
        float h = clamp(vDir.y, -0.08, 1.0);
        vec3 col = mix(low, mid, smoothstep(0.0, 0.22, h));
        col = mix(col, top, smoothstep(0.25, 0.85, h));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunColor * (pow(s, 220.0) * 1.4 + pow(s, 18.0) * 0.35);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.name = 'skyDome';
  scene.add(dome);

  const sun = new THREE.DirectionalLight(0xffe0b8, 3.0);
  sun.position.set(-1800, 2100, -3100);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x54704a, 1.35));
  scene.fog = new THREE.Fog(0xc7d9ea, 900, 6500);
  return sun;
}

export function buildVolcanoSmoke(scene) {
  // Crater glow disc + a slow column of smoke sprites that loop upward.
  // The glow sits on the crater's real ground, not on the nominal peak.
  const craterGround = terrainHeightAt(VOLCANO.x, VOLCANO.z);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(46, 24),
    new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.85 }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(VOLCANO.x, craterGround + 2, VOLCANO.z);
  glow.name = 'craterGlow';
  scene.add(glow);

  const rand = mulberry32(WORLD.seed + 5);
  const smoke = [];
  const geo = new THREE.SphereGeometry(1, 8, 6);
  const mat = new THREE.MeshLambertMaterial({
    color: 0x9a8f7c, transparent: true, opacity: 0.45,
    emissive: 0x6a5f4d, emissiveIntensity: 0.4,
  });
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Mesh(geo, mat);
    s.userData.phase = rand();
    s.userData.speed = 0.5 + rand() * 0.7;
    smoke.push(s);
    scene.add(s);
  }
  return { glow, smoke, baseY: craterGround };
}

export function updateSmoke(smoke, t, baseY) {
  for (const s of smoke) {
    const p = (t * 0.02 * s.userData.speed + s.userData.phase) % 1;
    s.position.set(
      VOLCANO.x + Math.sin(p * 9 + s.userData.phase * 20) * (18 + p * 90),
      baseY + 10 + p * 420,
      VOLCANO.z + Math.cos(p * 7 + s.userData.phase * 17) * (18 + p * 90),
    );
    const sc = 14 + p * 55;
    s.scale.set(sc, sc * 0.8, sc);
    s.material.opacity = 0.45 * (1 - p);
  }
}

export function buildClouds(scene) {
  // Instanced puffs: flattened white spheres, drifting slowly with the wind.
  const rand = mulberry32(WORLD.seed + 11);
  const geo = new THREE.SphereGeometry(1, 10, 8);
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffffff, transparent: true, opacity: 0.85,
    emissive: 0x8fa3b8, emissiveIntensity: 0.45,
  });
  const count = 90;
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
  const clouds = [];
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * WORLD.size;
    const z = (rand() - 0.5) * WORLD.size;
    const y = 340 + rand() * 260;
    const s = 60 + rand() * 130;
    pv.set(x, y, z); q.identity(); sc.set(s, s * 0.32, s * 0.7);
    m.compose(pv, q, sc);
    inst.setMatrixAt(i, m);
    clouds.push({ x, y, z, s, drift: 2 + rand() * 4 });
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.name = 'clouds';
  scene.add(inst);
  return { inst, clouds };
}

export function updateClouds(cloudData, dt) {
  const { inst, clouds } = cloudData;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
  for (let i = 0; i < clouds.length; i++) {
    const c = clouds[i];
    c.x += c.drift * dt;
    if (c.x > WORLD.size / 2 + 200) c.x = -WORLD.size / 2 - 200;
    pv.set(c.x, c.y, c.z); q.identity(); sc.set(c.s, c.s * 0.32, c.s * 0.7);
    m.compose(pv, q, sc);
    inst.setMatrixAt(i, m);
  }
  inst.instanceMatrix.needsUpdate = true;
}

export function buildTrees(scene) {
  // Low-poly palms: trunk cylinder + cone canopy, instanced, on low green ground.
  const rand = mulberry32(WORLD.seed + 23);
  const trunkGeo = new THREE.CylinderGeometry(0.7, 1.1, 9, 5);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
  const topGeo = new THREE.ConeGeometry(6.5, 14, 6);
  const topMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  const spots = [];
  let guard = 0;
  while (spots.length < 420 && guard++ < 6000) {
    const x = (rand() - 0.5) * WORLD.size;
    const z = (rand() - 0.5) * WORLD.size;
    const h = terrainHeightAt(x, z);
    if (h < 6 || h > 120) continue;
    spots.push([x, h, z]);
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const tops = new THREE.InstancedMesh(topGeo, topMat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
  const e = new THREE.Euler();
  spots.forEach(([x, h, z], i) => {
    const s = 0.8 + rand() * 0.9;
    e.set(0, rand() * Math.PI * 2, (rand() - 0.5) * 0.12);
    q.setFromEuler(e);
    pv.set(x, h + 4.5 * s, z); sc.set(s, s, s);
    m.compose(pv, q, sc); trunks.setMatrixAt(i, m);
    pv.set(x, h + (9 + 7) * s, z);
    m.compose(pv, q, sc); tops.setMatrixAt(i, m);
  });
  trunks.instanceMatrix.needsUpdate = true;
  tops.instanceMatrix.needsUpdate = true;
  trunks.name = 'treeTrunks'; tops.name = 'treeTops';
  scene.add(trunks); scene.add(tops);
}

export function buildRings(scene) {
  // Glowing target rings with a light beacon column; the next ring burns brighter.
  const group = new THREE.Group();
  group.name = 'rings';
  const meshes = [];
  RINGS.forEach(([x, y, z], i) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(24, 2.2, 10, 40),
      new THREE.MeshBasicMaterial({ color: 0xff8c1a, transparent: true, opacity: 0.95 }),
    );
    ring.position.set(x, y, z);
    ring.rotation.y = Math.PI / 2; // face the flight path (north-south)
    ring.name = `ring${i + 1}`;
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 320, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffb347, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    beacon.position.set(x, y + 160, z);
    const label = makeRingLabel(i + 1);
    label.position.set(x, y + 34, z);
    group.add(ring); group.add(beacon); group.add(label);
    meshes.push({ ring, beacon, label, passed: false, pos: new THREE.Vector3(x, y, z) });
  });
  scene.add(group);
  return meshes;
}

function makeRingLabel(n) {
  // Number sprite drawn on a canvas — no image files needed.
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(10,16,24,0.55)';
  ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(64, 64, 54, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 64, 68);
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(22, 22, 1);
  return spr;
}

export function buildRunway(scene) {
  const g = new THREE.Group();
  g.name = 'runway';
  const y = WORLD.runwayElevation;
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(RUNWAY.width, 1.2, RUNWAY.length),
    new THREE.MeshLambertMaterial({ color: 0x2c2f36 }),
  );
  strip.position.set(RUNWAY.x, y - 0.6, RUNWAY.z);
  g.add(strip);
  // Centreline dashes.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
  for (let z = -RUNWAY.length / 2 + 20; z < RUNWAY.length / 2 - 10; z += 30) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 14), dashMat);
    dash.position.set(RUNWAY.x, y + 0.1, z);
    g.add(dash);
  }
  // Threshold bars at both ends.
  for (const zEnd of [-RUNWAY.length / 2 + 8, RUNWAY.length / 2 - 8]) {
    for (let k = -2; k <= 2; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 10), dashMat);
      bar.position.set(RUNWAY.x + k * 4.4, y + 0.1, zEnd);
      g.add(bar);
    }
  }
  // Edge lights: warm amber studs down both sides.
  const lightGeo = new THREE.SphereGeometry(0.9, 8, 6);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffc861 });
  for (let z = -RUNWAY.length / 2; z <= RUNWAY.length / 2; z += 35) {
    for (const xOff of [-RUNWAY.width / 2 - 2, RUNWAY.width / 2 + 2]) {
      const l = new THREE.Mesh(lightGeo, lightMat);
      l.position.set(RUNWAY.x + xOff, y + 1, z);
      g.add(l);
    }
  }
  // Windsock on a pole beside the strip.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 12, 6),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
  );
  pole.position.set(RUNWAY.x + 34, y + 6, 120);
  g.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 9, 8),
    new THREE.MeshLambertMaterial({ color: 0xff7a1a }),
  );
  sock.rotation.z = Math.PI / 2.3;
  sock.position.set(RUNWAY.x + 30, y + 11.4, 120);
  g.add(sock);
  // Two hangars and a control hut near the strip.
  const hangarMat = new THREE.MeshLambertMaterial({ color: 0x8a97a5 });
  for (const [hx, hz, w] of [[-52, 90, 26], [-52, 140, 20]]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(w, 12, 22), hangarMat);
    h.position.set(hx, y + 6, hz);
    g.add(h);
    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(11, 11, 22, 12, 1, false, 0, Math.PI),
      new THREE.MeshLambertMaterial({ color: 0x5d6b7a }),
    );
    roof.rotation.x = Math.PI / 2; roof.rotation.z = Math.PI / 2;
    roof.position.set(hx, y + 12, hz);
    roof.scale.set(1, 1, w / 22);
    g.add(roof);
  }
  const hut = new THREE.Mesh(
    new THREE.BoxGeometry(10, 8, 10),
    new THREE.MeshLambertMaterial({ color: 0xc9a86a }),
  );
  hut.position.set(46, y + 4, 60);
  g.add(hut);
  scene.add(g);
  return g;
}
