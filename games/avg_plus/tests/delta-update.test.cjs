require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('module'),crypto=require('node:crypto');
const {TaskScope}=require('../assets/foundation/Tasks.ts');
const {validateDeltaIndex,pendingPatches}=require('../assets/mods/base-shell/DeltaProtocol.ts');
const identity={version:'0.1.0.6',nativeCompatibility:'avg_plus-cocos-3.8.8-native-1',githubRepository:'wujiankai8864515/little-steps-cocos',
 hotUpdateBaseUrl:'https://wujiankai8864515.github.io/little-steps-cocos/avg-plus/android/',remoteManifestUrl:'https://wujiankai8864515.github.io/little-steps-cocos/avg-plus/android/latest/avg-plus-project.manifest'};
const digest=data=>crypto.createHash('sha256').update(data).digest('hex');
const file=(path,data)=>({path,bytes:Buffer.byteLength(data),sha256:digest(data)});
const patch=(v,b,files,removed=[])=>({version:v,baseVersion:b,displayVersion:'2026-10-14-18-30-01',nativeCompatibility:identity.nativeCompatibility,
 packageUrl:identity.hotUpdateBaseUrl+'delta/versions/'+v+'/',archive:{bytes:32,sha256:'a'.repeat(64)},files,removed});
const index=updates=>({schemaVersion:2,bridgeVersion:'0.1.0.6',version:updates.at(-1)?.version??'0.1.0.6',displayVersion:'2026-10-14-18-30-01',nativeCompatibility:identity.nativeCompatibility,updates});
test('skipped releases apply in order; a rejected target waits for a higher repair release',()=>{
 const p7=patch('0.1.0.7','0.1.0.6',[file('src/game.js','7')]),p8=patch('0.1.0.8','0.1.0.7',[file('src/game.js','8')]);
 const valid=validateDeltaIndex(index([p7,p8]),identity);
 assert.deepEqual(pendingPatches(valid,'0.1.0.6').map(p=>p.version),['0.1.0.7','0.1.0.8']);
 assert.deepEqual(pendingPatches(valid,'0.1.0.7').map(p=>p.version),['0.1.0.8']);
 assert.equal(pendingPatches(valid,'0.1.0.8').length,0);assert.equal(pendingPatches(valid,'0.1.0.5').length,0);
 assert.equal(pendingPatches(validateDeltaIndex(index([p7]),identity),'0.1.0.6','0.1.0.7').length,0);
 assert.equal(pendingPatches(valid,'0.1.0.6','0.1.0.7').length,2);
 assert.throws(()=>validateDeltaIndex(index([p8]),identity),/版本链/);
});
test('untrusted deltas reject traversal, engine replacement, foreign origins and contradictory snapshots',()=>{
 const p=patch('0.1.0.7','0.1.0.6',[file('assets/resources/test.json','ok')]);
 for(const path of ['../main.js','assets/../../main.js','src/cocos-js/cc.js','assets\\test','/assets/test','assets//test']) {
  const bad=JSON.parse(JSON.stringify(p));bad.files[0].path=path;assert.throws(()=>validateDeltaIndex(index([bad]),identity));
 }
 for(const mutate of [p=>p.packageUrl='https://example.com/',p=>p.nativeCompatibility='different',p=>p.files.push({...p.files[0]}),
  p=>p.removed.push(p.files[0].path),p=>p.archive.bytes=129*1024*1024,p=>p.files[0].sha256='123']) {
  const bad=JSON.parse(JSON.stringify(p));mutate(bad);assert.throws(()=>validateDeltaIndex(index([bad]),identity));
 }
});

let files,dirs,renameFailure,writeFailure,searchPaths;
const writable='/app/',cache=writable+'avg-plus-hot-update/',next=writable+'avg-plus-hot-update-next/',previous=writable+'avg-plus-hot-update-previous/';
const marker=writable+'avg-plus-hot-update-state.json',journalPath=writable+'avg-plus-hot-update-journal.json';
const put=(path,data)=>{files.set(path,Buffer.from(typeof data==='string'?data:JSON.stringify(data)));};
const read=path=>JSON.parse(files.get(path).toString());
const native={fileUtils:{
 getWritablePath:()=>writable,getStringFromFile:p=>files.get(p)?.toString()??'',getDataFromFile:p=>files.get(p)??Buffer.alloc(0),
 writeStringToFile:(s,p)=>{if(p===writeFailure)return false;put(p,s);return true;},writeDataToFile:(d,p)=>{files.set(p,Buffer.from(d));return true;},
 isFileExist:p=>files.has(p),isDirectoryExist:p=>dirs.has(p),createDirectory:p=>{dirs.add(p);return true;},
 removeFile:p=>files.delete(p),removeDirectory:p=>{for(const k of files.keys())if(k.startsWith(p))files.delete(k);for(const k of dirs)if(k.startsWith(p))dirs.delete(k);return true;},
 renameFile:(a,b)=>{if(a===renameFailure)return false;for(const[k,v]of [...files])if(k.startsWith(a)){files.delete(k);files.set(b+k.slice(a.length),v);}for(const k of [...dirs])if(k.startsWith(a)){dirs.delete(k);dirs.add(b+k.slice(a.length));}return true;},
 listFiles:p=>[...files.keys()].filter(k=>k.startsWith(p)),getSearchPaths:()=>searchPaths.slice(),setSearchPaths:p=>{searchPaths=p.slice();},purgeCachedEntries:()=>{}
}};
const load=Module._load;Module._load=function(id,...args){if(id==='cc')return {native};return load.call(this,id,...args)};
const {NativeDeltaUpdate}=require('../assets/mods/base-shell/NativeDeltaUpdate.ts');Module._load=load;
function setup(){files=new Map();dirs=new Set([writable,cache]);renameFailure=writeFailure=null;searchPaths=['apk/'];
 put(cache+'src/game.js','healthy6');put(cache+'assets/old.json','remove me');
 put(marker,{compatibility:identity.nativeCompatibility,version:identity.version,paths:[cache],probePending:false});return new NativeDeltaUpdate(new TaskScope(),identity);}
