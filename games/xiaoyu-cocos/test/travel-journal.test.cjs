'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../../engines/travel-core/dist/travel-core.js'),'utf8'),context);const core=context.LittleStepsCore,modules={};
const content=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/bundles/home/travel/travel_content.json'))),catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/resources/source-catalog.json')));
const components=[],bindings=[];
class Color{constructor(r=255,g=255,b=255,a=255){Object.assign(this,{r,g,b,a});}}
class Vec4{constructor(x=0,y=0,z=0,w=0){Object.assign(this,{x,y,z,w});}}
class UITransform{setAnchorPoint(){}setContentSize(w,h){this.width=w;this.height=h;}}
class Node{constructor(name){this.name=name;this.children=[];this.components=new Map();this.active=true;this.position={x:0,y:0};this.scale={x:1,y:1};}addChild(n){this.children.push(n);n.parent=this;}addComponent(T){const c=new T();c.node=this;this.components.set(T,c);components.push(c);return c;}getComponent(T){return this.components.get(T);}getChildByName(name){return this.children.find(c=>c.name===name);}setPosition(x,y){this.position={x,y};}setScale(x,y){this.scale={x,y};}setSiblingIndex(){}destroy(){this.destroyed=true;this.children.forEach(c=>c.destroy());}on(){}off(){}}
class Sprite{static SizeMode={CUSTOM:1};configure(mesh){this.mesh=mesh;}geometryChanged(){}}
class Label{static Overflow={CLAMP:1,RESIZE_HEIGHT:2};static HorizontalAlign={CENTER:0,LEFT:1};static VerticalAlign={CENTER:0,TOP:1};updateRenderData(){}}
class Graphics{clear(){}moveTo(){}lineTo(){}close(){}fill(){}roundRect(){}stroke(){}}
class Material{initialize(){}setProperty(){}destroy(){this.destroyed=true;}}
const cc={Node,Sprite,UITransform,Color,Vec4,Label,LabelOutline:class{},Graphics,Material,Mask:class{},KeyCode:{ESCAPE:1},Input:{EventType:{KEY_DOWN:1}},input:{on(){},off(){}}};
for(const name of ['Engine','Viewport','Assets','TravelModel','TravelStore','TravelService','TravelJournalSession','Visual','TravelAtlasSprite','TravelHomeRules','Stroke2D','TravelJournalPage']){
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:key=>key==='cc'?cc:modules[key.slice(2)],LittleStepsCore:core,console});modules[name]=exports;
 if(name==='Engine')Object.assign(exports,{meshSprite:()=>Sprite,sharedUI:()=>({action(node,fn,enabled){const b={node,fn,enabled,cancel(){this.cancelled=true;},dispose(){this.disposed=true;}};bindings.push(b);return b;}})});
}
const {TravelService}=modules.TravelService,{TravelJournalSession}=modules.TravelJournalSession,{TravelJournalPage,JOURNAL_RESOURCES}=modules.TravelJournalPage;
function fixture(){let at=1000;const service=new TravelService();service.model.content=content;service.wall_clock=()=>at;service.configure('journal_test',true);assert.equal(service.depart(70,.25,321),true);at=1100;service.reconcile();assert.ok(service.model.pending_journals().length);return {service,session:new TravelJournalSession(service)};}
test('Real saved diary orders agreement first, requires a selection and learns exactly once across re-entry',()=>{
 const {service,session}=fixture(),uid=session.entry.uid,base=service.model.data.review_count;
 assert.equal(session.options[0].id,session.entry.choice);assert.equal(session.submit(uid),'ignored');
 assert.equal(session.select(uid,session.options[1].id),true);assert.equal(session.submit(uid),'next');assert.equal(service.model.data.review_count,base+1);
 assert.equal(session.submit(uid),'ignored');const reopened=new TravelJournalSession(service);assert.notEqual(reopened.entry.uid,uid);assert.equal(reopened.choice,'');
 while(!reopened.journal.archived){const e=reopened.entry;reopened.select(e.uid,reopened.options[0].id);reopened.submit(e.uid);}
 const saved=service.store.load_state();assert.equal(saved.journals[0].archived,true);assert.equal(saved.review_count,saved.journals[0].entries.length);
 const archive=new TravelJournalSession(service,true);assert.equal(archive.readonly,true);assert.equal(archive.select(archive.entry.uid,archive.options[0].id),false);assert.equal(archive.submit(archive.entry.uid),'ignored');assert.equal(service.model.data.review_count,saved.review_count);
});
test('A save failure preserves the selected review for retry and stale page callbacks cannot grade another entry',()=>{
 const {service,session}=fixture(),uid=session.entry.uid,choice=session.options[1].id,commit=service.store.commit.bind(service.store);
 session.select(uid,choice);service.store.commit=()=>{service.store.error='write_failed';return false;};assert.equal(session.submit(uid),'failed');assert.equal(session.choice,choice);assert.equal(session.entry.reviewed,false);assert.equal(service.model.data.review_count,0);
 service.store.commit=commit;assert.equal(session.submit(uid),'next');assert.equal(service.model.data.review_count,1);assert.equal(service.last_error,'');assert.equal(session.select(uid,choice),false);
 const second=session.entry.uid;session.select(second,session.options[0].id);session.move(-1);assert.equal(session.readonly,true);assert.equal(session.choice,'');assert.equal(session.submit(second),'ignored');
});
test('Actual diary view rebuilds scoped controls, pauses input, uses original resources and closes only after durable archive',()=>{
 const {service}=fixture(),scope=new core.Lifetime(),frames=[];
 const assets={catalog,art:modules.Assets.GameAssets.prototype.art,font:p=>({p}),effect:p=>({p}),frame:(p,owner)=>{const f={p};frames.push(f);owner.own(()=>f.destroyed=true);return f;}};
 const page=new TravelJournalPage(new Node('Canvas'),assets,scope,1280,service);let closes=0;page.onBack=()=>closes++;page.resume();
 const latest=name=>bindings.filter(b=>b.node.name===name&&!b.disposed).at(-1);
 assert.equal(latest('review_submit').enabled(),false);assert.ok(page.snapshot().controls.includes('journal_close'));
 page.pause();assert.equal(latest('review_0').enabled(),false);page.resume();
 const firstFrames=frames.slice(),first=latest('review_0');first.fn();assert.equal(first.disposed,true);assert.equal(latest('review_submit').enabled(),true);assert.ok(firstFrames.slice(1).every(f=>f.destroyed));
 while(closes===0){if(!latest('review_submit').enabled())latest('review_0').fn();latest('review_submit').fn();}
 assert.equal(closes,1);assert.equal(service.store.load_state().journals[0].archived,true);
 assert.ok(frames.some(f=>f.p.endsWith('travel_diary_reference_v5.png')));assert.equal(JOURNAL_RESOURCES.length,7);
 scope.dispose();assert.ok(frames.every(f=>f.destroyed));assert.ok(bindings.every(b=>b.disposed));assert.ok(page.root.destroyed);
});

