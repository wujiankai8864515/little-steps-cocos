// Isolated Cocos render fixture, not a real WeChat account or friend-data test.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {chromium} = require('/Users/wkk/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport: {width: 450, height: 800}}); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  try {
    await page.goto('http://127.0.0.1:8816/'); await page.waitForFunction(() => window.__boss_test?.snapshot().page === 'home');
    const valid = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); const context = {canvas, postMessage() {
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#102441'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffd16c'; ctx.font = '30px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('SDK Canvas Fixture', 300, 330);
      }};
      window.wx = {getOpenDataContext: () => context};
      const app = window.__boss_test.app; app.recordsPage(); app.friends();
      return {hasFriends: app.platform.hasFriends, surface: !!app.friendTexture, width: canvas.width, height: canvas.height};
    });
    assert.equal(valid.hasFriends, true); assert.equal(valid.surface, true); assert.equal(valid.width, 600); assert.equal(valid.height, 700);
    await page.waitForTimeout(600); await page.screenshot({path: 'migration/reviews/boss/sdk-canvas-fixture.png'});
    const closed = await page.evaluate(() => {const app = window.__boss_test.app; app.closeModal(); return !app.friendTexture && !app.friendCanvas;});
    assert.equal(closed, true);
    const failed = await page.evaluate(() => {
      window.wx = {getOpenDataContext() {throw Error('SDK fixture unavailable');}};
      const app = window.__boss_test.app; app.friends(); return {surface: !!app.friendTexture, modal: app.snapshot().modal};
    });
    assert.equal(failed.surface, false); assert.equal(failed.modal, 'modal-friends');
    await page.screenshot({path: 'migration/reviews/boss/sdk-canvas-fallback-fixture.png'});
    assert.deepEqual(errors, []);
    fs.writeFileSync('migration/reviews/boss/sdk-canvas-validation.json', JSON.stringify({status: 'passed', scope: 'Cocos WebGL renderer with isolated SDK contract fixtures. No actual friend names, network service or native account verified.', valid, closed, failed, errors}, null, 2));
    console.log(JSON.stringify({valid, closed, failed, errors}));
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
