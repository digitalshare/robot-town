import * as THREE from 'three';
import { MAT, box } from '../materials/palette.js';
import { grassPad, PAD_H } from '../helpers/site.js';
import { solarPanel, screenFace } from '../helpers/tech.js';

export function buildSolararray() {
  const g = new THREE.Group();
  g.add(grassPad(13, 12));
  g.add(box(12.4, 0.12, 11.4, MAT.asphaltDark, 0, PAD_H + 0.06, 0, false));
  for (const z of [-3, 3]) {
    const slab = solarPanel(11, 5, 0.5);
    slab.position.set(0, PAD_H + 2.3, z);
    g.add(slab);
    g.add(box(0.4, 2.2, 0.4, MAT.wallWhite, -4, PAD_H + 1.1, z));
    g.add(box(0.4, 2.2, 0.4, MAT.wallWhite, 4, PAD_H + 1.1, z));
    g.add(box(0.25, 2.4, 0.25, MAT.wallWhite, 0, PAD_H + 1.2, z - 1.8));
    for (let x = -5; x <= 5; x += 2.5) {
      g.add(box(0.22, 2.4, 2.8, MAT.wallGray, x, PAD_H + 1.2, z - 2.6));
    }
  }
  g.add(box(2, 1.6, 1.5, MAT.wallWhite, 5.2, PAD_H + 0.8, 5.2));
  const scr = screenFace(1.2, 0.8);
  scr.position.set(5.2, PAD_H + 0.9, 6.0);
  g.add(scr);
  return g;
}
