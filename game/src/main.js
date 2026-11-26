// main.js — Elang Ridge Run: boot, game loop, cameras, mission state machine.
// A complete 3D flight game: take off from Runway 18, fly 8 rings over the Nusa
// archipelago past the volcano, then land back on the strip. Keyboard + mouse.

import * as THREE from 'three';
import { WORLD, RINGS, RUNWAY, PLANE, TIMES } from './config.js';
import {
  buildTerrain, buildOcean, buildSky, buildVolcanoSmoke, updateSmoke,
  buildClouds, updateClouds, buildTrees, buildRings, buildRunway, terrainHeightAt,
} from './world.js';
import { buildPlaneMesh, FlightModel } from './plane.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { parseShot, applyShot } from './shots.js';

class Game {
  constructor() {
    this.flight = new FlightModel();
    this.cameraMode = 'chase';
    this.state = 'title'; // title | flying | paused | crashed | complete
    this.ringIndex = 0;
    this.score = 0;
    this.elapsedSec = 0;
    this.crashReason = '';
    this.cameraShake = 0;
    this.stallWarned = false;
    this.frozen = false;

    const canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 20000);
    this.camera.position.set(0, 40, 180);

    buildSky(this.scene);
    this.scene.add(buildTerrain());
    this.scene.add(buildOcean());
    buildTrees(this.scene);
    buildRunway(this.scene);
    this.smoke = buildVolcanoSmoke(this.scene);
    this.clouds = buildClouds(this.scene);
    this.rings = buildRings(this.scene);

    const plane = buildPlaneMesh();
    this.planeGroup = plane.group;
    this.prop = plane.prop;
    this.strobe = plane.strobe;
    this.scene.add(this.planeGroup);

    this.hud = new Hud(document);
    this.audio = new AudioEngine();
    this.input = new Input(document);
    this.shot = parseShot();

