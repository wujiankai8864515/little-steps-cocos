/* Real Chrome input flows. Time/energy fixtures are labelled separately below. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('/Users/wkk/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = path.resolve('migration/reviews/boss');
const results = [], screenshots = [], errors = [];
let browser, page;
async function state() {return page.evaluate(() => window.__boss_test.snapshot());}
async function waitPage(name) {await page.waitForFunction(name => window.__boss_test?.snapshot().page === name, name, {timeout: 18000});}
async function shot(name) {await page.waitForTimeout(240); const file = path.join(out, name + '.png'); await page.screenshot({path: file}); screenshots.push(file);}
async function click(name) {
    const p = await page.evaluate(name => {
        const app = window.__boss_test.app; let match;
        function walk(node) {if (!node.activeInHierarchy) return; if (node.name === name) match = node; node.children.forEach(walk);}
        walk(app.root); if (!match) throw Error('Missing button ' + name);
        const root = app.root.worldPosition, pos = match.worldPosition;
        const canvas = document.querySelector('canvas').getBoundingClientRect();
        const scale = Math.min(canvas.width / 720, canvas.height / 1280);
        return {x: canvas.left + (canvas.width - 720 * scale) / 2 + (pos.x - root.x + 360) * scale,
                y: canvas.top + (canvas.height - 1280 * scale) / 2 + (640 - (pos.y - root.y)) * scale};
    }, name);
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(170);
}
async function check(name, action) {
    await action(); results.push({name, result: 'passed'}); console.log('PASS ' + name);
}
async function main() {
    fs.mkdirSync(out, {recursive: true});
    browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
    page = await browser.newPage({viewport: {width: 450, height: 800}});
    page.on('pageerror', e => errors.push(String(e)));
    page.on('response', response => {if (response.status() >= 400 && !response.url().includes('favicon')) errors.push(response.status() + ' ' + response.url());});
    await page.goto('http://127.0.0.1:8816/'); await waitPage('home');
    await check('startup loads real reference art and no runtime errors', async () => {assert.equal((await state()).save.unlocked, 1); await shot('home-450x800');});
    await check('help, settings, and saved audio/vibration toggles respond to actual clicks', async () => {
        await click('button-help'); assert.equal((await state()).modal, 'modal-help'); await shot('help'); await click('button-modal-close');
        await click('button-settings'); await click('button-sound-toggle'); assert.equal((await state()).save.music, false);
        await click('button-vibrate-toggle'); assert.equal((await state()).save.vibration, false); await shot('settings');
        await click('button-sound-toggle'); await click('button-vibrate-toggle'); await click('button-modal-close');
    });
    await check('daily supplies and unavailable online/friend services use honest state', async () => {
        await click('button-records'); await click('button-daily'); assert.equal((await state()).save.coins, 35); await click('button-daily'); assert.equal((await state()).save.coins, 35);
        await shot('records-initial'); await click('button-online-rank'); await shot('online-unconfigured'); await click('button-modal-close');
        await click('button-friends'); await shot('friends-web-boundary'); await click('button-modal-close'); await click('button-back');
    });
    await check('expedition dispatch persists through browser reload', async () => {
        await click('button-expedition'); await shot('expedition-idle'); await click('button-trip'); assert.ok((await state()).save.expedition);
        await shot('expedition-away'); await page.reload(); await waitPage('home'); assert.ok((await state()).save.expedition);
    });
    await check('offline expedition claim uses a labelled simulated clock, rewards exactly once', async () => {
        const trip = (await state()).save.expedition; const before = (await state()).save.coins;
        await page.evaluate(end => window.__boss_test.now(end + 1), trip.end);
        await click('button-expedition'); await click('button-trip'); await shot('expedition-parcel');
        const s = await state(); assert.equal(s.save.coins, before + trip.coins); assert.equal(s.save.expedition, null);
        await click('button-modal-close'); await click('button-back'); await page.evaluate(() => window.__boss_test.now(0));
    });
    await check('company catalogue, locked levels, and brawl mode work without unlocking campaign', async () => {
        await click('button-levels'); await shot('levels-company-1'); await click('button-company-5'); await shot('levels-company-5');
        await click('button-level-25'); assert.equal((await state()).page, 'levels'); await click('button-back');
        await click('button-brawl'); assert.equal((await state()).mode, 'brawl'); await shot('brawl-home'); await click('button-campaign');
    });
    await check('gender, skin selector, preparation and 3 second countdown use actual input', async () => {
        await click('button-start'); await click('button-gender-female'); assert.equal((await state()).save.gender, 'female'); await shot('prepare-female');
        await click('button-gender-male'); await click('button-skins'); await shot('wardrobe'); await click('button-skin-default'); await shot('prepare-male');
        await click('button-run'); await waitPage('run'); assert.equal((await state()).run.phase, 'ready'); await shot('ready'); await page.waitForTimeout(3300);
        assert.equal((await state()).run.phase, 'running');
    });
    await check('drag, arrows, A/D and pause stop/resume real engine time', async () => {
        await page.mouse.move(225, 460); await page.mouse.down(); await page.mouse.move(360, 460, {steps: 10}); await page.mouse.up();
        assert.equal((await state()).run.lane, 2); await page.keyboard.press('ArrowLeft'); assert.equal((await state()).run.lane, 1);
        await page.keyboard.press('a'); assert.equal((await state()).run.lane, 0); await page.keyboard.press('d'); assert.equal((await state()).run.lane, 1);
        await click('button-pause'); const paused = (await state()).run; await shot('pause'); await page.waitForTimeout(1000);
        assert.equal((await state()).run.distance, paused.distance); assert.equal((await state()).run.remaining, paused.remaining);
        await click('button-resume'); assert.equal((await state()).run.paused, false); await shot('running');
    });
    const wallStart = Date.now(); let reportTime = Date.now(); let shotBoss = false;
    // Full duration run: no clock changes, energy injection, direct movement or fast-forward.
    // Reads the visible gate's rule and sends real arrow keys to choose its lane.
    while ((await state()).page !== 'result') {
        const choice = await page.evaluate(() => {
            const run = window.__boss_test.app.run; const row = run.rows[run.cursor];
            let target = run.lane;
            if (row?.kind === 'gate') {
                const values = row.gates.map(g => {g = run.effectiveGate(g); return Math.floor(run.energy * g.mul + g.add);}); target = values.indexOf(Math.max(...values));
            } else if (row?.kind === 'item') {
                const good = row.items.findIndex(id => ['food', 'fish', 'raise', 'ally', 'lottery'].includes(id)); target = good >= 0 ? good : row.items.indexOf(null);
            }
            return {phase: run.phase, lane: run.lane, target};
        });
        if (choice.phase === 'running') for (let i = 0; i < Math.abs(choice.target - choice.lane); i++) await page.keyboard.press(choice.target < choice.lane ? 'ArrowLeft' : 'ArrowRight');
        if (choice.phase === 'duel' && !shotBoss) {await shot('boss-duel'); shotBoss = true;}
        if (Date.now() - reportTime > 30000) {console.log('Real run ' + Math.floor((Date.now() - wallStart) / 1000) + 's ' + JSON.stringify((await state()).run)); reportTime = Date.now();}
        if (Date.now() - wallStart > 260000) throw Error('Real run did not settle within expected time');
        await page.waitForTimeout(120);
    }
    await check('full real-time race, boss duel, reward and next unlock succeed through actual controls', async () => {
        const s = await state(); assert.equal(s.run.won, true); assert.equal(s.save.unlocked, 2); assert.equal(s.save.victories, 1);
        assert.ok(s.run.energy >= 470); await shot('victory'); const coins = s.save.coins; await page.waitForTimeout(500); assert.equal((await state()).save.coins, coins);
        results.push({name: 'full-race-wall-time', seconds: (Date.now() - wallStart) / 1000, method: 'actual engine clock and keyboard input'});
        await click('button-result-next'); await waitPage('prepare'); assert.equal((await state()).selected, 2);
    });
    await check('all 10 experience cards are accessible and a purchased card is consumed exactly once', async () => {
        await click('button-prepare-cards');
        for (let i = 0; i < 4; i++) {await shot('cards-page-' + (i + 1)); if (i < 3) await click('button-cards-next');}
        for (let i = 0; i < 3; i++) await click('button-cards-prev');
        await click('button-card-buy-spa'); assert.equal((await state()).save.cards.spa, 1); await click('button-card-use-spa'); assert.equal((await state()).save.equipped, 'spa');
        await click('button-card-detail-spa'); await shot('experience-detail'); await click('button-modal-close'); await click('button-back');
        await click('button-run'); await waitPage('run'); assert.equal((await state()).run.energy, 200); assert.equal((await state()).save.cards.spa, 0);
        await click('button-pause'); await click('button-quit-run'); await waitPage('home');
    });
    await check('loss/revival/result layouts use a labelled 200 energy failure fixture', async () => {
        await click('button-start'); await click('button-run'); await waitPage('run');
        await page.evaluate(() => {const run = window.__boss_test.app.run; run.energy = 200; run.fail('精力不足：验证失败路径');});
        await waitPage('result'); await shot('failure'); await click('button-revive'); await waitPage('run'); assert.equal((await state()).run.energy, 160); assert.equal((await state()).run.reviveUsed, true);
        await shot('revived'); await click('button-pause'); await click('button-quit-run'); await waitPage('home');
    });
    await check('progress and settings survive reload and common phone/tablet screens retain controls', async () => {
        const before = await state(); await page.reload(); await waitPage('home'); const after = await state();
        assert.equal(after.save.coins, before.save.coins); assert.equal(after.save.unlocked, 2); assert.equal(after.save.music, true);
        for (const [width, height] of [[390, 844], [360, 640], [768, 1024]]) {
            await page.setViewportSize({width, height}); await page.waitForTimeout(600); await shot('home-' + width + 'x' + height);
            await click('button-start'); await waitPage('prepare'); await shot('prepare-' + width + 'x' + height); await click('button-back'); await waitPage('home');
        }
    });
    assert.deepEqual(errors, [], 'Runtime/network errors: ' + errors.join('\n'));
    fs.writeFileSync(path.join(out, 'browser-validation.json'), JSON.stringify({status: 'passed', scope: 'Independent Chrome; actual full race and input flows; explicitly labelled expedition clock and loss fixtures; not a WeChat device test', results, screenshots, errors, finalState: await state()}, null, 2));
}
main().catch(error => {
    errors.push(String(error.stack || error)); fs.writeFileSync(path.join(out, 'browser-validation-failed.json'), JSON.stringify({results, screenshots, errors}, null, 2));
    console.error(error); process.exitCode = 1;
}).finally(async () => {if (browser) await browser.close();});
