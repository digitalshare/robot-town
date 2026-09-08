import * as THREE from 'three';
import { MAT, box, rbox } from '../materials/palette.js';
import { grassPad, hedgeRow, PAD_H, door, acUnit } from '../helpers/site.js';
import { walkway, planterBed } from '../helpers/industrial.js';

function labTower() {
  const g = new THREE.Group();
  g.add(rbox(7, 7, 7, MAT.wallWhite, 0, PAD_H + 3.5, 0, 0.18));
  g.add(box(7.16, 3.2, 0.16, MAT.leaf, 0, PAD_H + 2.6, 3.52, false));
  g.add(box(7.16, 3.2, 0.16, MAT.leaf, 0, PAD_H + 2.6, -3.52, false));
  g.add(box(0.16, 3.2, 7.16, MAT.leaf, 3.52, PAD_H + 2.6, 0, false));
  g.add(box(0.16, 3.2, 7.16, MAT.leaf, -3.52, PAD_H + 2.6, 0, false));
  g.add(box(7.3, 0.28, 7.3, MAT.wallWhite, 0, PAD_H + 7.05, 0, false));
  g.add(box(6.4, 0.3, 6.4, MAT.grass, 0, PAD_H + 7.3, 0, false));
  g.add(box(7.2, 0.3, 7.2, MAT.cyanSoft, 0, PAD_H + 5.7, 0, false));
  return g;
}

export function buildLabs() {
  const g = new THREE.Group();
  g.add(grassPad(24, 16));
  const a = labTower();
  a.position.set(-7.5, 0, -2.5);
  const b = labTower();
  b.position.set(7.5, 0, 2.5);
  g.add(a, b);
  const walk = walkway(16);
  walk.position.set(0, PAD_H + 4.2, 0);
  walk.rotation.y = -0.322;
  const p1 = planterBed(6);
  p1.position.set(-3.5, 0.12, 1.05);
  walk.add(p1);
  const p2 = planterBed(6);
  p2.position.set(3.5, 0.12, -1.05);
  walk.add(p2);
  g.add(walk);
  const d1 = door(2.4, 2.8, 1.05);
  d1.position.x = -7.5;
  g.add(d1);
  const d2 = door(2.4, 2.8, 6.05);
  d2.position.x = 7.5;
  g.add(d2);
  const ac = acUnit(0.9);
  ac.position.set(7.5, PAD_H + 7.45, 2.5);
  g.add(ac);
  g.add(hedgeRow(9, -6, 7.6), hedgeRow(9, 6, 7.6));
  return g;
}
