import * as THREE from 'three';
import { MAT, box, cyl } from '../materials/palette.js';
import { grassPad, tree, PAD_H } from '../helpers/site.js';
import { ringBand } from '../helpers/tech.js';

function tower(r, h, x, z, dome = false) {
  const g = new THREE.Group();
  g.add(cyl(r * 1.18, r * 1.26, 0.5, MAT.wallDark, 24, x, PAD_H + 0.25, z));
  g.add(cyl(r, r * 1.06, h, MAT.wallWhite, 24, x, PAD_H + h / 2, z));
  g.add(cyl(r + 0.18, r + 0.18, 0.2, MAT.wallWhite, 24, x, PAD_H + h + 0.05, z, false));
  g.add(cyl(r + 0.05, r + 0.05, 0.34, MAT.grass, 24, x, PAD_H + h + 0.28, z, false));
  if (dome) {
    const d = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.8, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      MAT.cyanSoft
    );
    d.position.set(x, PAD_H + h + 0.4, z);
    g.add(d);
  }
  const band = ringBand(r * 1.05, PAD_H + h * 0.62, MAT.cyan);
  band.position.x = x;
  band.position.z = z;
  g.add(band);
  return g;
}

function linkBridge(x1, z1, x2, z2, len) {
  const g = new THREE.Group();
  g.add(box(1.4, 0.7, len, MAT.wallWhite, 0, 0, 0));
  g.add(box(1.5, 0.12, len, MAT.cyanSoft, 0, 0.4, 0, false));
  g.position.set((x1 + x2) / 2, PAD_H + 3.4, (z1 + z2) / 2);
  g.rotation.y = Math.atan2(x2 - x1, z2 - z1);
  return g;
}

function doorSlot(x, z) {
  const g = new THREE.Group();
  g.add(box(1.6, 2.2, 0.24, MAT.dark, 0, 1.1, 0, false));
  g.add(box(2.3, 0.18, 1.0, MAT.wallWhite, 0, 2.4, 0.4, false));
  g.add(box(1.9, 0.14, 0.14, MAT.cyan, 0, 2.55, 0.12, false));
  g.position.set(x, PAD_H, z);
  return g;
}

export function buildHousing() {
  const g = new THREE.Group();
  g.add(grassPad(20, 20));
  g.add(tower(3, 9, -4, -3, true));
  g.add(tower(2.6, 7, 3.5, -5));
  g.add(tower(2.8, 8, 0.5, 3.5));
  g.add(tower(2.2, 5.5, 6.5, 2.5));
  g.add(doorSlot(-4, 0.1));
  g.add(doorSlot(0.5, 6.4));
  g.add(linkBridge(-4, -3, 0.5, 3.5, 4.2));
  g.add(linkBridge(3.5, -5, 6.5, 2.5, 3.6));
  const t1 = tree(1.1);
  t1.position.set(-8, PAD_H, 7.5);
  g.add(t1);
  const t2 = tree(0.9, 1);
  t2.position.set(8.5, PAD_H, -8);
  g.add(t2);
  const t3 = tree(0.8);
  t3.position.set(8, PAD_H, 7);
  g.add(t3);
  return g;
}
