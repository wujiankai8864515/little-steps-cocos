require('../tools/ts-loader.cjs');
const { test } = require('node:test'), assert = require('node:assert/strict'), Module = require('module');
const { Runtime } = require('../assets/foundation/Runtime.ts');
const { createCardMod } = require('../assets/mods/base-card/CardMod.ts');
const { createCatalogMod, loadCatalogSave, saveCatalogState } = require('../assets/mods/base-shell/CatalogMod.ts');
const config = require('../assets/art/resources/config/catalog.json');
const front = rank => ({ side: 'front', assetName: `poker_heart_red_0${rank}`, suit: 'heart', color: 'red', rankCode: `0${rank}`, rankValue: rank });
const level = { schemaVersion: 1, levelId: 'level_difficulty1_01', difficulty: 1,
    designSize: { width: 1000, height: 1000 }, cardSize: { width: 162, height: 243 },
    currentCard: { sourceName: 'poker_heart_red_01', figmaCard: front(1) },
    slots: [2, 3, 4].map((rank, i) => ({ id: `slot_${i}`, figmaCard: front(rank), x: i * 100, y: 0,
        width: 162, height: 243, rotation: 0, zIndex: i, initialFaceUp: true, coveredBy: [], covers: [] })) };
const send = async (runtime, type, payload) => {
    const result = await runtime.dispatch({ type, ...(payload ? { payload } : {}) });
    assert.equal(result.status, 'committed', `${type}: ${result.reason}`);
};
const card = runtime => runtime.read('base-card');
const shellState = runtime => runtime.read('base-shell');

test('each floating grant adds exactly 1000 and persists without modifying story progress or settings', async () => {
    const saved = new Map(), storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
    const shell = new Runtime([createCatalogMod(config, [level.levelId], null, {
        save: state => saveCatalogState(storage, state), render() {},
    }, () => 21000)]);
    await shell.open(); const before = shellState(shell);
    await send(shell, 'shell.grantCoins', { amount: 999999 }); await send(shell, 'shell.grantCoins');
    assert.deepEqual(shellState(shell), { ...before, coins: before.coins + 2000 });
    assert.equal(loadCatalogSave(storage).coins, before.coins + 2000);
    assert.equal(shell.canUndo, false); await shell.dispose();
});

test('in-game grants checkpoint the real wallet and survive draws, undo, pause, snapshots and paid restart', async () => {
    const shell = new Runtime([createCatalogMod(config, [level.levelId], null, null, () => 21000)]); await shell.open();
    await send(shell, 'shell.page', { page: 'intro', levelId: level.levelId }); await send(shell, 'shell.start');
    const roundId = shellState(shell).round.id;
    const game = new Runtime([createCardMod(level, 123, {
        render: ctx => [{ id: 'checkpoint', run: async () => send(shell, 'shell.card', {
            roundId, coins: ctx.state['base-card'].session.coins, complete: ctx.state['base-card'].core.isComplete,
            played: ctx.action.type !== 'card.open' && ctx.action.type !== 'card.grantCoins',
        }) }], afterRender() {},
    }, { economy: config.economy, initialCoins: shellState(shell).coins, retryCost: 500 })]);
    await game.open(); const initial = card(game);
    await send(game, 'card.draw'); const drawn = card(game);
    await send(game, 'card.grantCoins'); await send(game, 'card.grantCoins');
    assert.equal(card(game).session.coins, initial.session.coins + 2000);
    assert.equal(shellState(shell).coins, card(game).session.coins);
    assert.deepEqual(card(game).core, drawn.core); assert.equal(card(game).rng, drawn.rng);
    assert.equal(game.exportSnapshot().history.length, 1);
    game.restoreSnapshot(game.exportSnapshot());
    await send(game, 'card.rollback'); assert.deepEqual(card(game).core, initial.core);
    assert.equal(card(game).session.coins, initial.session.coins + 1950);
    await send(game, 'card.pause'); const paused = card(game);
    await send(game, 'card.grantCoins'); assert.deepEqual(card(game), { ...paused, session: { ...paused.session, coins: paused.session.coins + 1000 } });
    await send(game, 'card.restart'); assert.equal(card(game).session.coins, initial.session.coins + 2450);
    assert.equal(shellState(shell).coins, card(game).session.coins);
    assert.equal(game.canUndo, false); await game.dispose(); await shell.dispose();
});

test('completion can receive coins without awarding completion twice or adding undo history', async () => {
    const runtime = new Runtime([createCardMod({ ...level, slots: level.slots.slice(0, 1) }, 123, undefined,
        { economy: config.economy, initialCoins: 5200 })]); await runtime.open();
    await send(runtime, 'card.play', { slotId: 'slot_0' }); const won = card(runtime), history = runtime.exportSnapshot().history;
    await send(runtime, 'card.grantCoins'); await send(runtime, 'card.grantCoins');
    assert.deepEqual(card(runtime), { ...won, session: { ...won.session, coins: won.session.coins + 2000 } });
    assert.deepEqual(runtime.exportSnapshot().history, history); await runtime.dispose();
});

