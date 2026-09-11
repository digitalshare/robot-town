import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 5194;
const ORIGIN = `http://localhost:${PORT}`;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--logLevel', 'error'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});

let failures = 0;
function check(label, cond, actual) {
  const got = !cond && actual !== undefined ? ` — got ${JSON.stringify(actual)}` : '';
  console.log((cond ? 'PASS: ' : 'FAIL: ') + label + got);
  if (!cond) failures++;
}

const CORS = { 'access-control-allow-origin': '*' };
const sse = (body) => ({ status: 200, contentType: 'text/event-stream', headers: CORS, body });
const json = (obj, status = 200) => ({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(obj) });

const round2 = (n) => Math.round(n * 100) / 100;
const fenced = (spec, tail) => '```json\n' + JSON.stringify(spec, null, 2) + '\n```\n' + tail;
const NOJSON_REPLY = 'Say what the object is for and how big it should be, then I will model it.';
const KIND_LINE =
  'kind is one of box, rbox, cyl, screen, rack, desk, plant, pad, crate, tank, shelf, bench, locker, lamp, monitor, pillar, pipe, chest, board, planter';
const RACK = { kind: 'rack', mat: 'wallDark', size: [2, 2.6, 1], pos: [0, 1.35, 0] };
const TANK = { kind: 'tank', mat: 'wallWhite', r: 0.8, h: 2.2, pos: [0, 1.25, 0] };

function spaceForRoom(w, d, wallHeight) {
  const lx = round2(w / 2 - 0.2);
  const lz = round2(d / 2 - 0.2);
  const rackW = Math.min(2, round2(lx * 0.8));
  const rackH = Math.min(2.6, round2(wallHeight - 0.6));
  const rackX = round2(lx - rackW / 2 - 0.1);
  const rackZ = -round2(Math.max(0.6, lz - 2.2));
  return {
    description: 'Cold-aisle server room with two rack rows, a status wall and a duty desk.',
    robots: 4,
    parts: [
      { kind: 'rack', size: [rackW, rackH, 1], pos: [-rackX, round2((rackH + 0.1) / 2), rackZ] },
      { kind: 'rack', size: [rackW, rackH, 1], pos: [rackX, round2((rackH + 0.1) / 2), rackZ] },
      {
        kind: 'screen',
        mat: 'screen',
        size: [Math.min(3, round2(w - 1)), 1.4],
        pos: [0, round2(wallHeight - 1), -round2(lz - 0.1)],
      },
      { kind: 'desk', size: [Math.min(2.4, lx), 1.2], pos: [0, 0.84, round2(lz - 1)] },
      { kind: 'plant', size: [1], pos: [round2(lx - 0.7), 0.82, round2(lz - 0.7)] },
    ],
  };
}

function objectForRoom(w, d, wallHeight) {
  const h = round2(Math.min(2.6, wallHeight - 1));
  return {
    name: 'SPARE SERVER RACK',
    kind: 'rack',
    mat: 'wallDark',
    size: [2, h, 1],
    pos: [round2(w / 2 - 2.4), round2((h + 0.1) / 2), -round2(d / 2 - 2.4)],
    rot: 0,
  };
}

const brokenObject = (w) => ({
  name: 'BAD OBJECT',
  kind: 'rack',
  mat: 'wallDark',
  size: [2, 2.6, 1],
  pos: [w, 1.35, 0],
  rot: 0,
});

function derivedFrom(source, w, d) {
  const part = source.part;
  return {
    name: `DERIVED ${source.name}`.slice(0, 40),
    ...part,
    pos: [-round2(w / 2 - 2.4), part.pos[1], round2(d / 2 - 2.4)],
    rot: (source.rot + 45) % 360,
  };
}

function sseFromText(text) {
  let out = '';
  for (let i = 0; i < text.length; i += 48) {
    out += `data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + 48) } }] })}\n\n`;
  }
  return out + 'data: [DONE]\n\n';
}

