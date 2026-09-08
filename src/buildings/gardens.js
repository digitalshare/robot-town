import * as THREE from 'three';
import { MAT, box, cyl } from '../materials/palette.js';
import { grassPad, PAD_H } from '../helpers/site.js';
import { domeShell, planterBed } from '../helpers/industrial.js';

export function buildGardens() {
  const g = new THREE.Group();
  g.add(grassPad(13, 13));
  g.add(cyl(6, 6.2, 0.9, MAT.wallWhite, 24, 0, PAD_H + 0.45, 0));
  g.add(cyl(6.1, 6.1, 0.22, MAT.wallWhite, 24, 0, PAD_H + 0.95, 0, false));
  const dome = domeShell(5.8, MAT.glass);
  dome.position.y = PAD_H + 0.9;
  g.add(dome);
  for (let k = 0; k < 3; k++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(5.82, 0.07, 6, 32, Math.PI), MAT.wallWhite);
    rib.rotation.y = (k * Math.PI) / 3;
    rib.position.y = PAD_H + 0.9;
    g.add(rib);
  }
  for (const z of [-2.6, 0, 2.6]) {
    const bed = planterBed(8);
    bed.position.set(0, PAD_H + 0.9, z);
    g.add(bed);
  }
  g.add(box(2.6, 2, 1.0, MAT.wallWhite, 0, PAD_H + 1, 6.0));
  g.add(box(2.2, 1.6, 0.2, MAT.dark, 0, PAD_H + 0.8, 6.45, false));
  g.add(box(2.6, 0.14, 0.14, MAT.cyan, 0, PAD_H + 1.8, 6.5, false));
  g.add(cyl(0.5, 0.5, 1.2, MAT.wallGray, 10, 5.2, PAD_H + 0.6, 4.2));
  g.add(cyl(0.5, 0.5, 1.2, MAT.wallGray, 10, 5.2, PAD_H + 0.6, -4.2));
  return g;
}
