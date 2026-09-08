import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 5198;
const IDS = process.argv.slice(2);
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
  const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text());
  });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.__TOWN_READY__ === true, null, { timeout: 30000 });
  await page.waitForTimeout(600);

  for (const id of IDS) {
    await page.evaluate((bid) => {
      const { camera, controls, buildingsGroup } = window.__town__;
      const g = buildingsGroup.children.find((c) => c.userData.id === bid);
      const p = g.getWorldPosition(new camera.position.constructor());
      controls.target.set(p.x, p.y + 2.5, p.z);
      camera.position.set(p.x + 26, p.y + 26, p.z + 26);
      camera.zoom = 2.4;
      camera.updateProjectionMatrix();
      controls.update();
    }, id);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `shots/closeup-${id}.png` });
    console.log('shot', id);
  }
  await browser.close();
} finally {
  server.kill();
}