const recorded = { chat: null };

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${ORIGIN}/`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('dev server did not start');
}

async function boot(page) {
  await page.goto(ORIGIN);
  await page.waitForFunction(() => window.__TOWN_READY__ === true, null, { timeout: 30000 });
  await page.waitForTimeout(400);
}

async function openMenu(page) {
  if (await page.evaluate(() => document.getElementById('menu-panel').classList.contains('open'))) return;
  await page.click('#menu-button');
  await page.waitForTimeout(350);
}

async function closeMenu(page) {
  if (!(await page.evaluate(() => document.getElementById('menu-panel').classList.contains('open')))) return;
  await page.click('#menu-close');
  await page.waitForTimeout(350);
}

async function openObjectsTab(page) {
  await openMenu(page);
  await page.click('#tab-btn-objects');
  await page.waitForTimeout(250);
}

async function townState(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('robot-town.town.v1') ?? '{}'));
}

async function mode(page) {
  return page.evaluate(() => window.__town__.mode());
}

async function stats(page) {
  return page.evaluate(() => window.__town__.interior.stats());
}

async function objects(page) {
  return page.evaluate(() => window.__town__.objects.list());
}

async function selected(page) {
  return page.evaluate(() => window.__town__.objects.selected());
}

async function send(page, text) {
  await page.click('#tab-btn-ai');
  await page.fill('#chat-input', text);
  await page.click('#chat-send');
  await page.waitForFunction(() => !document.getElementById('chat-send').disabled, null, { timeout: 10000 });
  await page.waitForTimeout(250);
}

async function statusText(page) {
  return (await page.textContent('#chat-status')).trim();
}

async function cameraPos(page, which) {
  const arr = await page.evaluate((w) => {
    const t = window.__town__;
    return (w === 'town' ? t.camera : t.interior.camera).position.toArray();
  }, which);
  return arr.map(round2);
}

async function enterShell(page, id) {
  await page.evaluate((bid) => window.__town__.enterBuilding(bid), id);
  await page.waitForTimeout(250);
  if (await page.isVisible('#confirm-no')) await page.click('#confirm-no');
  await page.waitForTimeout(400);
}

async function exitInterior(page) {
  if (await page.isVisible('#interior-exit')) await page.click('#interior-exit');
  else await page.evaluate(() => window.__town__.interior.exit());
  await page.waitForTimeout(300);
}

async function clickBuilding(page, id) {
  const p = await page.evaluate((bid) => window.__town__.projectBuilding(bid), id);
  if (!p) return null;
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(350);
  return p;
}

// A steep three-quarter top-down frame: deterministic, non-degenerate for OrbitControls,
// and it keeps every object clear of the bottom-left inspector.
async function frameRoom(page) {
  await page.evaluate(() => {
    const t = window.__town__;
    const room = t.interior.room();
    const view = Math.max(room.w, room.d) + 10;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const c = t.interior.camera;
    c.left = (-view * aspect) / 2;
    c.right = (view * aspect) / 2;
    c.top = view / 2;
    c.bottom = -view / 2;
    c.zoom = 1;
    c.near = 1;
    c.far = view * 8;
    c.position.set(0, view * 2.2, view * 0.45);
    c.updateProjectionMatrix();
    t.interior.controls.target.set(0, 0, 0);
    t.interior.controls.update();
  });
  await page.waitForTimeout(300);
}

async function projectObject(page, id) {
  return page.evaluate((oid) => window.__town__.projectObject(oid), id);
}

async function clickObject(page, id) {
  const p = await projectObject(page, id);
  if (!p) return null;
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(250);
  return p;
}

async function panelVisible(page) {
  return page.isVisible('#object-panel');
}

const barLabel = (base, n) => (n ? `${base} · ${n} OBJECT${n === 1 ? '' : 'S'}` : base);

// A seeded room can hide one object behind another, so pick the first id whose
// projected centre really picks itself.
async function pickableId(page, ids) {
  for (const id of ids) {
    const ok = await page.evaluate((oid) => {
      const p = window.__town__.projectObject(oid);
      return Boolean(p) && window.__town__.objects.pickAt(p.x, p.y)?.id === oid;
    }, id);
    if (ok) return id;
  }
  return null;
}

async function emptyFloorPoint(page) {
  return page.evaluate(() => {
    const t = window.__town__;
    for (let y = 80; y < window.innerHeight - 260; y += 16) {
      for (let x = 400; x < window.innerWidth - 60; x += 16) {
        if (document.elementFromPoint(x, y)?.tagName !== 'CANVAS') continue;
        if (t.objects.pickAt(x, y)) continue;
        return { x, y };
      }
    }
    return null;
  });
}

function blockedBox(part, hw, hd) {
  return {
    minX: part.pos[0] - hw - 0.8,
    maxX: part.pos[0] + hw + 0.8,
    minZ: part.pos[2] - hd - 0.8,
    maxZ: part.pos[2] + hd + 0.8,
  };
}

const rackBox = (x, z) => blockedBox({ pos: [x, 0, z] }, 1.04, 0.54);
const clearOf = (p, b) => p[0] < b.minX || p[0] > b.maxX || p[1] < b.minZ || p[1] > b.maxZ;

try {
  await waitForServer();
  mkdirSync('shots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(10000);
  const pageErrors = [];
  page.on('pageerror', (e) => {
    console.log('PAGE ERROR:', e.message);
    pageErrors.push(e.message);
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to fetch|Failed to load resource|ERR_CONNECTION_REFUSED/i.test(m.text())) {
      console.log('CONSOLE ERROR:', m.text());
    }
  });

  await page.addInitScript(() => {
    if (!sessionStorage.getItem('rt-objects-cleared')) {
      localStorage.removeItem('robot-town.ai.v1');
      localStorage.removeItem('robot-town.town.v1');
      sessionStorage.setItem('rt-objects-cleared', '1');
    }
  });

  await page.route('**/mock/openai/v1/models', (r) => r.fulfill(json({ data: [{ id: 'mock-architect' }] })));
  await page.route('**/mock/openai/v1/chat/completions', (r) => {
    const body = r.request().postDataJSON();
    recorded.chat = body;
    const last = [...body.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const sys = body.messages.find((m) => m.role === 'system')?.content ?? '';
    const ref = /ROOM REFERENCE: .+? · (\d+) x (\d+) · WALL HEIGHT (\d+)/.exec(sys);
    const dims = ref ? { w: Number(ref[1]), d: Number(ref[2]), h: Number(ref[3]) } : { w: 20, d: 20, h: 6 };
    let reply;
    if (!sys.includes('TOOL create_object')) {
      reply = fenced(spaceForRoom(dims.w, dims.d, dims.h), 'Here is the server room.');
    } else if (/NOJSON/i.test(last)) {
      reply = NOJSON_REPLY;
    } else if (/INVALID/i.test(last)) {
      reply = fenced(brokenObject(dims.w), 'Here is an object that ignores the walls.');
    } else {
      const raw = /SOURCE OBJECT:[\s\S]*?```json\n([\s\S]*?)\n```/.exec(sys)?.[1];
      reply =
        raw && /DERIVE/i.test(last)
          ? fenced(derivedFrom(JSON.parse(raw), dims.w, dims.d), 'Here is the derived object.')
          : fenced(objectForRoom(dims.w, dims.d, dims.h), 'Here is the object.');
    }
    r.fulfill(sse(sseFromText(reply)));
  });

  await boot(page);
  check('town mode on boot', (await mode(page)) === 'town');
  check('no objects stored on boot', ((await townState(page)).objects ?? []).length === 0);

  await openMenu(page);
  await page.click('#tab-btn-settings');
  await page.click('#provider-add');
  await page.fill('#pf-name', 'Mock Architect');
  await page.selectOption('#pf-protocol', 'openai');
  await page.fill('#pf-baseurl', `${ORIGIN}/mock/openai/v1`);
  await page.fill('#pf-apikey', 'sk-mock-1234567890');
  await page.click('#pf-save');
  await page.click('#pf-test-btn');
  await page.waitForFunction(
    () => ['ok', 'error'].includes(document.getElementById('pf-test-status').dataset.status),
    null,
    { timeout: 12000 }
  );
  check('mock provider connects', (await page.getAttribute('#pf-test-status', 'data-status')) === 'ok');
  await page.selectOption('#pf-model', 'mock-architect');
  await page.click('#pf-activate');
  await closeMenu(page);

  // 0. the OBJECTS tab is a searchable catalog of every type
  await openObjectsTab(page);
  check('objects tab button exists', await page.isVisible('#tab-btn-objects'));
  check('objects tab selected', (await page.getAttribute('#tab-btn-objects', 'aria-selected')) === 'true');
  check('objects panel shown', await page.isVisible('#tab-objects'));
  check(
    'objects panel replaces the others',
    !(await page.isVisible('#tab-ai')) &&
      !(await page.isVisible('#tab-gallery')) &&
      !(await page.isVisible('#tab-robots')) &&
      !(await page.isVisible('#tab-settings'))
  );
  check('five tabs share the strip', (await page.locator('.menu-tab').count()) === 5);
  check('tab labels shortened to fit', (await page.textContent('#tab-btn-gallery')) === 'BUILDINGS');
  check('catalog lists every type', (await page.locator('.object-card').count()) === 20, await page.locator('.object-card').count());
  check('catalog counts itself', (await page.textContent('#objects-count')) === '20 OF 20', await page.textContent('#objects-count'));
  check(
    'card names its type and category',
    (await page.textContent('.object-card[data-kind="chest"] .object-card__name')) === 'TOOL CHEST' &&
      (await page.textContent('.object-card[data-kind="chest"] .object-card__cat')) === 'STORAGE'
  );
  check('card describes the type', (await page.textContent('.object-card[data-kind="lamp"] .object-card__desc')).length > 20);
  check(
    'card shows the default size',
    (await page.textContent('.object-card[data-kind="tank"] .object-card__meta')) === 'tank · R 0.8 × H 2.4',
    await page.textContent('.object-card[data-kind="tank"] .object-card__meta')
  );
  check(
    'every card offers creation',
    (await page.locator('.object-card button[data-act="create"]').count()) === 20
  );
  check(
    'the seeded default types are catalog cards',
    (await page.textContent('.object-card[data-kind="board"] .object-card__name')) === 'DISPLAY BOARD' &&
      (await page.textContent('.object-card[data-kind="board"] .object-card__cat')) === 'TECH' &&
      (await page.textContent('.object-card[data-kind="planter"] .object-card__name')) === 'PLANTER BED' &&
      (await page.textContent('.object-card[data-kind="planter"] .object-card__cat')) === 'GREEN'
  );
  await page.fill('#objects-search', 'storage');
  check('search narrows the catalog', (await page.locator('.object-card').count()) === 3, await page.locator('.object-card').count());
  check('search updates the count', (await page.textContent('#objects-count')) === '3 OF 20', await page.textContent('#objects-count'));
  check(
    'search matches the storage category',
    (await page.locator('.object-card').evaluateAll((nodes) => nodes.map((n) => n.dataset.kind))).join(',') === 'shelf,crate,chest'
  );
  await page.fill('#objects-search', 'zzz');
  check('unmatched search empties the list', (await page.locator('.object-card').count()) === 0);
  check(
    'unmatched search explains itself',
    (await page.textContent('#objects-list .objects__empty')) === 'NO OBJECT TYPES MATCH THAT SEARCH.'
  );
  await page.fill('#objects-search', '');
  check(
    'clearing the search restores the catalog',
    (await page.locator('.object-card').count()) === 20 && (await page.textContent('#objects-count')) === '20 OF 20'
  );
  check('create disabled in town mode', await page.isDisabled('.object-card[data-kind="rack"] button[data-act="create"]'));
  check('design disabled in town mode', await page.isDisabled('#objects-design'));
  check('room heading has no building yet', (await page.textContent('#objects-room-title')) === 'IN THIS ROOM');
  check(
    'room list asks for a building',
    (await page.textContent('#objects-room .objects__empty')) === 'ENTER A BUILDING TO PLACE OBJECTS.'
  );
  check(
    'chosen tab persisted',
    (await page.evaluate(() => JSON.parse(localStorage.getItem('robot-town.ai.v1')).ui.tab)) === 'objects'
  );
  await page.screenshot({ path: 'shots/o-00-catalog.png' });
  await page.reload();
  await page.waitForFunction(() => window.__TOWN_READY__ === true, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  await openMenu(page);
  check('objects tab restored after reload', (await page.getAttribute('#tab-btn-objects', 'aria-selected')) === 'true');
  check('catalog intact after reload', (await page.locator('.object-card').count()) === 20);
  await closeMenu(page);

  // 0b. the first enter seeds a default layout, and every seeded object is editable
  await enterShell(page, 'datacore');
  check('shell entered on the first visit', (await mode(page)) === 'interior');
  const seeded = await stats(page);
  check(
    'the default layout is seeded on the first enter',
    seeded.fixtures >= 3 && seeded.objects === seeded.fixtures && seeded.props === 0,
    seeded
  );
  const defaults = await objects(page);
  check(
    'every seeded object is stored with the default origin',
    defaults.length === seeded.fixtures && defaults.every((o) => o.origin === 'default'),
    defaults.map((o) => `${o.name}:${o.origin}`)
  );
  check(
    'the seeded layout is deterministic per building',
    defaults.map((o) => o.part.kind).join(',') === 'rack,rack,rack,rack,rack,rack,board',
    defaults.map((o) => o.part.kind)
  );
  await openObjectsTab(page);
  check(
    'the room list shows the seeded layout',
    (await page.locator('.object-row').count()) === seeded.fixtures,
    await page.locator('.object-row').count()
  );
  await closeMenu(page);
  await frameRoom(page);
  const pickedDefault = await pickableId(page, defaults.map((o) => o.id));
  check('a seeded object is pickable in the room', pickedDefault !== null, pickedDefault);
  const defaultId = pickedDefault ?? defaults[0].id;
  const defaultEntry = defaults.find((o) => o.id === defaultId);
  await clickObject(page, defaultId);
  check('a seeded object opens the inspector', await panelVisible(page));
  check('the inspector names the seeded object', (await page.inputValue('#object-name')) === defaultEntry.name);
  check(
    'the seeded inspector is not read-only',
    (await page.textContent('#object-hint')) === 'DATA CORE HUB · 22 × 22',
    await page.textContent('#object-hint')
  );
  check(
    'the seeded inspector offers save, reference and remove',
    (await page.isVisible('#object-save')) &&
      (await page.isVisible('#object-reference')) &&
      (await page.isVisible('#object-remove'))
  );
  check(
    'the seeded inspector enables its controls',
    (await page.isEnabled('#object-name')) && (await page.isEnabled('#object-shape')) && (await page.isEnabled('#object-rot'))
  );
  check('a seeded object is selected like any other', (await selected(page)) === defaultId);
  await page.screenshot({ path: 'shots/o-00b-default-inspector.png' });

  await page.fill('#object-name', 'RENAMED DEFAULT');
  await page.click('#object-save');
  await page.waitForTimeout(300);
  check(
    'renaming a seeded object persists',
    ((await townState(page)).objects ?? []).some((o) => o.id === defaultId && o.name === 'RENAMED DEFAULT')
  );
  const defaultBefore = (await objects(page)).find((o) => o.id === defaultId).part.pos;
  const defaultMoved = await page.evaluate((id) => window.__town__.objects.dragTo(id, 0, 0), defaultId);
  await page.waitForTimeout(300);
  check(
    'a seeded object can be moved',
    Array.isArray(defaultMoved) && (defaultMoved[0] !== defaultBefore[0] || defaultMoved[1] !== defaultBefore[2]),
    { defaultBefore, defaultMoved }
  );
  check(
    'the seeded move is stored',
    JSON.stringify((await objects(page)).find((o) => o.id === defaultId).part.pos.slice(0, 3)) !==
      JSON.stringify(defaultBefore),
    (await objects(page)).find((o) => o.id === defaultId).part.pos
  );

  await exitInterior(page);
  await page.reload();
  await page.waitForFunction(() => window.__TOWN_READY__ === true, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  check(
    'the seeded marker is stored',
    ((await townState(page)).seeded ?? []).includes('datacore'),
    (await townState(page)).seeded
  );
  await enterShell(page, 'datacore');
  const reentered = await stats(page);
  check(
    're-entering does not seed a second layout',
    reentered.fixtures === seeded.fixtures && reentered.objects === seeded.objects,
    { seeded, reentered }
  );
  check(
    'the seeded edits survive the reload',
    (await objects(page)).some(
      (o) => o.id === defaultId && o.name === 'RENAMED DEFAULT' && o.part.pos[0] === defaultMoved[0] && o.part.pos[2] === defaultMoved[1]
    ),
    (await objects(page)).find((o) => o.id === defaultId)
  );
  await exitInterior(page);

  // 1. an object can live in an undesigned generated shell
  await enterShell(page, 'datacore');
  check('shell entered', (await mode(page)) === 'interior');
  const base = (await stats(page)).fixtures;
  check('shell starts with the default set, not zero', (await stats(page)).objects === base && base >= 3, await stats(page));
  check('inspector hidden on entry', !(await panelVisible(page)));

  await openObjectsTab(page);
  check('create enabled inside a building', await page.isEnabled('.object-card[data-kind="rack"] button[data-act="create"]'));
  check('design enabled inside a building', await page.isEnabled('#objects-design'));
  check('room heading names the building', (await page.textContent('#objects-room-title')) === 'IN DATA CORE HUB');
  check('room list carries the default set', (await page.locator('.object-row').count()) === base, await page.locator('.object-row').count());
  await page.click('.object-card[data-kind="rack"] button[data-act="create"]');
  await page.waitForTimeout(400);
  const created = await objects(page);
  check('gallery creates one object on top of the defaults', created.length === base + 1, created.length);
  const rackEntry = created.at(-1);
  const rackId = rackEntry?.id;
  check('gallery object takes the catalog name', rackEntry?.name === 'SERVER RACK', rackEntry?.name);
  check(
    'gallery object takes the catalog defaults',
    JSON.stringify(rackEntry?.part.size) === '[2,3,1]' && rackEntry?.part.mat === 'wallDark',
    rackEntry?.part
  );
  check('gallery object rests on the floor', rackEntry?.part.pos[1] === 1.55, rackEntry?.part.pos);
  check('gallery object is a user object', rackEntry?.origin === 'user', rackEntry?.origin);
  check(
    'gallery reports the placement',
    (await page.textContent('#objects-status')) === 'SERVER RACK ADDED TO DATA CORE HUB',
    await page.textContent('#objects-status')
  );
  check('gallery status marked ok', (await page.getAttribute('#objects-status', 'data-status')) === 'ok');
  check('room list follows the store', (await page.locator('.object-row').count()) === base + 1);
  check(
    'room row names the object',
    (await page.textContent(`.object-row[data-id="${rackId}"] .object-row__name`)) === 'SERVER RACK'
  );
  check(
    'room row shows the placement',
    /^rack · X -?\d+\.\d{2} · Z -?\d+\.\d{2} · ROT 0$/.test(
      await page.textContent(`.object-row[data-id="${rackId}"] .object-row__meta`)
    ),
    await page.textContent(`.object-row[data-id="${rackId}"] .object-row__meta`)
  );
  check('gallery creation selects the object', (await selected(page)) === rackId);
  check('gallery creation opens the inspector', await panelVisible(page));
  await page.screenshot({ path: 'shots/o-01-gallery-create.png' });
  await closeMenu(page);

  const withObject = await stats(page);
  check('objects get their own counter', withObject.objects === base + 1, withObject.objects);
  check('object count leaves the prop counter alone', withObject.props === 0, withObject.props);
  check('the default counter keeps reporting the seeded set', withObject.fixtures === base, withObject.fixtures);
  check(
    'interior bar reports the object count',
    (await page.textContent('#interior-state')) === barLabel('GENERATED SHELL — NOT DESIGNED YET', base + 1),
    await page.textContent('#interior-state')
  );
  await page.screenshot({ path: 'shots/o-01-shell-object.png' });

  // 2. clicking selects, clicking the floor deselects
  await frameRoom(page);
  check(
    'object node is pickable as an object',
    await page.evaluate(
      ([id]) => {
        const p = window.__town__.projectObject(id);
        const hit = p && window.__town__.objects.pickAt(p.x, p.y);
        return hit?.kind === 'object' && hit.id === id;
      },
      [rackId]
    )
  );
  const point = await clickObject(page, rackId);
  check('object is clickable in the room', point !== null);
  check('inspector opens on click', await panelVisible(page));
  check('inspector names the object', (await page.inputValue('#object-name')) === 'SERVER RACK');
  check('inspector shows the kind badge', (await page.textContent('#object-kind')) === 'RACK');
  check('inspector shows the room in the hint', (await page.textContent('#object-hint')) === 'DATA CORE HUB · 22 × 22');
  check(
    'inspector shows the live position',
    /^X -?\d+\.\d{2} · Y \d+\.\d{2} · Z -?\d+\.\d{2}$/.test(await page.textContent('#object-pos')),
    await page.textContent('#object-pos')
  );
  check('selection follows the click', (await selected(page)) === rackId);
  check('inspector offers save, reference and remove', (await page.isVisible('#object-save')) && (await page.isVisible('#object-reference')) && (await page.isVisible('#object-remove')));
  check('inspector seeds the shape dropdown', (await page.inputValue('#object-shape')) === 'rack');
  check(
    'inspector seeds one size field per axis',
    (await page.locator('#object-size input').count()) === 3 &&
      (await page.inputValue('#object-size input[data-key="size.0"]')) === '2'
  );
  check(
    'inspector marks the stored material',
    (await page.getAttribute('#object-mats [data-mat="wallDark"]', 'data-active')) === 'true'
  );
  await page.screenshot({ path: 'shots/o-02-inspector.png' });

  const floorPoint = await emptyFloorPoint(page);
  check('the seeded room still leaves empty floor to click', floorPoint !== null, floorPoint);
  if (floorPoint) await page.mouse.click(floorPoint.x, floorPoint.y);
  await page.waitForTimeout(250);
  check('clicking the empty floor closes the inspector', !(await panelVisible(page)));
  check('clicking the empty floor clears the selection', (await selected(page)) === null);
  await clickObject(page, rackId);
  check('clicking the object again reopens the inspector', await panelVisible(page));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('Escape closes the inspector', !(await panelVisible(page)));
  check('Escape keeps the interior open', (await mode(page)) === 'interior');
  check('Escape clears the selection', (await selected(page)) === null);

  // 3. /object derives a related object from the selected one
  await clickObject(page, rackId);
  await page.click('#object-reference');
  await page.waitForTimeout(450);
  check('reference opens the menu', await page.evaluate(() => document.getElementById('menu-panel').classList.contains('open')));
  check('reference opens the AI tab', (await page.getAttribute('#tab-btn-ai', 'aria-selected')) === 'true');
  check(
    'banner carries the object reference',
    (await page.textContent('#chat-site-text')) === 'OBJECT SERVER RACK · RACK IN DATA CORE HUB'
  );
  check('banner clear button follows the object', (await page.textContent('#chat-site-clear')) === 'CLEAR OBJECT');
  check('input pre-seeded with /object', (await page.inputValue('#chat-input')) === '/object ');
  check(
    'tool mode holds the room and the source object',
    await page.evaluate(
      (id) =>
        window.__town__.menu.session.toolMode?.tool === 'object' &&
        window.__town__.menu.session.toolMode?.building?.id === 'datacore' &&
        window.__town__.menu.session.toolMode?.room?.w === 22 &&
        window.__town__.menu.session.toolMode?.object?.id === id,
      rackId
    )
  );
  await page.screenshot({ path: 'shots/o-03-reference.png' });

  const beforeDerive = (await objects(page)).length;
  await send(page, '/object DERIVE a twin for the far aisle');
  const deriveSys = recorded.chat.messages[0].content;
  check('system prompt preloads the object tool', deriveSys.includes('TOOL create_object') && deriveSys.includes('SCHEMA:'));
  check('system prompt advertises all 20 kinds', deriveSys.includes(KIND_LINE));
  check(
    'system prompt lists the new kind bullets',
    deriveSys.includes('shelf') &&
      deriveSys.includes('chest') &&
      deriveSys.includes('pillar') &&
      deriveSys.includes('board') &&
      deriveSys.includes('planter')
  );
  check('system prompt lists the material whitelist', deriveSys.includes('wallGray') && deriveSys.includes('cyanSoft'));
  check(
    'system prompt carries the room reference',
    deriveSys.includes('ROOM REFERENCE: DATA CORE HUB · 22 x 22 · WALL HEIGHT 8 · TYPE datacore')
  );
  check('system prompt states the centre origin', deriveSys.includes('pos is the CENTRE of the object'));
  check(
    'system prompt lists the objects already placed',
    deriveSys.includes(`OBJECTS ALREADY IN THE ROOM (${beforeDerive}):`) && deriveSys.includes('RENAMED DEFAULT'),
    beforeDerive
  );
  check('system prompt carries the source object', deriveSys.includes('SOURCE OBJECT:') && deriveSys.includes(rackId));
  check('system prompt carries the building description', deriveSys.includes('Central compute and telemetry vault'));
  check('system prompt includes a worked object example', deriveSys.includes('SPARE COOLANT TANK'));
  check(
    'slash command stripped from the user turn',
    recorded.chat.messages.at(-1).content === 'DERIVE a twin for the far aisle'
  );
  check('status reports the new object', (await statusText(page)) === 'OBJECT ADDED TO DATA CORE HUB', await statusText(page));
  check('status marked ok', (await page.getAttribute('#chat-status', 'data-status')) === 'ok');
  const afterDerive = await objects(page);
  check('derived object stored', afterDerive.length === beforeDerive + 1, afterDerive.length);
  const derived = afterDerive.at(-1);
  check('derived object keeps the source family', derived.part.kind === 'rack');
  check('derived object gets its own name', derived.name === 'DERIVED SERVER RACK', derived.name);
  check('derived object takes the derived rotation', derived.rot === 45, derived.rot);
  check('derived object is a user object', derived.origin === 'user', derived.origin);
  check('derived object is selected on arrival', (await selected(page)) === derived.id);
  check('inspector follows the new selection', (await page.inputValue('#object-name')) === 'DERIVED SERVER RACK');
  check('still inside the room after /object', (await mode(page)) === 'interior');

  // 4. /object without a source designs a fresh object
  await openObjectsTab(page);
  check(
    'room list tracks the store',
    (await page.locator('.object-row').count()) === beforeDerive + 1,
    await page.locator('.object-row').count()
  );
  const roomNames = await page.locator('.object-row__name').allTextContents();
  check(
    'room list names the seeded and the AI objects',
    roomNames.includes('SERVER RACK') && roomNames.includes('DERIVED SERVER RACK') && roomNames.includes('RENAMED DEFAULT'),
    roomNames
  );
  await page.click('#objects-design');
  await page.waitForTimeout(400);
  check('design button jumps to the AI tab', (await page.getAttribute('#tab-btn-ai', 'aria-selected')) === 'true');
  check(
    'design button arms the object tool with no source',
    await page.evaluate(
      () => window.__town__.menu.session.toolMode?.tool === 'object' && window.__town__.menu.session.toolMode?.object === null
    )
  );
  check('design button pre-seeds /object', (await page.inputValue('#chat-input')) === '/object ');
  check(
    'banner falls back to the room reference',
    (await page.textContent('#chat-site-text')) === 'BUILDING DATA CORE HUB · 22 × 22 · SECTOR A1'
  );
  const beforeCreate = (await objects(page)).length;
  await send(page, '/object a coolant tank for the spare aisle');
  const createSys = recorded.chat.messages[0].content;
  check('create prompt drops the source block', !createSys.includes('SOURCE OBJECT:'));
  check(
    'create prompt lists the placed objects',
    createSys.includes(`OBJECTS ALREADY IN THE ROOM (${beforeCreate}):`),
    beforeCreate
  );
  const afterCreate = await objects(page);
  const total = afterCreate.length;
  check('created object stored', total === beforeCreate + 1, total);
  check(
    'created object uses the mock spec',
    afterCreate.at(-1).name === 'SPARE SERVER RACK' && afterCreate.at(-1).part.kind === 'rack'
  );
  check('created object is selected', (await selected(page)) === afterCreate.at(-1).id);
  check('object counter follows the store', (await stats(page)).objects === total);
  check(
    'interior bar counts the objects',
    (await page.textContent('#interior-state')) === barLabel('GENERATED SHELL — NOT DESIGNED YET', total),
    await page.textContent('#interior-state')
  );
  await closeMenu(page);

  // 5. invalid and prose-only object replies are rejected
  await page.evaluate(() => window.__town__.menu.openObjectTool(window.__town__.interior.current()));
  await send(page, '/object INVALID');
  check('invalid object rejected in the status line', /OUTSIDE THE ROOM|UNKNOWN KIND|UNKNOWN MATERIAL/.test(await statusText(page)), await statusText(page));
  check('invalid object status marked error', (await page.getAttribute('#chat-status', 'data-status')) === 'error');
  check('invalid object stores nothing', (await objects(page)).length === total);
  await send(page, '/object NOJSON');
  check('reply without JSON reports the extraction failure', /NO JSON/.test(await statusText(page)), await statusText(page));
  check('reply without JSON stores nothing', (await objects(page)).length === total);
  await closeMenu(page);

  // 6. the inspector edits size, shape, material, name and rotation
  await frameRoom(page);
  await clickObject(page, rackId);
  check('rack re-selected for editing', await panelVisible(page));
  await page.fill('#object-name', 'RENAMED LOCKER');
  await page.selectOption('#object-shape', 'locker');
  check('shape change re-seeds the size fields', (await page.inputValue('#object-size input[data-key="size.0"]')) === '1');
  check('shape change updates the badge', (await page.textContent('#object-kind')) === 'LOCKER');
  await page.fill('#object-size input[data-key="size.0"]', '1.6');
  await page.click('#object-mats [data-mat="orange"]');
  check('swatch click marks the material', (await page.getAttribute('#object-mats [data-mat="orange"]', 'data-active')) === 'true');
  await page.evaluate(() => {
    const el = document.getElementById('object-rot');
    el.value = '90';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  check('rotation readout follows the slider', (await page.textContent('#object-rot-value')) === '90°');
  await page.click('#object-save');
  await page.waitForTimeout(300);
  const saved = (await townState(page)).objects.find((o) => o.id === rackId);
  check('saved name persisted', saved.name === 'RENAMED LOCKER', saved.name);
  check('saved shape persisted', saved.part.kind === 'locker', saved.part.kind);
  check('saved size persisted', saved.part.size[0] === 1.6, saved.part.size);
  check('saved material persisted', saved.part.mat === 'orange', saved.part.mat);
  check('saved rotation persisted', saved.rot === 90, saved.rot);
  check('saved object keeps its id', (await selected(page)) === rackId);
  check('saved object is rebuilt and still pickable', (await page.evaluate(
    (id) => {
      const p = window.__town__.projectObject(id);
      return Boolean(p) && window.__town__.objects.pickAt(p.x, p.y)?.id === id;
    },
    rackId
  )));
  check('inspector re-reads the saved entry', (await page.inputValue('#object-name')) === 'RENAMED LOCKER');
  check('save clears the error line', (await page.textContent('#object-error')) === '');

  await page.fill('#object-size input[data-key="size.0"]', '99');
  await page.click('#object-save');
  await page.waitForTimeout(250);
  check('out-of-range size reports the validator', /OUT OF RANGE/.test(await page.textContent('#object-error')), await page.textContent('#object-error'));
  check(
    'out-of-range size stores nothing',
    (await townState(page)).objects.find((o) => o.id === rackId).part.size[0] === 1.6
  );
  await page.screenshot({ path: 'shots/o-04-edited.png' });

  // 7. dragging moves the object without moving the camera
  await page.fill('#object-size input[data-key="size.0"]', '1.6');
  await page.click('#object-save');
  await page.waitForTimeout(250);
  check('valid size saves again', (await page.textContent('#object-error')) === '');
  const before = (await objects(page)).find((o) => o.id === rackId).part.pos;
  const camBefore = await cameraPos(page, 'interior');
  const dragFrom = await projectObject(page, rackId);
  await page.mouse.move(dragFrom.x, dragFrom.y);
  await page.mouse.down();
  await page.mouse.move(dragFrom.x + 90, dragFrom.y + 50, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const dragged = (await objects(page)).find((o) => o.id === rackId).part;
  check('drag stores a new position', dragged.pos[0] !== before[0] || dragged.pos[2] !== before[2], { before, after: dragged.pos });
  check('drag keeps the object on the floor', dragged.pos[1] === before[1], dragged.pos);
  check('drag leaves the selection intact', (await selected(page)) === rackId);
  check('drag re-enables the orbit controls', await page.evaluate(() => window.__town__.interior.controls.enabled === true));
  check('drag does not move the interior camera', JSON.stringify(camBefore) === JSON.stringify(await cameraPos(page, 'interior')));
  check(
    'inspector follows the drag',
    new RegExp(`X ${dragged.pos[0].toFixed(2)} · Y ${dragged.pos[1].toFixed(2)} · Z ${dragged.pos[2].toFixed(2)}`).test(
      await page.textContent('#object-pos')
    ),
    await page.textContent('#object-pos')
  );

  const clamped = await page.evaluate((id) => window.__town__.objects.dragTo(id, 999, -999), rackId);
  await page.waitForTimeout(250);
  check('drag outside the room clamps to the walls', clamped !== null && clamped[0] <= 11 && clamped[1] >= -11, clamped);
  const clampedPart = (await objects(page)).find((o) => o.id === rackId).part;
  check('clamped position is stored', clampedPart.pos[0] === clamped[0] && clampedPart.pos[2] === clamped[1], clampedPart.pos);
  await page.screenshot({ path: 'shots/o-05-dragged.png' });

  // 8. robots treat objects as obstacles
  await page.evaluate((id) => window.__town__.objects.dragTo(id, 0, 0), rackId);
  await page.waitForTimeout(300);
  const box = rackBox(0, 0);
  const targets = await page.evaluate(() => window.__town__.interior.robotTargets());
  check('robots re-target around a moved object', targets.length > 0 && targets.every((p) => clearOf(p, box)), targets);
  const moved = await page.evaluate((id) => window.__town__.objects.dragTo(id, -6, 4), rackId);
  await page.waitForTimeout(300);
  const movedBox = rackBox(moved[0], moved[1]);
  const movedTargets = await page.evaluate(() => window.__town__.interior.robotTargets());
  check('robots re-target around a second move', movedTargets.every((p) => clearOf(p, movedBox)), movedTargets);

  // 8b. the ROBOTS tab manages every robot in the town
  const robotsAll = () => page.evaluate(() => window.__town__.robots.all());
  const baseRobots = (await robotsAll()).length;
  check('the shell seeded a roster', baseRobots >= 2 && baseRobots <= 12, baseRobots);
  await openMenu(page);
  await page.click('#tab-btn-robots');
  await page.waitForTimeout(250);
  check('robots tab lists the three types', (await page.locator('.robot-card').count()) === 3);
  check(
    'robots tab groups the room roster',
    (await page.locator('.robot-group[data-building="datacore"] .robot-row').count()) === baseRobots,
    await page.locator('.robot-group[data-building="datacore"] .robot-row').count()
  );
  await page.click('.robot-card[data-type="hauler"] [data-act="add"]');
  await page.waitForTimeout(400);
  const withHauler = await robotsAll();
  check('ADD TO ROOM grows the roster', withHauler.length === baseRobots + 1, withHauler.length);
  const hauler = withHauler.find((r) => r.type === 'hauler');
  check('the added robot is a user robot', hauler?.origin === 'user', hauler?.origin);
  check('the added robot gets its own row', await page.isVisible(`.robot-row[data-id="${hauler.id}"]`));
  check(
    'the added robot carries the USER badge',
    (await page.textContent(`.robot-row[data-id="${hauler.id}"] .robot-row__badge`)) === 'USER'
  );
  check('stats follow the roster', (await stats(page)).robots === baseRobots + 1, await stats(page));
  check('ADD opens the robot panel', await page.isVisible('#robot-panel'));
  check('ADD leaves the object panel closed', !(await panelVisible(page)));
  check(
    'the panel manages the added robot',
    (await page.evaluate(() => window.__town__.robots.panel()?.entry?.id ?? null)) === hauler.id
  );

  await page.fill('#robot-name', 'RENAMED HAULER');
  await page.click('#robot-save');
  await page.waitForTimeout(350);
  check('a rename persists', (await robotsAll()).find((r) => r.id === hauler.id)?.name === 'RENAMED HAULER');
  await page.click('#robot-accents .object-swatch[data-accent="teal"]');
  await page.$eval('#robot-scale', (node) => {
    node.value = '1.2';
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('#robot-save');
  await page.waitForTimeout(350);
  const styled = (await robotsAll()).find((r) => r.id === hauler.id);
  check('accent and scale persist', styled?.accent === 'teal' && styled?.scale === 1.2, styled);
  await page.uncheck('#robot-wander');
  await page.click('#robot-save');
  await page.waitForTimeout(350);
  check('wander off persists', (await robotsAll()).find((r) => r.id === hauler.id)?.wander === false);
  const idleBefore = await page.evaluate(() => window.__town__.interior.robotPositions());
  await page.waitForTimeout(900);
  const idleAfter = await page.evaluate(() => window.__town__.interior.robotPositions());
  const haulerIndex = (await robotsAll()).findIndex((r) => r.id === hauler.id);
  check(
    'an idle robot holds its home',
    JSON.stringify(idleBefore[haulerIndex]) === JSON.stringify(idleAfter[haulerIndex]),
    [idleBefore[haulerIndex], idleAfter[haulerIndex]]
  );
  check(
    'the rest of the roster still wanders',
    idleAfter.some((p, i) => i !== haulerIndex && JSON.stringify(p) !== JSON.stringify(idleBefore[i]))
  );
  await page.fill('#robot-x', '5');
  await page.fill('#robot-z', '-5');
  await page.click('#robot-save');
  await page.waitForTimeout(350);
  const movedHome = (await robotsAll()).find((r) => r.id === hauler.id);
  check('the home position persists', movedHome?.pos[0] === 5 && movedHome?.pos[1] === -5, movedHome?.pos);
  check(
    'the idle robot sits on its new home',
    (await page.evaluate(() => window.__town__.interior.robotPositions()))[haulerIndex][0] === 5
  );
  await page.fill('#robot-x', '99');
  await page.click('#robot-save');
  await page.waitForTimeout(250);
  check(
    'an out-of-room home reports in the panel',
    /OUTSIDE THE ROOM/.test(await page.textContent('#robot-error')),
    await page.textContent('#robot-error')
  );
  check('an out-of-room home stores nothing', (await robotsAll()).find((r) => r.id === hauler.id)?.pos[0] === 5);
  await page.fill('#robot-x', '5');
  await page.click('#robot-save');
  await page.waitForTimeout(300);

  await page.click('.robot-card[data-type="sentinel"] [data-act="add"]');
  await page.waitForTimeout(400);
  const sentinel = (await robotsAll()).find((r) => r.type === 'sentinel');
  check('a second robot can be added', Boolean(sentinel));
  await page.click('#robot-remove');
  await page.waitForTimeout(200);
  check('delete asks to confirm', (await page.textContent('#robot-remove')) === 'CONFIRM?');
  check('the robot stays until confirmed', (await robotsAll()).some((r) => r.id === sentinel?.id));
  await page.click('#robot-remove');
  await page.waitForTimeout(400);
  check('confirming delete removes the robot', !(await robotsAll()).some((r) => r.id === sentinel?.id));
  check('delete closes the panel', !(await page.isVisible('#robot-panel')));
  check('the delete leaves the other user robot alone', (await robotsAll()).some((r) => r.id === hauler.id));

  await closeMenu(page);
  await frameRoom(page);
  const robotPoint = await page.evaluate((id) => window.__town__.projectRobot(id), hauler.id);
  check('the idle robot projects into the frame', robotPoint !== null, robotPoint);
  await page.mouse.click(robotPoint.x, robotPoint.y);
  await page.waitForTimeout(350);
  check('clicking a robot opens its panel', await page.isVisible('#robot-panel'));
  check('clicking a robot leaves the object panel closed', !(await panelVisible(page)));
  check(
    'the panel follows the clicked robot',
    (await page.evaluate(() => window.__town__.robots.panel()?.entry?.id ?? null)) === hauler.id
  );
  check('the clicked robot is selected in the room', (await page.evaluate(() => window.__town__.robots.selected())) === hauler.id);
  await page.screenshot({ path: 'shots/o-07-robot-panel.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('Escape closes the robot panel', !(await page.isVisible('#robot-panel')));
  check('Escape stays inside the room', (await mode(page)) === 'interior');

  // 9. a /space redesign replaces the spec but keeps every object
  await page.click('#interior-design');
  await page.waitForTimeout(400);
  check('design re-arms the space tool', await page.evaluate(() => window.__town__.menu.session.toolMode?.tool === 'space'));
  await send(page, '/space a cold-aisle server room for the data core');
  check('space status reports the design', (await statusText(page)) === 'SPACE ADDED TO DATA CORE HUB', await statusText(page));
  await closeMenu(page);
  await page.waitForTimeout(300);
  const designed = await stats(page);
  check('designed room carries the spec props', designed.props === 5 && designed.designed === true, designed);
  check('designed room keeps every object', designed.objects === total + 5, designed.objects);
  check('the redesign leaves the default counter alone', designed.fixtures === base, designed.fixtures);
  const afterSpace = await objects(page);
  check('objects survive the redesign in the store', afterSpace.length === total + 5, afterSpace.length);
  check(
    'the spec parts are stored as objects of their own',
    afterSpace.filter((o) => o.origin === 'spec').length === 5,
    afterSpace.map((o) => o.origin)
  );
  const afterSpaceRobots = await robotsAll();
  check(
    'the redesign replaces the roster with the spec family',
    afterSpaceRobots.filter((r) => r.origin === 'spec').length === 4 &&
      !afterSpaceRobots.some((r) => r.origin === 'default'),
    afterSpaceRobots.map((r) => r.origin)
  );
  check(
    'the redesign keeps the user robot',
    afterSpaceRobots.some((r) => r.id === hauler.id && r.origin === 'user' && r.name === 'RENAMED HAULER'),
    afterSpaceRobots.map((r) => [r.origin, r.name])
  );
  check('stats count the redesigned roster', (await stats(page)).robots === 5, await stats(page));
  check('redesign closes the inspector', !(await panelVisible(page)));
  check('redesign clears the selection', (await selected(page)) === null);
  check(
    'interior bar counts objects in the designed room',
    (await page.textContent('#interior-state')) === barLabel('AI-DESIGNED SPACE', total + 5),
    await page.textContent('#interior-state')
  );

  // 10. an AI-designed spec part is a normal editable object
  await frameRoom(page);
  const specIds = afterSpace.filter((o) => o.origin === 'spec').map((o) => o.id);
  const pickedSpec = await pickableId(page, specIds);
  check('a spec object is pickable in the room', pickedSpec !== null, pickedSpec);
  const specId = pickedSpec ?? specIds[0];
  const specEntry = afterSpace.find((o) => o.id === specId);
  await clickObject(page, specId);
  check('spec object opens the inspector', await panelVisible(page));
  check(
    'spec object inspector is editable, not read-only',
    (await page.textContent('#object-hint')) === 'DATA CORE HUB · 22 × 22',
    await page.textContent('#object-hint')
  );
  check(
    'spec object offers save, reference and remove',
    (await page.isVisible('#object-save')) &&
      (await page.isVisible('#object-reference')) &&
      (await page.isVisible('#object-remove'))
  );
  check(
    'spec object enables its controls',
    (await page.isEnabled('#object-name')) && (await page.isEnabled('#object-shape')) && (await page.isEnabled('#object-rot'))
  );
  check('spec object is selected like any other', (await selected(page)) === specId);
  check(
    'spec object seeds the shape dropdown from its part',
    (await page.inputValue('#object-shape')) === specEntry.part.kind,
    specEntry.part.kind
  );
  await page.screenshot({ path: 'shots/o-06-spec-object.png' });

  await page.fill('#object-name', 'EDITED SPEC PART');
  await page.click('#object-save');
  await page.waitForTimeout(300);
  check(
    'editing a spec object persists',
    ((await townState(page)).objects ?? []).some((o) => o.id === specId && o.name === 'EDITED SPEC PART')
  );
  const specBefore = (await objects(page)).find((o) => o.id === specId).part.pos;
  const specMoved = await page.evaluate((id) => window.__town__.objects.dragTo(id, 4, 4), specId);
  await page.waitForTimeout(300);
  check(
    'a spec object can be moved',
    Array.isArray(specMoved) && (specMoved[0] !== specBefore[0] || specMoved[1] !== specBefore[2]),
    { specBefore, specMoved }
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('Escape closes the spec inspector', !(await panelVisible(page)));

  // 10b. a second design replaces exactly the spec-derived objects
  await openMenu(page);
  await send(page, '/space a second cold-aisle layout');
  await closeMenu(page);
  await page.waitForTimeout(400);
  const secondSys = recorded.chat.messages[0].content;
  check('the second /space attaches the current space', secondSys.includes('CURRENT SPACE ('));
  const redesigned = await objects(page);
  const newSpecIds = redesigned.filter((o) => o.origin === 'spec').map((o) => o.id);
  check(
    'a second design replaces the spec objects',
    newSpecIds.length === 5 && newSpecIds.every((id) => !specIds.includes(id)),
    newSpecIds
  );
  check('the edited spec object goes with its family', !redesigned.some((o) => o.id === specId));
  check(
    'user objects survive the second design',
    redesigned.filter((o) => o.origin === 'user').length === total - base,
    redesigned.map((o) => o.origin)
  );
  check('default objects survive the second design', redesigned.filter((o) => o.origin === 'default').length === base);
  const afterSecond = await stats(page);
  check(
    'the counters follow the replacement',
    afterSecond.props === 5 && afterSecond.fixtures === base && afterSecond.objects === total + 5,
    afterSecond
  );

  // 11. removing an object is a two-step confirm
  await clickObject(page, rackId);
  check('rack selected for removal', await panelVisible(page));
  await page.click('#object-remove');
  await page.waitForTimeout(150);
  check('remove asks for confirmation', (await page.textContent('#object-remove')) === 'CONFIRM?');
  check('remove keeps the object until confirmed', (await objects(page)).length === total + 5);
  await page.click('#object-remove');
  await page.waitForTimeout(300);
  check('confirmed remove drops the object', (await objects(page)).length === total + 4);
  check('removed object leaves the scene', (await stats(page)).objects === total + 4);
  check('removed object clears the selection', (await selected(page)) === null);
  check('removed object closes the inspector', !(await panelVisible(page)));
  check(
    'removed object is gone from storage',
    !((await townState(page)).objects ?? []).some((o) => o.id === rackId)
  );

  await exitInterior(page);
  check('back in town mode', (await mode(page)) === 'town');
  check('inspector hidden after exit', !(await panelVisible(page)));
  check('interior scene released on exit', (await page.evaluate(() => window.__town__.interior.sceneChildren())) <= 3);

  // 12. objects survive a reload and stay editable
  await page.reload();
  await page.waitForFunction(() => window.__TOWN_READY__ === true, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  check('objects survive reload', ((await townState(page)).objects ?? []).length === total + 4);
  await page.evaluate(() => window.__town__.enterBuilding('datacore'));
  await page.waitForTimeout(500);
  check('designed building re-enters after reload', (await mode(page)) === 'interior');
  const afterReload = await stats(page);
  check('objects rebuilt after reload', afterReload.objects === total + 4, afterReload.objects);
  check(
    'the default and spec counters survive the reload',
    afterReload.fixtures === base && afterReload.props === 5,
    afterReload
  );
  const reloadedIds = await page.evaluate(() => window.__town__.interior.objectIds());
  check('object ids restored after reload', reloadedIds.length === total + 4, reloadedIds.length);
  await frameRoom(page);
  const pickedReloaded = await pickableId(page, reloadedIds);
  check('a reloaded object is pickable', pickedReloaded !== null, pickedReloaded);
  const reloadedId = pickedReloaded ?? reloadedIds[0];
  await clickObject(page, reloadedId);
  check('reloaded object is selectable', await panelVisible(page));
  const renamed = await page.evaluate(
    (id) => window.__town__.objects.save(id, { name: 'RELOADED AND RENAMED' }),
    reloadedId
  );
  check('reloaded object is editable', renamed.ok === true, renamed);
  check(
    'rename persisted after reload',
    ((await townState(page)).objects ?? []).some((o) => o.id === reloadedId && o.name === 'RELOADED AND RENAMED')
  );
  check('inspector shows the renamed object', (await page.inputValue('#object-name')) === 'RELOADED AND RENAMED');
  await exitInterior(page);

  // 13. removing a custom building drops its objects
  await openMenu(page);
  await page.click('#btn-expand-map');
  await page.waitForTimeout(500);
  await closeMenu(page);
  const libId = await page.evaluate(() => {
    const res = window.__town__.townStore.addBuilding({
      name: 'COURIER DEPOT',
      description: 'Sorting depot where courier bots drop reclaimed parts.',
      spec: {
        name: 'COURIER DEPOT',
        description: 'Sorting depot where courier bots drop reclaimed parts.',
        footprint: [10, 10],
        parts: [{ kind: 'box', mat: 'wallGray', size: [8, 5, 8], pos: [0, 2.5, 0] }],
      },
      x: 64,
      z: -32,
    });
    return res.ok ? res.libraryId : null;
  });
  check('custom building added', libId !== null);
  const depotAdded = await page.evaluate(
    ([id, part]) => window.__town__.townStore.addObject(id, { name: 'DEPOT TANK', part, rot: 0 }),
    [libId, TANK]
  );
  check('object added to the custom room', depotAdded.ok === true, depotAdded);
  check('every object is stored', ((await townState(page)).objects ?? []).length === total + 5);
  await page.evaluate((id) => window.__town__.enterBuilding(id), libId);
  await page.waitForTimeout(400);
  if (await page.isVisible('#confirm-no')) await page.click('#confirm-no');
  await page.waitForTimeout(400);
  const depotStats = await stats(page);
  check('the custom shell seeds its own default layout', depotStats.fixtures >= 3, depotStats);
  check('custom shell carries its object', depotStats.objects === depotStats.fixtures + 1, depotStats);
  const depotBase = depotStats.objects;
  const depotSpot = await page.evaluate((part) => window.__town__.interior.freeSpotFor(part, 0), RACK);
  check('a 10 × 10 room still finds a free spot for a rack', Array.isArray(depotSpot), depotSpot);

  // 13b. the gallery works in any room and reports a full one
  await openObjectsTab(page);
  check('room heading follows the building', (await page.textContent('#objects-room-title')) === 'IN COURIER DEPOT');
  check('room list shows the depot room', (await page.locator('.object-row').count()) === depotBase, depotBase);
  check(
    'room list names the depot object',
    (await page.locator('.object-row__name').allTextContents()).includes('DEPOT TANK'),
    await page.locator('.object-row__name').allTextContents()
  );
  await page.click('.object-card[data-kind="chest"] button[data-act="create"]');
  await page.waitForTimeout(350);
  const depotObjects = await objects(page);
  check(
    'a second category creates too',
    depotObjects.length === depotBase + 1 &&
      depotObjects.at(-1).name === 'TOOL CHEST' &&
      depotObjects.at(-1).part.kind === 'chest',
    depotObjects.length
  );
  check(
    'depot creation reports its room',
    (await page.textContent('#objects-status')) === 'TOOL CHEST ADDED TO COURIER DEPOT',
    await page.textContent('#objects-status')
  );
  check('depot room list follows the store', (await page.locator('.object-row').count()) === depotBase + 1);
  const filler = await page.evaluate((id) => {
    return window.__town__.townStore.addObject(id, {
      name: 'FILLER BLOCK',
      part: { kind: 'box', mat: 'wallGray', size: [9.4, 4, 9.4], pos: [0, 2, 0] },
      rot: 0,
    });
  }, libId);
  check('floor filled with one block', filler.ok === true, filler);
  await page.waitForTimeout(300);
  await page.click('.object-card[data-kind="plant"] button[data-act="create"]');
  await page.waitForTimeout(350);
  check(
    'a full room reports no free space',
    (await page.textContent('#objects-status')) === 'NO FREE FLOOR SPACE IN COURIER DEPOT FOR THAT OBJECT',
    await page.textContent('#objects-status')
  );
  check('no-free-space status marked error', (await page.getAttribute('#objects-status', 'data-status')) === 'error');
  check('a full room stores nothing', (await objects(page)).length === depotBase + 2, (await objects(page)).length);
  await closeMenu(page);
  await exitInterior(page);

  await openMenu(page);
  await page.click('#tab-btn-gallery');
  await page.fill('#gallery-search', 'courier');
  const removeBtn = page.locator('.gallery-card[data-custom="true"] button[data-act="remove"]');
  check('custom card found in the gallery', (await removeBtn.count()) === 1);
  await removeBtn.click();
  await removeBtn.click();
  await page.waitForTimeout(400);
  const afterRemove = await townState(page);
  check('custom building removed', afterRemove.placements.length === 0);
  check(
    'removing the building drops its objects',
    afterRemove.objects.length === total + 4 && afterRemove.objects.every((o) => o.buildingId === 'datacore'),
    afterRemove.objects.length
  );
  check(
    'removing the building drops its seeded marker',
    !(afterRemove.seeded ?? []).includes(libId) && (afterRemove.seeded ?? []).includes('datacore'),
    afterRemove.seeded
  );
  await closeMenu(page);

  // 14. drawer and inspector coexist at 1280 px and at the narrow breakpoint
  for (const [w, h, shot] of [
    [1280, 800, 'o-07-1280'],
    [480, 900, 'o-08-narrow'],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__town__.enterBuilding('datacore'));
    await page.waitForTimeout(500);
    check(`designed room re-enters at ${w} px`, (await mode(page)) === 'interior');
    const ids = await page.evaluate(() => window.__town__.interior.objectIds());
    await page.evaluate((id) => window.__town__.objects.select(id), ids[0]);
    await page.waitForTimeout(250);
    check(`inspector opens at ${w} px`, await panelVisible(page));
    const alone = await page.locator('#object-panel').boundingBox();
    check(
      `inspector fits the viewport at ${w} px`,
      alone.x >= 0 && alone.x + alone.width <= w && alone.y + alone.height <= h,
      alone
    );
    await openObjectsTab(page);
    const drawer = await page.locator('#menu-panel').boundingBox();
    const withDrawer = await page.locator('#object-panel').boundingBox();
    const overlap =
      withDrawer.x < drawer.x + drawer.width &&
      drawer.x < withDrawer.x + withDrawer.width &&
      withDrawer.y < drawer.y + drawer.height &&
      drawer.y < withDrawer.y + withDrawer.height;
    if (w > 520) {
      check(`drawer and inspector coexist at ${w} px`, !overlap, { drawer, panel: withDrawer });
    } else {
      check(`drawer spans the narrow viewport`, drawer.width >= w - 1, drawer);
    }
    const tabHeights = await page.locator('.menu-tab').evaluateAll((nodes) =>
      nodes.map((n) => Math.round(n.getBoundingClientRect().height))
    );
    check(`five tab labels stay on one line at ${w} px`, tabHeights.length === 5 && tabHeights.every((t) => t < 46), tabHeights);
    check(
      `tab labels intact at ${w} px`,
      (await page.locator('.menu-tab').allTextContents()).join('|') === 'AI|BUILDINGS|OBJECTS|ROBOTS|SETTINGS',
      await page.locator('.menu-tab').allTextContents()
    );
    check(
      `catalog usable at ${w} px`,
      (await page.isVisible('#objects-search')) && (await page.locator('.object-card').count()) === 20
    );
    await page.screenshot({ path: `shots/${shot}.png` });
    await closeMenu(page);
    if (w <= 520) {
      check('inspector survives the closed drawer', await panelVisible(page));
      const after = await page.locator('#object-panel').boundingBox();
      check('inspector still fits after the drawer closes', after.x + after.width <= w && after.y + after.height <= h, after);
    }
    await exitInterior(page);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);

  check('no uncaught page errors', pageErrors.length === 0, pageErrors);
  check('all checks', failures === 0);
  await browser.close();
} catch (err) {
  console.error(err);
  failures++;
} finally {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill();
  }
}

process.exit(failures ? 1 : 0);
