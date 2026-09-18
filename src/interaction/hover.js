import * as THREE from 'three';

export function createHover(camera, dom, buildingsGroup, tooltip, pickRobot) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hlCache = new Map();
  let event = null;
  let hovered = null;
  let hoveredKind = null;
  let press = null;
  let clickFn = null;

  function highlightMat(mat) {
    let hl = hlCache.get(mat);
    if (!hl) {
      hl = mat.clone();
      const hasEmissive = mat.emissive && mat.emissive.getHex() !== 0;
      hl.emissive = new THREE.Color(hasEmissive ? mat.emissive.getHex() : 0x2aa8bf);
      hl.emissiveIntensity = hasEmissive ? mat.emissiveIntensity + 0.4 : 0.5;
      hlCache.set(mat, hl);
    }
    return hl;
  }

  // Only buildings glow: a robot is nine small meshes and lighting them all up
  // reads as a flash, so it gets the tooltip and the pointer cursor instead.
  function setGroupMaterials(group, apply) {
    group.traverse((o) => {
      if (!o.isMesh) return;
      if (apply) {
        o.userData.baseMat ??= o.material;
        o.material = highlightMat(o.userData.baseMat);
      } else if (o.userData.baseMat) {
        o.material = o.userData.baseMat;
      }
    });
  }

  function setHovered(hit) {
    const node = hit?.node ?? null;
    if (node !== hovered) {
      if (hoveredKind === 'building') setGroupMaterials(hovered, false);
      hovered = node;
      hoveredKind = hit?.kind ?? null;
      if (hoveredKind === 'building') setGroupMaterials(hovered, true);
    }
    // Rewritten every frame on purpose: objectSelect clears the cursor on each
    // pointermove, so writing it only on a change lets that reset stick.
    dom.style.cursor = hovered ? 'pointer' : '';
    if (!hovered) tooltip.classList.remove('visible');
  }

  function pickBuilding() {
    const hits = raycaster.intersectObjects(buildingsGroup.children, true);
    let o = hits[0]?.object ?? null;
    while (o && !o.userData.isBuilding) o = o.parent;
    return o;
  }

  function pickAt(clientX, clientY) {
    ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    // Buildings win ties. A robot standing in front of one would otherwise
    // swallow the click that is supposed to walk you inside.
    const group = pickBuilding();
    if (group) return { kind: 'building', id: group.userData.id, name: group.userData.name, node: group };
    return pickRobot ? pickRobot(raycaster) : null;
  }

  function place(clientX, clientY) {
    const pad = 14;
    let x = clientX + pad;
    let y = clientY + pad;
    const r = tooltip.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = clientY - r.height - pad;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }

  function pick() {
    const hit = pickAt(event.clientX, event.clientY);
    setHovered(hit);
    if (!hit) return;
    tooltip.textContent = hit.name;
    tooltip.classList.add('visible');
    place(event.clientX, event.clientY);
  }

  dom.addEventListener('pointermove', (e) => {
    event = e;
  });
  dom.addEventListener('pointerleave', () => {
    event = null;
    setHovered(null);
  });
  dom.addEventListener('pointerdown', (e) => {
    press = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  dom.addEventListener('pointerup', (e) => {
    if (!press) return;
    const { x, y, t } = press;
    press = null;
    if (!clickFn || Math.hypot(e.clientX - x, e.clientY - y) > 6 || performance.now() - t > 400) return;
    clickFn(pickAt(e.clientX, e.clientY));
  });

  return {
    update() {
      if (event) pick();
    },
    onClick(fn) {
      clickFn = fn;
    },
    pickAt,
  };
}
