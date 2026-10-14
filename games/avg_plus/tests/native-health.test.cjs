require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('module');
const {TaskScope}=require('../assets/foundation/Tasks.ts');
const root='/device/',marker=root+'avg-plus-hot-update-state.json',journal=root+'avg-plus-hot-update-journal.json',previous=root+'avg-plus-hot-update-previous/';
let renameFails=false;const files=new Map(),dirs=new Set();
const fileUtils={
 getWritablePath:()=>root,getStringFromFile:path=>files.get(path)??'',
 writeStringToFile:(value,path)=>{files.set(path,value);return true;},
 renameFile:(from,to)=>{if(renameFails)return false;files.set(to,files.get(from));files.delete(from);return true;},
 removeFile:path=>files.delete(path),isDirectoryExist:path=>dirs.has(path),removeDirectory:path=>dirs.delete(path),
};
const load=Module._load;
Module._load=function(id,...args){if(id==='cc')return {native:{fileUtils}};if(id==='cc/env')return {NATIVE:true};return load.call(this,id,...args);};
const {NativeHotUpdate}=require('../assets/mods/base-shell/NativeHotUpdate.ts');Module._load=load;
function fixture(){
 files.clear();dirs.clear();dirs.add(previous);renameFails=false;
 files.set('avg-plus-native.json',JSON.stringify({nativeCompatibility:'native-1',version:'0.1.0.6'}));
 files.set(marker,JSON.stringify({compatibility:'native-1',version:'0.1.0.7',paths:[root+'avg-plus-hot-update/'],probePending:true,probeAttempted:true}));
 files.set(journal,JSON.stringify({compatibility:'native-1',version:'0.1.0.7',phase:'probing',previous:{compatibility:'native-1',version:'0.1.0.6',paths:[]}}));
 return new NativeHotUpdate(new TaskScope());
}
test('only a persisted healthy boot can discard the rollback resources and journal',()=>{
 const updater=fixture();updater.markHealthy();const state=JSON.parse(files.get(marker));
 assert.equal(state.probePending,false);assert.equal(state.probeAttempted,false);assert.equal(state.version,'0.1.0.7');
 assert.equal(files.has(journal),false);assert.equal(dirs.has(previous),false);assert.equal(files.has(marker+'.writing'),false);
});
test('failed atomic healthy confirmation keeps the trial marker, journal and previous resource tree',()=>{
 const updater=fixture();const before=files.get(marker);renameFails=true;updater.markHealthy();
 assert.equal(files.get(marker),before);assert.equal(files.has(journal),true);assert.equal(dirs.has(previous),true);assert.equal(files.has(marker+'.writing'),false);
});
