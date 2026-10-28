import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const url = process.env.DEMO_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const reports = [];
await fs.mkdir('artifacts', { recursive: true });
try {
  const devices = [
    { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    { name: 'compact-mobile', viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { name: 'small-mobile', viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ];
  for (const device of devices.filter(d => !process.env.POOL_TEST_DEVICES || process.env.POOL_TEST_DEVICES.split(',').includes(d.name))) {
    const context = await browser.newContext(device), page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => requests.push({ url: request.url(), error: request.failure()?.errorText }));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__POOL__?.ready, { timeout: 25000 });
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${device.name}: horizontal overflow`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), true, `${device.name}: vertical overflow`);
    assert.equal(await page.locator('canvas').count(), 1);
    const initial = await page.evaluate(() => window.__POOL__.state());
    assert.equal(initial.count, 7); assert.ok(initial.webgl);
    await page.screenshot({ path: `artifacts/${device.name}.png`, fullPage: true });
    await page.getByRole('button', { name: '添加橡胶小鸭', exact: true }).click();
    await page.waitForFunction(() => window.__POOL__.state().count === 8);
    const added = await page.evaluate(() => window.__POOL__.state().items.at(-1));
    assert.equal(added.kind, 'duck');
    await page.getByRole('button', { name: '掀起一点浪花' }).click();
    await page.waitForTimeout(150);
    assert.ok((await page.evaluate(() => window.__POOL__.state().energy)) > 0.005);
    await page.getByRole('button', { name: '重新摆放', exact: true }).click();
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#toy-count').innerText(), '7');
    const duck = await page.evaluate(() => window.__POOL__.state().items.find(i => i.kind === 'duck'));
    const point = await page.evaluate(id => window.__POOL__.projectItem(id), duck.id);
    if (device.hasTouch) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
      await page.waitForTimeout(1100);
      const pressed = await page.evaluate(id => window.__POOL__.state().items.find(i => i.id === id), duck.id);
      assert.ok(pressed.position.y < duck.position.y - 0.15, `${device.name}: long press did not submerge duck`);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(1800);
      const released = await page.evaluate(id => window.__POOL__.state().items.find(i => i.id === id), duck.id);
      assert.ok(released.position.y > pressed.position.y + 0.1, `${device.name}: duck did not resurface`);
      // Real touch events also exercise mobile drag handling, not mouse emulation.
      const from = await page.evaluate(id => window.__POOL__.projectItem(id), duck.id);
      const to = await page.evaluate(() => window.__POOL__.project(-0.6, 0.83, 0.5));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
      for (let s = 1; s <= 12; s++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * s / 12, y: from.y + (to.y - from.y) * s / 12 }] });
        await page.waitForTimeout(30);
      }
      await page.waitForTimeout(400);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const moved = await page.evaluate(id => window.__POOL__.state().items.find(i => i.id === id), duck.id);
      assert.ok(moved.position.x > released.position.x + 0.4, `${device.name}: touch drag did not move duck`);
    } else {
      await page.mouse.move(point.x, point.y); await page.mouse.down();
      const end = await page.evaluate(() => window.__POOL__.project(-0.5, 0.83, 0.5));
      await page.mouse.move(end.x, end.y, { steps: 20 }); await page.waitForTimeout(650); await page.mouse.up();
      const moved = await page.evaluate(id => window.__POOL__.state().items.find(i => i.id === id), duck.id);
      assert.ok(moved.position.x > duck.position.x + 0.5, 'mouse drag should move duck');
    }
    await page.getByRole('button', { name: '切换俯视视角', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__POOL__.state().topView), true);
    await page.getByRole('button', { name: '调节风浪', exact: true }).click();
    await page.locator('#wind').fill('80'); assert.equal((await page.evaluate(() => window.__POOL__.state())).wind, 0.8);
    await page.getByRole('button', { name: '开启水声', exact: true }).click();
    assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: '关闭水声', exact: true }).click();
    const final = await page.evaluate(() => window.__POOL__.state());
    assert.equal(final.grabbed, null); assert.deepEqual(errors, [], `${device.name}: console errors`); assert.deepEqual(requests, [], `${device.name}: failed requests`);
    reports.push({ device: device.name, viewport: device.viewport, initial, final, errors, failedRequests: requests, passed: true });
    console.log(`${device.name}: PASS · touch/drag, waves, buoyancy, controls, layout · ${final.fps.toFixed(1)} fps`);
    await context.close();
  }
  await fs.writeFile('artifacts/browser-report.json', JSON.stringify({ url, checkedAt: new Date().toISOString(), reports }, null, 2));
} finally { await browser.close(); }
