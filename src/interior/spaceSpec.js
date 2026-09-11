import * as THREE from 'three';
import { MAT, box, rbox, cyl } from '../materials/palette.js';
import { screenFace } from '../helpers/tech.js';
import { MATERIAL_KEYS } from '../buildings/spec.js';
import { rack, desk, plant, crate, tank, pad, shelf, bench, locker, lamp, monitor, pillar, pipe, chest, board, planter } from './props.js';
import { OBJECT_KINDS } from './objectTypes.js';
import { ACCENTS, ROBOT_TYPE_KEYS, typeForRobot, MIN_ROBOT_SCALE, MAX_ROBOT_SCALE } from './robotTypes.js';

export const SPACE_KINDS = ['box', 'rbox', 'cyl', 'screen', 'rack', 'desk', 'plant', 'pad', 'crate', 'tank'];
export const ALL_KINDS = [...SPACE_KINDS, ...OBJECT_KINDS];
export const MAX_SPACE_PARTS = 40;
export const MAX_ROBOTS = 12;
export const MAX_ROBOTS_PER_ROOM = 24;

const SIZES = { 1: 'SIZE MUST BE [SCALE]', 2: 'SIZE MUST BE [WIDTH, DEPTH OR HEIGHT]', 3: 'SIZE MUST BE [WIDTH, HEIGHT, DEPTH]' };
const SIZE3_LABELS = ['WIDTH', 'HEIGHT', 'DEPTH'];
const SIZE3_MIN = [0.4, 0.2, 0.4];

const SHAPES = {
  box: { size: 3, mat: 'wallGray' },
  rbox: { size: 3, mat: 'wallGray' },
  crate: { size: 1, mat: 'crate' },
  plant: { size: 1 },
  cyl: { rh: true, mat: 'wallGray' },
  tank: { rh: true, mat: 'wallWhite' },
  pillar: { rh: true, mat: 'wallGray' },
  screen: { size: 2, mat: 'screen' },
  desk: { size: 2, mat: 'wallWhite' },
  bench: { size: 2, mat: 'wallGray' },
  monitor: { size: 2, mat: 'screen' },
  rack: { size: 3, mat: 'wallDark' },
  shelf: { size: 3, mat: 'crate' },
  locker: { size: 3, mat: 'wallGray' },
  chest: { size: 3, mat: 'wallDark' },
  lamp: { hOnly: true, mat: 'wallDark' },
  pipe: { hOnly: true, mat: 'wallDark' },
  board: { size: 2, mat: 'screen' },
  planter: { size: 3, mat: 'crate' },
  pad: {},
};

const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function normRot(rot) {
  if (!num(rot)) return 0;
  const r = Math.round((((rot % 360) + 360) % 360) / 5) * 5;
  return r >= 360 ? 0 : r;
}

export function roomFor(record) {
  const w = Math.max(4, Math.round(record.footprint[0]));
  const d = Math.max(4, Math.round(record.footprint[1]));
  const wallHeight = Math.max(4, Math.min(8, Math.round(Math.min(w, d) * 0.45)));
  return { w, d, wallHeight, margin: 1.2 };
}

export function defaultRobots(room) {
  return Math.max(2, Math.min(8, Math.round((room.w * room.d) / 45)));
}

export function robotLimits(room, scale = 1) {
  const margin = room.margin * scale;
  return {
    x: Math.max(0, round2(room.w / 2 - margin)),
    z: Math.max(0, round2(room.d / 2 - margin)),
  };
}

export function robotFacing(pos) {
  return normRot((Math.atan2(-pos[0], -pos[1]) * 180) / Math.PI);
}

function homeRng(seed) {
  let s = (seed * 2654435761) >>> 0 || 7;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Home i depends only on i and the room, so growing the roster never moves an
// existing robot and a reload re-places every home exactly where it was.
export function sampleRobotHomes(count, room) {
  const total = Math.max(0, Math.min(MAX_ROBOTS_PER_ROOM, Math.trunc(Number(count)) || 0));
  const { x: limX, z: limZ } = robotLimits(room);
  const homes = [];
  for (let i = 0; i < total; i++) {
    const rnd = homeRng(i + 1);
    let best = [0, 0];
    let bestScore = -1;
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = round2((rnd() * 2 - 1) * limX);
      const z = round2((rnd() * 2 - 1) * limZ);
      const score = homes.length ? Math.min(...homes.map((h) => Math.hypot(x - h[0], z - h[1]))) : Math.hypot(x, z);
      if (score > bestScore) {
        bestScore = score;
        best = [x, z];
      }
      if (score >= 2) break;
    }
    homes.push(best);
  }
  return homes;
}

