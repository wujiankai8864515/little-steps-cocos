const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const choices = [process.env.TYPESCRIPT_PATH, 'typescript', '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript'].filter(Boolean);
let ts;
for (const entry of choices) { try { ts = require(entry); break; } catch (_) {} }
if (!ts) throw new Error('需要 TypeScript：安装项目开发依赖，或设置 TYPESCRIPT_PATH');
require.extensions['.ts'] = (module, filename) => {
 const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true } });
 module._compile(out.outputText, filename);
};
module.exports = ts;