// Exercise the real Application entry transaction with controlled resource
// completion, retaining the real journal view and Lifetime cancellation.
class HomePage{constructor(){this.root=new Node('Home');this.loading=false;}setTravelLoading(v){this.loading=v;}setInput(){}resize(){}restoreTravelOffer(){this.restored=true;}resume(){}pause(){}clearRouteWaiting(){}}
// Rendering is verified by the real browser candidate; keep this route test
// independent of GPU and control the two asynchronous admission stages.
for(const name of ['PhotoLighting','PhotoPage']){
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:key=>key==='cc'?cc:modules[key.slice(2)]||{},console});modules[name]=exports;
}
const photoViews=[];
class PhotoRouteView{
 constructor(parent,assets,owner,height,collection,clock,retained){this.root=new Node('Photo');this.retained=retained||{batch:0,elapsed:0,vines:[]};photoViews.push(this);owner.own(()=>this.root.destroy());}
 resize(){}resume(allowed=true){this.active=allowed;}pause(){this.active=false;}retain(){return this.retained;}
}
const appModules={...modules,TravelMapPage:{TravelMapPage:class{}},TravelCollectionPage:{TravelCollectionPage:class{}},PhotoPage:{...modules.PhotoPage,PhotoPage:PhotoRouteView},HomePage:{HomePage},LoginPage:{LoginPage:class{}},ComicPage:{ComicPage:class{}},DarkroomPage:{DarkroomPage:class{}}},appExports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game/Application.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:appExports,require:key=>key==='cc'?cc:appModules[key.slice(2)]||{},console:{info(){},error(){}}});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function application(){
 const {service}=fixture(),app=Object.create(appExports.Application.prototype),requests=[],events=[],scope=new core.Lifetime(),home=new HomePage();
 Object.assign(app,{scope,active:true,entering:false,intent:0,height:1280,physicalWidth:720,viewportKey:"720:1280",pageViewports:new WeakMap(),page:home,current:{page:home,scope:new core.Lifetime(scope)},root:new Node('App'),travel:{service},travelProps:{suspend(){events.push('props-suspended');}},travelLoading:{show(t){events.push(t);},hide(){events.push('hide');},failure(t){events.push(t);}},router:{cancel(){},show:async()=>true},frame:async()=>{}});app.homePage=app.current;
 app.assets={catalog,art:modules.Assets.GameAssets.prototype.art,font:p=>({p}),effect:p=>({p}),frame:()=>({}),acquireResources(paths,owner){const d=deferred();requests.push({...d,paths,owner});return owner.guard(d.promise);}};
 return {app,scope,requests,events,home};
}
test('Actual Application journal entry admits only its subset, preserves Home and returns through the real router',async()=>{
 const f=application(),pending=f.app.openJournal('journal');assert.equal(f.requests.length,1);assert.equal(f.home.loading,true);await f.app.openJournal('journal');assert.equal(f.requests.length,1);
 assert.deepEqual(Array.from(f.requests[0].paths),Array.from(JOURNAL_RESOURCES));f.requests[0].resolve();await pending;
 assert.ok(f.app.page instanceof TravelJournalPage);assert.equal(f.app.entering,false);assert.equal(f.home.loading,false);const page=f.app.page,owner=f.requests[0].owner;
 await f.app.returnHome();assert.equal(f.app.page,f.home);assert.equal(f.home.restored,true);assert.equal(owner.active,false);assert.equal(page.root.destroyed,true);assert.equal(f.app.homePage.scope.active,true);f.scope.dispose();
});
test('Journal cancellation rejects a late completion; failed loading can retry without altering saves',async()=>{
 const f=application(),before=JSON.stringify(f.app.travel.service.model.data),pending=f.app.openJournal('journal');f.app.cancelJournalLoading();f.requests[0].resolve();await pending;
 assert.equal(f.app.page,f.home);assert.equal(f.requests[0].owner.active,false);assert.equal(f.app.entering,false);assert.equal(JSON.stringify(f.app.travel.service.model.data),before);
 const failed=f.app.openJournal('journal');f.requests[1].reject(Error('offline'));await failed;assert.ok(f.events.includes('日记加载失败，再试一次？'));assert.equal(f.app.page,f.home);assert.equal(f.requests[1].owner.active,false);
 f.app.cancelJournalLoading();const retry=f.app.openJournal('journal');f.requests[2].resolve();await retry;assert.ok(f.app.page instanceof TravelJournalPage);assert.equal(JSON.stringify(f.app.travel.service.model.data),before);f.scope.dispose();
});

