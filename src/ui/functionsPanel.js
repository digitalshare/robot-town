import { el, clear } from './dom.js';
import { FUNCTIONS, functionFor, defaultPromptFor } from '../ai/functions.js';

const STATUS_LABEL = { ok: 'OK', aborted: 'ABORTED', error: 'ERROR' };

function timeLabel(at) {
  if (!at) return '--:--:--';
  const d = new Date(at);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function summaryOf(call) {
  const user = [...call.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const line = user.replace(/\s+/g, ' ').trim();
  if (!line) return 'NO USER TEXT';
  return line.length > 48 ? `${line.slice(0, 48)}…` : line;
}

function promptText(call) {
  const blocks = [`[SYSTEM]\n${call.system}`];
  for (const m of call.messages) blocks.push(`[${m.role.toUpperCase()}]\n${m.content}`);
  return blocks.join('\n\n');
}

export function createFunctionsPanel({ store, host = document.body } = {}) {
  let currentId = null;
  let dirty = false;
  let expandedCallId = null;

  const closeBtn = el('button', {
    id: 'functions-close',
    className: 'fn-panel__close',
    type: 'button',
    'aria-label': 'Close functions',
    text: '×',
  });

  const list = el('div', { id: 'fn-list', className: 'fn-list', role: 'list' });
  const rows = new Map();
  for (const fn of FUNCTIONS) {
    const badge = el('span', { className: 'fn-row__badge', text: 'CUSTOM', hidden: true });
    const row = el(
      'button',
      { className: 'fn-row', type: 'button', role: 'listitem', dataset: { fn: fn.id, custom: 'false' }, 'aria-expanded': 'false' },
      el('span', { className: 'fn-row__cmd', text: fn.command.toUpperCase() }),
      el('span', { className: 'fn-row__label', text: fn.label }),
      badge
    );
    row.addEventListener('click', () => select(fn.id));
    list.appendChild(row);
    rows.set(fn.id, { row, badge });
  }

  const detailTitle = el('h3', { id: 'fn-detail-title', className: 'fn-detail__title' });
  const prompt = el('textarea', {
    id: 'fn-prompt',
    className: 'fn-prompt',
    rows: '14',
    spellcheck: 'false',
    'aria-label': 'System prompt',
  });
  const status = el('p', { id: 'fn-status', className: 'fn-status', role: 'status', dataset: { state: 'muted' } });
  const saveBtn = el('button', { id: 'fn-save', className: 'btn btn--primary', type: 'button', text: 'SAVE' });
  const resetBtn = el('button', { id: 'fn-reset', className: 'btn', type: 'button', text: 'RESET DEFAULT' });
  const clearBtn = el('button', { id: 'fn-clear', className: 'btn btn--mini', type: 'button', text: 'CLEAR' });
  const calls = el('div', { id: 'fn-calls', className: 'fn-calls' });
  const empty = el('p', { id: 'fn-calls-empty', className: 'fn-note', text: 'NO CALLS YET' });

  const detail = el(
    'section',
    { id: 'fn-detail', className: 'fn-detail', hidden: true },
    detailTitle,
    el('p', {
      className: 'fn-note',
      text: 'SENT AS THE SYSTEM MESSAGE. LIVE CONTEXT (SITE, ROOM, CURRENT SPACE, PLACED OBJECTS) IS APPENDED AUTOMATICALLY AT CALL TIME.',
    }),
    prompt,
    el('div', { className: 'fn-detail__actions' }, saveBtn, resetBtn),
    status,
    el('div', { className: 'fn-calls__head' }, el('h4', { className: 'fn-calls__title', text: 'CALL HISTORY' }), clearBtn),
    calls,
    empty
  );

  const panel = el(
    'aside',
    { id: 'functions-panel', role: 'dialog', 'aria-label': 'FUNCTION CALLS', hidden: true },
    el('div', { className: 'fn-panel__head' }, el('span', { className: 'fn-panel__title', text: 'FUNCTIONS' }), closeBtn),
    list,
    detail
  );
  host.appendChild(panel);

  const rendered = new Map();

  function paintRows() {
    for (const fn of FUNCTIONS) {
      const { row, badge } = rows.get(fn.id);
      const saved = Boolean(store.getFunctionPrompt(fn.id));
      badge.hidden = !saved;
      row.dataset.custom = String(saved);
      const active = fn.id === currentId && !panel.hidden;
      row.dataset.active = String(active);
      row.setAttribute('aria-expanded', String(active));
    }
  }

  function applyExpansion() {
    for (const [id, nodes] of rendered) {
      const open = id === expandedCallId;
      nodes.body.hidden = !open;
      nodes.row.dataset.open = String(open);
      nodes.head.setAttribute('aria-expanded', String(open));
      nodes.chevron.textContent = open ? '−' : '+';
    }
  }

  function callRow(call) {
    const chevron = el('span', { className: 'fn-call__chevron', text: '+' });
    const head = el(
      'button',
      { className: 'fn-call__head', type: 'button', dataset: { status: call.status }, 'aria-expanded': 'false' },
      el('span', { className: 'fn-call__dot' }),
      el('span', { className: 'fn-call__status', text: STATUS_LABEL[call.status] ?? String(call.status).toUpperCase() }),
      el('span', { className: 'fn-call__time', text: timeLabel(call.at) }),
      el('span', { className: 'fn-call__summary', text: summaryOf(call) }),
      chevron
    );
    const body = el(
      'div',
      { className: 'fn-call__body', hidden: true },
      el('div', { className: 'fn-call__label', text: 'FINAL PROMPT SENT' }),
      el('pre', { className: 'fn-call__prompt', text: promptText(call) }),
      call.message ? el('p', { className: 'fn-call__error', text: call.message }) : null,
      el('div', { className: 'fn-call__label', text: 'REPLY' }),
      el('pre', { className: 'fn-call__reply', text: call.reply || 'NO TEXT RECEIVED' })
    );
    const row = el('div', { className: 'fn-call', dataset: { id: call.id, status: call.status } }, head, body);
    head.addEventListener('click', () => {
      expandedCallId = expandedCallId === call.id ? null : call.id;
      applyExpansion();
    });
    return { row, head, body, chevron };
  }

  function renderCalls() {
    clear(calls);
    rendered.clear();
    const entries = currentId ? store.callsFor(currentId) : [];
    for (const call of entries) {
      const nodes = callRow(call);
      calls.appendChild(nodes.row);
      rendered.set(call.id, nodes);
    }
    empty.hidden = entries.length > 0;
    clearBtn.disabled = !entries.length;
    applyExpansion();
  }

  function select(id) {
    const fn = functionFor(id);
    if (!fn) return;
    currentId = fn.id;
    expandedCallId = null;
    dirty = false;
    detailTitle.textContent = `${fn.command.toUpperCase()} — ${fn.label}`;
    prompt.value = store.getFunctionPrompt(fn.id) ?? defaultPromptFor(fn.id);
    status.textContent = '';
    status.dataset.state = 'muted';
    detail.hidden = false;
    paintRows();
    renderCalls();
  }

  prompt.addEventListener('input', () => {
    dirty = true;
  });

  saveBtn.addEventListener('click', () => {
    if (!currentId) return;
    store.setFunctionPrompt(currentId, prompt.value);
    const saved = store.getFunctionPrompt(currentId);
    prompt.value = saved ?? defaultPromptFor(currentId);
    dirty = false;
    status.textContent = saved ? 'SAVED — SENT AS THE SYSTEM MESSAGE ON THE NEXT CALL' : 'EMPTY — THE DEFAULT PROMPT IS USED AGAIN';
    status.dataset.state = 'ok';
  });

  resetBtn.addEventListener('click', () => {
    if (!currentId) return;
    store.setFunctionPrompt(currentId, '');
    prompt.value = defaultPromptFor(currentId);
    dirty = false;
    status.textContent = 'RESET TO THE DEFAULT PROMPT';
    status.dataset.state = 'ok';
  });

  clearBtn.addEventListener('click', () => {
    if (!currentId) return;
    expandedCallId = null;
    store.clearCalls(currentId);
  });

  function close() {
    panel.hidden = true;
    paintRows();
  }

  closeBtn.addEventListener('click', close);

  for (const type of ['pointerdown', 'wheel']) {
    panel.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
  }
  panel.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });

  store.subscribe((state, reason) => {
    if (reason === 'calls') {
      if (!panel.hidden && currentId) renderCalls();
      return;
    }
    if (reason !== 'functions') return;
    paintRows();
    if (dirty || !currentId) return;
    prompt.value = store.getFunctionPrompt(currentId) ?? defaultPromptFor(currentId);
  });

  paintRows();

  return {
    el: panel,
    open(fnId = null) {
      panel.hidden = false;
      select(fnId ?? currentId);
      paintRows();
    },
    close,
    isOpen() {
      return !panel.hidden;
    },
    current() {
      return currentId;
    },
  };
}
