require('../tools/ts-loader.cjs');
const { test } = require('node:test'), assert = require('node:assert/strict'), Module = require('module');
const callbacks = [], sources = [], clips = [];
class AudioSource {
    constructor() { this.isValid = true; this.starts = this.stops = 0; sources.push(this); }
    play() { this.starts++; }
    stop() { this.stops++; }
}
class AudioClip {}
class Node {
    constructor(name) { this.name = name; this.isValid = true; }
    addComponent(Type) { const component = new Type(); component.node = this; return component; }
    destroy() { this.isValid = false; }
}
const original = Module._load;
Module._load = function(id, ...args) { if (id === 'cc') return {
    _decorator: { ccclass: () => value => value, property: () => () => {} }, Node, AudioClip, AudioSource,
    Vec3: class { constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); } },
    Component: class { constructor() { this.node = { isValid: true, addChild() {} }; } },
    resources: { load(path, type, callback) { assert.equal(type, AudioClip); callbacks.push({ path, callback }); } },
}; return original.call(this, id, ...args); };
const { GamePageUI } = require('../assets/mods/base-card/GamePageUI.ts');
Module._load = original;
async function load(page, enabled) {
    const pending = page.loadCardSounds(enabled); await Promise.resolve();
    for (const { path, callback } of callbacks.splice(0)) {
        const clip = { path, refs: 0, addRef() { this.refs++; }, decRef() { this.refs--; } };
        clips.push(clip); callback(null, clip);
    }
    await pending;
}
test('card audio respects a disabled sound setting on its first frame, then uses bounded deal voices', async () => {
    sources.length = clips.length = 0;
    const page = new GamePageUI(); let now = 1; page.openingTime = () => now;
    await load(page, false);
    for (const kind of ['deal', 'play', 'draw', 'undo']) page.playCardSound(kind);
    assert.ok(sources.every(source => source.starts === 0));
    // The shell's existing preference application changes these same AudioSource volumes.
    for (const source of sources) source.volume = 1;
    for (let i = 0; i < 100; i++) page.playCardSound('deal');
    assert.equal(sources.reduce((sum, source) => sum + source.starts, 0), 1);
    for (let i = 0; i < 5; i++) { now += .05; page.playCardSound('deal'); }
    assert.equal(page.cardSounds.deal.length, 3);
    assert.ok(page.cardSounds.deal.every(source => source.starts === 2));
    for (const kind of ['play', 'draw', 'undo']) { page.playCardSound(kind); assert.equal(page.cardSounds[kind][0].starts, 1); }
    const played = sources.reduce((sum, source) => sum + source.starts, 0);
    page.lifetime.dispose(); page.disposeCardSounds(); page.playCardSound('undo');
    assert.equal(sources.reduce((sum, source) => sum + source.starts, 0), played);
    assert.ok(sources.every(source => source.stops === 1 && source.clip === null && !source.node.isValid));
    assert.ok(clips.every(clip => clip.refs === 0));
});
test('late audio loads after leaving the page cannot retain clips, create sources or start playback', async () => {
    sources.length = clips.length = 0;
    const page = new GamePageUI(), pending = page.loadCardSounds(true);
    await Promise.resolve(); assert.equal(callbacks.length, 4);
    page.lifetime.dispose();
    await assert.rejects(pending, /取消/);
    for (const { path, callback } of callbacks.splice(0)) callback(null, { path, addRef() { throw new Error('late retain'); } });
    await Promise.resolve(); await Promise.resolve();
    page.playCardSound('draw'); assert.equal(sources.length, 0);
});
