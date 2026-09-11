import * as THREE from 'three';
import { createRenderer } from './core/renderer.js';
import { createCamera, createControls, resizeCamera } from './core/camera.js';
import { setupEnvironment, frameSun } from './core/lights.js';
import { createTownStore } from './town/townStore.js';
import { createTownManager } from './town/townManager.js';
import { findBuildingRecord } from './town/records.js';
import { createInteriorView } from './interior/interiorView.js';
import { createHover } from './interaction/hover.js';
import { createSiteSelect } from './interaction/siteSelect.js';
import { createObjectSelect } from './interaction/objectSelect.js';
import { SECTOR, ROAD_SPACING, mapChipLabel } from './data/layout.js';
import { createAiStore } from './ai/store.js';
import { createMenu } from './ui/menu.js';
import { createConfirmBar } from './ui/confirmBar.js';
import { createInteriorBar } from './ui/interiorBar.js';
import { createObjectPanel } from './ui/objectPanel.js';
import { createRobotPanel } from './ui/robotPanel.js';
import { roomFor } from './interior/spaceSpec.js';
import { defaultLayoutFor } from './interior/themes.js';
import { createBuildingFlow } from './flow/buildingFlow.js';
import { createSpaceFlow } from './flow/spaceFlow.js';
import { createObjectFlow } from './flow/objectFlow.js';
import { createInteriorFlow } from './flow/interiorFlow.js';

const renderer = createRenderer(document.getElementById('app'));
const scene = new THREE.Scene();
const { sun } = setupEnvironment(scene, renderer);

const camera = createCamera();
const controls = createControls(camera, renderer.domElement);

const buildingsGroup = new THREE.Group();
const townStore = createTownStore();
const manager = createTownManager({ buildingsGroup, townStore });
scene.add(manager.town);
frameSun(sun, manager.getGrid().bounds);

const sectorChip = document.getElementById('sector-chip');
const mapChip = document.getElementById('map-chip');
const tooltip = document.getElementById('tooltip');
sectorChip.textContent = SECTOR.label;
mapChip.textContent = mapChipLabel(townStore.getState().expansions);

const hover = createHover(camera, renderer.domElement, buildingsGroup, tooltip);
const interior = createInteriorView({ townStore, dom: renderer.domElement });

const aiStore = createAiStore();
const confirmBar = createConfirmBar();
const menu = createMenu({
  store: aiStore,
  townStore,
  manager,
  interiorView: interior,
  onLocate: (x, z) => {
    exitInterior();
    locate(x, z);
  },
  onPickSite: (cells) => {
    exitInterior();
    siteSelect.enter(cells);
  },
  onObjectSelect: (id) => selectObject(id),
  onRobotManage: (id) => showRobot(id),
});
const siteSelect = createSiteSelect({
  camera,
  dom: renderer.domElement,
  scene,
  onSelect: (cell) => menu.openWithSite(cell),
});
const interiorBar = createInteriorBar({
  onDesign: (record) => menu.openWithBuilding(record),
  onAddObject: () => {
    menu.open();
    menu.setTab('objects');
  },
  onExit: exitInterior,
});
const objectPanel = createObjectPanel({
  townStore,
  interiorView: interior,
  onReference: (entry, record) => menu.openObjectTool(record, entry),
});
const robotPanel = createRobotPanel({ townStore, interiorView: interior });
const objectSelect = createObjectSelect({
  camera: interior.camera,
  dom: renderer.domElement,
  controls: interior.controls,
  interiorView: interior,
  onSelect: selectHit,
  onDrag: (id, x, z) => objectPanel.setPos(x, z),
  onMove: moveObjectTo,
});
const reportError = (text) => menu.aiTab.showStatus({ kind: 'error', text });
const reportInfo = (text) => menu.aiTab.showStatus({ kind: 'ok', text });
const flow = createBuildingFlow({ session: menu.session, manager, confirmBar, reportError, reportInfo });
createSpaceFlow({
  session: menu.session,
  townStore,
  interiorView: interior,
  onEnter: enterInterior,
  reportError,
  reportInfo,
});
createObjectFlow({
  session: menu.session,
  townStore,
  interiorView: interior,
  onEnter: enterInterior,
  onSelect: selectObject,
  reportError,
  reportInfo,
});
const interiorFlow = createInteriorFlow({ townStore, confirmBar, menu, onEnter: enterInterior });
menu.onClose(() => flow.cancel());
menu.onClose(() => robotPanel.hide());

