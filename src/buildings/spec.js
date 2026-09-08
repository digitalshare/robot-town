import * as THREE from 'three';
import { MAT, box, rbox, cyl } from '../materials/palette.js';
import { grassPad, PAD_H } from '../helpers/site.js';
import { screenFace, solarPanel, antenna } from '../helpers/tech.js';
import { PLOT } from '../data/layout.js';

export const KINDS = ['box', 'rbox', 'cyl', 'screen', 'solar', 'antenna'];
export const MATERIAL_KEYS = Object.keys(MAT);
export const MAX_PARTS = 40;
export const MAX_HEIGHT = 30;
export const OVERHANG = 1;

const MIN_FOOTPRINT = 3;
const POS_LIMITS = [
  [-1e3, 1e3],
  [0, MAX_HEIGHT],
  [-1e3, 1e3],
];
const POS_NAMES = ['X', 'Y', 'Z'];

const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => typeof v === 'number' && Number.isFinite(v);

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

function optional(value, min, max, fallback, label, errors) {
  if (value === undefined || value === null) return fallback;
  return range(value, min, max, label, errors, fallback);
}

function validatePos(part, index, footprint, half, yShift, errors) {
  const label = `PART ${index + 1}`;
  const pos = Array.isArray(part.pos) ? part.pos : [];
  const [x, y, z] = POS_NAMES.map((axis, i) => {
    if (pos[i] === undefined) return 0;
    const [min, max] = POS_LIMITS[i];
    return range(pos[i], min, max, `${label} POS.${axis}`, errors, 0) ?? 0;
  });
  if (Math.abs(x) + half.w > footprint[0] / 2 + OVERHANG) errors.push(`${label} SPANS OUTSIDE THE FOOTPRINT ON X`);
  if (Math.abs(z) + half.d > footprint[1] / 2 + OVERHANG) errors.push(`${label} SPANS OUTSIDE THE FOOTPRINT ON Z`);
  const centre = y + yShift;
  if (centre - half.h < 0) errors.push(`${label} STARTS BELOW THE GROUND`);
  if (centre + half.h > MAX_HEIGHT) errors.push(`${label} EXCEEDS MAX HEIGHT ${MAX_HEIGHT}`);
  return [x, y, z];
}

function validateMaterial(part, index, fallback, errors) {
  const mat = typeof part.mat === 'string' ? part.mat : '';
  if (!mat) return fallback;
  if (!MATERIAL_KEYS.includes(mat)) {
    errors.push(`PART ${index + 1}: UNKNOWN MATERIAL '${mat.slice(0, 24)}'`);
    return fallback;
  }
  return mat;
}

function validatePart(part, index, footprint, plot, errors) {
  const label = `PART ${index + 1}`;
  if (!part || typeof part !== 'object' || Array.isArray(part)) {
    errors.push(`${label} MUST BE AN OBJECT`);
    return null;
  }
  const kind = typeof part.kind === 'string' ? part.kind : '';
  if (!KINDS.includes(kind)) {
    errors.push(`${label}: UNKNOWN KIND '${kind.slice(0, 24)}'`);
    return null;
  }

  if (kind === 'cyl') {
    const r = range(part.r, 0.2, 12, `${label} RADIUS`, errors);
    const h = range(part.h, 0.2, MAX_HEIGHT, `${label} HEIGHT`, errors);
    if (r === null || h === null) return null;
    const seg = optional(part.seg, 3, 32, 16, `${label} SEGMENTS`, errors);
    const pos = validatePos(part, index, footprint, { w: r, h: h / 2, d: r }, 0, errors);
    return { kind, mat: validateMaterial(part, index, 'wallGray', errors), r, h, seg: Math.round(seg), pos };
  }

  if (kind === 'antenna') {
    const h = range(part.h, 1, 20, `${label} HEIGHT`, errors);
    if (h === null) return null;
    const pos = validatePos(part, index, footprint, { w: 0.3, h: h / 2, d: 0.3 }, h / 2, errors);
    return { kind, h, pos };
  }

  if (kind === 'solar') {
    const size = Array.isArray(part.size) ? part.size : [];
    const w = range(size[0], 0.5, plot[0], `${label} WIDTH`, errors);
    const d = range(size[1], 0.5, plot[1], `${label} DEPTH`, errors);
    if (w === null || d === null) return null;
    const tilt = optional(part.tilt, 0, 1.2, 0.4, `${label} TILT`, errors);
    const pos = validatePos(part, index, footprint, { w: w / 2, h: 0.5, d: d / 2 + 0.5 }, 0, errors);
    return { kind, size: [w, d], tilt, pos };
  }

  if (kind === 'screen') {
    const size = Array.isArray(part.size) ? part.size : [];
    const w = range(size[0], 0.3, plot[0], `${label} WIDTH`, errors);
    const h = range(size[1], 0.2, MAX_HEIGHT, `${label} HEIGHT`, errors);
    if (w === null || h === null) return null;
    const pos = validatePos(part, index, footprint, { w: w / 2, h: h / 2, d: 0.1 }, 0, errors);
    return { kind, mat: validateMaterial(part, index, 'screen', errors), size: [w, h], pos };
  }

  const size = Array.isArray(part.size) ? part.size : [];
  const w = range(size[0], 0.2, plot[0], `${label} WIDTH`, errors);
  const h = range(size[1], 0.1, MAX_HEIGHT, `${label} HEIGHT`, errors);
  const d = range(size[2], 0.2, plot[1], `${label} DEPTH`, errors);
  if (w === null || h === null || d === null) return null;
  const pos = validatePos(part, index, footprint, { w: w / 2, h: h / 2, d: d / 2 }, 0, errors);
  const value = { kind, mat: validateMaterial(part, index, 'wallGray', errors), size: [w, h, d], pos };
  if (kind === 'rbox') {
    const maxRadius = round2(Math.min(w, h, d) / 2);
    value.radius = optional(part.radius, 0.02, maxRadius, round2(Math.min(0.15, maxRadius)), `${label} RADIUS`, errors);
  }
  return value;
}

