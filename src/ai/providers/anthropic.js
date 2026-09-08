import { aiError, assertOk, readSse } from '../http.js';
import { splitSystem, mergeConsecutive } from '../messages.js';

const DEFAULT_BASE = 'https://api.anthropic.com/v1';
const MAX_TOKENS = 1024;

function root(provider) {
  let r = ((provider.baseUrl || '').trim() || 'https://api.anthropic.com').replace(/\/+$/, '');
  r = r.replace(/\/(v1\/)?(messages|models)$/i, '');
  r = r.replace(/\/v1$/i, '');
  return r + '/v1';
}

function parseJson(payload) {
  try {
    return JSON.parse(payload);
  } catch {
    throw aiError('UNEXPECTED RESPONSE FROM PROVIDER — ' + payload.slice(0, 120), { kind: 'stream' });
  }
}

export const anthropicAdapter = {
  protocol: 'anthropic',
  label: 'ANTHROPIC',
  defaultBase: DEFAULT_BASE,

  headers(provider) {
    return {
      'content-type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  },

  async listModels(provider, { signal } = {}) {
    const res = await fetch(root(provider) + '/models', { headers: this.headers(provider), signal });
    await assertOk(res, provider);
    const json = await res.json();
    const ids = (json.data ?? []).map((m) => m.id).filter(Boolean);
    if (!ids.length) throw aiError('PROVIDER RETURNED NO MODELS', { kind: 'stream' });
    return ids;
  },

  async streamChat(provider, model, messages, { onDelta, signal }) {
    const { system, turns } = splitSystem(messages);
    let body = mergeConsecutive(turns);
    while (body.length && body[0].role !== 'user') body = body.slice(1);

    const payload = { model, max_tokens: MAX_TOKENS, messages: body, stream: true };
    if (system) payload.system = system;

    const res = await fetch(root(provider) + '/messages', {
      method: 'POST',
      headers: this.headers(provider),
      signal,
      body: JSON.stringify(payload),
    });
    await assertOk(res, provider);

    const { sawEvent } = await readSse(res, (data) => {
      const json = parseJson(data);
      if (json.type === 'error') throw aiError(json.error?.message || 'PROVIDER STREAM ERROR', { kind: 'stream' });
      if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta' && json.delta.text) {
        onDelta(json.delta.text);
      }
    });
    if (!sawEvent) throw aiError('UNEXPECTED RESPONSE FROM PROVIDER — NO STREAM EVENTS', { kind: 'stream' });
  },
};
