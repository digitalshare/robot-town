import * as THREE from 'three';
import { BUILDINGS, CHARGING_PADS, computeTrees, inBlock } from '../data/layout.js';
import { MAT, unitBox } from '../materials/palette.js';
import { disposeGroup } from './dispose.js';
import { occupiedRects } from './plots.js';
import { clampRobotScale, robotMeshFor, typeForRobot } from '../interior/robotTypes.js';
import { createAvoidance, inflateRects } from '../helpers/avoidance.js';
import { outlineFor } from '../helpers/outline.js';

const SPEED = 2.4;
const RADIUS = 0.5;
const ARRIVE = 0.18;
const WAIT_RANGE = [0.5, 1.6];
const MIN_TARGET_DIST = 6; // streets are big; short hops look like jitter
const MAX_TOWN_ROBOTS = 160;
const BOUND_INSET = 2;
const CELL = 4;
const MAX_STEP = 0.05;
const SURFACE_LERP = 10;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const TYPE_HEIGHT = { unit: 1.9, hauler: 1.6, sentinel: 2.5 };

// Buildings get a wider apron than trees: the grass pad already stands 0.35 off
// the footprint, and a bot walking through that hedge reads as a clip.
const BUILDING_PAD = 0.75;
const TREE_PAD = 0.3;
const PAD_OBSTACLE = 3.2;
const PAD_PAD = 0.5;
const SEED_CLEARANCE = 1.85; // 0.35 grass-pad apron + 1.5 of walking room
const BUILDING_STAY_RANGE = [2.5, 6];
const BUILDING_VISIT_INTERVAL = [4, 12];

const round2 = (v) => Math.round(v * 100) / 100;
const asRect = (b) => ({
  x: (b.minX + b.maxX) / 2,
  z: (b.minZ + b.maxZ) / 2,
  w: b.maxX - b.minX,
  d: b.maxZ - b.minZ,
});

function surfaceY(grid, x, z) {
  if (inBlock(grid, x, z)) return grid.slabTop;
  const hw = grid.roadWidth / 2;
  const onX = grid.linesX.some((lx) => Math.abs(x - lx) <= hw);
  const onZ = grid.linesZ.some((lz) => Math.abs(z - lz) <= hw);
  if (onX && onZ) return 0.12;
  if (onZ) return 0.09;
  if (onX) return 0.06;
  return 0;
}

function buildingSites(state) {
  const sites = new Map();
  for (const b of BUILDINGS) sites.set(b.id, { x: b.x, z: b.z, footprint: b.footprint });
  for (const p of state.placements) {
    // A custom robot's buildingId is its library entry's id, not the placement id.
    if (!sites.has(p.libraryId)) sites.set(p.libraryId, { x: p.x, z: p.z, footprint: p.footprint });
  }
  return sites;
}

function seedSpot(site, index) {
  if (!site) return { x: 0, z: 0 };
  const angle = GOLDEN_ANGLE * index;
  const rad = Math.max(site.footprint[0], site.footprint[1]) / 2 + SEED_CLEARANCE;
  return { x: site.x + Math.cos(angle) * rad, z: site.z + Math.sin(angle) * rad };
}

