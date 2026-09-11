import { MAX_EXPANSIONS, PLOT, gridForExpansion } from '../data/layout.js';
import { validateSpec } from '../buildings/spec.js';
import {
  validateSpaceSpec,
  validateObjectPart,
  validateRobot,
  sampleRobotHomes,
  robotFacing,
  defaultRobots,
  normRot,
  roomFor,
  MAX_ROBOTS_PER_ROOM,
} from '../interior/spaceSpec.js';
import { typeForRobot, ROBOT_TYPE_KEYS } from '../interior/robotTypes.js';
import { typeFor } from '../interior/objectTypes.js';
import { findBuildingRecord } from './records.js';

const KEY = 'robot-town.town.v1';
const VERSION = 1;
const LIBRARY_MAX = 50;
const MAX_OBJECTS = 80;

function newId(prefix) {
  const raw = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, '');
  return `${prefix}_${raw.slice(0, 8)}`;
}

function emptyState() {
  return {
    version: VERSION,
    expansions: 0,
    library: [],
    placements: [],
    spaces: [],
    objects: [],
    robots: [],
    seeded: [],
    seededRobots: [],
    adopted: [],
  };
}

function insideBounds(grid, x, z) {
  const { minX, maxX, minZ, maxZ } = grid.bounds;
  return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
}

function normalizeLibraryEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const check = validateSpec(raw.spec, PLOT);
  if (!check.ok) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('b'),
    name: check.value.name,
    description: check.value.description,
    spec: check.value,
    createdAt: Number(raw.createdAt) || Date.now(),
  };
}

function normalizePlacement(raw, libraryIds) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.libraryId !== 'string' || !libraryIds.has(raw.libraryId)) return null;
  const x = Number(raw.x);
  const z = Number(raw.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const footprint = Array.isArray(raw.footprint) && raw.footprint.length === 2 && raw.footprint.every(Number.isFinite)
    ? raw.footprint.map(Number)
    : PLOT;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('pl'),
    libraryId: raw.libraryId,
    name: String(raw.name ?? '').slice(0, 60),
    x,
    z,
    footprint,
  };
}

function normalizeSpaces(rawSpaces, town) {
  const out = [];
  const seen = new Set();
  const list = Array.isArray(rawSpaces) ? rawSpaces : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list[i];
    if (!entry || typeof entry !== 'object') continue;
    const buildingId = typeof entry.buildingId === 'string' ? entry.buildingId : '';
    if (!buildingId) continue;
    const record = findBuildingRecord(town, buildingId);
    if (!record || seen.has(record.id)) continue;
    const check = validateSpaceSpec(entry.spec, roomFor(record));
    if (!check.ok) continue;
    seen.add(record.id);
    out.unshift({
      id: typeof entry.id === 'string' && entry.id ? entry.id : newId('sp'),
      buildingId: record.id,
      spec: check.value,
      createdAt: Number(entry.createdAt) || Date.now(),
    });
  }
  return out;
}

function objectName(raw, kind) {
  const text = String(raw ?? '').trim().slice(0, 40);
  return text || (typeFor(kind)?.name ?? 'OBJECT');
}

function normalizeObjects(rawObjects, town) {
  const out = [];
  const seen = new Set();
  const held = new Map();
  const list = Array.isArray(rawObjects) ? rawObjects : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list[i];
    if (!entry || typeof entry !== 'object') continue;
    const buildingId = typeof entry.buildingId === 'string' ? entry.buildingId : '';
    if (!buildingId) continue;
    const record = findBuildingRecord(town, buildingId);
    if (!record) continue;
    const id = typeof entry.id === 'string' && entry.id ? entry.id : newId('ob');
    if (seen.has(id)) continue;
    const rot = normRot(entry.rot);
    const check = validateObjectPart(entry.part, roomFor(record), rot);
    if (!check.ok) continue;
    const count = held.get(record.id) ?? 0;
    if (count >= MAX_OBJECTS) continue;
    held.set(record.id, count + 1);
    seen.add(id);
    out.unshift({
      id,
      buildingId: record.id,
      name: objectName(entry.name, check.value.kind),
      part: check.value,
      rot,
      origin: entry.origin === 'default' || entry.origin === 'spec' ? entry.origin : 'user',
      createdAt: Number(entry.createdAt) || Date.now(),
    });
  }
  return out;
}

