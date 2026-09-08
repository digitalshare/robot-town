import { aiError, assertOk, readSse } from '../http.js';
import { splitSystem } from '../messages.js';

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function base(provider) {
  let b = ((provider.baseUrl || '').trim() || DEFAULT_BASE).replace(/\/+$/, '');
  if (!/\/v1(beta)?$/.test(b)) b += '/v1beta';
  return b;
}

function stripPrefix(id) {
  return String(id).replace(/^models\//, '');
}

function parseJson(payload) {
  try {
    return JSON.parse(payload);
  } catch {
    throw aiError('UNEXPECTED RESPONSE FROM PROVIDER — ' + payload.slice(0, 120), { kind: 'stream' });
  }
}

export const googleAdapter = {
  protocol: 'google',
  label: 'GOOGLE GEMINI',
  defaultBase: DEFAULT_BASE,

  headers(provider) {
    return {
      'content-type': 'application/json',
      'x-goog-api-key': provider.apiKey,
    };
  },

  async listModels(provider, { signal } = {}) {
    const res = await fetch(base(provider) + '/models', { headers: this.headers(provider), signal });
    await assertOk(res, provider);
    const json = await res.json();
    const all = (json.models ?? []).map((m) => stripPrefix(m.name)).filter(Boolean);
    const generative = (json.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => stripPrefix(m.name))
      .filter(Boolean);
    const ids = generative.length ? generative : all;
    if (!ids.length) throw aiError('PROVIDER RETURNED NO MODELS', { kind: 'stream' });
    return ids;
  },

  async streamChat(provider, model, messages, { onDelta, signal }) {
    const { system, turns } = splitSystem(messages);
    let contents = turns.map((t) => ({
      role: t.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: t.content }],
    }));
    while (contents.length && contents[0].role !== 'user') contents = contents.slice(1);

    const payload = { contents };
    if (system) payload.systemInstruction = { parts: [{ text: system }] };

    const url = base(provider) + '/models/' + encodeURIComponent(stripPrefix(model)) + ':streamGenerateContent?alt=sse';
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(provider),
      signal,
      body: JSON.stringify(payload),
    });
    await assertOk(res, provider);

    const { sawEvent } = await readSse(res, (data) => {
      const json = parseJson(data);
      if (json.promptFeedback?.blockReason) {
        throw aiError('REQUEST BLOCKED — ' + json.promptFeedback.blockReason, { kind: 'stream' });
      }
      const cand = json.candidates?.[0];
      if (cand?.finishReason === 'SAFETY') throw aiError('RESPONSE BLOCKED BY SAFETY FILTER', { kind: 'stream' });
      for (const part of cand?.content?.parts ?? []) {
        if (part.text) onDelta(part.text);
      }
    });
    if (!sawEvent) throw aiError('UNEXPECTED RESPONSE FROM PROVIDER — NO STREAM EVENTS', { kind: 'stream' });
  },
};