export function validateSpec(spec, plot = PLOT) {
  const errors = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return { ok: false, errors: ['SPEC MUST BE A JSON OBJECT'] };
  }

  const name = typeof spec.name === 'string' ? spec.name.trim() : '';
  if (!name) errors.push('NAME IS REQUIRED');
  else if (name.length > 60) errors.push('NAME MUST BE 60 CHARACTERS OR FEWER');

  const description = typeof spec.description === 'string' ? spec.description.trim() : '';
  if (description.length > 280) errors.push('DESCRIPTION MUST BE 280 CHARACTERS OR FEWER');

  const input = Array.isArray(spec.footprint) ? spec.footprint : [];
  let footprint = null;
  if (input.length !== 2 || !input.every(num)) {
    errors.push('FOOTPRINT MUST BE [WIDTH, DEPTH] NUMBERS');
  } else {
    const w = round2(input[0]);
    const d = round2(input[1]);
    if (w < MIN_FOOTPRINT || d < MIN_FOOTPRINT) errors.push(`FOOTPRINT MUST BE AT LEAST ${MIN_FOOTPRINT} UNITS`);
    if (w > plot[0]) errors.push(`FOOTPRINT ${w} EXCEEDS PLOT WIDTH ${plot[0]}`);
    if (d > plot[1]) errors.push(`FOOTPRINT ${d} EXCEEDS PLOT DEPTH ${plot[1]}`);
    footprint = [w, d];
  }

  const rawParts = Array.isArray(spec.parts) ? spec.parts : [];
  if (!rawParts.length) errors.push('PARTS MUST CONTAIN AT LEAST ONE ENTRY');
  else if (rawParts.length > MAX_PARTS) errors.push(`PARTS MUST NOT EXCEED ${MAX_PARTS} ENTRIES`);

  const parts = [];
  if (footprint) {
    for (let i = 0; i < Math.min(rawParts.length, MAX_PARTS); i++) {
      const part = validatePart(rawParts[i], i, footprint, plot, errors);
      if (part) parts.push(part);
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { name, description, footprint, parts } };
}

function buildPart(part) {
  const [x, y, z] = part.pos;
  const mat = MAT[part.mat] ?? MAT.wallGray;
  if (part.kind === 'cyl') return cyl(part.r, part.r, part.h, mat, part.seg, x, PAD_H + y, z);
  if (part.kind === 'antenna') {
    const a = antenna(part.h);
    a.position.set(x, PAD_H + y, z);
    return a;
  }
  if (part.kind === 'solar') {
    const s = solarPanel(part.size[0], part.size[1], part.tilt);
    s.position.set(x, PAD_H + y, z);
    return s;
  }
  if (part.kind === 'screen') {
    const m = screenFace(part.size[0], part.size[1], mat);
    m.position.set(x, PAD_H + y, z);
    return m;
  }
  if (part.kind === 'rbox') return rbox(part.size[0], part.size[1], part.size[2], mat, x, PAD_H + y, z, part.radius);
  return box(part.size[0], part.size[1], part.size[2], mat, x, PAD_H + y, z);
}

export function buildFromSpec(spec) {
  const g = new THREE.Group();
  g.add(grassPad(spec.footprint[0], spec.footprint[1]));
  for (const part of spec.parts) g.add(buildPart(part));
  return g;
}
