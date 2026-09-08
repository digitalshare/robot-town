import { openaiAdapter } from './openai.js';
import { anthropicAdapter } from './anthropic.js';
import { googleAdapter } from './google.js';
import { aiError } from '../http.js';

export const ADAPTERS = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  google: googleAdapter,
};

export const PROTOCOLS = Object.values(ADAPTERS).map((a) => ({
  value: a.protocol,
  label: a.label,
  defaultBase: a.defaultBase,
}));

export function getAdapter(protocol) {
  const adapter = ADAPTERS[protocol];
  if (!adapter) throw aiError('UNKNOWN PROVIDER PROTOCOL — ' + protocol, { kind: 'unknown' });
  return adapter;
}
