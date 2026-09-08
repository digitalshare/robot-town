import * as THREE from 'three';
import { MAT, box, cyl } from '../materials/palette.js';
import { grassPad, PAD_H, plinth } from '../helpers/site.js';

export function buildPowerstorage() {
  const g = new THREE.Group();
  g.add(grassPad(9, 7));
  g.add(plinth(9, 7));
  g.add(box(8.6, 3, 0.4, MAT.wallWhite, 0, PAD_H + 1.5, -3.1));
  g.add(box(0.4, 3, 6.4, MAT.wallWhite, -4.3, PAD_H + 1.5, 0));
  g.add(box(0.4, 3, 6.4, MAT.wallWhite, 4.3, PAD_H + 1.5, 0));
  g.add(box(8.8, 0.22, 0.5, MAT.wallWhite, 0, PAD_H + 3.1, -3.1, false));
  g.add(box(9, 0.25, 2.6, MAT.wallGray, 0, PAD_H + 3.1, -2.2));
  for (let i = 0; i < 4; i++) {
    const x = -2.7 + i * 1.8;
    g.add(cyl(0.9, 0.9, 2.8, MAT.teal, 14, x, PAD_H + 1.4, 0));
    g.add(cyl(0.92, 0.92, 0.25, MAT.cyan, 14, x, PAD_H + 2.9, 0, false));
  }
  g.add(box(7, 0.08, 0.3, MAT.cyan, 0, PAD_H + 0.12, 3.3, false));
  g.add(box(0.2, 1.8, 1.4, MAT.dark, 4.42, PAD_H + 0.9, 1.5, false));
  g.add(box(1, 1, 0.6, MAT.wallDark, 3.4, PAD_H + 0.5, 2.6));
  return g;
}