function size3Limits(kind, room) {
  if (kind === 'rack') return [6, room.wallHeight, 3];
  if (kind === 'shelf') return [5, room.wallHeight, 2];
  if (kind === 'locker') return [3, room.wallHeight, 2];
  if (kind === 'chest') return [3, 2, 3];
  if (kind === 'planter') return [6, 1.2, 2];
  return [room.w, room.wallHeight, room.d];
}

function size2Meta(kind, room) {
  if (kind === 'screen') return { limits: [room.w, room.wallHeight], labels: ['WIDTH', 'HEIGHT'] };
  if (kind === 'monitor') return { limits: [4, 2.4], labels: ['WIDTH', 'HEIGHT'] };
  if (kind === 'board') return { limits: [6, 2.4], labels: ['WIDTH', 'HEIGHT'] };
  if (kind === 'desk' || kind === 'bench') return { limits: [6, 3], labels: ['WIDTH', 'DEPTH'] };
  return { limits: [room.w, room.d], labels: ['WIDTH', 'HEIGHT'] };
}

function rhMeta(kind, room) {
  const span = Math.min(room.w, room.d);
  if (kind === 'tank') return { r: [0.4, 2], h: [1, room.wallHeight] };
  if (kind === 'pillar') return { r: [0.2, span / 3], h: [0.4, room.wallHeight] };
  return { r: [0.2, span / 2], h: [0.2, room.wallHeight] };
}

const H_ONLY_LIMITS = (room) => [0.4, room.wallHeight];

export function shapeInfo(kind, room) {
  const shape = SHAPES[kind] ?? {};
  const info = { kind, mat: shape.mat ?? null, fields: [] };
  if (shape.size === 1) {
    info.fields = [{ key: 'size.0', label: 'SCALE', min: 0.5, max: 2.5 }];
  } else if (shape.size === 2) {
    const meta = size2Meta(kind, room);
    info.fields = [
      { key: 'size.0', label: meta.labels[0], min: 0.4, max: meta.limits[0] },
      { key: 'size.1', label: meta.labels[1], min: 0.3, max: meta.limits[1] },
    ];
  } else if (shape.size === 3) {
    const limits = size3Limits(kind, room);
    info.fields = SIZE3_LABELS.map((label, i) => ({ key: `size.${i}`, label, min: SIZE3_MIN[i], max: limits[i] }));
  } else if (shape.rh) {
    const meta = rhMeta(kind, room);
    info.fields = [
      { key: 'r', label: 'RADIUS', min: meta.r[0], max: meta.r[1] },
      { key: 'h', label: 'HEIGHT', min: meta.h[0], max: meta.h[1] },
    ];
    if (kind === 'cyl') info.fields.push({ key: 'seg', label: 'SEGMENTS', min: 3, max: 32, step: 1 });
  } else if (shape.hOnly) {
    const limits = H_ONLY_LIMITS(room);
    info.fields = [{ key: 'h', label: 'HEIGHT', min: limits[0], max: limits[1] }];
  }
  return info;
}

export function takesMaterial(kind) {
  return Boolean(SHAPES[kind]?.mat);
}

export function defaultMat(kind) {
  return SHAPES[kind]?.mat ?? null;
}

function range(value, min, max, label, errors, fallback = null) {
  if (!num(value)) {
    errors.push(`${label} MUST BE A NUMBER`);
    return fallback;
  }
  if (value < min || value > max) {
    errors.push(`${label} ${round2(value)} OUT OF RANGE ${min} TO ${max}`);
    return fallback;
  }
  return round2(value);
}

