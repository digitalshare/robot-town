import * as THREE from 'three';
import { MAT, box, rbox } from '../materials/palette.js';
import { grassPad, tree, PAD_H, plinth } from '../helpers/site.js';
import { antenna } from '../helpers/tech.js';
import { crate } from '../helpers/industrial.js';

export function buildMaintenance() {
  const g = new THREE.Group();
  g.add(grassPad(9, 9));
  g.add(plinth(8, 8));
  g.add(rbox(8, 3.2, 8, MAT.wallGray, 0, PAD_H + 1.6, 0, 0.15));
  g.add(box(8.3, 0.25, 8.3, MAT.wallWhite, 0, PAD_H + 3.25, 0, false));
  g.add(box(7.6, 0.2, 7.6, MAT.wallDark, 0, PAD_H + 3.45, 0));
  g.add(box(3.2, 2.4, 0.3, MAT.dark, 0, PAD_H + 1.2, 4.0));
  g.add(box(3.4, 0.22, 0.2, MAT.cyan, 0, PAD_H + 2.7, 4.05, false));
  g.add(box(0.16, 0.7, 3, MAT.cyanSoft, 4.02, PAD_H + 2.2, 0, false));
  const ant = antenna(2.5);
  ant.position.set(3, PAD_H + 3.5, 3);
  g.add(ant);
  const c1 = crate(0.8);
  c1.position.set(-3, PAD_H, 4.2);
  g.add(c1);
  const t = tree(0.8, 1);
  t.position.set(3.6, PAD_H, -3.6);
  g.add(t);
  return g;
}
