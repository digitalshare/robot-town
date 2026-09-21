import * as THREE from 'three';
import { createRenderer } from './core/renderer.js';
import { createCamera, createControls, resizeCamera } from './core/camera.js';
import { setupEnvironment, frameSun } from './core/lights.js';
import { createTownStore } from './town/townStore.js';
import { createTownManager } from './town/townManager.js';
import { createTownRobots } from './town/townRobots.js';
import { findBuildingRecord } from './town/records.js';
import { createInteriorView } from './interior/interiorView.js';
import { createHover } from './interaction/hover.js';
import { createSiteSelect } from './interaction/siteSelect.js';
import { createObjectSelect } from './interaction/objectSelect.js';
import { BUILDINGS, SECTOR, ROAD_SPACING, mapChipLabel } from './data/layout.js';
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
const robotCamera = new THREE.PerspectiveCamera(74, window.innerWidth / Math.max(1, window.innerHeight), 0.05, 500);
const robotCameraPose = {
  node: null,
  position: new THREE.Vector3(),
  lookAt: new THREE.Vector3(),
  initialized: false,
};
const robotPov = document.getElementById('robot-pov');
const robotPovName = document.getElementById('robot-pov-name');
const robotPovExit = document.getElementById('robot-pov-exit');
const robotPovPlan = document.getElementById('robot-pov-plan');
const robotPovStatus = document.getElementById('robot-pov-status');
const robotPovHistory = document.getElementById('robot-pov-history');
const robotPovUpcoming = document.getElementById('robot-pov-upcoming');
const robotPovMinimap = document.getElementById('robot-pov-minimap');
const robotPovMinimapCanvas = document.getElementById('robot-pov-minimap-canvas');
const robotPovMinimapContext = robotPovMinimapCanvas.getContext('2d');

const buildingsGroup = new THREE.Group();
const townStore = createTownStore();
// Populate every building up front so the streets are alive on first load.
// Idempotent: a returning user only gains the rooms they never walked into.
townStore.seedTownRobots();
const manager = createTownManager({ buildingsGroup, townStore });
scene.add(manager.town);
// Sits beside the manager's base and building groups on purpose: base is
// disposed on every map expansion, and buildingsGroup is raycast recursively by
// the hover picker, where a robot hit would mask the building behind it.
const townRobots = createTownRobots({
  townStore,
  parent: manager.town,
  buildings: buildingsGroup,
  getGrid: () => manager.getGrid(),
  onBuildingTransition: handleRobotBuildingTransition,
});
frameSun(sun, manager.getGrid().bounds);

const sectorChip = document.getElementById('sector-chip');
const mapChip = document.getElementById('map-chip');
const tooltip = document.getElementById('tooltip');
sectorChip.textContent = SECTOR.label;
mapChip.textContent = mapChipLabel(townStore.getState().expansions);

const hover = createHover(camera, renderer.domElement, buildingsGroup, tooltip, townRobots.pickRobot);
const interior = createInteriorView({
  townStore,
  dom: renderer.domElement,
  getRobotOccupants: (buildingId) => {
    const occupants = townRobots.insideRobotIds(buildingId);
    const active = activeRobotView && townStore.getRobot(activeRobotView.id);
    if (activeRobotView?.scene === 'town' && active?.buildingId === buildingId) occupants.add(active.id);
    return occupants;
  },
});

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
const robotPanel = createRobotPanel({
  townStore,
  interiorView: interior,
  onFirstPerson: enterRobotView,
  onClose: () => townRobots.clearSelect(),
});
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

hover.onClick((hit) => {
  if (interior.isActive() || siteSelect.isActive() || menu.isOpen()) return;
  if (hit?.kind === 'robot') {
    townRobots.select(hit.id);
    showRobot(hit.id);
    return;
  }
  townRobots.clearSelect();
  interiorFlow.handleBuildingClick(hit?.kind === 'building' ? hit.id : null);
});

