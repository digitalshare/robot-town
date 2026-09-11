import { KINDS, MATERIAL_KEYS, MAX_PARTS, MAX_HEIGHT } from '../buildings/spec.js';
import { SPACE_KINDS, ALL_KINDS, MAX_SPACE_PARTS, MAX_ROBOTS } from '../interior/spaceSpec.js';
import { BUILDINGS, SECTOR, CHARGING_PADS, GRID, PLOT } from '../data/layout.js';

export function townSystemPrompt({ tool = null } = {}) {
  const facilities = BUILDINGS.map((b) => `- ${b.name} (id ${b.id}, x ${b.x}, z ${b.z}, footprint ${b.footprint[0]} x ${b.footprint[1]})`).join(
    '\n'
  );
  const lines = [
    `You are the operations assistant for ${SECTOR.label}, an isometric 3D robot town rendered in the browser with three.js.`,
    'The user is looking at the town and can hover buildings to see their names.',
    'Facilities in this sector:',
    facilities,
    `${CHARGING_PADS.length} charging pads; road grid lines at x/z = ${GRID.linesX.join(', ')}.`,
    'Answer in 2-4 short sentences unless asked for detail.',
  ];
  if (tool) {
    lines.push(`You have one tool, ${tool}. Use it only through the schema below.`);
  } else {
    lines.push('You have no tools and cannot change the scene.');
    lines.push('If asked to modify the town, name the files a developer would edit (src/data/layout.js, src/buildings/*).');
  }
  return lines.join('\n');
}

export const TOOLS = {
  create_building: {
    name: 'create_building',
    description: 'Design a new 3D building for the town by returning one JSON building spec.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Uppercase name, 1-60 characters' },
        description: { type: 'string', description: 'One sentence, max 280 characters' },
        footprint: { type: 'array', items: { type: 'number' }, description: '[width, depth] ground size' },
        parts: { type: 'array', items: { type: 'object' }, description: 'Stacked primitives, see schema' },
      },
      required: ['name', 'footprint', 'parts'],
    },
  },
  create_space: {
    name: 'create_space',
    description: 'Design the indoor space of one existing building by returning one JSON space spec.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'One sentence, max 280 characters' },
        robots: { type: 'integer', description: `Robots wandering the room, 0-${MAX_ROBOTS}` },
        parts: { type: 'array', items: { type: 'object' }, description: 'Props standing in the room, see schema' },
      },
      required: ['parts'],
    },
  },
  create_object: {
    name: 'create_object',
    description: 'Design one new 3D object for an existing indoor space by returning one JSON object spec.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Uppercase name, 1-40 characters' },
        kind: { type: 'string', description: `One of ${ALL_KINDS.join(', ')}` },
        mat: { type: 'string', description: 'Material key, optional' },
        pos: { type: 'array', items: { type: 'number' }, description: '[x, y, z] centre above the floor; omit y to rest it on the floor' },
        rot: { type: 'integer', description: 'Yaw in degrees, 0-355 in steps of 5' },
      },
      required: ['kind'],
    },
  },
};

export const EXAMPLE_SPEC = {
  name: 'LOOKOUT TOWER',
  description: 'A slim observation tower with a glazed cab and a beacon mast.',
  footprint: [6, 6],
  parts: [
    { kind: 'box', mat: 'wallGray', size: [4, 4, 4], pos: [0, 2, 0] },
    { kind: 'cyl', mat: 'wallDark', r: 1.2, h: 3, pos: [0, 5.5, 0], seg: 12 },
    { kind: 'screen', mat: 'screen', size: [2.2, 1.2], pos: [0, 5.5, 1.25] },
    { kind: 'antenna', h: 3, pos: [0, 7, 0] },
  ],
};

export function parseSlashCommand(text) {
  const match = /^\/([a-z]+)\s*([\s\S]*)$/i.exec(String(text ?? '').trim());
  if (!match) return null;
  return { name: match[1].toLowerCase(), args: match[2].trim() };
}

export function buildingPromptParts({ plot = PLOT, site = null } = {}) {
  const base = [
    townSystemPrompt({ tool: 'create_building' }),
    '',
    'TOOL create_building: you may design exactly one new building for the town.',
    'When the user asks for a building (or the message starts with /building), reply with a single fenced ```json block holding one building spec object, followed by at most one sentence of prose. No other JSON in the reply.',
    'SCHEMA:',
    '{ "name": "UPPERCASE NAME", "description": "one sentence", "footprint": [w, d], "parts": [ ... ] }',
    `footprint: ground size in units; each axis between 3 and ${plot[0]} / ${plot[1]}.`,
    `parts: 1 to ${MAX_PARTS} entries of { kind, mat, pos: [x, y, z], ... } where kind is one of ${KINDS.join(', ')}:`,
    '- box: size [w, h, d]',
    '- rbox: size [w, h, d], radius (corner rounding, optional)',
    '- cyl: r (radius), h (height), seg (3-32, optional, default 16)',
    '- screen: size [w, h] (thin glowing panel)',
    '- solar: size [w, d], tilt (0-1.2, optional)',
    '- antenna: h (1-20); pos.y is the base of the mast',
    `mat must be one of: ${MATERIAL_KEYS.join(', ')}.`,
    `pos.y is the height of the part centre above the grass pad (0 = pad surface). Parts must stay within the footprint plus 1 unit of overhang, sit on or above the pad, and stay under ${MAX_HEIGHT} units tall.`,
    'All numbers finite with at most 2 decimals.',
    'WORKED EXAMPLE (valid, mirrors the required shape):',
    '```json',
    JSON.stringify(EXAMPLE_SPEC, null, 2),
    '```',
  ].join('\n');
  const context = site
    ? `SITE REFERENCE: the building will stand at map position x ${site.x}, z ${site.z} on a ${site.plot[0]} x ${site.plot[1]} plot. Size the footprint to fit that plot.`
    : '';
  return { base, context };
}

