import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 5197;
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

const recorded = { anthropicChat: null, googleChat: null, openaiChat: null };

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

async function drag(page, x1, y1, x2, y2) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 6 });
  await page.mouse.up();
}

async function cameraState(page) {
  return page.evaluate(() => ({
    p: window.__town__.camera.position.toArray().map((n) => +n.toFixed(4)),
    t: window.__town__.controls.target.toArray().map((n) => +n.toFixed(4)),
  }));
}

async function lastAssistant(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('#chat-log .msg--assistant .msg__text')];
    return nodes.length ? nodes[nodes.length - 1].textContent : '';
  });
}

async function sendChat(page, text) {
  await page.click('#tab-btn-ai');
  await page.fill('#chat-input', text);
  await page.click('#chat-send');
  await page.waitForFunction(() => !document.getElementById('chat-send').disabled, null, { timeout: 8000 });
  return lastAssistant(page);
}

async function addProvider(page, { name, protocol, baseUrl, apiKey }) {
  await page.click('#tab-btn-settings');
  await page.click('#provider-add');
  await page.fill('#pf-name', name);
  await page.selectOption('#pf-protocol', protocol);
  await page.fill('#pf-baseurl', baseUrl);
  await page.fill('#pf-apikey', apiKey);
  await page.click('#pf-save');
}

