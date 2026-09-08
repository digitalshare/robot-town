export const ROAD_SPACING = 32;
export const MAX_EXPANSIONS = 4;
export const PLOT = [24, 24];

const BASE_LINES = [-48, -16, 16, 48];
const CURB = 3;
const GROUND_MARGIN = 138;
const RING_OFFSET = 6;

function midpoints(lines) {
  const out = [];
  for (let i = 0; i < lines.length - 1; i++) out.push((lines[i] + lines[i + 1]) / 2);
  return out;
}

export function gridForExpansion(expansions) {
  const n = Math.max(0, Math.min(MAX_EXPANSIONS, Math.trunc(Number(expansions) || 0)));
  const east = BASE_LINES[BASE_LINES.length - 1];
  const linesX = BASE_LINES.concat(Array.from({ length: n }, (_, i) => east + ROAD_SPACING * (i + 1)));
  const linesZ = [...BASE_LINES];
  const minX = Math.min(...linesX) - CURB;
  const maxX = Math.max(...linesX) + CURB;
  const minZ = Math.min(...linesZ) - CURB;
  const maxZ = Math.max(...linesZ) + CURB;
  const sx = maxX - minX;
  const sz = maxZ - minZ;
  return {
    roadWidth: 6,
    linesX,
    linesZ,
    blockCentersX: midpoints(linesX),
    blockCentersZ: midpoints(linesZ),
    slabSize: 26,
    slabTop: 0.25,
    expansions: n,
    bounds: { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, sx, sz },
    groundSize: Math.max(sx, sz) + GROUND_MARGIN,
  };
}

export const GRID = gridForExpansion(0);

export const SECTOR = { label: 'SECTOR A1', mapLabel: 'MAP : GLOBAL' };

export function mapChipLabel(expansions) {
  const n = Math.max(0, Math.trunc(Number(expansions) || 0));
  if (!n) return SECTOR.mapLabel;
  return `${SECTOR.mapLabel} +${n} SECTOR${n === 1 ? '' : 'S'}`;
}

export const BUILDINGS = [
  {
    id: 'housing',
    type: 'housing',
    name: 'MODULAR ROBOT HOUSING',
    x: -32,
    z: -32,
    footprint: [20, 20],
    description: 'Stacked recharge bays where off-duty units dock overnight for diagnostics and firmware sync.',
  },
  {
    id: 'labs',
    type: 'labs',
    name: 'HYDRO-RESEARCH LABS',
    x: 0,
    z: -32,
    footprint: [24, 16],
    description: 'Water chemistry and closed-loop hydrology research, feeding the gardens and the cooling circuits.',
  },
  {
    id: 'solararray',
    type: 'solararray',
    name: 'SOLAR ARRAY',
    x: 26.5,
    z: -35,
    footprint: [13, 12],
    description: 'Tracker-mounted photovoltaic field supplying the sector during daylight peaks.',
  },
  {
    id: 'powerstorage',
    type: 'powerstorage',
    name: 'POWER STORAGE BANKS',
    x: 39.5,
    z: -25,
    footprint: [9, 7],
    description: 'Cell racks that buffer solar output and hold reserve charge for night shifts.',
  },
  {
    id: 'droneport',
    type: 'droneport',
    name: 'DRONE PORT',
    x: -35,
    z: -4,
    footprint: [15, 15],
    description: 'Landing deck and dispatch tower for survey drones mapping the outer perimeter.',
  },
  {
    id: 'recycling',
    type: 'recycling',
    name: 'RECYCLING CENTER',
    x: -23.5,
    z: 7.5,
    footprint: [7, 7],
    description: 'Shreds and sorts spent parts so reclaimed alloy returns to the manufacturing bay.',
  },
  {
    id: 'datacore',
    type: 'datacore',
    name: 'DATA CORE HUB',
    x: 0,
    z: 0,
    footprint: [22, 22],
    description: 'Central compute and telemetry vault; every subsystem in the sector reports here.',
  },
  {
    id: 'manufacturing',
    type: 'manufacturing',
    name: 'MANUFACTURING BAY',
    x: 31,
    z: -4,
    footprint: [18, 13],
    description: 'Assembly lines and robotic arms that press chassis, joints and drive units.',
  },
  {
    id: 'maintenance',
    type: 'maintenance',
    name: 'BOT MAINTENANCE',
    x: 35,
    z: 8,
    footprint: [9, 9],
    description: 'Walk-in service shop for calibration, lubrication and actuator swaps.',
  },
  {
    id: 'gardens',
    type: 'gardens',
    name: 'HYDROPONIC GARDENS',
    x: -34,
    z: 30,
    footprint: [13, 13],
    description: 'Glazed grow halls producing biomass and filtering grey water for the sector.',
  },
  {
    id: 'warehouse',
    type: 'warehouse',
    name: 'AUTOMATED WAREHOUSE',
    x: 0,
    z: 34,
    footprint: [24, 14],
    description: 'High-rack storage with crane aisles; inventory moves without human handlers.',
  },
  {
    id: 'aistrategy',
    type: 'aistrategy',
    name: 'AI STRATEGY',
    x: 30,
    z: 30,
    footprint: [12, 10],
    description: 'Planning annex that schedules fleet tasks and models sector expansion scenarios.',
  },
];

export const CHARGING_PADS = [
  [11, -11],
  [-11, 11],
  [24, 12],
  [-24, -20],
];

export function inBlock(grid, x, z) {
  const half = grid.slabSize / 2;
  return grid.blockCentersX.some((c) => Math.abs(x - c) <= half) && grid.blockCentersZ.some((c) => Math.abs(z - c) <= half);
}

const rand = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

export function computeTrees(grid, rects, inflate = 1.4) {
  const r = rand(42);
  const trees = [];
  const { minX, maxX, minZ, maxZ } = grid.bounds;
  const west = minX - RING_OFFSET;
  const east = maxX + RING_OFFSET;
  const north = minZ - RING_OFFSET;
  const south = maxZ + RING_OFFSET;
  const span = (lo, hi) => {
    const out = [];
    for (let c = lo + 1; c <= hi - 1; c += 8) out.push(c);
    return out;
  };
  const xs = span(west, east);
  const zs = span(north, south);
  const ring = Math.max(xs.length, zs.length);
  for (let i = 0; i < ring; i++) {
    const x = xs[i];
    const z = zs[i];
    if (x !== undefined) {
      trees.push([x, north, 1 + r() * 0.6, r() > 0.5 ? 0 : 1]);
      trees.push([x + 3, south, 1 + r() * 0.6, r() > 0.5 ? 0 : 1]);
    }
    if (z !== undefined) {
      trees.push([west, z, 1 + r() * 0.6, r() > 0.5 ? 0 : 1]);
      trees.push([east, z + 3, 1 + r() * 0.6, r() > 0.5 ? 0 : 1]);
    }
  }
  for (const bx of grid.blockCentersX) {
    for (const bz of grid.blockCentersZ) {
      let placed = 0;
      for (let i = 0; i < 14 && placed < 4; i++) {
        const x = bx + (r() * 2 - 1) * 11.5;
        const z = bz + (r() * 2 - 1) * 11.5;
        const clear = rects.every(
          (b) => Math.abs(x - b.x) > b.w / 2 + inflate || Math.abs(z - b.z) > b.d / 2 + inflate
        );
        if (clear) {
          trees.push([x, z, 0.8 + r() * 0.5, r() > 0.5 ? 0 : 1]);
          placed++;
        }
      }
    }
  }
  return trees;
}
