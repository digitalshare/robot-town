import { el } from './dom.js';

export function createConfirmBar({ host = document.body } = {}) {
  const label = el('span', { id: 'confirm-bar-label', className: 'confirm-bar__label' });
  const yes = el('button', { id: 'confirm-yes', className: 'btn btn--primary', text: 'ADD TO TOWN' });
  const no = el('button', { id: 'confirm-no', className: 'btn', text: 'DISCARD' });
  const bar = el(
    'div',
    { id: 'confirm-bar', className: 'confirm-bar', role: 'alertdialog', 'aria-label': 'BUILDING REVIEW', hidden: true },
    label,
    yes,
    no
  );
  host.appendChild(bar);

  let handlers = null;

  function hide() {
    handlers = null;
    bar.hidden = true;
  }

  yes.addEventListener('click', () => {
    const fn = handlers?.onYes;
    hide();
    fn?.();
  });
  no.addEventListener('click', () => {
    const fn = handlers?.onNo;
    hide();
    fn?.();
  });

  return {
    el: bar,
    show(text, { onYes, onNo, yesLabel, noLabel } = {}) {
      label.textContent = text;
      yes.textContent = yesLabel ?? 'ADD TO TOWN';
      no.textContent = noLabel ?? 'DISCARD';
      handlers = { onYes, onNo };
      bar.hidden = false;
    },
    hide,
    isVisible() {
      return !bar.hidden;
    },
  };
}
