import * as THREE from 'three';
import { occupiedRects } from '../town/plots.js';

const EYE_HEIGHT = 1.7;
const RADIUS = 0.8;
const WALK_SPEED = 9;
const RUN_MULT = 2;
const TURN_SPEED = 1.8;
const PITCH_LIMIT = 1.2;
const MOVE_KEYS = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  ArrowUp: 'forward',
  ArrowDown: 'back',
};
const LOOK_KEYS = {
  KeyQ: 'yawLeft',
  KeyE: 'yawRight',
  ArrowLeft: 'yawLeft',
  ArrowRight: 'yawRight',
  PageUp: 'pitchUp',
  PageDown: 'pitchDown',
};

function blocked(rects, x, z) {
  return rects.some((r) => Math.abs(x - r.x) < r.w / 2 + RADIUS && Math.abs(z - r.z) < r.d / 2 + RADIUS);
}

// User-controlled first-person camera for the town scene. Keyboard only:
// WASD / arrows move, Q/E (or left/right arrows with Shift) turn, PageUp/PageDown look.
export function createWalkView({ camera, getGrid, getPlacements }) {
  const keys = new Set();
  const pose = { x: 0, z: 0, yaw: 0, pitch: 0 };
  let active = false;
  let rects = [];

  function clampTo(grid, x, z) {
    const b = grid.bounds;
    return [Math.min(b.maxX - RADIUS, Math.max(b.minX + RADIUS, x)), Math.min(b.maxZ - RADIUS, Math.max(b.minZ + RADIUS, z))];
  }

  function apply() {
    const grid = getGrid();
    camera.position.set(pose.x, grid.slabTop + EYE_HEIGHT, pose.z);
    camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
  }

  function onKeyDown(e) {
    if (!active || e.metaKey || e.ctrlKey || e.altKey) return;
    if (MOVE_KEYS[e.code] || LOOK_KEYS[e.code]) {
      keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code.startsWith('Page')) e.preventDefault();
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.add('Shift');
  }

  function onKeyUp(e) {
    keys.delete(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.delete('Shift');
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => keys.clear());

  return {
    isActive: () => active,
    // Starts on the road in front of the current orbit target, looking at the town centre.
    enter(from) {
      const grid = getGrid();
      rects = occupiedRects(getPlacements());
      const { cx, cz } = grid.bounds;
      pose.x = from?.x ?? cx;
      pose.z = from?.z ?? cz;
      pose.yaw = Math.atan2(pose.x - cx, pose.z - cz) + Math.PI;
      pose.pitch = 0;
      if (blocked(rects, pose.x, pose.z)) {
        // Spawn on the nearest road line instead of inside a building.
        pose.x = cx;
        pose.z = cz;
        if (blocked(rects, pose.x, pose.z)) [pose.x, pose.z] = [grid.bounds.minX + RADIUS * 2, grid.bounds.minZ + RADIUS * 2];
      }
      keys.clear();
      active = true;
      apply();
    },
    exit() {
      active = false;
      keys.clear();
    },
    position: () => ({ x: pose.x, z: pose.z, yaw: pose.yaw, pitch: pose.pitch }),
    update(dt) {
      if (!active) return;
      const grid = getGrid();
      const shift = keys.has('Shift');
      let turn = 0;
      for (const [code, k] of Object.entries(LOOK_KEYS)) {
        if (!keys.has(code)) continue;
        // Arrow left/right turn; plain up/down arrows move.
        if (k === 'yawLeft') turn += 1;
        else if (k === 'yawRight') turn -= 1;
        else if (k === 'pitchUp') pose.pitch = Math.min(PITCH_LIMIT, pose.pitch + TURN_SPEED * dt);
        else if (k === 'pitchDown') pose.pitch = Math.max(-PITCH_LIMIT, pose.pitch - TURN_SPEED * dt);
      }
      pose.yaw += turn * TURN_SPEED * dt;
      let f = 0;
      let s = 0;
      for (const code of keys) {
        const m = MOVE_KEYS[code];
        if (m === 'forward') f += 1;
        else if (m === 'back') f -= 1;
        else if (m === 'left') s -= 1;
        else if (m === 'right') s += 1;
      }
      if (f || s) {
        const len = Math.hypot(f, s);
        const step = WALK_SPEED * (shift ? RUN_MULT : 1) * dt;
        const fx = -Math.sin(pose.yaw);
        const fz = -Math.cos(pose.yaw);
        const dx = ((fx * f) + (-fz * s)) / len * step;
        const dz = ((fz * f) + (fx * s)) / len * step;
        // Axis-separated so the walker slides along building walls.
        let [nx] = clampTo(grid, pose.x + dx, pose.z);
        if (!blocked(rects, nx, pose.z)) pose.x = nx;
        let [, nz] = clampTo(grid, pose.x, pose.z + dz);
        if (!blocked(rects, pose.x, nz)) pose.z = nz;
      }
      apply();
    },
  };
}
