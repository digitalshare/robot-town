import * as THREE from 'three';
import { MAT, box, rbox, cyl } from '../materials/palette.js';
import { screenFace } from '../helpers/tech.js';

export const MIN_ROBOT_SCALE = 0.8;
export const MAX_ROBOT_SCALE = 1.4;
export const ACCENTS = ['cyan', 'teal', 'leaf', 'orange', 'solar', 'cyanSoft'];

export const ROBOT_TYPES = [
  {
    type: 'unit',
    name: 'SERVICE UNIT',
    accent: 'cyan',
    meta: 'HEIGHT 1.9 · SHOULDER PODS',
    description: 'The standard walker: visor head, backpack and a slim antenna.',
  },
  {
    type: 'hauler',
    name: 'CARGO HAULER',
    accent: 'orange',
    meta: 'HEIGHT 1.6 · TRACKED BASE',
    description: 'Low wide chassis that carries a lidded cargo box on its back.',
  },
  {
    type: 'sentinel',
    name: 'LOOKOUT SENTINEL',
    accent: 'teal',
    meta: 'HEIGHT 2.5 · MAST SCANNER',
    description: 'Tall narrow frame with a mast head that watches over the room.',
  },
];

export const ROBOT_TYPE_KEYS = ROBOT_TYPES.map((t) => t.type);

export function typeForRobot(type) {
  return ROBOT_TYPES.find((t) => t.type === type) ?? ROBOT_TYPES[0];
}

function beacon(mat, r, x, y, z) {
  const tip = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), mat);
  tip.position.set(x, y, z);
  return tip;
}

function unitMesh(g, accent) {
  g.add(cyl(0.42, 0.5, 0.24, MAT.wallDark, 14, 0, 0.12, 0));
  g.add(rbox(0.9, 1, 0.7, MAT.wallWhite, 0, 0.86, 0, 0.16));
  g.add(box(0.62, 0.5, 0.18, MAT.wallGray, 0, 0.95, -0.42));
  const visor = screenFace(0.56, 0.22, accent);
  visor.position.set(0, 1.08, 0.36);
  g.add(visor);
  for (const sx of [-1, 1]) g.add(cyl(0.13, 0.13, 0.5, MAT.wallGray, 10, sx * 0.56, 1.12, 0));
  g.add(cyl(0.03, 0.03, 0.42, MAT.wallDark, 6, 0.22, 1.57, -0.14, false));
  g.add(beacon(accent, 0.09, 0.22, 1.82, -0.14));
}

function haulerMesh(g, accent) {
  g.add(box(1.3, 0.3, 1, MAT.wallDark, 0, 0.15, 0));
  for (const sx of [-1, 1]) g.add(box(0.14, 0.28, 0.94, MAT.dark, sx * 0.62, 0.14, 0));
  g.add(rbox(1.05, 0.55, 0.85, MAT.wallGray, 0, 0.6, 0.04, 0.12));
  const visor = screenFace(0.5, 0.2, accent);
  visor.position.set(0, 0.68, 0.48);
  g.add(visor);
  g.add(box(0.86, 0.5, 0.56, MAT.crate, 0, 1.06, -0.26));
  g.add(box(0.92, 0.08, 0.62, MAT.wallDark, 0, 1.34, -0.26));
  g.add(cyl(0.03, 0.03, 0.2, MAT.wallDark, 6, 0, 1.46, -0.26, false));
  g.add(beacon(accent, 0.08, 0, 1.58, -0.26));
}

function sentinelMesh(g, accent) {
  g.add(cyl(0.34, 0.44, 0.2, MAT.wallDark, 12, 0, 0.1, 0));
  g.add(rbox(0.6, 1.45, 0.5, MAT.wallWhite, 0, 0.98, 0, 0.12));
  g.add(box(0.36, 0.3, 0.08, MAT.wallGray, 0, 1.1, 0.27));
  const visor = screenFace(0.42, 0.2, accent);
  visor.position.set(0, 1.5, 0.26);
  g.add(visor);
  for (const sx of [-1, 1]) g.add(cyl(0.09, 0.09, 0.44, MAT.wallGray, 8, sx * 0.36, 1.3, 0));
  g.add(cyl(0.035, 0.05, 0.72, MAT.wallDark, 6, 0, 2.05, -0.06, false));
  g.add(beacon(accent, 0.09, 0, 2.44, -0.06));
}

const BUILDERS = { unit: unitMesh, hauler: haulerMesh, sentinel: sentinelMesh };

export function clampRobotScale(scale) {
  const value = Number(scale);
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_ROBOT_SCALE, Math.max(MIN_ROBOT_SCALE, Math.round(value * 100) / 100));
}

export function robotMeshFor(type, accent, scale = 1) {
  const spec = typeForRobot(type);
  const mat = MAT[accent] ?? MAT[spec.accent];
  const g = new THREE.Group();
  (BUILDERS[spec.type] ?? unitMesh)(g, mat);
  const size = clampRobotScale(scale);
  if (size !== 1) g.scale.setScalar(size);
  return g;
}
