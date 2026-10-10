'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const core = path.resolve(__dirname, '..');
const root = path.resolve(core, '../..');
const sources = ['math.js', 'lifetime.js', 'resource-gate.js', 'cocos-mesh.js'];
const dist = path.join(core, 'dist');
const target = path.join(dist, 'travel-core.js');
const plugins = path.join(root, 'games/xiaoyu-cocos/assets/plugins');
const link = path.join(plugins, 'travel-core.js');
const built = `/* Creator 3.8.8 plugin; generated from engines/travel-core/src. */\n(function(root) {\n'use strict';\nconst api = Object.create(null);\n${sources.map(name => fs.readFileSync(path.join(core, 'src', name), 'utf8')).join('\n')}\nObject.defineProperty(root, 'LittleStepsCore', {value: Object.freeze(api), writable: false, configurable: false});\n})(globalThis);\n`;
fs.mkdirSync(dist, {recursive: true});
fs.chmodSync(dist, 0o755);
if (fs.existsSync(target)) fs.chmodSync(target, 0o644);
fs.writeFileSync(target, built, {mode: 0o444});
fs.chmodSync(target, 0o444);
fs.chmodSync(dist, 0o555);
fs.mkdirSync(plugins, {recursive: true});
if (fs.existsSync(link) || fs.lstatSync(plugins).isDirectory() && fs.readdirSync(plugins).includes('travel-core.js')) {
    if (!fs.lstatSync(link).isSymbolicLink()) throw new Error('Refusing to replace a regular game-side framework file');
    fs.unlinkSync(link);
}
fs.symlinkSync(path.relative(plugins, target), link);
const meta = {
    ver: '4.0.24', importer: 'javascript', imported: true,
    uuid: '7d0bdc9d-6e8b-5ee4-a751-c655c245ba31', files: [], subMetas: {},
    userData: {isPlugin: true, loadPluginInEditor: false, loadPluginInWeb: true, loadPluginInNative: false, loadPluginInMiniGame: true, executionScope: 'global'},
};
fs.writeFileSync(link + '.meta', JSON.stringify(meta, null, 2) + '\n');
const hash = crypto.createHash('sha256').update(fs.readFileSync(link)).digest('hex');
if (fs.statSync(target).mode & 0o222) throw new Error('Plugin distribution must be read-only');
if (fs.realpathSync(link) !== target) throw new Error('Framework link points outside the distribution');
process.stdout.write(JSON.stringify({plugin: path.relative(root, link), target: path.relative(root, target), sha256: hash, targetMode: '0444', directoryMode: '0555', sourceFiles: sources}) + '\n');
