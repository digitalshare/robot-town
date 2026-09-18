import * as THREE from 'three';
import { createAvoidance } from '../helpers/avoidance.js';
import { clampRobotScale, robotMeshFor } from './robotTypes.js';

const SPEED = 2.2;
const RADIUS = 0.45; // a unit torso is 0.9 across
const CLEARANCE = 0.8; // how far round furniture a bot plans its path
const ARRIVE = 0.18;
const WAIT_RANGE = [0.4, 1.2];
const MIN_TARGET_DIST = 2;
const MAX_STEP = 0.05;

function seedOf(count) {
  let s = (count * 2654435761) >>> 0 || 7;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const round2 = (v) => Math.round(v * 100) / 100;

// One bot per stored robot entity. The entity's pos is its home: wanderers roam
// away from it, idle bots stay put, and neither ever writes the live position back.
export function createRobots({ group, room, obstacles = [], entities = [] }) {
  const rnd = seedOf(entities.length);
  const limX = Math.max(1, room.w / 2 - room.margin);
  const limZ = Math.max(1, room.d / 2 - room.margin);
  const world = createAvoidance({
    bounds: { minX: -limX, maxX: limX, minZ: -limZ, maxZ: limZ },
    obstacles,
    pad: CLEARANCE,
    rng: rnd,
    speed: SPEED,
    radius: RADIUS,
    arrive: ARRIVE,
    minTargetDist: MIN_TARGET_DIST,
  });

  const bots = [];
  for (const entity of entities) {
    const node = robotMeshFor(entity.type, entity.accent, entity.scale);
    node.userData.isRobot = true;
    node.userData.robotId = entity.id;
    node.userData.name = entity.name;
    const home = { x: entity.pos[0], z: entity.pos[1] };
    node.rotation.y = THREE.MathUtils.degToRad(entity.rot);
    group.add(node);
    const agent = world.addAgent({
      id: entity.id,
      x: home.x,
      z: home.z,
      r: RADIUS * clampRobotScale(entity.scale),
      wander: entity.wander !== false,
      home,
    });
    node.position.set(agent.x, 0, agent.z);
    bots.push({ node, agent, t: rnd() * 4, phase: rnd() * Math.PI * 2 });
  }

  return {
    count: bots.length,
    setObstacles(rects) {
      world.setObstacles(Array.isArray(rects) ? rects : [], CLEARANCE);
    },
    update(dt) {
      const step = Number.isFinite(dt) ? Math.min(dt, MAX_STEP) : 0;
      world.step(step, { waitRange: WAIT_RANGE });
      for (const b of bots) {
        const { node, agent } = b;
        b.t += step;
        node.position.x = agent.x;
        node.position.z = agent.z;
        if (agent.moving) node.rotation.y = Math.atan2(agent.vx, agent.vz);
        node.position.y = agent.moving
          ? Math.abs(Math.sin(b.t * 6 + b.phase)) * 0.05
          : Math.abs(Math.sin(b.t * 2 + b.phase)) * 0.02;
      }
    },
    positions() {
      return bots.map((b) => [round2(b.agent.x), round2(b.agent.z)]);
    },
    targets() {
      return bots.map((b) => [round2(b.agent.target.x), round2(b.agent.target.z)]);
    },
  };
}
