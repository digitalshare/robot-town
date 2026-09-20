import * as THREE from 'three';
import { MAT, box, cyl } from '../materials/palette.js';

export const PAD_H = 0.35;

export function grassPad(w, d, h = PAD_H) {
  const g = new THREE.Group();
  g.add(box(w + 0.7, 0.2, d + 0.7, MAT.wallWhite, 0, 0.1, 0, false));
  g.add(box(w, h, d, MAT.grass, 0, h / 2 + 0.14, 0, false));
  return g;
}

export function tree(s = 1, variant = 0) {
  const g = new THREE.Group();
  g.add(cyl(0.12 * s, 0.18 * s, 0.9 * s, MAT.trunk, 6, 0, 0.45 * s, 0));
  if (variant === 0) {
    const c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95 * s, 0), MAT.leaf);
    c1.position.y = 1.4 * s;
    c1.castShadow = true;
    const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 * s, 0), MAT.leafDark);
    c2.position.set(0.15 * s, 2.0 * s, 0.1 * s);
    c2.castShadow = true;
    g.add(c1, c2);
  } else {
    const k1 = new THREE.Mesh(new THREE.ConeGeometry(0.85 * s, 1.4 * s, 7), MAT.leafDark);
    k1.position.y = 1.4 * s;
    k1.castShadow = true;
    const k2 = new THREE.Mesh(new THREE.ConeGeometry(0.6 * s, 1.1 * s, 7), MAT.leaf);
    k2.position.y = 2.1 * s;
    k2.castShadow = true;
    g.add(k1, k2);
  }
  return g;
}

export function hedgeRow(len, x = 0, z = 0, rotY = 0) {
  const h = box(len, 0.6, 0.6, MAT.grassDark, x, PAD_H + 0.3, z);
  h.rotation.y = rotY;
  h.castShadow = false;
  return h;
}

export function door(w = 2.2, h = 2.6, z = 0) {
  const g = new THREE.Group();
  g.userData.isDoor = true;
  g.add(box(w, h, 0.24, MAT.dark, 0, PAD_H + h / 2, z, false));
  g.add(box(w + 0.9, 0.18, 1.1, MAT.wallWhite, 0, PAD_H + h + 0.12, z + 0.45, false));
  g.add(box(w + 0.4, 0.14, 0.14, MAT.cyan, 0, PAD_H + h + 0.28, z + 0.12, false));
  return g;
}

export function fascia(w, d, y) {
  return box(w + 0.3, 0.3, d + 0.3, MAT.wallWhite, 0, y, 0, false);
}

export function plinth(w, d) {
  return box(w + 0.4, 0.45, d + 0.4, MAT.wallDark, 0, PAD_H + 0.3, 0);
}

export function acUnit(s = 1) {
  const g = new THREE.Group();
  g.add(box(s, s * 0.7, s, MAT.wallGray, 0, s * 0.35, 0));
  g.add(cyl(s * 0.3, s * 0.3, 0.12, MAT.wallDark, 12, 0, s * 0.76, 0, false));
  return g;
}
