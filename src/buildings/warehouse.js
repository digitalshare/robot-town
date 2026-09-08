import * as THREE from 'three';
import { MAT, box, rbox } from '../materials/palette.js';
import { grassPad, PAD_H, plinth } from '../helpers/site.js';
import { conveyorBelt, crate } from '../helpers/industrial.js';

export function buildWarehouse() {
  const g = new THREE.Group();
  g.add(grassPad(24, 14));
  const p = plinth(20, 10);
  p.position.z = -1.5;
  g.add(p);
  g.add(rbox(20, 4.5, 10, MAT.wallWhite, 0, PAD_H + 2.25, -1.5, 0.2));
  g.add(box(20.3, 0.32, 10.3, MAT.wallWhite, 0, PAD_H + 4.55, -1.5, false));
  g.add(box(19.4, 0.3, 9.4, MAT.grass, 0, PAD_H + 4.75, -1.5, false));
  g.add(box(12, 0.12, 1.4, MAT.glass, 0, PAD_H + 4.95, -3.6, false));
  g.add(box(12, 0.12, 1.4, MAT.glass, 0, PAD_H + 4.95, 0.6, false));
  for (let x = -8; x <= 8; x += 4) {
    g.add(box(0.35, 4.6, 0.25, MAT.wallGray, x, PAD_H + 2.3, 3.55, false));
  }
  for (const x of [-6, 0, 6]) {
    g.add(box(3, 3, 0.3, MAT.dark, x, PAD_H + 1.5, 3.55));
    g.add(box(3.6, 0.18, 1.5, MAT.wallWhite, x, PAD_H + 3.3, 4.2));
  }
  const conv = conveyorBelt(12);
  conv.position.set(0, PAD_H, 6.2);
  g.add(conv);
  for (const [cx, s] of [
    [-3, 0.8],
    [0.5, 0.9],
    [3.5, 0.7],
  ]) {
    const c = crate(s);
    c.position.set(cx, PAD_H + 0.88, 6.2);
    g.add(c);
  }
  return g;
}
