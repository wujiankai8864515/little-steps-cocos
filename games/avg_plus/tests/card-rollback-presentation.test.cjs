require('../tools/ts-loader.cjs');
const { test } = require('node:test'), assert = require('node:assert/strict'), Module = require('module');
class Vector { constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); } clone() { return new Vector(this.x, this.y, this.z); } }
class Sprite {}
const running = new Set(), paths = [];
class NativeTween {
    constructor(target) { this.target = target; this.actions = []; this.elapsed = 0; }
    to(duration, values, options) { this.actions.push({ duration, values, options }); return this; }
    call(done) { this.done = done; return this; }
    start() { this.startPosition = this.target.position.clone(); running.add(this); paths.push(this); return this; }
    stop() { running.delete(this); }
    step(dt) {
        this.elapsed += dt;
        const { duration, values } = this.actions[0], t = Math.min(1, this.elapsed / duration);
        const eased = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        for (const key of Object.keys(values)) {
            const start = key === 'position' ? this.startPosition : new Vector(1, 1, 1), end = values[key];
            this.target[key] = new Vector(...['x', 'y', 'z'].map(axis => start[axis] + (end[axis] - start[axis]) * eased));
        }
        this.samples ??= []; this.samples.push({ position: this.target.position.clone(), angle: this.target.angle });
        if (t === 1) this.done();
    }
}
const original = Module._load;
Module._load = function(id, ...args) { if (id === 'cc') return {
    _decorator: { ccclass: () => value => value, property: () => () => {} },
    Component: class { constructor() { this.node = { isValid: true }; } }, Sprite, Vec3: Vector,
    tween: target => new NativeTween(target),
}; return original.call(this, id, ...args); };
const { GamePresentation } = require('../assets/mods/base-card/GamePresentation.ts');
const { CardSpriteLoader } = require('../assets/mods/base-card/CardSpriteLoader.ts');
Module._load = original;
CardSpriteLoader.loadSpriteFrame = async name => ({ name });
function fixture() {
    running.clear(); paths.length = 0;
    const make = (name, x, y) => ({ name, isValid: true, position: new Vector(x, y), scale: new Vector(1, 1, 1), angle: 0,
        sprite: { spriteFrame: { name: 'played-card' } }, getComponent(type) { return type === Sprite ? this.sprite : null; },
        destroy() { this.isValid = false; } });
    const current = make('current', 0, 0), wild = make('wild', 400, 0), backup = make('backup', -300, 0), copies = [];
    const page = new GamePresentation(); page._level = { slots: [{ id: 'slot', rotation: 18 }] };
    const sounds = []; page.playCardSound = kind => sounds.push(kind);
    page.findNode = id => id === 'current' ? current : id === 'wild' ? { getChildByName: () => wild } : null;
    page.rootPositionOf = node => node.position.clone(); page.worldToRoot = value => value;
    page.boardSlotWorldPosition = () => new Vector(150, 500); page.boardSlotScaleFor = () => new Vector(.9, .9, 1);
    page.targetScaleFor = () => new Vector(1, 1, 1); page.getTopBackupNode = count => { assert.equal(count, 3); return backup; };
    page.cardShadowFor = () => ({ setSimulatedHeight() {} });
    page.createFlyingVisual = (source, name) => { const copy = make(name, source.position.x, source.position.y);
        copy.sprite.spriteFrame = source.sprite.spriteFrame; copies.push(copy); return copy; };
    page.tweenBoardFlight = () => { throw new Error('undo must not reverse the board flight'); };
    return { page, current, copies, sounds };
}
async function settle(work) {
    let done = false; work.finally(() => done = true).catch(() => {});
    for (let frame = 0; frame < 30 && !done; frame++) {
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        for (const value of [...running]) value.step(.04);
    }
    await work;
}
function straightPaths() {
    assert.equal(running.size, 0);
    for (const path of paths) {
        assert.equal(path.actions.length, 1); assert.equal(path.actions[0].options.easing, 'quadInOut');
        assert.equal('angle' in path.actions[0].values, false);
        const end = path.actions[0].values.position;
        for (const sample of path.samples) {
            const start = path.startPosition, p = sample.position;
            assert.ok(Math.abs((p.x - start.x) * (end.y - start.y) - (p.y - start.y) * (end.x - start.x)) < 1e-6);
            assert.ok(p.y >= Math.min(start.y, end.y) && p.y <= Math.max(start.y, end.y));
            assert.equal(sample.angle, path.target.angle);
        }
    }
}
test('wild-assisted board undo slides the played card to its slot and returns the wild to its tool', async () => {
    const { page, current, copies, sounds } = fixture();
    await settle(page.animateRollback({ kind: 'board', slotId: 'slot', usedWild: true }, {}, 'ordinary-current'));
    assert.equal(current.sprite.spriteFrame.name, 'ordinary-current');
    assert.deepEqual(copies.map(copy => [copy.name, copy.sprite.spriteFrame.name, copy.position.x, copy.position.y]), [
        ['rollbackBoard', 'played-card', 150, 500], ['rollbackWild', 'poker_wild', 400, 0],
    ]);
    assert.ok(copies.every(copy => !copy.isValid)); assert.deepEqual(sounds, ['undo']); straightPaths(); page.onDestroy();
});
test('stock undo slides a back to the restored top slot, without a flip, arc or spinning phase', async () => {
    const { page, current, copies } = fixture();
    await settle(page.animateRollback({ kind: 'stock' }, { stockRemainingCount: 3 }, 'ordinary-current'));
    assert.equal(current.sprite.spriteFrame.name, 'ordinary-current');
    assert.equal(copies[0].sprite.spriteFrame.name, 'poker_back_01');
    assert.deepEqual(copies[0].position, new Vector(-300, 0)); straightPaths(); page.onDestroy();
});
test('cancelling a pending wild returns it only to its tool, and interruption clears both undo copies', async () => {
    let f = fixture(); f.current.sprite.spriteFrame = { name: 'poker_wild' };
    await settle(f.page.animateRollback({ kind: 'wild' }, {}, 'ordinary-current'));
    assert.equal(f.copies.length, 1); assert.equal(f.copies[0].position.x, 400); straightPaths(); f.page.onDestroy();
    f = fixture();
    const work = f.page.animateRollback({ kind: 'board', slotId: 'slot', usedWild: true }, {}, 'ordinary-current');
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(running.size, 2); f.page.cancelVisuals();
    await assert.rejects(work, /失效/); assert.equal(running.size, 0);
    assert.ok(f.copies.every(copy => !copy.isValid)); f.page.onDestroy();
});
