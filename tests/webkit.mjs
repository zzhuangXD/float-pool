import { webkit } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const url = process.env.DEMO_URL || 'http://127.0.0.1:4173';
const browser = await webkit.launch({ headless: true });
const reports = [];
try {
  for (const [name, viewport] of [['webkit-mobile', { width: 390, height: 844 }], ['webkit-landscape', { width: 844, height: 390 }]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__POOL__?.ready, { timeout: 25000 });
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), true);
    await page.screenshot({ path: `artifacts/${name}.png`, fullPage: true });
    await page.getByRole('button', { name: '掀起一点浪花' }).tap(); await page.waitForTimeout(200);
    assert.ok((await page.evaluate(() => window.__POOL__.state())).energy > 0.005);
    await page.getByRole('button', { name: '添加桨板', exact: true }).tap(); assert.equal((await page.evaluate(() => window.__POOL__.state())).count, 8);
    await page.getByRole('button', { name: '重新摆放', exact: true }).tap();
    const duck = await page.evaluate(() => window.__POOL__.state().items.find(i => i.kind === 'duck'));
    const point = await page.evaluate(id => window.__POOL__.projectItem(id), duck.id);
    await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.waitForTimeout(1100);
    const pressed = await page.evaluate(id => window.__POOL__.state().items.find(i => i.id === id), duck.id);
    assert.ok(pressed.position.y < duck.position.y - 0.15, `${name}: press`);
    await page.mouse.up(); await page.waitForTimeout(1800);
    const released = await page.evaluate(id => window.__POOL__.state().items.find(i => i.id === id), duck.id);
    assert.ok(released.position.y > pressed.position.y + 0.1, `${name}: resurface`);
    assert.deepEqual(errors, [], `${name}: console errors`);
    const state = await page.evaluate(() => window.__POOL__.state());
    reports.push({ name, viewport, state, passed: true, errors }); console.log(`${name}: PASS · rendering, tap, buoyancy, layout · ${state.fps.toFixed(1)} fps`);
    await context.close();
  }
  await fs.writeFile('artifacts/webkit-report.json', JSON.stringify({ url, checkedAt: new Date().toISOString(), reports }, null, 2));
} finally { await browser.close(); }
