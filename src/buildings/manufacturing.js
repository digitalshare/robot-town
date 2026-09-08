import * as THREE from 'three';
import { MAT, box, rbox } from '../materials/palette.js';
import { grassPad, PAD_H, plinth } from '../helpers/site.js';
import { pipeRun, smokestack, robotArm, crate } from '../helpers/industrial.js';

export function buildManufacturing() {
  const g = new THREE.Group();
  g.add(grassPad(18, 13));
  const p = plinth(16, 10);
  p.position.z = -1;
  g.add(p);
  g.add(rbox(16, 5, 10, MAT.wallGray, 0, PAD_H + 2.5, -1, 0.2));
  g.add(box(16.2, 0.35, 10.2, MAT.orange, 0, PAD_H + 4.55, -1, false));
  g.add(box(15.4, 0.25, 9.4, MAT.wallDark, 0, PAD_H + 5.05, -1));
  for (const x of [-4, 0, 4]) {
    g.add(rbox(1.8, 0.5, 1.8, MAT.cyanSoft, x, PAD_H + 5.25, -1, 0.1, false));
  }
  const s1 = smokestack(3.5, 0.5);
  s1.position.set(-5, PAD_H + 5.2, -4);
  g.add(s1);
  const s2 = smokestack(2.8, 0.4);
  s2.position.set(-2.5, PAD_H + 5.2, -4);
  g.add(s2);
  g.add(
    pipeRun([
      [7, PAD_H + 1.2, 4.1],
      [7, PAD_H + 3.6, 4.1],
      [-3, PAD_H + 3.6, 4.1],
      [-3, PAD_H + 1.2, 4.1],
    ])
  );
  g.add(box(4.5, 3.2, 0.3, MAT.dark, 2, PAD_H + 1.6, 4.02));
  g.add(box(5.4, 0.2, 1.6, MAT.wallWhite, 2, PAD_H + 3.5, 4.5));
  g.add(box(4.8, 0.22, 0.2, MAT.cyan, 2, PAD_H + 3.7, 4.1, false));
  for (const x of [-7.2, -5.8, -4.4, -3.0]) {
    g.add(box(0.3, 4.4, 0.22, MAT.wallWhite, x, PAD_H + 2.4, 4.02, false));
  }
  const arm = robotArm();
  arm.position.set(-6, PAD_H, 4.6);
  g.add(arm);
  const c1 = crate(0.9);
  c1.position.set(6.6, PAD_H, 4.6);
  g.add(c1);
  const c2 = crate(0.7);
  c2.position.set(7.5, PAD_H, 3.8);
  g.add(c2);
  return g;
}
