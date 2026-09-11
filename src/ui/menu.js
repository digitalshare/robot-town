import './menu.css';
import { el } from './dom.js';
import { MAX_EXPANSIONS } from '../data/layout.js';
import { createChatSession } from '../ai/chat.js';
import { createAiConsoleTab } from './aiConsoleTab.js';
import { createSettingsTab } from './settingsTab.js';
import { createFunctionsPanel } from './functionsPanel.js';
import { createGalleryTab } from './galleryTab.js';
import { createObjectsTab } from './objectsTab.js';
import { createRobotsTab } from './robotsTab.js';

export function createMenu({
  store,
  townStore,
  manager,
  interiorView,
  onLocate,
  onPickSite,
  onObjectSelect,
  onRobotManage,
  host = document.body,
} = {}) {
  const session = createChatSession(store, { townStore });
  let settingsTab = null;
  let functionsPanel = null;

  const aiTab = createAiConsoleTab({
    store,
    session,
    onConfigure: () => {
      setTab('settings');
      settingsTab?.startAdd();
    },
  });
  settingsTab = createSettingsTab({
    store,
    onOpenFunctions: () => functionsPanel?.open(functionsPanel.current()),
  });
  const galleryTab = createGalleryTab({ townStore, onLocate });
  const objectsTab = createObjectsTab({
    townStore,
    interiorView,
    onDesign: (record) => openObjectTool(record),
    onSelect: (id) => onObjectSelect?.(id),
  });
  const robotsTab = createRobotsTab({
    townStore,
    interiorView,
    onManage: (id) => onRobotManage?.(id),
  });
  functionsPanel = createFunctionsPanel({ store, host });

  const tabAiBtn = el('button', {
    id: 'tab-btn-ai',
    className: 'menu-tab',
    role: 'tab',
    'aria-selected': 'true',
    'aria-controls': 'tab-ai',
    dataset: { tab: 'ai' },
    text: 'AI',
  });
  const tabGalleryBtn = el('button', {
    id: 'tab-btn-gallery',
    className: 'menu-tab',
    role: 'tab',
    'aria-selected': 'false',
    'aria-controls': 'tab-gallery',
    dataset: { tab: 'gallery' },
    text: 'BUILDINGS',
  });
  const tabObjectsBtn = el('button', {
    id: 'tab-btn-objects',
    className: 'menu-tab',
    role: 'tab',
    'aria-selected': 'false',
    'aria-controls': 'tab-objects',
    dataset: { tab: 'objects' },
    text: 'OBJECTS',
  });
  const tabRobotsBtn = el('button', {
    id: 'tab-btn-robots',
    className: 'menu-tab',
    role: 'tab',
    'aria-selected': 'false',
    'aria-controls': 'tab-robots',
    dataset: { tab: 'robots' },
    text: 'ROBOTS',
  });
  const tabSettingsBtn = el('button', {
    id: 'tab-btn-settings',
    className: 'menu-tab',
    role: 'tab',
    'aria-selected': 'false',
    'aria-controls': 'tab-settings',
    dataset: { tab: 'settings' },
    text: 'SETTINGS',
  });

  const expandBtn = el('button', { id: 'btn-expand-map', className: 'btn', text: 'EXPAND MAP' });
  const siteBtn = el('button', { id: 'btn-select-site', className: 'btn', text: 'ADD BUILDING' });

  const panel = el(
    'aside',
    { id: 'menu-panel', className: 'menu-panel', role: 'dialog', 'aria-label': 'SYSTEM MENU', 'aria-hidden': 'true' },
    el(
      'header',
      { className: 'menu-panel__header' },
      el('span', { className: 'menu-panel__title', text: 'SYSTEM MENU' }),
      el('button', { id: 'menu-close', className: 'menu-icon-btn', 'aria-label': 'Close menu', text: '×' })
    ),
    el('div', { className: 'menu-actions' }, expandBtn, siteBtn),
    el('nav', { className: 'menu-tabs', role: 'tablist' }, tabAiBtn, tabGalleryBtn, tabObjectsBtn, tabRobotsBtn, tabSettingsBtn),
    el('div', { className: 'menu-panel__body' }, aiTab.el, galleryTab.el, objectsTab.el, robotsTab.el, settingsTab.el)
  );

  const button = el('button', {
    id: 'menu-button',
    className: 'hud-chip',
    'aria-expanded': 'false',
    'aria-controls': 'menu-panel',
    text: 'MENU',
  });

  const openCbs = new Set();
  const closeCbs = new Set();
  const storedTab = store.getState().ui.tab;
  let currentTab = ['settings', 'gallery', 'objects', 'robots'].includes(storedTab) ? storedTab : 'ai';

  function tabs() {
    return {
      ai: { btn: tabAiBtn, tab: aiTab },
      gallery: { btn: tabGalleryBtn, tab: galleryTab },
      objects: { btn: tabObjectsBtn, tab: objectsTab },
      robots: { btn: tabRobotsBtn, tab: robotsTab },
      settings: { btn: tabSettingsBtn, tab: settingsTab },
    };
  }

  function setTab(name) {
    currentTab = tabs()[name] ? name : 'ai';
    for (const [key, t] of Object.entries(tabs())) {
      const selected = key === currentTab;
      t.btn.setAttribute('aria-selected', String(selected));
      if (selected === !t.tab.el.hidden) continue;
      t.tab.el.hidden = !selected;
      if (selected) t.tab.onShow?.();
      else t.tab.onHide?.();
    }
    store.setUi({ tab: currentTab });
  }

  function isOpen() {
    return panel.classList.contains('open');
  }

  function open() {
    if (isOpen()) return;
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    button.setAttribute('aria-expanded', 'true');
    document.getElementById('tooltip')?.classList.remove('visible');
    setTab(currentTab);
    if (currentTab === 'ai') aiTab.focusInput();
    for (const fn of openCbs) fn();
  }

  function close() {
    if (!isOpen()) return;
    session.abort();
    functionsPanel?.close();
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    button.setAttribute('aria-expanded', 'false');
    for (const fn of closeCbs) fn();
    button.focus();
  }

  function toggle() {
    isOpen() ? close() : open();
  }

  function refreshActions() {
    const state = townStore.getState();
    expandBtn.textContent = `EXPAND MAP (${state.expansions}/${MAX_EXPANSIONS})`;
    expandBtn.disabled = state.expansions >= MAX_EXPANSIONS;
    const free = manager.freeCells().length;
    siteBtn.textContent = free ? `ADD BUILDING (${free} SITES)` : 'ADD BUILDING (EXPAND MAP FIRST)';
    siteBtn.disabled = free === 0;
  }

  function openWithSite(cell) {
    session.setToolMode({ tool: 'building', site: cell });
    aiTab.setReference({ site: cell });
    open();
    setTab('ai');
    aiTab.prefill('/building ');
  }

  function openWithBuilding(record) {
    session.setToolMode({ tool: 'space', building: record });
    aiTab.setReference({ building: record });
    open();
    setTab('ai');
    aiTab.prefill('/space ');
  }

  function openObjectTool(record, object = null) {
    session.setToolMode({ tool: 'object', building: record, object, objects: townStore.getObjects(record.id) });
    aiTab.setReference(object ? { object, building: record } : { building: record });
    open();
    setTab('ai');
    aiTab.prefill('/object ');
  }

  button.addEventListener('click', toggle);
  panel.querySelector('#menu-close').addEventListener('click', close);
  tabAiBtn.addEventListener('click', () => setTab('ai'));
  tabGalleryBtn.addEventListener('click', () => setTab('gallery'));
  tabObjectsBtn.addEventListener('click', () => setTab('objects'));
  tabRobotsBtn.addEventListener('click', () => setTab('robots'));
  tabSettingsBtn.addEventListener('click', () => setTab('settings'));
  expandBtn.addEventListener('click', () => manager.expand());
  siteBtn.addEventListener('click', () => {
    const cells = manager.freeCells();
    close();
    onPickSite?.(cells);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      e.stopPropagation();
      close();
    }
  });

  for (const type of ['pointerdown', 'wheel', 'keydown']) {
    panel.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
  }

  townStore.subscribe(refreshActions);
  refreshActions();
  openCbs.add(objectsTab.refresh);
  openCbs.add(robotsTab.refresh);

  host.appendChild(button);
  host.appendChild(panel);
  setTab(currentTab);

  return {
    el: panel,
    session,
    aiTab,
    galleryTab,
    objectsTab,
    robotsTab,
    functionsPanel,
    open,
    close,
    toggle,
    isOpen,
    setTab,
    openWithSite,
    openWithBuilding,
    openObjectTool,
    onOpen(fn) {
      openCbs.add(fn);
      return () => openCbs.delete(fn);
    },
    onClose(fn) {
      closeCbs.add(fn);
      return () => closeCbs.delete(fn);
    },
  };
}