export function halfFor(kind, part) {
  if (kind === 'cyl') return [part.r, part.h / 2, part.r];
  if (kind === 'pillar') return [part.r + 0.16, part.h / 2, part.r + 0.16];
  if (kind === 'tank') return [part.r + 0.03, (part.h + 0.3) / 2, part.r + 0.03];
  if (kind === 'pipe') return [0.6, part.h / 2, 0.32];
  if (kind === 'lamp') return [0.4, part.h / 2, 0.4];
  if (kind === 'screen') return [part.size[0] / 2, part.size[1] / 2, 0.05];
  if (kind === 'monitor') return [part.size[0] / 2 + 0.06, (part.size[1] + 1) / 2, 0.3];
  if (kind === 'desk') return [part.size[0] / 2, 0.84, part.size[1] / 2];
  if (kind === 'bench') return [part.size[0] / 2, 0.625, part.size[1] / 2];
  if (kind === 'plant') return [part.size[0] * 0.55, part.size[0] * 0.82, part.size[0] * 0.55];
  if (kind === 'crate') return [part.size[0] / 2 + 0.02, part.size[0] / 2, part.size[0] / 2 + 0.02];
  if (kind === 'pad') return [1.78, 0.25, 1.4];
  if (kind === 'rack') return [part.size[0] / 2 + 0.04, (part.size[1] + 0.1) / 2, part.size[2] / 2 + 0.04];
  if (kind === 'shelf') return [part.size[0] / 2, part.size[1] / 2, part.size[2] / 2];
  if (kind === 'locker') return [Math.max(part.size[0] / 2, 0.2), part.size[1] / 2, part.size[2] / 2 + 0.06];
  if (kind === 'chest') return [part.size[0] / 2 + 0.03, (part.size[1] + 0.08) / 2, part.size[2] / 2 + 0.08];
  if (kind === 'board') return [part.size[0] / 2 + 0.12, (part.size[1] + 1.3) / 2, 0.18];
  if (kind === 'planter') return [part.size[0] / 2, (part.size[1] + 1.64) / 2, part.size[2] / 2];
  return [part.size[0] / 2, part.size[1] / 2, part.size[2] / 2];
}

export function rotatedHalves(halves, rot) {
  const [hw, hh, hd] = halves;
  const a = Math.abs(Math.cos(THREE.MathUtils.degToRad(rot)));
  const b = Math.abs(Math.sin(THREE.MathUtils.degToRad(rot)));
  return [hw * a + hd * b, hh, hw * b + hd * a];
}

export function restY(kind, part) {
  return round2(halfFor(kind, part)[1]);
}

export function clampToRoom(part, room, rot = 0, x = 0, z = 0) {
  const [hw, , hd] = rotatedHalves(halfFor(part.kind, part), normRot(rot));
  const maxX = Math.max(0, room.w / 2 - 0.2 - hw);
  const maxZ = Math.max(0, room.d / 2 - 0.2 - hd);
  return [round2(clamp(x, -maxX, maxX)), round2(clamp(z, -maxZ, maxZ))];
}

function validatePart(part, label, room, errors, rot = 0) {
  if (!part || typeof part !== 'object' || Array.isArray(part)) {
    errors.push(`${label} MUST BE AN OBJECT`);
    return null;
  }
  const kind = typeof part.kind === 'string' ? part.kind : '';
  if (!ALL_KINDS.includes(kind)) {
    errors.push(`${label}: UNKNOWN KIND '${kind.slice(0, 24)}'`);
    return null;
  }

  const shape = SHAPES[kind];
  const value = { kind };

  if (shape.mat) {
    const mat = typeof part.mat === 'string' && part.mat ? part.mat : shape.mat;
    if (!MATERIAL_KEYS.includes(mat)) {
      errors.push(`${label}: UNKNOWN MATERIAL '${mat.slice(0, 24)}'`);
      return null;
    }
    value.mat = mat;
  }

  if (shape.size) {
    const size = Array.isArray(part.size) ? part.size : [];
    if (size.length !== shape.size) {
      errors.push(`${label}: ${SIZES[shape.size]}`);
      return null;
    }
    if (shape.size === 1) {
      const s = range(size[0], 0.5, 2.5, `${label} SCALE`, errors);
      if (s === null) return null;
      value.size = [s];
    } else if (shape.size === 2) {
      const meta = size2Meta(kind, room);
      const a = range(size[0], 0.4, meta.limits[0], `${label} ${meta.labels[0]}`, errors);
      const b = range(size[1], 0.3, meta.limits[1], `${label} ${meta.labels[1]}`, errors);
      if (a === null || b === null) return null;
      value.size = [a, b];
    } else {
      const limits = size3Limits(kind, room);
      const a = range(size[0], 0.4, limits[0], `${label} ${SIZE3_LABELS[0]}`, errors);
      const b = range(size[1], SIZE3_MIN[1], limits[1], `${label} ${SIZE3_LABELS[1]}`, errors);
      const c = range(size[2], SIZE3_MIN[2], limits[2], `${label} ${SIZE3_LABELS[2]}`, errors);
      if (a === null || b === null || c === null) return null;
      value.size = [a, b, c];
    }
  }

  if (shape.rh) {
    const meta = rhMeta(kind, room);
    const r = range(part.r, meta.r[0], meta.r[1], `${label} RADIUS`, errors);
    const h = range(part.h, meta.h[0], meta.h[1], `${label} HEIGHT`, errors);
    if (r === null || h === null) return null;
    value.r = r;
    value.h = h;
    if (kind === 'cyl') {
      const seg = part.seg === undefined || part.seg === null ? 16 : range(part.seg, 3, 32, `${label} SEGMENTS`, errors, 16);
      value.seg = Math.round(seg);
    }
  }

  if (shape.hOnly) {
    const limits = H_ONLY_LIMITS(room);
    const h = range(part.h, limits[0], limits[1], `${label} HEIGHT`, errors);
    if (h === null) return null;
    value.h = h;
  }

  const pos = Array.isArray(part.pos) ? part.pos : [];
  const [hw, hh, hd] = rotatedHalves(halfFor(kind, value), rot);
  const x = num(pos[0]) ? round2(pos[0]) : 0;
  const y = num(pos[1]) ? round2(pos[1]) : hh;
  const z = num(pos[2]) ? round2(pos[2]) : 0;
  if (!num(pos[0]) && pos[0] !== undefined) errors.push(`${label} POS.X MUST BE A NUMBER`);
  if (!num(pos[1]) && pos[1] !== undefined) errors.push(`${label} POS.Y MUST BE A NUMBER`);
  if (!num(pos[2]) && pos[2] !== undefined) errors.push(`${label} POS.Z MUST BE A NUMBER`);
  if (Math.abs(x) + hw > room.w / 2 - 0.2) errors.push(`${label} SPANS OUTSIDE THE ROOM ON X`);
  if (Math.abs(z) + hd > room.d / 2 - 0.2) errors.push(`${label} SPANS OUTSIDE THE ROOM ON Z`);
  if (y - hh < -0.01) errors.push(`${label} STARTS BELOW THE FLOOR`);
  if (y + hh > room.wallHeight - 0.2) errors.push(`${label} EXCEEDS WALL HEIGHT ${room.wallHeight}`);
  value.pos = [x, y, z];
  return value;
}

