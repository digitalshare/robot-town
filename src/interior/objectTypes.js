export const OBJECT_KINDS = ['shelf', 'bench', 'locker', 'lamp', 'monitor', 'pillar', 'pipe', 'chest', 'board', 'planter'];

export const OBJECT_CATEGORIES = [
  'PRIMITIVE',
  'STRUCTURE',
  'TECH',
  'STORAGE',
  'WORKSHOP',
  'INDUSTRIAL',
  'LIGHTING',
  'GREEN',
  'POWER',
];

export const OBJECT_TYPES = [
  {
    kind: 'box',
    name: 'BLOCK',
    cat: 'PRIMITIVE',
    description: 'Plain rectangular block for walls, platforms and ballast.',
    defaults: { kind: 'box', mat: 'wallGray', size: [1.6, 1, 1.2] },
  },
  {
    kind: 'rbox',
    name: 'ROUNDED BLOCK',
    cat: 'PRIMITIVE',
    description: 'Soft-cornered block for housings and casings.',
    defaults: { kind: 'rbox', mat: 'wallWhite', size: [1.4, 1, 1] },
  },
  {
    kind: 'cyl',
    name: 'CYLINDER',
    cat: 'PRIMITIVE',
    description: 'Bare cylinder for drums, ducts and posts.',
    defaults: { kind: 'cyl', mat: 'wallGray', r: 0.5, h: 1.8, seg: 16 },
  },
  {
    kind: 'pillar',
    name: 'SUPPORT PILLAR',
    cat: 'STRUCTURE',
    description: 'Load-bearing column with a plated base and cap.',
    defaults: { kind: 'pillar', mat: 'wallGray', r: 0.4, h: 3 },
  },
  {
    kind: 'screen',
    name: 'SCREEN PANEL',
    cat: 'TECH',
    description: 'Thin glowing panel for status walls and signage.',
    defaults: { kind: 'screen', mat: 'screen', size: [2.4, 1.3] },
  },
  {
    kind: 'monitor',
    name: 'MONITOR STAND',
    cat: 'TECH',
    description: 'Freestanding display on a pedestal, ready to face a desk.',
    defaults: { kind: 'monitor', mat: 'screen', size: [1.8, 1.1] },
  },
  {
    kind: 'board',
    name: 'DISPLAY BOARD',
    cat: 'TECH',
    description: 'Wide glowing board on twin legs for signage and status walls.',
    defaults: { kind: 'board', mat: 'screen', size: [3, 1.5] },
  },
  {
    kind: 'rack',
    name: 'SERVER RACK',
    cat: 'TECH',
    description: 'Tall cabinet with cyan status strips and a vented cap.',
    defaults: { kind: 'rack', mat: 'wallDark', size: [2, 3, 1] },
  },
  {
    kind: 'desk',
    name: 'DUTY DESK',
    cat: 'TECH',
    description: 'Worktop on four legs with a small screen.',
    defaults: { kind: 'desk', mat: 'wallWhite', size: [2.4, 1.2] },
  },
  {
    kind: 'shelf',
    name: 'STOCK SHELF',
    cat: 'STORAGE',
    description: 'Open shelving with uprights, boards and stacked boxes.',
    defaults: { kind: 'shelf', mat: 'crate', size: [2.4, 2, 0.6] },
  },
  {
    kind: 'crate',
    name: 'STORAGE CRATE',
    cat: 'STORAGE',
    description: 'Wooden crate with a dark band.',
    defaults: { kind: 'crate', mat: 'crate', size: [1.2] },
  },
  {
    kind: 'chest',
    name: 'TOOL CHEST',
    cat: 'STORAGE',
    description: 'Three-drawer chest with cyan handles and a lipped top.',
    defaults: { kind: 'chest', mat: 'wallDark', size: [1.4, 1, 0.7] },
  },
  {
    kind: 'bench',
    name: 'WORK BENCH',
    cat: 'WORKSHOP',
    description: 'Sturdy bench with a lower shelf and a vise.',
    defaults: { kind: 'bench', mat: 'wallGray', size: [2.4, 1.2] },
  },
  {
    kind: 'locker',
    name: 'ROBOT LOCKER',
    cat: 'WORKSHOP',
    description: 'Tall locker with a door seam, vents and glowing handles.',
    defaults: { kind: 'locker', mat: 'wallGray', size: [1, 2.2, 0.6] },
  },
  {
    kind: 'tank',
    name: 'COOLANT TANK',
    cat: 'INDUSTRIAL',
    description: 'Pressure cylinder with a glowing band and a lid.',
    defaults: { kind: 'tank', mat: 'wallWhite', r: 0.8, h: 2.4 },
  },
  {
    kind: 'pipe',
    name: 'PIPE CONDUIT',
    cat: 'INDUSTRIAL',
    description: 'Flanged vertical conduit with a horizontal stub.',
    defaults: { kind: 'pipe', mat: 'wallDark', h: 2.6 },
  },
  {
    kind: 'lamp',
    name: 'FLOOR LAMP',
    cat: 'LIGHTING',
    description: 'Pole lamp with a glowing head for dark aisles.',
    defaults: { kind: 'lamp', mat: 'wallDark', h: 2.2 },
  },
  {
    kind: 'plant',
    name: 'POTTED PLANT',
    cat: 'GREEN',
    description: 'Planter with two leaf clusters.',
    defaults: { kind: 'plant', size: [1] },
  },
  {
    kind: 'planter',
    name: 'PLANTER BED',
    cat: 'GREEN',
    description: 'Raised bed carrying a row of potted plants.',
    defaults: { kind: 'planter', mat: 'crate', size: [3.4, 0.5, 1.3] },
  },
  {
    kind: 'pad',
    name: 'CHARGING PAD',
    cat: 'POWER',
    description: 'Ring-lit pad where robots recharge.',
    defaults: { kind: 'pad' },
  },
];

export function typeFor(kind) {
  return OBJECT_TYPES.find((t) => t.kind === kind) ?? null;
}

export function searchTypes(query) {
  const q = String(query ?? '')
    .trim()
    .toLowerCase();
  if (!q) return [...OBJECT_TYPES];
  return OBJECT_TYPES.filter((t) => `${t.name} ${t.cat} ${t.kind} ${t.description}`.toLowerCase().includes(q));
}

export function sizeLabel(type) {
  const d = type.defaults;
  if (Array.isArray(d.size)) {
    if (d.size.length === 1) return `SCALE ${d.size[0]}`;
    return d.size.join(' × ');
  }
  if (d.r !== undefined) return `R ${d.r} × H ${d.h}`;
  if (d.h !== undefined) return `H ${d.h}`;
  return 'FIXED SIZE';
}
