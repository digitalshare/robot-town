import { el, clear, maskKey, renderStatus } from './dom.js';
import { createProviderForm } from './providerForm.js';
import { getAdapter } from '../ai/providers/index.js';

export function createSettingsTab({ store }) {
  const list = el('div', { id: 'provider-list', className: 'provider-list' });
  const addBtn = el('button', { id: 'provider-add', className: 'btn', text: 'ADD PROVIDER' });

  let confirmId = null;
  let confirmTimer = null;

  const form = createProviderForm({
    store,
    onDone: () => {
      form.el.hidden = true;
      form.abortTest();
    },
  });

  const section = el(
    'section',
    { id: 'tab-settings', className: 'menu-tabpanel', role: 'tabpanel', 'aria-labelledby': 'tab-btn-settings', hidden: true },
    el('h2', { className: 'settings__heading', text: 'MODEL CONFIG' }),
    el('p', {
      className: 'settings__note',
      text: 'PROVIDERS AND API KEYS ARE STORED IN THIS BROWSER (localStorage) AND SENT DIRECTLY TO THE PROVIDER.',
    }),
    list,
    addBtn,
    form.el
  );

  function cardFor(provider) {
    const active = provider.id === store.getState().activeProviderId;
    const adapter = getAdapter(provider.protocol);
    const card = el(
      'article',
      { className: 'provider-card', dataset: { id: provider.id, active: String(active) } },
      el('div', { className: 'provider-card__name', text: provider.name + (active ? ' · ACTIVE' : '') }),
      el('div', { className: 'provider-card__meta', text: adapter.label + ' — ' + (provider.baseUrl || adapter.defaultBase) }),
      el('div', { className: 'provider-card__model', text: provider.model ? 'MODEL: ' + provider.model : 'NO MODEL SELECTED' }),
      renderStatus(el('div', { className: 'provider-card__status' }), {
        kind: provider.status,
        text: provider.statusMessage || provider.status.toUpperCase(),
      }),
      el(
        'div',
        { className: 'provider-card__meta', text: 'KEY: ' + maskKey(provider.apiKey) })
      ,
      el(
        'div',
        { className: 'provider-card__actions' },
        el('button', { className: 'btn btn--mini', dataset: { act: 'use' }, text: active ? 'ACTIVE' : 'USE', disabled: active }),
        el('button', { className: 'btn btn--mini', dataset: { act: 'edit' }, text: 'EDIT' }),
        el('button', { className: 'btn btn--mini', dataset: { act: 'delete' }, text: 'DELETE' })
      )
    );
    return card;
  }

  function renderList() {
    clear(list);
    const { providers } = store.getState();
    if (!providers.length) {
      list.appendChild(el('div', { className: 'settings__note', text: 'NO PROVIDERS — ADD ONE TO CONNECT A MODEL.' }));
      return;
    }
    for (const p of providers) list.appendChild(cardFor(p));
  }

  function resetConfirm(btn) {
    confirmId = null;
    clearTimeout(confirmTimer);
    if (btn) btn.textContent = 'DELETE';
  }

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const card = btn.closest('.provider-card');
    const id = card?.dataset.id;
    if (!id) return;
    const act = btn.dataset.act;
    if (act === 'use') store.setActive(id);
    else if (act === 'edit') form.load(store.getProvider(id));
    else if (act === 'delete') {
      if (confirmId === id) {
        resetConfirm(btn);
        form.abortTest();
        store.deleteProvider(id);
        if (!form.el.hidden) form.load(null);
      } else {
        resetConfirm(list.querySelector('button[data-act="delete"]'));
        confirmId = id;
        btn.textContent = 'CONFIRM?';
        confirmTimer = setTimeout(() => resetConfirm(btn), 3000);
      }
    }
  });

  addBtn.addEventListener('click', () => {
    form.load(null);
    form.el.scrollIntoView({ block: 'nearest' });
  });

  store.subscribe((state, reason) => {
    if (reason === 'providers' || reason === 'active' || reason === 'test' || reason === 'model') renderList();
  });

  renderList();

  return {
    el: section,
    onShow() {
      renderList();
    },
    startAdd() {
      form.load(null);
      form.el.scrollIntoView({ block: 'nearest' });
    },
    startEdit(id) {
      form.load(store.getProvider(id));
    },
  };
}
