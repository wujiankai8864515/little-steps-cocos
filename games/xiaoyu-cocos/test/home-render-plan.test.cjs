const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const exportsObject={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game/HomeRenderPlan.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports:exportsObject});
test('Home retains 720-wide world sampling on small screens and caps physical scale independently from logical height',()=>{
 const plan=exportsObject.homeRenderPlan;
 assert.equal(JSON.stringify(plan(1280,405)),JSON.stringify({logical:[720,1280],pixels:[720,1280],scale:1,offset:0}));
 assert.equal(JSON.stringify(plan(1440,1080)),JSON.stringify({logical:[720,1440],pixels:[1080,2160],scale:1.5,offset:80}));
 assert.equal(JSON.stringify(plan(1000,2160)),JSON.stringify({logical:[720,1000],pixels:[1440,2000],scale:2,offset:-140}));
 assert.throws(()=>plan(NaN,405));assert.throws(()=>plan(1280,0));
});
