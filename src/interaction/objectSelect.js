import * as THREE from 'three';

const DRAG_PX = 6;
const CLICK_MS = 400;

export function createObjectSelect({ camera, dom, controls, interiorView, onSelect, onDrag, onMove }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const point = new THREE.Vector3();
  let press = null;

  function setCursor(value) {
    dom.style.cursor = value ?? '';
  }

  function cast(clientX, clientY) {
    ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }

  function pickAt(clientX, clientY) {
    if (!interiorView.isActive()) return null;
    cast(clientX, clientY);
    for (const hit of raycaster.intersectObjects([...interiorView.objectRoot().children], true)) {
      let node = hit.object;
      while (node) {
        if (node.userData.isObject) return { kind: 'object', id: node.userData.objectId, node };
        node = node.parent;
      }
    }
    for (const hit of raycaster.intersectObjects([...interiorView.robotRoot().children], true)) {
      let node = hit.object;
      while (node) {
        if (node.userData.isRobot) return { kind: 'robot', id: node.userData.robotId, node };
        node = node.parent;
      }
    }
    return null;
  }

  function release() {
    const grabbed = press?.grabbed ?? false;
    press = null;
    if (grabbed) controls.enabled = true;
    setCursor(null);
  }

  dom.addEventListener('pointerdown', (e) => {
    if (!interiorView.isActive() || e.button !== 0) return;
    press = { x: e.clientX, y: e.clientY, t: performance.now(), id: null, grabbed: false, moved: false, last: null, offset: { x: 0, z: 0 } };
    const hit = pickAt(e.clientX, e.clientY);
    if (hit?.kind !== 'object') return;
    const node = interiorView.nodeFor(hit.id);
    if (!node) return;
    // OrbitControls already saw this pointerdown; disabling here stops its pointermove
    // handler before a single rotate delta accumulates, so the camera cannot drift mid-drag.
    controls.enabled = false;
    press.id = hit.id;
    press.grabbed = true;
    plane.setComponents(0, 1, 0, -node.position.y);
    if (raycaster.ray.intersectPlane(plane, point)) {
      press.offset = { x: node.position.x - point.x, z: node.position.z - point.z };
    }
    setCursor('grabbing');
  });

  dom.addEventListener('pointermove', (e) => {
    if (!interiorView.isActive()) {
      release();
      return;
    }
    if (!press) {
      const hover = pickAt(e.clientX, e.clientY);
      setCursor(hover?.kind === 'object' ? 'grab' : hover ? 'pointer' : null);
      return;
    }
    if (!press.id) return;
    if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_PX) return;
    press.moved = true;
    setCursor('grabbing');
    cast(e.clientX, e.clientY);
    if (!raycaster.ray.intersectPlane(plane, point)) return;
    const pos = interiorView.moveObject(press.id, point.x + press.offset.x, point.z + press.offset.z);
    if (!pos) return;
    press.last = pos;
    onDrag?.(press.id, pos[0], pos[1]);
  });

  dom.addEventListener('pointerup', (e) => {
    if (!press) return;
    const { id, moved, last, t } = press;
    release();
    if (moved) {
      if (id && last) onMove?.(id, last[0], last[1]);
      return;
    }
    if (performance.now() - t > CLICK_MS) return;
    const hit = pickAt(e.clientX, e.clientY);
    onSelect?.(hit ? { kind: hit.kind, id: hit.id } : null);
  });

  dom.addEventListener('pointercancel', release);

  return { pickAt };
}
