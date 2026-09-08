import { el, clear, maskKey, renderStatus } from './dom.js';
import { PROTOCOLS, getAdapter } from '../ai/providers/index.js';
import { toRequestError } from '../ai/http.js';

const TEST_TIMEOUT = 10000;

export function createProviderForm({ store, onDone }) {
  let editingId = null;
  let savedId = null;
  let testController = null;

  const nameInput = el('input', { id: 'pf-name', className: 'field__input', placeholder: 'MY PROVIDER', autocomplete: 'off' });
  const protocolSelect = el(
    'select',
    { id: 'pf-protocol', className: 'field__input' },
    PROTOCOLS.map((p) => el('option', { value: p.value, text: p.label }))
  );
  const baseInput = el('input', { id: 'pf-baseurl', className: 'field__input', placeholder: '', autocomplete: 'off' });
  const baseHint = el('span', { id: 'pf-base-hint', className: 'field__hint' });
  const keyInput = el('input', {
    id: 'pf-apikey',
    className: 'field__input',
    type: 'password',
    placeholder: '',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const revealBtn = el('button', { id: 'pf-reveal', type: 'button', className: 'btn btn--mini', text: 'SHOW' });
  const formError = el('div', { id: 'pf-form-error', className: 'form-error', hidden: true });
  const saveBtn = el('button', { id: 'pf-save', type: 'submit', className: 'btn btn--primary', text: 'SAVE' });
  const cancelBtn = el('button', { id: 'pf-cancel', type: 'button', className: 'btn', text: 'CANCEL' });

  const testBtn = el('button', { id: 'pf-test-btn', type: 'button', className: 'btn', text: 'TEST CONNECTION', disabled: true });
  const testStatus = el('span', { id: 'pf-test-status', className: 'status', dataset: { status: 'idle' }, text: 'SAVE FIRST' });
  const modelSelect = el('select', { id: 'pf-model', className: 'field__input', disabled: true });
  const activateBtn = el('button', { id: 'pf-activate', type: 'button', className: 'btn btn--primary', text: 'SET ACTIVE', hidden: true });

  const testBlock = el(
    'div',
    { id: 'pf-test', className: 'provider-form__test', hidden: true },
    el('div', { className: 'field__row' }, testBtn, testStatus),
    el('div', { className: 'field' }, el('label', { className: 'field__label', for: 'pf-model', text: 'MODEL' }), modelSelect),
    activateBtn
  );

  const form = el(
    'form',
    { id: 'provider-form', className: 'provider-form', hidden: true },
    el('div', { className: 'field' }, el('label', { className: 'field__label', for: 'pf-name', text: 'NAME' }), nameInput),
    el('div', { className: 'field' }, el('label', { className: 'field__label', for: 'pf-protocol', text: 'PROTOCOL' }), protocolSelect),
    el('div', { className: 'field' }, el('label', { className: 'field__label', for: 'pf-baseurl', text: 'BASE URL' }), baseInput, baseHint),
    el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', for: 'pf-apikey', text: 'API KEY' }),
      el('div', { className: 'field__row' }, keyInput, revealBtn),
      el('span', { className: 'field__hint', text: 'STORED IN THIS BROWSER ONLY (localStorage)' })
    ),
    formError,
    el('div', { className: 'provider-form__actions' }, saveBtn, cancelBtn),
    testBlock
  );

  function protocolMeta() {
    return PROTOCOLS.find((p) => p.value === protocolSelect.value) ?? PROTOCOLS[0];
  }

  function refreshHint() {
    const meta = protocolMeta();
    baseInput.placeholder = meta.defaultBase;
    baseHint.textContent = 'LEAVE EMPTY FOR DEFAULT — ' + meta.defaultBase;
  }

  function abortTest() {
    if (testController) testController.abort();
    testController = null;
  }

  function populateModels(provider) {
    clear(modelSelect);
    const ok = provider?.status === 'ok' && provider.models.length > 0;
    modelSelect.disabled = !ok;
    if (!ok) return;
    for (const m of provider.models) modelSelect.appendChild(el('option', { value: m, text: m }));
    modelSelect.value = provider.models.includes(provider.model) ? provider.model : provider.models[0];
  }

  function refreshTest(provider) {
    testBlock.hidden = !savedId;
    if (!savedId) return;
    testBtn.disabled = false;
    if (provider?.status === 'ok') {
      renderStatus(testStatus, { kind: 'ok', text: provider.statusMessage || 'CONNECTED' });
    } else if (provider?.status === 'error') {
      renderStatus(testStatus, { kind: 'error', text: provider.statusMessage || 'CONNECTION FAILED' });
    } else if (provider?.status === 'stale') {
      renderStatus(testStatus, { kind: 'idle', text: provider.statusMessage || 'RETEST REQUIRED' });
    } else {
      renderStatus(testStatus, { kind: 'idle', text: 'SAVED — TEST THE CONNECTION' });
    }
    populateModels(provider);
    activateBtn.hidden = !(provider?.status === 'ok' && provider.model && provider.id !== store.getState().activeProviderId);
  }

  function load(provider) {
    abortTest();
    editingId = provider?.id ?? null;
    savedId = provider?.id ?? null;
    nameInput.value = provider?.name ?? '';
    protocolSelect.value = provider?.protocol ?? PROTOCOLS[0].value;
    baseInput.value = provider?.baseUrl ?? '';
    keyInput.value = '';
    keyInput.placeholder = provider?.apiKey ? maskKey(provider.apiKey) + ' (LEAVE BLANK TO KEEP)' : '';
    formError.hidden = true;
    form.hidden = false;
    refreshHint();
    refreshTest(provider);
  }

  function validate() {
    const name = nameInput.value.trim();
    if (!name) return 'NAME IS REQUIRED';
    const baseUrl = baseInput.value.trim();
    if (baseUrl) {
      try {
        const u = new URL(baseUrl);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'BASE URL MUST BE http(s)';
      } catch {
        return 'BASE URL IS NOT A VALID URL';
      }
    }
    const stored = editingId ? store.getProvider(editingId)?.apiKey : '';
    if (!keyInput.value.trim() && !stored) return 'API KEY IS REQUIRED';
    return null;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      formError.textContent = problem;
      formError.hidden = false;
      return;
    }
    formError.hidden = true;
    const stored = editingId ? store.getProvider(editingId) : null;
    const record = store.upsertProvider({
      id: editingId,
      name: nameInput.value.trim(),
      protocol: protocolSelect.value,
      baseUrl: baseInput.value.trim(),
      apiKey: keyInput.value.trim() || stored?.apiKey || '',
    });
    editingId = record.id;
    savedId = record.id;
    keyInput.value = '';
    keyInput.placeholder = maskKey(record.apiKey) + ' (LEAVE BLANK TO KEEP)';
    refreshTest(store.getProvider(record.id));
  });

  protocolSelect.addEventListener('change', refreshHint);

  revealBtn.addEventListener('click', () => {
    const show = keyInput.type === 'password';
    keyInput.type = show ? 'text' : 'password';
    revealBtn.textContent = show ? 'HIDE' : 'SHOW';
  });

  cancelBtn.addEventListener('click', () => {
    abortTest();
    onDone?.();
  });

  testBtn.addEventListener('click', async () => {
    const provider = store.getProvider(savedId);
    if (!provider) return;
    abortTest();
    testController = new AbortController();
    const { signal } = testController;
    const timer = setTimeout(() => testController?.abort(), TEST_TIMEOUT);
    testBtn.disabled = true;
    renderStatus(testStatus, { kind: 'testing', text: 'TESTING…' });
    try {
      const models = await getAdapter(provider.protocol).listModels(provider, { signal });
      store.setTestResult(provider.id, { ok: true, models, message: models.length + ' MODELS' });
      refreshTest(store.getProvider(provider.id));
    } catch (err) {
      if (signal.aborted && err?.name === 'AbortError') {
        renderStatus(testStatus, { kind: 'error', text: 'CONNECTION TIMED OUT AFTER 10S' });
        store.setTestResult(provider.id, { ok: false, models: [], message: 'CONNECTION TIMED OUT AFTER 10S' });
      } else {
        const normalized = toRequestError(err, provider);
        store.setTestResult(provider.id, { ok: false, models: [], message: normalized.message });
        renderStatus(testStatus, { kind: 'error', text: normalized.message });
      }
      populateModels(store.getProvider(provider.id));
    } finally {
      clearTimeout(timer);
      testController = null;
      testBtn.disabled = false;
    }
  });

  modelSelect.addEventListener('change', () => {
    if (savedId && modelSelect.value) store.setModel(savedId, modelSelect.value);
    refreshTest(store.getProvider(savedId));
  });

  activateBtn.addEventListener('click', () => {
    if (savedId) store.setActive(savedId);
    refreshTest(store.getProvider(savedId));
  });

  store.subscribe((state, reason) => {
    if (reason === 'active' || reason === 'providers') refreshTest(store.getProvider(savedId));
  });

  return { el: form, load, abortTest };
}