export function validateSpaceSpec(spec, room) {
  const errors = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return { ok: false, errors: ['SPEC MUST BE A JSON OBJECT'] };
  }

  const description = typeof spec.description === 'string' ? spec.description.trim() : '';
  if (description.length > 280) errors.push('DESCRIPTION MUST BE 280 CHARACTERS OR FEWER');

  let robots = defaultRobots(room);
  if (spec.robots !== undefined && spec.robots !== null) {
    if (!num(spec.robots) || !Number.isInteger(spec.robots) || spec.robots < 0 || spec.robots > MAX_ROBOTS) {
      errors.push(`ROBOTS MUST BE A WHOLE NUMBER 0 TO ${MAX_ROBOTS}`);
    } else {
      robots = spec.robots;
    }
  }

  const rawParts = Array.isArray(spec.parts) ? spec.parts : [];
  if (!rawParts.length) errors.push('PARTS MUST CONTAIN AT LEAST ONE ENTRY');
  else if (rawParts.length > MAX_SPACE_PARTS) errors.push(`PARTS MUST NOT EXCEED ${MAX_SPACE_PARTS} ENTRIES`);

  const parts = [];
  for (let i = 0; i < Math.min(rawParts.length, MAX_SPACE_PARTS); i++) {
    const part = validatePart(rawParts[i], `PART ${i + 1}`, room, errors);
    if (part) parts.push(part);
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { description, robots, parts } };
}

export function validateObjectPart(spec, room, rot = 0) {
  const errors = [];
  const turn = normRot(rot);
  const value = validatePart(spec, 'OBJECT', room, errors, turn);
  if (!value || errors.length) return { ok: false, errors };
  return { ok: true, value, rot: turn };
}

export function validateRobot(entry, room) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { ok: false, errors: ['ROBOT MUST BE AN OBJECT'] };
  }
  const type = typeof entry.type === 'string' ? entry.type : '';
  if (!ROBOT_TYPE_KEYS.includes(type)) {
    return { ok: false, errors: [`UNKNOWN ROBOT TYPE '${type.slice(0, 24)}'`] };
  }

  const errors = [];
  const spec = typeForRobot(type);
  const accent = ACCENTS.includes(entry.accent) ? entry.accent : spec.accent;
  const scale = round2(clamp(num(entry.scale) ? entry.scale : 1, MIN_ROBOT_SCALE, MAX_ROBOT_SCALE));
  const wander = entry.wander === undefined ? true : Boolean(entry.wander);
  const rot = normRot(entry.rot);
  const name = String(entry.name ?? '').trim().slice(0, 40);

  const pos = Array.isArray(entry.pos) ? entry.pos : [];
  if (pos[0] !== undefined && !num(pos[0])) errors.push('POS X MUST BE A NUMBER');
  if (pos[1] !== undefined && !num(pos[1])) errors.push('POS Z MUST BE A NUMBER');
  const x = num(pos[0]) ? round2(pos[0]) : 0;
  const z = num(pos[1]) ? round2(pos[1]) : 0;
  const limits = robotLimits(room, scale);
  if (Math.abs(x) > limits.x) errors.push(`POS X ${x} IS OUTSIDE THE ROOM (-${limits.x} TO ${limits.x})`);
  if (Math.abs(z) > limits.z) errors.push(`POS Z ${z} IS OUTSIDE THE ROOM (-${limits.z} TO ${limits.z})`);
  if (errors.length) return { ok: false, errors };

  return { ok: true, value: { type, accent, scale, wander, rot, name, pos: [x, z] } };
}

