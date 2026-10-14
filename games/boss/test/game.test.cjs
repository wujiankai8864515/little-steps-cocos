const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');
const ts = require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/scripts/typedoc-plugin/node_modules/typescript');
const original = Module._extensions['.ts'];
Module._extensions['.ts'] = (module, filename) => {
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS}}).outputText;
    module._compile(code, filename);
};
const {validateLevels, CARDS, MAX_ENERGY} = require('../assets/core/Config.ts');
const {RunModel, gateValue, flipGate, buildTrack} = require('../assets/core/RunModel.ts');
const {GameStore} = require('../assets/core/Store.ts');
const levels = validateLevels(JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/resources/data/levels.json'))));
const memory = () => {const values = new Map(); return {get: key => values.get(key) || null, set: (key, value) => values.set(key, value), values};};
const running = (id = 1, energy = 100) => {const run = new RunModel(levels[id - 1], 'campaign', energy, 12); run.phase = 'running'; return run;};
const gateRow = gate => ({kind: 'gate', at: 1, gates: [gate, gate, gate]});

test('all 25 levels retain the reference scene names, counts, and company mapping', () => {
    assert.equal(levels.length, 25); assert.equal(levels[24].companyId, 5);
    assert.throws(() => validateLevels({levels: []}));
    levels.forEach(level => {const track = buildTrack(level, 56); assert.equal(track.filter(r => r.kind === 'gate').length, level.gateCount);
        assert.equal(track.filter(r => r.kind === 'item').length, level.itemCount);
        for (let i = 1; i < track.length; i++) assert.ok(track[i].at - track[i - 1].at >= 1.9);});
});
test('gate arithmetic is floored and bounded and trap inversion changes actual outcomes', () => {
    assert.equal(gateValue(100, {mul: 1.5, add: 20}), 170);
    assert.equal(gateValue(3, {mul: .5, add: 0}), 1);
    assert.equal(gateValue(99999, {mul: 5, add: 1000}), MAX_ENERGY);
    assert.equal(gateValue(100, flipGate({mul: 1.5, add: 20})), 46);
    assert.equal(gateValue(100, flipGate({mul: .5, add: -20})), 220);
});
test('high speed and a long frame resolve each crossed choice exactly once', () => {
    const r = running(); const row = {at: 1, ...gateRow({mul: 1, add: 10, name: 'test'})};
    r.rows.splice(0, r.rows.length, row, {...row, at: 2}); r.rush = 8;
    r.step(1); assert.equal(r.energy, 120); assert.equal(r.cursor, 2);
    r.step(1); assert.equal(r.energy, 120);
});
test('pausing freezes countdown, run distance, timers, and statuses', () => {
    const r = running(); r.fish = 10; r.paused = true; r.step(60);
    assert.equal(r.remaining, 180); assert.equal(r.distance, 0); assert.equal(r.fish, 10);
    r.phase = 'ready'; r.phaseTime = 3; r.step(10); assert.equal(r.phaseTime, 3);
});
test('blocking stops distance for five seconds while time continues', () => {
    const r = running(); r.rows.splice(0); r.applyItem('block'); r.step(4.5);
    assert.equal(r.distance, 0); assert.ok(r.remaining < 176); r.step(1); assert.ok(r.distance > .4);
});
test('fish ignores negative gates and obstacles, then expires in active time', () => {
    const r = running(); r.rows.splice(0); r.applyItem('fish'); r.applyItem('layoff');
    r.resolve(gateRow({mul: .5, add: -10, name: 'bad'})); assert.equal(r.energy, 100); assert.equal(r.trap, 0);
    r.step(10.1); r.applyItem('overtime'); assert.equal(r.energy, 80);
});
test('an ally absorbs one obstacle and the thief steals only the next positive gate', () => {
    const r = running(); r.applyItem('ally'); r.applyItem('overtime'); assert.equal(r.energy, 100); assert.equal(r.ally, 0);
    r.applyItem('overtime'); assert.equal(r.energy, 80); r.applyItem('thief'); r.applyItem('food'); assert.equal(r.energy, 110);
    r.resolve(gateRow({mul: 1, add: 50, name: 'good'})); assert.equal(r.energy, 110); assert.equal(r.thief, false);
    r.resolve(gateRow({mul: 1, add: 50, name: 'good'})); assert.equal(r.energy, 160);
});
test('lottery awards 5000 once; dismissal preserves energy and resets the track', () => {
    const r = running(); r.applyItem('lottery'); r.applyItem('lottery'); assert.equal(r.energy, 5100);
    r.distance = 80; r.cursor = 20; r.applyItem('fired'); assert.equal(r.distance, 0); assert.equal(r.cursor, 0); assert.equal(r.energy, 5100);
});
test('equal energy loses an encounter but wins the final duel', () => {
    const r = running(1, 470); r.resolve({kind: 'encounter', at: 0, enemy: 470}); assert.equal(r.energy, 376);
    r.energy = r.level.bossEnergy; r.phase = 'duel'; r.phaseTime = 1; r.step(1.2); assert.equal(r.won, true);
});
test('all five normal and ultimate company skills affect the promised state', () => {
    const first = running(1, 1000); first.applySkill(); assert.equal(first.energy, 500);
    const wolf = running(5, 1000); wolf.applySkill(); assert.equal(wolf.energy, 400); assert.equal(wolf.noPickup, 5);
    const pan = running(10, 1000); pan.applySkill(); assert.equal(pan.energy, 700); assert.equal(pan.trap, 5);
    const bee = running(15); bee.applySkill(); assert.equal(bee.slow, 10); assert.equal(bee.badItems, 3);
    const octopus = running(20); octopus.applySkill(); assert.equal(octopus.rush, 10);
    const owl = running(25, 1000); owl.rows.splice(0); owl.applySkill(); assert.equal(owl.energy, 1000); assert.equal(owl.fakeEnergy, 100);
    owl.step(10.1); assert.equal(owl.fakeEnergy, 0); assert.equal(owl.energy, 500);
});
test('reviving retains 80 percent and cannot be repeated or used after victory', () => {
    const r = running(); r.energy = 200; r.distance = 150; r.fail('test'); assert.equal(r.revive(), true); assert.equal(r.energy, 160);
    assert.ok(r.distance <= 97.5); assert.equal(r.remaining, 75); r.fail('again'); assert.equal(r.revive(), false);
    const won = running(); won.phase = 'result'; won.won = true; assert.equal(won.revive(), false);
});
test('every authored level is winnable through deliberate choices across ten seeds', () => {
    for (const level of levels) for (let seed = 1; seed <= 10; seed++) {
        const r = new RunModel(level, 'campaign', 100, seed);
        let ticks = 0;
        while (r.phase !== 'result' && ticks++ < 5000) {
            const row = r.rows[r.cursor];
            if (row?.kind === 'gate') {
                const values = row.gates.map(g => gateValue(r.energy, r.effectiveGate(g)));
                r.move(values.indexOf(Math.max(...values)) - 1);
            } else if (row?.kind === 'item') {
                const good = row.items.findIndex(id => id && ['raise', 'lottery', 'food', 'fish', 'ally'].includes(id));
                r.move((good >= 0 ? good : row.items.indexOf(null)) - 1);
            }
            r.step(.05);
        }
        assert.equal(r.won, true, 'unwinnable level ' + level.id + ', seed ' + seed + ', energy ' + r.energy + ', boss ' + level.bossEnergy);
    }
});
test('poor choices can lose and the 180 second race timeout is enforced', () => {
    const r = running(); r.energy = 10; r.resolve(gateRow({mul: 1, add: -20, name: 'bad'})); assert.equal(r.phase, 'result'); assert.equal(r.won, false);
    const timeout = running(); timeout.rows.splice(0); timeout.stop = 200; timeout.step(181); assert.equal(timeout.phase, 'result'); assert.match(timeout.reason, /超时/);
});
test('settlement is idempotent and brawls do not unlock campaign levels', () => {
    const s = new GameStore(memory()); const a = s.win('run-one', 1, 900, 'campaign', 28);
    assert.equal(a, 58); assert.equal(s.state.coins, 58); assert.equal(s.state.unlocked, 2);
    assert.equal(s.win('run-one', 1, 900, 'campaign', 28), 0); assert.equal(s.state.coins, 58);
    s.win('brawl', 25, 7000, 'brawl', 220); assert.equal(s.state.unlocked, 2); assert.equal(s.state.cleared.length, 1);
});
test('currency purchases require funds and card/SPА energy takes the maximum once', () => {
    const s = new GameStore(memory()); assert.equal(s.buyCard('spa'), false); s.addCoins(500);
    assert.equal(s.buySkin('elite'), true); assert.equal(s.buyCard('spa'), true); assert.equal(s.equip('spa'), true); assert.equal(s.buySpa(), true);
    assert.equal(s.startEnergy(), 200); assert.equal(s.consumeStart(), 200); assert.equal(s.state.cards.spa, 0); assert.equal(s.startEnergy(), 100);
    assert.equal(s.equip('not-a-card'), false); assert.equal(s.buySkin('not-a-skin'), false);
});
test('nine fragments craft exactly one card, then equipping can be cancelled', () => {
    const s = new GameStore(memory()); s.state.fragments.spa = 9; assert.equal(s.craft('spa'), true); assert.equal(s.state.fragments.spa, 0); assert.equal(s.craft('spa'), false);
    s.equip('spa'); s.equip('spa'); assert.equal(s.state.equipped, '');
});
test('offline expedition clocks survive reload and each parcel can be claimed once', () => {
    const m = memory(); const s = new GameStore(m); assert.equal(s.dispatch(1000000, 7), true); assert.equal(s.dispatch(1000001), false);
    assert.equal(s.claimExpedition(1599999), null); const restored = new GameStore(m); assert.ok(restored.state.expedition);
    const reward = restored.claimExpedition(1600000); assert.ok(reward.coins >= 2 && reward.coins <= 50); assert.ok(reward.fragments >= 1 && reward.fragments <= 3);
    const coins = restored.state.coins; assert.equal(restored.claimExpedition(1600001), null); assert.equal(restored.state.coins, coins);
});
test('daily supplies use the Shanghai date and are idempotent across restart', () => {
    const m = memory(); const s = new GameStore(m); const t = Date.UTC(2026, 9, 14, 18);
    assert.equal(s.daily(t), true); assert.equal(s.state.daily, '2026-10-15'); assert.equal(new GameStore(m).daily(t), false);
    assert.equal(s.daily(t + 86400000), true); assert.equal(s.state.coins, 70);
});
test('a corrupt primary save recovers from backup; unknown and malicious fields are rejected', () => {
    const m = memory(); const s = new GameStore(m); s.addCoins(120); s.persist(); m.set('boss.save.v2', 'invalid json');
    const restored = new GameStore(m); assert.equal(restored.recovered, true); assert.equal(restored.state.coins, 120);
    m.set('boss.save.v2', JSON.stringify({version: 2, coins: -10, unlocked: 9999, skin: 'alien', gender: 'alien', cards: {spa: -100}, equipped: 'spa', cleared: [999, -1, 2, 2]}));
    const clean = new GameStore(m); assert.equal(clean.state.coins, 0); assert.equal(clean.state.unlocked, 25); assert.equal(clean.state.skin, 'default'); assert.equal(clean.state.equipped, ''); assert.deepEqual(clean.state.cleared, [2]);
});
test('storage failure is reported without crashing gameplay', () => {
    const s = new GameStore({get: () => null, set: () => {throw Error('full');}}); s.daily(10000000000); assert.match(s.persistenceError, /存储/); assert.equal(s.state.coins, 35);
});
