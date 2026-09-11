import { el, clear } from './dom.js';
import { MAT } from '../materials/palette.js';
import { MATERIAL_KEYS } from '../buildings/spec.js';
import { OBJECT_TYPES, typeFor } from '../interior/objectTypes.js';
import { shapeInfo, takesMaterial, defaultMat, partFromType, restY } from '../interior/spaceSpec.js';

const GROUPS = new Map();
for (const type of OBJECT_TYPES) {
  if (!GROUPS.has(type.cat)) GROUPS.set(type.cat, []);
  GROUPS.get(type.cat).push(type);
}

function readField(part, key) {
  const [head, index] = key.split('.');
  return index === undefined ? part[head] : part[head]?.[Number(index)];
}

function writeField(part, key, value) {
  const [head, index] = key.split('.');
  if (index === undefined) {
    part[head] = value;
    return;
  }
  const list = Array.isArray(part[head]) ? [...part[head]] : [];
  list[Number(index)] = value;
  part[head] = list;
}

export function createObjectPanel({ townStore, interiorView, onReference, host = document.body } = {}) {
  let current = null;
  let draft = null;
  let pendingRemove = false;

  const name = el('input', {
    id: 'object-name',
    className: 'object-field__input',
    type: 'text',
    maxlength: '40',
    'aria-label': 'Object name',
  });
  const kindBadge = el('span', { id: 'object-kind', className: 'object-panel__badge' });
  const close = el('button', { id: 'object-close', className: 'object-panel__close', 'aria-label': 'Close inspector', text: '×' });
  const pos = el('div', { id: 'object-pos', className: 'object-panel__pos' });
  const hint = el('p', { id: 'object-hint', className: 'object-panel__hint', hidden: true });
  const error = el('p', { id: 'object-error', className: 'object-panel__error', role: 'status' });

  const shape = el('select', { id: 'object-shape', className: 'object-field__input', 'aria-label': 'Object shape' });
  for (const [cat, types] of GROUPS) {
    shape.appendChild(
      el('optgroup', { label: cat }, types.map((t) => el('option', { value: t.kind, text: t.name })))
    );
  }

  const sizeRow = el('div', { id: 'object-size', className: 'object-field__row' });
  const mats = el('div', { id: 'object-mats', className: 'object-swatches' });
  const swatches = MATERIAL_KEYS.map((key) => {
    const swatch = el('button', {
      className: 'object-swatch',
      type: 'button',
      dataset: { mat: key },
      title: key,
      'aria-label': key,
    });
    swatch.style.background = `#${MAT[key].color.getHexString()}`;
    swatch.addEventListener('click', () => {
      if (!draft || !takesMaterial(draft.part.kind)) return;
      draft.part.mat = key;
      paintMats();
    });
    mats.appendChild(swatch);
    return swatch;
  });

  const rot = el('input', {
    id: 'object-rot',
    className: 'object-field__range',
    type: 'range',
    min: '0',
    max: '355',
    step: '5',
    value: '0',
    'aria-label': 'Object rotation',
  });
  const rotValue = el('span', { id: 'object-rot-value', className: 'object-field__value', text: '0°' });

  const save = el('button', { id: 'object-save', className: 'btn btn--primary', text: 'SAVE' });
  const reference = el('button', { id: 'object-reference', className: 'btn', text: 'USE AS AI REFERENCE' });
  const remove = el('button', { id: 'object-remove', className: 'btn', text: 'REMOVE' });

  const panel = el(
    'aside',
    { id: 'object-panel', role: 'dialog', 'aria-label': 'OBJECT INSPECTOR', hidden: true },
    el('div', { className: 'object-panel__head' }, name, kindBadge, close),
    pos,
    hint,
    el(
      'div',
      { className: 'object-panel__body' },
      el('div', { className: 'object-field' }, el('label', { className: 'object-field__label', text: 'SHAPE' }), shape),
      el('div', { className: 'object-field' }, el('label', { className: 'object-field__label', text: 'SIZE' }), sizeRow),
      el('div', { className: 'object-field' }, el('label', { className: 'object-field__label', text: 'MATERIAL' }), mats),
      el(
        'div',
        { className: 'object-field' },
        el('label', { className: 'object-field__label', text: 'ROTATION' }),
        el('div', { className: 'object-field__row' }, rot, rotValue)
      )
    ),
    error,
    el('div', { className: 'object-panel__actions' }, save, reference, remove)
  );
  host.appendChild(panel);

  function renderPos() {
    const [x, y, z] = draft.part.pos;
    pos.textContent = `X ${x.toFixed(2)} · Y ${y.toFixed(2)} · Z ${z.toFixed(2)}`;
  }

  function paintMats() {
    const takes = takesMaterial(draft.part.kind);
    mats.hidden = !takes;
    for (const swatch of swatches) swatch.dataset.active = String(takes && draft.part.mat === swatch.dataset.mat);
  }

  function renderSize() {
    const info = shapeInfo(draft.part.kind, current.room);
    clear(sizeRow);
    for (const field of info.fields) {
      const input = el('input', {
        className: 'object-field__input object-field__input--num',
        type: 'number',
        dataset: { key: field.key },
        min: String(field.min),
        max: String(field.max),
        step: String(field.step ?? 0.1),
        value: String(readField(draft.part, field.key) ?? ''),
        'aria-label': field.label,
      });
      input.addEventListener('input', () => {
        const value = Number(input.value);
        if (!Number.isFinite(value)) return;
        const part = draft.part;
        const wasResting = Math.abs(part.pos[1] - restY(part.kind, part)) < 0.02;
        writeField(part, field.key, value);
        if (wasResting) part.pos = [part.pos[0], restY(part.kind, part), part.pos[2]];
        renderPos();
      });
      sizeRow.appendChild(el('label', { className: 'object-field__cell' }, el('span', { className: 'object-field__label', text: field.label }), input));
    }
    sizeRow.parentElement.hidden = info.fields.length === 0;
  }

  function render() {
    draft = {
      name: current.entry.name,
      part: { ...current.entry.part, pos: [...current.entry.part.pos] },
      rot: current.entry.rot ?? 0,
    };
    if (Array.isArray(draft.part.size)) draft.part.size = [...draft.part.size];
    name.value = draft.name;
    kindBadge.textContent = draft.part.kind.toUpperCase();
    shape.value = draft.part.kind;
    rot.value = String(draft.rot);
    rotValue.textContent = `${draft.rot}°`;
    hint.textContent = `${current.record.name} · ${current.room.w} × ${current.room.d}`;
    hint.hidden = false;
    error.textContent = '';
    pendingRemove = false;
    remove.textContent = 'REMOVE';
    renderSize();
    paintMats();
    renderPos();
  }

  shape.addEventListener('change', () => {
    const type = typeFor(shape.value);
    if (!type || !draft) return;
    const part = partFromType(type, draft.part.pos[0], draft.part.pos[2]);
    if (takesMaterial(type.kind) && MATERIAL_KEYS.includes(draft.part.mat)) part.mat = draft.part.mat;
    else if (takesMaterial(type.kind)) part.mat = defaultMat(type.kind);
    draft.part = part;
    kindBadge.textContent = part.kind.toUpperCase();
    error.textContent = '';
    renderSize();
    paintMats();
    renderPos();
  });

  rot.addEventListener('input', () => {
    draft.rot = Number(rot.value);
    rotValue.textContent = `${draft.rot}°`;
  });

  name.addEventListener('input', () => {
    draft.name = name.value;
  });

  save.addEventListener('click', () => {
    if (!current?.entry?.id || !draft) return;
    const result = townStore.updateObject(current.entry.id, { name: draft.name, part: draft.part, rot: draft.rot });
    if (!result.ok) {
      error.textContent = result.errors[0];
      return;
    }
    error.textContent = '';
  });

  reference.addEventListener('click', () => {
    if (current?.entry?.id) onReference?.(current.entry, current.record);
  });

  remove.addEventListener('click', () => {
    if (!current?.entry?.id) return;
    if (!pendingRemove) {
      pendingRemove = true;
      remove.textContent = 'CONFIRM?';
      return;
    }
    townStore.removeObject(current.entry.id);
  });

  close.addEventListener('click', () => {
    interiorView.select(null);
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
    setPos(x, z) {
      if (!draft) return;
      draft.part.pos = [x, draft.part.pos[1], z];
      renderPos();
    },
  };
}
