import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 5195;
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
const NOJSON_REPLY = 'Tell me what the room is for and how many units work in it, then I will lay it out.';

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

const brokenForRoom = (w) => ({
  description: 'A room that ignores its own walls.',
  robots: 2,
  parts: [
    { kind: 'rack', size: [2, 3, 1], pos: [w, 1.55, 0] },
    { kind: 'sofa', size: [2, 1, 1], pos: [0, 0.5, 0] },
  ],
});

const BUILTIN_IDS = [
  'housing',
  'labs',
  'solararray',
  'powerstorage',
  'droneport',
  'recycling',
  'manufacturing',
  'maintenance',
  'datacore',
  'warehouse',
  'gardens',
  'aistrategy',
];

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

async function townState(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('robot-town.town.v1') ?? '{}'));
}

async function mode(page) {
  return page.evaluate(() => window.__town__.mode());
}

async function interiorStats(page) {
  return page.evaluate(() => window.__town__.interior.stats());
}

// The bar appends " · N OBJECTS", and every room now holds its seeded default layout.
async function interiorStateIs(page, base) {
  const text = (await page.textContent('#interior-state')).trim();
  const { objects } = await interiorStats(page);
  return text === (objects ? `${base} · ${objects} OBJECT${objects === 1 ? '' : 'S'}` : base);
}

async function send(page, text) {
  await page.click('#tab-btn-ai');
  await page.fill('#chat-input', text);
  await page.click('#chat-send');
  await page.waitForFunction(() => !document.getElementById('chat-send').disabled, null, { timeout: 10000 });
  await page.waitForTimeout(200);
}

async function statusText(page) {
  return (await page.textContent('#chat-status')).trim();
}

async function centerOn(page, x, z) {
  await page.evaluate(
    ([tx, tz]) => {
      const t = window.__town__;
      t.controls.target.set(tx, 0, tz);
      t.camera.position.set(tx + 72, 78, tz + 72);
      t.controls.update();
    },
    [x, z]
  );
  await page.waitForTimeout(200);
}

async function cameraPos(page, which) {
  const arr = await page.evaluate((w) => {
    const t = window.__town__;
    return (w === 'town' ? t.camera : t.interior.camera).position.toArray();
  }, which);
  return arr.map(round2);
}

async function exitInterior(page) {
  if (await page.isVisible('#interior-exit')) await page.click('#interior-exit');
  else await page.evaluate(() => window.__town__.interior.exit());
  await page.waitForTimeout(250);
}