const FLOOR_BASED = new Set([
  'rack',
  'desk',
  'plant',
  'crate',
  'tank',
  'pad',
  'shelf',
  'bench',
  'locker',
  'lamp',
  'monitor',
  'pillar',
  'pipe',
  'chest',
  'board',
  'planter',
]);

function matOf(part, fallback) {
  return part.mat && MAT[part.mat] ? MAT[part.mat] : fallback;
}

function buildPart(part) {
  let node;
  if (part.kind === 'cyl') node = cyl(part.r, part.r, part.h, matOf(part, MAT.wallGray), part.seg ?? 16);
  else if (part.kind === 'pillar') node = pillar(part.r, part.h, matOf(part, MAT.wallGray));
  else if (part.kind === 'screen') node = screenFace(part.size[0], part.size[1], matOf(part, MAT.wallGray));
  else if (part.kind === 'monitor') node = monitor(part.size[0], part.size[1], matOf(part, MAT.screen));
  else if (part.kind === 'rack') node = rack(part.size[0], part.size[1], part.size[2], matOf(part, MAT.wallDark));
  else if (part.kind === 'shelf') node = shelf(part.size[0], part.size[1], part.size[2], matOf(part, MAT.crate));
  else if (part.kind === 'locker') node = locker(part.size[0], part.size[1], part.size[2], matOf(part, MAT.wallGray));
  else if (part.kind === 'chest') node = chest(part.size[0], part.size[1], part.size[2], matOf(part, MAT.wallDark));
  else if (part.kind === 'board') node = board(part.size[0], part.size[1], matOf(part, MAT.screen));
  else if (part.kind === 'planter') node = planter(part.size[0], part.size[1], part.size[2], matOf(part, MAT.crate));
  else if (part.kind === 'desk') node = desk(part.size[0], part.size[1], matOf(part, MAT.wallWhite));
  else if (part.kind === 'bench') node = bench(part.size[0], part.size[1], matOf(part, MAT.wallGray));
  else if (part.kind === 'plant') node = plant(part.size[0]);
  else if (part.kind === 'crate') node = crate(part.size[0], matOf(part, MAT.crate));
  else if (part.kind === 'tank') node = tank(part.r, part.h, matOf(part, MAT.wallWhite));
  else if (part.kind === 'lamp') node = lamp(part.h, matOf(part, MAT.wallDark));
  else if (part.kind === 'pipe') node = pipe(part.h, matOf(part, MAT.wallDark));
  else if (part.kind === 'pad') node = pad();
  else if (part.kind === 'rbox') node = rbox(part.size[0], part.size[1], part.size[2], matOf(part, MAT.wallGray));
  else node = box(part.size[0], part.size[1], part.size[2], matOf(part, MAT.wallGray));
  const shift = FLOOR_BASED.has(part.kind) ? halfFor(part.kind, part)[1] : 0;
  node.position.set(part.pos[0], part.pos[1] - shift, part.pos[2]);
  return node;
}

export function buildObjectNode(part, rot = 0) {
  const node = buildPart(part);
  const turn = normRot(rot);
  if (turn) node.rotation.y = THREE.MathUtils.degToRad(turn);
  return node;
}

export function buildSpaceFromSpec(spec) {
  const g = new THREE.Group();
  spec.parts.forEach((part, i) => {
    const node = buildPart(part);
    node.userData.isSpacePart = true;
    node.userData.partIndex = i;
    g.add(node);
  });
  return g;
}

export function partFromType(type, x = 0, z = 0) {
  const part = { ...type.defaults };
  if (Array.isArray(part.size)) part.size = [...part.size];
  part.pos = [round2(x), restY(part.kind, part), round2(z)];
  return part;
}
