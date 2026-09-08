import * as THREE from 'three';
import { MAT, box } from '../materials/palette.js';
import { GRID } from '../data/layout.js';

export function buildGround(grid = GRID) {
  const g = new THREE.Group();
  const { cx, cz } = grid.bounds;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(grid.groundSize, grid.groundSize), MAT.ground);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(cx, 0, cz);
  plane.receiveShadow = true;
  g.add(plane);
  for (const bx of grid.blockCentersX) {
    for (const bz of grid.blockCentersZ) {
      const slab = box(grid.slabSize, grid.slabTop, grid.slabSize, MAT.slab, bx, grid.slabTop / 2, bz, false);
      slab.receiveShadow = true;
      g.add(slab);
    }
  }
  return g;
}
