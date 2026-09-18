import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 5196;
const ORIGIN = `http://localhost:${PORT}`;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--logLevel', 'error'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let failures = 0;
function check(label, cond) {
  console.log((cond ? 'PASS: ' : 'FAIL: ') + label);
  if (!cond) failures++;
}

const CORS = { 'access-control-allow-origin': '*' };
const sse = (body) => ({ status: 200, contentType: 'text/event-stream', headers: CORS, body });
const json = (obj, status = 200) => ({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(obj) });

const TOWER = {
  name: 'LOOKOUT TOWER',
  description: 'A slim observation tower with a glazed cab and a beacon mast.',
  footprint: [6, 6],
  parts: [
    { kind: 'box', mat: 'wallGray', size: [4, 4, 4], pos: [0, 2, 0] },
    { kind: 'cyl', mat: 'wallDark', r: 1.2, h: 3, seg: 12, pos: [0, 5.5, 0] },
    { kind: 'screen', mat: 'screen', size: [2.2, 1.2], pos: [0, 5.5, 1.25] },
    { kind: 'antenna', h: 3, pos: [0, 7, 0] },
  ],
};

const BROKEN = {
  name: 'OVERSIZED HANGAR',
  description: 'Too big for the plot and built from an unknown material.',
  footprint: [40, 40],
  parts: [{ kind: 'box', mat: 'steel', size: [30, 8, 30], pos: [0, 4, 0] }],
};

const fenced = (spec, tail) => '```json\n' + JSON.stringify(spec, null, 2) + '\n```\n' + tail;
const VALID_REPLY = fenced(TOWER, 'Here is the tower for the plot you picked.');
const INVALID_REPLY = fenced(BROKEN, 'Here is the hangar.');
const NOJSON_REPLY = 'I need more detail before I can design that — tell me the height and the materials.';

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

async function stats(page) {
  return page.evaluate(() => window.__town__.townStats());
}

async function townState(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('robot-town.town.v1')));
}

async function aiState(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('robot-town.ai.v1')));
}

