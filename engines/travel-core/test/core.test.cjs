const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const context = vm.createContext({Float32Array, Uint16Array, console});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/travel-core.js'), 'utf8'), context);
const core = context.LittleStepsCore;
test('Owned audio stops a queued late start and releases its clip exactly once',()=>{
    class Node {constructor(name){this.name=name;this.events=new Map();}addChild(n){n.parent=this;}addComponent(){return this.source={clip:null,playOnAwake:true,playing:false,volume:1,currentTime:0,plays:0,stops:0,pauses:0,play(){this.plays++;},stop(){this.playing=false;this.stops++;},pause(){this.playing=false;this.pauses++;}};}on(e,f){this.events.set(e,f);}off(e){this.events.delete(e);}destroy(){this.destroyed=true;}}
    const cc={Node,AudioSource:{EventType:{STARTED:'start',ENDED:'end'}}},scope=new core.Lifetime(),parent=new Node('root'),events=[];
    const transport=core.registerAudio(cc),port=transport.player(parent,scope,'effect',(event,state)=>events.push([event,state]));
    // Retain the constructed child through the fake surface, not private engine state.
    let child;const original=parent.addChild;parent.addChild=n=>{child=n;original.call(parent,n);};
    const second=transport.player(parent,scope,'late',(event,state)=>events.push([event,state]));second.assign({name:'clip'});second.play();second.stop();
    child.source.playing=true;child.events.get('start')();assert.equal(child.source.playing,false);assert.equal(second.snapshot().actualStarts,0);assert.equal(second.snapshot().lateStartsStopped,1);
    second.play();child.source.playing=true;child.events.get('start')();assert.equal(second.snapshot().actualStarts,1);second.pause();second.pause();assert.equal(second.snapshot().pauses,1);
    scope.dispose();assert.equal(child.source.clip,null);assert.equal(child.destroyed,true);assert.equal(second.play(),false);second.dispose();assert.equal(events.filter(e=>e[0]==='disposed').length,2);assert.equal(port.snapshot().disposed,true);
});
const near = (actual, expected) => {
    assert.equal(actual.length, expected.length);
    actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-5, `${v} != ${expected[i]}`));
};
test('Nested parent rotation maps coordinates and inverse restores source pixels', () => {
    const m = core.Math2D.multiply(core.Math2D.trs([10, 20], Math.PI / 2), core.Math2D.trs([3, 0], 0, [2, 1]));
    near(core.Math2D.transform(m, 4, 5), [5, 31]);
    near(core.Math2D.transform(core.Math2D.inverse(m), 5, 31), [4, 5]);
});
test('Weighted skin uses rest inverse, retaining original geometry at bind pose', () => {
    const rig = new core.BoneRig([{name: 'root', parent: -1, position: [10, 20]}, {name: 'arm', parent: 0, position: [3, 4]}]);
    near(core.weightedSkin(new Float32Array([7, 8]), [0.25, 0.75], rig.skinMatrices()), [7, 8]);
    rig.bones[1].position[0] += 8;
    rig.update();
    near(core.weightedSkin(new Float32Array([7, 8]), [0.25, 0.75], rig.skinMatrices()), [13, 8]);
    rig.reset();
    near(core.weightedSkin(new Float32Array([7, 8]), [0.25, 0.75], rig.skinMatrices()), [7, 8]);
    assert.throws(() => core.weightedSkin(new Float32Array([1, 1]), [0, 0], rig.skinMatrices()), /sum to one/);
});
test('Deformed triangle hit returns original alpha coordinates, outside hit is rejected', () => {
    const grid = core.createGrid([0, 0, 20, 20], 10);
    for (let i = 0; i < grid.vertices.length; i += 2) { grid.vertices[i] = grid.source[i] * 2 + 5; grid.vertices[i + 1] = grid.source[i + 1] + 3; }
    near(core.sourcePixelAt(grid, [17, 10]), [6, 7]);
    assert.equal(core.sourcePixelAt(grid, [-2, -2]), null);
    assert.equal(grid.indices.length, 24);
});
test('Animation curves clamp endpoints, interpolate vectors, and step visibility', () => {
    near(core.sampleTrack({times: [0, 2], values: [[2, 4], [6, 12]]}, 0.5), [3, 6]);
    assert.equal(core.sampleTrack({times: [0, 1, 2], values: [false, true, false], update: 1}, 1.5), true);
    assert.equal(core.sampleTrack({times: [0, 1], values: [1, 3]}, 100), 3);
});
test('Disposed request rejects late completion and releases the late resource', async () => {
    const scope = new core.Lifetime();
    let resolve, released = 0;
    const guarded = scope.guard(new Promise(r => { resolve = r; }), () => ++released);
    scope.dispose(); resolve({asset: 1});
    await assert.rejects(guarded, {name: 'CancelledError'});
    assert.equal(released, 1);
});
test('Plugin namespace is frozen and nonwritable', () => {
    assert.ok(Object.isFrozen(core));
    assert.equal(Object.getOwnPropertyDescriptor(context, 'LittleStepsCore').writable, false);
});
test('Shared leases deduplicate loads and retain admission until cancelled late work settles', async () => {
    const gate = new core.ResourceGate({maxBytes: 20, maxEntries: 2});
    const one = new core.Lifetime(), two = new core.Lifetime();
    let resolve, loaded = 0, unloaded = 0;
    const loader = () => { ++loaded; return new Promise(r => { resolve = r; }); };
    const a = gate.acquire([{key: 'shared', bytes: 12}], loader, () => ++unloaded, one);
    const b = gate.acquire([{key: 'shared', bytes: 12}], loader, () => ++unloaded, two);
    await Promise.resolve(); one.dispose();
    assert.equal(gate.snapshot().reservedBytes, 12);
    await assert.rejects(gate.acquire([{key: 'too-large', bytes: 9}], loader, () => {}, two), /budget/);
    resolve({texture: 1}); await assert.rejects(a, {name: 'CancelledError'});
    const leased = await b;
    assert.equal(loaded, 1); assert.ok(leased.get('shared'));
    two.dispose(); assert.equal(unloaded, 1); assert.equal(gate.snapshot().reservedBytes, 0);
});