hover.onClick((group) => {
  if (interior.isActive() || siteSelect.isActive() || menu.isOpen()) return;
  interiorFlow.handleBuildingClick(group?.userData.id ?? null);
});

// The bar label must come from the store: a /space commit fires before the scene
// rebuild, so interior.stats() would still report the pre-design node count.
const roomObjectCount = () => townStore.getObjects(interior.current()?.id ?? '').length;

function enterInterior(record) {
  confirmBar.hide();
  objectPanel.hide();
  robotPanel.hide();
  ensureDefaults(record);
  interior.enter(record);
  controls.enabled = false;
  tooltip.classList.remove('visible');
  sectorChip.hidden = true;
  mapChip.hidden = true;
  interiorBar.show(record, interior.isDesigned(), roomObjectCount());
  menu.objectsTab.refresh();
  menu.robotsTab.refresh();
}

function ensureDefaults(record) {
  townStore.seedRobots(record.id);
  if (townStore.isSeeded(record.id)) return;
  townStore.seedObjects(record.id, defaultLayoutFor(record, roomFor(record)));
}

function showObject(id) {
  const record = interior.current();
  const entry = id && record ? townStore.getObject(id) : null;
  if (!entry) {
    interior.select(null);
    objectPanel.hide();
    return;
  }
  robotPanel.hide();
  interior.select(entry.id);
  objectPanel.show({ entry, record, room: interior.room() });
}

function showRobot(id) {
  const entry = id ? townStore.getRobot(id) : null;
  const record = entry ? findBuildingRecord(townStore.getState(), entry.buildingId) : null;
  if (!entry || !record) {
    interior.selectRobot(null);
    robotPanel.hide();
    return;
  }
  objectPanel.hide();
  interior.selectRobot(entry.id);
  robotPanel.show({ entry, record, room: roomFor(record) });
}

function selectHit(hit) {
  if (!interior.isActive()) return;
  if (hit?.kind === 'robot') showRobot(hit.id);
  else showObject(hit?.kind === 'object' ? hit.id : null);
}

function selectObject(id) {
  if (!interior.isActive()) return;
  showObject(id);
}

function moveObjectTo(id, x, z) {
  const entry = townStore.getObject(id);
  if (!entry) return;
  townStore.updateObject(id, { part: { ...entry.part, pos: [x, entry.part.pos[1], z] } });
}

function syncObjectPanel() {
  const shown = objectPanel.current();
  if (!shown) return;
  showObject(shown.entry.id);
}

function syncRobotPanel() {
  const shown = robotPanel.current();
  if (!shown) return;
  showRobot(shown.entry.id);
}

function exitInterior() {
  if (!interior.isActive()) return;
  interior.exit();
  controls.enabled = true;
  interiorBar.hide();
  objectPanel.hide();
  robotPanel.hide();
  sectorChip.hidden = false;
  mapChip.hidden = false;
  menu.objectsTab.refresh();
  menu.robotsTab.refresh();
}

function locate(x, z) {
  const dx = x - controls.target.x;
  const dz = z - controls.target.z;
  controls.target.set(x, 0, z);
  camera.position.x += dx;
  camera.position.z += dz;
  controls.update();
}

let expansions = townStore.getState().expansions;
townStore.subscribe((state, reason) => {
  mapChip.textContent = mapChipLabel(state.expansions);
  if (interior.isActive() && !findBuildingRecord(state, interior.current().id)) exitInterior();
  if (reason === 'object') {
    if (!interior.isActive()) return;
    interior.refreshObjects();
    interiorBar.setState(interior.isDesigned(), roomObjectCount());
    syncObjectPanel();
    return;
  }
  if (reason === 'robot') {
    if (!interior.isActive()) return;
    interior.refreshRobots();
    syncRobotPanel();
    return;
  }
  if (reason === 'space') {
    if (!interior.isActive()) return;
    interiorBar.setState(Boolean(townStore.getSpace(interior.current().id)), roomObjectCount());
    objectPanel.hide();
    robotPanel.hide();
    return;
  }
  if (reason !== 'expand') return;
  const shift = (state.expansions - expansions) * ROAD_SPACING;
  expansions = state.expansions;
  siteSelect.exit();
  frameSun(sun, manager.getGrid().bounds);
  if (!shift) return;
  camera.position.x += shift;
  controls.target.x += shift;
  controls.update();
});

