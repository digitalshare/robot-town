import * as THREE from 'three';
import { MAT, box } from '../materials/palette.js';
import { screenFace } from '../helpers/tech.js';
import { rack, desk, plant, crate, tank, pad } from './props.js';

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

const ROT = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

function seedOf(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = ((h ^ id.charCodeAt(i)) * 16777619) >>> 0;
  return h || 1;
}

function rand(seed) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function atWall(node, room, side, t, thickness) {
  const inset = thickness / 2 + 0.5;
  const spanX = Math.max(0, room.w - 1.6);
  const spanZ = Math.max(0, room.d - 1.6);
  node.rotation.y = ROT[side];
  node.position.x = side === 1 ? room.w / 2 - inset : side === 3 ? -room.w / 2 + inset : spanX * t - spanX / 2;
  node.position.z = side === 0 ? -room.d / 2 + inset : side === 2 ? room.d / 2 - inset : spanZ * t - spanZ / 2;
  return node;
}

function spread(n) {
  return Array.from({ length: n }, (_, i) => (i + 0.5) / n);
}

function fit(room, per, min, max) {
  return Math.max(min, Math.min(max, Math.round(room.w / per)));
}

function crateCluster(r) {
  const g = new THREE.Group();
  const scales = [1, 0.75 + r() * 0.5, 0.6 + r() * 0.4];
  const spots = [
    [-0.75, -0.45],
    [0.7, 0.4],
    [-0.35, 0.85],
  ];
  scales.forEach((s, i) => {
    const c = crate(s);
    c.position.set(spots[i][0], 0, spots[i][1]);
    c.rotation.y = (r() - 0.5) * 0.5;
    g.add(c);
  });
  return g;
}

function plantRow(n, r) {
  const g = new THREE.Group();
  g.add(box(n * 1.15, 0.5, 1.3, MAT.crate, 0, 0.25, 0));
  for (let i = 0; i < n; i++) {
    const p = plant(0.8 + r() * 0.35);
    p.position.set((i - (n - 1) / 2) * 1.15, 0.5, 0);
    g.add(p);
  }
  return g;
}

function panel(w, h, y, mat = MAT.screen) {
  const g = new THREE.Group();
  const s = screenFace(w, h, mat);
  s.position.y = y;
  g.add(s);
  g.add(box(w + 0.24, h + 0.24, 0.12, MAT.wallDark, 0, y, -0.12));
  const legH = Math.max(0.2, y - h / 2);
  for (const sx of [-1, 1]) g.add(box(0.12, legH, 0.12, MAT.wallDark, sx * (w / 2 - 0.3), legH / 2, -0.12));
  return g;
}