function idList(raw) {
  return Array.isArray(raw) ? raw.filter((v) => typeof v === 'string' && v) : [];
}

function robotName(raw, type, used) {
  const text = String(raw ?? '').trim().slice(0, 40);
  if (text) return text;
  const prefix = typeForRobot(type).type.toUpperCase();
  const taken = new Set(used);
  let n = taken.size + 1;
  while (taken.has(`${prefix}-${String(n).padStart(2, '0')}`)) n++;
  return `${prefix}-${String(n).padStart(2, '0')}`;
}

function robotFields(value, used) {
  const name = robotName(value.name, value.type, used);
  used.push(name);
  return {
    name,
    type: value.type,
    accent: value.accent,
    scale: value.scale,
    pos: value.pos,
    rot: value.rot,
    wander: value.wander,
  };
}

function rosterRobots(buildingId, count, room, origin, createdAt) {
  const used = [];
  return sampleRobotHomes(count, room).map((pos) => ({
    id: newId('rb'),
    buildingId,
    ...robotFields(validateRobot({ type: 'unit', pos, rot: robotFacing(pos) }, room).value, used),
    origin,
    createdAt,
  }));
}

function normalizeRobots(rawRobots, town) {
  const out = [];
  const seen = new Set();
  const held = new Map();
  const used = new Map();
  const list = Array.isArray(rawRobots) ? rawRobots : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list[i];
    if (!entry || typeof entry !== 'object') continue;
    const buildingId = typeof entry.buildingId === 'string' ? entry.buildingId : '';
    if (!buildingId) continue;
    const record = findBuildingRecord(town, buildingId);
    if (!record) continue;
    const id = typeof entry.id === 'string' && entry.id ? entry.id : newId('rb');
    if (seen.has(id)) continue;
    const check = validateRobot(entry, roomFor(record));
    if (!check.ok) continue;
    const count = held.get(record.id) ?? 0;
    if (count >= MAX_ROBOTS_PER_ROOM) continue;
    held.set(record.id, count + 1);
    if (!used.has(record.id)) used.set(record.id, []);
    seen.add(id);
    out.unshift({
      id,
      buildingId: record.id,
      ...robotFields(check.value, used.get(record.id)),
      origin: entry.origin === 'default' || entry.origin === 'spec' ? entry.origin : 'user',
      createdAt: Number(entry.createdAt) || Date.now(),
    });
  }
  return out;
}

function specObjects(space) {
  return space.spec.parts.map((part) => ({
    id: newId('ob'),
    buildingId: space.buildingId,
    name: objectName(undefined, part.kind),
    part,
    rot: 0,
    origin: 'spec',
    createdAt: space.createdAt,
  }));
}

function migrateSpaces(spaces, objects, adopted) {
  for (const space of spaces) {
    if (adopted.includes(space.buildingId)) continue;
    if (!objects.some((o) => o.buildingId === space.buildingId && o.origin === 'spec')) {
      objects.push(...specObjects(space));
    }
    adopted.push(space.buildingId);
  }
}

function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== VERSION) return emptyState();
  const expansions = Math.max(0, Math.min(MAX_EXPANSIONS, Math.trunc(Number(raw.expansions) || 0)));
  const grid = gridForExpansion(expansions);

  const library = [];
  const ids = new Set();
  for (const entry of Array.isArray(raw.library) ? raw.library : []) {
    const value = normalizeLibraryEntry(entry);
    if (!value || ids.has(value.id)) continue;
    ids.add(value.id);
    library.push(value);
  }

  const kept = new Set(library.slice(-LIBRARY_MAX).map((e) => e.id));
  const placements = [];
  const used = new Set();
  for (const entry of Array.isArray(raw.placements) ? raw.placements : []) {
    const value = normalizePlacement(entry, kept);
    if (!value || used.has(value.id) || !insideBounds(grid, value.x, value.z)) continue;
    used.add(value.id);
    placements.push(value);
  }

  const town = { library: library.filter((e) => kept.has(e.id)), placements };
  const spaces = normalizeSpaces(raw.spaces, town);
  const objects = normalizeObjects(raw.objects, town);
  const robots = normalizeRobots(raw.robots, town);
  const seeded = idList(raw.seeded);
  const seededRobots = idList(raw.seededRobots);
  const adopted = idList(raw.adopted);
  migrateSpaces(spaces, objects, adopted);
  return {
    version: VERSION,
    expansions,
    ...town,
    spaces,
    objects,
    robots,
    seeded,
    seededRobots,
    adopted,
  };
}

