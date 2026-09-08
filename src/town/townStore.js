import { MAX_EXPANSIONS, PLOT, gridForExpansion } from '../data/layout.js';
import { validateSpec } from '../buildings/spec.js';
import { validateSpaceSpec, roomFor } from '../interior/spaceSpec.js';
import { findBuildingRecord } from './records.js';

const KEY = 'robot-town.town.v1';
const VERSION = 1;
const LIBRARY_MAX = 50;

function newId(prefix) {
  const raw = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, '');
  return `${prefix}_${raw.slice(0, 8)}`;
}

function emptyState() {
  return { version: VERSION, expansions: 0, library: [], placements: [], spaces: [] };
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
  return { version: VERSION, expansions, ...town, spaces: normalizeSpaces(raw.spaces, town) };
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
      commit('space');
      return { ok: true, id: record.id };
    },
    removeSpace(buildingId) {
      const record = findBuildingRecord(state, buildingId);
      const id = record?.id ?? buildingId;
      if (!state.spaces.some((s) => s.buildingId === id)) return;
      state.spaces = state.spaces.filter((s) => s.buildingId !== id);
      commit('space');
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
      commit('placement');
    },
    reset() {
      state = emptyState();
      commit('expand');
    },
  };
}
