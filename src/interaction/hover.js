import * as THREE from 'three';

export function createHover(camera, dom, buildingsGroup, tooltip) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hlCache = new Map();
  let event = null;
  let hovered = null;
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

  function setHovered(group) {
    if (group === hovered) return;
    if (hovered) setGroupMaterials(hovered, false);
    hovered = group;
    if (hovered) setGroupMaterials(hovered, true);
    dom.style.cursor = hovered ? 'pointer' : 'default';
    if (!hovered) tooltip.classList.remove('visible');
  }

  function pickGroup(clientX, clientY) {
    ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(buildingsGroup.children, true);
    let o = hits[0]?.object ?? null;
    while (o && !o.userData.isBuilding) o = o.parent;
    return o;
  }

  function pick() {
    const o = pickGroup(event.clientX, event.clientY);
    setHovered(o);
    if (o) {
      tooltip.textContent = o.userData.name;
      tooltip.classList.add('visible');
      const pad = 14;
      let x = event.clientX + pad;
      let y = event.clientY + pad;
      const r = tooltip.getBoundingClientRect();
      if (x + r.width > window.innerWidth - 8) x = event.clientX - r.width - pad;
      if (y + r.height > window.innerHeight - 8) y = event.clientY - r.height - pad;
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    }
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
    clickFn(pickGroup(e.clientX, e.clientY));
  });

  return {
    update() {
      if (event) pick();
    },
    onClick(fn) {
      clickFn = fn;
    },
  };
}
