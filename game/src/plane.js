// plane.js — the Elang-7 bush plane: original low-poly mesh plus arcade flight
// physics (throttle, lift, banked turns, stall, gear, fuel).

import * as THREE from 'three';
import { PLANE, RUNWAY, WORLD } from './config.js';
import { terrainHeightAt } from './world.js';

// Build the aircraft from primitives: orange-and-cream bush plane with a
// spinning propeller, high wing, tail, fixed gear and navigation lights.
export function buildPlaneMesh() {
  const g = new THREE.Group();
  g.name = 'elang7';
  const orange = new THREE.MeshLambertMaterial({ color: 0xe8622a });
  const cream = new THREE.MeshLambertMaterial({ color: 0xf2e8d5 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x9fd4ff, shininess: 120, specular: 0xffffff });

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.55, 7.2, 10), orange);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.name = 'fuselage';
  g.add(fuselage);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 1.4, 10), cream);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = -4.2;
  nose.name = 'nose';
  g.add(nose);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 8), glass);
  canopy.scale.set(0.95, 0.75, 1.7);
  canopy.position.set(0, 0.75, -1.4);
  canopy.name = 'canopy';
  g.add(canopy);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.28, 2.1), cream);
  wing.position.set(0, 0.85, -0.6);
  wing.name = 'wing';
  g.add(wing);
  const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 2.1), orange);
  wingTipL.position.set(-5.8, 0.85, -0.6);
  wingTipL.name = 'wingTipL';
  g.add(wingTipL);
  const wingTipR = wingTipL.clone();
  wingTipR.position.x = 5.8;
  wingTipR.name = 'wingTipR';
  g.add(wingTipR);
  const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.1, 1.7), orange);
  tailFin.position.set(0, 1.0, 3.4);
  tailFin.rotation.x = -0.25;
  tailFin.name = 'tailFin';
  g.add(tailFin);
  const stabilizer = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.22, 1.3), cream);
  stabilizer.position.set(0, 0.35, 3.5);
  stabilizer.name = 'stabilizer';
  g.add(stabilizer);
  // Propeller: spinner + two blades, spins with throttle.
  const prop = new THREE.Group();
  prop.position.set(0, 0, -5.05);
  prop.name = 'prop';
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 10), dark);
  spinner.rotation.x = -Math.PI / 2;
  prop.add(spinner);
  const bladeGeo = new THREE.BoxGeometry(0.34, 3.6, 0.12);
  const blade1 = new THREE.Mesh(bladeGeo, dark);
  blade1.name = 'propBlade';
  prop.add(blade1);
  const blade2 = new THREE.Mesh(bladeGeo, dark);
  blade2.rotation.z = Math.PI / 2;
  blade2.name = 'propBlade';
  prop.add(blade2);
  // Faint spinning-prop disc, shown instead of the blades in cockpit view:
  // a frozen blade reads as a black bar, a translucent disc reads as motion.
  const propDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.8, 32),
    new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.1, side: THREE.DoubleSide }),
  );
  propDisc.name = 'propDisc';
  propDisc.visible = false;
  prop.add(propDisc);
  g.add(prop);
  // Fixed tricycle gear.
  const gearMat = dark;
  for (const [gx, gz] of [[-1.1, -1.2], [1.1, -1.2], [0, 2.6]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 6), gearMat);
    leg.position.set(gx, -1.15, gz);
    leg.name = 'gear';
    g.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), gearMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(gx, -1.75, gz);
    wheel.name = 'gear';
    g.add(wheel);
  }
  // Cockpit dashboard: instrument panel with lit gauges + glareshield, fixed
  // to the airframe just ahead of the pilot. Hidden in chase view, shown in
  // cockpit view (toggled by main.js) so the cockpit shot reads as a cockpit.
  // Kept narrow (1.7 m) so it frames the view instead of filling it.
  const cockpit = new THREE.Group();
  cockpit.name = 'cockpit';
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.75, 0.14),
    // Basic (unlit) so the panel reads as dark navy instead of pitch black:
    // its pilot-facing side gets no sun.
    new THREE.MeshBasicMaterial({ color: 0x243447 }),
  );
  panel.position.set(0, 0.25, -2.75);
  panel.rotation.x = -0.28;
  cockpit.add(panel);
  const shield = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.18, 0.45),
    new THREE.MeshBasicMaterial({ color: 0x1a2530 }),
  );
  shield.position.set(0, 0.68, -2.6);
  shield.rotation.x = 0.15;
  cockpit.add(shield);
  // Six lit gauges, two rows of three, with needles. The panel tilts back
  // 0.28 rad, so the face sits further back at the top: gauge z follows the
  // face (top row -2.72, bottom row -2.63) or the lower row sinks into it.
  const gaugeCols = [0xe8f6ff, 0xffd27a, 0x9dffb0, 0xe8f6ff, 0xff9d7a, 0x9dffb0];
  gaugeCols.forEach((c, i) => {
    const gx = -0.55 + (i % 3) * 0.55;
    const gy = 0.42 - Math.floor(i / 3) * 0.3;
    const gz = Math.floor(i / 3) === 0 ? -2.72 : -2.63;
    const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), new THREE.MeshBasicMaterial({ color: c }));
    gauge.position.set(gx, gy, gz);
    gauge.rotation.x = -0.28;
    cockpit.add(gauge);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.01), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    needle.position.set(gx, gy, gz + 0.01);
    needle.rotation.z = i * 0.9 - 1.2;
    needle.rotation.x = -0.28;
    cockpit.add(needle);
  });
  cockpit.visible = false;
  g.add(cockpit);
  // Navigation lights: red left, green right, white tail strobe.
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  navL.position.set(-5.9, 0.85, -0.6);
  g.add(navL);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2aff66 }));
  navR.position.set(5.9, 0.85, -0.6);
  g.add(navR);
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  strobe.position.set(0, 0.6, 3.9);
  g.add(strobe);
  return { group: g, prop, strobe };
}

