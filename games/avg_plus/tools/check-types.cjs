const path = require('node:path');
const ts = require('./ts-loader.cjs');
const root = path.resolve(__dirname, '..');
const config = ts.parseJsonConfigFileContent({ compilerOptions: {
 target: 'ES2017', module: 'ES2015', moduleResolution: 'node', lib: ['ES2020','DOM'], experimentalDecorators: true,
 skipLibCheck: true, strict: true, noEmit: true, types: ['cc', 'cc.env'].map(name => path.join(process.env.COCOS_PROJECT || root, 'temp/declarations', name))
}, include: ['assets/foundation/**/*.ts', 'assets/mods/**/*.ts'] }, ts.sys, root);
const program = ts.createProgram(config.fileNames, config.options);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) { console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: f => f, getCurrentDirectory: () => root, getNewLine: () => '\n' })); process.exit(1); }
console.log(`Typecheck passed (${config.fileNames.length} files)`);
