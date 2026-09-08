import * as THREE from 'three';
import { MAT, box, cyl } from '../materials/palette.js';
import { grassPad, PAD_H } from '../helpers/site.js';
import { antenna, ringBand } from '../helpers/tech.js';
import { hexPrism } from '../helpers/industrial.js';

export function buildDroneport() {
  const g = new THREE.Group();
  g.add(grassPad(15, 15));
  const base = hexPrism(7.1, 0.35, MAT.wallDark);
  base.position.y = PAD_H + 0.17;
  g.add(base);
  const apron = hexPrism(6.8, 0.25, MAT.asphaltDark);
  apron.position.y = PAD_H + 0.42;
  g.add(apron);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.3, 6, 1, true), MAT.cyan);
  ring.position.y = PAD_H + 0.5;
  g.add(ring);
  g.add(cyl(3, 3, 0.08, MAT.asphalt, 24, 0, PAD_H + 0.58, 0, false));
  g.add(box(3.4, 0.06, 0.4, MAT.cyanSoft, 0, PAD_H + 0.63, 0, false));
  g.add(box(0.4, 0.06, 3.4, MAT.cyanSoft, 0, PAD_H + 0.63, 0, false));
  const bld = hexPrism(2.4, 2, MAT.wallWhite);
  bld.position.set(0, PAD_H + 1.3, -4.6);
  const cap = hexPrism(1.7, 0.9, MAT.wallGray);
  cap.position.set(0, PAD_H + 2.7, -4.6);
  g.add(bld, cap);
  const band = ringBand(2.15, PAD_H + 2.0, MAT.cyanSoft, 6);
  band.position.z = -4.6;
  g.add(band);
  g.add(box(1.6, 0.6, 0.12, MAT.screen, 0, PAD_H + 1.6, -2.5, false));
  const ant = antenna(3);
  ant.position.set(0, PAD_H + 3.1, -4.6);
  g.add(ant);
  for (const [px, pz] of [
    [5.5, 5.5],
    [-5.5, 5.5],
    [5.5, -2],
    [-5.5, -2],
  ]) {
    g.add(cyl(0.06, 0.08, 1.2, MAT.wallDark, 6, px, PAD_H + 0.6, pz));
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), MAT.cyan);
    tip.position.set(px, PAD_H + 1.25, pz);
    g.add(tip);
  }
  return g;
}
