import * as THREE from 'three';
import { MAT, box, rbox, cyl } from '../materials/palette.js';
import { screenFace } from '../helpers/tech.js';
import { MATERIAL_KEYS } from '../buildings/spec.js';
import { rack, desk, plant, crate, tank, pad } from './props.js';

export const SPACE_KINDS = ['box', 'rbox', 'cyl', 'screen', 'rack', 'desk', 'plant', 'pad', 'crate', 'tank'];
export const MAX_SPACE_PARTS = 40;
export const MAX_ROBOTS = 12;

const SIZES = { 1: 'SIZE MUST BE [SCALE]', 2: 'SIZE MUST BE [WIDTH, DEPTH OR HEIGHT]', 3: 'SIZE MUST BE [WIDTH, HEIGHT, DEPTH]' };

const SHAPES = {
  box: { size: 3, mat: 'wallGray' },
  rbox: { size: 3, mat: 'wallGray' },
  crate: { size: 1 },
  plant: { size: 1 },
  cyl: { rh: true, mat: 'wallGray' },
  tank: { rh: true },
  screen: { size: 2, mat: 'screen' },
  desk: { size: 2 },
  rack: { size: 3 },
  pad: {},
};

const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => typeof v === 'number' && Number.isFinite(v);

export function roomFor(record) {
  const w = Math.max(4, Math.round(record.footprint[0]));
  const d = Math.max(4, Math.round(record.footprint[1]));
  const wallHeight = Math.max(4, Math.min(8, Math.round(Math.min(w, d) * 0.45)));
  return { w, d, wallHeight, margin: 1.2 };
}

export function defaultRobots(room) {
  return Math.max(2, Math.min(8, Math.round((room.w * room.d) / 45)));
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

function halfFor(kind, part) {
  if (kind === 'cyl') return [part.r, part.h / 2, part.r];
  if (kind === 'tank') return [part.r + 0.03, (part.h + 0.3) / 2, part.r + 0.03];
  if (kind === 'screen') return [part.size[0] / 2, part.size[1] / 2, 0.05];
  if (kind === 'desk') return [part.size[0] / 2, 0.84, part.size[1] / 2];
  if (kind === 'plant') return [part.size[0] * 0.55, part.size[0] * 0.82, part.size[0] * 0.55];
  if (kind === 'crate') return [part.size[0] / 2 + 0.02, part.size[0] / 2, part.size[0] / 2 + 0.02];
  if (kind === 'pad') return [1.78, 0.25, 1.4];
  if (kind === 'rack') return [part.size[0] / 2 + 0.04, (part.size[1] + 0.1) / 2, part.size[2] / 2 + 0.04];
  return [part.size[0] / 2, part.size[1] / 2, part.size[2] / 2];
}

function validatePart(part, index, room, errors) {
  const label = `PART ${index + 1}`;
  if (!part || typeof part !== 'object' || Array.isArray(part)) {
    errors.push(`${label} MUST BE AN OBJECT`);
    return null;
  }
  const kind = typeof part.kind === 'string' ? part.kind : '';
  if (!SPACE_KINDS.includes(kind)) {
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
      const limits = kind === 'screen' ? [room.w, room.wallHeight] : kind === 'desk' ? [6, 3] : [room.w, room.d];
      const a = range(size[0], 0.4, limits[0], `${label} WIDTH`, errors);
      const b = range(size[1], 0.3, limits[1], kind === 'desk' ? `${label} DEPTH` : `${label} HEIGHT`, errors);
      if (a === null || b === null) return null;
      value.size = [a, b];
    } else {
      const limits = kind === 'rack' ? [6, room.wallHeight, 3] : [room.w, room.wallHeight, room.d];
      const a = range(size[0], 0.4, limits[0], `${label} WIDTH`, errors);
      const b = range(size[1], 0.2, limits[1], `${label} HEIGHT`, errors);
      const c = range(size[2], 0.4, limits[2], `${label} DEPTH`, errors);
      if (a === null || b === null || c === null) return null;
      value.size = [a, b, c];
    }
  }

  if (shape.rh) {
    const r = range(part.r, kind === 'tank' ? 0.4 : 0.2, kind === 'tank' ? 2 : Math.min(room.w, room.d) / 2, `${label} RADIUS`, errors);
    const h = range(part.h, kind === 'tank' ? 1 : 0.2, room.wallHeight, `${label} HEIGHT`, errors);
    if (r === null || h === null) return null;
    value.r = r;
    value.h = h;
    if (kind === 'cyl') {
      const seg = part.seg === undefined || part.seg === null ? 16 : range(part.seg, 3, 32, `${label} SEGMENTS`, errors, 16);
      value.seg = Math.round(seg);
    }
  }

  const pos = Array.isArray(part.pos) ? part.pos : [];
  const [hw, hh, hd] = halfFor(kind, value);
  const x = num(pos[0]) ? round2(pos[0]) : 0;
  const y = num(pos[1]) ? round2(pos[1]) : hh;
  const z = num(pos[2]) ? round2(pos[2]) : 0;
  if (!num(pos[0]) && pos[0] !== undefined) errors.push(`${label} POS.X MUST BE A NUMBER`);
  if (!num(pos[1]) && pos[1] !== undefined) errors.push(`${label} POS.Y MUST BE A NUMBER`);
  if (!num(pos[2]) && pos[2] !== undefined) errors.push(`${label} POS.Z MUST BE A NUMBER`);
  if (Math.abs(x) + hw > room.w / 2 - 0.2) errors.push(`${label} SPANS OUTSIDE THE ROOM ON X`);
  if (Math.abs(z) + hd > room.d / 2 - 0.2) errors.push(`${label} SPANS OUTSIDE THE ROOM ON Z`);
  if (y - hh < 0) errors.push(`${label} STARTS BELOW THE FLOOR`);
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
    const part = validatePart(rawParts[i], i, room, errors);
    if (part) parts.push(part);
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { description, robots, parts } };
}

const FLOOR_BASED = new Set(['rack', 'desk', 'plant', 'crate', 'tank', 'pad']);

function buildPart(part) {
  const mat = MAT[part.mat] ?? MAT.wallGray;
  let node;
  if (part.kind === 'cyl') node = cyl(part.r, part.r, part.h, mat, part.seg ?? 16);
  else if (part.kind === 'screen') node = screenFace(part.size[0], part.size[1], mat);
  else if (part.kind === 'rack') node = rack(part.size[0], part.size[1], part.size[2]);
  else if (part.kind === 'desk') node = desk(part.size[0], part.size[1]);
  else if (part.kind === 'plant') node = plant(part.size[0]);
  else if (part.kind === 'crate') node = crate(part.size[0]);
  else if (part.kind === 'tank') node = tank(part.r, part.h);
  else if (part.kind === 'pad') node = pad();
  else if (part.kind === 'rbox') node = rbox(part.size[0], part.size[1], part.size[2], mat);
  else node = box(part.size[0], part.size[1], part.size[2], mat);
  const shift = FLOOR_BASED.has(part.kind) ? halfFor(part.kind, part)[1] : 0;
  node.position.set(part.pos[0], part.pos[1] - shift, part.pos[2]);
  return node;
}

export function buildSpaceFromSpec(spec) {
  const g = new THREE.Group();
  for (const part of spec.parts) g.add(buildPart(part));
  return g;
}
