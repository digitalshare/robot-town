import { el, clear } from './dom.js';
import { BUILDINGS, SECTOR } from '../data/layout.js';

export function createGalleryTab({ townStore, onLocate }) {
  const search = el('input', {
    id: 'gallery-search',
    className: 'field__input',
    type: 'search',
    placeholder: 'SEARCH BUILDINGS…',
    'aria-label': 'Search buildings',
  });
  const count = el('span', { id: 'gallery-count', className: 'gallery__count', text: '0 OF 0' });
  const list = el('div', { id: 'gallery-list', className: 'gallery-list' });
  const section = el(
    'section',
    { id: 'tab-gallery', className: 'menu-tabpanel', role: 'tabpanel', 'aria-labelledby': 'tab-btn-gallery', hidden: true },
    el('h2', { className: 'settings__heading', text: 'BUILDING GALLERY' }),
    el('div', { className: 'gallery__head' }, search, count),
    list
  );

  let query = '';
  let pendingRemove = null;

  function entries() {
    const state = townStore.getState();
    const out = BUILDINGS.map((b) => ({
      key: b.id,
      name: b.name,
      description: b.description,
      badge: SECTOR.label,
      meta: `X ${b.x} · Z ${b.z} · ${b.footprint[0]} × ${b.footprint[1]}`,
      x: b.x,
      z: b.z,
      custom: false,
      placementId: null,
    }));
    for (const p of state.placements) {
      const entry = state.library.find((e) => e.id === p.libraryId);
      if (!entry) continue;
      out.push({
        key: p.id,
        name: entry.name,
        description: entry.description,
        badge: 'CUSTOM',
        meta: `X ${p.x} · Z ${p.z} · ${p.footprint[0]} × ${p.footprint[1]}`,
        x: p.x,
        z: p.z,
        custom: true,
        placementId: p.id,
      });
    }
    return out;
  }

  function matches(entry) {
    if (!query) return true;
    return `${entry.name} ${entry.description} ${entry.badge}`.toLowerCase().includes(query);
  }

  function card(entry) {
    const actions = [
      el('button', {
        className: 'btn btn--mini',
        dataset: { act: 'locate' },
        text: 'LOCATE',
        onclick: () => onLocate?.(entry.x, entry.z),
      }),
    ];
    if (entry.custom) {
      const remove = el('button', { className: 'btn btn--mini', dataset: { act: 'remove' }, text: 'REMOVE' });
      remove.addEventListener('click', () => {
        if (pendingRemove !== entry.placementId) {
          pendingRemove = entry.placementId;
          remove.textContent = 'CONFIRM?';
          return;
        }
        pendingRemove = null;
        townStore.removePlacement(entry.placementId);
      });
      actions.push(remove);
    }
    return el(
      'article',
      { className: 'gallery-card', dataset: { custom: String(entry.custom), key: entry.key } },
      el(
        'div',
        { className: 'gallery-card__head' },
        el('span', { className: 'gallery-card__name', text: entry.name }),
        el('span', { className: 'gallery-card__badge', dataset: { custom: String(entry.custom) }, text: entry.badge })
      ),
      el('p', { className: 'gallery-card__desc', text: entry.description || 'No description recorded.' }),
      el('div', { className: 'gallery-card__meta', text: entry.meta }),
      el('div', { className: 'gallery-card__actions' }, actions)
    );
  }

  function render() {
    const all = entries();
    const shown = all.filter(matches);
    count.textContent = `${shown.length} OF ${all.length}`;
    clear(list);
    for (const entry of shown) list.appendChild(card(entry));
    if (!shown.length) {
      list.appendChild(
        el('p', { className: 'gallery__empty', text: query ? 'NO BUILDINGS MATCH THAT SEARCH.' : 'NO BUILDINGS YET.' })
      );
    }
  }

  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    render();
  });

  townStore.subscribe((state, reason) => {
    if (reason === 'building' || reason === 'placement' || reason === 'expand') render();
  });

  render();

  return {
    el: section,
    onShow() {
      render();
    },
    onHide() {
      pendingRemove = null;
    },
  };
}
