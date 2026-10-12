const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const context=vm.createContext({console});vm.runInContext(fs.readFileSync(path.join(__dirname,'../../../engines/travel-core/dist/travel-core.js'),'utf8'),context);const core=context.LittleStepsCore;
const tick=()=>new Promise(setImmediate);
function setup(){
 const callbacks=[],requests=[],key='res://test.png';
 class JsonAsset {constructor(json){this.json=json;this.refs=0;this.releases=0;}addRef(){this.refs++;}decRef(){this.refs--;this.releases++;}}
 const bundle={load(p,T,callback){requests.push(p);callbacks.push(callback);}},cc={JsonAsset,assetManager:{loadBundle(n,cb){cb(null,bundle);}}};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game/Assets.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports,require:n=>n==='cc'?cc:{core},console:{info(){}}});
 const assets=new exports.GameAssets();assets.catalog={assets:{[key]:{kind:'texture',bundle:'home',path:'test/texture',decodedBytes:24}},groups:{home:{cocosAlpha:{path:'alpha-masks',decodedBytes:600000,pixelBytes:6}}}};
 const data={schema:2,encoding:'zlib-u8-base64',masks:{[key]:{size:[3,2],origin:[2,4],data:zlib.deflateSync(Buffer.from([0,40,41,127,128,255])).toString('base64')}}};
 return {assets,key,data,requests,resolve(){const texture=new JsonAsset(null),alpha=new JsonAsset(data);callbacks.shift()(null,texture);callbacks.shift()(null,alpha);return {texture,alpha};}};
}
test('Decoded alpha shares the original asset lease and releases at the last owner, then reloads cleanly',async()=>{
 const e=setup(),a=new core.Lifetime(),b=new core.Lifetime(),first=e.assets.acquireGroups(['home'],a),second=e.assets.acquireGroups(['home'],b);await tick();assert.equal(e.requests.length,2);const values=e.resolve();await Promise.all([first,second]);
 assert.equal(e.assets.alpha(e.key,4.9,4.1),41/255);assert.deepEqual(Array.from(e.assets.alphaBounds(e.key,[2,4,3,2])),[2,4,3,2]);
 a.dispose();assert.equal(values.alpha.refs,1);assert.equal(e.assets.alpha(e.key,4,5),1);b.dispose();assert.equal(values.alpha.refs,0);assert.equal(values.alpha.releases,1);assert.equal(e.assets.snapshot().entries,0);assert.throws(()=>e.assets.alpha(e.key,4,5),/尚未准入/);
 const c=new core.Lifetime(),again=e.assets.acquireGroups(['home'],c);await tick();e.resolve();await again;assert.equal(e.assets.alpha(e.key,4,5),1);c.dispose();
});
test('Late cancellation and corrupt alpha cannot leave decoded pixels or resource reservations resident',async()=>{
 const e=setup(),scope=new core.Lifetime(),load=e.assets.acquireGroups(['home'],scope);await tick();scope.dispose();const {alpha}=e.resolve();await assert.rejects(load,{name:'CancelledError'});assert.equal(alpha.refs,0);assert.equal(e.assets.snapshot().entries,0);assert.throws(()=>e.assets.alpha(e.key,2,4),/尚未准入/);
 const bad=setup(),owner=new core.Lifetime();bad.data.masks[bad.key].data='AAAA';const broken=bad.assets.acquireGroups(['home'],owner);await tick();const corrupt=bad.resolve();await assert.rejects(broken,/Corrupt/);assert.equal(corrupt.alpha.refs,0);assert.equal(bad.assets.snapshot().entries,0);assert.throws(()=>bad.assets.alpha(bad.key,2,4),/尚未准入/);
});
