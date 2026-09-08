import { KINDS, MATERIAL_KEYS, MAX_PARTS, MAX_HEIGHT } from '../buildings/spec.js';
import { SPACE_KINDS, MAX_SPACE_PARTS, MAX_ROBOTS } from '../interior/spaceSpec.js';
import { PLOT } from '../data/layout.js';

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

export function buildingToolContext({ plot = PLOT, site = null } = {}) {
  const lines = [
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
  ];
  if (site) {
    lines.push(
      `SITE REFERENCE: the building will stand at map position x ${site.x}, z ${site.z} on a ${site.plot[0]} x ${site.plot[1]} plot. Size the footprint to fit that plot.`
    );
  }
  lines.push('WORKED EXAMPLE (valid, mirrors the required shape):', '```json', JSON.stringify(EXAMPLE_SPEC, null, 2), '```');
  return lines.join('\n');
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

export function spaceToolContext({ record, room }) {
  const limX = Math.round((room.w / 2 - 0.2) * 100) / 100;
  const limZ = Math.round((room.d / 2 - 0.2) * 100) / 100;
  const lines = [
    '',
    'TOOL create_space: you may design exactly one indoor space for one existing building.',
    'When the user asks for an indoor space (or the message starts with /space), reply with a single fenced ```json block holding one space spec object, followed by at most one sentence of prose. No other JSON in the reply.',
    'SCHEMA:',
    '{ "description": "one sentence", "robots": 4, "parts": [ ... ] }',
    `description: max 280 characters. robots: whole number 0 to ${MAX_ROBOTS} wandering the room; omit it to use the default for this room.`,
    `parts: 1 to ${MAX_SPACE_PARTS} entries of { kind, pos: [x, y, z], ... } where kind is one of ${SPACE_KINDS.join(', ')}:`,
    '- box: size [w, h, d], mat',
    '- rbox: size [w, h, d], mat, radius (corner rounding, optional)',
    '- cyl: r, h, seg (3-32, optional), mat',
    '- screen: size [w, h] thin glowing panel, mat',
    '- rack: size [w, h, d] server or storage rack; h + 0.1 tall, rests on the floor at pos.y = (h + 0.1) / 2',
    '- desk: size [w, d] bench with a screen; 1.68 tall, rests at pos.y = 0.84',
    '- plant: size [scale] planter; 1.64 * scale tall, rests at pos.y = 0.82 * scale',
    '- crate: size [scale] storage crate; scale tall, rests at pos.y = scale / 2',
    '- tank: r, h cylinder with a band; h + 0.3 tall, rests at pos.y = (h + 0.3) / 2',
    '- pad: charging pad, 3.56 x 2.8 footprint, 0.5 tall, rests at pos.y = 0.25',
    `mat must be one of: ${MATERIAL_KEYS.join(', ')}.`,
    'pos is the CENTRE of the part. y is the height of that centre above the floor (0 = floor), so anything standing on the floor uses pos.y = half its total height. The room has no ceiling: keep parts below the wall height.',
    `ROOM REFERENCE: ${record.name} · ${room.w} x ${room.d} · WALL HEIGHT ${room.wallHeight} · TYPE ${record.type}. Every part must span no further than ±${limX} on x and ±${limZ} on z, must not start below the floor, and must not exceed ${room.wallHeight - 0.2} in height. Leave the middle of the room walkable for the robots.`,
  ];
  if (record.description) lines.push(`BUILDING: ${record.description}`);
  lines.push('WORKED EXAMPLE (valid, mirrors the required shape):', '```json', JSON.stringify(EXAMPLE_SPACE, null, 2), '```');
  return lines.join('\n');
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

export function extractSpec(text) {
  if (typeof text !== 'string' || !text) return null;
  const candidates = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = fence.exec(text))) candidates.push(match[1]);
  candidates.push(...braceSlices(text));
  for (const raw of candidates) {
    const value = tryParse(raw);
    if (value && Array.isArray(value.parts)) return value;
  }
  return null;
}
