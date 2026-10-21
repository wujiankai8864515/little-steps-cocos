require('../tools/ts-loader.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Runtime } = require('../assets/foundation/Runtime.ts');
const { createCardMod } = require('../assets/mods/base-card/CardMod.ts');
const { HighLowSolitaireCore } = require('../assets/mods/base-card/HighLowSolitaireCore.ts');
const { GameSessionStore } = require('../assets/mods/base-card/GameSessionStore.ts');
const { buildGamePageViewState } = require('../assets/mods/base-card/GameUIContract.ts');
const economy = require('../assets/art/resources/config/catalog.json').economy;
const front = rank => ({ side: 'front', assetName: `poker_heart_red_${String(rank).padStart(2, '0')}`,
    suit: 'heart', color: 'red', rankCode: String(rank).padStart(2, '0'), rankValue: rank });
const level = { schemaVersion: 1, levelId: 'level_difficulty1_01', difficulty: 1,
    designSize: { width: 1000, height: 1000 }, cardSize: { width: 162, height: 243 },
    currentCard: { sourceName: 'poker_heart_red_01', figmaCard: front(1) },
    slots: [2, 5, 6, 9].map((rank, index) => ({ id: `slot_${index}`, figmaCard: front(rank),
        x: index * 100, y: 0, width: 162, height: 243, rotation: index * 4, zIndex: index,
        initialFaceUp: true, coveredBy: [], covers: [] })) };
const state = runtime => runtime.read('base-card');
async function act(runtime, type, slotId) {
    const result = await runtime.dispatch({ type, ...(slotId ? { payload: { slotId } } : {}) });
    assert.equal(result.status, 'committed', `${type}: ${result.reason}`);
    return state(runtime);
}
async function open(stock = 2, results = []) {
    const runtime = new Runtime([createCardMod(level, 123, {
        render(ctx) { results.push(ctx.result); return []; }, afterRender() {},
    }, { initialStockCount: stock, initialCoins: 10000, economy })]);
    await runtime.open();
    return runtime;
}
function sameCards(actual, expected) {
    assert.deepEqual(actual.core, expected.core);
    assert.equal(actual.rng, expected.rng);
    assert.equal(actual.session.freeStockDraws, expected.session.freeStockDraws);
    assert.deepEqual(actual.session.streakColors, expected.session.streakColors);
    assert.equal(actual.session.wildReady, false);
    const core = new HighLowSolitaireCore(level); core.restoreSnapshot(actual.core); core.assertIntegrity();
}

test('undoing an unused wild returns it to its tool without consuming cards, money or history', async () => {
    const results = [], runtime = await open(2, results), initial = state(runtime);
    await act(runtime, 'card.wild');
    const selected = state(runtime), core = new HighLowSolitaireCore(level); core.restoreSnapshot(selected.core);
    const session = new GameSessionStore(economy); session.restoreCheckpoint(selected.session);
    const view = buildGamePageViewState({ core: core.getState(), session: session.getViewState(), paused: false,
        inputLocked: false, canRollback: runtime.canUndo });
    assert.equal(view.controls.rollbackVisible, true);
    assert.equal(view.controls.rollbackEnabled, true);
    assert.equal(view.actionCosts.rollback, 0);
    sameCards(await act(runtime, 'card.rollback'), initial);
    assert.deepEqual(state(runtime), initial);
    assert.equal(runtime.canUndo, false);
    assert.equal(results.at(-1).visual.kind, 'wild');
    await runtime.dispose();
});

test('a selected wild never gets mistaken for the preceding stock draw during consecutive undo', async () => {
    const results = [], runtime = await open(2, results), initial = state(runtime);
    const drawn = await act(runtime, 'card.draw');
    await act(runtime, 'card.wild');
    sameCards(await act(runtime, 'card.rollback'), drawn);
    assert.equal(state(runtime).session.coins, drawn.session.coins);
    assert.equal(runtime.exportSnapshot().history.length, 1);
    assert.equal(results.at(-1).visual.kind, 'wild');
    sameCards(await act(runtime, 'card.rollback'), initial);
    assert.equal(state(runtime).session.coins, initial.session.coins - 50);
    assert.equal(results.at(-1).visual.kind, 'stock');
    assert.equal(runtime.canUndo, false);
    await runtime.dispose();
});

test('wild play, draw, refill and ordinary play can all be undone in their original order', async () => {
    const results = [], runtime = await open(1, results), initial = state(runtime);
    const drawn = await act(runtime, 'card.draw');
    const refilled = await act(runtime, 'card.addBackup');
    await act(runtime, 'card.wild');
    const wildPlayed = await act(runtime, 'card.play', 'slot_1');
    const ordinaryPlayed = await act(runtime, 'card.play', 'slot_2');
    await act(runtime, 'card.draw');
    for (const [expected, kind, wild] of [
        [ordinaryPlayed, 'stock', false], [wildPlayed, 'board', false],
        [refilled, 'board', true], [drawn, 'addBackup', false], [initial, 'stock', false],
    ]) {
        sameCards(await act(runtime, 'card.rollback'), expected);
        assert.equal(results.at(-1).visual.kind, kind);
        assert.equal(Boolean(results.at(-1).visual.usedWild), wild);
    }
    assert.equal(state(runtime).session.actionUses.wild, 1);
    assert.equal(state(runtime).session.actionUses.rollback, 5);
    assert.equal(state(runtime).session.coins, initial.session.coins - 5 * 50);
    assert.equal(runtime.canUndo, false);
    await runtime.dispose();
});

test('undoing a wild-assisted move restores the ordinary current card and refunds only that move', async () => {
    const runtime = await open(), initial = state(runtime);
    await act(runtime, 'card.wild'); await act(runtime, 'card.play', 'slot_1');
    const undone = await act(runtime, 'card.rollback');
    sameCards(undone, initial);
    assert.equal(undone.session.coins, initial.session.coins - 50);
    assert.equal(undone.session.actionUses.wild, 1);
    await act(runtime, 'card.wild'); await act(runtime, 'card.play', 'slot_1');
    assert.equal(state(runtime).session.coins, initial.session.coins - 50 - 600);
    await runtime.dispose();
});

test('snapshot restore preserves mixed undo history and deterministic redraw without resurrecting a wild', async () => {
    const runtime = await open(), initial = state(runtime);
    const firstDraw = await act(runtime, 'card.draw');
    await act(runtime, 'card.wild'); await act(runtime, 'card.play', 'slot_1');
    const checkpoint = runtime.exportSnapshot();
    const restored = await open(); restored.restoreSnapshot(checkpoint);
    for (const target of [runtime, restored]) {
        sameCards(await act(target, 'card.rollback'), firstDraw);
        sameCards(await act(target, 'card.rollback'), initial);
        sameCards(await act(target, 'card.draw'), firstDraw);
    }
    assert.deepEqual(state(runtime), state(restored));
    await runtime.dispose(); await restored.dispose();
});
