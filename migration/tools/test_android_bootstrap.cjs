const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const root=path.resolve(__dirname,'../..');
require(root+'/games/avg_plus/tools/ts-loader.cjs');
const {TaskScope}=require(root+'/games/avg_plus/assets/foundation/Tasks.ts');
const {sha256}=require(root+'/games/avg_plus/assets/mods/base-shell/UpdateProtocol.ts');
let boundary;
const load=Module._load;
Module._load=function(id,...args){
 if(id==='cc')return {native:new Proxy({}, {get:(_,key)=>boundary.native[key]})};
 if(id==='cc/env')return {NATIVE:true};
 return load.call(this,id,...args);
};
const {NativeHotUpdate}=require(root+'/games/avg_plus/assets/mods/base-shell/NativeHotUpdate.ts');
Module._load=load;
const base='https://owner.github.io/game/avg-plus/android/';
const identity={version:'0.1.0.0',nativeCompatibility:'native-1',githubRepository:'owner/game',hotUpdateBaseUrl:base,remoteManifestUrl:base+'latest/avg-plus-project.manifest'};
function fixture(options={}){
 const files=new Map([['avg-plus-native.json',JSON.stringify(identity)]]),bytes=options.byteLength?new Uint8Array(options.byteLength).fill(51):new Uint8Array([1,2,3]);
 const digest=sha256(bytes);
 let downloads=0,abortCount=0,managers=0;
 const codes={UPDATE_PROGRESSION:1,UPDATE_FINISHED:2,ALREADY_UP_TO_DATE:3,UPDATE_FAILED:4,ERROR_NO_LOCAL_MANIFEST:5,ERROR_DOWNLOAD_MANIFEST:6,ERROR_PARSE_MANIFEST:7};
 class Manager{
  constructor(){managers++}
  getLocalManifest(){return {isLoaded:()=>true,getVersion:()=>identity.version}}
  loadRemoteManifest(value){this.remote=value;return true}
  setMaxConcurrentTask(){}
  setVerifyCallback(callback){this.verify=callback}
  setEventCallback(callback){this.callback=callback}
  update(){downloads++;const valid=this.verify('zip',{size:Math.fround(bytes.length),md5:digest});this.callback({getEventCode:()=>valid?codes.UPDATE_FINISHED:codes.UPDATE_FAILED,getMessage:()=>''})}
  downloadFailedAssets(){this.update()}
 }
 boundary={native:{
  EventAssetsManager:codes,AssetsManager:Manager,Manifest:class{constructor(content){Object.assign(this,JSON.parse(content))}},
  fileUtils:{getWritablePath:()=>'/data/',getStringFromFile:key=>{if(!files.has(key))throw Error('missing');return files.get(key)},writeStringToFile:(value,key)=>{files.set(key,value);return true},getDataFromFile:()=>options.corrupt?new Uint8Array([9,2,3]).buffer:bytes.buffer}
 }};
 const remote={version:'0.1.0.1',nativeCompatibility:options.incompatible?'native-2':identity.nativeCompatibility,packageUrl:base+'versions/0.1.0.1/',remoteManifestUrl:identity.remoteManifestUrl,remoteVersionUrl:base+'latest/avg-plus-version.manifest',assets:{'avg-plus-assets.zip':{size:bytes.length,md5:digest,compressed:true}},searchPaths:['']};
 global.XMLHttpRequest=class{
  open(){} abort(){abortCount++;this.onabort?.()}
  send(){if(options.pending)return;queueMicrotask(()=>{if(options.offline){this.onerror?.();return}this.status=200;this.responseText=JSON.stringify(remote);this.onload?.()})}
 };
 return {files,get downloads(){return downloads},get abortCount(){return abortCount},get managers(){return managers}};
}
test('native startup completes verified download and persists a pending boot before restart',async()=>{
 const f=fixture(),scope=new TaskScope();assert.equal(await new NativeHotUpdate(scope).run(()=>{}),'restart');
 const state=JSON.parse(f.files.get('/data/avg-plus-hot-update-state.json'));
 assert.equal(state.version,'0.1.0.1');assert.equal(state.probePending,true);assert.equal(state.probeAttempted,false);assert.deepEqual(state.paths,['/data/avg-plus-hot-update/']);assert.equal(f.downloads,1);scope.dispose();
});
test('native float32 rounding above 16 MiB never rejects an exact verified payload',async()=>{
 const length=0x1000001;assert.notEqual(Math.fround(length),length);
 const f=fixture({byteLength:length}),scope=new TaskScope();
 assert.equal(await new NativeHotUpdate(scope).run(()=>{}),'restart');assert.equal(f.downloads,1);scope.dispose();
});
test('offline or incompatible updates preserve the packaged game and never start a download',async()=>{
 for(const options of [{offline:true},{incompatible:true}]){const f=fixture(options),scope=new TaskScope();assert.equal(await new NativeHotUpdate(scope).run(()=>{}),'local');assert.equal(f.downloads,0);assert.equal(f.managers,0);assert.equal(f.files.has('/data/avg-plus-hot-update-state.json'),false);scope.dispose()}
});
test('corrupt update ZIP is rejected on all bounded retries without installing search paths',async()=>{
 const f=fixture({corrupt:true}),scope=new TaskScope();assert.equal(await new NativeHotUpdate(scope).run(()=>{}),'local');assert.equal(f.downloads,3);assert.equal(f.files.has('/data/avg-plus-hot-update-state.json'),false);scope.dispose();
});
test('leaving during native update check aborts the request and rejects its continuation',async()=>{
 const f=fixture({pending:true}),scope=new TaskScope(),promise=new NativeHotUpdate(scope).run(()=>{});await new Promise(resolve=>setImmediate(resolve));scope.dispose();await assert.rejects(promise,/取消/);assert.equal(f.abortCount,1);assert.equal(f.downloads,0);
});
test('only a successfully opened local catalog marks a trial patch healthy',()=>{
 const f=fixture(),scope=new TaskScope();f.files.set('/data/avg-plus-hot-update-state.json',JSON.stringify({compatibility:'native-1',version:'0.1.0.1',paths:['/data/avg-plus-hot-update/'],probePending:true,probeAttempted:true}));new NativeHotUpdate(scope).markHealthy();assert.equal(JSON.parse(f.files.get('/data/avg-plus-hot-update-state.json')).probePending,false);scope.dispose();
});
test('bootstrap restores paths before modules and falls back after an unconfirmed patched boot',()=>{
 const hook=fs.readFileSync(root+'/builds/android/templates/hot-update-bootstrap.js','utf8');
 const files=new Map([['avg-plus-native.json',JSON.stringify(identity)],['/data/avg-plus-hot-update-state.json',JSON.stringify({compatibility:'native-1',version:'0.1.0.1',paths:['/data/avg-plus-hot-update/'],probePending:true,probeAttempted:false})]]);
 let paths=['apk/'],removed=[];
 const context={jsb:{fileUtils:{getWritablePath:()=>'/data/',getStringFromFile:key=>files.get(key),writeStringToFile:(value,key)=>{files.set(key,value);return true},removeDirectory:key=>removed.push(key),removeFile:key=>files.delete(key),isFileExist:()=>true,getSearchPaths:()=>paths,setSearchPaths:value=>paths=value}}};
 vm.runInNewContext(hook,context);
 assert.equal(paths[0],'/data/avg-plus-hot-update/');assert.equal(JSON.parse(files.get('/data/avg-plus-hot-update-state.json')).probeAttempted,true);
 vm.runInNewContext(hook,context);
 assert.equal(removed[0],'/data/avg-plus-hot-update/');assert.equal(JSON.parse(files.get('/data/avg-plus-hot-update-state.json')).blockedVersion,'0.1.0.1');
});
test('installing a newer APK supersedes an older/equal patch without deleting product saves or blocking a newer patch',()=>{
 const hook=fs.readFileSync(root+'/builds/android/templates/hot-update-bootstrap.js','utf8');
 for(const [packaged,cached,restored] of [['0.1.0.3','0.1.0.2',false],['0.1.0.3','0.1.0.3',false],['0.1.0.3','0.1.0.4',true],['0.1.0.9','0.1.0.10',true]]){
  const marker='/data/avg-plus-hot-update-state.json',save='/data/product-save.json';
  const files=new Map([['avg-plus-native.json',JSON.stringify({...identity,version:packaged})],[marker,JSON.stringify({compatibility:'native-1',version:cached,paths:['/data/avg-plus-hot-update/'],probePending:false})],[save,'user data']]);
  let paths=['apk/'],removed=[];
  const context={jsb:{fileUtils:{getWritablePath:()=>'/data/',getStringFromFile:key=>files.get(key),writeStringToFile:(value,key)=>{files.set(key,value);return true},removeDirectory:key=>removed.push(key),removeFile:key=>files.delete(key),isFileExist:()=>true,getSearchPaths:()=>paths,setSearchPaths:value=>paths=value}}};
  vm.runInNewContext(hook,context);assert.equal(paths.includes('/data/avg-plus-hot-update/'),restored);
  assert.equal(files.get(save),'user data');assert.equal(files.has(marker),restored);
  if(!restored)assert.deepEqual(removed,['/data/avg-plus-hot-update/']);
 }
});
