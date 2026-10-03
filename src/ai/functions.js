import { buildingPromptParts, spacePromptParts, objectPromptParts, extractSpec, extractObjectSpec } from './tools.js';
import { validateSpec } from '../buildings/spec.js';
import { validateSpaceSpec, validateObjectPart, roomFor, normRot } from '../interior/spaceSpec.js';

// Each function is the single source of truth for the chat command, the HTTP API and the MCP tool:
// `input` is the JSON schema callers send, `args` maps it to prompt parts, `extract`/`validate` turn the
// model reply into a checked spec. Add an entry here and /api/functions/<id> plus the MCP tool appear.
const BUILDING_REF = {
  type: 'object',
  description: 'The existing building the room belongs to',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    type: { type: 'string' },
    footprint: { type: 'array', items: { type: 'number' }, description: '[width, depth] ground size' },
  },
  required: ['name', 'footprint'],
};

function recordFrom(input) {
  const b = input.building;
  const f = Array.isArray(b?.footprint) ? b.footprint.map(Number) : [];
  if (f.length !== 2 || !f.every(Number.isFinite)) return { error: 'building.footprint MUST BE [WIDTH, DEPTH] NUMBERS' };
  return { record: { id: 'api', name: String(b.name ?? 'BUILDING'), type: String(b.type ?? 'custom'), description: String(b.description ?? ''), footprint: f } };
}

const asPart = (v) => (v && typeof v === 'object' ? v : null);

export const FUNCTIONS = [
  { id: 'building', command: '/building', tool: 'create_building', label: 'CREATE BUILDING', parts: buildingPromptParts,
    description: 'Design one new 3D building for the town and return a validated building spec.',
    input: {
      properties: { request: { type: 'string', description: 'What to build, in plain words' } },
      required: ['request'],
    },
    args: () => ({}),
    extract: (text) => extractSpec(text),
    validate: (raw) => validateSpec(raw),
  },
  { id: 'space', command: '/space', tool: 'create_space', label: 'UPDATE SPACE', parts: spacePromptParts,
    description: 'Design or edit the indoor space of one building and return a validated space spec.',
    input: {
      properties: {
        request: { type: 'string', description: 'What the room should contain or change' },
        building: BUILDING_REF,
        current_space: { type: 'object', description: 'Existing space spec to edit; omit for a new design' },
      },
      required: ['request', 'building'],
    },
    args: (input, record) => ({ record, room: roomFor(record), space: input.current_space ? { spec: input.current_space } : null }),
    extract: (text) => extractSpec(text),
    validate: (raw, record) => validateSpaceSpec(raw, roomFor(record)),
  },
  { id: 'object', command: '/object', tool: 'create_object', label: 'CREATE OBJECT', parts: objectPromptParts,
    description: 'Design one new 3D object for the room of one building and return a validated object spec.',
    input: {
      properties: {
        request: { type: 'string', description: 'The object to make' },
        building: BUILDING_REF,
        objects: { type: 'array', items: { type: 'object' }, description: 'Objects already in the room: { name, part }' },
        source: { type: 'object', description: 'Existing object spec to derive the new one from' },
      },
      required: ['request', 'building'],
    },
    args: (input, record) => ({ record, room: roomFor(record), source: asPart(input.source), objects: Array.isArray(input.objects) ? input.objects.filter((o) => o?.part?.pos) : [] }),
    extract: (text) => extractObjectSpec(text),
    validate: (raw, record) => {
      const check = validateObjectPart(raw, roomFor(record), normRot(raw?.rot));
      return check.ok ? { ok: true, value: { name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : '', rot: check.rot, part: check.value } } : check;
    },
  },
];

export { recordFrom };

export const FUNCTION_IDS = FUNCTIONS.map((f) => f.id);

export function functionFor(id) {
  return FUNCTIONS.find((f) => f.id === id) ?? null;
}

export function defaultPromptFor(id) {
  return functionFor(id)?.parts({}).base ?? '';
}
