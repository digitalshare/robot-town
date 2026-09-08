import { BUILDINGS, SECTOR } from '../data/layout.js';

export function findBuildingRecord(state, id) {
  const builtin = BUILDINGS.find((b) => b.id === id);
  if (builtin) {
    return {
      id: builtin.id,
      name: builtin.name,
      type: builtin.type,
      badge: SECTOR.label,
      description: builtin.description,
      footprint: [...builtin.footprint],
    };
  }
  const placement = state.placements.find((p) => p.libraryId === id || p.id === id);
  if (!placement) return null;
  const entry = state.library.find((e) => e.id === placement.libraryId);
  if (!entry) return null;
  return {
    id: entry.id,
    name: entry.name,
    type: 'custom',
    badge: 'CUSTOM',
    description: entry.description,
    footprint: [...placement.footprint],
  };
}