export const EXAMPLE_SPACE = {
  description: 'Cold-aisle server room with two rack rows, a status wall and a duty desk.',
  robots: 3,
  parts: [
    { kind: 'rack', size: [2, 3, 1], pos: [-2, 1.55, -2] },
    { kind: 'rack', size: [2, 3, 1], pos: [2, 1.55, -2] },
    { kind: 'screen', mat: 'screen', size: [3, 1.4], pos: [0, 2.2, -2.6] },
    { kind: 'desk', size: [2.4, 1.2], pos: [0, 0.84, 2] },
    { kind: 'crate', size: [1.2], pos: [-2.6, 0.6, 2.2] },
    { kind: 'plant', size: [1], pos: [2.4, 0.82, 2.4] },
  ],
};

const KIND_LINES = {
  box: '- box: size [w, h, d], mat',
  rbox: '- rbox: size [w, h, d], mat, radius (corner rounding, optional)',
  cyl: '- cyl: r, h, seg (3-32, optional), mat',
  screen: '- screen: size [w, h] thin glowing panel, mat',
  rack: '- rack: size [w, h, d] server or storage rack; h + 0.1 tall, rests on the floor at pos.y = (h + 0.1) / 2',
  desk: '- desk: size [w, d] bench with a screen; 1.68 tall, rests at pos.y = 0.84',
  plant: '- plant: size [scale] planter; 1.64 * scale tall, rests at pos.y = 0.82 * scale',
  crate: '- crate: size [scale] storage crate; scale tall, rests at pos.y = scale / 2',
  tank: '- tank: r, h cylinder with a band; h + 0.3 tall, rests at pos.y = (h + 0.3) / 2',
  pad: '- pad: charging pad, 3.56 x 2.8 footprint, 0.5 tall, rests at pos.y = 0.25',
  shelf: '- shelf: size [w, h, d] stock shelf with boards, mat; h tall, rests at pos.y = h / 2',
  bench: '- bench: size [w, d] work bench with a vise, mat; 1.25 tall, rests at pos.y = 0.63',
  locker: '- locker: size [w, h, d] robot locker with handles and vents, mat; h tall, rests at pos.y = h / 2',
  chest: '- chest: size [w, h, d] tool chest with three drawers, mat; h + 0.08 tall, rests at pos.y = (h + 0.08) / 2',
  monitor: '- monitor: size [w, h] screen on a stand, mat; h + 1 tall, rests at pos.y = (h + 1) / 2',
  pillar: '- pillar: r, h tapered support column with a base and a cap, mat; h tall, rests at pos.y = h / 2',
  lamp: '- lamp: h floor lamp with a glowing head, mat; rests at pos.y = h / 2',
  pipe: '- pipe: h vertical conduit with flanges and a stub, mat; rests at pos.y = h / 2',
};

function kindBullets(kinds) {
  return Object.keys(KIND_LINES)
    .filter((kind) => kinds.includes(kind))
    .map((kind) => KIND_LINES[kind]);
}

function roomReference(record, room, subject = 'Every part') {
  const limX = Math.round((room.w / 2 - 0.2) * 100) / 100;
  const limZ = Math.round((room.d / 2 - 0.2) * 100) / 100;
  return `ROOM REFERENCE: ${record.name} · ${room.w} x ${room.d} · WALL HEIGHT ${room.wallHeight} · TYPE ${record.type}. ${subject} must span no further than ±${limX} on x and ±${limZ} on z, must not start below the floor, and must not exceed ${room.wallHeight - 0.2} in height. Leave the middle of the room walkable for the robots.`;
}

function currentSpaceBlock(space) {
  const spec = space?.spec;
  if (!spec || !Array.isArray(spec.parts) || !spec.parts.length) {
    return 'CURRENT SPACE: none — this request creates the initial design.';
  }
  return [
    `CURRENT SPACE (${spec.parts.length} parts, ${spec.robots ?? 0} robots):`,
    '```json',
    JSON.stringify({ description: spec.description ?? '', robots: spec.robots ?? 0, parts: spec.parts }, null, 2),
    '```',
  ].join('\n');
}

