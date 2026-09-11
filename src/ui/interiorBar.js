import { el } from './dom.js';

export function createInteriorBar({ host = document.body, onDesign, onAddObject, onExit } = {}) {
  let current = null;
  const name = el('div', { id: 'interior-name', className: 'interior-bar__name' });
  const state = el('div', { id: 'interior-state', className: 'interior-bar__state' });
  const design = el('button', {
    id: 'interior-design',
    className: 'btn btn--primary',
    text: 'DESIGN WITH AI',
    onclick: () => current && onDesign?.(current),
  });
  const addObject = el('button', {
    id: 'interior-add-object',
    className: 'btn',
    text: 'ADD OBJECT',
    onclick: () => current && onAddObject?.(current),
  });
  const exit = el('button', { id: 'interior-exit', className: 'btn', text: 'EXIT TO SECTOR', onclick: () => onExit?.() });
  const bar = el(
    'div',
    { id: 'interior-bar', role: 'status', 'aria-label': 'INDOOR SPACE', hidden: true },
    name,
    state,
    el('div', { className: 'interior-bar__actions' }, design, addObject, exit)
  );
  host.appendChild(bar);

  function render(rec, designed, objects) {
    name.textContent = rec.name;
    const base = designed ? 'AI-DESIGNED SPACE' : 'GENERATED SHELL — NOT DESIGNED YET';
    const count = Math.max(0, Math.trunc(Number(objects) || 0));
    state.textContent = count ? `${base} · ${count} OBJECT${count === 1 ? '' : 'S'}` : base;
    state.dataset.designed = designed ? 'yes' : 'no';
  }

  return {
    el: bar,
    show(rec, designed, objects = 0) {
      current = rec;
      render(rec, designed, objects);
      bar.hidden = false;
    },
    setState(designed, objects = 0) {
      if (current) render(current, designed, objects);
    },
    hide() {
      current = null;
      bar.hidden = true;
    },
    isVisible() {
      return !bar.hidden;
    },
  };
}
