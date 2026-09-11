import * as THREE from 'three';
import { robotMeshFor } from './robotTypes.js';

const SPEED = 2.2;

function seedOf(count) {
  let s = (count * 2654435761) >>> 0 || 7;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function inflate(rects) {
  return rects.map((o) => ({
    minX: o.x - o.w / 2 - 0.8,
    maxX: o.x + o.w / 2 + 0.8,
    minZ: o.z - o.d / 2 - 0.8,
    maxZ: o.z + o.d / 2 + 0.8,
  }));
}

// One bot per stored robot entity. The entity's pos is its home: wanderers roam
// away from it, idle bots stay put, and neither ever writes the live position back.
export function createRobots({ group, room, obstacles = [], entities = [] }) {
  const rnd = seedOf(entities.length);
  let blocked = inflate(obstacles);
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
  for (const entity of entities) {
    const node = robotMeshFor(entity.type, entity.accent, entity.scale);
    node.userData.isRobot = true;
    node.userData.robotId = entity.id;
    node.userData.name = entity.name;
    const home = { x: entity.pos[0], z: entity.pos[1] };
    node.position.set(home.x, 0, home.z);
    node.rotation.y = THREE.MathUtils.degToRad(entity.rot);
    group.add(node);
    bots.push({
      node,
      home,
      wander: entity.wander !== false,
      target: entity.wander === false ? { ...home } : sample(home),
      wait: rnd() * 0.8,
      t: rnd() * 4,
      phase: rnd() * Math.PI * 2,
    });
  }

  return {
    count: bots.length,
    setObstacles(rects) {
      blocked = inflate(Array.isArray(rects) ? rects : []);
      for (const b of bots) {
        if (b.wander && !free(b.target.x, b.target.z)) b.target = sample(b.node.position);
      }
    },
    update(dt) {
      const step = Math.min(dt, 0.05);
      for (const b of bots) {
        b.t += step;
        if (!b.wander) {
          b.node.position.x = b.home.x;
          b.node.position.z = b.home.z;
          b.node.position.y = Math.abs(Math.sin(b.t * 2 + b.phase)) * 0.02;
          continue;
        }
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
    targets() {
      return bots.map((b) => [Math.round(b.target.x * 100) / 100, Math.round(b.target.z * 100) / 100]);
    },
  };
}
