const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const plugin=vm.createContext({console});vm.runInContext(fs.readFileSync(path.join(__dirname,'../../../engines/travel-core/dist/travel-core.js'),'utf8'),plugin);const core=plugin.LittleStepsCore;
const tick=()=>new Promise(setImmediate),plain=value=>JSON.parse(JSON.stringify(value));
function environment(){
 const pending=[],requests=[],urls=[],released=[];
 class AudioClip {static AudioType={DOM_AUDIO:0,WEB_AUDIO:1,MINIGAME_AUDIO:2};constructor(mode){this.loadMode=mode;this.refs=0;this.decRefs=0;}getDuration(){return 120;}addRef(){this.refs++;}decRef(){this.refs--;this.decRefs++;}}
 const bundle={getInfoWithPath(p,type){assert.equal(type,AudioClip);return {uuid:'01234567-89ab-cdef-0123-456789abcdef'};},load(){throw Error('Streaming music must not enter default full-PCM bundle.load');}};
 const assetManager={loadBundle(name,cb){cb(null,bundle);},utils:{getUrlWithUuid(uuid,opts){urls.push({uuid,opts});return '/assets/home/native/01/'+uuid+'.mp3';}},loadRemote(url,options,cb){requests.push({url,options});pending.push(cb);},releaseAsset(asset){released.push(asset);}};
 const exports={},cc={AudioClip,assetManager};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game/Assets.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports,require:name=>name==='cc'?cc:{core},console:{info(){}},Map,Set,Promise});
 const assets=new exports.GameAssets(),key='res://home/audio/tracks/day.mp3',spec={kind:'audio',bundle:'home',path:'home/audio/tracks/day',decodedBytes:76455936,streaming:{extension:'.mp3',encodedBytes:2020909,reservedBytes:6138970,payloadSHA256:'pinned-source'}};assets.catalog={assets:{[key]:spec},groups:{home:{}}};
 return {assets,key,spec,AudioClip,requests,urls,released,resolve:mode=>{const clip=new AudioClip(mode);pending.shift()(null,clip);return clip;}};
}
test('Shared original streaming leases reserve encoded buffers, request DOM audio and release their clip once at the last owner',async()=>{
 const e=environment(),a=new core.Lifetime(),b=new core.Lifetime(),first=e.assets.acquireResources([e.key],a),second=e.assets.acquireResources([e.key],b);await tick();assert.equal(e.requests.length,1);assert.deepEqual(plain(e.requests[0].options),{ext:'.mp3',audioLoadMode:0});assert.deepEqual(plain(e.urls[0].opts),{isNative:true,nativeExt:'.mp3'});assert.equal(e.assets.snapshot().reservedBytes,6138970);
 const clip=e.resolve(0);await Promise.all([first,second]);assert.equal(e.assets.audio(e.key),clip);assert.equal(clip.refs,1);a.dispose();assert.equal(clip.decRefs,0);assert.equal(e.assets.snapshot().entries,1);b.dispose();assert.equal(clip.decRefs,1);assert.deepEqual(plain(e.assets.snapshot()),{entries:0,reservedBytes:0,pending:0});assert.throws(()=>e.assets.audio(e.key),/尚未准入/);
});
test('A full-PCM fallback fails and releases its remote asset; a cancelled late mini-game clip cannot remain resident',async()=>{
 const e=environment(),scope=new core.Lifetime(),load=e.assets.acquireResources([e.key],scope);await tick();const bad=e.resolve(1);await assert.rejects(load,/未按原版流式加载/);assert.deepEqual(e.released,[bad]);assert.equal(e.assets.snapshot().reservedBytes,0);
 const other=environment(),owner=new core.Lifetime(),late=other.assets.acquireResources([other.key],owner);await tick();owner.dispose();const clip=other.resolve(2);await assert.rejects(late,{name:'CancelledError'});assert.equal(clip.refs,0);assert.equal(clip.decRefs,1);assert.equal(other.assets.snapshot().entries,0);assert.throws(()=>other.assets.audio(other.key),/尚未准入/);
});
test('Original streaming reservation cannot silently change and full-PCM estimates remain preserved',()=>{
 const e=environment(),scope=new core.Lifetime();assert.equal(e.spec.decodedBytes,76455936);e.spec.streaming.reservedBytes--;assert.throws(()=>e.assets.acquireResources([e.key],scope),/Invalid original/);assert.equal(e.requests.length,0);assert.equal(e.assets.snapshot().entries,0);
});
