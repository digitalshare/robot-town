import * as THREE from 'three';
import { PLOT } from '../data/layout.js';

const Y = 0.3;
const BASE = new THREE.Color(0x2aa8bf);
const HOT = new THREE.Color(0x59dcea);

export function createSiteSelect({ camera, dom, scene, onSelect }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const hint = document.createElement('div');
  hint.id = 'site-hint';
  hint.className = 'hud-chip';
  hint.hidden = true;
  document.body.appendChild(hint);

  let entries = [];
  let planeGeo = null;
  let edgeGeo = null;
  let hovered = null;
  let down = null;
  let active = false;

  function paint(entry, on) {
    entry.mat.color.copy(on ? HOT : BASE);
    entry.mat.opacity = on ? 0.55 : 0.24;
    entry.lineMat.opacity = on ? 0.95 : 0.45;
  }

  function setHovered(entry) {
    if (entry === hovered) return;
    if (hovered) paint(hovered, false);
    hovered = entry;
    if (hovered) paint(hovered, true);
  }

  function pick(e) {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(group.children, false)[0];
    return hit ? entries.find((entry) => entry.mesh === hit.object) ?? null : null;
  }

  function enter(cells) {
    exit();
    if (!cells?.length) return;
    active = true;
    planeGeo = new THREE.PlaneGeometry(1, 1);
    edgeGeo = new THREE.EdgesGeometry(planeGeo);
    for (const cell of cells) {
      const [w, d] = cell.plot ?? PLOT;
      const mat = new THREE.MeshBasicMaterial({
        color: BASE.clone(),
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const lineMat = new THREE.LineBasicMaterial({ color: HOT.clone(), transparent: true, opacity: 0.45 });
      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(cell.x, Y, cell.z);
      mesh.scale.set(w, d, 1);
      const line = new THREE.LineSegments(edgeGeo, lineMat);
      mesh.add(line);
      mesh.userData.cellId = cell.id;
      group.add(mesh);
      entries.push({ cell, mesh, mat, line, lineMat });
    }
    group.visible = true;
    hint.textContent = `SELECT A BUILD SITE — ESC TO CANCEL (${entries.length} FREE)`;
    hint.hidden = false;
  }

  function exit() {
    for (const entry of entries) {
      entry.mesh.removeFromParent();
      entry.mat.dispose();
      entry.lineMat.dispose();
    }
    entries = [];
    planeGeo?.dispose();
    edgeGeo?.dispose();
    planeGeo = null;
    edgeGeo = null;
    group.visible = false;
    hovered = null;
    down = null;
    active = false;
    hint.hidden = true;
  }

  dom.addEventListener('pointermove', (e) => {
    if (active) setHovered(pick(e));
  });

  dom.addEventListener('pointerdown', (e) => {
    if (active) down = { x: e.clientX, y: e.clientY, t: performance.now() };
  });

  dom.addEventListener('pointerup', (e) => {
    if (!active || !down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const held = performance.now() - down.t;
    down = null;
    if (moved >= 6 || held >= 400) return;
    const entry = pick(e);
    if (!entry) return;
    const cell = entry.cell;
    exit();
    onSelect?.(cell);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && active) exit();
  });

  return {
    enter,
    exit,
    isActive() {
      return active;
    },
    cellCount() {
      return entries.length;
    },
  };
}
