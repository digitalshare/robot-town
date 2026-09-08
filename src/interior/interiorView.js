import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MAT, box } from '../materials/palette.js';
import { disposeGroup } from '../town/dispose.js';
import { roomFor, defaultRobots, buildSpaceFromSpec } from './spaceSpec.js';
import { themeFor, fixturesFor } from './themes.js';
import { createRobots } from './robots.js';

const AXIS = new THREE.Vector3(72, 78, 72).normalize();

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
  let counts = { fixtures: 0, props: 0 };

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
    if (content) disposeGroup(content);
    content = null;
    robots = null;
    counts = { fixtures: 0, props: 0 };
  }

  function enter(target) {
    clear();
    record = target;
    room = roomFor(target);
    designed = false;
    const theme = themeFor(target.type);

    content = new THREE.Group();
    scene.add(content);
    content.add(buildShell(room, theme));

    const fixtures = fixturesFor(target, room);
    for (const f of fixtures) content.add(f);

    const space = townStore.getSpace(target.id);
    const props = [];
    if (space) {
      const built = buildSpaceFromSpec(space.spec);
      content.add(built);
      props.push(...built.children);
      designed = true;
    }

    scene.updateMatrixWorld(true);
    const obstacles = rectsOf(fixtures).concat(rectsOf(props));
    const count = designed ? space.spec.robots : defaultRobots(room);
    robots = createRobots({ group: content, room, obstacles, count });
    counts = { fixtures: fixtures.length, props: props.length };

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
      if (record) enter(record);
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
    stats() {
      if (!record) return null;
      return {
        name: record.name,
        type: record.type,
        badge: record.badge,
        designed,
        fixtures: counts.fixtures,
        props: counts.props,
        robots: robots?.count ?? 0,
        room: { ...room },
      };
    },
    robotPositions() {
      return robots ? robots.positions() : [];
    },
    update(dt) {
      robots?.update(dt);
      controls.update();
    },
  };
}
