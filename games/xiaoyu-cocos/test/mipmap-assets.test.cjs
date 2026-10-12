const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const plugin=vm.createContext({console});vm.runInContext(fs.readFileSync(path.join(__dirname,'../../../engines/travel-core/dist/travel-core.js'),'utf8'),plugin);const core=plugin.LittleStepsCore;
const tick=()=>new Promise(setImmediate);
function environment(){
 const pending=[],requests=[],textures=[],images=[];
 class ImageAsset{constructor(){this.refs=0;this.data=new Uint8Array(16);this.releases=0;images.push(this);}addRef(){this.refs++;}decRef(){this.refs--;this.releases++;if(!this.refs)this.data=null;}}
 class Texture2D{static Filter={LINEAR:2};static WrapMode={CLAMP_TO_EDGE:2};constructor(){this.refs=0;this.destroyed=0;this.levels=[];textures.push(this);}set image(value){this.mipmaps=[value];}get image(){return this.levels[0];}set mipmaps(values){for(const value of values)assert.ok(value.data,'mipmap image must survive GPU upload');this.levels=values;}addRef(){this.refs++;}decRef(auto=true){this.refs--;assert.equal(auto,false,'owned textures are destroyed explicitly');}destroy(){this.destroyed++;}setFilters(){}setMipFilter(){}setWrapMode(){}}
 const bundle={load(p,T,cb){requests.push({p,T});assert.equal(T,ImageAsset,'never load an auto-cleaned imported Texture2D');pending.push(cb);}};
 const exports={},cc={ImageAsset,Texture2D,assetManager:{loadBundle(n,cb){cb(null,bundle);}}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game/Assets.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports,require:n=>n==='cc'?cc:{core},console:{info(){}}});
 const assets=new exports.GameAssets(),key='res://worn.png',mip='mip:1';assets.catalog={assets:{[key]:{kind:'texture',bundle:'home',path:'worn/texture',decodedBytes:16,mipResources:[mip]},[mip]:{kind:'image',bundle:'home',path:'worn_mip1',decodedBytes:8}},groups:{home:{}}};
 return {assets,key,mip,requests,textures,images,resolve(){const values=pending.splice(0).map(cb=>{const image=new ImageAsset();cb(null,image);return image;});return values;}};
}
test('WeChat image cleanup cannot invalidate authored level zero; shared owners release CPU and GPU at the last owner',async()=>{
 const e=environment(),a=new core.Lifetime(),b=new core.Lifetime(),first=e.assets.acquireGroups(['home'],a),second=e.assets.acquireGroups(['home'],b);await tick();assert.deepEqual(e.requests.map(r=>r.p),['worn','worn_mip1']);e.resolve();await Promise.all([first,second]);
 const texture=e.assets.texture(e.key),base=texture.image,mip=e.assets.image(e.mip);texture.mipmaps=[base,mip];assert.equal(texture.levels.length,2);assert.equal(base.refs,1);assert.equal(e.assets.snapshot().reservedBytes,40);
 a.dispose();assert.ok(base.data);assert.equal(texture.destroyed,0);b.dispose();assert.equal(texture.destroyed,1);assert.equal(base.releases,1);assert.equal(base.data,null);assert.equal(e.assets.snapshot().entries,0);
});
test('Cancellation before a raw-image load completes frees the late texture and its pinned image',async()=>{
 const e=environment(),scope=new core.Lifetime(),loading=e.assets.acquireResources([e.key],scope);await tick();scope.dispose();e.resolve();await assert.rejects(loading,{name:'CancelledError'});assert.equal(e.images[0].data,null);assert.equal(e.images[0].releases,1);assert.equal(e.textures[0].destroyed,1);assert.equal(e.assets.snapshot().reservedBytes,0);
});
test('Unavailable raw image fails explicitly, releases its reference and keeps no admission reservation',async()=>{
 const e=environment(),scope=new core.Lifetime();
 const loading=e.assets.acquireResources([e.key],scope);await tick();const image=e.resolve()[0];image.data=null;
 await assert.rejects(loading,/基础图像已释放/);assert.equal(image.releases,1);assert.equal(e.assets.snapshot().entries,0);
});
