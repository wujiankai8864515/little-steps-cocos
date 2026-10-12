const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
let safeReads=0,safe={x:0,y:0,width:720,height:1280};
class UITransform{constructor(){this.width=720;this.height=1280;}setContentSize(w,h){this.width=w;this.height=h;}get contentSize(){return {width:this.width,height:this.height};}}
class Node{constructor(name){this.name=name;this.children=[];this.ui=new UITransform();this.position={x:0,y:0};this.scale={x:1,y:1};}getComponent(T){return T===cc.Widget?this.widget:this.ui;}addComponent(T){const v=new T();v.node=this;this.widget=v;return v;}setPosition(x,y){this.position={x,y};}setScale(x,y){this.scale={x,y};}getChildByName(name){return this.children.find(c=>c.name===name);}addChild(n){this.children.push(n);n.parent=this;}}
const cc={Vec3:class{constructor(x,y,z=0){Object.assign(this,{x,y,z});}},Node,UITransform,screen:{windowSize:{width:720}},sys:{getSafeAreaRect(){safeReads++;return safe;}},Graphics:class{}};
require('./viewport-mocks.cjs').installViewportMocks(cc);
const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../../engines/travel-core/dist/travel-core.js'),'utf8'),context);const core=context.LittleStepsCore;
const mods={Engine:{core}},load=name=>{if(mods[name])return mods[name];const exports={};mods[name]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:k=>k==='cc'?cc:(mods[k.slice(2)]||{}),console:{info(){},error(){}}});return exports;};
for(const name of ['LoginPage','ComicPage','TravelJournalPage','TravelMapPage','TravelCollectionPage','PhotoPage','WardrobePage'])mods[name]={[name]:class{}};
load('Viewport');load('HomeRenderPlan');const {GameAssets}=load('Assets'),{HomePage}=load('HomePage'),{DarkroomPage}=load('DarkroomPage'),{Application}=load('Application');
test('Application resizes active and retained pages exactly once per changed viewport and moves the top-left origin',()=>{
 const canvas=new Node('Canvas'),root=new Node('App'),calls=[];const page={resize:(...a)=>calls.push(['active',...a])},cached={resize:(...a)=>calls.push(['cached',...a])};
 const app=Object.create(Application.prototype);Object.assign(app,{canvas,root,page,homePage:{page},darkroomPage:{page:cached},viewportKey:'',viewportDimensions:'',viewportDirty:true,pageViewports:new WeakMap(),viewportFailures:new WeakMap()});
 safeReads=0;app.refreshViewport();assert.equal(calls.length,2);assert.equal(safeReads,1);assert.deepEqual(root.position,{x:-360,y:640});
 for(let i=0;i<10000;i++)app.refreshViewport();assert.equal(calls.length,2);assert.equal(safeReads,1);
 canvas.ui.setContentSize(720,1690);cc.screen.windowSize.width=1440;safe={x:0,y:34,width:720,height:1612};app.refreshViewport();assert.equal(calls.length,4);assert.equal(app.height,1690);assert.deepEqual(calls[2],['active',1690,1440]);assert.deepEqual(root.position,{x:-360,y:845});
 const late={resize:(...a)=>calls.push(['late',...a])};app.fitPage(late);assert.deepEqual(calls.at(-1),['late',1690,1440]);app.fitPage(late);assert.equal(calls.length,5);
 canvas.ui.setContentSize(0,0);app.refreshViewport();assert.equal(app.height,1690);assert.equal(calls.length,5);
});
test('Budget rejection does not stop the application update loop or spam retries, and a later resize can recover',()=>{
 const app=Object.create(Application.prototype),canvas=new Node('Canvas');let attempts=0,fail=true;
 const page={resize(){attempts++;if(fail)throw Error('budget');}};Object.assign(app,{canvas,root:new Node('App'),page,viewportKey:'',viewportDimensions:'',viewportDirty:true,pageViewports:new WeakMap(),viewportFailures:new WeakMap()});
 app.refreshViewport();for(let i=0;i<30;i++)app.refreshViewport();assert.equal(attempts,1);fail=false;canvas.ui.setContentSize(720,1440);app.refreshViewport();assert.equal(attempts,2);assert.equal(app.pageViewports.get(page),app.viewportKey);
});
test('Home viewport changes retain live actors while updating the actual shared input plan, renderer, HUD and border mesh',()=>{
 const plan=mods.HomeRenderPlan.homeRenderPlan(1280,720),page=Object.create(HomePage.prototype),events=[],root=new Node('Home'),world=new Node('World');
 const actor={merit:91,pose:123,trip:'saved'};
 Object.assign(page,{plan,root,roomRoot:world,rig:actor,background:{resize:(h,layout)=>events.push(['background',h,JSON.parse(JSON.stringify(layout))])},targetLease:{texture:{},resize:(w,h)=>events.push(['target',w,h])},pointerBinding:{cancel:()=>events.push(['cancel'])},travelInteractions:{cancelPointer:()=>events.push(['travelCancel'])},surface:{layout:(...a)=>events.push(['layout',...a])},hud:{resize:h=>events.push(['hud',h])}});
 page.resize(1800,1440);assert.equal(page.viewportOffset,260);assert.equal(plan.offset,260);assert.deepEqual(Array.from(plan.logical),[720,1800]);assert.equal(page.rig,actor);assert.equal(actor.merit,91);assert.deepEqual(world.position,{x:0,y:-260});
 assert.deepEqual(events.at(-1),['background',1800,{scale:1,x:0,offset:260,top:-260,bottom:1540}]);assert.deepEqual(events[0],['target',1440,3600]);
 page.resize(1280,720);assert.deepEqual(events.at(-1),['background',1280,{scale:1,x:0,offset:0,top:0,bottom:1280}]);assert.equal(page.viewportOffset,0);assert.equal(page.rig,actor);
});
test('Real GameAssets keeps one admitted target slot across repeated resize, corrects byte reservation and releases once',async()=>{
 const assets=new GameAssets(),scope=new core.Lifetime();let destroyed=0,created=0;
 const renderer={estimateTarget:(w,h)=>w*h*8,createTarget:(w,h)=>{created++;return {width:w,height:h,destroy(){destroyed++;}};},resizeTarget:(v,w,h)=>Object.assign(v,{width:w,height:h})};
 const target=await assets.acquireResizableTarget('viewport-test',720,1280,renderer,scope);
 assert.equal(assets.snapshot().entries,1);for(const [w,h]of [[1440,3380],[720,1280],[1080,2160]]){target.resize(w,h);assert.equal(assets.snapshot().reservedBytes,w*h*8);assert.equal(assets.snapshot().entries,1);assert.equal(target.texture.height,h);}
 assert.equal(created,4);assert.equal(destroyed,3);scope.dispose();assert.equal(destroyed,4);assert.equal(assets.snapshot().reservedBytes,0);
});