async function testConnection(page) {
  await page.click('#pf-test-btn');
  await page.waitForFunction(
    () => ['ok', 'error'].includes(document.getElementById('pf-test-status').dataset.status),
    null,
    { timeout: 12000 }
  );
  return page.evaluate(() => document.getElementById('pf-test-status').dataset.status);
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
    if (!sessionStorage.getItem('rt-ai-cleared')) {
      localStorage.removeItem('robot-town.ai.v1');
      sessionStorage.setItem('rt-ai-cleared', '1');
    }
  });

  await page.route('**/mock/openai/v1/models', (r) => r.fulfill(json({ data: [{ id: 'mock-small' }, { id: 'mock-large' }] })));
  await page.route('**/mock/openai/v1/chat/completions', (r) => {
    recorded.openaiChat = r.request();
    r.fulfill(
      sse(
        'data: {"choices":[{"delta":{"content":"ROBOT "}}]}\n\n' +
          'data: {"choices":[{"delta":{"content":"TOWN "}}]}\n\n' +
          'data: {"choices":[{"delta":{"content":"ONLINE"}}]}\n\n' +
          'data: [DONE]\n\n'
      )
    );
  });
  await page.route('**/mock/badauth/v1/models', (r) => r.fulfill(json({ error: { message: 'Incorrect API key provided' } }, 401)));
  await page.route('**/mock/anthropic/v1/models', (r) => r.fulfill(json({ data: [{ id: 'claude-mock' }] })));
  await page.route('**/mock/anthropic/v1/messages', (r) => {
    recorded.anthropicChat = r.request();
    r.fulfill(
      sse(
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"OK"}}\n\n' +
          'event: message_stop\ndata: {"type":"message_stop"}\n\n'
      )
    );
  });
  await page.route('**/mock/google/v1beta/models', (r) =>
    r.fulfill(json({ models: [{ name: 'models/gemini-mock', supportedGenerationMethods: ['generateContent'] }] }))
  );
  await page.route('**/mock/google/v1beta/models/gemini-mock:streamGenerateContent*', (r) => {
    recorded.googleChat = r.request();
    r.fulfill(sse('data: {"candidates":[{"content":{"parts":[{"text":"GEM"}]}}]}\n\n'));
  });

  await page.goto(ORIGIN);
  await page.waitForFunction(() => window.__TOWN_READY__ === true, null, { timeout: 30000 });
  await page.waitForTimeout(500);

  check('menu button visible', await page.isVisible('#menu-button'));
  check('panel closed by default', await page.evaluate(() => !document.getElementById('menu-panel').classList.contains('open')));
  await page.screenshot({ path: 'shots/ai-01-default.png' });

  await page.click('#menu-button');
  await page.waitForTimeout(400);
  check('panel opens', await page.evaluate(() => document.getElementById('menu-panel').classList.contains('open')));
  check('panel aria-hidden false', (await page.getAttribute('#menu-panel', 'aria-hidden')) === 'false');
  check('AI tab selected by default', (await page.getAttribute('#tab-btn-ai', 'aria-selected')) === 'true');
  check('AI tabpanel visible', await page.isVisible('#tab-ai'));
  await page.screenshot({ path: 'shots/ai-02-panel-ai.png' });

  check('chat empty state visible', await page.isVisible('#chat-empty'));
  check('send disabled with no model', await page.isDisabled('#chat-send'));
  check('console header shows no model', (await page.textContent('#console-model')).includes('NO MODEL CONFIGURED'));

  await page.click('#chat-goto-settings');
  check('CTA jumps to settings tab', (await page.getAttribute('#tab-btn-settings', 'aria-selected')) === 'true');
  check('provider form open in add mode', await page.isVisible('#provider-form'));

  const panelBox = await page.locator('#menu-panel').boundingBox();
  const before = await cameraState(page);
  await drag(page, panelBox.x + 60, panelBox.y + 300, panelBox.x + 60, panelBox.y + 420);
  const afterPanel = await cameraState(page);
  check('camera unchanged when dragging over panel', JSON.stringify(before) === JSON.stringify(afterPanel));
  await drag(page, 300, 450, 420, 520);
  const afterCanvas = await cameraState(page);
  check('camera still orbits on canvas', JSON.stringify(before) !== JSON.stringify(afterCanvas));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  check('Esc closes panel', await page.evaluate(() => !document.getElementById('menu-panel').classList.contains('open')));
  const pos = await page.evaluate(() => window.__town__.projectBuilding('datacore'));
  await page.mouse.move(pos.x, pos.y);
  await page.waitForTimeout(300);
  check('tooltip regression intact', (await page.textContent('#tooltip')).trim() === 'DATA CORE HUB');

  await page.click('#menu-button');
  await page.waitForTimeout(350);

  await page.click('#tab-btn-settings');
  await page.click('#provider-add');
  await page.fill('#pf-name', 'Mock OpenAI');
  await page.selectOption('#pf-protocol', 'openai');
  await page.fill('#pf-baseurl', `${ORIGIN}/mock/openai/v1`);
  await page.fill('#pf-apikey', 'sk-mock-1234567890');
  check('key input masked', (await page.getAttribute('#pf-apikey', 'type')) === 'password');
  await page.click('#pf-reveal');
  check('reveal toggles key visibility', (await page.getAttribute('#pf-apikey', 'type')) === 'text');
  await page.click('#pf-reveal');
  check('test disabled before save', await page.isDisabled('#pf-test-btn'));
  await page.click('#pf-save');
  check('provider card rendered after save', (await page.locator('.provider-card').count()) === 1);
  check('test enabled after save', !(await page.isDisabled('#pf-test-btn')));
  check('model select disabled before test', await page.isDisabled('#pf-model'));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('robot-town.ai.v1')));
  check('api key persisted to localStorage', stored.providers[0].apiKey === 'sk-mock-1234567890');

  check('connection test succeeds', (await testConnection(page)) === 'ok');
  check('model select enabled after success', !(await page.isDisabled('#pf-model')));
  check('model list populated', (await page.locator('#pf-model option').count()) === 2);
  await page.selectOption('#pf-model', 'mock-large');
  await page.click('#pf-activate');
  check('provider card marked active', (await page.locator('.provider-card[data-active="true"]').count()) === 1);
  await page.screenshot({ path: 'shots/ai-04-settings.png' });

  const reply = await sendChat(page, 'hello town');
  check('streamed assistant reply assembled', reply === 'ROBOT TOWN ONLINE');
  check('user bubble rendered', (await page.locator('#chat-log .msg--user').count()) === 1);
  const openaiBody = recorded.openaiChat.postDataJSON();
  check('openai request streams', openaiBody.stream === true);
  check('openai request leads with system prompt', openaiBody.messages[0].role === 'system');
  await page.screenshot({ path: 'shots/ai-03-chat-stream.png' });

  await page.click('#console-toggle');
  check('console collapses', (await page.getAttribute('.console', 'data-collapsed')) === 'true');
  check('console body hidden when collapsed', !(await page.isVisible('#console-body')));
  await page.click('#console-toggle');
  check('console expands', (await page.getAttribute('.console', 'data-collapsed')) === 'false');

  await addProvider(page, {
    name: 'Bad Auth',
    protocol: 'openai',
    baseUrl: `${ORIGIN}/mock/badauth/v1`,
    apiKey: 'sk-wrong',
  });
  check('bad key yields error status', (await testConnection(page)) === 'error');
  check('model select stays disabled on auth error', await page.isDisabled('#pf-model'));
  check('auth error mentions key', (await page.textContent('#pf-test-status')).match(/KEY|401/i) !== null);

  await addProvider(page, {
    name: 'Unreachable',
    protocol: 'openai',
    baseUrl: 'http://127.0.0.1:9/v1',
    apiKey: 'sk-nope',
  });
  check('unreachable base yields error status', (await testConnection(page)) === 'error');
  check('network error mentions cors/network', (await page.textContent('#pf-test-status')).match(/NETWORK|CORS/i) !== null);

  const deleteBtn = page.locator('.provider-card', { hasText: 'Bad Auth' }).locator('button[data-act="delete"]');
  await deleteBtn.click();
  check('delete requires confirmation', (await deleteBtn.textContent()) === 'CONFIRM?');
  await deleteBtn.click();
  check('provider deleted after confirm', (await page.locator('.provider-card', { hasText: 'Bad Auth' }).count()) === 0);

  await addProvider(page, {
    name: 'Mock Anthropic',
    protocol: 'anthropic',
    baseUrl: `${ORIGIN}/mock/anthropic`,
    apiKey: 'sk-ant-mock',
  });
  check('anthropic connection test succeeds', (await testConnection(page)) === 'ok');
  await page.click('#pf-activate');
  const antReply = await sendChat(page, 'ping');
  check('anthropic streamed reply', antReply === 'OK');
  const antReq = recorded.anthropicChat;
  check('anthropic url has single /v1', antReq.url().endsWith('/mock/anthropic/v1/messages'));
  check('anthropic sends x-api-key', antReq.headers()['x-api-key'] === 'sk-ant-mock');
  check('anthropic sends version header', antReq.headers()['anthropic-version'] === '2023-06-01');
  check('anthropic sends browser-access header', antReq.headers()['anthropic-dangerous-direct-browser-access'] === 'true');
  const antBody = antReq.postDataJSON();
  check('anthropic system is top-level', typeof antBody.system === 'string' && antBody.system.length > 0);
  check('anthropic sets max_tokens', antBody.max_tokens > 0);
  check('anthropic messages exclude system', antBody.messages.every((m) => m.role !== 'system'));

  await page.click('#chat-clear');
  await addProvider(page, {
    name: 'Mock Gemini',
    protocol: 'google',
    baseUrl: `${ORIGIN}/mock/google`,
    apiKey: 'gemini-mock-key',
  });
  check('google connection test succeeds', (await testConnection(page)) === 'ok');
  check('google strips models/ prefix', (await page.locator('#pf-model option').first().textContent()) === 'gemini-mock');
  await page.click('#pf-activate');
  const gemReply = await sendChat(page, 'ping');
  check('google streamed reply', gemReply === 'GEM');
  const gemReq = recorded.googleChat;
  check('google uses streamGenerateContent with alt=sse', /:streamGenerateContent\?alt=sse$/.test(gemReq.url()));
  const gemBody = gemReq.postDataJSON();
  check('google first content role is user', gemBody.contents[0].role === 'user');
  check('google sends systemInstruction', gemBody.systemInstruction?.parts?.[0]?.text?.length > 0);

  await page.reload();
  await page.waitForFunction(() => window.__TOWN_READY__ === true, null, { timeout: 30000 });
  await page.click('#menu-button');
  await page.waitForTimeout(350);
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('robot-town.ai.v1')));
  check('providers persist across reload', persisted.providers.length === 4);
  check('active model persists across reload', persisted.activeProviderId !== null);
  await page.click('#tab-btn-ai');
  check('chat log not persisted', (await page.locator('#chat-log .msg').count()) === 0);

  await browser.close();
  console.log(failures === 0 ? 'PASS: all checks' : `FAIL: ${failures} check(s) failed`);
  process.exitCode = failures ? 1 : 0;
} finally {
  server.kill();
}
