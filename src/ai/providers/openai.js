import { aiError, assertOk, readSse } from '../http.js';

const DEFAULT_BASE = 'https://api.openai.com/v1';

function base(provider) {
  const raw = (provider.baseUrl || '').trim();
  return (raw || DEFAULT_BASE).replace(/\/+$/, '');
}

function parseJson(payload) {
  try {
    return JSON.parse(payload);
  } catch {
    throw aiError('UNEXPECTED RESPONSE FROM PROVIDER — ' + payload.slice(0, 120), { kind: 'stream' });
  }
}

export const openaiAdapter = {
  protocol: 'openai',
  label: 'OPENAI-COMPATIBLE',
  defaultBase: DEFAULT_BASE,

  headers(provider) {
    return {
      'content-type': 'application/json',
      authorization: 'Bearer ' + provider.apiKey,
    };
  },

  async listModels(provider, { signal } = {}) {
    const res = await fetch(base(provider) + '/models', { headers: this.headers(provider), signal });
    await assertOk(res, provider);
    const json = await res.json();
    const ids = (json.data ?? []).map((m) => m.id).filter(Boolean);
    if (!ids.length) throw aiError('PROVIDER RETURNED NO MODELS', { kind: 'stream' });
    return ids;
  },

  async streamChat(provider, model, messages, { onDelta, signal }) {
    const res = await fetch(base(provider) + '/chat/completions', {
      method: 'POST',
      headers: this.headers(provider),
      signal,
      body: JSON.stringify({ model, messages, stream: true }),
    });
    await assertOk(res, provider);

    const type = res.headers.get('content-type') || '';
    if (type.includes('application/json')) {
      const json = await res.json();
      const text = json.choices?.[0]?.message?.content ?? '';
      if (text) onDelta(text);
      return;
    }

    const { sawEvent } = await readSse(res, (payload) => {
      const json = parseJson(payload);
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) onDelta(delta);
    });
    if (!sawEvent) throw aiError('UNEXPECTED RESPONSE FROM PROVIDER — NO STREAM EVENTS', { kind: 'stream' });
  },
};