// The bar label must come from the store: a /space commit fires before the scene
// rebuild, so interior.stats() would still report the pre-design node count.
const roomObjectCount = () => townStore.getObjects(interior.current()?.id ?? '').length;

function enterInterior(record, { preserveRobotId = null } = {}) {
  confirmBar.hide();
  objectPanel.hide();
  robotPanel.hide();
  townRobots.clearSelect();
  ensureDefaults(record);
  if (preserveRobotId) townRobots.select(preserveRobotId);
  interior.enter(record, { robotId: preserveRobotId });
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
  if (interior.isActive()) interior.selectRobot(entry.id);
  else townRobots.select(entry.id);
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

function exitInterior({ preserveRobotView = false } = {}) {
  if (!interior.isActive()) return;
  if (activeRobotView?.scene === 'interior' && !preserveRobotView) exitRobotView();
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

function handleRobotBuildingTransition({ id, buildingId, direction }) {
  if (!activeRobotView || activeRobotView.id !== id) return;
  if (direction === 'enter' && activeRobotView.scene === 'town') {
    const record = findBuildingRecord(townStore.getState(), buildingId);
    if (!record) return;
    const heading = robotHeading(townRobots.nodeFor(id));
    enterInterior(record, { preserveRobotId: id });
    const node = interior.robotNodeFor(id);
    if (!node) return;
    interior.selectRobot(id);
    setRobotHeading(node, heading);
    interior.setFirstPerson(true);
    activeRobotView.scene = 'interior';
    updateRobotCamera(node);
    return;
  }
  if (direction === 'exit' && activeRobotView.scene === 'interior') {
    const heading = robotHeading(interior.robotNodeFor(id));
    exitInterior({ preserveRobotView: true });
    setRobotHeading(townRobots.nodeFor(id), heading);
    townRobots.select(id);
    activeRobotView.scene = 'town';
    controls.enabled = false;
    updateRobotCamera(townRobots.nodeFor(id));
  }
}

let activeRobotView = null;

function robotHeading(node) {
  if (!node) return new THREE.Vector3(0, 0, 1);
  node.updateWorldMatrix(true, true);
  return new THREE.Vector3(0, 0, 1).applyQuaternion(node.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
}

function setRobotHeading(node, heading) {
  if (!node || !heading?.lengthSq()) return;
  node.rotation.y = Math.atan2(heading.x, heading.z);
}

function updateRobotCamera(node, dt = 1 / 60) {
  if (!node) return false;
  node.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(node);
  const origin = node.getWorldPosition(new THREE.Vector3());
  const height = Math.max(1, bounds.max.y - bounds.min.y);
  const eye = new THREE.Vector3(origin.x, bounds.min.y + height * 0.78, origin.z);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(node.getWorldQuaternion(new THREE.Quaternion()));
  const target = new THREE.Vector3(eye.x + forward.x, eye.y + forward.y * 0.05, eye.z + forward.z);
  if (!robotCameraPose.initialized || robotCameraPose.node !== node) {
    robotCameraPose.node = node;
    robotCameraPose.position.copy(eye);
    robotCameraPose.lookAt.copy(target);
    robotCameraPose.initialized = true;
  } else {
    const positionAlpha = 1 - Math.exp(-12 * Math.max(0, dt));
    const headingAlpha = 1 - Math.exp(-16 * Math.max(0, dt));
    robotCameraPose.position.lerp(eye, positionAlpha);
    robotCameraPose.lookAt.lerp(target, headingAlpha);
  }
  robotCamera.position.copy(robotCameraPose.position);
  robotCamera.lookAt(robotCameraPose.lookAt);
  return true;
}

function enterRobotView(target) {
  const id = target?.entry?.id;
  if (!id) return;
  const inInterior = interior.isActive();
  const node = inInterior ? interior.robotNodeFor(id) : townRobots.nodeFor(id);
  if (!node) return;
  activeRobotView = { id, scene: inInterior ? 'interior' : 'town' };
  if (inInterior) interior.setFirstPerson(true);
  else controls.enabled = false;
  robotPovName.textContent = target.entry.name;
  robotPov.hidden = false;
  robotPovMinimap.hidden = false;
  robotPovPlan.hidden = false;
  renderRobotVisitPlan();
  updateRobotCamera(node);
}

function exitRobotView() {
  if (!activeRobotView) return;
  const view = activeRobotView;
  activeRobotView = null;
  if (view.scene === 'interior') {
    interior.setFirstPerson(false);
    interior.selectRobot(view.id);
  } else {
    controls.enabled = true;
    townRobots.select(view.id);
  }
  robotPov.hidden = true;
  robotPovMinimap.hidden = true;
  robotPovPlan.hidden = true;
}

function robotMapPosition() {
  if (!activeRobotView) return null;
  if (activeRobotView.scene === 'town') {
    const node = townRobots.nodeFor(activeRobotView.id);
    if (!node) return null;
    node.updateWorldMatrix(true, true);
    const position = node.getWorldPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(node.getWorldQuaternion(new THREE.Quaternion()));
    return { x: position.x, z: position.z, dx: forward.x, dz: forward.z };
  }

  const entry = townStore.getRobot(activeRobotView.id);
  const record = entry ? findBuildingRecord(townStore.getState(), entry.buildingId) : null;
  const node = interior.robotNodeFor(activeRobotView.id);
  if (!record || !node) return null;
  const builtin = BUILDINGS.find((building) => building.id === record.id);
  const placement = townStore.getState().placements.find((item) => item.libraryId === record.id);
  const x = builtin?.x ?? placement?.x;
  const z = builtin?.z ?? placement?.z;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(node.getWorldQuaternion(new THREE.Quaternion()));
  return { x, z, dx: forward.x, dz: forward.z };
}

function renderRobotMinimap() {
  if (!activeRobotView) return;
  const map = robotMapPosition();
  if (!map) return;
  const grid = manager.getGrid();
  const { minX, maxX, minZ, maxZ } = grid.bounds;
  const context = robotPovMinimapContext;
  const size = robotPovMinimapCanvas.width;
  const scope = Math.min(86, Math.max(54, Math.min(maxX - minX, maxZ - minZ) * 0.62));
  const centerX = Math.max(minX + scope / 2, Math.min(maxX - scope / 2, map.x));
  const centerZ = Math.max(minZ + scope / 2, Math.min(maxZ - scope / 2, map.z));
  const toCanvas = (x, z) => ({ x: ((x - centerX) / scope + 0.5) * size, y: ((z - centerZ) / scope + 0.5) * size });

  const scale = size / scope;
  const width = (value) => value * scale;
  const rect = (x, z, w, h) => {
    const point = toCanvas(x, z);
    return { x: point.x - width(w) / 2, y: point.y - width(h) / 2, w: width(w), h: width(h) };
  };
  const fillRect = (x, z, w, h, fill) => {
    const r = rect(x, z, w, h);
    context.fillStyle = fill;
    context.fillRect(r.x, r.y, r.w, r.h);
    return r;
  };

  context.clearRect(0, 0, size, size);
  context.fillStyle = '#788f67';
  context.fillRect(0, 0, size, size);

  // Light block parcels make the map read as aerial imagery rather than a grid.
  for (let ix = 0; ix < grid.linesX.length - 1; ix++) {
    for (let iz = 0; iz < grid.linesZ.length - 1; iz++) {
      const x = (grid.linesX[ix] + grid.linesX[ix + 1]) / 2;
      const z = (grid.linesZ[iz] + grid.linesZ[iz + 1]) / 2;
      fillRect(x, z, grid.linesX[ix + 1] - grid.linesX[ix], grid.linesZ[iz + 1] - grid.linesZ[iz], (ix + iz) % 2 ? '#93a77b' : '#9cad82');
    }
  }

  // Roads are drawn as broad paved strips, with subtle edge lines and dashes.
  context.fillStyle = '#4f5b58';
  for (const x of grid.linesX) fillRect(x, centerZ, grid.roadWidth, maxZ - minZ, '#4f5b58');
  for (const z of grid.linesZ) fillRect(centerX, z, maxX - minX, grid.roadWidth, '#4f5b58');
  context.strokeStyle = 'rgba(218, 215, 175, 0.7)';
  context.lineWidth = Math.max(1, width(0.16));
  context.setLineDash([width(2.2), width(2.8)]);
  for (const x of grid.linesX) {
    const point = toCanvas(x, centerZ);
    context.beginPath(); context.moveTo(point.x, 0); context.lineTo(point.x, size); context.stroke();
  }
  for (const z of grid.linesZ) {
    const point = toCanvas(centerX, z);
    context.beginPath(); context.moveTo(0, point.y); context.lineTo(size, point.y); context.stroke();
  }
  context.setLineDash([]);

  // Small vegetation marks provide scale and break up empty parcels.
  const treePoints = [];
  for (const x of grid.linesX) {
    for (let z = minZ + 3; z < maxZ; z += 8) treePoints.push([x - 5, z]);
  }
  for (const z of grid.linesZ) {
    for (let x = minX + 3; x < maxX; x += 8) treePoints.push([x, z - 5]);
  }
  context.fillStyle = '#44644a';
  for (const [x, z] of treePoints) {
    const point = toCanvas(x, z);
    context.beginPath(); context.arc(point.x, point.y, Math.max(1, width(0.9)), 0, Math.PI * 2); context.fill();
  }

  const state = townStore.getState();
  const buildings = [...BUILDINGS, ...state.placements.map((placement) => {
    const entry = state.library.find((item) => item.id === placement.libraryId);
    return { ...placement, type: entry?.spec?.type, footprint: placement.footprint, name: entry?.name };
  })];
  const roofColors = {
    housing: '#c7a878', labs: '#b7c5c0', solararray: '#4f7290', powerstorage: '#9e7662',
    droneport: '#b88661', recycling: '#887f70', datacore: '#697f9e', manufacturing: '#aa8567',
    maintenance: '#c1a168', gardens: '#769b73', warehouse: '#a99a7a', aistrategy: '#8279a0',
  };

  const drawRoofPlan = (building, fill, offsetX = 0.8, offsetZ = 0.8, shadow = false) => {
    const type = building.type;
    const [buildingWidth, buildingDepth] = building.footprint;
    context.save();
    const origin = toCanvas(building.x + offsetX, building.z + offsetZ);
    context.translate(origin.x, origin.y);
    context.scale(scale, scale);
    context.fillStyle = fill;
    context.strokeStyle = shadow ? 'transparent' : 'rgba(45, 54, 46, 0.8)';
    context.lineWidth = 0.35;

    const rect = (x, z, w, d, radius = 0) => {
      context.beginPath();
      if (radius && context.roundRect) context.roundRect(x - w / 2, z - d / 2, w, d, radius);
      else context.rect(x - w / 2, z - d / 2, w, d);
      context.fill();
      if (!shadow) context.stroke();
    };
    const circle = (x, z, radius, sides = 24) => {
      context.beginPath();
      context.arc(x, z, radius, 0, Math.PI * 2);
      context.fill();
      if (!shadow) context.stroke();
      if (!shadow && sides < 24) {
        context.beginPath();
        for (let i = 0; i <= sides; i++) {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / sides;
          const px = x + Math.cos(a) * radius;
          const pz = z + Math.sin(a) * radius;
          if (!i) context.moveTo(px, pz); else context.lineTo(px, pz);
        }
        context.stroke();
      }
    };
    const line = (x1, z1, x2, z2) => {
      context.beginPath(); context.moveTo(x1, z1); context.lineTo(x2, z2); context.stroke();
    };
    const hex = (x, z, radius) => {
      context.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        const px = x + Math.cos(a) * radius;
        const pz = z + Math.sin(a) * radius;
        if (!i) context.moveTo(px, pz); else context.lineTo(px, pz);
      }
      context.fill();
      if (!shadow) context.stroke();
    };

    if (type === 'housing') {
      for (const [x, z, radius] of [[-4, -3, 3], [3.5, -5, 2.6], [0.5, 3.5, 2.8], [6.5, 2.5, 2.2]]) circle(x, z, radius);
      if (!shadow) { line(-4, -3, 0.5, 3.5); line(3.5, -5, 6.5, 2.5); }
    } else if (type === 'labs') {
      rect(-7.5, -2.5, 7.2, 7.2, 0.35); rect(7.5, 2.5, 7.2, 7.2, 0.35);
      if (!shadow) { context.strokeStyle = 'rgba(255, 238, 185, 0.42)'; line(-4, 0, 4, 0); }
    } else if (type === 'solararray') {
      rect(0, -3, 11, 5, 0.15); rect(0, 3, 11, 5, 0.15);
      if (!shadow) for (const z of [-3, 3]) for (let x = -4; x <= 4; x += 2) line(x, z - 2, x, z + 2);
    } else if (type === 'powerstorage') {
      rect(0, -3.1, 8.6, 0.8); rect(-4.3, 0, 0.8, 6.4); rect(4.3, 0, 0.8, 6.4);
      if (!shadow) for (let x = -2.7; x <= 2.7; x += 1.8) circle(x, 0, 0.9, 14);
    } else if (type === 'droneport') {
      hex(0, 0, 6.8); circle(0, 0, 3); hex(0, -4.6, 2.4);
      if (!shadow) { line(-3.4, 0, 3.4, 0); line(0, -3.4, 0, 3.4); }
    } else if (type === 'recycling') {
      circle(0, 0, 3.05); if (!shadow) circle(0, 0, 2.35);
    } else if (type === 'datacore') {
      rect(0, 0, 14.5, 6, 0.25);
      for (const x of [-4.5, 0, 4.5]) rect(x, 0, 3.2, 3.2, 0.18);
      if (!shadow) for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; rect(Math.cos(a) * 8.5, Math.sin(a) * 8.5, 3, 2, 0.1); }
    } else if (type === 'manufacturing') {
      rect(0, -1, 16, 10, 0.25); if (!shadow) { line(-7, 3.5, 7, 3.5); line(-5, -5, -5, 0); line(-2.5, -5, -2.5, 0); }
    } else if (type === 'maintenance') {
      rect(0, 0, 8, 8, 0.25); if (!shadow) { line(-2.4, -2.5, 2.4, -2.5); line(-2.4, -2.5, -2.4, 2.4); }
    } else if (type === 'gardens') {
      circle(0, 0, 6); if (!shadow) { context.strokeStyle = 'rgba(255, 238, 185, 0.42)'; for (const a of [0, Math.PI / 3, (Math.PI * 2) / 3]) line(Math.cos(a) * 5.8, Math.sin(a) * 5.8, -Math.cos(a) * 5.8, -Math.sin(a) * 5.8); }
    } else if (type === 'warehouse') {
      rect(0, -1.5, 20, 10, 0.25); if (!shadow) { context.strokeStyle = 'rgba(255, 238, 185, 0.42)'; line(-6, -5, 6, -5); line(-6, 2.5, 6, 2.5); }
    } else if (type === 'aistrategy') {
      rect(0, 0, 11, 9, 0.25); if (!shadow) { context.strokeStyle = 'rgba(255, 238, 185, 0.42)'; line(-5, -2.5, 5, -2.5); line(-5, 0, 5, 0); line(-5, 2, 5, 2); }
    } else {
      rect(0, 0, buildingWidth, buildingDepth, 0.25);
    }
    context.restore();
  };

  for (const building of buildings) {
    drawRoofPlan(building, 'rgba(30, 42, 35, 0.32)', 0.8, 0.8, true);
    drawRoofPlan(building, roofColors[building.type] ?? '#a89d82', 0, 0);
  }

  const marker = toCanvas(map.x, map.z);
  context.save();
  context.translate(marker.x, marker.y);
  context.rotate(Math.atan2(map.dx, map.dz));
  context.fillStyle = '#ffc857';
  context.strokeStyle = '#fff4cf';
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(0, -8);
  context.lineTo(5, 6);
  context.lineTo(0, 3);
  context.lineTo(-5, 6);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}

function renderRobotVisitPlan() {
  if (!activeRobotView) return;
  const plan = townRobots.visitPlan(activeRobotView.id);
  if (!plan) return;
  const status = plan.phase === 'to-building'
    ? `EN ROUTE: ${plan.current?.name ?? 'BUILDING'}`
    : plan.phase === 'inside'
      ? `INSIDE: ${plan.current?.name ?? 'BUILDING'}`
      : 'ON STREET';
  robotPovStatus.textContent = status;
  robotPovHistory.replaceChildren(
    ...plan.history.map((entry) => {
      const item = document.createElement('li');
      item.textContent = entry.name;
      return item;
    })
  );
  robotPovUpcoming.replaceChildren(
    ...plan.upcoming.map((entry, index) => {
      const item = document.createElement('li');
      item.textContent = entry.name;
      if (index === 0 && plan.phase === 'to-building') item.className = 'robot-pov-plan__item--current';
      return item;
    })
  );
}

robotPovExit.addEventListener('click', exitRobotView);

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
  robotCamera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  robotCamera.updateProjectionMatrix();
});

