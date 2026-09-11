import { FUNCTION_IDS } from './functions.js';

const KEY = 'robot-town.ai.v1';
const VERSION = 1;
const PROTOCOLS = ['openai', 'anthropic', 'google'];
const PROMPT_CAP = 12000;
const MAX_CALLS = 20;
const CALL_STATUS = ['ok', 'aborted', 'error'];
const SYSTEM_CAP = 8000;
const MAX_CALL_MESSAGES = 6;
const MESSAGE_CAP = 1200;
const REPLY_CAP = 2000;

function clampText(value, max) {
  const text = String(value ?? '');
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function emptyFunctions() {
  return Object.fromEntries(FUNCTION_IDS.map((id) => [id, null]));
}

function normalizeCall(raw) {
  if (!raw || typeof raw !== 'object' || !FUNCTION_IDS.includes(raw.fn)) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    fn: raw.fn,
    at: Number(raw.at) || 0,
    status: CALL_STATUS.includes(raw.status) ? raw.status : 'ok',
    message: clampText(raw.message, 300),
    system: clampText(raw.system, SYSTEM_CAP),
    messages: (Array.isArray(raw.messages) ? raw.messages : []).slice(-MAX_CALL_MESSAGES).map((m) => ({
      role: m?.role === 'assistant' ? 'assistant' : m?.role === 'system' ? 'system' : 'user',
      content: clampText(m?.content, MESSAGE_CAP),
    })),
    reply: clampText(raw.reply, REPLY_CAP),
  };
}

function newId() {
  return (globalThis.crypto?.randomUUID?.() ?? 'p-' + Math.random().toString(36).slice(2, 10)).replace(/-/g, '').slice(0, 12);
}

function emptyState() {
  return {
    version: VERSION,
    providers: [],
    activeProviderId: null,
    functions: emptyFunctions(),
    calls: [],
    ui: { tab: 'ai', consoleCollapsed: false },
  };
}

function normalizeProvider(raw, seenIds) {
  if (!raw || typeof raw !== 'object') return null;
  const protocol = PROTOCOLS.includes(raw.protocol) ? raw.protocol : null;
  if (!protocol) return null;
  let id = typeof raw.id === 'string' && raw.id && !seenIds.has(raw.id) ? raw.id : newId();
  seenIds.add(id);
  return {
    id,
    name: String(raw.name ?? '').slice(0, 80) || 'PROVIDER',
    protocol,
    baseUrl: String(raw.baseUrl ?? '').slice(0, 300),
    apiKey: String(raw.apiKey ?? '').slice(0, 500),
    models: Array.isArray(raw.models) ? raw.models.map(String).slice(0, 500) : [],
    model: typeof raw.model === 'string' ? raw.model : '',
    status: ['untested', 'ok', 'stale', 'error'].includes(raw.status) ? raw.status : 'untested',
    statusMessage: String(raw.statusMessage ?? ''),
    lastTestedAt: Number(raw.lastTestedAt) || 0,
  };
}

function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== VERSION) return emptyState();
  const seen = new Set();
  const providers = (Array.isArray(raw.providers) ? raw.providers : [])
    .map((p) => normalizeProvider(p, seen))
    .filter(Boolean);
  const activeProviderId = providers.some((p) => p.id === raw.activeProviderId) ? raw.activeProviderId : null;
  const functions = emptyFunctions();
  for (const id of FUNCTION_IDS) {
    const saved = raw.functions?.[id];
    if (typeof saved === 'string' && saved.trim()) functions[id] = saved.slice(0, PROMPT_CAP);
  }
  const calls = (Array.isArray(raw.calls) ? raw.calls : []).map(normalizeCall).filter(Boolean).slice(0, MAX_CALLS);
  return {
    version: VERSION,
    providers,
    activeProviderId,
    functions,
    calls,
    ui: {
      tab: ['ai', 'gallery', 'objects', 'robots', 'settings'].includes(raw.ui?.tab) ? raw.ui.tab : 'ai',
      consoleCollapsed: raw.ui?.consoleCollapsed === true,
    },
  };
}

