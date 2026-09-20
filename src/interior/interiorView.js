import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MAT, box } from '../materials/palette.js';
import { disposeGroup } from '../town/dispose.js';
import { outlineFor } from '../helpers/outline.js';
import {
  roomFor,
  buildObjectNode,
  validateObjectPart,
  halfFor,
  rotatedHalves,
  restY,
  normRot,
  clampToRoom,
} from './spaceSpec.js';
import { themeFor } from './themes.js';
import { createRobots } from './robots.js';

const AXIS = new THREE.Vector3(72, 78, 72).normalize();
const CLEARANCE = 0.8;
const SPOT_RING = 0.6;
const SPOT_ANGLES = 12;
const round2 = (n) => Math.round(n * 100) / 100;

function plane(len, h, mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), mat);
  m.receiveShadow = true;
  return m;
}

function rectsOf(nodes) {
  const out = [];
  for (const node of nodes) {
    const b = new THREE.Box3().setFromObject(node);
    if (b.isEmpty()) continue;
    out.push({
      x: (b.min.x + b.max.x) / 2,
      z: (b.min.z + b.max.z) / 2,
      w: b.max.x - b.min.x,
      d: b.max.z - b.min.z,
    });
  }
  return out;
}

function buildShell(room, theme) {
  const { w, d, wallHeight } = room;
  const g = new THREE.Group();
  const doorW = Math.min(3.2, w * 0.32);
  const doorH = Math.min(2.8, wallHeight * 0.62);
  const segW = Math.max(0.2, (w - doorW) / 2);

  g.add(box(w + 1.4, 0.4, d + 1.4, MAT.wallDark, 0, -0.5, 0, false));
  g.add(box(w, 0.3, d, theme.floor, 0, -0.15, 0, false));

  const north = plane(w, wallHeight, theme.wall);
  north.position.set(0, wallHeight / 2, -d / 2);
  const east = plane(d, wallHeight, theme.wall);
  east.position.set(w / 2, wallHeight / 2, 0);
  east.rotation.y = -Math.PI / 2;
  const west = plane(d, wallHeight, theme.wall);
  west.position.set(-w / 2, wallHeight / 2, 0);
  west.rotation.y = Math.PI / 2;
  g.add(north, east, west);

  for (const sx of [-1, 1]) {
    const seg = plane(segW, wallHeight, theme.wall);
    seg.position.set(sx * (doorW + segW) / 2, wallHeight / 2, d / 2);
    seg.rotation.y = Math.PI;
    g.add(seg);
  }
  const lintel = plane(doorW, wallHeight - doorH, theme.wall);
  lintel.position.set(0, doorH + (wallHeight - doorH) / 2, d / 2);
  lintel.rotation.y = Math.PI;
  g.add(lintel);

  for (const sx of [-1, 1]) {
    const jamb = plane(0.18, doorH, theme.trim);
    jamb.position.set(sx * (doorW / 2 + 0.09), doorH / 2, d / 2 - 0.06);
    jamb.rotation.y = Math.PI;
    g.add(jamb);
  }
  const header = plane(doorW + 0.36, 0.18, theme.trim);
  header.position.set(0, doorH + 0.09, d / 2 - 0.06);
  header.rotation.y = Math.PI;
  g.add(header);
  const doorStrip = plane(doorW * 0.8, 0.1, MAT.cyan);
  doorStrip.position.set(0, doorH + 0.34, d / 2 - 0.06);
  doorStrip.rotation.y = Math.PI;
  g.add(doorStrip);

  const base = 0.22;
  const baseN = plane(w, base, theme.trim);
  baseN.position.set(0, base / 2, -d / 2 + 0.06);
  const baseE = plane(d, base, theme.trim);
  baseE.position.set(w / 2 - 0.06, base / 2, 0);
  baseE.rotation.y = -Math.PI / 2;
  const baseW = plane(d, base, theme.trim);
  baseW.position.set(-w / 2 + 0.06, base / 2, 0);
  baseW.rotation.y = Math.PI / 2;
  g.add(baseN, baseE, baseW);
  const side = Math.max(0.2, segW - 0.2);
  for (const sx of [-1, 1]) {
    const segBase = plane(side, base, theme.trim);
    segBase.position.set(sx * (doorW / 2 + 0.1 + side / 2), base / 2, d / 2 - 0.06);
    segBase.rotation.y = Math.PI;
    g.add(segBase);
  }

  const stripY = wallHeight - 0.45;
  const stripN = plane(w * 0.86, 0.1, MAT.cyanSoft);
  stripN.position.set(0, stripY, -d / 2 + 0.08);
  const stripS = plane(w * 0.86, 0.1, MAT.cyanSoft);
  stripS.position.set(0, stripY, d / 2 - 0.08);
  stripS.rotation.y = Math.PI;
  const stripW = plane(d * 0.86, 0.1, MAT.cyanSoft);
  stripW.position.set(-w / 2 + 0.08, stripY, 0);
  stripW.rotation.y = Math.PI / 2;
  const stripE = plane(d * 0.86, 0.1, MAT.cyanSoft);
  stripE.position.set(w / 2 - 0.08, stripY, 0);
  stripE.rotation.y = -Math.PI / 2;
  g.add(stripN, stripS, stripW, stripE);
  return g;
}