window.addEventListener('resize', () => {
  resizeCamera(camera);
  interior.resize();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener(
  'keydown',
  (e) => {
    if (e.key !== 'Escape' || !interior.isActive()) return;
    if (robotPanel.isVisible()) {
      interior.selectRobot(null);
      robotPanel.hide();
      e.stopPropagation();
      return;
    }
    if (objectPanel.isVisible()) {
      interior.select(null);
      objectPanel.hide();
      e.stopPropagation();
      return;
    }
    if (menu.isOpen() || confirmBar.isVisible() || siteSelect.isActive()) return;
    exitInterior();
  },
  true
);

function project(x, y, z, cam = camera) {
  const v = new THREE.Vector3(x, y, z).project(cam);
  return {
    x: (v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-v.y * 0.5 + 0.5) * window.innerHeight,
  };
}

window.__town__ = {
  scene,
  camera,
  controls,
  buildingsGroup,
  menu,
  aiStore,
  townStore,
  manager,
  siteSelect,
  confirmBar,
  interiorBar,
  mode: () => (interior.isActive() ? 'interior' : 'town'),
  enterBuilding: (id) => interiorFlow.handleBuildingClick(id),
  interior: {
    isActive: () => interior.isActive(),
    current: () => interior.current(),
    room: () => interior.room(),
    stats: () => interior.stats(),
    robotPositions: () => interior.robotPositions(),
    robotTargets: () => interior.robotTargets(),
    sceneChildren: () => interior.scene.children.length,
    objectIds: () => interior.objectIds(),
    robotIds: () => interior.robotIds(),
    selectedId: () => interior.selectedId(),
    selectedRobotId: () => interior.selectedRobotId(),
    refreshObjects: () => interior.refreshObjects(),
    refreshRobots: () => interior.refreshRobots(),
    freeSpotFor: (part, rot) => interior.freeSpotFor(part, rot),
    camera: interior.camera,
    controls: interior.controls,
    exit: exitInterior,
  },
  objects: {
    list: () => townStore.getObjects(interior.current()?.id ?? ''),
    selected: () => interior.selectedId(),
    panel: () => (objectPanel.isVisible() ? objectPanel.current() : null),
    select: (id) => selectObject(id),
    save: (id, patch) => townStore.updateObject(id, patch),
    remove: (id) => townStore.removeObject(id),
    dragTo: (id, x, z) => {
      const pos = interior.moveObject(id, x, z);
      if (!pos) return null;
      moveObjectTo(id, pos[0], pos[1]);
      return pos;
    },
    pickAt: (x, y) => objectSelect.pickAt(x, y),
  },
  robots: {
    list: () => townStore.getRobots(interior.current()?.id ?? ''),
    all: () => townStore.allRobots(),
    selected: () => interior.selectedRobotId(),
    panel: () => (robotPanel.isVisible() ? robotPanel.current() : null),
    select: (id) => showRobot(id),
    add: (buildingId, draft) => townStore.addRobot(buildingId, draft),
    save: (id, patch) => townStore.updateRobot(id, patch),
    remove: (id) => townStore.removeRobot(id),
    pickAt: (x, y) => objectSelect.pickAt(x, y),
  },
  projectPoint: project,
  projectObject(id) {
    const node = interior.nodeFor(id);
    if (!node) return null;
    interior.scene.updateMatrixWorld(true);
    const c = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
    return project(c.x, c.y, c.z, interior.camera);
  },
  projectRobot(id) {
    const node = interior.robotNodeFor(id);
    if (!node) return null;
    interior.scene.updateMatrixWorld(true);
    const c = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
    return project(c.x, c.y, c.z, interior.camera);
  },
  townStats() {
    return manager.stats();
  },
  reviewInfo() {
    const review = manager.getReview();
    if (!review) return null;
    let ghost = null;
    review.group.traverse((o) => {
      if (!ghost && o.isMesh && o.material?.transparent) ghost = o;
    });
    return {
      name: review.name,
      x: review.group.position.x,
      z: review.group.position.z,
      isReview: review.group.userData.isReview === true,
      isBuilding: review.group.userData.isBuilding === true,
      opacity: ghost ? ghost.material.opacity : null,
      cell: review.cell,
    };
  },
  projectBuilding(id) {
    const g = buildingsGroup.children.find((c) => c.userData.id === id);
    if (!g) return null;
    const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
    return project(c.x, c.y, c.z);
  },
};

const clock = new THREE.Clock();
let ready = false;
renderer.setAnimationLoop(() => {
  if (interior.isActive()) {
    interior.update(clock.getDelta());
    renderer.render(interior.scene, interior.camera);
  } else {
    clock.getDelta();
    controls.update();
    hover.update();
    renderer.render(scene, camera);
  }
  if (!ready) {
    ready = true;
    window.__TOWN_READY__ = true;
  }
});
