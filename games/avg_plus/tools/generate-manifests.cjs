const fs = require('node:fs'); const path = require('node:path');
function visit(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
 const file = path.join(dir, entry.name);
 if (entry.isDirectory()) visit(file);
 else if (entry.name === 'manifest.json') {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(path.join(dir, 'ModManifest.ts'), '// Generated from manifest.json by tools/generate-manifests.cjs.\nexport const manifest = ' + JSON.stringify(data,null,2) + ' as const;\n');
 }
} }
visit(path.resolve(__dirname, '../assets/mods'));
