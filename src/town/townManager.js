import * as THREE from 'three';
import { BUILDINGS, CHARGING_PADS, computeTrees, inBlock } from '../data/layout.js';
import { BUILDERS } from '../buildings/index.js';
import { buildFromSpec, validateSpec } from '../buildings/spec.js';
import { buildGround } from './ground.js';
import { buildRoads } from './roads.js';
import { disposeGroup } from './dispose.js';
import { freeCells as computeFreeCells, occupiedRects } from './plots.js';
import { tree } from '../helpers/site.js';
import { chargingPad } from '../helpers/tech.js';

const GHOST_OPACITY = 0.55;
const OUTLINE_COLOR = 0x59dcea;

function outlineFor(group) {
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

function applyGhost(group) {
  group.traverse((o) => {
    if (!o.isMesh) return;
    const ghost = o.material.clone();
    ghost.transparent = true;
    ghost.opacity = GHOST_OPACITY;
    ghost.depthWrite = false;
    o.material = ghost;
  });
}

export function createTownManager({ buildingsGroup, townStore }) {
  const town = new THREE.Group();
  let base = null;
  let review = null;

  town.add(buildingsGroup);

  function grid() {
    return townStore.getGrid();
  }

  function placements() {
    return townStore.getState().placements;
  }

  function rebuildBase() {
    if (base) disposeGroup(base);
    base = new THREE.Group();
    const g = grid();
    base.add(buildGround(g));
    base.add(buildRoads(g));
    const rects = occupiedRects(placements());
    for (const [x, z, s, v] of computeTrees(g, rects)) {
      const t = tree(s, v);
      t.position.set(x, inBlock(g, x, z) ? g.slabTop : 0, z);
      base.add(t);
    }
    for (const [x, z] of CHARGING_PADS) {
      const pad = chargingPad();
      pad.position.set(x, g.slabTop, z);
      base.add(pad);
    }
    town.add(base);
  }

  function addBuiltins() {
    const slabTop = grid().slabTop;
    for (const rec of BUILDINGS) {
      const b = BUILDERS[rec.type]();
      b.position.set(rec.x, slabTop, rec.z);
      b.userData.name = rec.name;
      b.userData.id = rec.id;
      b.userData.isBuilding = true;
      buildingsGroup.add(b);
    }
  }

  function rebuildCustoms() {
    for (const child of [...buildingsGroup.children]) {
      if (child.userData.custom) disposeGroup(child);
    }
    const state = townStore.getState();
    const slabTop = grid().slabTop;
    for (const p of state.placements) {
      const entry = state.library.find((e) => e.id === p.libraryId);
      if (!entry) continue;
      const b = buildFromSpec(entry.spec);
      b.position.set(p.x, slabTop, p.z);
      b.userData.name = entry.name;
      b.userData.id = entry.id;
      b.userData.placementId = p.id;
      b.userData.isBuilding = true;
      b.userData.custom = true;
      buildingsGroup.add(b);
    }
  }

  function setReview({ spec, cell }) {
    clearReview();
    if (!cell) return { ok: false, errors: ['NO BUILD SITE SELECTED'] };
    const check = validateSpec(spec);
    if (!check.ok) return { ok: false, errors: check.errors };
    const group = buildFromSpec(check.value);
    group.userData.name = check.value.name;
    group.userData.isReview = true;
    group.add(outlineFor(group));
    applyGhost(group);
    group.position.set(cell.x, grid().slabTop, cell.z);
    buildingsGroup.add(group);
    review = { group, spec: check.value, cell: { id: cell.id, x: cell.x, z: cell.z, plot: [...cell.plot] } };
    return { ok: true, name: check.value.name, footprint: check.value.footprint };
  }

  function clearReview() {
    if (!review) return;
    disposeGroup(review.group);
    review = null;
  }

  function commitReview() {
    if (!review) return { ok: false, errors: ['NO BUILDING IN REVIEW'] };
    const { spec, cell } = review;
    const free = freeCells().some((c) => c.x === cell.x && c.z === cell.z);
    clearReview();
    if (!free) return { ok: false, errors: ['SITE IS NO LONGER FREE — EXPAND THE MAP OR CLEAR IT'] };
    return townStore.addBuilding({
      name: spec.name,
      description: spec.description,
      spec,
      x: cell.x,
      z: cell.z,
    });
  }

  function freeCells() {
    return computeFreeCells(grid(), placements());
  }

  rebuildBase();
  addBuiltins();
  rebuildCustoms();

  townStore.subscribe((state, reason) => {
    if (reason === 'expand') {
      clearReview();
      rebuildBase();
      rebuildCustoms();
    } else if (reason === 'building' || reason === 'placement') {
      rebuildCustoms();
    }
  });

  return {
    town,
    buildingsGroup,
    getGrid: grid,
    freeCells,
    expand() {
      return townStore.expand();
    },
    setReview,
    getReview() {
      if (!review) return null;
      return {
        name: review.spec.name,
        footprint: review.spec.footprint,
        cell: review.cell,
        group: review.group,
      };
    },
    commitReview,
    clearReview,
    stats() {
      const g = grid();
      const state = townStore.getState();
      return {
        expansions: state.expansions,
        roadLinesX: g.linesX.length,
        roadLinesZ: g.linesZ.length,
        blocks: g.blockCentersX.length * g.blockCentersZ.length,
        intersections: g.linesX.length * g.linesZ.length,
        buildings: buildingsGroup.children.filter((c) => c.userData.isBuilding).length,
        customBuildings: state.placements.length,
        library: state.library.length,
        freeCells: freeCells().length,
        bounds: { ...g.bounds },
      };
    },
  };
}