export function createTownStore(storage = globalThis.localStorage) {
  let state = load();
  const listeners = new Set();
  let warned = false;

  function load() {
    try {
      const raw = storage?.getItem(KEY);
      if (!raw) return emptyState();
      return normalizeState(JSON.parse(raw));
    } catch {
      return emptyState();
    }
  }

  function persist() {
    try {
      storage?.setItem(KEY, JSON.stringify(state));
    } catch {
      if (!warned) {
        warned = true;
        console.warn('robot-town: could not persist town state (storage unavailable)');
      }
    }
  }

  function commit(reason) {
    persist();
    for (const fn of listeners) fn(state, reason);
  }

  function trimLibrary() {
    if (state.library.length <= LIBRARY_MAX) return;
    const dropped = state.library.slice(0, state.library.length - LIBRARY_MAX).map((e) => e.id);
    state.library = state.library.slice(-LIBRARY_MAX);
    state.placements = state.placements.filter((p) => !dropped.includes(p.libraryId));
  }

  return {
    getState() {
      return state;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getGrid() {
      return gridForExpansion(state.expansions);
    },
    getLibraryEntry(id) {
      return state.library.find((e) => e.id === id) ?? null;
    },
    getSpace(buildingId) {
      const record = findBuildingRecord(state, buildingId);
      if (!record) return null;
      return state.spaces.find((s) => s.buildingId === record.id) ?? null;
    },
    addSpace(buildingId, spec) {
      const record = findBuildingRecord(state, buildingId);
      if (!record) return { ok: false, errors: ['NO SUCH BUILDING'] };
      const check = validateSpaceSpec(spec, roomFor(record));
      if (!check.ok) return { ok: false, errors: check.errors };
      const existing = state.spaces.find((s) => s.buildingId === record.id);
      if (existing) {
        existing.spec = check.value;
        existing.createdAt = Date.now();
      } else {
        state.spaces.push({ id: newId('sp'), buildingId: record.id, spec: check.value, createdAt: Date.now() });
      }
      state.objects = state.objects.filter((o) => !(o.buildingId === record.id && o.origin === 'spec'));
      state.objects.push(...specObjects({ spec: check.value, buildingId: record.id, createdAt: Date.now() }));
      state.robots = state.robots.filter((r) => !(r.buildingId === record.id && r.origin !== 'user'));
      state.robots.push(...rosterRobots(record.id, check.value.robots, roomFor(record), 'spec', Date.now()));
      if (!state.seededRobots.includes(record.id)) state.seededRobots.push(record.id);
      if (!state.adopted.includes(record.id)) state.adopted.push(record.id);
      commit('space');
      return { ok: true, id: record.id };
    },
    removeSpace(buildingId) {
      const record = findBuildingRecord(state, buildingId);
      const id = record?.id ?? buildingId;
      if (!state.spaces.some((s) => s.buildingId === id)) return;
      state.spaces = state.spaces.filter((s) => s.buildingId !== id);
      state.robots = state.robots.filter((r) => !(r.buildingId === id && r.origin === 'spec'));
      state.seededRobots = state.seededRobots.filter((v) => v !== id);
      commit('space');
    },
    getObjects(buildingId) {
      const record = findBuildingRecord(state, buildingId);
      if (!record) return [];
      return state.objects.filter((o) => o.buildingId === record.id);
    },
    isSeeded(buildingId) {
      const record = findBuildingRecord(state, buildingId);
      return Boolean(record) && state.seeded.includes(record.id);
    },
    seedObjects(buildingId, entries = []) {
      const record = findBuildingRecord(state, buildingId);
      if (!record) return { ok: false, errors: ['NO SUCH BUILDING'] };
      if (state.seeded.includes(record.id)) return { ok: false, errors: ['DEFAULT LAYOUT ALREADY PLACED'] };
      state.seeded.push(record.id);
      const room = roomFor(record);
      let placed = 0;
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        const turn = normRot(entry.rot);
        const check = validateObjectPart(entry.part, room, turn);
        if (!check.ok) continue;
        state.objects.push({
          id: newId('ob'),
          buildingId: record.id,
          name: objectName(entry.name, check.value.kind),
          part: check.value,
          rot: turn,
          origin: 'default',
          createdAt: Date.now(),
        });
        placed++;
      }
      commit('object');
      return { ok: true, placed };
    },
    getObject(objectId) {
      return state.objects.find((o) => o.id === objectId) ?? null;
    },
    addObject(buildingId, { name, part, rot } = {}) {
      const record = findBuildingRecord(state, buildingId);
      if (!record) return { ok: false, errors: ['NO SUCH BUILDING'] };
      if (state.objects.filter((o) => o.buildingId === record.id).length >= MAX_OBJECTS) {
        return { ok: false, errors: [`THE ROOM ALREADY HOLDS ${MAX_OBJECTS} OBJECTS`] };
      }
      const turn = normRot(rot);
      const check = validateObjectPart(part, roomFor(record), turn);
      if (!check.ok) return { ok: false, errors: check.errors };
      const id = newId('ob');
      state.objects.push({
        id,
        buildingId: record.id,
        name: objectName(name, check.value.kind),
        part: check.value,
        rot: turn,
        origin: 'user',
        createdAt: Date.now(),
      });
      commit('object');
      return { ok: true, id };
    },
    updateObject(objectId, patch = {}) {
      const entry = state.objects.find((o) => o.id === objectId);
      if (!entry) return { ok: false, errors: ['NO SUCH OBJECT'] };
      const record = findBuildingRecord(state, entry.buildingId);
      if (!record) return { ok: false, errors: ['NO SUCH BUILDING'] };
      const turn = normRot(patch.rot ?? entry.rot);
      const check = validateObjectPart(patch.part ?? entry.part, roomFor(record), turn);
      if (!check.ok) return { ok: false, errors: check.errors };
      entry.part = check.value;
      entry.rot = turn;
      if (patch.name !== undefined) entry.name = objectName(patch.name, check.value.kind);
      commit('object');
      return { ok: true, id: entry.id };
    },
    removeObject(objectId) {
      if (!state.objects.some((o) => o.id === objectId)) return;
      state.objects = state.objects.filter((o) => o.id !== objectId);
      commit('object');
    },
    getRobots(buildingId) {
      const record = findBuildingRecord(state, buildingId);
      if (!record) return [];
      return state.robots.filter((r) => r.buildingId === record.id);
    },
    allRobots() {
      return state.robots;
    },
    getRobot(robotId) {
      return state.robots.find((r) => r.id === robotId) ?? null;
    },
    seedRobots(buildingId) {
      const record = findBuildingRecord(state, buildingId);
      if (!record) return { ok: false, errors: ['NO SUCH BUILDING'] };
      if (state.seededRobots.includes(record.id)) return { ok: false, errors: ['ROSTER ALREADY SEEDED'] };
      const space = state.spaces.find((s) => s.buildingId === record.id);
      const room = roomFor(record);
      const owned = state.robots.some((r) => r.buildingId === record.id && r.origin !== 'user');
      const count = owned ? 0 : space ? space.spec.robots : defaultRobots(room);
      if (count) state.robots.push(...rosterRobots(record.id, count, room, space ? 'spec' : 'default', Date.now()));
      state.seededRobots.push(record.id);
      if (count) commit('robot');
      return { ok: true, placed: count };
    },
    addRobot(buildingId, draft = {}) {
      const record = findBuildingRecord(state, buildingId);
      if (!record) return { ok: false, errors: ['NO SUCH BUILDING'] };
      const room = roomFor(record);
      const siblings = state.robots.filter((r) => r.buildingId === record.id);
      if (siblings.length >= MAX_ROBOTS_PER_ROOM) {
        return { ok: false, errors: [`THE ROOM ALREADY HOLDS ${MAX_ROBOTS_PER_ROOM} ROBOTS`] };
      }
      const type = ROBOT_TYPE_KEYS.includes(draft.type) ? draft.type : 'unit';
      const pos = Array.isArray(draft.pos) ? draft.pos : sampleRobotHomes(siblings.length + 1, room)[siblings.length];
      const rot = draft.rot === undefined ? robotFacing(pos) : draft.rot;
      const check = validateRobot({ ...draft, type, pos, rot }, room);
      if (!check.ok) return { ok: false, errors: check.errors };
      const id = newId('rb');
      state.robots.push({
        id,
        buildingId: record.id,
        ...robotFields(check.value, siblings.map((r) => r.name)),
        origin: 'user',
        createdAt: Date.now(),
      });
      commit('robot');
      return { ok: true, id };
    },
    updateRobot(robotId, patch = {}) {
      const entry = state.robots.find((r) => r.id === robotId);
      if (!entry) return { ok: false, errors: ['NO SUCH ROBOT'] };
      const record = findBuildingRecord(state, entry.buildingId);
      if (!record) return { ok: false, errors: ['NO SUCH BUILDING'] };
      const check = validateRobot(
        {
          type: patch.type ?? entry.type,
          accent: patch.accent ?? entry.accent,
          scale: patch.scale ?? entry.scale,
          pos: patch.pos ?? entry.pos,
          rot: patch.rot ?? entry.rot,
          wander: patch.wander ?? entry.wander,
          name: patch.name ?? entry.name,
        },
        roomFor(record)
      );
      if (!check.ok) return { ok: false, errors: check.errors };
      const used = state.robots.filter((r) => r.buildingId === entry.buildingId && r.id !== entry.id).map((r) => r.name);
      Object.assign(entry, robotFields(check.value, used));
      commit('robot');
      return { ok: true, id: entry.id };
    },
    removeRobot(robotId) {
      if (!state.robots.some((r) => r.id === robotId)) return;
      state.robots = state.robots.filter((r) => r.id !== robotId);
      commit('robot');
    },
    expand() {
      if (state.expansions >= MAX_EXPANSIONS) return state.expansions;
      state.expansions += 1;
      commit('expand');
      return state.expansions;
    },
    addBuilding({ name, description, spec, x, z }) {
      const check = validateSpec(spec, PLOT);
      if (!check.ok) return { ok: false, errors: check.errors };
      if (!Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, errors: ['SITE COORDINATES ARE NOT NUMBERS'] };
      if (!insideBounds(gridForExpansion(state.expansions), x, z)) {
        return { ok: false, errors: ['SITE IS OUTSIDE THE MAPPED AREA'] };
      }

      const libraryId = newId('b');
      const placementId = newId('pl');
      state.library.push({
        id: libraryId,
        name: name || check.value.name,
        description: description || check.value.description,
        spec: check.value,
        createdAt: Date.now(),
      });
      state.placements.push({
        id: placementId,
        libraryId,
        name: check.value.name,
        x,
        z,
        footprint: check.value.footprint,
      });
      trimLibrary();
      commit('building');
      return { ok: true, libraryId, placementId };
    },
    removePlacement(id) {
      const target = state.placements.find((p) => p.id === id);
      if (!target) return;
      state.placements = state.placements.filter((p) => p.id !== id);
      if (!state.placements.some((p) => p.libraryId === target.libraryId)) {
        state.library = state.library.filter((e) => e.id !== target.libraryId);
        state.spaces = state.spaces.filter((s) => s.buildingId !== target.libraryId);
      }
      state.objects = state.objects.filter((o) => findBuildingRecord(state, o.buildingId));
      state.robots = state.robots.filter((r) => findBuildingRecord(state, r.buildingId));
      state.seeded = state.seeded.filter((id) => findBuildingRecord(state, id));
      state.seededRobots = state.seededRobots.filter((id) => findBuildingRecord(state, id));
      state.adopted = state.adopted.filter((id) => findBuildingRecord(state, id));
      commit('placement');
    },
    reset() {
      state = emptyState();
      commit('expand');
    },
  };
}
