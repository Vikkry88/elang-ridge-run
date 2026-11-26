// input.js — keyboard + mouse flight controls.
// W/S throttle, Arrow Up/Down pitch, Arrow Left/Right roll, A/D rudder,
// G gear, C camera, P pause, M mute, R restart. Mouse drag steers too.

export class Input {
  constructor(doc) {
    this.keys = new Set();
    this.mouse = { down: false, dx: 0, dy: 0 };
    this.pressed = new Set(); // edge-triggered keys, consumed by the game loop
    doc.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    doc.addEventListener('keyup', (e) => this.keys.delete(e.code));
    doc.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      this.mouse.down = true;
      this.mouse.dx = 0; this.mouse.dy = 0;
    });
    doc.addEventListener('mouseup', () => { this.mouse.down = false; });
    doc.addEventListener('mousemove', (e) => {
      if (!this.mouse.down) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    doc.addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });
  }

  consume(code) {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  // Per-frame flight axes in [-1, 1], plus throttle keys.
  axes() {
    const k = this.keys;
    let pitch = 0, roll = 0, yaw = 0, throttleDelta = 0;
    if (k.has('ArrowUp')) pitch += 1;
    if (k.has('ArrowDown')) pitch -= 1;
    if (k.has('ArrowLeft')) roll -= 1;
    if (k.has('ArrowRight')) roll += 1;
    if (k.has('KeyA')) yaw -= 1;
    if (k.has('KeyD')) yaw += 1;
    if (k.has('KeyW')) throttleDelta += 0.55;
    if (k.has('KeyS')) throttleDelta -= 0.55;
    // Mouse drag: pull back to climb, push to dive, steer with lateral drag.
    if (this.mouse.down) {
      pitch += Math.max(-1, Math.min(1, this.mouse.dy / 160));
      roll += Math.max(-1, Math.min(1, this.mouse.dx / 200));
      this.mouse.dx *= 0.92; this.mouse.dy *= 0.92;
    }
    return {
      pitch: Math.max(-1, Math.min(1, pitch)),
      roll: Math.max(-1, Math.min(1, roll)),
      yaw, throttleDelta,
    };
  }

  endFrame() { this.pressed.clear(); }
}