async function sendBuilding(page, text) {
  await page.click('#tab-btn-ai');
  await page.fill('#chat-input', text);
  await page.click('#chat-send');
  await page.waitForFunction(() => !document.getElementById('chat-send').disabled, null, { timeout: 10000 });
  await page.waitForTimeout(120);
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

try {
  await waitForServer();
  mkdirSync('shots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to fetch|Failed to load resource|ERR_CONNECTION_REFUSED/i.test(m.text())) {
      console.log('CONSOLE ERROR:', m.text());
    }
  });

  await page.addInitScript(() => {
    if (!sessionStorage.getItem('rt-features-cleared')) {
      localStorage.removeItem('robot-town.ai.v1');
      localStorage.removeItem('robot-town.town.v1');
      sessionStorage.setItem('rt-features-cleared', '1');
    }
  });

  await page.route('**/mock/openai/v1/models', (r) => r.fulfill(json({ data: [{ id: 'mock-builder' }] })));
  await page.route('**/mock/openai/v1/chat/completions', (r) => {
    const body = r.request().postDataJSON();
    recorded.chat = body;
    const last = [...body.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const reply = /INVALID/i.test(last) ? INVALID_REPLY : /NOJSON/i.test(last) ? NOJSON_REPLY : VALID_REPLY;
    r.fulfill(sse(sseFromText(reply)));
  });

  await boot(page);
  await page.screenshot({ path: 'shots/f-01-default.png' });

  const base = await stats(page);
  check('baseline grid is 4x4 lines with 9 blocks', base.roadLinesX === 4 && base.roadLinesZ === 4 && base.blocks === 9);
  check('baseline has 16 intersections', base.intersections === 16);
  check('baseline has 12 built-in buildings', base.buildings === 12);
  check('core island has no free build sites', base.freeCells === 0);

  // The same stored robots also walk the outdoor town.
  const fleet = await page.evaluate(() => ({
    count: window.__town__.townRobots.count(),
    stored: window.__town__.robots.all().length,
  }));
  check('the town walks every stored robot', fleet.count > 0 && fleet.count === fleet.stored, `${fleet.count} of ${fleet.stored}`);
  check('the town is seeded on first load', fleet.count >= 12, fleet.count);

  const roamA = await page.evaluate(() => window.__town__.townRobots.positions());
  await page.waitForTimeout(700);
  const roamB = await page.evaluate(() => window.__town__.townRobots.positions());
  check('town robots move over time', JSON.stringify(roamA) !== JSON.stringify(roamB));

  const clearance = await page.evaluate(() => {
    const t = window.__town__.townRobots;
    const { radius, bounds } = t.stats();
    const boxes = t.obstacles();
    const pos = t.positions();
    let closest = Infinity;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        closest = Math.min(closest, Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1]));
      }
    }
    return {
      obstacles: boxes.length,
      inside: pos.filter(([x, z]) =>
        boxes.some((b) => x > b.minX - radius && x < b.maxX + radius && z > b.minZ - radius && z < b.maxZ + radius)
      ).length,
      escaped: pos.filter(
        ([x, z]) => x < bounds.minX - radius || x > bounds.maxX + radius || z < bounds.minZ - radius || z > bounds.maxZ + radius
      ).length,
      closest,
      min: radius * 2,
    };
  });
  check(
    'town robots keep clear of every building, tree and pad',
    clearance.inside === 0,
    `${clearance.inside} inside ${clearance.obstacles} obstacles`
  );
  check('town robots stay inside the map', clearance.escaped === 0, clearance.escaped);
  check(
    'town robots do not walk through each other',
    clearance.closest >= clearance.min - 0.02,
    `${clearance.closest} apart, minimum ${clearance.min}`
  );

  const spread = await page.evaluate(() => {
    const t = window.__town__.townRobots;
    const pos = t.positions();
    const { bounds } = t.stats();
    const xs = pos.map((p) => p[0]);
    const zs = pos.map((p) => p[1]);
    return {
      spanX: Math.max(...xs) - Math.min(...xs),
      spanZ: Math.max(...zs) - Math.min(...zs),
      width: bounds.maxX - bounds.minX,
      awayFromCore: pos.filter(([x, z]) => Math.hypot(x, z) > 20).length,
      total: pos.length,
    };
  });
  check(
    'town robots roam the whole map',
    spread.spanX > spread.width * 0.5 && spread.spanZ > spread.width * 0.5,
    JSON.stringify(spread)
  );
  check('town robots leave the core island', spread.awayFromCore > 0, `${spread.awayFromCore} of ${spread.total}`);

  // Street robots walk, so re-project immediately before each mouse action;
  // a point captured a few hundred milliseconds earlier is already stale.
  const roster = await page.evaluate(() => window.__town__.robots.all().map((r) => ({ id: r.id, name: r.name })));
  let street = null;
  for (const r of roster) {
    const at = await page.evaluate((id) => window.__town__.projectTownRobot(id), r.id);
    if (!at || at.x < 40 || at.x > 1400 || at.y < 40 || at.y > 860) continue;
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(120);
    const tip = await page.evaluate(() => {
      const node = document.getElementById('tooltip');
      return node.classList.contains('visible') ? node.textContent : null;
    });
    if (tip === r.name) {
      street = r;
      break;
    }
  }
  check('hovering a street robot names it', Boolean(street), `tried ${roster.length} robots`);
  check(
    'hovering a street robot offers the pointer',
    (await page.evaluate(() => document.querySelector('#app canvas').style.cursor)) === 'pointer'
  );

  let picked = null;
  for (let attempt = 0; attempt < 6 && street; attempt++) {
    const at = await page.evaluate((id) => window.__town__.projectTownRobot(id), street.id);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(200);
    picked = await page.evaluate(() => window.__town__.townRobots.selected());
    if (picked) break;
  }
  check('clicking a street robot selects it', picked === street?.id, `${picked} vs ${street?.id}`);
  check(
    'the selection draws one outline',
    (await page.evaluate(
      () => window.__town__.scene.getObjectByName('town-robots').children.filter((c) => c.isLineSegments).length
    )) === 1
  );
  check('selecting a street robot stays in the town', (await page.evaluate(() => window.__town__.mode())) === 'town');
  check(
    'selecting a street robot opens no inspector',
    (await page.evaluate(() => window.__town__.robots.panel())) === null
  );

  const core = await page.evaluate(() => window.__town__.projectBuilding('datacore'));
  await page.mouse.move(core.x, core.y);
  await page.waitForTimeout(200);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);
  if (await page.isVisible('#confirm-no')) await page.click('#confirm-no');
  await page.waitForTimeout(500);
  check('clicking a building still enters it', (await page.evaluate(() => window.__town__.mode())) === 'interior');
  check(
    'entering a building clears the street selection',
    (await page.evaluate(() => window.__town__.townRobots.selected())) === null
  );
  await page.evaluate(() => window.__town__.interior.exit());
  await page.waitForTimeout(300);
  check('the town is back afterwards', (await page.evaluate(() => window.__town__.mode())) === 'town');
  await page.screenshot({ path: 'shots/f-01b-town-robots.png' });

  await openMenu(page);
  check('gallery tab button exists', await page.isVisible('#tab-btn-gallery'));
  check('actions row shows expand counter', (await page.textContent('#btn-expand-map')) === 'EXPAND MAP (0/4)');
  check('site button disabled with no free plots', await page.isDisabled('#btn-select-site'));
  check(
    'site button explains the disabled state',
    (await page.textContent('#btn-select-site')) === 'ADD BUILDING (EXPAND MAP FIRST)'
  );

  await page.click('#tab-btn-gallery');
  check('gallery tabpanel visible', await page.isVisible('#tab-gallery'));
  check('gallery lists all 12 built-ins', (await page.locator('.gallery-card').count()) === 12);
  check('gallery count label reads 12 OF 12', (await page.textContent('#gallery-count')) === '12 OF 12');
  const descs = await page.evaluate(() =>
    [...document.querySelectorAll('.gallery-card__desc')].map((n) => n.textContent.trim())
  );
  check('every built-in card has a description', descs.length === 12 && descs.every((d) => d.length > 20));
  check('built-in cards carry a sector badge', (await page.locator('.gallery-card__badge').first().textContent()) === 'SECTOR A1');
  await page.screenshot({ path: 'shots/f-02-gallery.png' });

  await page.fill('#gallery-search', 'solar');
  const filtered = await page.locator('.gallery-card').count();
  const filteredText = await page.evaluate(() =>
    [...document.querySelectorAll('.gallery-card')].map((n) => n.textContent.toLowerCase())
  );
  check('search narrows the gallery', filtered > 0 && filtered < 12);
  check('every filtered card matches the query', filteredText.every((t) => t.includes('solar')));
  check('count label follows the filter', (await page.textContent('#gallery-count')) === `${filtered} OF 12`);
  await page.fill('#gallery-search', 'zzz-no-match');
  check('empty search shows the empty state', await page.isVisible('.gallery__empty'));
  await page.fill('#gallery-search', '');
  check('clearing the search restores 12 cards', (await page.locator('.gallery-card').count()) === 12);

  check('robots tab button exists', await page.isVisible('#tab-btn-robots'));
  await page.click('#tab-btn-robots');
  check('robots tabpanel visible', await page.isVisible('#tab-robots'));
  check('robot library lists the three types', (await page.locator('.robot-card').count()) === 3);
  check(
    'robot cards carry a type badge',
    (await page.textContent('.robot-card[data-type="hauler"] .robot-card__cat')) === 'HAULER'
  );
  check('add buttons wait for a room', await page.isDisabled('.robot-card[data-type="unit"] [data-act="add"]'));
  check('town roster lists the seeded fleet', !(await page.textContent('#robots-town')).includes('NO ROBOTS YET'));
  check('town roster groups every built-in building', (await page.locator('#robots-town .robot-group').count()) === 12);
  const townCount = parseInt(await page.textContent('#robots-count'), 10);
  const storedCount = await page.evaluate(() => window.__town__.robots.all().length);
  check('town roster counts the seeded fleet', townCount > 0 && townCount === storedCount, `${townCount} vs ${storedCount}`);

  await page.click('#tab-btn-settings');
  await page.click('#provider-add');
  await page.fill('#pf-name', 'Mock Builder');
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
  await page.selectOption('#pf-model', 'mock-builder');
  await page.click('#pf-activate');
  check('model marked active', (await page.locator('.provider-card[data-active="true"]').count()) === 1);

  await page.click('#tab-btn-ai');
  await page.click('#btn-expand-map');
  await page.waitForTimeout(400);
  const one = await stats(page);
  check('expansion adds one X road line', one.roadLinesX === 5);
  check('expansion keeps 4 Z road lines', one.roadLinesZ === 4);
  check('expansion docks 3 sector blocks', one.blocks === 12);
  check('expansion grows intersections to 20', one.intersections === 20);
  check('expansion frees 3 build sites', one.freeCells === 3);
  check('map chip reports +1 SECTOR', (await page.textContent('#map-chip')) === 'MAP : GLOBAL +1 SECTOR');
  check('expansions persisted to localStorage', (await townState(page)).expansions === 1);
  check('expand counter advances', (await page.textContent('#btn-expand-map')) === 'EXPAND MAP (1/4)');
  check('site button enabled after expansion', !(await page.isDisabled('#btn-select-site')));
  check('site button reports free count', (await page.textContent('#btn-select-site')) === 'ADD BUILDING (3 SITES)');
  check('camera panned east with the new sector', (await page.evaluate(() => window.__town__.controls.target.x)) > 0);

  const freeOne = await page.evaluate(() => window.__town__.manager.freeCells().map((c) => [c.x, c.z]));
  check('new sites sit in the docked column', JSON.stringify(freeOne) === '[[64,-32],[64,0],[64,32]]');

  await centerOn(page, 64, 0);
  await page.screenshot({ path: 'shots/f-03-expanded.png' });

  for (let i = 0; i < 3; i++) {
    await page.click('#btn-expand-map');
    await page.waitForTimeout(300);
  }
  const max = await stats(page);
  check('four expansions reach 8 X road lines', max.roadLinesX === 8);
  check('four expansions reach 21 blocks', max.blocks === 21);
  check('four expansions reach 32 intersections', max.intersections === 32);
  check('four expansions free 12 sites', max.freeCells === 12);
  check('expand button reads 4/4', (await page.textContent('#btn-expand-map')) === 'EXPAND MAP (4/4)');
  check('expand button disabled at the cap', await page.isDisabled('#btn-expand-map'));
  check('map chip reports +4 SECTORS', (await page.textContent('#map-chip')) === 'MAP : GLOBAL +4 SECTORS');

  await page.reload();
  await page.waitForFunction(() => window.__TOWN_READY__ === true, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  const reloaded = await stats(page);
  check('expansions survive reload', reloaded.expansions === 4 && reloaded.roadLinesX === 8);
  check('wider grid rebuilt after reload', reloaded.blocks === 21 && reloaded.freeCells === 12);
  check('map chip restored after reload', (await page.textContent('#map-chip')) === 'MAP : GLOBAL +4 SECTORS');
  await openMenu(page);
  check('expand button stays capped after reload', await page.isDisabled('#btn-expand-map'));

  const datacore = await page.evaluate(() => window.__town__.projectBuilding('datacore'));
  await page.mouse.move(datacore.x, datacore.y);
  await page.waitForTimeout(300);
  check('tooltip regression intact after expansions', (await page.textContent('#tooltip')).trim() === 'DATA CORE HUB');

  await page.click('#btn-select-site');
  await page.waitForTimeout(400);
  check('panel closes for site picking', await page.evaluate(() => !document.getElementById('menu-panel').classList.contains('open')));
  check('site picker active', await page.evaluate(() => window.__town__.siteSelect.isActive()));
  check('site picker highlights every free cell', (await page.evaluate(() => window.__town__.siteSelect.cellCount())) === 12);
  check('site hint chip visible', await page.isVisible('#site-hint'));
  check(
    'site hint reports the free count',
    (await page.textContent('#site-hint')) === 'SELECT A BUILD SITE — ESC TO CANCEL (12 FREE)'
  );
  await centerOn(page, 64, -32);
  await page.screenshot({ path: 'shots/f-04-sites.png' });

  const sitePos = await page.evaluate(() => window.__town__.projectPoint(64, 0.3, -32));
  const beforeDrag = await page.evaluate(() => window.__town__.camera.position.toArray().join(','));
  await page.mouse.move(sitePos.x, sitePos.y);
  await page.mouse.down();
  await page.mouse.move(sitePos.x + 40, sitePos.y + 30, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const afterDrag = await page.evaluate(() => window.__town__.camera.position.toArray().join(','));
  check('dragging over a site still orbits the camera', beforeDrag !== afterDrag);
  check('drag does not select a site', await page.evaluate(() => window.__town__.siteSelect.isActive()));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('Esc cancels site picking', !(await page.evaluate(() => window.__town__.siteSelect.isActive())));
  check('site hint hidden after cancel', !(await page.isVisible('#site-hint')));

  await openMenu(page);
  await page.click('#btn-select-site');
  await page.waitForTimeout(350);
  await centerOn(page, 64, -32);
  const pick = await page.evaluate(() => window.__town__.projectPoint(64, 0.3, -32));
  await page.mouse.click(pick.x, pick.y);
  await page.waitForTimeout(400);
  check('clicking a site opens the menu', await page.evaluate(() => document.getElementById('menu-panel').classList.contains('open')));
  check('clicking a site opens the AI tab', (await page.getAttribute('#tab-btn-ai', 'aria-selected')) === 'true');
  check('site picker exits after a pick', !(await page.evaluate(() => window.__town__.siteSelect.isActive())));
  check('site banner visible', await page.isVisible('#chat-site'));
  check('site banner names the plot', (await page.textContent('#chat-site-text')) === 'SITE 64, -32 · PLOT 24 × 24');
  check('chat input pre-seeded with /building', (await page.inputValue('#chat-input')) === '/building ');
  check('building mode holds the picked site', await page.evaluate(() => window.__town__.menu.session.toolMode?.tool === 'building' && window.__town__.menu.session.toolMode?.site?.id === 'c_64_-32'));

  await sendBuilding(page, '/building a slim lookout tower with a beacon mast');
  const sys = recorded.chat.messages[0].content;
  check('system prompt preloads the building tool', sys.includes('TOOL create_building') && sys.includes('SCHEMA:'));
  check('system prompt lists the part vocabulary', sys.includes('box, rbox, cyl, screen, solar, antenna'));
  check('system prompt lists the material whitelist', sys.includes('wallGray') && sys.includes('cyanSoft'));
  check('system prompt references the picked site', sys.includes('SITE REFERENCE') && sys.includes('x 64, z -32'));
  check('system prompt includes a worked example', sys.includes('LOOKOUT TOWER'));
  check('slash command stripped from the user turn', recorded.chat.messages.at(-1).content === 'a slim lookout tower with a beacon mast');

  await page.waitForSelector('#confirm-bar:not([hidden])', { timeout: 5000 });
  const review = await page.evaluate(() => window.__town__.reviewInfo());
  check('review ghost created', review !== null);
  check('review ghost carries the AI name', review?.name === 'LOOKOUT TOWER');
  check('review ghost sits on the picked site', review?.x === 64 && review?.z === -32);
  check('review ghost flagged isReview', review?.isReview === true);
  check('review ghost is not a live building', review?.isBuilding === false);
  check('review materials are transparent', review?.opacity !== null && review.opacity < 1);
  check(
    'confirm bar asks about the building',
    (await page.textContent('#confirm-bar-label')) === 'REVIEW: LOOKOUT TOWER — ADD TO TOWN?'
  );
  check('confirm bar offers both actions', (await page.textContent('#confirm-yes')) === 'ADD TO TOWN' && (await page.textContent('#confirm-no')) === 'DISCARD');
  check('review is not persisted', ((await townState(page)).placements ?? []).length === 0);
  await page.screenshot({ path: 'shots/f-05-review.png' });

  const ghostPos = await page.evaluate(() => window.__town__.projectPoint(64, 3, -32));
  await page.mouse.move(ghostPos.x, ghostPos.y);
  await page.waitForTimeout(300);
  check('review ghost is not hover-pickable', !(await page.evaluate(() => document.getElementById('tooltip').classList.contains('visible'))));

  await page.click('#confirm-yes');
  await page.waitForTimeout(400);
  check('confirm bar hidden after confirm', !(await page.isVisible('#confirm-bar')));
  check('review cleared after confirm', (await page.evaluate(() => window.__town__.reviewInfo())) === null);
  const confirmed = await townState(page);
  check('library holds the new building', confirmed.library.length === 1 && confirmed.library[0].name === 'LOOKOUT TOWER');
  check('placement recorded at the site', confirmed.placements.length === 1 && confirmed.placements[0].x === 64 && confirmed.placements[0].z === -32);
  check('site is no longer free', (await stats(page)).freeCells === 11);
  check('status reports the addition', (await statusText(page)) === 'ADDED LOOKOUT TOWER TO THE TOWN');
  check('status marked ok', (await page.getAttribute('#chat-status', 'data-status')) === 'ok');
  check('building mode cleared after confirm', (await page.evaluate(() => window.__town__.menu.session.toolMode)) === null);

  const libId = confirmed.library[0].id;
  const placed = await page.evaluate((id) => window.__town__.projectBuilding(id), libId);
  check('committed building is pickable in the scene', placed !== null);
  await page.mouse.move(placed.x, placed.y);
  await page.waitForTimeout(300);
  check('committed building shows its tooltip', (await page.textContent('#tooltip')).trim() === 'LOOKOUT TOWER');

  await page.click('#tab-btn-gallery');
  check('gallery shows the custom card', (await page.locator('.gallery-card[data-custom="true"]').count()) === 1);
  check('gallery count includes the custom building', (await page.textContent('#gallery-count')) === '13 OF 13');
  check('custom card carries the CUSTOM badge', (await page.locator('.gallery-card[data-custom="true"] .gallery-card__badge').textContent()) === 'CUSTOM');
  check(
    'custom card shows the AI description',
    (await page.locator('.gallery-card[data-custom="true"] .gallery-card__desc').textContent()).includes('glazed cab')
  );
  await page.fill('#gallery-search', 'lookout');
  check('custom building is searchable', (await page.locator('.gallery-card').count()) === 1);
  await page.fill('#gallery-search', '');

  await page.click('.gallery-card[data-custom="true"] button[data-act="locate"]');
  await page.waitForTimeout(300);
  const located = await page.evaluate(() => window.__town__.controls.target.toArray().map((n) => Math.round(n)));
  check('LOCATE recentres the camera on the building', located[0] === 64 && located[2] === -32);

  await sendBuilding(page, '/building INVALID');
  check('invalid spec rejected in the status line', /FOOTPRINT|MATERIAL/.test(await statusText(page)));
  check('invalid spec status marked error', (await page.getAttribute('#chat-status', 'data-status')) === 'error');
  check('invalid spec places no review', (await page.evaluate(() => window.__town__.reviewInfo())) === null);
  check('invalid spec shows no confirm bar', !(await page.isVisible('#confirm-bar')));
  check('invalid spec is not stored', (await townState(page)).library.length === 1);

  await sendBuilding(page, '/building NOJSON');
  check('reply without JSON reports the extraction failure', /NO JSON/.test(await statusText(page)));
  check('reply without JSON places no review', (await page.evaluate(() => window.__town__.reviewInfo())) === null);

  await sendBuilding(page, '/building a lookout tower again');
  await page.waitForSelector('#confirm-bar:not([hidden])', { timeout: 5000 });
  check('second review ghost raised', (await page.evaluate(() => window.__town__.reviewInfo())) !== null);
  await page.click('#confirm-no');
  await page.waitForTimeout(300);
  check('discard removes the review', (await page.evaluate(() => window.__town__.reviewInfo())) === null);
  check('discard hides the confirm bar', !(await page.isVisible('#confirm-bar')));
  check('discard reports in the status line', (await statusText(page)) === 'BUILDING DISCARDED');
  check('discard leaves the store untouched', (await townState(page)).placements.length === 1);

  await sendBuilding(page, '/building a lookout tower for the reload test');
  await page.waitForSelector('#confirm-bar:not([hidden])', { timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  check('closing the menu cancels the pending review', (await page.evaluate(() => window.__town__.reviewInfo())) === null);
  check('closing the menu hides the confirm bar', !(await page.isVisible('#confirm-bar')));

  await page.reload();
  await page.waitForFunction(() => window.__TOWN_READY__ === true, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  const afterReload = await townState(page);
  check('confirmed building persists across reload', afterReload.placements.length === 1 && afterReload.library.length === 1);
  check('custom building rebuilt into the scene', (await stats(page)).customBuildings === 1);
  const rebuiltId = afterReload.library[0].id;
  const rebuiltPos = await page.evaluate((id) => window.__town__.projectBuilding(id), rebuiltId);
  check('rebuilt building is pickable after reload', rebuiltPos !== null);
  await openMenu(page);
  await page.click('#tab-btn-gallery');
  check('gallery restores the custom card after reload', (await page.locator('.gallery-card[data-custom="true"]').count()) === 1);
  check('gallery restores 13 cards after reload', (await page.locator('.gallery-card').count()) === 13);
  await page.screenshot({ path: 'shots/f-06-persisted.png' });

  const removeBtn = page.locator('.gallery-card[data-custom="true"] button[data-act="remove"]');
  await removeBtn.click();
  check('remove requires confirmation', (await removeBtn.textContent()) === 'CONFIRM?');
  await removeBtn.click();
  await page.waitForTimeout(300);
  check('custom building removed from the gallery', (await page.locator('.gallery-card[data-custom="true"]').count()) === 0);
  check('removal clears the placement', (await townState(page)).placements.length === 0);
  check('removal drops the orphan library entry', (await townState(page)).library.length === 0);
  check('site freed again after removal', (await stats(page)).freeCells === 12);

  // 8. functions panel: per-command system prompts and call history
  await page.click('#tab-btn-settings');
  const headings = await page.evaluate(() => [...document.querySelectorAll('.settings__heading')].map((n) => n.textContent.trim()));
  check('settings lists a FUNCTIONS section', headings.includes('FUNCTIONS'));
  check(
    'functions section explains itself',
    (await page.textContent('.settings__group .settings__note')).includes('PER-COMMAND SYSTEM PROMPTS')
  );
  check('functions section offers the panel', await page.isVisible('#functions-open'));
  await page.click('#functions-open');
  check('functions panel opens', await page.isVisible('#functions-panel'));
  check('panel lists the three function calls', (await page.locator('#fn-list .fn-row').count()) === 3);
  check('detail hidden until a function is picked', !(await page.isVisible('#fn-detail')));
  await page.screenshot({ path: 'shots/f-07-functions.png' });

  await page.click('.fn-row[data-fn="building"]');
  check('picking a function opens its detail', await page.isVisible('#fn-detail'));
  const defaultPrompt = await page.inputValue('#fn-prompt');
  check(
    'prompt prefills the default instructions',
    defaultPrompt.includes('TOOL create_building') && defaultPrompt.includes('SCHEMA:')
  );
  check('default prompt carries the worked example', defaultPrompt.includes('LOOKOUT TOWER'));
  check('live context is not part of the editable prompt', !defaultPrompt.includes('SITE REFERENCE'));

  check('history lists the earlier building calls', (await page.locator('#fn-calls .fn-call').count()) > 0);
  const firstHead = '#fn-calls .fn-call:first-child .fn-call__head';
  await page.click(firstHead);
  check('expanding a call opens its body', await page.isVisible('#fn-calls .fn-call:first-child .fn-call__body'));
  const firstPrompt = await page.textContent('#fn-calls .fn-call:first-child .fn-call__prompt');
  check(
    'expanded call shows the final prompt',
    firstPrompt.includes('[SYSTEM]') && firstPrompt.includes('TOOL create_building')
  );
  check('expanded call shows the user turn', firstPrompt.includes('a lookout tower for the reload test'));
  check('expanded call reports its status', (await page.textContent('#fn-calls .fn-call:first-child .fn-call__status')) === 'OK');
  await page.click(firstHead);
  check('clicking again collapses the call', !(await page.isVisible('#fn-calls .fn-call:first-child .fn-call__body')));

  const custom = 'CUSTOM BUILDING RULES — return one fenced json building spec.';
  await page.fill('#fn-prompt', custom);
  await page.click('#fn-save');
  check('save reports the stored prompt', (await page.textContent('#fn-status')).includes('SAVED'));
  check('saved row carries the custom badge', await page.isVisible('.fn-row[data-fn="building"] .fn-row__badge'));
  check('saved prompt persisted to the ai store', (await aiState(page)).functions.building === custom);
  await page.click('#functions-close');
  check('close button hides the panel', !(await page.isVisible('#functions-panel')));

  await sendBuilding(page, '/building a marker tower');
  check('the saved prompt is the whole system message', recorded.chat.messages[0].content === custom);
  await page.waitForSelector('#confirm-bar:not([hidden])', { timeout: 5000 });
  check('the review pipeline still works with an override', (await page.evaluate(() => window.__town__.reviewInfo())) !== null);
  await page.click('#confirm-no');
  await page.waitForTimeout(300);
  const withOverride = await aiState(page);
  check('the newest call stores the override', withOverride.calls[0].fn === 'building' && withOverride.calls[0].system === custom);

  await page.click('#tab-btn-settings');
  await page.click('#functions-open');
  check('reopening keeps the selected function', (await page.inputValue('#fn-prompt')) === custom);
  await page.fill('#fn-prompt', '   ');
  await page.click('#fn-save');
  check('an empty save reports the fallback', (await page.textContent('#fn-status')).includes('EMPTY'));
  check('an empty save clears the stored prompt', (await aiState(page)).functions.building === null);
  check('an empty save hides the badge again', (await page.getAttribute('.fn-row[data-fn="building"]', 'data-custom')) === 'false');
  await page.click('#functions-close');

  await sendBuilding(page, '/building a marker tower for the fallback');
  check('the default prompt returns after an empty save', recorded.chat.messages[0].content.includes('TOOL create_building'));
  await page.waitForSelector('#confirm-bar:not([hidden])', { timeout: 5000 });
  await page.click('#confirm-no');
  await page.waitForTimeout(300);

  await page.click('#tab-btn-settings');
  await page.click('#functions-open');
  await page.fill('#fn-prompt', custom);
  await page.click('#fn-save');
  check('reset needs a saved prompt to clear', (await page.getAttribute('.fn-row[data-fn="building"]', 'data-custom')) === 'true');
  await page.click('#fn-reset');
  check('reset restores the default text', (await page.inputValue('#fn-prompt')).includes('TOOL create_building'));
  check('reset clears the stored prompt', (await aiState(page)).functions.building === null);
  check('reset clears the badge', (await page.getAttribute('.fn-row[data-fn="building"]', 'data-custom')) === 'false');

  check('history still holds the calls', (await page.locator('#fn-calls .fn-call').count()) > 0);
  await page.click('#fn-clear');
  check('clear empties the history', (await page.locator('#fn-calls .fn-call').count()) === 0);
  check('clear shows the empty note', await page.isVisible('#fn-calls-empty'));

  await page.click('#fn-prompt');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('escape closes the panel', !(await page.isVisible('#functions-panel')));
  check('escape leaves the drawer open', await page.evaluate(() => document.getElementById('menu-panel').classList.contains('open')));

  await page.reload();
  await page.waitForFunction(() => window.__TOWN_READY__ === true, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  const aiReloaded = await aiState(page);
  check('the functions slice survives the reload', JSON.stringify(aiReloaded.functions) === '{"building":null,"space":null,"object":null}');
  check('the cleared history survives the reload', aiReloaded.calls.length === 0);
  check('the provider survives the reload', aiReloaded.providers.length === 1 && aiReloaded.activeProviderId !== null);
  await openMenu(page);
  await page.click('#tab-btn-settings');
  await page.click('#functions-open');
  await page.click('.fn-row[data-fn="building"]');
  check('history is empty after the reload', (await page.locator('#fn-calls .fn-call').count()) === 0);
  check('the empty note shows after the reload', await page.isVisible('#fn-calls-empty'));
  check('the default prompt is offered after the reload', (await page.inputValue('#fn-prompt')).includes('TOOL create_building'));

  await browser.close();
  console.log(failures === 0 ? 'PASS: all checks' : `FAIL: ${failures} check(s) failed`);
  process.exitCode = failures ? 1 : 0;
} finally {
  server.kill();
}
