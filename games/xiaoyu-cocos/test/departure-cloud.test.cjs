const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const exports_={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game/DepartureMotion.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exports_});
test('Only the original rig appears before cloud concealment; no replacement traveller appears before or after cloud completion',()=>{
 const m=new exports_.DepartureMotion([350,951]);
 for(const age of [0,.34,.75,.76,.9,1.5,1.899,1.9,4.8,30]){
  m.advance(age);const s=m.snapshot();assert.equal(s.nativeVisible,age<.76);assert.equal(s.actorVisible,false);assert.equal(s.actorAlpha,0);assert.equal(s.finished,age>=1.9);assert.deepEqual(Array.from(s.origin),[350,951]);
 }
 assert.ok(Math.abs(exports_.DEPARTURE_FINISH_AT*exports_.DEPARTURE_CLOUD_RATE-2.85)<1e-9);
});