const FIXTURES = {
  datacore(room, r) {
    const out = spread(fit(room, 5, 2, 4)).map((t) => atWall(rack(2, 3, 1), room, 0, t, 1));
    out.push(atWall(rack(2, 3, 1), room, 3, 0.32 + r() * 0.06, 1));
    out.push(atWall(rack(2, 3, 1), room, 3, 0.68 + r() * 0.06, 1));
    out.push(atWall(panel(Math.min(5, room.w * 0.35), 1.6, 2.1), room, 1, 0.5, 0.3));
    return out;
  },
  warehouse(room, r) {
    const out = [];
    const n = fit(room, 7, 2, 3);
    for (const side of [0, 2]) spread(n).forEach((t) => out.push(atWall(rack(3.2, 3.4, 1.2), room, side, t + (r() - 0.5) * 0.04, 1.2)));
    out.push(atWall(crateCluster(r), room, 3, 0.5, 1.6));
    return out;
  },
  labs(room, r) {
    const out = spread(fit(room, 7, 2, 3)).map((t) => atWall(desk(2.6, 1.3), room, 0, t, 1.3));
    out.push(atWall(tank(0.8, 2.2), room, 1, 0.3 + r() * 0.05, 1.6));
    out.push(atWall(tank(0.8, 2.2), room, 1, 0.7, 1.6));
    out.push(atWall(plant(1 + r() * 0.3), room, 3, 0.5, 1.3));
    return out;
  },
  manufacturing(room, r) {
    const out = spread(fit(room, 6, 2, 3)).map((t) => atWall(desk(3.4, 1.6), room, 0, t, 1.6));
    out.push(atWall(crateCluster(r), room, 2, 0.28, 1.6));
    out.push(atWall(tank(0.9, 2.4), room, 2, 0.75, 1.8));
    out.push(atWall(rack(1.8, 2.4, 0.9), room, 1, 0.5, 0.9));
    return out;
  },
  droneport(room, r) {
    const out = [atWall(desk(2.8, 1.3), room, 0, 0.5, 1.3)];
    out.push(atWall(crateCluster(r), room, 3, 0.32, 1.6));
    out.push(atWall(crateCluster(r), room, 3, 0.72, 1.6));
    out.push(atWall(panel(3, 1.4, 2.2), room, 1, 0.5, 0.3));
    return out;
  },
  recycling(room, r) {
    return [
      atWall(crateCluster(r), room, 0, 0.5, 1.6),
      atWall(tank(0.7, 1.8), room, 1, 0.5, 1.4),
      atWall(rack(1.4, 2.2, 0.7), room, 3, 0.5, 0.7),
    ];
  },
  maintenance(room, r) {
    return [
      atWall(desk(2.6, 1.3), room, 0, 0.32, 1.3),
      atWall(desk(2.6, 1.3), room, 0, 0.72, 1.3),
      atWall(pad(), room, 2, 0.5, 2.8),
      atWall(crateCluster(r), room, 3, 0.5, 1.6),
    ];
  },
  housing(room, r) {
    const out = spread(fit(room, 6, 2, 3)).map((t) => atWall(pad(), room, 0, t, 2.8));
    out.push(atWall(rack(1.8, 2.6, 0.9), room, 3, 0.5, 0.9));
    out.push(atWall(plant(0.9 + r() * 0.3), room, 2, 0.85, 1.2));
    return out;
  },
  solararray(room, r) {
    const out = [
      atWall(rack(2, 2.6, 0.9), room, 0, 0.3, 0.9),
      atWall(rack(2, 2.6, 0.9), room, 0, 0.7, 0.9),
      atWall(tank(0.7, 2), room, 1, 0.5, 1.4),
      atWall(panel(2.6, 1.3, 2), room, 2, 0.5, 0.3),
    ];
    return r() > 0.5 ? out : out.slice(0, 3);
  },
  powerstorage(room) {
    return [
      atWall(tank(0.8, 2.2), room, 0, 0.28, 1.6),
      atWall(tank(0.8, 2.2), room, 0, 0.72, 1.6),
      atWall(rack(1.8, 2.4, 0.8), room, 2, 0.5, 0.8),
    ];
  },
  gardens(room, r) {
    const out = spread(fit(room, 4, 2, 3)).map((t) => atWall(plantRow(3, r), room, 0, t, 1.4));
    out.push(atWall(plant(1.2 + r() * 0.3), room, 2, 0.3, 1.4));
    out.push(atWall(plant(1.2 + r() * 0.3), room, 2, 0.72, 1.4));
    out.push(atWall(desk(2.2, 1.1), room, 1, 0.5, 1.1));
    return out;
  },
  aistrategy(room, r) {
    const out = [
      atWall(desk(2.6, 1.3), room, 0, 0.3, 1.3),
      atWall(desk(2.6, 1.3), room, 0, 0.7, 1.3),
      atWall(panel(Math.min(4, room.w * 0.32), 1.5, 2.1), room, 2, 0.5, 0.3),
      atWall(plant(1 + r() * 0.3), room, 3, 0.3, 1.3),
      atWall(plant(1 + r() * 0.3), room, 3, 0.75, 1.3),
    ];
    return out;
  },
  custom(room, r) {
    return [
      atWall(desk(2.4, 1.2), room, 0, 0.35, 1.2),
      atWall(crateCluster(r), room, 3, 0.5, 1.6),
      atWall(plant(1 + r() * 0.3), room, 1, 0.5, 1.3),
      atWall(panel(Math.min(3.4, room.w * 0.3), 1.4, 2), room, 2, 0.5, 0.3),
    ];
  },
};

export function fixturesFor(record, room) {
  const build = FIXTURES[record.type] ?? FIXTURES.custom;
  return build(room, rand(seedOf(String(record.id))));
}
