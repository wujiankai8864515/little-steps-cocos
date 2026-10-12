const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function fixture(slow=false){
 const events=[],draws=[],assetReady=deferred(),runtimeReady=deferred(),views=[];let assetsDisposed=0,runtimeDisposed=0,failData=false;
 const cc={_decorator:{ccclass:()=>C=>C},Component:class{},UITransform:class{},profiler:{hideStats(){}},ResolutionPolicy:{FIXED_WIDTH:1},view:{setDesignResolutionSize(){}},Game:{EVENT_HIDE:'hide',EVENT_SHOW:'show'},game:{on(){},off(){}},Director:{EVENT_AFTER_DRAW:'draw'},director:{once(_,f){draws.push(f);},off(_,f){const i=draws.indexOf(f);if(i>=0)draws.splice(i,1);}},assetManager:{loadBundle(name,cb){events.push('bundle:'+name);cb(failData&&name==='runtime_data'?Error('offline'):null,{});}}};
 class LoadingAssets{async load(){events.push('loading-assets');if(slow)await assetReady.promise;return this;}dispose(){assetsDisposed++;}}
 class LoadingView{constructor(){events.push('complete-loading');views.push(this);}setStage(){}advance(){events.push('animate');}resize(){}cancel(){}failure(){events.push('retry');}dispose(){events.push('loading-disposed');}}
 const global={LittleStepsLoadPlatform(){events.push('platform');},LittleStepsPlatform:{runtimeDataBundle:'runtime_data',installFramework(){events.push('framework');}},LittleStepsRuntime:{create(){events.push('runtime-created');return {async startFromBoot(){events.push('login-loading');await runtimeReady.promise;},advance(){},dispose(){runtimeDisposed++;}};}}};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/Boot.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true}}).outputText,{exports,require:k=>k==='cc'?cc:k.includes('LoadingAssets')?{LoadingAssets}:{LoadingView},globalThis:global,console:{info(){},error(){}}});
 const boot=new exports.Boot();boot.node={getComponent:()=>({height:1280}),on(){},off(){}};
 return {boot,events,assetReady,runtimeReady,views,draw:()=>draws.shift()?.(),drawCount:()=>draws.length,disposed:()=>({assetsDisposed,runtimeDisposed}),setFailData:v=>failData=v};
}
test('Full loading draws before any framework/data/game code request, and owns the screen until login readiness',async()=>{
 const f=fixture(),start=f.boot.start();await flush();assert.deepEqual(f.events,['loading-assets','complete-loading']);assert.equal(f.drawCount(),1);
 f.boot.update(.016);assert.equal(f.events.at(-1),'animate');f.draw();await flush();
 assert.deepEqual(f.events.slice(3),['bundle:framework_code','platform','framework','bundle:runtime_data','bundle:gameplay_code','runtime-created','login-loading']);assert.equal(f.events.includes('loading-disposed'),false);
 f.runtimeReady.resolve();await flush();assert.equal(f.events.includes('loading-disposed'),false);f.draw();await start;assert.equal(f.events.at(-1),'loading-disposed');f.boot.onDestroy();assert.equal(f.disposed().runtimeDisposed,1);
});
test('Destruction while assets or first draw are pending never requests gameplay or constructs a late view',async()=>{
 const f=fixture(true),start=f.boot.start();f.boot.onDestroy();f.assetReady.resolve();await start;assert.deepEqual(f.events,['loading-assets']);
 const g=fixture(),pending=g.boot.start();await flush();g.boot.onDestroy();await pending;assert.equal(g.drawCount(),0);assert.equal(g.events.some(e=>e.startsWith('bundle:')),false);
});
test('A failed deferred package exposes retry; retry stays single-owner and destruction cannot enter a late login',async()=>{
 const f=fixture();f.setFailData(true);const start=f.boot.start();await flush();f.draw();await start;assert.equal(f.events.at(-1),'retry');assert.equal(f.events.includes('runtime-created'),false);
 f.setFailData(false);f.views[0].onRetry();f.views[0].onRetry();await flush();assert.equal(f.events.filter(e=>e==='runtime-created').length,1);f.boot.onDestroy();f.runtimeReady.resolve();await flush();assert.equal(f.disposed().runtimeDisposed,1);
});
