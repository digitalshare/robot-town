import { MAT, unitBox } from '../materials/palette.js';

const SHARED_GEOMETRIES = new Set([unitBox]);
const SHARED_MATERIALS = new Set(Object.values(MAT));

function disposeMaterial(material) {
  if (!material || SHARED_MATERIALS.has(material)) return;
  for (const value of Object.values(material)) {
    if (value && value.isTexture) value.dispose();
  }
  material.dispose();
}

function disposeGeometry(geometry) {
  if (!geometry || SHARED_GEOMETRIES.has(geometry)) return;
  geometry.dispose();
}

export function disposeGroup(root) {
  if (!root) return null;
  for (const child of [...root.children]) disposeGroup(child);
  if (root.isMesh || root.isInstancedMesh || root.isLine || root.isPoints) {
    disposeGeometry(root.geometry);
    if (Array.isArray(root.material)) root.material.forEach(disposeMaterial);
    else disposeMaterial(root.material);
    root.dispose?.();
  }
  root.removeFromParent();
  return root;
}
