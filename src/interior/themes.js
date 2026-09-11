import { MAT } from '../materials/palette.js';
import { typeFor } from './objectTypes.js';
import { restY } from './spaceSpec.js';

const LOOKS = {
  lab: { floor: MAT.slab, wall: MAT.wallWhite, trim: MAT.cyanSoft },
  industrial: { floor: MAT.asphaltDark, wall: MAT.wallGray, trim: MAT.orange },
  storage: { floor: MAT.slab, wall: MAT.wallDark, trim: MAT.cyanSoft },
  green: { floor: MAT.grassDark, wall: MAT.wallWhite, trim: MAT.teal },
  office: { floor: MAT.wallGray, wall: MAT.wallWhite, trim: MAT.screen },
  power: { floor: MAT.asphalt, wall: MAT.wallDark, trim: MAT.cyan },
};

const TYPE_LOOK = {
  housing: 'power',
  labs: 'lab',
  solararray: 'power',
  powerstorage: 'power',
  droneport: 'industrial',
  recycling: 'industrial',
  manufacturing: 'industrial',
  maintenance: 'industrial',
  datacore: 'storage',
  warehouse: 'storage',
  gardens: 'green',
  aistrategy: 'office',
};

export function themeFor(type) {
  return LOOKS[TYPE_LOOK[type] ?? 'office'];
}

const ROT_DEG = [0, 270, 180, 90];

const round2 = (n) => Math.round(n * 100) / 100;

function seedOf(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = ((h ^ id.charCodeAt(i)) * 16777619) >>> 0;
  return h || 1;
}

function rand(seed) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function atWallPos(room, side, t, thickness) {
  const inset = thickness / 2 + 0.5;
  const spanX = Math.max(0, room.w - 1.6);
  const spanZ = Math.max(0, room.d - 1.6);
  const x = side === 1 ? room.w / 2 - inset : side === 3 ? -room.w / 2 + inset : spanX * t - spanX / 2;
  const z = side === 0 ? -room.d / 2 + inset : side === 2 ? room.d / 2 - inset : spanZ * t - spanZ / 2;
  return [round2(x), round2(z)];
}

function rotXZ(x, z, deg) {
  const a = (deg * Math.PI) / 180;
  return [round2(x * Math.cos(a) + z * Math.sin(a)), round2(-x * Math.sin(a) + z * Math.cos(a))];
}

function atWall(part, room, side, t, thickness, rot = ROT_DEG[side]) {
  const [x, z] = atWallPos(room, side, t, thickness);
  return { part, rot, x, z };
}

function crateCluster(room, r, side, t, thickness) {
  const scales = [1, 0.75 + r() * 0.5, 0.6 + r() * 0.4];
  const spots = [
    [-0.75, -0.45],
    [0.7, 0.4],
    [-0.35, 0.85],
  ];
  const [bx, bz] = atWallPos(room, side, t, thickness);
  return scales.map((s, i) => {
    const [ox, oz] = rotXZ(spots[i][0], spots[i][1], ROT_DEG[side]);
    const jitter = Math.round((((r() - 0.5) * 0.5) / Math.PI) * 180);
    return {
      part: { kind: 'crate', mat: 'crate', size: [round2(s)] },
      rot: ROT_DEG[side] + jitter,
      x: round2(bx + ox),
      z: round2(bz + oz),
    };
  });
}

function spread(n) {
  return Array.from({ length: n }, (_, i) => (i + 0.5) / n);
}

function fit(room, per, min, max) {
  return Math.max(min, Math.min(max, Math.round(room.w / per)));
}

const rackPart = (w, h, d) => ({ kind: 'rack', mat: 'wallDark', size: [w, h, d] });
const deskPart = (w, d) => ({ kind: 'desk', mat: 'wallWhite', size: [w, d] });
const tankPart = (r, h) => ({ kind: 'tank', mat: 'wallWhite', r, h });
const plantPart = (s) => ({ kind: 'plant', size: [round2(s)] });
const boardPart = (w, h) => ({ kind: 'board', mat: 'screen', size: [round2(w), round2(h)] });
const planterPart = () => ({ kind: 'planter', mat: 'crate', size: [3.45, 0.5, 1.3] });
const padPart = () => ({ kind: 'pad' });

