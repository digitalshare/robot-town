import { el, clear } from './dom.js';
import { OBJECT_TYPES, searchTypes, sizeLabel } from '../interior/objectTypes.js';
import { partFromType } from '../interior/spaceSpec.js';

export function createObjectsTab({ townStore, interiorView, onDesign, onSelect }) {
  const search = el('input', {
    id: 'objects-search',
    className: 'field__input',
    type: 'search',
    placeholder: 'SEARCH OBJECT TYPES…',
    'aria-label': 'Search object types',
  });
  const count = el('span', { id: 'objects-count', className: 'objects__count', text: `${OBJECT_TYPES.length} OF ${OBJECT_TYPES.length}` });
  const status = el('p', { id: 'objects-status', className: 'objects__status', dataset: { status: 'ok' } });
  const list = el('div', { id: 'objects-list', className: 'objects-list' });
  const roomTitle = el('h2', { id: 'objects-room-title', className: 'settings__heading', text: 'IN THIS ROOM' });
  const roomList = el('div', { id: 'objects-room', className: 'objects-room' });
  const designBtn = el('button', { id: 'objects-design', className: 'btn', text: 'DESIGN WITH AI' });
  const section = el(
    'section',
    { id: 'tab-objects', className: 'menu-tabpanel', role: 'tabpanel', 'aria-labelledby': 'tab-btn-objects', hidden: true },
    el('h2', { className: 'settings__heading', text: 'OBJECT LIBRARY' }),
    el('div', { className: 'objects__head' }, search, count),
    status,
    list,
    roomTitle,
    roomList,
    designBtn
  );

  let query = '';

  function say(kind, text) {
    status.dataset.status = kind;
    status.textContent = text;
  }

  function card(type) {
    const create = el('button', {
      className: 'btn btn--mini',
      dataset: { act: 'create', kind: type.kind },
      text: 'CREATE IN SPACE',
      disabled: !interiorView.isActive(),
      onclick: () => place(type),
    });
    return el(
      'article',
      { className: 'object-card', dataset: { kind: type.kind } },
      el(
        'div',
        { className: 'object-card__head' },
        el('span', { className: 'object-card__name', text: type.name }),
        el('span', { className: 'object-card__cat', text: type.cat })
      ),
      el('p', { className: 'object-card__desc', text: type.description }),
      el('div', { className: 'object-card__meta', text: `${type.kind} · ${sizeLabel(type)}` }),
      el('div', { className: 'object-card__actions' }, create)
    );
  }

  function place(type) {
    const record = interiorView.current();
    if (!record) {
      say('error', 'ENTER A BUILDING FIRST');
      return;
    }
    const part = partFromType(type, 0, 0);
    const spot = interiorView.freeSpotFor(part, 0);
    if (!spot) {
      say('error', `NO FREE FLOOR SPACE IN ${record.name} FOR THAT OBJECT`);
      return;
    }
    const added = townStore.addObject(record.id, { name: type.name, part: { ...part, pos: spot }, rot: 0 });
    if (!added.ok) {
      say('error', added.errors[0]);
      return;
    }
    say('ok', `${type.name} ADDED TO ${record.name}`);
    onSelect?.(added.id);
  }

  function row(entry) {
    const pos = entry.part.pos;
    return el(
      'div',
      { className: 'object-row', dataset: { id: entry.id } },
      el(
        'div',
        { className: 'object-row__text' },
        el('span', { className: 'object-row__name', text: entry.name }),
        el('span', {
          className: 'object-row__meta',
          text: `${entry.part.kind} · X ${pos[0].toFixed(2)} · Z ${pos[2].toFixed(2)} · ROT ${entry.rot}`,
        })
      ),
      el('button', {
        className: 'btn btn--mini',
        dataset: { act: 'select', id: entry.id },
        text: 'SELECT',
        onclick: () => onSelect?.(entry.id),
      })
    );
  }

  function renderList() {
    const shown = searchTypes(query);
    count.textContent = `${shown.length} OF ${OBJECT_TYPES.length}`;
    clear(list);
    for (const type of shown) list.appendChild(card(type));
    if (!shown.length) list.appendChild(el('p', { className: 'objects__empty', text: 'NO OBJECT TYPES MATCH THAT SEARCH.' }));
  }

  function renderRoom() {
    const record = interiorView.current();
    const entries = record ? townStore.getObjects(record.id) : [];
    roomTitle.textContent = record ? `IN ${record.name}` : 'IN THIS ROOM';
    designBtn.disabled = !record;
    clear(roomList);
    if (!record) {
      roomList.appendChild(el('p', { className: 'objects__empty', text: 'ENTER A BUILDING TO PLACE OBJECTS.' }));
      return;
    }
    if (!entries.length) {
      roomList.appendChild(el('p', { className: 'objects__empty', text: 'NO OBJECTS IN THIS ROOM YET.' }));
      return;
    }
    for (const entry of entries) roomList.appendChild(row(entry));
  }

  function refresh() {
    renderList();
    renderRoom();
  }

  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    renderList();
  });

  designBtn.addEventListener('click', () => {
    const record = interiorView.current();
    if (!record) return;
    onDesign?.(record);
  });

  townStore.subscribe((state, reason) => {
    if (reason === 'object' || reason === 'space') renderRoom();
  });

  refresh();

  return {
    el: section,
    refresh,
    onShow() {
      status.textContent = '';
      refresh();
    },
    onHide() {
      status.textContent = '';
    },
  };
}
