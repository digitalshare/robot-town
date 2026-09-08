import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 5199;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--logLevel', 'error'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('dev server did not start');
}

try {
  await waitForServer();
  mkdirSync('shots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text());
  });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.__TOWN_READY__ === true, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'shots/town-default.png' });

  const pos = await page.evaluate(() => window.__town__.projectBuilding('datacore'));
  await page.mouse.move(pos.x, pos.y);
  await page.waitForTimeout(300);
  const tip = await page.evaluate(() => document.getElementById('tooltip').textContent);
  await page.screenshot({ path: 'shots/town-tooltip.png' });
  console.log(
    tip.trim() === 'DATA CORE HUB' ? 'PASS: tooltip shows DATA CORE HUB' : `FAIL: tooltip shows "${tip}"`
  );
  await browser.close();
} finally {
  server.kill();
}