function photoApplication(){
 const f=application();f.effects=[];f.app.assets.acquireEffects=(names,owner)=>{const d=deferred();f.effects.push({...d,names,owner});return owner.guard(d.promise);};
 return f;
}
const flushPromises=()=>new Promise(resolve=>setImmediate(resolve));
test('Photo entry waits for both resource groups and first draw, then frees GPU ownership while retaining page state on Home return',async()=>{
 const f=photoApplication(),draw=deferred(),before=JSON.stringify(f.app.travel.service.model.data);f.app.frame=()=>draw.promise;
 const pending=f.app.openJournal('photo');assert.deepEqual(Array.from(f.requests[0].paths),Array.from(modules.PhotoPage.PHOTO_RESOURCES));
 f.requests[0].resolve();await flushPromises();assert.equal(f.app.page,f.home);assert.deepEqual(Array.from(f.effects[0].names),Array.from(modules.PhotoLighting.PHOTO_EFFECTS));
 f.effects[0].resolve();await flushPromises();assert.equal(f.app.page,f.home);assert.equal(f.app.entering,true);assert.equal(f.home.loading,true);
 draw.resolve();await pending;const page=f.app.page;assert.ok(page instanceof PhotoRouteView);assert.equal(page.active,true);
 page.retained={batch:2,elapsed:7.5,vines:[],actor:{clock:2,blinkElapsed:1,blinkIndex:0}};
 await f.app.returnHome();assert.equal(f.app.page,f.home);assert.equal(page.root.destroyed,true);assert.equal(f.requests[0].owner.active,false);assert.equal(f.app.homePage.scope.active,true);
 const reopen=f.app.openJournal('photo');f.requests[1].resolve();await flushPromises();f.effects[1].resolve();await reopen;
 assert.equal(f.app.page.retained.batch,2);assert.equal(f.app.page.retained.elapsed,7.5);assert.equal(JSON.stringify(f.app.travel.service.model.data),before);f.scope.dispose();
});
test('Photo load cancellation and shader failure cannot publish a late page or mutate a save; retry uses fresh ownership',async()=>{
 const f=photoApplication(),before=JSON.stringify(f.app.travel.service.model.data),views=photoViews.length,pending=f.app.openJournal('photo');
 f.requests[0].resolve();await flushPromises();f.app.cancelJournalLoading();f.effects[0].resolve();await pending;
 assert.equal(f.app.page,f.home);assert.equal(photoViews.length,views);assert.equal(f.effects[0].owner.active,false);
 const failed=f.app.openJournal('photo');f.requests[1].resolve();await flushPromises();f.effects[1].reject(Error('shader offline'));await failed;
 assert.ok(f.events.includes('照片加载失败，再试一次？'));assert.equal(f.app.page,f.home);assert.equal(f.effects[1].owner.active,false);
 f.app.cancelJournalLoading();const retry=f.app.openJournal('photo');f.requests[2].resolve();await flushPromises();f.effects[2].resolve();await retry;
 assert.ok(f.app.page instanceof PhotoRouteView);assert.notEqual(f.effects[1].owner,f.effects[2].owner);assert.equal(JSON.stringify(f.app.travel.service.model.data),before);f.scope.dispose();
});
