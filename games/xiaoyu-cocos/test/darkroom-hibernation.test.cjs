const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'../../..'),GAME=path.join(ROOT,'games/xiaoyu-cocos/assets'),ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(ROOT,'engines/travel-core/dist/travel-core.js'),'utf8'),context);const core=context.LittleStepsCore;
const plain=v=>JSON.parse(JSON.stringify(v));
class Asset{constructor(json){this.json=json;this.refs=0;}addRef(){this.refs++;}decRef(){assert.ok(this.refs>0);this.refs--;}}
class UITransform{constructor(){this.width=1;this.height=1;}setAnchorPoint(){}setContentSize(w,h){this.width=w;this.height=h;}get contentSize(){return {width:this.width,height:this.height};}}
class Node{
 static EventType={TOUCH_START:'start',TOUCH_MOVE:'move',TOUCH_END:'end',TOUCH_CANCEL:'cancel'};
 constructor(name){this.name=name;this.children=[];this.components=new Map();this.position={x:0,y:0};this.scale={x:1,y:1};this.angle=0;this.active=true;this.isValid=true;this.listeners=new Map();}
 addChild(n){this.children.push(n);n.parent=this;}addComponent(Type){const c=new Type();c.node=this;this.components.set(Type,c);return c;}getComponent(Type){return this.components.get(Type)||this.addComponent(Type);}
 setPosition(x,y){this.position={x,y};}setScale(x,y){this.scale={x,y};}setSiblingIndex(){}on(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}off(name,fn){this.listeners.get(name)?.delete(fn);}destroy(){this.isValid=false;this.children.forEach(n=>n.destroy());this.listeners.clear();}get worldPosition(){return this.position;}get worldScale(){return this.scale;}get scene(){return this.parent?.scene||this;}
}
class Sprite{static SizeMode={CUSTOM:0};configure(mesh){this.mesh=mesh;}geometryChanged(){}}
class Graphics{clear(){}moveTo(){}lineTo(){}close(){}fill(){}stroke(){}circle(){}roundRect(){}}
class Material{initialize(){}setProperty(){}destroy(){this.destroyed=true;}}
class SpriteFrame{destroy(){this.destroyed=true;}}
class Label{static Overflow={CLAMP:0};static HorizontalAlign={CENTER:0};static VerticalAlign={CENTER:0};}
class Vec4{constructor(...v){this.values=v;}}
class AudioClip extends Asset{static AudioType={DOM_AUDIO:1,MINIGAME_AUDIO:2};loadMode=1;}
const input={on(){},off(){}},cc={Asset,Node,Sprite,Graphics,Material,SpriteFrame,Label,Vec4,Color:Vec4,UITransform,input,Input:{EventType:{KEY_DOWN:'key'}},KeyCode:{ESCAPE:27},screen:{windowSize:{width:1440}},sys:{getSafeAreaRect:()=>({x:0,y:0,width:720,height:1690})},AudioClip,resources:{load:(p,t,cb)=>cb(null,new Asset())}};
const renderer={estimateTarget:(w,h)=>w*h*8,createTarget:(w,h)=>({width:w,height:h,destroy(){this.destroyed=true;}}),create(options,scope){const content=new Node('Surface');scope.own(()=>content.destroy());return {content,ready:Promise.resolve(),layout(){},setActive(){},snapshot(){return {};}};}};
const mods={Engine:{core,lifetime:parent=>new core.Lifetime(parent),meshSprite:()=>Sprite,sharedUI:()=>core.registerUI(cc),renderSurfaces:()=>renderer}};
function load(name){if(mods[name])return mods[name];const exports={};mods[name]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(GAME,'game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:k=>k==='cc'?cc:load(k.slice(2)),console:{info(){},error(){}},setTimeout});return exports;}
// Rendering adapters are substitutes; gameplay, resource admission, ownership,
// actual Page construction/restoration and Application routing remain real.
mods.DarkroomHUD={DarkroomHUD:class{advance(){}resize(){}snapshot(){return {};}}};
mods.DarkroomBubble={DarkroomBubble:class{dismiss(){}show(){}setSafe(){}advance(){}snapshot(){return {};}}};
for(const name of ['LoginPage','ComicPage','HomePage','TravelJournalPage','TravelHomeProps','HomeTravelBridge','TravelService','TravelLoadingPanel','HomeDepartureVisual','LoadingPage','AudioBehavior'])mods[name]={[name]:class{}};
const {GameAssets}=load('Assets'),{DarkroomPage}=load('DarkroomPage'),{Application}=load('Application'),{HomeClock}=load('HomeClock'),{HOME_EFFECTS}=load('HomeLighting'),{DARKROOM_EFFECTS}=load('DarkroomLighting');
const catalog=JSON.parse(fs.readFileSync(path.join(GAME,'resources/source-catalog.json'))),dataCache=new Map();
function makeAssets(){
 const assets=new GameAssets();assets.catalog=catalog;assets.bundle=async name=>({load(p,t,cb){const filename=path.join(GAME,'bundles',name,p+'.json');let json={};if(fs.existsSync(filename)){if(!dataCache.has(filename))dataCache.set(filename,JSON.parse(fs.readFileSync(filename)));json=dataCache.get(filename);}cb(null,new Asset(json));}});
 // Music streaming transport is unrelated to this test, keep the real authored
 // reservation and gate while substituting only native audio construction.
 assets.streamingAudio=async()=>new AudioClip();return assets;
}
async function fixture(){
 const assets=makeAssets(),scope=new core.Lifetime(),homeScope=new core.Lifetime(scope),home=new mods.HomePage.HomePage();home.root=new Node('Home');home.resize=()=>{};home.pause=()=>{};home.resume=()=>{};
 await assets.acquireGroups(['home'],homeScope);await assets.acquireEffects(HOME_EFFECTS,homeScope);
 await assets.acquireResources(['res://home/audio/tracks/day_harp_mouse.mp3','res://home/audio/tracks/night_peaceful_mind.mp3'],homeScope);
 await assets.acquireTransient('gradient',65536,()=>({}),()=>{},homeScope);await assets.acquireResizableTarget('Home',1440,3380,renderer,homeScope);
 const app=Object.create(Application.prototype);Object.assign(app,{assets,scope,homePage:{page:home,scope:homeScope},current:{page:home,scope:homeScope},page:home,root:new Node('App'),height:1690,physicalWidth:1440,active:true,intent:0,entering:false,clock:new HomeClock(),pageViewports:new WeakMap(),viewportKey:'1690:1440'});
 return {app,assets,scope,homeScope,home};
}
function nudge(page){
 page.resume();page.round.select('slipper');page.round.pendingTarget=page.round.rig.worldPoint([240.5,350.5]);page.round.strike();
 for(let i=0;i<31;i++)page.advance(1/60);
 page.lighting.lamp.toggle();page.plaque.motion.press();page.advance(.04);page.pause();
}
function noGPU(value,seen=new Set()){
 if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);assert.ok(!(value instanceof Node||value instanceof Material||value instanceof SpriteFrame||value instanceof Asset),'retained state owns a visual/native resource');for(const k of Object.keys(value))noGPU(value[k],seen);
}
test('Hibernation frees hidden Darkroom resources and target slot, pins actual alpha/data, restores the same round, and never owns GPU objects',async()=>{
 const f=await fixture(),prepared=await f.app.prepareDarkroom(),page=prepared.page;nudge(page);const before=f.assets.snapshot();assert.equal(before.entries,121);
 const hit=page.round.rig.worldPoint([240.5,350.5]),part=page.round.rig.partAt(hit),request=new core.Lifetime(f.scope);await f.app.hibernateDarkroom(request);
 assert.equal(prepared.scope.active,false);assert.equal(page.root.isValid,false);assert.equal(f.app.darkroomPage,null);assert.ok(f.assets.snapshot().entries<before.entries);assert.ok(f.assets.snapshot().reservedBytes<before.reservedBytes);
 const retained=f.app.darkroomRetained;noGPU(retained);assert.equal(retained.round.rig.partAt(hit),part);assert.equal(retained.round.misfortune,80);assert.throws(()=>f.assets.texture('res://darkroom/assets/round2/room_no_plants.png'),/尚未准入/);
 const state=JSON.stringify(retained.round.snapshot()),plumes=plain(retained.plumes),forestPhase=retained.forest.phase,light=plain(retained.lamp),motion=plain(retained.plaqueMotion);
 const recovered=await f.app.prepareDarkroom();assert.equal(recovered.page.round,retained.round);assert.equal(recovered.page.lighting.lamp,retained.lamp);assert.equal(recovered.page.plants.forest,retained.forest);assert.equal(recovered.page.plaque.motion,retained.plaqueMotion);assert.equal(JSON.stringify(retained.round.snapshot()),state);assert.equal(retained.forest.phase,forestPhase);assert.deepEqual(plain(recovered.page.plumes.retain()),plumes);assert.deepEqual(plain(retained.lamp),light);assert.deepEqual(plain(retained.plaqueMotion),motion);
 recovered.page.resume();recovered.page.advance(1/60);assert.equal(recovered.page.round.contacts,1);assert.equal(recovered.page.round.misfortune,80);
 f.app.dispose();assert.equal(f.assets.snapshot().entries,0);assert.equal(f.app.darkroomRetained,null);
});
test('Restored spring, plume, lamp and plaque curves continue exactly like an uninterrupted hidden cache',async()=>{
 const a=await fixture(),b=await fixture(),pa=(await a.app.prepareDarkroom()).page,pb=(await b.app.prepareDarkroom()).page;nudge(pa);nudge(pb);
 await a.app.hibernateDarkroom(new core.Lifetime(a.scope));const restored=(await a.app.prepareDarkroom()).page;
 restored.resume();pb.resume();for(let tick=0;tick<180;tick++){restored.advance(1/60);pb.advance(1/60);assert.deepEqual(plain(restored.round.snapshot()),plain(pb.round.snapshot()));assert.deepEqual(Array.from(restored.round.rig.mesh.vertices),Array.from(pb.round.rig.mesh.vertices));assert.deepEqual(plain(restored.plumes.retain()),plain(pb.plumes.retain()));assert.deepEqual(plain(restored.lighting.lamp),plain(pb.lighting.lamp));assert.deepEqual(plain(restored.plaque.motion),plain(pb.plaque.motion));assert.equal(restored.shadows.retainClock(),pb.shadows.retainClock());for(let i=0;i<21;i++)assert.deepEqual(Array.from(restored.plants.forest.parts[i].mesh.vertices),Array.from(pb.plants.forest.parts[i].mesh.vertices));}
 a.app.dispose();b.app.dispose();
});
test('Releasing during completion still honors replay-on-return and does not pay a second reward',async()=>{
 const f=await fixture(),page=(await f.app.prepareDarkroom()).page;page.resume();page.round.phase='clear_out';page.round.misfortune=0;page.round.completedRounds=4;page.round.roundSerial=5;page.back();page.pause();
 await f.app.hibernateDarkroom(new core.Lifetime(f.scope));const restored=(await f.app.prepareDarkroom()).page;assert.equal(restored.replay,true);restored.resume();assert.equal(restored.round.phase,'active');assert.equal(restored.round.misfortune,100);assert.equal(restored.round.completedRounds,4);assert.equal(restored.round.drainEvents().filter(e=>e.kind==='finished').length,0);f.app.dispose();
});
test('Visible or transitioning rooms cannot be evicted; a cancelled wait never evicts a late preload',async()=>{
 const f=await fixture(),prepared=await f.app.prepareDarkroom();f.app.page=prepared.page;await assert.rejects(f.app.hibernateDarkroom(new core.Lifetime(f.scope)),/visible/);assert.equal(prepared.scope.active,true);
 f.app.page=f.home;f.app.transitioning=prepared.page;await assert.rejects(f.app.hibernateDarkroom(new core.Lifetime(f.scope)),/visible/);f.app.transitioning=null;
 let finish;f.app.darkroomLoading=new Promise(r=>finish=r);const scope=new core.Lifetime(f.scope),wait=f.app.hibernateDarkroom(scope);scope.dispose();finish(prepared);await assert.rejects(wait,/cancelled/i);assert.equal(f.app.darkroomPage,prepared);assert.equal(prepared.scope.active,true);f.app.dispose();
});
test('Interrupted data pinning preserves the old visual cache and does not orphan its temporary data lease',async()=>{
 const f=await fixture(),prepared=await f.app.prepareDarkroom(),before=plain(f.assets.snapshot()),acquire=f.assets.acquireResources.bind(f.assets);let release;f.assets.acquireResources=async(keys,scope)=>{await acquire(keys,scope);await new Promise(r=>release=r);};
 const request=new core.Lifetime(f.scope),pending=f.app.hibernateDarkroom(request);while(!release)await Promise.resolve();request.dispose();release();await assert.rejects(pending,/cancelled/i);assert.equal(prepared.scope.active,true);assert.equal(f.app.darkroomPage,prepared);assert.equal(f.app.darkroomStateScope,undefined);assert.deepEqual(plain(f.assets.snapshot()),before);f.app.dispose();
});
test('Repeated optional-page eviction and restoration stays within original limits and releases every lease at application shutdown',async()=>{
 const f=await fixture(),map=['travel_brush.ttf','travel_paper_v1.png','travel_map_plate_v5.png','travel_offer_person_v5.png','travel_people_v5.png','travel_scene_layers_v1.png','travel_footprint_ink_v1.png','travel_map_actor_v5.png'].map(n=>'res://travel/assets/'+n);
 // Resolve the pinned source names from the catalog; these are the map page's
 // original resources, plus the planned atmospheric effect and two PCM clips.
 const resolved=map.map(k=>{if(catalog.assets[k])return k;throw Error('Map source missing '+k);});
 const prepared=await f.app.prepareDarkroom();const before=plain(f.assets.snapshot());const estimate=resolved.map(key=>({key,bytes:catalog.assets[key].decodedBytes})).concat([{key:'effect:travel-atmosphere',bytes:524288},{key:'travel:chime',bytes:123480},{key:'travel:bell',bytes:34398}]);
 await assert.rejects(f.assets.gate.acquire(estimate,s=>({key:s.key}),()=>{},new core.Lifetime(f.scope)),/budget/);
 let asleep,mapPeak;
 for(let round=0;round<6;round++){const request=new core.Lifetime(f.scope);await f.app.hibernateDarkroom(request);asleep=plain(f.assets.snapshot());await f.assets.gate.acquire(estimate,s=>({key:s.key}),()=>{},request);mapPeak=plain(f.assets.snapshot());assert.ok(mapPeak.entries<=128);assert.ok(mapPeak.reservedBytes<=268435456);request.dispose();await f.app.prepareDarkroom();assert.deepEqual(plain(f.assets.snapshot()),before);}
 assert.equal(f.app.darkroomStateScope.disposers.length,1);f.app.dispose();assert.equal(f.assets.snapshot().entries,0);assert.equal(f.assets.snapshot().reservedBytes,0);console.log('HIBERNATION_BUDGET '+JSON.stringify({before,asleep,mapPeak,pinnedDataBytes:Object.values(catalog.assets).filter(s=>s.bundle==='darkroom'&&['json','mask'].includes(s.kind)).reduce((n,s)=>n+s.decodedBytes,0)}));
});

test('A real Journal request cancelled during optional preload leaves Home usable; retry evicts first and returning restores the saved room',async()=>{
 const f=await fixture(),loadGroups=f.assets.acquireGroups.bind(f.assets);let release;
 f.assets.acquireGroups=async(names,scope)=>{await loadGroups(names,scope);if(names.includes('darkroom'))await new Promise(r=>release=r);};
 const loading=f.app.prepareDarkroom();while(!release)await Promise.resolve();
 Object.assign(f.home,{setTravelLoading(v){this.loading=v;},setInput(){},restoreTravelOffer(){},clearRouteWaiting(){}});
 Object.assign(f.app,{router:{show:async()=>true,cancel(){}},frame:async()=>{},travelLoading:{show(){},hide(){},failure(){assert.fail('Unexpected journal failure');}},travel:{service:{reconcile(){}}}});
 const journalModule=mods.TravelJournalPage;journalModule.JOURNAL_RESOURCES=['travel_brush.ttf','travel_paper_v1.png','travel_diary_plate_v5.png','travel_diary_reference_v5.png','travel_scenery_v1.png','travel_people_v5.png','travel_map_actor_v5.png'].map(n=>'res://travel/assets/'+n);
 journalModule.TravelJournalPage=class{constructor(parent,assets,scope){this.root=new Node('Journal');scope.own(()=>this.root.destroy());}resize(){}resume(){}pause(){}};
 const cancelled=f.app.openJournal('journal');assert.equal(f.app.page,f.home);assert.equal(f.home.loading,true);f.app.cancelJournalLoading();assert.equal(f.home.loading,false);assert.equal(f.app.entering,false);release();const prepared=await loading;await cancelled;assert.equal(prepared.scope.active,true);assert.equal(f.app.darkroomPage,prepared);assert.equal(f.app.page,f.home);
 f.assets.acquireGroups=loadGroups;nudge(prepared.page);const round=prepared.page.round;
 await f.app.openJournal('journal');assert.ok(f.app.page instanceof journalModule.TravelJournalPage);assert.equal(f.app.darkroomPage,null);assert.equal(prepared.scope.active,false);assert.equal(f.app.entering,false);assert.ok(f.assets.snapshot().entries<128);
 await f.app.returnHome();assert.equal(f.app.page,f.home);const restored=await f.app.prepareDarkroom();assert.equal(restored.page.round,round);assert.equal(round.misfortune,80);f.app.dispose();assert.equal(f.assets.snapshot().entries,0);
});

test('A failed visual reconstruction retains model/data leases and retries without resetting progress or leaving a broken cache',async()=>{
 const f=await fixture(),page=(await f.app.prepareDarkroom()).page;nudge(page);await f.app.hibernateDarkroom(new core.Lifetime(f.scope));const before=plain(f.assets.snapshot()),round=f.app.darkroomRetained.round,state=JSON.stringify(round.snapshot()),original=renderer.createTarget;
 renderer.createTarget=()=>{throw Error('simulated GPU allocation failure');};try{await assert.rejects(f.app.prepareDarkroom(),/allocation/);}finally{renderer.createTarget=original;}
 assert.equal(f.app.darkroomPage,null);assert.equal(f.app.darkroomLoading,null);assert.equal(f.app.darkroomRetained.round,round);assert.deepEqual(plain(f.assets.snapshot()),before);assert.equal(JSON.stringify(round.snapshot()),state);
 const restored=await f.app.prepareDarkroom();assert.equal(restored.page.round,round);assert.equal(round.misfortune,80);f.app.dispose();assert.equal(f.assets.snapshot().entries,0);
});
