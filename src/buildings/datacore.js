import * as THREE from 'three';
import { MAT, box, rbox } from '../materials/palette.js';
import { grassPad, PAD_H } from '../helpers/site.js';
import { solarPanel, chargingPad, screenFace, antenna } from '../helpers/tech.js';

export function buildDatacore() {
  const g = new THREE.Group();
  g.add(grassPad(22, 22));
  g.add(rbox(14.5, 0.6, 6, MAT.wallDark, 0, PAD_H + 0.3, 0, 0.12));
  for (const x of [-4.5, 0, 4.5]) {
    g.add(rbox(3.2, 11, 3.2, MAT.wallGray, x, PAD_H + 5.9, 0, 0.18));
    const s1 = screenFace(2.4, 6.2);
    s1.position.set(x, PAD_H + 5.2, 1.68);
    g.add(s1);
    g.add(box(0.1, 6.2, 2.4, MAT.screen, x + 1.68, PAD_H + 5.2, 0, false));
    g.add(box(3.0, 0.16, 3.0, MAT.cyan, x, PAD_H + 11.45, 0, false));
    for (const [cx, cz] of [
      [1.55, 1.55],
      [-1.55, 1.55],
      [1.55, -1.55],
      [-1.55, -1.55],
    ]) {
      g.add(box(0.22, 11, 0.22, MAT.wallWhite, x + cx, PAD_H + 5.9, cz, false));
    }
  }
  const ant = antenna(3);
  ant.position.set(0, PAD_H + 11.5, 0);
  g.add(ant);
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    const sp = solarPanel(3, 2, 0.35);
    sp.position.set(Math.cos(a) * 8.5, PAD_H + 0.6, Math.sin(a) * 8.5);
    sp.rotation.y = -a;
    g.add(sp);
  }
  const p1 = chargingPad();
  p1.position.set(-9, PAD_H, 6);
  g.add(p1);
  const p2 = chargingPad();
  p2.position.set(-9, PAD_H, -6);
  g.add(p2);
  return g;
}