export class FlightModel {
  constructor() {
    this.reset();
  }

  reset() {
    this.pos = new THREE.Vector3(RUNWAY.x, WORLD.runwayElevation + 2, 150);
    this.heading = 0; // radians, 0 = north (-Z)
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.throttle = 0;
    this.gearDown = true;
    this.fuel = PLANE.fuelStart;
    this.verticalSpeed = 0;
    this.onGround = true;
    this.crashed = false;
    this.landed = false;
    this.stalled = false;
    this.propAngle = 0;
    // Set by the game once every ring is flown: only then does a runway
    // touchdown complete the mission. Landing early is a touch-and-go.
    this.missionComplete = false;
  }

  // One physics step. input: {pitch, roll, yaw, throttleDelta, throttleSet}.
  // Returns an event string ('stall' | 'crash-terrain' | 'crash-water' | 'landed' | null).
  update(dt, input) {
    if (this.crashed || this.landed) return null;
    const p = PLANE;

    if (input.throttleSet !== null && input.throttleSet !== undefined) {
      this.throttle = THREE.MathUtils.clamp(input.throttleSet, 0, 1);
    }
    this.throttle = THREE.MathUtils.clamp(this.throttle + (input.throttleDelta || 0) * dt, 0, 1);

    // Speed chases the throttle's target; drag grows with the square of speed.
    const target = this.throttle * p.maxSpeed;
    const accel = target > this.speed ? 14 : 9;
    this.speed += THREE.MathUtils.clamp(target - this.speed, -accel * dt, accel * dt);
    this.speed = Math.max(0, this.speed);

    // Fuel only burns while the engine works.
    this.fuel = Math.max(0, this.fuel - p.fuelBurnPerSec * this.throttle * dt);
    if (this.fuel <= 0 && this.throttle > 0) this.throttle = 0;

    // Control authority grows with airspeed; on the ground the plane steers slowly.
    const authority = THREE.MathUtils.clamp((this.speed - 8) / 40, 0, 1);
    const rollTarget = THREE.MathUtils.clamp((input.roll || 0) * 0.9, -0.9, 0.9);
    this.roll += (rollTarget - this.roll) * Math.min(1, dt * 3.2);
    const pitchTarget = THREE.MathUtils.clamp((input.pitch || 0) * 0.55, -0.55, 0.55);
    this.pitch += (pitchTarget - this.pitch) * Math.min(1, dt * 2.6);
    this.heading -= Math.sin(this.roll) * p.turnRate * authority * dt * (this.speed / p.cruiseSpeed + 0.3);
    this.heading += (input.yaw || 0) * 0.35 * dt * (this.onGround ? 0.4 : 1);

    // Stall: below stall speed the wing quits and the nose drops.
    this.stalled = !this.onGround && this.speed < p.stallSpeed;
    const climb = this.stalled
      ? -14
      : Math.sin(this.pitch) * this.speed * (this.speed > p.stallSpeed ? 1 : 0.4);
    this.verticalSpeed = THREE.MathUtils.clamp(climb, -18, p.climbRate);

    const forward = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    this.pos.addScaledVector(forward, this.speed * dt);
    this.pos.y += this.verticalSpeed * dt;

    // Ground handling. While on the ground the plane rolls along it: pitch
    // alone never lifts it — rotation needs speed AND pitch, so a slow plane
    // cannot float off the strip into a stall.
    const ground = terrainHeightAt(this.pos.x, this.pos.z);
    const gearHeight = 2.0;
    const overRunway = Math.abs(this.pos.x - RUNWAY.x) < RUNWAY.width / 2 + 6
      && Math.abs(this.pos.z - RUNWAY.z) < RUNWAY.length / 2 + 6;
    if (this.onGround) {
      this.pos.y = ground + gearHeight;
      this.verticalSpeed = 0;
      // Rolling onto the strip after a rough-field touchdown still counts,
      // once the mission is complete: the wheels are on Runway 18.
      if (overRunway && this.missionComplete && this.gearDown
        && this.speed > 12 && this.speed < 55
        && Math.abs(Math.sin(this.heading)) < 0.45) {
        this.landed = true;
        this.speed *= 0.4;
        return 'landed';
      }
      if (this.speed > p.stallSpeed + 6 && this.pitch > 0.12) {
        this.onGround = false; // rotate: lift off
      }
    } else if (this.pos.y <= ground + gearHeight) {
      this.pos.y = ground + gearHeight;
      // A firm landing is survivable: up to 6 m/s down (about 1,200 fpm).
      // Steeper, faster or gear-up impacts destroy the aircraft.
      const gentle = Math.abs(this.verticalSpeed) < 6 && this.speed < 55;
      const aligned = Math.abs(Math.sin(this.heading)) < 0.45;
      if (overRunway && gentle && aligned && this.gearDown && this.speed > 12 && this.missionComplete) {
        this.landed = true;
        this.speed *= 0.4;
        return 'landed';
      }
      // A gentle, gear-down touchdown on flat ground is a rough-field landing,
      // not a crash: the bush plane rolls out and can take off again. Only a
      // hard, fast, gear-up or off-flat impact destroys the aircraft.
      if (gentle && this.gearDown && this.speed < 55) {
        this.onGround = true;
        this.verticalSpeed = 0;
      } else {
        this.crashed = true;
        return ground <= 1 ? 'crash-water' : 'crash-terrain';
      }
    }
    // Ocean ditching.
    if (!this.onGround && this.pos.y <= 1.2 && ground <= 1) {
      this.crashed = true;
      return 'crash-water';
    }
    // Keep the plane inside the world.
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -2950, 2950);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -2950, 2950);
    this.pos.y = Math.min(this.pos.y, 1200);
    this.propAngle += (2 + this.throttle * 55) * dt;
    return null;
  }

  speedKnots() { return Math.round(this.speed * 1.944); }
  altitudeFt() { return Math.round((this.pos.y - WORLD.seaLevel) * 3.281); }
  headingDeg() { return Math.round(((THREE.MathUtils.radToDeg(this.heading) % 360) + 360) % 360); }
}
