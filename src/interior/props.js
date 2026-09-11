import * as THREE from 'three';
import { MAT, box, cyl } from '../materials/palette.js';
import { screenFace, ringBand, chargingPad } from '../helpers/tech.js';

function group(...children) {
  const g = new THREE.Group();
  g.add(...children);
  return g;
}

export function rack(w = 2, h = 3, d = 1, mat = MAT.wallDark) {
  const g = group(box(w, h, d, mat, 0, h / 2, 0));
  const rows = Math.max(2, Math.round(h / 0.8));
  for (let i = 0; i < rows; i++) {
    const y = 0.5 + i * 0.7;
    if (y > h - 0.3) break;
    g.add(box(w * 0.78, 0.16, 0.06, i % 3 === 2 ? MAT.teal : MAT.screen, 0, y, d / 2 + 0.04, false));
  }
  g.add(box(w + 0.08, 0.1, d + 0.08, MAT.cyanSoft, 0, h + 0.05, 0, false));
  return g;
}

export function desk(w = 2.4, d = 1.2, mat = MAT.wallWhite) {
  const g = group(box(w, 0.12, d, mat, 0, 0.95, 0));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.12, 0.95, 0.12, MAT.wallGray, (sx * (w - 0.24)) / 2, 0.475, (sz * (d - 0.24)) / 2));
    }
  }
  const screen = screenFace(w * 0.5, 0.55, MAT.screen);
  screen.position.set(0, 1.4, -d / 2 + 0.18);
  g.add(screen);
  return g;
}

export function plant(s = 1) {
  const g = group(cyl(0.32 * s, 0.42 * s, 0.5 * s, MAT.crate, 10, 0, 0.25 * s, 0));
  const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 * s, 0), MAT.leaf);
  leaf.position.y = 0.95 * s;
  leaf.castShadow = true;
  const leaf2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34 * s, 0), MAT.leafDark);
  leaf2.position.set(0.18 * s, 1.3 * s, 0.1 * s);
  leaf2.castShadow = true;
  g.add(leaf, leaf2);
  return g;
}

export function crate(s = 1, mat = MAT.crate) {
  const g = group(box(s, s, s, mat, 0, s / 2, 0));
  g.add(box(s + 0.04, 0.1, s + 0.04, MAT.dark, 0, s * 0.72, 0, false));
  return g;
}

export function tank(r = 0.8, h = 2.4, mat = MAT.wallWhite) {
  const g = group(cyl(r, r, h, mat, 16, 0, h / 2, 0));
  g.add(ringBand(r + 0.03, h * 0.7, MAT.cyanSoft, 16));
  g.add(cyl(r * 0.4, r * 0.4, 0.3, MAT.wallDark, 12, 0, h + 0.15, 0, false));
  return g;
}

export function pad() {
  const g = new THREE.Group();
  const p = chargingPad(1.4);
  p.position.x = -0.375;
  g.add(p);
  return g;
}

export function shelf(w = 2.4, h = 2, d = 0.6, mat = MAT.crate) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.08, h, 0.08, MAT.wallDark, (sx * (w - 0.08)) / 2, h / 2, (sz * (d - 0.08)) / 2));
    }
  }
  const rows = Math.max(2, Math.round(h / 0.6));
  for (let i = 0; i <= rows; i++) {
    const y = 0.06 + (i * (h - 0.12)) / rows;
    g.add(box(w - 0.04, 0.06, d - 0.02, mat, 0, y, 0));
    if (i > 0 && i < rows) g.add(box(w * 0.34, 0.3, d * 0.6, MAT.dark, (i % 2 ? -1 : 1) * w * 0.22, y + 0.18, 0, false));
  }
  return g;
}

export function bench(w = 2.4, d = 1.2, mat = MAT.wallGray) {
  const g = group(box(w, 0.14, d, mat, 0, 0.86, 0));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.14, 0.79, 0.14, MAT.wallDark, (sx * (w - 0.2)) / 2, 0.395, (sz * (d - 0.2)) / 2));
    }
  }
  g.add(box(w * 0.86, 0.06, d * 0.5, MAT.wallDark, 0, 0.3, 0, false));
  g.add(box(0.3, 0.32, 0.3, MAT.dark, w / 2 - 0.35, 1.09, 0, false));
  return g;
}

