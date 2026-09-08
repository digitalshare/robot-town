import * as THREE from 'three';
import { MAT, box, rbox, cyl } from '../materials/palette.js';
import { screenFace } from '../helpers/tech.js';

const SPEED = 2.2;

export function robotMesh(index) {
  const g = new THREE.Group();
  g.userData.name = `UNIT-${String(index + 1).padStart(2, '0')}`;
  g.add(cyl(0.42, 0.5, 0.24, MAT.wallDark, 14, 0, 0.12, 0));
  g.add(rbox(0.9, 1, 0.7, MAT.wallWhite, 0, 0.86, 0, 0.16));
  g.add(box(0.62, 0.5, 0.18, MAT.wallGray, 0, 0.95, -0.42));
  const visor = screenFace(0.56, 0.22, MAT.screen);
  visor.position.set(0, 1.08, 0.36);
  g.add(visor);
  for (const sx of [-1, 1]) g.add(cyl(0.13, 0.13, 0.5, MAT.wallGray, 10, sx * 0.56, 1.12, 0));
  g.add(cyl(0.03, 0.03, 0.42, MAT.wallDark, 6, 0.22, 1.57, -0.14, false));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), MAT.cyan);
  tip.position.set(0.22, 1.82, -0.14);
  g.add(tip);
  return g;
}

function seedOf(count) {
  let s = (count * 2654435761) >>> 0 || 7;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function createRobots({ group, room, obstacles = [], count = 4 }) {
  const rnd = seedOf(count);
  const blocked = obstacles.map((o) => ({
    minX: o.x - o.w / 2 - 0.8,
    maxX: o.x + o.w / 2 + 0.8,
    minZ: o.z - o.d / 2 - 0.8,
    maxZ: o.z + o.d / 2 + 0.8,
  }));
  const limX = Math.max(1, room.w / 2 - room.margin);
  const limZ = Math.max(1, room.d / 2 - room.margin);

  function free(x, z) {
    return blocked.every((b) => x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ);
  }

  function sample(from) {
    for (let i = 0; i < 32; i++) {
      const x = (rnd() * 2 - 1) * limX;
      const z = (rnd() * 2 - 1) * limZ;
      if (!free(x, z)) continue;
      if (from && Math.hypot(x - from.x, z - from.z) < 2) continue;
      return { x, z };
    }
    return free(0, 0) ? { x: 0, z: 0 } : { x: limX * 0.4, z: limZ * 0.4 };
  }

  const bots = [];
  for (let i = 0; i < count; i++) {
    const node = robotMesh(i);
    const start = sample(null);
    node.position.set(start.x, 0, start.z);
    node.rotation.y = rnd() * Math.PI * 2;
    group.add(node);
    bots.push({ node, target: sample(start), wait: rnd() * 0.8, t: rnd() * 4, phase: rnd() * Math.PI * 2 });
  }

  return {
    count: bots.length,
    update(dt) {
      const step = Math.min(dt, 0.05);
      for (const b of bots) {
        b.t += step;
        if (b.wait > 0) {
          b.wait -= step;
          b.node.position.y = Math.abs(Math.sin(b.t * 2 + b.phase)) * 0.02;
          if (b.wait > 0) continue;
          b.target = sample(b.node.position);
        }
        const dx = b.target.x - b.node.position.x;
        const dz = b.target.z - b.node.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.18) {
          b.wait = 0.4 + rnd() * 0.8;
          continue;
        }
        const move = Math.min(SPEED * step, dist);
        b.node.position.x += (dx / dist) * move;
        b.node.position.z += (dz / dist) * move;
        b.node.rotation.y = Math.atan2(dx, dz);
        b.node.position.y = Math.abs(Math.sin(b.t * 6 + b.phase)) * 0.05;
      }
    },
    positions() {
      return bots.map((b) => [Math.round(b.node.position.x * 100) / 100, Math.round(b.node.position.z * 100) / 100]);
    },
  };
}