async function clickBuilding(page, id) {
  const p = await page.evaluate((bid) => window.__town__.projectBuilding(bid), id);
  if (!p) return null;
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(350);
  return p;
}

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
    if (!sessionStorage.getItem('rt-spaces-cleared')) {
      localStorage.removeItem('robot-town.ai.v1');
      localStorage.removeItem('robot-town.town.v1');
      sessionStorage.setItem('rt-spaces-cleared', '1');
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
    const reply = /INVALID/i.test(last)
      ? fenced(brokenForRoom(dims.w), 'Here is a room that ignores its walls.')
      : /NOJSON/i.test(last)
        ? NOJSON_REPLY
        : fenced(spaceForRoom(dims.w, dims.d, dims.h), 'Here is the server room.');
    r.fulfill(sse(sseFromText(reply)));
  });

  await boot(page);
  check('town mode on boot', (await mode(page)) === 'town');
  check('interior bar hidden on boot', !(await page.isVisible('#interior-bar')));
  check('no spaces stored on boot', ((await townState(page)).spaces ?? []).length === 0);

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

  // 1. clicking an undesigned building offers the choice
  const corePoint = await clickBuilding(page, 'datacore');
  check('building click is pickable', corePoint !== null);
  check('prompt bar appears for an undesigned building', await page.isVisible('#confirm-bar'));
  check(
    'prompt names the building',
    (await page.textContent('#confirm-bar-label')) === 'NO INDOOR SPACE FOR DATA CORE HUB — DESIGN ONE WITH AI?'
  );
  check(
    'prompt offers design and shell',
    (await page.textContent('#confirm-yes')) === 'DESIGN WITH AI' && (await page.textContent('#confirm-no')) === 'ENTER SHELL'
  );
  check('prompt does not enter the interior', (await mode(page)) === 'town');
  await page.screenshot({ path: 'shots/s-01-prompt.png' });

  // 2. declining still enters the generated shell
  await page.click('#confirm-no');
  await page.waitForTimeout(500);
  check('ENTER SHELL switches to interior mode', (await mode(page)) === 'interior');
  check('interior bar visible', await page.isVisible('#interior-bar'));
  check('interior bar names the building', (await page.textContent('#interior-name')) === 'DATA CORE HUB');
  check(
    'interior bar flags the generated shell',
    await interiorStateIs(page, 'GENERATED SHELL — NOT DESIGNED YET')
  );
  check('shell state marked undesigned', (await page.getAttribute('#interior-state', 'data-designed')) === 'no');
  check('prompt bar hidden inside', !(await page.isVisible('#confirm-bar')));

  const room = await page.evaluate(() => window.__town__.interior.room());
  check('room width follows the footprint', room.w === 22);
  check('room depth follows the footprint', room.d === 22);
  check('wall height derived from the room', room.wallHeight === 8);
  check('room keeps a robot margin', room.margin === 1.2);

  const shell = await interiorStats(page);
  check('shell carries theme fixtures', shell.fixtures >= 3);
  check('shell has no designed props', shell.props === 0 && shell.designed === false);
  check('shell populates robots from the room size', shell.robots >= 2 && shell.robots <= 12);
  check('shell reports the building type', shell.type === 'datacore');

  // The town seeds a roster for every building at startup, so state.robots is
  // town-wide; the shell assertions are about the data core's own roster.
  const shellRoster = ((await townState(page)).robots ?? []).filter((r) => r.buildingId === 'datacore');
  check('the shell roster is stored for the building', shellRoster.length === shell.robots, shellRoster.length);
  check(
    'stored shell robots are wandering defaults',
    shellRoster.every((r) => r.origin === 'default' && r.wander === true),
    shellRoster.map((r) => [r.origin, r.wander])
  );

  const first = await page.evaluate(() => window.__town__.interior.robotPositions());
  await page.waitForTimeout(700);
  const second = await page.evaluate(() => window.__town__.interior.robotPositions());
  check('robots are positioned in the room', first.length === shell.robots);
  check('robots move over time', JSON.stringify(first) !== JSON.stringify(second));
  check(
    'robots stay inside the walls',
    second.every(([x, z]) => Math.abs(x) <= room.w / 2 && Math.abs(z) <= room.d / 2)
  );
  check('town chips hidden inside', !(await page.isVisible('#sector-chip')) && !(await page.isVisible('#map-chip')));
  await page.screenshot({ path: 'shots/s-02-shell.png' });

  await page.mouse.move(corePoint.x, corePoint.y);
  await page.waitForTimeout(250);
  check(
    'town tooltip suppressed inside',
    !(await page.evaluate(() => document.getElementById('tooltip').classList.contains('visible')))
  );

  const townCamBefore = await cameraPos(page, 'town');
  const innerBefore = await cameraPos(page, 'interior');
  await page.mouse.move(720, 450);
  await page.mouse.down();
  await page.mouse.move(790, 410, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const innerAfter = await cameraPos(page, 'interior');
  const townCamAfter = await cameraPos(page, 'town');
  check('dragging orbits the interior camera', JSON.stringify(innerBefore) !== JSON.stringify(innerAfter));
  check('dragging leaves the town camera alone', JSON.stringify(townCamBefore) === JSON.stringify(townCamAfter));
  check('interior camera stays above the floor', innerAfter[1] > 0);

  // 3. exiting returns to the sector
  await page.click('#interior-exit');
  await page.waitForTimeout(400);
  check('EXIT TO SECTOR returns to town mode', (await mode(page)) === 'town');
  check('interior bar hidden after exit', !(await page.isVisible('#interior-bar')));
  check('town chips restored after exit', (await page.isVisible('#sector-chip')) && (await page.isVisible('#map-chip')));
  check('town camera intact after exit', JSON.stringify(townCamBefore) === JSON.stringify(await cameraPos(page, 'town')));
  check(
    'interior scene released on exit',
    (await page.evaluate(() => window.__town__.interior.sceneChildren())) <= 3
  );
  check('no space stored for a shell visit', ((await townState(page)).spaces ?? []).length === 0);

  // Escape leaves the interior too
  await clickBuilding(page, 'datacore');
  await page.click('#confirm-no');
  await page.waitForTimeout(400);
  check('shell re-entry works', (await mode(page)) === 'interior');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Escape exits the interior', (await mode(page)) === 'town');

  // 4. designing with the AI
  await clickBuilding(page, 'datacore');
  await page.click('#confirm-yes');
  await page.waitForTimeout(450);
  check('DESIGN WITH AI opens the menu', await page.evaluate(() => document.getElementById('menu-panel').classList.contains('open')));
  check('DESIGN WITH AI opens the AI tab', (await page.getAttribute('#tab-btn-ai', 'aria-selected')) === 'true');
  check('design choice stays out of the interior', (await mode(page)) === 'town');
  check('prompt bar hidden after choosing design', !(await page.isVisible('#confirm-bar')));
  check(
    'banner carries the building reference',
    (await page.textContent('#chat-site-text')) === 'BUILDING DATA CORE HUB · 22 × 22 · SECTOR A1'
  );
  check('banner clear button follows the reference', (await page.textContent('#chat-site-clear')) === 'CLEAR BUILDING');
  check('input pre-seeded with /space', (await page.inputValue('#chat-input')) === '/space ');
  check(
    'tool mode holds the building',
    await page.evaluate(
      () => window.__town__.menu.session.toolMode?.tool === 'space' && window.__town__.menu.session.toolMode?.building?.id === 'datacore'
    )
  );

  await send(page, '/space a cold-aisle server room for the data core');
  const sys = recorded.chat.messages[0].content;
  check('system prompt preloads the space tool', sys.includes('TOOL create_space') && sys.includes('SCHEMA:'));
  check(
    'system prompt lists the space vocabulary',
    sys.includes('box, rbox, cyl, screen, rack, desk, plant, pad, crate, tank')
  );
  check('system prompt lists the material whitelist', sys.includes('wallGray') && sys.includes('cyanSoft'));
  check(
    'system prompt carries the room reference',
    sys.includes('ROOM REFERENCE: DATA CORE HUB · 22 x 22 · WALL HEIGHT 8 · TYPE datacore')
  );
  check('system prompt states the y origin', sys.includes('0 = floor'));
  check('system prompt carries the building description', sys.includes('Central compute and telemetry vault'));
  check('system prompt includes a worked space example', sys.includes('Cold-aisle server room with two rack rows'));
  check(
    'slash command stripped from the user turn',
    recorded.chat.messages.at(-1).content === 'a cold-aisle server room for the data core'
  );
  check('first /space reports no current space', sys.includes('CURRENT SPACE: none'));
  check('first /space carries the update instruction', sys.includes('UPDATE MODE'));

  const stored = await townState(page);
  check('space stored for the building', stored.spaces.length === 1 && stored.spaces[0].buildingId === 'datacore');
  check('stored spec keeps its parts', stored.spaces[0].spec.parts.length === 5);
  check('stored spec keeps the robot count', stored.spaces[0].spec.robots === 4);
  check('status reports the new space', (await statusText(page)) === 'SPACE ADDED TO DATA CORE HUB');
  check('status marked ok', (await page.getAttribute('#chat-status', 'data-status')) === 'ok');
  check('designing enters the interior', (await mode(page)) === 'interior');

  const designed = await interiorStats(page);
  check('designed room flags the spec', designed.designed === true);
  check('designed props added on top of the fixtures', designed.props === 5 && designed.fixtures >= 3);
  check('robot count follows the spec', designed.robots === 4);
  const designedRoster = ((await townState(page)).robots ?? []).filter((r) => r.buildingId === 'datacore');
  check(
    'the design replaces the roster with the spec family',
    designedRoster.length === 4 && designedRoster.every((r) => r.origin === 'spec'),
    designedRoster.map((r) => r.origin)
  );
  check('the design drops the shell defaults', !designedRoster.some((r) => r.origin === 'default'));
  check(
    'interior bar flags the design',
    (await interiorStateIs(page, 'AI-DESIGNED SPACE')) &&
      (await page.getAttribute('#interior-state', 'data-designed')) === 'yes'
  );
  await page.screenshot({ path: 'shots/s-03-designed.png' });

  // 5. invalid and prose-only replies are rejected
  await send(page, '/space INVALID');
  const sys2 = recorded.chat.messages[0].content;
  check('second /space attaches the current space', sys2.includes('CURRENT SPACE (5 parts, 4 robots):'));
  check('second /space echoes the stored design', sys2.includes('-8.6') && sys2.includes('9.7'));
  check('second /space demands the complete spec', sys2.includes('COMPLETE updated spec'));
  check('second /space keeps the room reference', sys2.includes('ROOM REFERENCE: DATA CORE HUB'));
  check('invalid space rejected in the status line', /OUTSIDE THE ROOM|UNKNOWN KIND/.test(await statusText(page)));
  check('invalid space status marked error', (await page.getAttribute('#chat-status', 'data-status')) === 'error');
  check('invalid space leaves the stored design alone', (await townState(page)).spaces.length === 1);
  check('invalid space keeps the designed room', (await interiorStats(page)).props === 5);

  await send(page, '/space NOJSON');
  check('reply without JSON reports the extraction failure', /NO JSON/.test(await statusText(page)));
  check('reply without JSON stores nothing', (await townState(page)).spaces.length === 1);

  // 6. a designed building enters straight away
  await closeMenu(page);
  await page.click('#interior-exit');
  await page.waitForTimeout(400);
  await clickBuilding(page, 'datacore');
  check('designed building enters immediately', (await mode(page)) === 'interior');
  check('designed building raises no prompt', !(await page.isVisible('#confirm-bar')));
  check('designed props rebuilt on re-entry', (await interiorStats(page)).props === 5);
  const back = await page.evaluate(() => window.__town__.interior.robotPositions());
  await page.waitForTimeout(700);
  check(
    'robots still move in the designed room',
    JSON.stringify(back) !== JSON.stringify(await page.evaluate(() => window.__town__.interior.robotPositions()))
  );
  await page.click('#interior-exit');
  await page.waitForTimeout(300);

  // 6b. every built-in type generates a furnished shell
  const weakShells = [];
  for (const id of BUILTIN_IDS) {
    await page.evaluate((bid) => window.__town__.enterBuilding(bid), id);
    await page.waitForTimeout(120);
    if (await page.isVisible('#confirm-no')) await page.click('#confirm-no');
    await page.waitForTimeout(220);
    const s = await interiorStats(page);
    if (!s.name || s.fixtures < 1 || s.robots < 1 || !s.room?.w) weakShells.push({ id, ...s });
    await exitInterior(page);
  }
  check('every built-in type generates a furnished shell', weakShells.length === 0, weakShells);
  check('shells leave the town mode afterwards', (await mode(page)) === 'town');

  // 7. custom buildings get interiors too
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
  check('custom building added to the town', libId !== null);
  await centerOn(page, 64, -32);
  const depotPoint = await clickBuilding(page, libId);
  check('custom building is clickable', depotPoint !== null);
  check(
    'custom prompt names the custom record',
    (await page.textContent('#confirm-bar-label')) === 'NO INDOOR SPACE FOR COURIER DEPOT — DESIGN ONE WITH AI?'
  );
  await page.click('#confirm-yes');
  await page.waitForTimeout(450);
  check(
    'custom banner carries the CUSTOM badge',
    (await page.textContent('#chat-site-text')) === 'BUILDING COURIER DEPOT · 10 × 10 · CUSTOM'
  );
  check(
    'custom tool mode holds the library id',
    await page.evaluate((id) => window.__town__.menu.session.toolMode?.building?.id === id, libId)
  );
  await send(page, '/space a sorting depot floor with racks and a duty desk');
  const customSys = recorded.chat.messages[0].content;
  check(
    'custom room reference uses the custom footprint',
    customSys.includes('ROOM REFERENCE: COURIER DEPOT · 10 x 10 · WALL HEIGHT 5 · TYPE custom')
  );
  const withCustom = await townState(page);
  check('two spaces stored', withCustom.spaces.length === 2);
  check(
    'custom space keyed to the library id',
    withCustom.spaces.some((s) => s.buildingId === libId)
  );
  const customStatus = await statusText(page);
  check('custom space reports in the status line', customStatus === 'SPACE ADDED TO COURIER DEPOT', customStatus);
  check('custom interior entered', (await mode(page)) === 'interior');
  const depotRoom = await page.evaluate(() => window.__town__.interior.room());
  check('custom room follows the custom footprint', depotRoom.w === 10 && depotRoom.d === 10 && depotRoom.wallHeight === 5, depotRoom);
  const depotStats = await interiorStats(page);
  check('custom room carries the designed props', depotStats.props === 5, depotStats);
  check('custom interior bar visible', await page.isVisible('#interior-bar'));
  await page.screenshot({ path: 'shots/s-04-custom.png' });
  await closeMenu(page);
  await exitInterior(page);
  await page.waitForTimeout(300);

  // 8. persistence
  await page.reload();
  await page.waitForFunction(() => window.__TOWN_READY__ === true, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const reloaded = await townState(page);
  check('spaces survive reload', reloaded.spaces.length === 2);
  check('datacore space survives reload', reloaded.spaces.some((s) => s.buildingId === 'datacore'));
  await clickBuilding(page, 'datacore');
  check('designed building enters immediately after reload', (await mode(page)) === 'interior');
  check('designed props restored after reload', (await interiorStats(page)).props === 5);
  check(
    'interior bar still flags the design after reload',
    await interiorStateIs(page, 'AI-DESIGNED SPACE')
  );
  const r1 = await page.evaluate(() => window.__town__.interior.robotPositions());
  await page.waitForTimeout(700);
  check(
    'robots move after reload',
    JSON.stringify(r1) !== JSON.stringify(await page.evaluate(() => window.__town__.interior.robotPositions()))
  );
  await page.screenshot({ path: 'shots/s-05-reloaded.png' });
  await page.click('#interior-exit');
  await page.waitForTimeout(300);

  // 9. removing a custom building drops its space
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
  check('removing the building drops its space', afterRemove.spaces.length === 1 && afterRemove.spaces[0].buildingId === 'datacore');
  await closeMenu(page);

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
