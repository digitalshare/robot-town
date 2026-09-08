import * as THREE from 'three';
import { MAT, box } from '../materials/palette.js';
import { GRID } from '../data/layout.js';

export function buildRoads(grid = GRID) {
  const g = new THREE.Group();
  const { cx, cz, sx, sz, minX, maxX, minZ, maxZ } = grid.bounds;
  const hw = grid.roadWidth / 2;

  for (const x of grid.linesX) {
    g.add(box(grid.roadWidth, 0.06, sz, MAT.asphalt, x, 0.03, cz, false));
    g.add(box(0.16, 0.05, sz, MAT.cyanSoft, x - hw + 0.35, 0.075, cz, false));
    g.add(box(0.16, 0.05, sz, MAT.cyanSoft, x + hw - 0.35, 0.075, cz, false));
  }
  for (const z of grid.linesZ) {
    g.add(box(sx, 0.06, grid.roadWidth, MAT.asphalt, cx, 0.06, z, false));
    g.add(box(sx, 0.05, 0.16, MAT.cyanSoft, cx, 0.105, z - hw + 0.35, false));
    g.add(box(sx, 0.05, 0.16, MAT.cyanSoft, cx, 0.105, z + hw - 0.35, false));
  }
  for (const x of grid.linesX) {
    for (const z of grid.linesZ) {
      g.add(box(grid.roadWidth + 0.2, 0.06, grid.roadWidth + 0.2, MAT.asphaltDark, x, 0.09, z, false));
    }
  }

  const dashes = [];
  for (const x of grid.linesX) {
    for (let z = minZ + 1; z <= maxZ - 1; z += 4) {
      if (grid.linesZ.some((lz) => Math.abs(z - lz) < 4.5)) continue;
      dashes.push([x, 0.08, z, 0]);
    }
  }
  for (const z of grid.linesZ) {
    for (let x = minX + 1; x <= maxX - 1; x += 4) {
      if (grid.linesX.some((lx) => Math.abs(x - lx) < 4.5)) continue;
      dashes.push([x, 0.11, z, Math.PI / 2]);
    }
  }
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.04, 1.7), MAT.cyan, dashes.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  dashes.forEach(([x, y, z, ry], i) => {
    q.setFromEuler(e.set(0, ry, 0));
    m4.compose(v.set(x, y, z), q, one);
    inst.setMatrixAt(i, m4);
  });
  g.add(inst);
  return g;
}