function stage(updater,{corrupt=false}={}) {
 const p=patch('0.1.0.7','0.1.0.6',[file('src/game.js','healthy7')],['assets/old.json']);
 updater.fetch=async()=>index([p]);updater.apply=async()=>put(next+'src/game.js',corrupt?'damaged7':'healthy7');return p;
}
test('only verified snapshots switch, preserve one rollback tree and clean it after healthy boot',async()=>{
 const updater=setup();stage(updater);
 assert.equal(await updater.run(()=>{}),'restart');assert.equal(files.get(cache+'src/game.js').toString(),'healthy7');
 assert.equal(files.get(previous+'src/game.js').toString(),'healthy6');assert.equal(files.has(cache+'assets/old.json'),false);
 assert.equal(read(marker).probePending,true);assert.equal(read(journalPath).phase,'probing');assert.deepEqual(searchPaths,['apk/']);
 updater.confirm();assert.equal(dirs.has(previous),true);
 const state=read(marker);state.probePending=false;put(marker,state);updater.confirm();assert.equal(dirs.has(previous),false);assert.equal(files.has(journalPath),false);
});
test('corrupt downloads and either directory rename failure leave the previous game and marker intact',async()=>{
 for(const failure of ['corrupt',cache,next]){
  const updater=setup();stage(updater,{corrupt:failure==='corrupt'});if(failure!=='corrupt')renameFailure=failure;
  assert.equal(await updater.run(()=>{}),'local');assert.equal(files.get(cache+'src/game.js').toString(),'healthy6',failure);
  assert.equal(read(marker).version,'0.1.0.6');assert.equal(files.get(cache+'assets/old.json').toString(),'remove me');
  assert.equal(dirs.has(next),false);assert.equal(files.has(journalPath),false);assert.deepEqual(searchPaths,['apk/']);
 }
});
test('interrupted staging, pre-rename swap and unsuccessful boot each recover without losing healthy resources',async()=>{
 for(const phase of ['staging','swapping']){
  const updater=setup();put(journalPath,{compatibility:identity.nativeCompatibility,version:'0.1.0.7',phase,previous:read(marker)});
  dirs.add(next);put(next+'src/game.js','partial');assert.equal(updater.recover(),false);
  assert.equal(files.get(cache+'src/game.js').toString(),'healthy6');assert.equal(dirs.has(next),false);assert.equal(files.has(journalPath),false);
 }
 const updater=setup();stage(updater);await updater.run(()=>{});const bad=read(marker);bad.blockedVersion='0.1.0.7';bad.paths=[];bad.probePending=false;put(marker,bad);
 assert.equal(updater.recover(),true);assert.equal(files.get(cache+'src/game.js').toString(),'healthy6');assert.equal(read(marker).blockedVersion,'0.1.0.7');
 assert.equal(read(marker).probePending,false);assert.equal(files.has(journalPath),false);
});
test('offline checks retain the complete local game without starting a transaction',async()=>{
 const updater=setup();updater.fetch=async()=>{throw Error('offline');};
 assert.equal(await updater.run(()=>{}),null);assert.equal(files.get(cache+'src/game.js').toString(),'healthy6');assert.equal(files.has(journalPath),false);
});
test('unconfirmed content reaches home before another update and does not replace its healthy backup',async()=>{
 const updater=setup();stage(updater);await updater.run(()=>{});
 updater.fetch=async()=>{assert.fail('A trial boot should not fetch another update');};
 assert.equal(await updater.run(()=>{}),'local');assert.equal(files.get(previous+'src/game.js').toString(),'healthy6');
 assert.equal(read(journalPath).version,'0.1.0.7');assert.equal(read(marker).probePending,true);
});
test('an APK-only baseline ignores orphan cache files and retains the rejected newer version after recovery',async()=>{
 const updater=setup();files.delete(marker);put(cache+'assets/junk.json','orphan');stage(updater);
 assert.equal(await updater.run(()=>{}),'restart');assert.equal(read(journalPath).previous.paths.length,0);
 assert.equal(files.has(cache+'assets/junk.json'),false);
 const failed=read(marker);failed.blockedVersion=failed.version;failed.paths=[];failed.probePending=false;put(marker,failed);
 assert.equal(updater.recover(),false);assert.equal(read(marker).version,'0.1.0.6');assert.equal(read(marker).blockedVersion,'0.1.0.7');
 assert.deepEqual(read(marker).paths,[]);assert.equal(dirs.has(previous),false);assert.equal(files.has(journalPath),false);
});
