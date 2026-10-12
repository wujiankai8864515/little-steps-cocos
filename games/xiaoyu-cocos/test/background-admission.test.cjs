const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
class Gate {acquire(specs){return specs;}}
const output={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game/Assets.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:output,require:k=>k==='./Engine'?{core:{ResourceGate:Gate}}:{},console});
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/resources/source-catalog.json')));
test('Photo resource entry admits every background patch without loading unrelated page resources',()=>{
 const assets=new output.GameAssets();assets.catalog=catalog;
 const key='res://photo/assets/photo_wall_neutral_plate_v1.png',layers=catalog.assets[key].layers;
 const admitted=assets.acquireResources([key,layers[0]],{}),keys=Array.from(admitted,s=>s.key);
 assert.deepEqual(keys,[...layers,key]);assert.equal(keys.length,new Set(keys).size);
 assert.ok(admitted.every(s=>s.bytes===catalog.assets[s.key].decodedBytes));
 assert.ok(keys.every(k=>catalog.assets[k].bundle==='photo_visual'));
});
test('Missing or cyclic composite dependencies reject before any partial admission',()=>{
 const assets=new output.GameAssets();assets.catalog={assets:{a:{layers:['b']},b:{layers:['a']}}};
 assert.throws(()=>assets.acquireResources(['a'],{}),/依赖循环/);
 assets.catalog={assets:{a:{layers:['missing']}}};assert.throws(()=>assets.acquireResources(['a'],{}),/缺少资源/);
});
