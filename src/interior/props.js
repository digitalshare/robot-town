import * as THREE from 'three';
import { MAT, box, cyl } from '../materials/palette.js';
import { screenFace, ringBand, chargingPad } from '../helpers/tech.js';

function group(...children) {
  const g = new THREE.Group();
  g.add(...children);
  return g;
}

export function rack(w = 2, h = 3, d = 1) {
  const g = group(box(w, h, d, MAT.wallDark, 0, h / 2, 0));
  const rows = Math.max(2, Math.round(h / 0.8));
  for (let i = 0; i < rows; i++) {
    const y = 0.5 + i * 0.7;
    if (y > h - 0.3) break;
    g.add(box(w * 0.78, 0.16, 0.06, i % 3 === 2 ? MAT.teal : MAT.screen, 0, y, d / 2 + 0.04, false));
  }
  g.add(box(w + 0.08, 0.1, d + 0.08, MAT.cyanSoft, 0, h + 0.05, 0, false));
  return g;
}

export function desk(w = 2.4, d = 1.2) {
  const g = group(box(w, 0.12, d, MAT.wallWhite, 0, 0.95, 0));
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

export function crate(s = 1) {
  const g = group(box(s, s, s, MAT.crate, 0, s / 2, 0));
  g.add(box(s + 0.04, 0.1, s + 0.04, MAT.dark, 0, s * 0.72, 0, false));
  return g;
}

export function tank(r = 0.8, h = 2.4) {
  const g = group(cyl(r, r, h, MAT.wallWhite, 16, 0, h / 2, 0));
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
