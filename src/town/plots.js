import { BUILDINGS, PLOT } from '../data/layout.js';

function rect(x, z, w, d) {
  return { x, z, w, d };
}

export function occupiedRects(placements = []) {
  const rects = BUILDINGS.map((b) => rect(b.x, b.z, b.footprint[0], b.footprint[1]));
  for (const p of placements) {
    const [w, d] = Array.isArray(p.footprint) ? p.footprint : PLOT;
    rects.push(rect(p.x, p.z, w, d));
  }
  return rects;
}

function overlaps(a, b, gap) {
  return Math.abs(a.x - b.x) <= (a.w + b.w) / 2 + gap && Math.abs(a.z - b.z) <= (a.d + b.d) / 2 + gap;
}

export function freeCells(grid, placements = [], gap = 1) {
  const occupied = occupiedRects(placements);
  const cells = [];
  for (const x of grid.blockCentersX) {
    for (const z of grid.blockCentersZ) {
      const plot = rect(x, z, PLOT[0], PLOT[1]);
      if (occupied.some((o) => overlaps(plot, o, gap))) continue;
      cells.push({ id: `c_${x}_${z}`, x, z, plot: [...PLOT] });
    }
  }
  return cells;
}

export function findCell(grid, placements, x, z, gap = 1) {
  return freeCells(grid, placements, gap).find((c) => c.x === x && c.z === z) ?? null;
}