const FIXTURES = {
  datacore(room, r) {
    const out = spread(fit(room, 5, 2, 4)).map((t) => atWall(rackPart(2, 3, 1), room, 0, t, 1));
    out.push(atWall(rackPart(2, 3, 1), room, 3, 0.32 + r() * 0.06, 1));
    out.push(atWall(rackPart(2, 3, 1), room, 3, 0.68 + r() * 0.06, 1));
    out.push(atWall(boardPart(Math.min(5, room.w * 0.35), 1.6), room, 1, 0.5, 0.3));
    return out;
  },
  warehouse(room, r) {
    const out = [];
    const n = fit(room, 7, 2, 3);
    for (const side of [0, 2]) spread(n).forEach((t) => out.push(atWall(rackPart(3.2, 3.4, 1.2), room, side, t + (r() - 0.5) * 0.04, 1.2)));
    out.push(...crateCluster(room, r, 3, 0.5, 1.6));
    return out;
  },
  labs(room, r) {
    const out = spread(fit(room, 7, 2, 3)).map((t) => atWall(deskPart(2.6, 1.3), room, 0, t, 1.3));
    out.push(atWall(tankPart(0.8, 2.2), room, 1, 0.3 + r() * 0.05, 1.6));
    out.push(atWall(tankPart(0.8, 2.2), room, 1, 0.7, 1.6));
    out.push(atWall(plantPart(1 + r() * 0.3), room, 3, 0.5, 1.3));
    return out;
  },
  manufacturing(room, r) {
    const out = spread(fit(room, 6, 2, 3)).map((t) => atWall(deskPart(3.4, 1.6), room, 0, t, 1.6));
    out.push(...crateCluster(room, r, 2, 0.28, 1.6));
    out.push(atWall(tankPart(0.9, 2.4), room, 2, 0.75, 1.8));
    out.push(atWall(rackPart(1.8, 2.4, 0.9), room, 1, 0.5, 0.9));
    return out;
  },
  droneport(room, r) {
    const out = [atWall(deskPart(2.8, 1.3), room, 0, 0.5, 1.3)];
    out.push(...crateCluster(room, r, 3, 0.32, 1.6));
    out.push(...crateCluster(room, r, 3, 0.72, 1.6));
    out.push(atWall(boardPart(3, 1.4), room, 1, 0.5, 0.3));
    return out;
  },
  recycling(room, r) {
    return [
      ...crateCluster(room, r, 0, 0.5, 1.6),
      atWall(tankPart(0.7, 1.8), room, 1, 0.5, 1.4),
      atWall(rackPart(1.4, 2.2, 0.7), room, 3, 0.5, 0.7),
    ];
  },
  maintenance(room, r) {
    return [
      atWall(deskPart(2.6, 1.3), room, 0, 0.32, 1.3),
      atWall(deskPart(2.6, 1.3), room, 0, 0.72, 1.3),
      atWall(padPart(), room, 2, 0.5, 2.8),
      ...crateCluster(room, r, 3, 0.5, 1.6),
    ];
  },
  housing(room, r) {
    const out = spread(fit(room, 6, 2, 3)).map((t) => atWall(padPart(), room, 0, t, 2.8));
    out.push(atWall(rackPart(1.8, 2.6, 0.9), room, 3, 0.5, 0.9));
    out.push(atWall(plantPart(0.9 + r() * 0.3), room, 2, 0.85, 1.2));
    return out;
  },
  solararray(room, r) {
    const out = [
      atWall(rackPart(2, 2.6, 0.9), room, 0, 0.3, 0.9),
      atWall(rackPart(2, 2.6, 0.9), room, 0, 0.7, 0.9),
      atWall(tankPart(0.7, 2), room, 1, 0.5, 1.4),
      atWall(boardPart(2.6, 1.3), room, 2, 0.5, 0.3),
    ];
    return r() > 0.5 ? out : out.slice(0, 3);
  },
  powerstorage(room) {
    return [
      atWall(tankPart(0.8, 2.2), room, 0, 0.28, 1.6),
      atWall(tankPart(0.8, 2.2), room, 0, 0.72, 1.6),
      atWall(rackPart(1.8, 2.4, 0.8), room, 2, 0.5, 0.8),
    ];
  },
  gardens(room, r) {
    const out = spread(fit(room, 4, 2, 3)).map((t) => atWall(planterPart(), room, 0, t, 1.4));
    out.push(atWall(plantPart(1.2 + r() * 0.3), room, 2, 0.3, 1.4));
    out.push(atWall(plantPart(1.2 + r() * 0.3), room, 2, 0.72, 1.4));
    out.push(atWall(deskPart(2.2, 1.1), room, 1, 0.5, 1.1));
    return out;
  },
  aistrategy(room, r) {
    return [
      atWall(deskPart(2.6, 1.3), room, 0, 0.3, 1.3),
      atWall(deskPart(2.6, 1.3), room, 0, 0.7, 1.3),
      atWall(boardPart(Math.min(4, room.w * 0.32), 1.5), room, 2, 0.5, 0.3),
      atWall(plantPart(1 + r() * 0.3), room, 3, 0.3, 1.3),
      atWall(plantPart(1 + r() * 0.3), room, 3, 0.75, 1.3),
    ];
  },
  custom(room, r) {
    return [
      atWall(deskPart(2.4, 1.2), room, 0, 0.35, 1.2),
      ...crateCluster(room, r, 3, 0.5, 1.6),
      atWall(plantPart(1 + r() * 0.3), room, 1, 0.5, 1.3),
      atWall(boardPart(Math.min(3.4, room.w * 0.3), 1.4), room, 2, 0.5, 0.3),
    ];
  },
};

export function defaultLayoutFor(record, room) {
  const build = FIXTURES[record.type] ?? FIXTURES.custom;
  const items = build(room, rand(seedOf(String(record.id))));
  const totals = new Map();
  for (const item of items) totals.set(item.part.kind, (totals.get(item.part.kind) ?? 0) + 1);
  const seen = new Map();
  return items.map((item) => {
    const kind = item.part.kind;
    const n = (seen.get(kind) ?? 0) + 1;
    seen.set(kind, n);
    const base = typeFor(kind)?.name ?? kind.toUpperCase();
    const part = { ...item.part };
    if (Array.isArray(part.size)) part.size = [...part.size];
    part.pos = [item.x, restY(kind, part), item.z];
    return { name: totals.get(kind) > 1 ? `${base} ${n}` : base, part, rot: item.rot };
  });
}
