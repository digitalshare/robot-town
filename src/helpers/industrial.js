import * as THREE from 'three';
import { MAT, box, cyl } from '../materials/palette.js';

export function hexPrism(r, h, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 6), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function domeShell(r, mat) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  return m;
}

export function pipeRun(points, r = 0.16, mat = MAT.orange) {
  const g = new THREE.Group();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < points.length - 1; i++) {
    const a = new THREE.Vector3(...points[i]);
    const b = new THREE.Vector3(...points[i + 1]);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(up, dir.normalize());
    m.castShadow = true;
    g.add(m);
  }
  for (const p of points) {
    const j = new THREE.Mesh(new THREE.SphereGeometry(r * 1.25, 8, 8), mat);
    j.position.set(...p);
    g.add(j);
  }
  return g;
}

export function smokestack(h = 4, r = 0.5) {
  const g = new THREE.Group();
  g.add(cyl(r * 0.9, r, h, MAT.wallGray, 12, 0, h / 2, 0));
  g.add(cyl(r * 0.95, r * 0.95, 0.4, MAT.orange, 12, 0, h - 0.5, 0, false));
  return g;
}

export function conveyorBelt(len) {
  const g = new THREE.Group();
  g.add(box(len, 0.16, 1.2, MAT.dark, 0, 0.8, 0));
  g.add(box(len, 0.1, 0.12, MAT.wallDark, 0, 0.9, 0.66, false));
  g.add(box(len, 0.1, 0.12, MAT.wallDark, 0, 0.9, -0.66, false));
  for (let x = -len / 2 + 0.5; x <= len / 2 - 0.4; x += len / 3) {
    g.add(box(0.12, 0.8, 0.12, MAT.wallDark, x, 0.4, 0.5));
    g.add(box(0.12, 0.8, 0.12, MAT.wallDark, x, 0.4, -0.5));
  }
  return g;
}

export function crate(s = 0.9, mat = MAT.crate) {
  return box(s, s, s, mat, 0, s / 2, 0);
}

export function robotArm() {
  const g = new THREE.Group();
  g.add(cyl(0.5, 0.6, 0.5, MAT.wallDark, 12, 0, 0.25, 0));
  const lower = box(0.3, 1.6, 0.3, MAT.orange, 0.35, 1.0, 0);
  lower.rotation.z = 0.5;
  const upper = box(0.24, 1.3, 0.24, MAT.orange, 1.1, 1.7, 0);
  upper.rotation.z = -0.9;
  g.add(lower, upper);
  g.add(box(0.3, 0.3, 0.3, MAT.dark, 1.6, 1.5, 0, false));
  return g;
}

export function walkway(len) {
  const g = new THREE.Group();
  g.add(box(len, 0.25, 2.4, MAT.wallWhite, 0, 0, 0));
  g.add(box(len, 0.3, 0.12, MAT.glass, 0, 0.35, 1.15, false));
  g.add(box(len, 0.3, 0.12, MAT.glass, 0, 0.35, -1.15, false));
  return g;
}

export function planterBed(len) {
  const g = new THREE.Group();
  g.add(box(len, 0.4, 0.9, MAT.wallWhite, 0, 0.2, 0, false));
  g.add(box(len * 0.9, 0.3, 0.7, MAT.leaf, 0, 0.5, 0, false));
  return g;
}
