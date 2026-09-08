import * as THREE from 'three';
import { MAT, box, rbox } from '../materials/palette.js';
import { grassPad, hedgeRow, PAD_H, door, fascia, plinth, acUnit } from '../helpers/site.js';
import { solarPanel, antenna } from '../helpers/tech.js';

export function buildAistrategy() {
  const g = new THREE.Group();
  g.add(grassPad(12, 10));
  g.add(plinth(11, 9));
  g.add(rbox(11, 7, 9, MAT.wallWhite, 0, PAD_H + 3.5, 0, 0.2));
  for (const y of [2.2, 4.2, 6.0]) {
    g.add(box(10.6, 0.3, 0.12, MAT.cyanSoft, 0, PAD_H + y, 4.52, false));
    g.add(box(10.6, 0.3, 0.12, MAT.cyanSoft, 0, PAD_H + y, -4.52, false));
    g.add(box(0.12, 0.3, 8.6, MAT.cyanSoft, 5.52, PAD_H + y, 0, false));
    g.add(box(0.12, 0.3, 8.6, MAT.cyanSoft, -5.52, PAD_H + y, 0, false));
  }
  g.add(fascia(11, 9, PAD_H + 7.05));
  const s1 = solarPanel(4.5, 3.5, 0.2);
  s1.position.set(-2.6, PAD_H + 7.35, 0);
  g.add(s1);
  const s2 = solarPanel(4.5, 3.5, 0.2);
  s2.position.set(2.6, PAD_H + 7.35, 0);
  g.add(s2);
  const ant = antenna(3);
  ant.position.set(4.5, PAD_H + 7.2, 3.5);
  g.add(ant);
  const ac = acUnit(0.8);
  ac.position.set(-4.2, PAD_H + 7.2, 3.2);
  g.add(ac);
  g.add(door(2.6, 2.8, 4.55));
  g.add(hedgeRow(8, 0, 4.9), hedgeRow(7, 5.8, 0, Math.PI / 2));
  return g;
}
