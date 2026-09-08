import * as THREE from 'three';
import { MAT, box, cyl } from '../materials/palette.js';
import { grassPad, tree, PAD_H } from '../helpers/site.js';
import { ringBand } from '../helpers/tech.js';
import { domeShell } from '../helpers/industrial.js';

export function buildRecycling() {
  const g = new THREE.Group();
  g.add(grassPad(7, 7));
  g.add(cyl(3.1, 3.3, 0.4, MAT.wallDark, 24, 0, PAD_H + 0.2, 0));
  g.add(cyl(2.6, 2.9, 2.4, MAT.wallGray, 24, 0, PAD_H + 1.4, 0));
  const dome = domeShell(2.6, MAT.grass);
  dome.position.y = PAD_H + 2.6;
  g.add(dome);
  g.add(cyl(2.68, 2.68, 0.18, MAT.wallWhite, 24, 0, PAD_H + 2.62, 0, false));
  g.add(ringBand(2.78, PAD_H + 1.8, MAT.cyan, 24));
  g.add(box(1.2, 1.6, 0.2, MAT.dark, 0, PAD_H + 0.9, 2.85, false));
  g.add(box(1.8, 0.16, 0.8, MAT.wallWhite, 0, PAD_H + 1.85, 3.1, false));
  const chute = box(1, 0.7, 2.2, MAT.wallDark, 2.9, PAD_H + 0.9, 0);
  chute.rotation.z = 0.4;
  g.add(chute);
  const t = tree(0.8);
  t.position.set(-2.6, PAD_H, 2.6);
  g.add(t);
  return g;
}