export function createAiStore(storage = globalThis.localStorage) {
  let state = load();
  const listeners = new Set();
  let warned = false;

  function load() {
    try {
      const raw = storage?.getItem(KEY);
      if (!raw) return emptyState();
      return normalizeState(JSON.parse(raw));
    } catch {
      return emptyState();
    }
  }

  function persist() {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        storage?.setItem(KEY, JSON.stringify(state));
        return;
      } catch {
        if (!state.calls.length) break;
        state.calls = attempt === 0 ? state.calls.slice(0, Math.ceil(state.calls.length / 2)) : [];
      }
    }
    if (!warned) {
      warned = true;
      console.warn('robot-town: could not persist AI settings (storage unavailable)');
    }
  }

  function commit(reason) {
    persist();
    for (const fn of listeners) fn(state, reason);
  }

  function updateProvider(id, reason, fn) {
    const p = state.providers.find((x) => x.id === id);
    if (!p) return;
    fn(p);
    commit(reason);
  }

  return {
    getState() {
      return state;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getProvider(id) {
      return state.providers.find((p) => p.id === id) ?? null;
    },
    getActiveProvider() {
      return state.providers.find((p) => p.id === state.activeProviderId) ?? null;
    },
    upsertProvider(draft) {
      const existing = draft.id ? state.providers.find((p) => p.id === draft.id) : null;
      if (existing) {
        const changed =
          existing.protocol !== draft.protocol || existing.baseUrl !== draft.baseUrl || existing.apiKey !== draft.apiKey;
        existing.name = draft.name;
        existing.protocol = draft.protocol;
        existing.baseUrl = draft.baseUrl;
        existing.apiKey = draft.apiKey;
        if (changed) {
          existing.status = 'stale';
          existing.statusMessage = 'CONFIG CHANGED — RETEST';
          existing.models = [];
          existing.model = '';
        }
        commit('providers');
        return existing;
      }
      const created = normalizeProvider(
        { ...draft, id: newId(), status: 'untested', models: [], model: '' },
        new Set(state.providers.map((p) => p.id))
      );
      state.providers.push(created);
      commit('providers');
      return created;
    },
    deleteProvider(id) {
      state.providers = state.providers.filter((p) => p.id !== id);
      if (state.activeProviderId === id) state.activeProviderId = state.providers[0]?.id ?? null;
      commit('providers');
    },
    setActive(id) {
      if (!state.providers.some((p) => p.id === id)) return;
      state.activeProviderId = id;
      commit('active');
    },
    setModel(id, model) {
      updateProvider(id, 'model', (p) => {
        p.model = model;
      });
    },
    setTestResult(id, { ok, models, message }) {
      updateProvider(id, 'test', (p) => {
        p.status = ok ? 'ok' : 'error';
        p.statusMessage = message;
        p.lastTestedAt = Date.now();
        if (ok) {
          p.models = models;
          if (!models.includes(p.model)) p.model = models[0] ?? '';
        } else {
          p.models = [];
          p.model = '';
        }
      });
    },
    getFunctionPrompt(id) {
      return FUNCTION_IDS.includes(id) ? state.functions[id] ?? null : null;
    },
    setFunctionPrompt(id, text) {
      if (!FUNCTION_IDS.includes(id)) return;
      const saved = String(text ?? '').trim().slice(0, PROMPT_CAP);
      state.functions[id] = saved || null;
      commit('functions');
    },
    recordCall(call) {
      const entry = normalizeCall({ ...call, id: newId(), at: Date.now() });
      if (!entry) return;
      state.calls.unshift(entry);
      if (state.calls.length > MAX_CALLS) state.calls.length = MAX_CALLS;
      commit('calls');
    },
    callsFor(id) {
      return state.calls.filter((c) => c.fn === id);
    },
    clearCalls(id) {
      state.calls = id ? state.calls.filter((c) => c.fn !== id) : [];
      commit('calls');
    },
    setUi(patch) {
      state.ui = { ...state.ui, ...patch };
      commit('ui');
    },
    reset() {
      state = emptyState();
      commit('providers');
    },
  };
}
