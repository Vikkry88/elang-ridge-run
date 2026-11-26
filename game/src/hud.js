// hud.js — the cockpit HUD: compass tape, speed/altitude tapes, attitude
// indicator, minimap, mission card, fuel and throttle gauges, toasts and overlays.
// All readouts are live from the flight model, so the screenshots show a real game.

import { RINGS, RUNWAY, WORLD, ISLANDS } from './config.js';
import { terrainHeightAt } from './world.js';

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class Hud {
  constructor(doc) {
    this.doc = doc;
    this.el = {};
    for (const id of [
      'hud', 'missionCard', 'missionTitle', 'missionDetail', 'ringCount', 'score',
      'fuelBar', 'fuelText', 'throttleBar', 'throttleText', 'speedTape', 'altTape',
      'vsiText', 'headingText', 'compassTape', 'timerText', 'gearText', 'flapText',
      'warnText', 'toast', 'overlay', 'overlayTitle', 'overlayBody', 'overlayHint',
      'attitude', 'minimap', 'windText', 'ringDist',
    ]) this.el[id] = doc.getElementById(id);
    this.attCtx = this.el.attitude.getContext('2d');
    this.mapCtx = this.el.minimap.getContext('2d');
    this.buildMinimapBase();
    this.lastToastAt = 0;
  }

  buildMinimapBase() {
    // Pre-render the islands once onto an offscreen canvas; each frame only the
    // plane, rings and runway are drawn over it.
    const cv = document.createElement('canvas');
    cv.width = 220; cv.height = 220;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0e2f4d';
    ctx.fillRect(0, 0, 220, 220);
    const toMap = (x, z) => [110 + (x / WORLD.size) * 220, 110 + (z / WORLD.size) * 220];
    for (const [cx, cz, r] of ISLANDS) {
      const [mx, my] = toMap(cx, cz);
      const mr = (r / WORLD.size) * 220;
      const grad = ctx.createRadialGradient(mx, my, mr * 0.1, mx, my, mr);
      grad.addColorStop(0, '#3f7d3a');
      grad.addColorStop(1, '#2a5230');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d9c28a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.stroke();
    }
    const [rx, ry] = toMap(RUNWAY.x, RUNWAY.z);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(rx - 2, ry - 16, 4, 32);
    this.mapBase = cv;
  }

  showOverlay(title, body, hint) {
    this.el.overlayTitle.textContent = title;
    this.el.overlayBody.innerHTML = body;
    this.el.overlayHint.textContent = hint;
    this.el.overlay.classList.remove('hidden');
  }
  hideOverlay() { this.el.overlay.classList.add('hidden'); }

  toast(msg, ms = 2600) {
    const now = performance.now();
    if (now - this.lastToastAt < 300) return;
    this.lastToastAt = now;
    this.el.toast.textContent = msg;
    this.el.toast.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.add('hidden'), ms);
  }

  // state: {flight, ringIndex, score, elapsedSec, cameraMode, warnings[]}
  update(state) {
    const f = state.flight;
    this.el.score.textContent = String(state.score).padStart(5, '0');
    this.el.ringCount.textContent = `${Math.min(state.ringIndex, RINGS.length)}/${RINGS.length}`;
    const next = RINGS[state.ringIndex];
    if (next) {
      const dx = next[0] - f.pos.x, dy = next[1] - f.pos.y, dz = next[2] - f.pos.z;
      const dist = Math.hypot(dx, dy, dz);
      this.el.ringDist.textContent = `RING ${state.ringIndex + 1} · ${Math.round(dist)} m`;
      this.el.missionDetail.textContent = `Fly the orange ring, then land on Runway 18. Ring ${state.ringIndex + 1} of ${RINGS.length} is ${Math.round(dist)} m ahead.`;
    } else {
      this.el.ringDist.textContent = 'ALL RINGS CLEAR — LAND ON RUNWAY 18';
      this.el.missionDetail.textContent = 'All 8 rings flown. Line up on the lit strip and touch down gently, gear down, under 55 m/s.';
    }
    const fuelPct = Math.round(f.fuel);
    this.el.fuelBar.style.width = `${fuelPct}%`;
    this.el.fuelBar.className = `bar-fill${fuelPct < 25 ? ' low' : ''}`;
    this.el.fuelText.textContent = `FUEL ${fuelPct}%`;
    const thrPct = Math.round(f.throttle * 100);
    this.el.throttleBar.style.width = `${thrPct}%`;
    this.el.throttleText.textContent = `THR ${thrPct}%`;
    this.el.speedTape.textContent = `${f.speedKnots()} KT`;
    this.el.altTape.textContent = `${f.altitudeFt().toLocaleString('en-US')} FT`;
    const vs = Math.round(f.verticalSpeed * 196.85);
    this.el.vsiText.textContent = `${vs >= 0 ? '+' : ''}${vs} FPM`;
    const hdg = f.headingDeg();
    this.el.headingText.textContent = `${String(hdg).padStart(3, '0')}°`;
    this.el.compassTape.textContent = this.compassStrip(hdg);
    const m = Math.floor(state.elapsedSec / 60), s = Math.floor(state.elapsedSec % 60);
    this.el.timerText.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    this.el.gearText.textContent = f.gearDown ? 'GEAR DOWN' : 'GEAR UP';
    this.el.gearText.className = f.gearDown ? 'pill on' : 'pill';
    this.el.flapText.textContent = state.cameraMode === 'cockpit' ? 'COCKPIT' : 'CHASE CAM';
    const windKt = 8 + Math.round(4 * Math.sin(state.elapsedSec * 0.05));
    this.el.windText.textContent = `WIND 270°/${windKt} KT`;
    const warns = [];
    if (f.stalled) warns.push('⚠ STALL — NOSE DOWN, FULL THROTTLE');
    if (f.fuel < 25) warns.push('⚠ LOW FUEL — LAND SOON');
    if (f.onGround && f.speed > 55) warns.push('⚠ TOO FAST TO LAND');
    if (state.ringIndex >= RINGS.length && !f.gearDown && f.pos.y < 400) warns.push('⚠ GEAR UP — PRESS G');
    this.el.warnText.textContent = warns.join('   ');
    this.el.warnText.classList.toggle('hidden', warns.length === 0);
    this.drawAttitude(f);
    this.drawMinimap(f, state.ringIndex);
  }

  compassStrip(hdg) {
    // A sliding window of headings around the current one, cardinal labels.
    let out = '';
    for (let off = -40; off <= 40; off += 10) {
      const h = ((hdg + off) % 360 + 360) % 360;
      const label = h % 90 === 0
        ? COMPASS_POINTS[h / 45]
        : String(h).padStart(3, '0');
      out += (off === 0 ? `[${label}]` : ` ${label} `);
    }
    return out;
  }

  drawAttitude(f) {
    const ctx = this.attCtx, W = 150, H = 150, cx = W / 2, cy = H / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, 66, 0, Math.PI * 2); ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-f.roll);
    const pitchPx = THREE_PITCH_PX * f.pitch;
    ctx.translate(0, pitchPx);
    ctx.fillStyle = '#2a6db0';
    ctx.fillRect(-80, -140, 160, 140);
    ctx.fillStyle = '#8a6a3d';
    ctx.fillRect(-80, 0, 160, 140);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-80, 0); ctx.lineTo(80, 0); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
    for (const dy of [-30, -15, 15, 30]) {
      ctx.beginPath(); ctx.moveTo(-28, dy); ctx.lineTo(28, dy); ctx.stroke();
    }
    ctx.restore();
    // Fixed wings marker + bezel.
    ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - 34, cy); ctx.lineTo(cx - 8, cy); ctx.moveTo(cx + 8, cy); ctx.lineTo(cx + 34, cy); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fillStyle = '#ffd34d'; ctx.fill();
    ctx.strokeStyle = '#dfe8f2'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, 66, 0, Math.PI * 2); ctx.stroke();
  }

  drawMinimap(f, ringIndex) {
    const ctx = this.mapCtx;
    ctx.clearRect(0, 0, 220, 220);
    ctx.drawImage(this.mapBase, 0, 0);
    const toMap = (x, z) => [110 + (x / WORLD.size) * 220, 110 + (z / WORLD.size) * 220];
    // Rings: next one amber, cleared ones green.
    RINGS.forEach(([x, , z], i) => {
      const [mx, my] = toMap(x, z);
      ctx.fillStyle = i < ringIndex ? '#37d67a' : i === ringIndex ? '#ffb347' : 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(mx, my, i === ringIndex ? 6 : 4, 0, Math.PI * 2); ctx.fill();
      if (i === ringIndex) {
        ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(mx, my, 10, 0, Math.PI * 2); ctx.stroke();
      }
    });
    // Plane marker, rotated to heading.
    const [px, py] = toMap(f.pos.x, f.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-f.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('NUSA ARCHIPELAGO', 8, 14);
  }
}

const THREE_PITCH_PX = 60;
