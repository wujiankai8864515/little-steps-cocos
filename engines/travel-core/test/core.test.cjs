const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const context = vm.createContext({Float32Array, Uint16Array, console});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/travel-core.js'), 'utf8'), context);
const core = context.LittleStepsCore;
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
