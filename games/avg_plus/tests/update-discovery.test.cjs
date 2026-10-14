require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('module');
const {TaskScope}=require('../assets/foundation/Tasks.ts');
const base='https://wujiankai8864515.github.io/little-steps-cocos/avg-plus/android/';
const identity={version:'0.1.0.8',nativeCompatibility:'avg_plus-cocos-3.8.8-native-1',
 githubRepository:'wujiankai8864515/little-steps-cocos',hotUpdateBaseUrl:base,remoteManifestUrl:base+'latest/avg-plus-project.manifest'};
const marker='/app/avg-plus-hot-update-state.json';
let storage;
const native={fileUtils:{
 getWritablePath:()=>'/app/',getStringFromFile:path=>path==='avg-plus-native.json'?JSON.stringify(identity):(storage.get(path)||''),
 isDirectoryExist:path=>path==='/app/avg-plus-hot-update/',
 writeStringToFile:()=>{assert.fail('Discovery must not modify the current content or product save');},
},AssetsManager:class{getLocalManifest(){return {isLoaded:()=>true,getVersion:()=>identity.version};}}};
const original=Module._load;
Module._load=function(id,...args){if(id==='cc')return {native};if(id==='cc/env')return {NATIVE:true};return original.call(this,id,...args);};
const {NativeDeltaUpdate}=require('../assets/mods/base-shell/NativeDeltaUpdate.ts');
const {NativeHotUpdate}=require('../assets/mods/base-shell/NativeHotUpdate.ts');Module._load=original;
const index={schemaVersion:2,bridgeVersion:identity.version,version:identity.version,nativeCompatibility:identity.nativeCompatibility,updates:[]};
const manifest={version:identity.version,nativeCompatibility:identity.nativeCompatibility,packageUrl:base+'versions/'+identity.version+'/',
 remoteManifestUrl:identity.remoteManifestUrl,remoteVersionUrl:base+'latest/avg-plus-version.manifest',searchPaths:[''],
 assets:{'avg-plus-assets.zip':{size:32,md5:'a'.repeat(64),compressed:true}}};
function setup(t,channel,delay){
 t.mock.timers.enable({apis:['setTimeout']});
 storage=new Map([[marker,JSON.stringify({compatibility:identity.nativeCompatibility,version:identity.version,
  paths:['/app/avg-plus-hot-update/'],probePending:false})],['/app/product-save.json','preserve original progress']]);
 const before=[...storage],requests=[],statuses=[],oldXHR=global.XMLHttpRequest,scope=new TaskScope();
 class Request {
  open(){} abort(){this.aborted=true;if(this.expiry!==undefined)clearTimeout(this.expiry);if(this.delivery!==undefined)clearTimeout(this.delivery);this.onabort?.();}
  send(){
   requests.push(this);
   this.expiry=setTimeout(()=>{if(this.delivery!==undefined)clearTimeout(this.delivery);this.ontimeout?.();},this.timeout);
   if(Number.isFinite(delay))this.delivery=setTimeout(()=>{
    clearTimeout(this.expiry);this.delivered=true;this.status=200;this.responseText=JSON.stringify(channel==='delta'?index:manifest);this.onload?.();
   },delay);
  }
 }
 global.XMLHttpRequest=Request;
 if(channel==='legacy')t.mock.method(NativeDeltaUpdate.prototype,'run',async()=>null);
 t.after(()=>{scope.dispose();global.XMLHttpRequest=oldXHR;});
 const updater=channel==='delta'?new NativeDeltaUpdate(scope,identity):new NativeHotUpdate(scope);
 const result=updater.run(message=>statuses.push(message));
 return {result,scope,requests,statuses,before,expected:channel==='delta'?null:'local'};
}
async function requestStarted(requests){for(let i=0;i<10;i++)await Promise.resolve();assert.equal(requests.length,1);}
for(const channel of ['delta','legacy']){
 test(channel+' discovery accepts a six-second response instead of rejecting it after 1.8 seconds',async t=>{
  const state=setup(t,channel,6000);await requestStarted(state.requests);
  t.mock.timers.tick(6000);
  assert.equal(await state.result,'local');assert.deepEqual([...storage],state.before);
  assert.equal(state.requests[0].delivered,true);assert.equal(state.statuses.includes('使用本地内容'),false);
  assert.equal(state.requests[0].onload,null);
 });
 test(channel+' stalled discovery remains bounded and keeps the complete local state',async t=>{
  const state=setup(t,channel,Infinity);await requestStarted(state.requests);
  let finished=false;state.result.then(()=>{finished=true;});
  t.mock.timers.tick(7999);await Promise.resolve();assert.equal(finished,false);
  t.mock.timers.tick(1);assert.equal(await state.result,state.expected);
  assert.deepEqual([...storage],state.before);assert.equal(state.requests[0].ontimeout,null);
 });
 test(channel+' cancelled discovery aborts transport and cannot accept a late response',async t=>{
  const state=setup(t,channel,6000);await requestStarted(state.requests);
  t.mock.timers.tick(2100);state.scope.dispose();
  await assert.rejects(state.result,error=>error.name==='Cancelled');
  t.mock.timers.tick(10000);assert.equal(state.requests[0].aborted,true);
  assert.deepEqual([...storage],state.before);assert.equal(state.requests[0].onload,null);
 });
 test(channel+' lost transport timeout callback is stopped by the ten-second task budget',async t=>{
  const state=setup(t,channel,Infinity);await requestStarted(state.requests);
  clearTimeout(state.requests[0].expiry); // A faulty native transport never emits its timeout event.
  let finished=false;state.result.then(()=>{finished=true;});
  t.mock.timers.tick(9999);await Promise.resolve();assert.equal(finished,false);
  t.mock.timers.tick(1);assert.equal(await state.result,state.expected);
  assert.equal(state.requests[0].aborted,true);assert.deepEqual([...storage],state.before);
 });
}