    window.addEventListener('resize', () => this.onResize());
    document.getElementById('startBtn').addEventListener('click', () => {
      if (this.state === 'crashed' || this.state === 'complete') this.restart();
      else this.startFlight();
    });
    document.getElementById('restartBtn').addEventListener('click', () => this.restart());
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && this.state === 'title') this.startFlight();
      if (e.code === 'KeyR' && (this.state === 'crashed' || this.state === 'complete')) this.restart();
    });

    this.showTitle();
    if (this.shot) applyShot(this, this.shot);
    this.lastT = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  showTitle() {
    this.hud.showOverlay(
      'ELANG RIDGE RUN',
      `<p class="tagline">Volcano courier over the Nusa archipelago — take off from Runway 18, thread <b>8 glowing rings</b> past the smoking volcano, then bring her home and land on the strip.</p>
       <p class="controls"><b>W/S</b> throttle &nbsp;·&nbsp; <b>← →</b> bank &nbsp;·&nbsp; <b>↑ ↓</b> pitch &nbsp;·&nbsp; <b>A/D</b> rudder<br>
       <b>G</b> gear &nbsp;·&nbsp; <b>C</b> chase / cockpit &nbsp;·&nbsp; <b>P</b> pause &nbsp;·&nbsp; <b>M</b> mute &nbsp;·&nbsp; mouse drag steers</p>
       <p class="scoring">Ring <b>+100</b> · landing <b>+500</b> · rings refund fuel · watch the stall speed: below <b>50 kt</b> she drops.</p>`,
      'Press ENTER or click FLY THE ROUTE',
    );
  }

  startFlight() {
    this.audio.init();
    this.hud.hideOverlay();
    this.state = 'flying';
    this.hud.toast('Runway 18 clear for takeoff — full throttle, rotate at 70 kt');
  }

  restart() {
    this.flight.reset();
    this.flight.missionComplete = false;
    this.ringIndex = 0;
    this.score = 0;
    this.elapsedSec = 0;
    this.cameraMode = 'chase';
    this.rings.forEach((r) => { r.passed = false; });
    this.updateRingVisuals();
    this.hud.hideOverlay();
    this.state = 'flying';
    this.hud.toast('Back on the strip — fly the route again');
  }

  updateRingVisuals() {
    this.rings.forEach((r, i) => {
      if (r.passed) {
        r.ring.material.color.setHex(0x37d67a);
        r.ring.material.opacity = 0.5;
        r.beacon.material.opacity = 0.05;
      } else if (i === this.ringIndex) {
        r.ring.material.color.setHex(0xff8c1a);
        r.ring.material.opacity = 0.98;
        r.beacon.material.opacity = 0.22;
      } else {
        r.ring.material.color.setHex(0xffc27a);
        r.ring.material.opacity = 0.6;
        r.beacon.material.opacity = 0.08;
      }
    });
  }

  checkRings() {
    const next = this.rings[this.ringIndex];
    if (!next) return;
    const d = this.flight.pos.distanceTo(next.pos);
    if (d < 26) {
      next.passed = true;
      this.ringIndex += 1;
      this.score += PLANE.scoreRing;
      this.flight.fuel = Math.min(100, this.flight.fuel + PLANE.fuelRingRefund);
      this.audio.chime();
      this.updateRingVisuals();
      if (this.ringIndex >= RINGS.length) {
        this.flight.missionComplete = true;
        this.hud.toast('ALL RINGS CLEAR — land on Runway 18, gear down!', 4200);
      } else {
        this.hud.toast(`RING ${this.ringIndex} CLEAR — +100 · next ring ${Math.round(this.flight.pos.distanceTo(this.rings[this.ringIndex].pos))} m ahead`);
      }
    }
  }

  finishLanding() {
    const f = this.flight;
    const timeBonus = Math.max(0, Math.round((TIMES.missionParSec - this.elapsedSec) * 2));
    const fuelBonus = Math.round(f.fuel * 2);
    this.score += PLANE.scoreLanding + timeBonus + fuelBonus;
    this.state = 'complete';
    this.audio.thud();
    this.cameraShake = 0.4;
    this.hud.showOverlay(
      'MISSION COMPLETE — WELCOME HOME',
      `<p class="tagline">All 8 rings flown and the Elang-7 is parked on Runway 18.</p>
       <p class="scoring">Landing +500 · time bonus +${timeBonus} · fuel bonus +${fuelBonus}</p>
       <p class="big-score">FINAL SCORE ${this.score.toLocaleString('en-US')}</p>`,
      'Press R to fly it again',
    );
  }

  crash(reason) {
    this.state = 'crashed';
    this.crashReason = reason;
    this.audio.thud();
    this.cameraShake = 0.8;
    const why = reason === 'crash-water'
      ? 'Ditched in the sea — the Elang-7 is a bush plane, not a boat.'
      : 'Terrain strike — the volcano and ridges do not forgive low flying.';
    this.hud.showOverlay(
      'CRASHED',
      `<p class="tagline">${why}</p><p class="scoring">Score kept: ${this.score.toLocaleString('en-US')} · rings ${this.ringIndex}/${RINGS.length}</p>`,
      'Press R to try again',
    );
  }

  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    const t = now / 1000;

    // Edge-triggered keys.
    if (this.input.consume('KeyC') && this.state === 'flying') {
      this.cameraMode = this.cameraMode === 'chase' ? 'cockpit' : 'chase';
      this.hud.toast(this.cameraMode === 'cockpit' ? 'Cockpit view — instruments lit' : 'Chase view');
    }
    if (this.input.consume('KeyG') && this.state === 'flying') {
      this.flight.gearDown = !this.flight.gearDown;
      this.hud.toast(this.flight.gearDown ? 'Gear down' : 'Gear up');
    }
    if (this.input.consume('KeyP') && (this.state === 'flying' || this.state === 'paused')) {
      this.state = this.state === 'flying' ? 'paused' : 'flying';
      if (this.state === 'paused') this.hud.showOverlay('PAUSED', '<p class="tagline">The Nusa archipelago waits.</p>', 'Press P to resume');
      else this.hud.hideOverlay();
    }
    if (this.input.consume('KeyM')) {
      const muted = this.audio.toggleMute();
      this.hud.toast(muted ? 'Sound off' : 'Sound on');
    }

    if (this.state === 'flying' && !this.frozen) {
      this.elapsedSec += dt;
      const axes = this.input.axes();
      const event = this.flight.update(dt, axes);
      this.checkRings();
      if (this.flight.stalled && !this.stallWarned) {
        this.stallWarned = true;
        this.hud.toast('STALL — push the nose down, full throttle!', 3000);
      }
      if (!this.flight.stalled) this.stallWarned = false;
      if (event === 'landed') this.finishLanding();
      else if (event === 'crash-terrain' || event === 'crash-water') this.crash(event);
      this.audio.update(this.flight.throttle, this.flight.speed / PLANE.maxSpeed, true);
    } else if (this.state === 'title') {
      const a = t * 0.12;
      this.camera.position.set(Math.sin(a) * 26, 10, 150 + Math.cos(a) * 26);
      this.camera.lookAt(this.flight.pos.x, 8, this.flight.pos.z);
      this.flight.propAngle += dt * 0.4;
    }

    // Sync the 3D plane with the flight model.
    const f = this.flight;
    if (this.frozen) f.propAngle += dt * 28; // keep the prop spinning in staged shots
    this.planeGroup.position.copy(f.pos);
    this.planeGroup.rotation.set(0, 0, 0);
    this.planeGroup.rotateY(f.heading);
    this.planeGroup.rotateX(f.pitch);
    this.planeGroup.rotateZ(-f.roll);
    this.prop.rotation.z = f.propAngle;
    this.strobe.material.color.setHex(Math.floor(t * 1.4) % 2 === 0 ? 0xffffff : 0x222222);

    // Ring pulse + beacon shimmer.
    this.rings.forEach((r, i) => {
      if (!r.passed && i === this.ringIndex) {
        const s = 1 + Math.sin(t * 3) * 0.04;
        r.ring.scale.set(s, s, 1);
      }
    });

    updateSmoke(this.smoke.smoke, t, this.smoke.baseY);
    updateClouds(this.clouds, dt);
    this.updateCamera(dt, t);

    this.hud.update({
      flight: f, ringIndex: this.ringIndex, score: this.score,
      elapsedSec: this.elapsedSec, cameraMode: this.cameraMode,
    });
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  updateCamera(dt, t) {
    if (this.state === 'title') return;
    const f = this.flight;
    const shake = this.cameraShake > 0 ? this.cameraShake : 0;
    this.cameraShake = Math.max(0, this.cameraShake - dt * 1.4);
    const shX = shake > 0 ? (Math.random() - 0.5) * shake * 0.6 : 0;
    const shY = shake > 0 ? (Math.random() - 0.5) * shake * 0.6 : 0;

    // Parts hidden in cockpit view (they would surround or block the camera):
    // fuselage, canopy, wing, tail, gear, prop blades (a frozen blade reads
    // as a black bar — a faint disc reads as a spinning prop instead). The
    // nose, spinner, nav lights and the dashboard stay visible, so the
    // cockpit shot reads as a cockpit.
    const HIDDEN_IN_COCKPIT = new Set(['fuselage', 'canopy', 'wing', 'wingTipL', 'wingTipR', 'tailFin', 'stabilizer', 'gear', 'propBlade']);
    if (this.cameraMode === 'cockpit') {
      // Pilot's seat: just behind the canopy, looking down the nose.
      const forward = new THREE.Vector3(-Math.sin(f.heading), 0, -Math.cos(f.heading));
      const eye = f.pos.clone().addScaledVector(forward, 0.6);
      eye.y += 1.15;
      // Staged shots are frozen: snap the camera, don't lerp from the boot pose.
      this.camera.position.lerp(eye, this.frozen ? 1 : Math.min(1, dt * 14));
      const look = f.pos.clone().addScaledVector(forward, 120);
      look.y += Math.sin(f.pitch) * 60 - 4;
      this.camera.lookAt(look.x + shX, look.y + shY, look.z);
      this.camera.rotation.z -= f.roll * 0.55;
      this.planeGroup.traverse((o) => {
        if (HIDDEN_IN_COCKPIT.has(o.name)) o.visible = false;
        if (o.name === 'cockpit' || o.name === 'propDisc') o.visible = true;
      });
      document.body.classList.add('cockpit');
    } else {
      this.planeGroup.traverse((o) => {
        if (HIDDEN_IN_COCKPIT.has(o.name)) o.visible = true;
        if (o.name === 'cockpit' || o.name === 'propDisc') o.visible = false;
      });
      document.body.classList.remove('cockpit');
      const forward = new THREE.Vector3(-Math.sin(f.heading), 0, -Math.cos(f.heading));
      const back = forward.clone().multiplyScalar(-16 - f.speed * 0.06);
      const target = f.pos.clone().add(back);
      target.y += 5.5 + f.speed * 0.015;
      // Keep the chase camera above the ground.
      const ground = terrainHeightAt(target.x, target.z);
      target.y = Math.max(target.y, ground + 6);
      this.camera.position.lerp(target, this.frozen ? 1 : Math.min(1, dt * 5));
      const look = f.pos.clone().addScaledVector(forward, 30);
      look.y += 1;
      this.camera.lookAt(look.x + shX, look.y + shY, look.z);
    }
  }
}

window.__game = new Game();