export function spacePromptParts({ record = null, room = null, space = null } = {}) {
  const base = [
    townSystemPrompt({ tool: 'create_space' }),
    '',
    'TOOL create_space: you may design exactly one indoor space for one existing building.',
    'When the user asks for an indoor space (or the message starts with /space), reply with a single fenced ```json block holding one space spec object, followed by at most one sentence of prose. No other JSON in the reply.',
    'SCHEMA:',
    '{ "description": "one sentence", "robots": 4, "parts": [ ... ] }',
    `description: max 280 characters. robots: whole number 0 to ${MAX_ROBOTS} wandering the room; omit it to use the default for this room.`,
    `parts: 1 to ${MAX_SPACE_PARTS} entries of { kind, pos: [x, y, z], ... } where kind is one of ${SPACE_KINDS.join(', ')}:`,
    ...kindBullets(SPACE_KINDS),
    `mat must be one of: ${MATERIAL_KEYS.join(', ')}.`,
    'pos is the CENTRE of the part. y is the height of that centre above the floor (0 = floor), so anything standing on the floor uses pos.y = half its total height. The room has no ceiling: keep parts below the wall height.',
    'UPDATE MODE: the CURRENT SPACE block below is the room as it stands now. If it says "none", design the initial space. Otherwise treat the request as an edit — keep every part the request does not change, apply only what it asks for, and return the COMPLETE updated spec (never a diff, never only the changed parts).',
    'WORKED EXAMPLE (valid, mirrors the required shape):',
    '```json',
    JSON.stringify(EXAMPLE_SPACE, null, 2),
    '```',
  ].join('\n');
  const lines = [];
  if (record && room) lines.push(roomReference(record, room));
  if (record?.description) lines.push(`BUILDING: ${record.description}`);
  lines.push(currentSpaceBlock(space));
  return { base, context: lines.join('\n') };
}

export const EXAMPLE_OBJECT = {
  name: 'SPARE COOLANT TANK',
  kind: 'tank',
  mat: 'wallWhite',
  r: 0.7,
  h: 2,
  pos: [2.4, 1.15, 1.8],
  rot: 0,
};

export function objectPromptParts({ record = null, room = null, source = null, objects = [] } = {}) {
  const base = [
    townSystemPrompt({ tool: 'create_object' }),
    '',
    'TOOL create_object: you may design exactly one new 3D object for one existing indoor space.',
    'When the user asks for an object (or the message starts with /object), reply with a single fenced ```json block holding one object spec, followed by at most one sentence of prose. No other JSON in the reply.',
    'SCHEMA:',
    '{ "name": "UPPERCASE NAME", "kind": "one kind", "mat": "material key", "pos": [x, y, z], "rot": 0, ...kind fields }',
    'name: 1 to 40 characters, uppercase. rot: yaw in degrees, 0 to 355 in steps of 5; omit it to face the object along the room.',
    `kind is one of ${ALL_KINDS.join(', ')}:`,
    ...kindBullets(ALL_KINDS),
    `mat must be one of: ${MATERIAL_KEYS.join(', ')}.`,
    'pos is the CENTRE of the object and always holds three numbers: [x, y, z]. y is the height of that centre above the floor (0 = floor), so set y to half the object height to rest it on the floor. The room has no ceiling: keep the object below the wall height.',
    'WORKED EXAMPLE (valid, mirrors the required shape):',
    '```json',
    JSON.stringify(EXAMPLE_OBJECT, null, 2),
    '```',
  ].join('\n');
  const lines = [];
  if (record && room) lines.push(roomReference(record, room, 'The object'));
  const placed = Array.isArray(objects) ? objects : [];
  if (placed.length) {
    lines.push(`OBJECTS ALREADY IN THE ROOM (${placed.length}): keep at least 1 unit clear of them.`);
    for (const entry of placed.slice(0, 12)) {
      lines.push(`- ${entry.name} ${entry.part.kind} at x ${entry.part.pos[0]} z ${entry.part.pos[2]}`);
    }
  }
  if (source) {
    lines.push(
      'SOURCE OBJECT: derive one new related object from it — keep the same visual family, change what the user asks for, and give it a new name and a free position.',
      '```json',
      JSON.stringify(source, null, 2),
      '```'
    );
  }
  if (record?.description) lines.push(`BUILDING: ${record.description}`);
  return { base, context: lines.join('\n') };
}

function braceSlices(text) {
  const out = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out;
}

function tryParse(raw) {
  const cleaned = raw
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/,\s*([}\]])/g, '$1');
  try {
    const value = JSON.parse(cleaned);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function extractSpec(text, accepts = (value) => Array.isArray(value.parts)) {
  if (typeof text !== 'string' || !text) return null;
  const candidates = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = fence.exec(text))) candidates.push(match[1]);
  candidates.push(...braceSlices(text));
  for (const raw of candidates) {
    const value = tryParse(raw);
    if (value && accepts(value)) return value;
  }
  return null;
}

export function extractObjectSpec(text) {
  const value = extractSpec(text, (v) => typeof v.kind === 'string' || typeof v.object?.kind === 'string');
  if (!value) return null;
  return typeof value.kind === 'string' ? value : value.object;
}
