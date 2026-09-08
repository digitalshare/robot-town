const KEY = 'robot-town.ai.v1';
const VERSION = 1;
const PROTOCOLS = ['openai', 'anthropic', 'google'];

function newId() {
  return (globalThis.crypto?.randomUUID?.() ?? 'p-' + Math.random().toString(36).slice(2, 10)).replace(/-/g, '').slice(0, 12);
}

function emptyState() {
  return { version: VERSION, providers: [], activeProviderId: null, ui: { tab: 'ai', consoleCollapsed: false } };
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
  return {
    version: VERSION,
    providers,
    activeProviderId,
    ui: {
      tab: ['ai', 'gallery', 'settings'].includes(raw.ui?.tab) ? raw.ui.tab : 'ai',
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
    try {
      storage?.setItem(KEY, JSON.stringify(state));
    } catch {
      if (!warned) {
        warned = true;
        console.warn('robot-town: could not persist AI settings (storage unavailable)');
      }
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
