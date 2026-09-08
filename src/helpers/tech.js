import * as THREE from 'three';
import { MAT, box, cyl } from '../materials/palette.js';

export function solarPanel(w, d, tilt = 0.4) {
  const g = new THREE.Group();
  g.add(box(w, 0.12, d, MAT.wallWhite, 0, 0, 0, false));
  g.add(box(w * 0.9, 0.08, d * 0.9, MAT.solar, 0, 0.08, 0, false));
  g.add(box(w * 0.9, 0.09, 0.05, MAT.wallWhite, 0, 0.08, 0, false));
  g.add(box(0.05, 0.09, d * 0.9, MAT.wallWhite, 0, 0.08, 0, false));
  g.rotation.x = tilt;
  return g;
}

export function chargingPad(r = 1.6) {
  const g = new THREE.Group();
  g.add(cyl(r, r, 0.12, MAT.asphaltDark, 20, 0, 0.06, 0, false));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.72, 0.07, 8, 24), MAT.cyan);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.13;
  g.add(ring);
  g.add(box(0.5, 0.5, 0.5, MAT.wallGray, r + 0.5, 0.25, 0));
  return g;
}

export function screenFace(w, h, mat = MAT.screen) {
  return box(w, h, 0.1, mat, 0, 0, 0, false);
}

export function antenna(h = 4) {
  const g = new THREE.Group();
  g.add(cyl(0.05, 0.09, h, MAT.wallDark, 6, 0, h / 2, 0));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), MAT.cyan);
  tip.position.y = h;
  g.add(tip);
  return g;
}

export function ringBand(r, y, mat = MAT.cyanSoft, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.22, seg, 1, true), mat);
  m.position.y = y;
  return m;
}
