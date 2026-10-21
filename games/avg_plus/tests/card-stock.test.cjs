require('../tools/ts-loader.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Runtime } = require('../assets/foundation/Runtime.ts');
const { HighLowSolitaireCore } = require('../assets/mods/base-card/HighLowSolitaireCore.ts');
const { createCardMod } = require('../assets/mods/base-card/CardMod.ts');

const labels = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
function front(suit, rank) {
    const color = suit === 'heart' || suit === 'diamond' ? 'red' : 'black';
    const rankCode = String(rank).padStart(2, '0');
    return { side: 'front', assetName: `poker_${suit}_${color}_${rankCode}`, suit, color,
        rankCode, rankValue: rank, label: labels[rank - 1], rankLabel: labels[rank - 1] };
}
const allFaces = ['diamond', 'heart', 'spade', 'club'].flatMap(suit =>
    Array.from({ length: 13 }, (_, index) => front(suit, index + 1)));
const back = { side: 'back', assetName: 'poker_back_01', variant: '01' };
function makeLevel(faces = [front('heart', 4)], current = front('heart', 1)) {
    return { schemaVersion: 1, levelId: 'level_difficulty1_01', difficulty: 1,
        designSize: { width: 1000, height: 1000 }, cardSize: { width: 162, height: 243 },
        ...(current ? { currentCard: { sourceName: current.assetName, figmaCard: current } } : {}),
        slots: faces.map((face, index) => ({ id: `slot_${String(index + 1).padStart(3, '0')}`,
            sourceName: face.assetName, figmaCard: face, x: index, y: 0, width: 162, height: 243,
            rotation: 0, zIndex: index, initialFaceUp: face.side === 'front', coveredBy: [], covers: [] })) };
}
function assertLiveUnique(snapshot) {
    const live = [snapshot.currentCard, ...snapshot.slots.flatMap(slot => slot.card ? [slot.card] : [])];
    assert.equal(new Set(live.map(card => card.cardName)).size, live.length);
    assert.equal(new Set(live.map(card => `${card.suit}:${card.rankValue}`)).size, live.length);
}
const state = runtime => runtime.read('base-card');
const dispatch = (runtime, type, payload) => runtime.dispatch({ type, ...(payload ? { payload } : {}) });

test('large opening boards keep ten undetermined backups; hidden cards and current are unique', () => {
    for (const fixedCurrent of [true, false]) {
        const level = makeLevel(Array(51).fill(back), fixedCurrent ? front('heart', 1) : null);
        // Leave exactly one exposed slot; every hidden card must still reserve its face.
        for (const slot of level.slots.slice(0, -1)) slot.coveredBy = ['slot_051'];
        level.slots[50].covers = level.slots.slice(0, -1).map(slot => slot.id);
        const core = new HighLowSolitaireCore(level, () => 0.37);
        core.startGame();
        const initial = core.captureSnapshot();
        assert.equal(initial.stockRemainingCount, 10);
        assert.equal(initial.slots.filter(slot => !slot.faceUp).length, 50);
        assert.equal(initial.slots.length + 1 + initial.stockRemainingCount, 62);
        assert.equal('deck' in initial, false);
        assert.equal('stockPile' in initial, false);
        assertLiveUnique(initial);
        for (let index = 0; index < 10; index++) {
            assert.equal(core.drawStockPile(), true);
            assertLiveUnique(core.captureSnapshot());
            // All 51 table faces remain occupied, so the old current is the sole candidate.
            assert.deepEqual(core.currentCard, initial.currentCard);
        }
        assert.equal(core.stockRemainingCount, 0);
        assert.equal(core.addStockCards(5), 5);
        assert.equal(core.stockRemainingCount, 5);
        assert.equal(core.drawStockPile(), true);
        assertLiveUnique(core.captureSnapshot());
    }
});

test('backup counts are independent of 52 faces and additions do not consume random numbers', () => {
    let randomCalls = 0;
    const core = new HighLowSolitaireCore(makeLevel(), () => { randomCalls++; return 0.5; });
    core.startGame(100);
    const openingCalls = randomCalls;
    for (let index = 0; index < 15; index++) assert.equal(core.addStockCards(5), 5);
    assert.equal(core.stockRemainingCount, 175);
    assert.equal(randomCalls, openingCalls);
    for (let index = 0; index < 120; index++) {
        assert.equal(core.drawStockPile(), true);
        assertLiveUnique(core.captureSnapshot());
    }
    assert.equal(randomCalls, openingCalls + 120);
    assert.equal(core.usedPile.length, 120);
    // History intentionally contains repeated faces and imposes no deck-conservation rule.
    assert.ok(new Set(core.usedPile.map(card => card.cardName)).size < core.usedPile.length);
    const checkpoint = core.captureSnapshot();
    for (const invalid of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
        assert.equal(core.addStockCards(invalid), 0);
        assert.deepEqual(core.captureSnapshot(), checkpoint);
    }
    assert.equal(randomCalls, openingCalls + 120);
});

test('a hit transfers the occupied face to current and releases the previous current for a later draw', () => {
    const core = new HighLowSolitaireCore(makeLevel([
        front('diamond', 2), front('diamond', 4),
    ], front('diamond', 1)), () => 0);
    core.startGame(2);
    assert.equal(core.tryMoveCard('slot_001'), true);
    assert.equal(core.currentCard.cardName, 'poker_diamond_red_02');
    assert.equal(core.slots[0].card, null);
    assertLiveUnique(core.captureSnapshot());
    // The first candidate is the old current (A), proving history does not reserve it.
    assert.equal(core.drawStockPile(), true);
    assert.equal(core.currentCard.cardName, 'poker_diamond_red_01');
    assertLiveUnique(core.captureSnapshot());
    assert.equal(core.usedPile[1].cardName, 'poker_diamond_red_02');
});

test('normal draws sample every unoccupied face, including the old current, without rank preference', () => {
    let sample = 0;
    const core = new HighLowSolitaireCore(makeLevel([front('diamond', 2)], front('diamond', 1)), () => sample);
    core.startGame(51);
    const drawn = new Set();
    for (let index = 0; index < 51; index++) {
        sample = (index + 0.5) / 51;
        assert.equal(core.drawStockPile(), true);
        drawn.add(core.currentCard.cardName);
        assertLiveUnique(core.captureSnapshot());
    }
    assert.equal(drawn.size, 51);
    assert.equal(drawn.has('poker_diamond_red_02'), false);
    assert.equal(drawn.has('poker_diamond_red_01'), true);
});

test('draw rollback restores RNG, stock count and free count; replay and snapshot replay draw the same face', async () => {
    const results = [];
    const runtime = new Runtime([createCardMod(makeLevel(), 123, {
        render(ctx) { results.push(ctx.result); return []; }, afterRender() {},
    })]);
    await runtime.open();
    const before = runtime.exportSnapshot();
    assert.equal((await dispatch(runtime, 'card.draw')).status, 'committed');
    const after = state(runtime);
    assert.notEqual(after.rng, before.state['base-card'].rng);
    assert.equal(after.core.stockRemainingCount, 9);
    assert.equal(after.session.freeStockDraws, 1);
    assert.equal(after.session.coins, 999);
    assert.deepEqual(results[0], { kind: 'draw', cardName: after.core.currentCard.cardName, missedSlotIds: [] });
    const drawnSnapshot = runtime.exportSnapshot();
    assert.equal((await dispatch(runtime, 'card.rollback')).status, 'committed');
    assert.deepEqual(state(runtime).core, before.state['base-card'].core);
    assert.equal(state(runtime).rng, before.state['base-card'].rng);
    assert.equal(state(runtime).session.freeStockDraws, 0);
    assert.equal(state(runtime).session.coins, 899);
    assert.equal((await dispatch(runtime, 'card.draw')).status, 'committed');
    assert.deepEqual(state(runtime).core, after.core);
    assert.equal(state(runtime).rng, after.rng);
    runtime.restoreSnapshot(before);
    await dispatch(runtime, 'card.draw');
    assert.deepEqual(runtime.exportSnapshot(), drawnSnapshot);
    // Saved history also contains the correct pre-draw RNG.
    runtime.restoreSnapshot(drawnSnapshot);
    await dispatch(runtime, 'card.rollback');
    assert.equal(state(runtime).rng, before.state['base-card'].rng);
    assert.equal((await dispatch(runtime, 'card.restart')).status, 'committed');
    assert.deepEqual(runtime.exportSnapshot(), before);
    assert.equal(runtime.canUndo, false);
    await runtime.dispose();
});

test('free draws, repeated paid additions, rollback and insufficient coins preserve accounting and RNG', async () => {
    const runtime = new Runtime([createCardMod(makeLevel(), 17)]);
    await runtime.open();
    // A hidden, occupied slot makes every draw legal while preserving the table face.
    const snapshot = runtime.exportSnapshot();
    snapshot.state['base-card'].core.slots[0].faceUp = false;
    runtime.restoreSnapshot(snapshot);
    const exhaust = async count => {
        for (let index = 0; index < count; index++) assert.equal((await dispatch(runtime, 'card.draw')).status, 'committed');
        assert.equal(state(runtime).core.stockRemainingCount, 0);
    };
    const unchanged = async type => {
        const before = runtime.exportSnapshot();
        assert.equal((await dispatch(runtime, type)).status, 'rejected');
        assert.deepEqual(runtime.exportSnapshot(), before);
    };
    await unchanged('card.addBackup');
    await exhaust(10);
    assert.equal(state(runtime).session.freeStockDraws, 10);
    await unchanged('card.draw');
    const depleted = state(runtime);
    assert.equal((await dispatch(runtime, 'card.addBackup')).status, 'committed');
    assert.equal(state(runtime).core.stockRemainingCount, 5);
    assert.equal(state(runtime).rng, depleted.rng);
    assert.equal(state(runtime).session.coins, 899);
    await dispatch(runtime, 'card.rollback');
    assert.deepEqual(state(runtime).core, depleted.core);
    assert.equal(state(runtime).rng, depleted.rng);
    assert.equal(state(runtime).session.coins, 899);
    for (let purchase = 0; purchase < 8; purchase++) {
        const rng = state(runtime).rng;
        assert.equal((await dispatch(runtime, 'card.addBackup')).status, 'committed');
        assert.equal(state(runtime).rng, rng);
        await exhaust(5);
        assertLiveUnique(state(runtime).core);
        assert.equal(state(runtime).session.freeStockDraws, 10);
    }
    assert.equal(state(runtime).session.coins, 99);
    await unchanged('card.addBackup');
    await runtime.dispose();
});

test('invalid, paused and wild-pending actions never change counts, coins, history or RNG', async () => {
    const runtime = new Runtime([createCardMod(makeLevel(), 123)]);
    await runtime.open();
    const unchanged = async (type, payload) => {
        const before = runtime.exportSnapshot();
        assert.equal((await dispatch(runtime, type, payload)).status, 'rejected');
        assert.deepEqual(runtime.exportSnapshot(), before);
    };
    await unchanged('card.play', { slotId: 'slot_001' });
    await unchanged('card.play', { slotId: 'missing' });
    await unchanged('card.rollback');
    await dispatch(runtime, 'card.pause');
    await unchanged('card.draw');
    await unchanged('card.addBackup');
    await dispatch(runtime, 'card.pause');
    await dispatch(runtime, 'card.wild');
    await unchanged('card.draw');
    await unchanged('card.addBackup');
    await dispatch(runtime, 'card.wild');
    assert.equal(state(runtime).session.coins, 999);
    await dispatch(runtime, 'card.wild');
    await dispatch(runtime, 'card.play', { slotId: 'slot_001' });
    assert.equal(state(runtime).core.isComplete, true);
    await unchanged('card.draw');
    await unchanged('card.addBackup');
    await runtime.dispose();
});

test('failed candidate validation and pre-commit cancellation discard drawn faces and random state', async () => {
    for (const mode of ['validation', 'cancellation']) {
        const guard = { manifest: { id: 'stock-guard', version: '1.0.0', apiVersion: 1, order: 200, requires: ['base-card'] },
            initialState: {}, validate() {},
            beforeCommit(ctx) {
                if (ctx.action.type !== 'card.draw') return;
                if (mode === 'validation') ctx.draft['base-card'].core.currentCard = ctx.draft['base-card'].core.slots[0].card;
                else ctx.scope.dispose();
            } };
        const runtime = new Runtime([createCardMod(makeLevel(), 123), guard]);
        await runtime.open();
        const before = runtime.exportSnapshot();
        assert.equal((await dispatch(runtime, 'card.draw')).status, mode === 'validation' ? 'failed' : 'cancelled');
        assert.deepEqual(runtime.exportSnapshot(), before);
        await runtime.dispose();
    }
});

test('presentation failure keeps the synchronously committed draw and matching card name', async () => {
    let presented;
    const runtime = new Runtime([createCardMod(makeLevel(), 123, {
        render(ctx) { presented = ctx; return [{ id: 'failed-flip', run() { throw new Error('asset unavailable'); } }]; },
        afterRender() {},
    })]);
    await runtime.open();
    assert.deepEqual(await dispatch(runtime, 'card.draw'), { status: 'committed', presentation: 'failed' });
    assert.equal(presented.result.cardName, state(runtime).core.currentCard.cardName);
    assert.equal(state(runtime).core.stockRemainingCount, 9);
    assert.equal(state(runtime).session.freeStockDraws, 1);
    assertLiveUnique(state(runtime).core);
    await runtime.dispose();
});

test('impossible boards and conflicting fixed cards reject before consuming RNG or changing a live core', () => {
    const invalidLevels = [makeLevel(Array(52).fill(back)),
        makeLevel([front('heart', 4), front('heart', 4)]), makeLevel([front('heart', 1)]),
        makeLevel([{ ...front('heart', 4), assetName: 'poker_spade_black_04' }])];
    for (const invalid of invalidLevels) {
        let calls = 0;
        const level = makeLevel();
        const core = new HighLowSolitaireCore(level, () => { calls++; return 0.5; });
        core.startGame();
        const before = core.captureSnapshot(), beforeCalls = calls;
        Object.assign(level, invalid);
        assert.throws(() => core.startGame(), /51|固定牌无效或重复/);
        assert.deepEqual(core.captureSnapshot(), before);
        assert.equal(calls, beforeCalls);
        assert.throws(() => createCardMod(invalid, 12), /51|固定牌无效或重复/);
    }
    const core = new HighLowSolitaireCore(makeLevel());
    for (const count of [-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => core.startGame(count));
    const noTestCandidate = makeLevel(Array.from({ length: 13 }, (_, index) => front('club', index + 1)));
    assert.throws(() => createCardMod(noTestCandidate, 12, undefined, { initialStockCount: 1, forceUnmatchedOpeningCards: true }), /测试基准牌/);
});

test('new and legacy core snapshots reject invalid faces, duplicate hidden cards and invalid counts atomically', () => {
    const core = new HighLowSolitaireCore(makeLevel([front('heart', 4), front('heart', 5)]));
    core.startGame();
    const before = core.captureSnapshot();
    for (const corrupt of [snapshot => { delete snapshot.schemaVersion; },
        snapshot => { snapshot.schemaVersion = 1; },
        snapshot => { snapshot.slots[1].card = snapshot.slots[0].card; snapshot.slots[1].faceUp = false; },
        snapshot => { snapshot.currentCard = snapshot.slots[0].card; },
        snapshot => { snapshot.currentCard.cardName = 'pretend-unique'; },
        snapshot => { snapshot.stockRemainingCount = -1; },
        snapshot => { snapshot.stockRemainingCount = 1.5; },
        snapshot => { delete snapshot.unmatchedOpeningDrawRanks; }]) {
        const snapshot = structuredClone(before);
        corrupt(snapshot);
        assert.throws(() => core.restoreSnapshot(snapshot));
        assert.deepEqual(core.captureSnapshot(), before);
    }
});

test('old mod-version snapshots reject explicitly; first test draw replays across undo and restart', async () => {
    const mod = createCardMod(makeLevel(), 12, undefined, { initialStockCount: 1, forceUnmatchedOpeningCards: true });
    assert.equal(mod.manifest.version, '2.0.0');
    const runtime = new Runtime([mod]);
    await runtime.open();
    const before = runtime.exportSnapshot();
    const oldVersion = structuredClone(before);
    oldVersion.fingerprint = oldVersion.fingerprint.replace('2.0.0', '1.0.0');
    assert.throws(() => runtime.restoreSnapshot(oldVersion), /不兼容/);
    assert.deepEqual(runtime.exportSnapshot(), before);
    await dispatch(runtime, 'card.draw');
    const after = state(runtime);
    assert.equal(after.core.unmatchedOpeningDrawRanks, null);
    await dispatch(runtime, 'card.rollback');
    assert.deepEqual(state(runtime).core, before.state['base-card'].core);
    await dispatch(runtime, 'card.draw');
    assert.deepEqual(state(runtime).core, after.core);
    assert.equal(state(runtime).rng, after.rng);
    await dispatch(runtime, 'card.restart');
    assert.deepEqual(runtime.exportSnapshot(), before);
    await runtime.dispose();
});

test('resource-loaded levels enforce the same 51-card and fixed-face limits as the core', async () => {
    const Module = require('node:module');
    const originalLoad = Module._load;
    let loadedLevel;
    let CardLevelRepository;
    Module._load = function (id, ...args) {
        if (id === 'cc') return { JsonAsset: class {}, resources: {
            load(path, type, callback) { callback(null, { json: loadedLevel }); },
        } };
        return originalLoad.call(this, id, ...args);
    };
    try { ({ CardLevelRepository } = require('../assets/mods/base-card/CardLevelRepository.ts')); }
    finally { Module._load = originalLoad; }
    loadedLevel = makeLevel(allFaces.filter(face => face.assetName !== 'poker_heart_red_01'));
    const valid = await new CardLevelRepository().loadLevel(loadedLevel.levelId);
    assert.equal(valid.slots.length, 51);
    const core = new HighLowSolitaireCore(valid);
    core.startGame();
    assert.equal(core.stockRemainingCount, 10);
    assertLiveUnique(core.captureSnapshot());
    for (const invalid of [makeLevel(Array(52).fill(back)),
        makeLevel([front('heart', 4), front('heart', 4)]), makeLevel([front('heart', 1)])]) {
        loadedLevel = invalid;
        await assert.rejects(new CardLevelRepository().loadLevel(invalid.levelId), /51|重复固定牌|同一张牌/);
    }
});

test('the latest product disables debug opening and keeps normal stock, JSON prices and paid retry', async () => {
    const fs = require('node:fs'), path = require('node:path');
    const read = file => JSON.parse(fs.readFileSync(path.join(__dirname, '..', file)));
    const profile = read('assets/art/resources/mods/profiles/default.json');
    const settings = profile.modules.find(entry => entry.id === 'base-card').config;
    assert.equal(settings.singleBackupCardTest, false);
    const level = read('assets/art/resources/config/card-levels/level_difficulty1_01.json');
    const { economy } = read('assets/art/resources/config/catalog.json');
    const runtime = new Runtime([createCardMod(level, settings.seed, undefined, {
        initialStockCount: level.initialStockCount ?? 10, forceUnmatchedOpeningCards: settings.singleBackupCardTest,
        initialCoins: 5200, economy, retryCost: economy.entryCost,
    })], { profile, level });
    await runtime.open();
    const before = state(runtime);
    assert.equal(before.core.stockRemainingCount, 10);
    assert.equal(before.core.currentCard.cardName, level.currentCard.figmaCard.assetName);
    assert.equal(before.core.unmatchedOpeningDrawRanks, null);
    assert.equal((await dispatch(runtime, 'card.draw')).status, 'committed');
    const drawn = state(runtime);
    assert.equal(drawn.core.stockRemainingCount, 9);
    assert.equal(drawn.session.freeStockDraws, 1);
    assert.equal(drawn.session.coins, 5200);
    await dispatch(runtime, 'card.rollback');
    assert.deepEqual(state(runtime).core, before.core);
    assert.equal(state(runtime).rng, before.rng);
    assert.equal(state(runtime).session.coins, 5150);
    await dispatch(runtime, 'card.draw');
    assert.deepEqual(state(runtime).core, drawn.core);
    assert.equal(state(runtime).rng, drawn.rng);
    assert.equal((await dispatch(runtime, 'card.addBackup')).status, 'rejected');
    for (let index = 0; index < 9; index++) assert.equal((await dispatch(runtime, 'card.draw')).status, 'committed');
    assert.equal(state(runtime).core.stockRemainingCount, 0);
    assert.equal(state(runtime).session.freeStockDraws, 10);
    const exhaustedRng = state(runtime).rng;
    assert.equal((await dispatch(runtime, 'card.addBackup')).status, 'committed');
    assert.equal(state(runtime).core.stockRemainingCount, 5);
    assert.equal(state(runtime).rng, exhaustedRng);
    assert.equal(state(runtime).session.coins, 4650);
    await dispatch(runtime, 'card.pause');
    assert.equal((await dispatch(runtime, 'card.restart')).status, 'committed');
    assert.deepEqual(state(runtime).core, before.core);
    assert.equal(state(runtime).rng, before.rng);
    assert.equal(state(runtime).session.coins, 4150);
    assert.equal(state(runtime).paused, false);
    assert.equal(runtime.canUndo, false);
    await runtime.dispose();
});