export function locker(w = 1, h = 2.2, d = 0.6, mat = MAT.wallGray) {
  const g = group(box(w, h, d, mat, 0, h / 2, 0));
  g.add(box(0.04, h * 0.86, 0.02, MAT.dark, 0, h * 0.5, d / 2 + 0.01, false));
  for (const sx of [-1, 1]) {
    g.add(box(0.06, 0.2, 0.06, MAT.cyanSoft, sx * 0.16, h * 0.55, d / 2 + 0.03, false));
  }
  for (let i = 0; i < 3; i++) {
    g.add(box(w * 0.6, 0.04, 0.02, MAT.dark, 0, h - 0.2 - i * 0.09, d / 2 + 0.01, false));
  }
  return g;
}

export function lamp(h = 2.2, mat = MAT.wallDark) {
  const g = group(cyl(0.34, 0.4, 0.12, mat, 12, 0, 0.06, 0));
  g.add(cyl(0.06, 0.06, Math.max(0.2, h - 0.4), mat, 8, 0, 0.12 + Math.max(0.2, h - 0.4) / 2, 0));
  g.add(cyl(0.34, 0.2, 0.28, MAT.cyanSoft, 12, 0, h - 0.14, 0, false));
  return g;
}

export function monitor(w = 1.8, h = 1.1, mat = MAT.screen) {
  const g = group(box(0.8, 0.08, 0.6, MAT.wallDark, 0, 0.04, 0));
  g.add(box(0.12, 0.86, 0.12, MAT.wallDark, 0, 0.51, 0));
  const y = 0.94 + h / 2;
  g.add(box(w + 0.12, h + 0.12, 0.08, MAT.wallDark, 0, y, -0.06, false));
  const face = screenFace(w, h, mat);
  face.position.set(0, y, 0);
  g.add(face);
  return g;
}

export function pillar(r = 0.4, h = 3, mat = MAT.wallGray) {
  const g = group(cyl(r + 0.12, r + 0.16, 0.16, mat, 12, 0, 0.08, 0));
  const shaft = Math.max(0.2, h - 0.32);
  g.add(cyl(r * 0.9, r, shaft, mat, 12, 0, 0.16 + shaft / 2, 0));
  g.add(cyl(r + 0.1, r + 0.1, 0.16, mat, 12, 0, h - 0.08, 0, false));
  return g;
}

export function pipe(h = 2.6, mat = MAT.wallDark) {
  const g = group(cyl(0.22, 0.22, h, mat, 12, 0, h / 2, 0));
  for (const y of [0.3, h / 2, h - 0.3]) {
    g.add(cyl(0.32, 0.32, 0.1, MAT.wallGray, 12, 0, y, 0, false));
  }
  const stub = cyl(0.2, 0.2, 0.5, mat, 12, 0.35, h - 0.35, 0, false);
  stub.rotation.z = Math.PI / 2;
  g.add(stub);
  return g;
}

export function board(w = 3, h = 1.5, mat = MAT.screen) {
  const y = 1.3 + h / 2;
  const g = group(box(w + 0.24, h + 0.24, 0.12, MAT.wallDark, 0, y, -0.12));
  const face = screenFace(w, h, mat);
  face.position.set(0, y, 0);
  g.add(face);
  for (const sx of [-1, 1]) g.add(box(0.12, 1.3, 0.12, MAT.wallDark, sx * (w / 2 - 0.3), 0.65, -0.12));
  return g;
}

export function planter(w = 3.4, h = 0.5, d = 1.3, mat = MAT.crate) {
  const g = group(box(w, h, d, mat, 0, h / 2, 0));
  const n = Math.max(2, Math.round(w / 1.15));
  for (let i = 0; i < n; i++) {
    const p = plant(1);
    p.position.set((i - (n - 1) / 2) * 1.15, h, 0);
    g.add(p);
  }
  return g;
}

export function chest(w = 1.4, h = 1, d = 0.7, mat = MAT.wallDark) {
  const g = group(box(w, h, d, mat, 0, h / 2, 0));
  for (let i = 0; i < 3; i++) {
    const y = 0.16 + i * h * 0.3;
    g.add(box(w * 0.88, h * 0.24, 0.04, MAT.wallGray, 0, y, d / 2 + 0.02, false));
    g.add(box(0.34, 0.05, 0.05, MAT.cyanSoft, 0, y, d / 2 + 0.05, false));
  }
  g.add(box(w + 0.06, 0.08, d + 0.06, MAT.dark, 0, h + 0.04, 0, false));
  return g;
}