test('Cached target parking frees its full reservation; failed restoration remains empty and can retry without losing the scope',async()=>{
 const assets=new GameAssets(),scope=new core.Lifetime();let live=0,created=0,destroyed=0,fail=false;
 const renderer={estimateTarget:(w,h)=>w*h*8,createTarget:(w,h)=>{if(fail)throw Error('GPU allocation failed');live++;created++;return {width:w,height:h,destroy(){live--;destroyed++;}};}};
 const target=await assets.acquireResizableTarget('cached-darkroom',1440,3380,renderer,scope);assert.equal(assets.snapshot().reservedBytes,38937600);
 target.park();target.park();assert.equal(target.texture,null);assert.equal(assets.snapshot().reservedBytes,0);assert.equal(assets.snapshot().entries,1);assert.equal(live,0);
 fail=true;assert.throws(()=>target.resize(1440,3600),/GPU/);assert.equal(target.texture,null);assert.equal(assets.snapshot().reservedBytes,0);assert.equal(scope.active,true);
 fail=false;target.resize(1440,3600);assert.equal(assets.snapshot().reservedBytes,41472000);assert.equal(live,1);assert.equal(created,2);target.park();scope.dispose();assert.equal(destroyed,2);assert.equal(assets.snapshot().entries,0);
});