export function createInteriorView({ townStore, dom }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9eef1);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xb6c2c9, 0.9);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008;
  scene.add(hemi, sun, sun.target);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.minZoom = 0.5;
  controls.maxZoom = 3;
  controls.maxPolarAngle = Math.PI / 2 - 0.15;
  controls.enabled = false;

  let content = null;
  let record = null;
  let room = null;
  let robots = null;
  let designed = false;
  let counts = { fixtures: 0, props: 0, objects: 0 };
  let objectsRoot = null;
  const objectNodes = new Map();
  let robotsRoot = null;
  const robotNodes = new Map();
  let selectedId = null;
  let selectedRobotId = null;
  let firstPerson = false;
  let outline = null;
  const outlineOffset = new THREE.Vector3();

  function frameCamera() {
    const view = Math.max(room.w, room.d) + 10;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.left = (-view * aspect) / 2;
    camera.right = (view * aspect) / 2;
    camera.top = view / 2;
    camera.bottom = -view / 2;
    camera.zoom = 1;
    camera.near = 1;
    camera.far = view * 8;
    camera.position.copy(AXIS).multiplyScalar(view * 2.4);
    camera.updateProjectionMatrix();
    controls.target.set(0, 0.6, 0);
    controls.update();
  }

  function frameLights() {
    const span = Math.max(room.w, room.d) / 2 + 6;
    sun.position.set(room.w * 0.6 + 14, room.wallHeight * 3 + 22, room.d * 0.6 + 14);
    sun.target.position.set(0, 0, 0);
    const c = sun.shadow.camera;
    c.left = -span;
    c.right = span;
    c.top = span;
    c.bottom = -span;
    c.near = 1;
    c.far = span * 8 + 60;
    c.updateProjectionMatrix();
  }

  function clear() {
    if (outline) disposeGroup(outline);
    outline = null;
    if (content) disposeGroup(content);
    content = null;
    objectsRoot = null;
    objectNodes.clear();
    robotsRoot = null;
    robotNodes.clear();
    selectedId = null;
    selectedRobotId = null;
    firstPerson = false;
    robots = null;
    counts = { fixtures: 0, props: 0, objects: 0 };
  }

  function addObjectNodes() {
    for (const entry of townStore.getObjects(record.id)) {
      const node = buildObjectNode(entry.part, entry.rot);
      node.userData.isObject = true;
      node.userData.objectId = entry.id;
      node.userData.name = entry.name;
      objectsRoot.add(node);
      objectNodes.set(entry.id, node);
    }
  }

  function addRobotNodes() {
    robots = createRobots({
      group: robotsRoot,
      room,
      obstacles: obstacleRects(),
      entities: townStore.getRobots(record.id),
    });
    for (const node of robotsRoot.children) robotNodes.set(node.userData.robotId, node);
  }

  function originCounts() {
    let fixtures = 0;
    let props = 0;
    for (const entry of townStore.getObjects(record.id)) {
      if (entry.origin === 'default') fixtures++;
      else if (entry.origin === 'spec') props++;
    }
    return { fixtures, props, objects: objectNodes.size };
  }

  function obstacleRects() {
    scene.updateMatrixWorld(true);
    return rectsOf([...objectNodes.values()]);
  }

  function applyOutline(node) {
    if (outline) disposeGroup(outline);
    outline = null;
    if (!node || !content) return;
    node.updateWorldMatrix(true, true);
    outline = outlineFor(node);
    outlineOffset.copy(outline.position).sub(node.position);
    content.add(outline);
  }

  function select(id) {
    const node = id ? objectNodes.get(id) ?? null : null;
    selectedId = node ? id : null;
    selectedRobotId = null;
    applyOutline(node);
    return selectedId;
  }

  function selectRobot(id) {
    const node = id ? robotNodes.get(id) ?? null : null;
    selectedRobotId = node ? id : null;
    selectedId = null;
    applyOutline(node);
    return selectedRobotId;
  }

  function resync() {
    if (selectedRobotId) selectRobot(selectedRobotId);
    else select(selectedId);
  }

  function moveObject(id, x, z) {
    const node = objectNodes.get(id);
    if (!node || !room) return null;
    const entry = townStore.getObject(id);
    if (!entry) return null;
    const [cx, cz] = clampToRoom(entry.part, room, entry.rot, x, z);
    node.position.x = cx;
    node.position.z = cz;
    if (outline && selectedId === id) outline.position.copy(node.position).add(outlineOffset);
    return [round2(cx), round2(cz)];
  }

  function overlaps(part, rot, rects) {
    const [hw, , hd] = rotatedHalves(halfFor(part.kind, part), rot);
    for (const o of rects) {
      if (part.pos[0] + hw <= o.x - o.w / 2 - CLEARANCE || part.pos[0] - hw >= o.x + o.w / 2 + CLEARANCE) continue;
      if (part.pos[2] + hd <= o.z - o.d / 2 - CLEARANCE || part.pos[2] - hd >= o.z + o.d / 2 + CLEARANCE) continue;
      return true;
    }
    return false;
  }

  function freeSpotFor(part, rot = 0) {
    if (!record || !room || !part?.kind) return null;
    const turn = normRot(rot);
    const rects = obstacleRects();
    const reach = Math.max(room.w, room.d) / 2;
    for (let ring = 0; ring * SPOT_RING <= reach; ring++) {
      const r = ring * SPOT_RING;
      const steps = ring === 0 ? 1 : SPOT_ANGLES;
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const candidate = {
          ...part,
          pos: [round2(Math.cos(angle) * r), restY(part.kind, part), round2(Math.sin(angle) * r)],
        };
        const check = validateObjectPart(candidate, room, turn);
        if (!check.ok || overlaps(check.value, turn, rects)) continue;
        return check.value.pos;
      }
    }
    return null;
  }

  function refreshObjects() {
    if (!record || !objectsRoot) return;
    for (const node of [...objectsRoot.children]) disposeGroup(node);
    objectNodes.clear();
    addObjectNodes();
    counts.objects = objectNodes.size;
    robots?.setObstacles(obstacleRects());
    resync();
  }

  function refreshRobots() {
    if (!record || !robotsRoot) return;
    for (const node of [...robotsRoot.children]) disposeGroup(node);
    robotNodes.clear();
    addRobotNodes();
    resync();
  }

  function enter(target) {
    clear();
    record = target;
    room = roomFor(target);
    const theme = themeFor(target.type);

    content = new THREE.Group();
    scene.add(content);
    content.add(buildShell(room, theme));

    designed = Boolean(townStore.getSpace(target.id));

    objectsRoot = new THREE.Group();
    content.add(objectsRoot);
    addObjectNodes();

    robotsRoot = new THREE.Group();
    content.add(robotsRoot);
    addRobotNodes();

    counts = originCounts();

    frameLights();
    frameCamera();
    controls.enabled = true;
  }

  function exit() {
    clear();
    record = null;
    room = null;
    designed = false;
    controls.enabled = false;
  }

  return {
    scene,
    camera,
    controls,
    enter,
    exit,
    rebuild() {
      if (!record) return;
      const view = { position: camera.position.clone(), zoom: camera.zoom, target: controls.target.clone() };
      enter(record);
      camera.position.copy(view.position);
      camera.zoom = view.zoom;
      camera.updateProjectionMatrix();
      controls.target.copy(view.target);
      controls.update();
    },
    resize() {
      if (room) frameCamera();
    },
    isActive() {
      return Boolean(record);
    },
    isDesigned() {
      return designed;
    },
    current() {
      return record;
    },
    room() {
      return room;
    },
    select,
    selectedId() {
      return selectedId;
    },
    selectRobot,
    selectedRobotId() {
      return selectedRobotId;
    },
    setFirstPerson(active) {
      firstPerson = Boolean(active);
      controls.enabled = !firstPerson && Boolean(record);
    },
    isFirstPerson() {
      return firstPerson;
    },
    objectIds() {
      return [...objectNodes.keys()];
    },
    robotIds() {
      return [...robotNodes.keys()];
    },
    nodeFor(id) {
      return objectNodes.get(id) ?? null;
    },
    robotNodeFor(id) {
      return robotNodes.get(id) ?? null;
    },
    objectRoot() {
      return objectsRoot;
    },
    robotRoot() {
      return robotsRoot;
    },
    moveObject,
    refreshObjects,
    refreshRobots,
    freeSpotFor,
    stats() {
      if (!record) return null;
      return {
        name: record.name,
        type: record.type,
        badge: record.badge,
        designed,
        fixtures: counts.fixtures,
        props: counts.props,
        objects: counts.objects,
        robots: robotNodes.size,
        room: { ...room },
      };
    },
    robotPositions() {
      return robots ? robots.positions() : [];
    },
    robotTargets() {
      return robots ? robots.targets() : [];
    },
    update(dt) {
      robots?.update(dt);
      const node = selectedRobotId ? robotNodes.get(selectedRobotId) : null;
      if (node && outline) outline.position.copy(node.position).add(outlineOffset);
      controls.update();
    },
  };
}