// Every stored robot walks the streets too. The interior and the town are two
// scenes that never render at once, so the same entity can be drawn in room-local
// coordinates indoors and in global coordinates out here with no zone bookkeeping.
// Neither view writes the live position back to the store.
export function createTownRobots({ townStore, parent, getGrid }) {
  const root = new THREE.Group();
  root.name = 'town-robots';
  parent.add(root);

  const bots = new Map();
  const proxies = [];
  const outlineOffset = new THREE.Vector3();
  let world = null;
  let grid = getGrid();
  let outline = null;
  let selectedId = null;
  let warnedCap = false;

  function clearSelect() {
    if (outline) disposeGroup(outline);
    outline = null;
    selectedId = null;
  }

  function rebuild() {
    clearSelect();
    for (const bot of bots.values()) disposeGroup(bot.node);
    bots.clear();
    proxies.length = 0;
    const rnd = Math.random;

    grid = getGrid();
    const state = townStore.getState();
    const bounds = grid.bounds;
    const occupied = occupiedRects(state.placements);
    const obstacles = [
      ...inflateRects(occupied, BUILDING_PAD),
      ...inflateRects(computeTrees(grid, occupied).map(([x, z, s]) => ({ x, z, w: s, d: s })), TREE_PAD),
      ...inflateRects(CHARGING_PADS.map(([x, z]) => ({ x, z, w: PAD_OBSTACLE, d: PAD_OBSTACLE })), PAD_PAD),
    ].map(asRect);

    world = createAvoidance({
      bounds: {
        minX: bounds.minX + BOUND_INSET,
        maxX: bounds.maxX - BOUND_INSET,
        minZ: bounds.minZ + BOUND_INSET,
        maxZ: bounds.maxZ - BOUND_INSET,
      },
      obstacles,
      pad: 0, // already inflated per source above
      cellSize: CELL,
      speed: SPEED,
      radius: RADIUS,
      arrive: ARRIVE,
      minTargetDist: MIN_TARGET_DIST,
    });

    const sites = buildingSites(state);
    const roster = townStore.allRobots();
    if (roster.length > MAX_TOWN_ROBOTS && !warnedCap) {
      warnedCap = true;
      console.warn(`robot-town: ${roster.length} robots in the town, only the first ${MAX_TOWN_ROBOTS} walk outside`);
    }
    const perBuilding = new Map();
    for (const entity of roster.slice(0, MAX_TOWN_ROBOTS)) {
      const index = perBuilding.get(entity.buildingId) ?? 0;
      perBuilding.set(entity.buildingId, index + 1);
      const r = RADIUS * clampRobotScale(entity.scale);
      const spot = seedSpot(sites.get(entity.buildingId), index);
      // Derived, not stored: nudging a blocked seed costs nothing and keeps an
      // idle bot from standing inside a wall it is forbidden to move out of.
      const home = world.isFree(spot.x, spot.z, r) ? spot : world.sampleTarget(spot, { minDist: 0, tries: 32, r });
      const agent = world.addAgent({
        id: entity.id,
        x: home.x,
        z: home.z,
        r,
        wander: entity.wander !== false,
        home,
      });

      const node = robotMeshFor(entity.type, entity.accent, entity.scale);
      node.userData.isRobot = true;
      node.userData.robotId = entity.id;
      node.userData.name = entity.name;
      // At this camera distance a ~20px bot adds nothing to the shadow pass and
      // roughly doubles its cost, so town bots opt out. Indoor bots keep theirs.
      node.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false;
        o.receiveShadow = false;
      });
      const height = (TYPE_HEIGHT[typeForRobot(entity.type).type] ?? 1.9) * clampRobotScale(entity.scale);
      const proxy = new THREE.Mesh(unitBox, MAT.dark);
      proxy.scale.set(0.9, height, 0.9);
      proxy.position.y = height / 2;
      proxy.visible = false;
      proxy.userData = { isRobot: true, robotId: entity.id, name: entity.name };
      node.add(proxy);
      node.position.set(agent.x, surfaceY(grid, agent.x, agent.z), agent.z);
      root.add(node);
      proxies.push(proxy);
      bots.set(entity.id, {
        node,
        agent,
        entity,
        home,
        phase: 'street',
        insideFor: 0,
        visitIn: BUILDING_VISIT_INTERVAL[0] + rnd() * (BUILDING_VISIT_INTERVAL[1] - BUILDING_VISIT_INTERVAL[0]),
        random: rnd,
      });
    }
    root.updateMatrixWorld(true);
  }

  function select(id) {
    const bot = id ? bots.get(id) : null;
    clearSelect();
    if (!bot) return null;
    selectedId = id;
    bot.node.updateWorldMatrix(true, true);
    outline = outlineFor(bot.node);
    outlineOffset.copy(outline.position).sub(bot.node.position);
    root.add(outline);
    return selectedId;
  }

  function pickRobot(raycaster) {
    if (!proxies.length) return null;
    // Non-recursive: one box test per robot instead of every mesh in every model.
    const hit = raycaster.intersectObjects(proxies, false)[0];
    if (!hit) return null;
    return { kind: 'robot', id: hit.object.userData.robotId, name: hit.object.userData.name, node: hit.object.parent };
  }

  function update(dt) {
    if (!world || !bots.size) return;
    const step = Number.isFinite(dt) ? Math.min(dt, MAX_STEP) : 0;
    for (const bot of bots.values()) {
      if (bot.node.visible && bot.phase === 'street' && bot.agent.wander) {
        bot.visitIn -= step;
        if (bot.visitIn <= 0) {
          bot.phase = 'to-building';
          bot.agent.target = { ...bot.home };
          bot.agent.wait = 0;
        }
      }
      if (!bot.node.visible) {
        bot.insideFor -= step;
        // Keep the agent parked while its robot is inside the building.
        bot.agent.wait = 1;
      }
    }
    world.step(step, { waitRange: WAIT_RANGE });
    // Stepping off a slab onto asphalt is a 0.19 drop; easing it avoids a pop.
    const ease = Math.min(1, step * SURFACE_LERP);
    for (const bot of bots.values()) {
      const { node, agent } = bot;
      if (!node.visible && bot.insideFor <= 0) {
        node.visible = true;
        bot.phase = 'street';
        bot.agent.wait = 0;
        bot.visitIn = BUILDING_VISIT_INTERVAL[0] + bot.random() * (BUILDING_VISIT_INTERVAL[1] - BUILDING_VISIT_INTERVAL[0]);
        bot.agent.target = world.sampleTarget(bot.agent, { minDist: MIN_TARGET_DIST, r: bot.agent.r });
        if (outline && selectedId === bot.entity.id) outline.visible = true;
      }
      if (node.visible && bot.phase === 'to-building' && agent.justArrived) {
        bot.phase = 'inside';
        bot.insideFor = BUILDING_STAY_RANGE[0] + bot.random() * (BUILDING_STAY_RANGE[1] - BUILDING_STAY_RANGE[0]);
        node.visible = false;
        if (outline && selectedId === bot.entity.id) outline.visible = false;
      }
      node.position.x = agent.x;
      node.position.z = agent.z;
      node.position.y += (surfaceY(grid, agent.x, agent.z) - node.position.y) * ease;
      if (agent.moving) node.rotation.y = Math.atan2(agent.vx, agent.vz);
    }
    if (outline && selectedId) {
      const bot = bots.get(selectedId);
      if (bot) outline.position.copy(bot.node.position).add(outlineOffset);
    }
    root.updateMatrixWorld(true);
  }

  // 'object' commits fire on every interior drag, so they are deliberately not
  // a rebuild trigger; the town does not depend on room furniture.
  townStore.subscribe((state, reason) => {
    if (reason === 'expand' || reason === 'building' || reason === 'placement' || reason === 'robot' || reason === 'space') {
      rebuild();
    }
  });

  rebuild();

  return {
    root,
    update,
    rebuild,
    select,
    clearSelect,
    pickRobot,
    proxies: () => proxies,
    selectedId: () => selectedId,
    nodeFor: (id) => bots.get(id)?.node ?? null,
    count: () => bots.size,
    positions() {
      return [...bots.values()].map((b) => [round2(b.agent.x), round2(b.agent.z)]);
    },
    targets() {
      return [...bots.values()].map((b) => [round2(b.agent.target.x), round2(b.agent.target.z)]);
    },
    obstacles() {
      return world ? world.obstacles.list().map((b) => ({ ...b })) : [];
    },
    stats() {
      return {
        robots: bots.size,
        obstacles: world ? world.obstacles.count() : 0,
        selected: selectedId,
        bounds: world ? { ...world.bounds() } : null,
        radius: RADIUS,
        cap: MAX_TOWN_ROBOTS,
      };
    },
    dispose() {
      clearSelect();
      for (const bot of bots.values()) disposeGroup(bot.node);
      bots.clear();
      proxies.length = 0;
      world = null;
    },
  };
}