function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});promise.catch(()=>{});return {promise,resolve,reject};}
async function cachedDarkroom(){
 const assets=new GameAssets(),scope=new core.Lifetime(),renders=[];
 const renderer={estimateTarget:(w,h)=>w*h*8,createTarget:(w,h)=>({width:w,height:h,destroy(){this.destroyed=true;}})};
 const targetLease=await assets.acquireResizableTarget('darkroom-residency',720,1280,renderer,scope),page=Object.create(DarkroomPage.prototype);
 const surface={active:true,texture:null,get ready(){return renders.at(-1).promise;},setActive(v){this.active=v&&!!this.texture;},layout(size,rect,texture){if(this.texture!==texture){if(renders.length)renders.at(-1).reject(Error('superseded'));renders.push(deferred());}this.texture=texture;if(!texture){this.active=false;renders.at(-1)?.reject(Error('parked'));}}};
 const round={active:true,inputEnabled:true,phase:'ready_full',tool:'slipper',misfortune:39,dragBounds:[],cancel(){this.held=null;}};
 Object.assign(page,{scope,targetLease,surface,root:new Node('Darkroom'),room:new Node('World'),plan:mods.HomeRenderPlan.homeRenderPlan(1280,720),pointerHost:new Node('Pointer'),round,pointer:{cancel(){}},plaque:{cancel(){},root:new Node('Back')},hud:{resize(){}},bubble:{dismiss(){},setSafe(){},show(){}},bleedUpdate(){},lighting:{resize(){}},sync(){},shadows:{sync(){}},snapshot(){return {tool:round.tool,phase:round.phase,misfortune:round.misfortune};}});
 surface.layout(page.plan.logical,[],targetLease.texture);return {assets,scope,page,round,surface,renders,targetLease};
}
test('Actual cached Darkroom pause releases pixels, dormant resize allocates nothing and re-entry preserves the round until new drawing completes',async()=>{
 const f=await cachedDarkroom(),state=JSON.stringify(f.page.snapshot());f.page.pause();assert.equal(f.assets.snapshot().reservedBytes,0);const round=f.page.round;
 f.page.resize(1690,1440);assert.equal(f.assets.snapshot().reservedBytes,0);assert.deepEqual(Array.from(f.page.plan.pixels),[1440,3380]);assert.equal(f.page.round,round);assert.equal(JSON.stringify(f.page.snapshot()),state);
 let done=false;const ready=f.page.prepareRender().then(()=>done=true);await Promise.resolve();assert.equal(done,false);assert.equal(f.assets.snapshot().reservedBytes,38937600);assert.equal(f.surface.active,true);assert.equal(f.round.inputEnabled,false);
 // A resize during preparation supersedes the old draw; entry must await the
 // replacement texture instead of treating cancellation as readiness.
 f.page.resize(1800,1440);await Promise.resolve();await Promise.resolve();assert.equal(done,false);f.renders.at(-1).resolve();await ready;assert.equal(done,true);assert.equal(f.assets.snapshot().reservedBytes,41472000);assert.equal(JSON.stringify(f.page.snapshot()),state);
 f.page.resume();assert.equal(f.round.inputEnabled,true);f.page.suspend();assert.equal(f.assets.snapshot().reservedBytes,41472000);f.page.restore();assert.equal(f.surface.active,true);f.page.pause();assert.equal(f.assets.snapshot().reservedBytes,0);f.scope.dispose();
});
test('Real Darkroom route waits for rendering, cancellation frees pixels, and a later request reuses gameplay safely',async()=>{
 const f=await cachedDarkroom(),app=Object.create(Application.prototype),home=Object.create(HomePage.prototype);Object.assign(home,{root:new Node('Home'),resize(){},showRouteWaiting(){},clearRouteWaiting(){},showRouteError(){this.failed=true;},resume(){},setInput(){},pause(){}});f.page.pause();
 Object.assign(app,{scope:f.scope,active:true,entering:false,intent:0,height:1280,physicalWidth:720,viewportKey:'720:1280',pageViewports:new WeakMap(),page:home,current:{page:home,scope:new core.Lifetime(f.scope)},darkroomPage:{page:f.page,scope:f.scope},router:{cancel(){},show:async()=>true},frame:async()=>{}});app.homePage=app.current;
 const request=app.openDarkroom();await Promise.resolve();assert.equal(app.page,home);assert.equal(app.entering,true);assert.equal(f.assets.snapshot().reservedBytes,7372800);
 app.active=false;app.interactive(false);assert.equal(f.surface.active,false);app.active=true;app.interactive(true);assert.equal(f.surface.active,true);app.cancelDarkroomEntry();await request;assert.equal(app.page,home);assert.equal(app.entering,false);assert.equal(f.assets.snapshot().reservedBytes,0);assert.equal(home.failed,undefined);
 const again=app.openDarkroom();await Promise.resolve();assert.equal(app.page,home);f.renders.at(-1).resolve();await again;assert.equal(app.page,f.page);assert.equal(f.round.inputEnabled,true);assert.equal(f.round.misfortune,39);
 await app.returnHome();assert.equal(app.page,home);assert.equal(f.assets.snapshot().reservedBytes,0);assert.equal(f.scope.active,true);f.scope.dispose();
});

