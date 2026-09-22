import { el } from './dom.js';
import { MAT } from '../materials/palette.js';
import { ACCENTS, typeForRobot, MIN_ROBOT_SCALE, MAX_ROBOT_SCALE } from '../interior/robotTypes.js';
import { robotLimits } from '../interior/spaceSpec.js';

export function createRobotPanel({ townStore, interiorView, onFirstPerson, onChat, onClose, host = document.body } = {}) {
  let current = null;
  let draft = null;
  let pendingRemove = false;

  const name = el('input', {
    id: 'robot-name',
    className: 'object-field__input',
    type: 'text',
    maxlength: '40',
    'aria-label': 'Robot name',
  });
  const typeBadge = el('span', { id: 'robot-type', className: 'robot-panel__badge' });
  const close = el('button', { id: 'robot-close', className: 'robot-panel__close', 'aria-label': 'Close robot panel', text: '×' });
  const hint = el('p', { id: 'robot-hint', className: 'robot-panel__hint', hidden: true });
  const error = el('p', { id: 'robot-error', className: 'robot-panel__error', role: 'status' });

  const accents = el('div', { id: 'robot-accents', className: 'object-swatches' });
  const swatches = ACCENTS.map((key) => {
    const swatch = el('button', {
      className: 'object-swatch',
      type: 'button',
      dataset: { accent: key },
      title: key,
      'aria-label': key,
    });
    swatch.style.background = `#${MAT[key].color.getHexString()}`;
    swatch.addEventListener('click', () => {
      if (!draft) return;
      draft.accent = key;
      paintAccents();
    });
    accents.appendChild(swatch);
    return swatch;
  });

  const scale = el('input', {
    id: 'robot-scale',
    className: 'object-field__range',
    type: 'range',
    min: String(MIN_ROBOT_SCALE),
    max: String(MAX_ROBOT_SCALE),
    step: '0.05',
    value: '1',
    'aria-label': 'Robot scale',
  });
  const scaleValue = el('span', { id: 'robot-scale-value', className: 'object-field__value', text: '1.00×' });

  const wander = el('input', { id: 'robot-wander', type: 'checkbox', 'aria-label': 'Wander the room' });
  const wanderState = el('span', { id: 'robot-wander-state', className: 'object-field__value', text: 'ON' });

  const posX = el('input', {
    id: 'robot-x',
    className: 'object-field__input object-field__input--num',
    type: 'number',
    step: '0.1',
    'aria-label': 'Home position X',
  });
  const posZ = el('input', {
    id: 'robot-z',
    className: 'object-field__input object-field__input--num',
    type: 'number',
    step: '0.1',
    'aria-label': 'Home position Z',
  });

  const rot = el('input', {
    id: 'robot-rot',
    className: 'object-field__range',
    type: 'range',
    min: '0',
    max: '355',
    step: '5',
    value: '0',
    'aria-label': 'Robot rotation',
  });
  const rotValue = el('span', { id: 'robot-rot-value', className: 'object-field__value', text: '0°' });

  const save = el('button', { id: 'robot-save', className: 'btn btn--primary', text: 'SAVE' });
  const chat = el('button', { id: 'robot-chat', className: 'btn', text: 'CHAT' });
  const firstPerson = el('button', { id: 'robot-first-person', className: 'btn', text: 'FIRST PERSON' });
  const remove = el('button', { id: 'robot-remove', className: 'btn', text: 'DELETE' });

  const panel = el(
    'aside',
    { id: 'robot-panel', role: 'dialog', 'aria-label': 'ROBOT INSPECTOR', hidden: true },
    el('div', { className: 'robot-panel__head' }, name, typeBadge, close),
    hint,
    el(
      'div',
      { className: 'robot-panel__body' },
      el('div', { className: 'object-field' }, el('label', { className: 'object-field__label', text: 'ACCENT' }), accents),
      el(
        'div',
        { className: 'object-field' },
        el('label', { className: 'object-field__label', text: 'SCALE' }),
        el('div', { className: 'object-field__row' }, scale, scaleValue)
      ),
      el(
        'div',
        { className: 'object-field' },
        el('label', { className: 'object-field__label', for: 'robot-wander', text: 'WANDER' }),
        el('div', { className: 'object-field__row' }, wander, wanderState)
      ),
      el(
        'div',
        { className: 'object-field' },
        el('label', { className: 'object-field__label', text: 'HOME POSITION' }),
        el(
          'div',
          { className: 'object-field__row' },
          el('label', { className: 'object-field__cell' }, el('span', { className: 'object-field__label', text: 'X' }), posX),
          el('label', { className: 'object-field__cell' }, el('span', { className: 'object-field__label', text: 'Z' }), posZ)
        )
      ),
      el(
        'div',
        { className: 'object-field' },
        el('label', { className: 'object-field__label', text: 'ROTATION' }),
        el('div', { className: 'object-field__row' }, rot, rotValue)
      )
    ),
    error,
    el('div', { className: 'robot-panel__actions' }, chat, firstPerson, save, remove)
  );
  host.appendChild(panel);

  function paintAccents() {
    for (const swatch of swatches) swatch.dataset.active = String(draft?.accent === swatch.dataset.accent);
  }

  function renderLimits() {
    const limits = robotLimits(current.room, draft.scale);
    for (const [input, max] of [
      [posX, limits.x],
      [posZ, limits.z],
    ]) {
      input.min = String(-max);
      input.max = String(max);
    }
  }

  function render() {
    draft = {
      name: current.entry.name,
      accent: current.entry.accent,
      scale: current.entry.scale,
      wander: current.entry.wander,
      pos: [...current.entry.pos],
      rot: current.entry.rot ?? 0,
    };
    name.value = draft.name;
    typeBadge.textContent = typeForRobot(current.entry.type).name;
    scale.value = String(draft.scale);
    scaleValue.textContent = `${draft.scale.toFixed(2)}×`;
    wander.checked = draft.wander;
    wanderState.textContent = draft.wander ? 'ON' : 'OFF';
    posX.value = String(draft.pos[0]);
    posZ.value = String(draft.pos[1]);
    rot.value = String(draft.rot);
    rotValue.textContent = `${draft.rot}°`;
    hint.textContent = `${current.record.name} · ${current.room.w} × ${current.room.d} · ${current.entry.origin.toUpperCase()}`;
    hint.hidden = false;
    error.textContent = '';
    pendingRemove = false;
    remove.textContent = 'DELETE';
    paintAccents();
    renderLimits();
  }

  name.addEventListener('input', () => {
    draft.name = name.value;
  });

  scale.addEventListener('input', () => {
    draft.scale = Number(scale.value);
    scaleValue.textContent = `${draft.scale.toFixed(2)}×`;
    renderLimits();
  });

  wander.addEventListener('change', () => {
    draft.wander = wander.checked;
    wanderState.textContent = draft.wander ? 'ON' : 'OFF';
  });

  posX.addEventListener('input', () => {
    const value = Number(posX.value);
    if (Number.isFinite(value)) draft.pos = [value, draft.pos[1]];
  });

  posZ.addEventListener('input', () => {
    const value = Number(posZ.value);
    if (Number.isFinite(value)) draft.pos = [draft.pos[0], value];
  });

  rot.addEventListener('input', () => {
    draft.rot = Number(rot.value);
    rotValue.textContent = `${draft.rot}°`;
  });

  save.addEventListener('click', () => {
    if (!current?.entry?.id || !draft) return;
    const result = townStore.updateRobot(current.entry.id, {
      name: draft.name,
      accent: draft.accent,
      scale: draft.scale,
      wander: draft.wander,
      pos: draft.pos,
      rot: draft.rot,
    });
    error.textContent = result.ok ? '' : result.errors[0];
  });

  remove.addEventListener('click', () => {
    if (!current?.entry?.id) return;
    if (!pendingRemove) {
      pendingRemove = true;
      remove.textContent = 'CONFIRM?';
      return;
    }
    townStore.removeRobot(current.entry.id);
  });

  firstPerson.addEventListener('click', () => {
    if (current) onFirstPerson?.(current);
  });

  chat.addEventListener('click', () => {
    if (current) onChat?.(current);
  });

  close.addEventListener('click', () => {
    interiorView.selectRobot(null);
    onClose?.();
    hide();
  });

  for (const type of ['pointerdown', 'wheel', 'keydown']) {
    panel.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
  }

  function hide() {
    current = null;
    draft = null;
    pendingRemove = false;
    panel.hidden = true;
  }

  return {
    el: panel,
    show(target) {
      current = target;
      render();
      panel.hidden = false;
    },
    hide,
    isVisible() {
      return !panel.hidden;
    },
    current() {
      return current;
    },
  };
}
