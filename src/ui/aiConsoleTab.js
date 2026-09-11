import { el, clear, renderStatus } from './dom.js';

function msgNode(role) {
  const text = el('div', { className: 'msg__text' });
  const node = el(
    'div',
    { className: 'msg msg--' + role },
    el('span', { className: 'msg__role', text: role === 'user' ? 'YOU' : 'AI' }),
    text
  );
  return { node, text };
}

export function createAiConsoleTab({ store, session, onConfigure }) {
  const modelLabel = el('span', { id: 'console-model', className: 'console__model', text: 'NO MODEL CONFIGURED' });
  const toggle = el(
    'button',
    { id: 'console-toggle', className: 'console__header', 'aria-expanded': 'true', 'aria-controls': 'console-body' },
    el('span', { className: 'console__title', text: 'AI DIALOG' }),
    modelLabel,
    el('span', { className: 'console__chevron', text: '▾' })
  );

  const emptyText = el('p', { className: 'chat-empty__text' });
  const gotoSettings = el('button', { id: 'chat-goto-settings', className: 'btn', text: 'OPEN MODEL CONFIG' });
  const empty = el('div', { id: 'chat-empty', className: 'chat-empty' }, emptyText, gotoSettings);
  const log = el('div', { id: 'chat-log', className: 'chat-log', role: 'log', 'aria-live': 'polite' });
  const status = el('div', { id: 'chat-status', className: 'chat-status', dataset: { status: 'idle' }, 'aria-live': 'polite' });

  const refText = el('span', { id: 'chat-site-text', className: 'chat-site__text' });
  const refClear = el('button', { id: 'chat-site-clear', className: 'btn btn--mini', text: 'CLEAR SITE' });
  const refBanner = el('div', { id: 'chat-site', className: 'chat-site', hidden: true }, refText, refClear);

  const input = el('textarea', {
    id: 'chat-input',
    rows: '1',
    placeholder: 'ASK ABOUT THE TOWN — OR /BUILDING · /SPACE · /OBJECT <YOUR IDEA>',
  });
  const sendBtn = el('button', { id: 'chat-send', className: 'btn btn--primary', text: 'SEND', disabled: true });
  const stopBtn = el('button', { id: 'chat-stop', className: 'btn', text: 'STOP', hidden: true });
  const clearBtn = el('button', { id: 'chat-clear', className: 'btn', text: 'CLEAR' });

  const body = el(
    'div',
    { id: 'console-body', className: 'console__body' },
    refBanner,
    empty,
    log,
    status,
    el('div', { className: 'chat-input' }, input, sendBtn, stopBtn, clearBtn)
  );

  const consoleBox = el('div', { className: 'console', dataset: { collapsed: 'false' } }, toggle, body);
  const section = el(
    'section',
    { id: 'tab-ai', className: 'menu-tabpanel', role: 'tabpanel', 'aria-labelledby': 'tab-btn-ai' },
    consoleBox
  );

  function activeModel() {
    const p = store.getActiveProvider();
    return p && p.model ? p : null;
  }

  function refreshModelLabel() {
    const p = store.getActiveProvider();
    modelLabel.textContent = p && p.model ? p.model + ' · ' + p.name : 'NO MODEL CONFIGURED';
  }

  function refreshEmpty() {
    const hasHistory = session.history.length > 0;
    empty.hidden = hasHistory;
    log.hidden = !hasHistory;
    if (hasHistory) return;
    const providers = store.getState().providers;
    const ready = !!activeModel();
    if (!providers.length) {
      emptyText.textContent = 'NO MODEL CONFIGURED — ADD A PROVIDER TO ENABLE THE AI CONSOLE.';
      gotoSettings.hidden = false;
    } else if (!ready) {
      emptyText.textContent = 'PROVIDER NOT CONNECTED — TEST THE CONNECTION AND SELECT A MODEL IN SETTINGS.';
      gotoSettings.hidden = false;
    } else {
      emptyText.textContent = 'NO MESSAGES YET — ASK ABOUT THE TOWN.';
      gotoSettings.hidden = true;
    }
  }

  function refreshSend() {
    sendBtn.disabled = session.streaming || !activeModel();
  }

  function renderLog() {
    clear(log);
    for (const m of session.history) {
      const { node, text } = msgNode(m.role);
      text.textContent = m.content;
      log.appendChild(node);
    }
    log.scrollTop = log.scrollHeight;
  }

  function nearBottom() {
    return log.scrollHeight - log.scrollTop - log.clientHeight < 48;
  }

  function setCollapsed(collapsed) {
    consoleBox.dataset.collapsed = String(collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    store.setUi({ consoleCollapsed: collapsed });
  }

  function setReference(ref) {
    const site = ref?.site;
    const object = ref?.object;
    const building = ref?.building;
    if (!site && !object && !building) {
      refBanner.hidden = true;
      refText.textContent = '';
      return;
    }
    if (site) {
      refText.textContent = `SITE ${site.x}, ${site.z} · PLOT ${site.plot[0]} × ${site.plot[1]}`;
      refClear.textContent = 'CLEAR SITE';
    } else if (object) {
      const kind = String(object.part?.kind ?? '').toUpperCase();
      refText.textContent = `OBJECT ${object.name} · ${kind} IN ${building?.name ?? 'THE ROOM'}`;
      refClear.textContent = 'CLEAR OBJECT';
    } else {
      refText.textContent = `BUILDING ${building.name} · ${building.footprint[0]} × ${building.footprint[1]} · ${building.badge}`;
      refClear.textContent = 'CLEAR BUILDING';
    }
    refBanner.hidden = false;
    if (consoleBox.dataset.collapsed === 'true') setCollapsed(false);
  }

  function showStatus({ kind, text }) {
    renderStatus(status, { kind, text });
  }

  toggle.addEventListener('click', () => {
    setCollapsed(consoleBox.dataset.collapsed !== 'true');
  });

  refClear.addEventListener('click', () => {
    session.setToolMode(null);
    setReference(null);
  });

  gotoSettings.addEventListener('click', () => onConfigure?.());

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 110) + 'px';
  }

  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  function send() {
    const text = input.value.trim();
    if (!text || session.streaming) return;
    input.value = '';
    autosize();
    renderStatus(status, { kind: 'idle', text: '' });

    const user = msgNode('user');
    user.text.textContent = text;
    const assistant = msgNode('assistant');
    assistant.node.classList.add('is-streaming');

    log.hidden = false;
    empty.hidden = true;
    log.appendChild(user.node);
    log.appendChild(assistant.node);
    log.scrollTop = log.scrollHeight;

    sendBtn.disabled = true;
    stopBtn.hidden = false;

    session.send(text, {
      onDelta: (t) => {
        const stick = nearBottom();
        assistant.text.textContent += t;
        if (stick) log.scrollTop = log.scrollHeight;
      },
      onEnd: ({ aborted }) => {
        assistant.node.classList.remove('is-streaming');
        if (aborted) assistant.node.appendChild(el('span', { className: 'msg__stopped', text: 'STOPPED' }));
        stopBtn.hidden = true;
        refreshSend();
      },
      onError: (err) => {
        assistant.node.classList.remove('is-streaming');
        if (!assistant.text.textContent) assistant.node.remove();
        renderStatus(status, { kind: 'error', text: err.message });
        stopBtn.hidden = true;
        refreshSend();
        refreshEmpty();
      },
    });
  }

  sendBtn.addEventListener('click', send);
  stopBtn.addEventListener('click', () => session.abort());
  clearBtn.addEventListener('click', () => {
    session.clear();
    renderStatus(status, { kind: 'idle', text: '' });
    renderLog();
    refreshEmpty();
  });

  store.subscribe((state, reason) => {
    if (reason === 'providers' || reason === 'active' || reason === 'model' || reason === 'test') {
      refreshModelLabel();
      refreshSend();
      refreshEmpty();
    }
  });

  setCollapsed(store.getState().ui.consoleCollapsed);
  refreshModelLabel();
  refreshSend();
  refreshEmpty();

  return {
    el: section,
    onShow() {
      renderLog();
      refreshEmpty();
      log.scrollTop = log.scrollHeight;
    },
    onHide() {
      input.blur();
    },
    focusInput() {
      input.focus();
    },
    prefill(text) {
      input.value = text;
      autosize();
      input.focus();
    },
    showStatus,
    setReference,
  };
}