test('Authored Home, cached Darkroom and journal fit the unchanged 128-entry / 256 MiB limits when the hidden target is parked',async()=>{
 const assets=new GameAssets(),scope=new core.Lifetime(),catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/resources/source-catalog.json'))),groups=new Set(),specs=new Map();
 function include(name){if(groups.has(name))return;groups.add(name);(catalog.groups[name].depends_on||[]).forEach(include);}include('home');include('darkroom');
 for(const [key,spec]of Object.entries(catalog.assets))if(groups.has(spec.bundle))specs.set(key,{key,bytes:spec.streaming?.reservedBytes??spec.decodedBytes});
 for(const name of groups){const alpha=catalog.groups[name].cocosAlpha;if(alpha)specs.set('alpha:'+name,{key:'alpha:'+name,bytes:alpha.decodedBytes});}
 for(const key of ['res://home/audio/tracks/day_harp_mouse.mp3','res://home/audio/tracks/night_peaceful_mind.mp3'])specs.set(key,{key,bytes:catalog.assets[key].streaming.reservedBytes});
 for(const effect of [...load('HomeLighting').HOME_EFFECTS,...load('DarkroomLighting').DARKROOM_EFFECTS])specs.set('effect:'+effect,{key:'effect:'+effect,bytes:512*1024});
 specs.set('gradient',{key:'gradient',bytes:65536});const all=Array.from(specs.values());
 for(let i=0;i<all.length;i+=80)await assets.gate.acquire(all.slice(i,i+80),s=>({key:s.key}),()=>{},scope);
 const renderer={estimateTarget:(w,h)=>w*h*8,createTarget:(w,h)=>({width:w,height:h,destroy(){}})};
 await assets.acquireResizableTarget('budget-home',1440,3380,renderer,scope);const dark=await assets.acquireResizableTarget('budget-dark',1440,3380,renderer,scope);
 const journal=['travel_brush.ttf','travel_paper_v1.png','travel_diary_plate_v5.png','travel_diary_reference_v5.png','travel_scenery_v1.png','travel_people_v5.png','travel_map_actor_v5.png'].map(n=>'res://travel/assets/'+n).map(key=>({key,bytes:catalog.assets[key].decodedBytes}));
 // Exact alpha planes replace nested JS run arrays. The conservative resident
 // estimate falls while both render targets and every page resource remain.
 const unparked=assets.snapshot().reservedBytes+journal.reduce((n,s)=>n+s.bytes,0);
 const fontSavings=334848-catalog.assets['res://assets/bootstrap_ui.ttf'].decodedBytes;
 assert.equal(unparked,265337270-fontSavings);assert.ok(unparked<=256*1024*1024);
 dark.park();await assets.gate.acquire(journal,s=>({key:s.key}),()=>{},scope);assert.equal(assets.snapshot().entries,128);assert.equal(assets.snapshot().reservedBytes,226399670-fontSavings);assert.equal(unparked-assets.snapshot().reservedBytes,renderer.estimateTarget(1440,3380));scope.dispose();assert.equal(assets.snapshot().reservedBytes,0);assert.equal(assets.snapshot().entries,0);
});

test('Collection entry uses the original binary hit mask rather than the texture-only asset accessor, respecting actor occlusion',()=>{
 const page=Object.create(HomePage.prototype),assets=new GameAssets(),mask='res://travel/assets/treasure_hit.res',data=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/bundles/home/travel/assets/treasure_hit.json')));assets.catalog={assets:{[mask]:{kind:'mask',size:[512,512]}}};assets.values.set(mask,{json:data});let occluded=false;
 Object.assign(page,{assets,travelAway:false,roomRoot:{getComponent:()=>({convertToWorldSpaceAR:v=>v})},collectionObject:{resource:'unused',size:[512,512],centered:false,node:{activeInHierarchy:true,getComponent:()=>({convertToNodeSpaceAR:v=>v})}},backpack:{hit:()=>false},propVisuals:{hit:()=>null},rig:{hitAt:()=>occluded?{part:'body'}:null}});
 assert.equal(page.hitsCollection([0,0]),false);assert.equal(page.hitsCollection([256,256]),true);occluded=true;assert.equal(page.hitsCollection([256,256]),false);occluded=false;assert.equal(page.hitsCollection([512,256]),false);
});
