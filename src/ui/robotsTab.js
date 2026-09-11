import { el, clear } from './dom.js';
import { BUILDINGS } from '../data/layout.js';
import { findBuildingRecord } from '../town/records.js';
import { ROBOT_TYPES } from '../interior/robotTypes.js';

export function createRobotsTab({ townStore, interiorView, onManage }) {
  const count = el('span', { id: 'robots-count', className: 'objects__count', text: '0 IN THE TOWN' });
  const status = el('p', { id: 'robots-status', className: 'objects__status', dataset: { status: 'ok' } });
  const list = el('div', { id: 'robots-list', className: 'objects-list' });
  const townTitle = el('h2', { id: 'robots-town-title', className: 'settings__heading', text: 'IN THE TOWN' });
  const town = el('div', { id: 'robots-town', className: 'objects-room' });
  const section = el(
    'section',
    { id: 'tab-robots', className: 'menu-tabpanel', role: 'tabpanel', 'aria-labelledby': 'tab-btn-robots', hidden: true },
    el('h2', { className: 'settings__heading', text: 'ROBOT LIBRARY' }),
    el('div', { className: 'objects__head' }, count),
    status,
    list,
    townTitle,
    town
  );

  function say(kind, text) {
    status.dataset.status = kind;
    status.textContent = text;
  }

  function buildings() {
    const state = townStore.getState();
    const ids = [...BUILDINGS.map((b) => b.id), ...state.placements.map((p) => p.libraryId)];
    const out = [];
    for (const id of ids) {
      const record = findBuildingRecord(state, id);
      if (record && !out.some((r) => r.id === record.id)) out.push(record);
    }
    return out;
  }

  function add(type) {
    const record = interiorView.current();
    if (!record) {
      say('error', 'ENTER A BUILDING FIRST');
      return;
    }
    const added = townStore.addRobot(record.id, { type: type.type, accent: type.accent });
    if (!added.ok) {
      say('error', added.errors[0]);
      return;
    }
    say('ok', `${type.name} ADDED TO ${record.name}`);
    onManage?.(added.id);
  }

  function card(type) {
    return el(
      'article',
      { className: 'robot-card', dataset: { type: type.type } },
      el(
        'div',
        { className: 'robot-card__head' },
        el('span', { className: 'robot-card__name', text: type.name }),
        el('span', { className: 'robot-card__cat', text: type.type.toUpperCase() })
      ),
      el('p', { className: 'robot-card__desc', text: type.description }),
      el('div', { className: 'robot-card__meta', text: type.meta }),
      el(
        'div',
        { className: 'robot-card__actions' },
        el('button', {
          className: 'btn btn--mini',
          dataset: { act: 'add', type: type.type },
          text: 'ADD TO ROOM',
          disabled: !interiorView.isActive(),
          onclick: () => add(type),
        })
      )
    );
  }

  function row(entry) {
    return el(
      'div',
      { className: 'robot-row', dataset: { id: entry.id, origin: entry.origin } },
      el(
        'div',
        { className: 'robot-row__text' },
        el('span', { className: 'robot-row__name', text: entry.name }),
        el('span', {
          className: 'robot-row__meta',
          text: `${entry.type.toUpperCase()} · WANDER ${entry.wander ? 'ON' : 'OFF'} · X ${entry.pos[0].toFixed(2)} · Z ${entry.pos[1].toFixed(2)}`,
        })
      ),
      entry.origin === 'user' ? el('span', { className: 'robot-row__badge', text: 'USER' }) : null,
      el('button', {
        className: 'btn btn--mini',
        dataset: { act: 'manage', id: entry.id },
        text: 'MANAGE',
        onclick: () => onManage?.(entry.id),
      })
    );
  }

  function renderList() {
    clear(list);
    for (const type of ROBOT_TYPES) list.appendChild(card(type));
  }

  function renderTown() {
    const all = townStore.allRobots();
    count.textContent = `${all.length} IN THE TOWN`;
    clear(town);
    let shown = 0;
    for (const record of buildings()) {
      const entries = townStore.getRobots(record.id);
      if (!entries.length) continue;
      shown += entries.length;
      town.appendChild(
        el(
          'div',
          { className: 'robot-group', dataset: { building: record.id } },
          el('h3', { className: 'robot-group__title', text: `${record.name} · ${entries.length}` }),
          entries.map(row)
        )
      );
    }
    if (!shown) {
      town.appendChild(
        el('p', { className: 'objects__empty', text: 'NO ROBOTS YET — ENTER A BUILDING OR DESIGN A SPACE.' })
      );
    }
  }

  function refresh() {
    renderList();
    renderTown();
  }

  townStore.subscribe((state, reason) => {
    if (reason === 'robot' || reason === 'space' || reason === 'placement' || reason === 'building') refresh();
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
