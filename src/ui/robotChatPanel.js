import { el, clear } from './dom.js';
import { chatWithRobot } from '../ai/robotAgent.js';

export function createRobotChatPanel({ host = document.body } = {}) {
  let robot = null;
  let controller = null;
  const messages = el('div', { className: 'robot-chat__messages', role: 'log', 'aria-live': 'polite' });
  const input = el('textarea', {
    className: 'robot-chat__input',
    rows: '2',
    maxlength: '2000',
    placeholder: 'TALK TO THIS ROBOT…',
    'aria-label': 'Message robot',
  });
  const send = el('button', { className: 'btn btn--primary robot-chat__send', type: 'submit', text: 'SEND' });
  const status = el('div', { className: 'robot-chat__status', role: 'status' });
  const close = el('button', { className: 'menu-icon-btn', type: 'button', 'aria-label': 'Close robot chat', text: '×' });
  const title = el('div', { className: 'robot-chat__title' });
  const form = el('form', { className: 'robot-chat__form' }, input, send);
  const panel = el(
    'aside',
    { id: 'robot-chat-panel', className: 'robot-chat', hidden: true, 'aria-label': 'Robot chat' },
    el('div', { className: 'robot-chat__head' }, title, close),
    messages,
    status,
    form
  );
  host.appendChild(panel);

  function addMessage(role, text) {
    messages.appendChild(el('div', { className: `robot-chat__message robot-chat__message--${role}` }, el('span', { className: 'robot-chat__role', text: role === 'user' ? 'YOU' : robot?.name ?? 'ROBOT' }), el('p', { text })));
    messages.scrollTop = messages.scrollHeight;
  }

  function setBusy(busy) {
    input.disabled = busy;
    send.disabled = busy;
    status.textContent = busy ? 'THINKING…' : '';
  }

  close.addEventListener('click', () => {
    controller?.abort();
    controller = null;
    panel.hidden = true;
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!robot || !input.value.trim() || controller) return;
    const text = input.value.trim();
    input.value = '';
    addMessage('user', text);
    controller = new AbortController();
    setBusy(true);
    try {
      const result = await chatWithRobot(robot, text, controller.signal);
      addMessage('robot', result.text);
    } catch (error) {
      if (error?.name !== 'AbortError') status.textContent = error?.message || 'CHAT CONNECTION FAILED';
    } finally {
      controller = null;
      setBusy(false);
      input.focus();
    }
  });

  return {
    show(target) {
      robot = { ...target.entry, building: target.record?.name ?? 'Robot Town' };
      title.textContent = `${robot.name} · PRIVATE MEMORY`;
      clear(messages);
      status.textContent = 'MEMORY READY';
      panel.hidden = false;
      input.focus();
    },
    hide() {
      controller?.abort();
      controller = null;
      panel.hidden = true;
    },
    isVisible() {
      return !panel.hidden;
    },
  };
}