window.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Escape' && activeRobotView) {
      exitRobotView();
      e.stopPropagation();
      return;
    }
    if (e.key !== 'Escape') return;
    if (!interior.isActive()) {
      if (!robotPanel.isVisible()) return;
      townRobots.clearSelect();
      robotPanel.hide();
      e.stopPropagation();
      return;
    }
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

const townRay = new THREE.Raycaster();
const townNdc = new THREE.Vector2();
function pickTownRobot(clientX, clientY) {
  townNdc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  townRay.setFromCamera(townNdc, camera);
  return townRobots.pickRobot(townRay);
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
  robotCamera,
  mode: () => (interior.isActive() ? 'interior' : 'town'),
  robotView: {
    active: () => Boolean(activeRobotView),
    scene: () => activeRobotView?.scene ?? null,
    exit: exitRobotView,
  },
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
    isFirstPerson: () => interior.isFirstPerson(),
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
  townRobots: {
    count: () => townRobots.count(),
    positions: () => townRobots.positions(),
    targets: () => townRobots.targets(),
    selected: () => townRobots.selectedId(),
    select: (id) => townRobots.select(id),
    clearSelect: () => townRobots.clearSelect(),
    pickAt: (x, y) => pickTownRobot(x, y),
    obstacles: () => townRobots.obstacles(),
    stats: () => townRobots.stats(),
  },
  projectPoint: project,
  projectTownRobot(id) {
    const node = townRobots.nodeFor(id);
    if (!node) return null;
    scene.updateMatrixWorld(true);
    const c = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
    return project(c.x, c.y, c.z);
  },
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
  const dt = clock.getDelta();
  townRobots.update(dt);
  if (activeRobotView) renderRobotVisitPlan();
  if (activeRobotView) renderRobotMinimap();
  if (interior.isActive()) {
    interior.update(dt);
    if (activeRobotView?.scene === 'interior') {
      if (!updateRobotCamera(interior.robotNodeFor(activeRobotView.id), dt)) exitRobotView();
      renderer.render(interior.scene, robotCamera);
    } else renderer.render(interior.scene, interior.camera);
  } else {
    if (activeRobotView?.scene === 'town') {
      if (!updateRobotCamera(townRobots.nodeFor(activeRobotView.id), dt)) exitRobotView();
      renderer.render(scene, robotCamera);
    } else {
      controls.update();
      hover.update();
      renderer.render(scene, camera);
    }
  }
  if (!ready) {
    ready = true;
    window.__TOWN_READY__ = true;
  }
});
