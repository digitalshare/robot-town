import { buildingPromptParts, spacePromptParts, objectPromptParts } from './tools.js';

export const FUNCTIONS = [
  { id: 'building', command: '/building', tool: 'create_building', label: 'CREATE BUILDING', parts: buildingPromptParts },
  { id: 'space', command: '/space', tool: 'create_space', label: 'UPDATE SPACE', parts: spacePromptParts },
  { id: 'object', command: '/object', tool: 'create_object', label: 'CREATE OBJECT', parts: objectPromptParts },
];

export const FUNCTION_IDS = FUNCTIONS.map((f) => f.id);

export function functionFor(id) {
  return FUNCTIONS.find((f) => f.id === id) ?? null;
}

export function defaultPromptFor(id) {
  return functionFor(id)?.parts({}).base ?? '';
}
