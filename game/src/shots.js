// shots.js — deterministic screenshot staging for the maker.
// ?shot=start  — on the runway at golden hour, engine idling, gear down
// ?shot=play   — chase view mid-flight, threading ring 3 past the volcano
// ?shot=cockpit — cockpit view on final approach, runway ahead, instruments lit
// ?shot=land   — low over the threshold, gear down, about to touch down
// Each stage settles, then sets window.__shotReady so the capture script knows
// the frame is stable. The game itself is unchanged by staging.

import * as THREE from 'three';
import { RINGS, RUNWAY, WORLD } from './config.js';

export const SHOTS = {
  start: {
    pos: [RUNWAY.x, WORLD.runwayElevation + 2, 150],
    heading: 0, pitch: 0, roll: 0, speed: 0, throttle: 0.25,
    camera: 'chase', hud: true,
  },
  play: {
    pos: [-700, 235, -1480],
    heading: 0.35, pitch: 0.02, roll: -0.28, speed: 68, throttle: 0.82,
    camera: 'chase', hud: true, ringIndex: 2,
  },
  cockpit: {
    pos: [30, 90, 500],
    heading: 0.0, pitch: -0.05, roll: 0.02, speed: 58, throttle: 0.55,
    camera: 'cockpit', hud: true, ringIndex: 8,
  },
  land: {
    pos: [0, 30, 420],
    heading: 0.02, pitch: -0.06, roll: 0, speed: 44, throttle: 0.35,
    camera: 'chase', hud: true, ringIndex: 8,
  },
};

export function parseShot() {
  const q = new URLSearchParams(window.location.search);
  const name = q.get('shot');
  if (!name || !SHOTS[name]) return null;
  return { name, ...SHOTS[name] };
}

// Place the flight model at the staged state. Returns the ring index to start at.
export function applyShot(game, shot) {
  const f = game.flight;
  f.pos.set(shot.pos[0], shot.pos[1], shot.pos[2]);
  f.heading = shot.heading;
  f.pitch = shot.pitch;
  f.roll = shot.roll;
  f.speed = shot.speed;
  f.throttle = shot.throttle;
  f.onGround = shot.name === 'start';
  f.gearDown = true;
  f.fuel = shot.name === 'play' ? 78 : 92;
  game.cameraMode = shot.camera;
  game.ringIndex = shot.ringIndex ?? 0;
  game.flight.missionComplete = game.ringIndex >= 8;
  game.score = shot.ringIndex ? shot.ringIndex * 100 : 0;
  game.state = 'flying';
  game.elapsedSec = shot.ringIndex ? 68 + shot.ringIndex * 9 : 0;
  // Freeze the flight model: the staged frame must not fly on and crash while
  // the screenshot is being taken. The real game is unaffected.
  game.frozen = true;
  // Mark passed rings as cleared so the HUD and beacons agree with the stage.
  game.rings.forEach((r, i) => { r.passed = i < game.ringIndex; });
  game.updateRingVisuals();
  game.hud.hideOverlay();
  // Let the renderer draw a few settled frames, then signal the capturer.
  setTimeout(() => { window.__shotReady = true; }, 1400);
}
