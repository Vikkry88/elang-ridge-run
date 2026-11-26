// config.js — Elang Ridge Run: constants, mission route and seeded random.
// Every number here is the game's own design: a volcano-courier flight over the
// Nusa archipelago. No commercial game, name, art or level is copied.

export const WORLD = {
  size: 6000, // world spans -3000..3000 on x and z, metres
  seaLevel: 0,
  runwayElevation: 6,
  seed: 1337,
};

// Mulberry32 — small deterministic PRNG so terrain, clouds and trees are identical
// on every load (screenshots are reproducible).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value-noise heightfield, deterministic from WORLD.seed.
export function makeNoise(seed) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = base[i]; base[i] = base[j]; base[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
  const fade = (t) => t * t * (3 - 2 * t);
  function noise2(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const h = (a, b) => perm[(perm[a & 255] + b) & 255] / 255;
    const u = fade(xf), v = fade(zf);
    const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  }
  return function fbm(x, z) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < 4; o++) {
      sum += noise2(x * freq, z * freq) * amp;
      norm += amp; amp *= 0.5; freq *= 2.03;
    }
    return sum / norm;
  };
}

// Island masks: big main island, two smaller ones, a few islets. Each entry is
// [centreX, centreZ, radius, peakHeight].
export const ISLANDS = [
  [0, -1200, 2300, 420],
  [1900, 900, 950, 180],
  [-2300, 700, 850, 150],
  [2400, -1900, 700, 120],
  [-1500, -2300, 900, 760], // volcano island (Krakata peak)
  [900, 2100, 600, 90],
  [-1600, 2300, 550, 80],
];

export const VOLCANO = { x: -1500, z: -2300, craterY: 700 };

// Runway: flat strip on the coast of the main island, aligned north-south.
export const RUNWAY = {
  x: 0, z: 0, length: 420, width: 26, headingDeg: 0, // heading 0 = north (-Z)
  thresholdZ: -210, // north end
};

// Mission: 8 glowing rings over the islands, then land back on the runway.
// [x, altitude, z] — a loop out past the volcano and home.
export const RINGS = [
  [0, 150, -650],
  [-380, 190, -1150],
  [-850, 240, -1550],
  [-620, 300, -2150],
  [150, 270, -2450],
  [750, 220, -1850],
  [950, 180, -1050],
  [380, 130, -480],
];

export const PLANE = {
  maxSpeed: 96, // m/s at full throttle (~187 kt)
  cruiseSpeed: 62,
  stallSpeed: 26, // below this the wing stops flying
  maxThrottle: 1,
  climbRate: 9,
  fuelBurnPerSec: 0.22, // at full throttle; rings refund fuel
  fuelRingRefund: 6,
  fuelStart: 100,
  turnRate: 0.55, // rad/s at full bank
  scoreRing: 100,
  scoreLanding: 500,
};

export const TIMES = {
  missionParSec: 240, // par time for the full bonus
  shotSettleMs: 1400, // screenshot staging settles before capture
};
