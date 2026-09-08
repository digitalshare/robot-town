import { el } from './dom.js';

export function createInteriorBar({ host = document.body, onDesign, onExit } = {}) {
  let current = null;
  const name = el('div', { id: 'interior-name', className: 'interior-bar__name' });
  const state = el('div', { id: 'interior-state', className: 'interior-bar__state' });
  const design = el('button', {
    id: 'interior-design',
    className: 'btn btn--primary',
    text: 'DESIGN WITH AI',
    onclick: () => current && onDesign?.(current),
  });
  const exit = el('button', { id: 'interior-exit', className: 'btn', text: 'EXIT TO SECTOR', onclick: () => onExit?.() });
  const bar = el(
    'div',
    { id: 'interior-bar', role: 'status', 'aria-label': 'INDOOR SPACE', hidden: true },
    name,
    state,
    el('div', { className: 'interior-bar__actions' }, design, exit)
  );
  host.appendChild(bar);

  function render(rec, designed) {
    name.textContent = rec.name;
    state.textContent = designed ? 'AI-DESIGNED SPACE' : 'GENERATED SHELL — NOT DESIGNED YET';
    state.dataset.designed = designed ? 'yes' : 'no';
  }

  return {
    el: bar,
    show(rec, designed) {
      current = rec;
      render(rec, designed);
      bar.hidden = false;
    },
    setState(designed) {
      if (current) render(current, designed);
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