class Transform { setContentSize(width, height) { Object.assign(this, { width, height }); } }
class FakeNode {
    static EventType = { TOUCH_START: 'start', TOUCH_MOVE: 'move', TOUCH_END: 'end', TOUCH_CANCEL: 'cancel' };
    constructor(name = 'root') { Object.assign(this, { name, isValid: true, active: true, layer: 1, children: [], components: new Map(), events: new Map(), position: { x: 0, y: 0 } }); }
    addChild(child) { child.parent = this; this.children.push(child); }
    addComponent(Type) { const component = new Type(); component.node = this; this.components.set(Type, component); return component; }
    getComponent(Type) { return this.components.get(Type) ?? (Type.name === 'GamePageUI' ? this.gamePage ?? null : null); }
    setPosition(x, y) { this.position = { x, y }; } setScale() {}
    setSiblingIndex(index) { const siblings = this.parent.children; siblings.splice(siblings.indexOf(this), 1); siblings.splice(index, 0, this); }
    on(type, handler) { this.events.set(type, handler); }
}
class Widget { updateAlignment() { this.node.setPosition(494.5, 840); } }
class Paint { circle() {} fill() {} stroke() {} }
class Color { static WHITE = new Color(); }
const original = Module._load;
Module._load = function(id, ...args) { if (id === 'cc') return {
    _decorator: { ccclass: () => value => value, executionOrder: () => value => value, property: () => () => {} },
    Component: class { constructor() { this.node = new FakeNode(); } }, Node: FakeNode, Color, Graphics: Paint,
    UITransform: Transform, Widget, BlockInputEvents: class {}, Label: class {},
    HorizontalTextAlignment: {}, VerticalTextAlignment: {}, Vec3: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } },
}; if (id === 'cc/env') return { NATIVE: false }; return original.call(this, id, ...args); };
const { AppBootstrap } = require('../assets/mods/base-shell/AppBootstrap.ts');
const { CardCompletionUI } = require('../assets/mods/base-card/CardCompletionUI.ts');
Module._load = original;
const touch = (x, y) => ({ getID: () => 1, getUILocation: () => ({ x, y }) });
const microtasks = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('the global ball stays above a modal, a tap queues one grant, and dragging or cancelling never grants', () => {
    const app = new AppBootstrap(); app.node.addComponent(Transform).setContentSize(1181, 2556); app.createCoinBall();
    const ball = app.coinBall; app.node.addChild(new FakeNode('modal')); app.lateUpdate();
    assert.equal(app.node.children.at(-1), ball);
    ball.events.get('start')(touch(0, 0)); ball.events.get('end')(touch(0, 0)); assert.equal(app.pendingCoinGrants, 1);
    ball.events.get('start')(touch(0, 0)); ball.events.get('move')(touch(10000, -10000)); ball.events.get('end')(touch(10000, -10000));
    assert.equal(app.pendingCoinGrants, 1); assert.ok(Math.abs(ball.position.x) <= 498.5 && Math.abs(ball.position.y) <= 1186);
    ball.events.get('start')(touch(0, 0)); ball.events.get('cancel')(touch(0, 0)); assert.equal(app.pendingCoinGrants, 1);
    app.lifetime.dispose();
});

test('queued taps wait through loading and card animations, then commit once each without overlap', async () => {
    const app = new AppBootstrap(), game = new FakeNode('game'); app.screen = game;
    app.shell = { isBusy: false }; app.pendingCoinGrants = 3; app.loading = true;
    let started = 0, release;
    game.gamePage = { canGrantCoins: false, async grantCoins() { started++; await new Promise(done => release = done); } };
    app.lateUpdate(); assert.equal(app.pendingCoinGrants, 3);
    app.loading = false; app.lateUpdate(); assert.equal(app.pendingCoinGrants, 3);
    game.gamePage.canGrantCoins = true;
    for (let i = 0; i < 3; i++) {
        app.lateUpdate(); await microtasks(); assert.equal(started, i + 1);
        app.lateUpdate(); await microtasks(); assert.equal(started, i + 1);
        release(); await microtasks();
    }
    assert.equal(app.pendingCoinGrants, 0); assert.equal(app.coinGrantInFlight, false);
    app.lifetime.dispose(); app.pendingCoinGrants = 1; app.lateUpdate(); assert.equal(started, 3);
});

test('completion wallet includes grants before and after its reward collection display', () => {
    const completion = new CardCompletionUI(); completion.coinLabel = {}; completion.initialCoins = 6200;
    completion.displayedCoins = 5200; completion.updateCoins(7200); assert.equal(completion.coinLabel.string, '6,200');
    completion.displayedCoins = 6200; completion.updateCoins(8200); assert.equal(completion.coinLabel.string, '8,200');
    completion.lifetime.dispose();
});
