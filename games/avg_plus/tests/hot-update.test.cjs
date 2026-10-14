require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {sha256,sha256Async,compareVersions,validateUpdate}=require('../assets/mods/base-shell/UpdateProtocol.ts');
const base='https://owner.github.io/game/avg-plus/android/';
const identity={version:'0.1.0.0',nativeCompatibility:'native-1',githubRepository:'owner/game',hotUpdateBaseUrl:base,remoteManifestUrl:base+'latest/avg-plus-project.manifest'};
function manifest(){return {version:'0.1.0.1',nativeCompatibility:'native-1',packageUrl:base+'versions/0.1.0.1/',remoteManifestUrl:identity.remoteManifestUrl,remoteVersionUrl:base+'latest/avg-plus-version.manifest',assets:{'avg-plus-assets.zip':{md5:'a'.repeat(64),size:1024,compressed:true}},searchPaths:['']};}
test('update SHA-256 matches Node crypto at padding boundaries and large files',()=>{
 for(const size of [0,1,55,56,63,64,65,127,128,4096,1000000]){
  const data=Buffer.alloc(size);for(let i=0;i<size;i++)data[i]=i%251;
  assert.equal(sha256(data),crypto.createHash('sha256').update(data).digest('hex'));
 }
});
test('cooperative verification matches native ZIP checks while yielding and honours cancellation',async()=>{
 const data=Buffer.alloc(4*1024*1024,37);let yields=0;
 const digest=await sha256Async(data,()=>{},async()=>{yields++;await Promise.resolve();});
 assert.equal(digest,crypto.createHash('sha256').update(data).digest('hex'));assert.ok(yields>0);
 let cancelled=false;
 await assert.rejects(sha256Async(data,()=>{if(cancelled)throw new Error('取消校验');},async()=>{cancelled=true;}),/取消校验/);
});
test('update versions compare numerically and malformed versions reject',()=>{
 assert.equal(compareVersions('0.1.0.10','0.1.0.2'),1);
 assert.equal(compareVersions('1.0.0.0','1.0.0.0'),0);
 assert.equal(compareVersions('0.1.0.1','0.2.0.0'),-1);
 for(const value of ['1.0.0','a.1.0.0','1.0.0.-1','9007199254740992.0.0.0'])assert.throws(()=>compareVersions(value,'0.1.0.0'));
});
test('updates pin the native contract, repository, archive integrity and local search root',()=>{
 assert.equal(validateUpdate(manifest(),identity).version,'0.1.0.1');
 const mutate=[m=>m.nativeCompatibility='native-2',m=>m.packageUrl='http://owner.github.io/game/avg-plus/android/versions/0.1.0.1/',m=>m.packageUrl='https://other.github.io/game/avg-plus/android/versions/0.1.0.1/',m=>m.packageUrl+='../../',m=>m.packageUrl=base+'versions/0.1.0.2/',m=>m.remoteManifestUrl+='?other=1',m=>m.assets['../bad.zip']=m.assets['avg-plus-assets.zip'],m=>m.assets['avg-plus-assets.zip'].md5='broken',m=>m.assets['avg-plus-assets.zip'].compressed=false,m=>m.assets['avg-plus-assets.zip'].size=129*1024*1024,m=>m.searchPaths=['../../']];
 for(const change of mutate){const value=manifest();change(value);assert.throws(()=>validateUpdate(value,identity));}
});
