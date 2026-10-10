const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const root = path.resolve(__dirname, '../../..');
const context = vm.createContext({Float32Array, Uint16Array});
vm.runInContext(fs.readFileSync(path.join(root, 'engines/travel-core/dist/travel-core.js'), 'utf8'), context);
const core = context.LittleStepsCore;
const exportsObject = {};
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../assets/game/SoftGeometry.ts'), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015}}).outputText;
vm.runInNewContext(compiled, {exports: exportsObject, require: name => { assert.equal(name, './Engine'); return {core}; }, Math, Float32Array});
const soft = exportsObject;
const near = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-4));
const pose = () => ({amount: 0.7, grab: [365, 177], lag: [3, -2], phase: 0.7, jelly: [0, 0], landing: 0, clearance: 100});
test('Grabbed face stays fixed and the mat contact row cannot move during landing squash', () => {
    near(soft.softOffset([365, 177], [365, 177], 0.7, [3, -2], 0.7), [0, 0]);
    near(soft.landingOffset([400, 333], 18), [0, 0]);
    assert.ok(soft.landingOffset([400, 100], 18)[1] > 17);
});
test('Unheld rigid fin moves as one attachment without stretching its mallet', () => {
    const mesh = {source: new Float32Array([450, 200, 530, 165]), vertices: new Float32Array(4)};
    soft.deformPart(mesh, 'OriginalFinAndRigidMallet', pose(), core.Math2D.identity());
    near([mesh.vertices[2] - mesh.vertices[0], mesh.vertices[3] - mesh.vertices[1]], [80, -35]);
});
test('Neutral tail and fin retain source points regardless of parent pose', () => {
    for (const part of ['OriginalTail', 'OriginalFinAndRigidMallet']) {
        const mesh = {source: new Float32Array([140, 230, 170, 260]), vertices: new Float32Array(4)};
        soft.deformPart(mesh, part, {...pose(), amount: 0}, core.Math2D.trs([15, -3], 0.4));
        near(mesh.vertices, mesh.source);
    }
});
test('Jelly remains upper-body local and repeated identical deformation reuses geometry', () => {
    const mesh = {source: new Float32Array([335, 150, 335, 333]), vertices: new Float32Array(4)};
    const neutral = {...pose(), amount: 0, jelly: [3, 5]};
    assert.equal(soft.deformPart(mesh, 'OriginalBody', neutral, core.Math2D.identity()), true);
    near(mesh.vertices, [338, 155, 335, 333]);
    assert.equal(soft.deformPart(mesh, 'OriginalBody', neutral, core.Math2D.identity()), false);
});
