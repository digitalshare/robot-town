import * as THREE from 'three';

const OUTLINE_COLOR = 0x59dcea;

export function outlineFor(group) {
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const box = new THREE.BoxGeometry(size.x, size.y, size.z);
  const edges = new THREE.EdgesGeometry(box);
  box.dispose();
  const outline = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: OUTLINE_COLOR, transparent: true, opacity: 0.9 })
  );
  outline.position.copy(centre);
  outline.raycast = () => {};
  return outline;
}
