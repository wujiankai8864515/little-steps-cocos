'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'../../..'),GAME=path.join(ROOT,'games/xiaoyu-cocos/assets'),ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const ctx=vm.createContext({console});vm.runInContext(fs.readFileSync(path.join(ROOT,'engines/travel-core/dist/travel-core.js'),'utf8'),ctx);const core=ctx.LittleStepsCore,queue=[];
class UITransform{setAnchorPoint(){}setContentSize(w,h){this.width=w;this.height=h;}convertToNodeSpaceAR(p){const at=this.node.worldPosition;return {x:p.x-at.x,y:p.y-at.y};}}
class Node{static EventType={TOUCH_START:'down',TOUCH_MOVE:'move',TOUCH_END:'up',TOUCH_CANCEL:'cancel',MOUSE_WHEEL:'wheel'};constructor(name){this.name=name;this.children=[];this.components=new Map();this.events=new Map();this.position={x:0,y:0};this.scale={x:1,y:1};this.active=true;this.angle=0;this.isValid=true;}addChild(n){this.children.push(n);n.parent=this;}addComponent(T){const c=new T();c.node=this;this.components.set(T,c);return c;}getComponent(T){return this.components.get(T);}getChildByName(name){return this.children.find(c=>c.name===name&&c.isValid);}setPosition(x,y){this.position={x,y};}setScale(x,y){this.scale={x,y};}get worldPosition(){const p=this.parent?.worldPosition||{x:0,y:0};return {x:p.x+this.position.x,y:p.y+this.position.y};}get worldScale(){return {x:1,y:1};}get activeInHierarchy(){return this.isValid&&this.active&&(!this.parent||this.parent.activeInHierarchy);}setSiblingIndex(i){const list=this.parent.children;list.splice(list.indexOf(this),1);list.splice(i,0,this);}destroy(){this.isValid=false;for(const n of this.children.slice())n.destroy();if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}on(e,f){const a=this.events.get(e)||[];a.push(f);this.events.set(e,a);}off(e,f){this.events.set(e,(this.events.get(e)||[]).filter(v=>v!==f));}emit(e,id,x=10,y=10){const at=this.worldPosition,event={getID:()=>id,getUILocation:()=>({x:at.x+x,y:at.y-y})};for(const f of this.events.get(e)||[])f(event);return event;}}
class Sprite{static SizeMode={CUSTOM:1};configure(mesh){this.mesh=mesh;assert.ok(mesh.vertices.length/2<=4096);}geometryChanged(){}}
class Label{static Overflow={NONE:0,RESIZE_HEIGHT:1,CLAMP:2};static HorizontalAlign={CENTER:0,LEFT:1};static VerticalAlign={CENTER:0,TOP:1};updateRenderData(){if(this.overflow!==1)return;const ui=this.node.getComponent(UITransform),lines=this.string.split('\n').reduce((n,s)=>n+Math.max(1,Math.ceil(s.length*this.fontSize/ui.width)),0);ui.height=(lines+.26)*this.lineHeight;}}
class Graphics{clear(){}roundRect(){}moveTo(){}lineTo(){}close(){}fill(){}stroke(){}circle(){}}
class Color{constructor(r,g,b,a=255){Object.assign(this,{r,g,b,a});}}class Vec3{constructor(x,y,z){Object.assign(this,{x,y,z});}}class Vec4{constructor(x,y,z,w){Object.assign(this,{x,y,z,w});}}
class Material{properties={};initialize(){}setProperty(k,v){this.properties[k]=v;}destroy(){this.destroyed=true;}}
const audio=[];class AudioSource{static EventType={STARTED:'started',ENDED:'ended'};play(){this.playing=true;this.node.events.get('started')?.forEach(f=>f());}stop(){this.playing=false;}pause(){this.playing=false;}}
const cc={Node,Sprite,UITransform,Label,Graphics,Color,Vec3,Vec4,Material,AudioSource,LabelOutline:class{},UIOpacity:class{},Mask:class{},Director:{EVENT_AFTER_UPDATE:'update'},director:{once:(e,f)=>queue.push(f)},Input:{EventType:{KEY_DOWN:'key'}},input:{on(){},off(){}},KeyCode:{ESCAPE:27}},modules={};
require('./viewport-mocks.cjs').installViewportMocks(cc);
const load=name=>{if(modules[name])return modules[name];const exports={};modules[name]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(GAME,'game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:k=>k==='cc'?cc:load(k.slice(2)),LittleStepsCore:core,console:{info(){},error(){}}});if(name==='Engine')exports.meshSprite=()=>Sprite;return exports;};
const {TravelMapPage,MAP_RESOURCES,MAP_EFFECTS}=load('TravelMapPage'),{TravelService}=load('TravelService'),{HomeClock}=load('HomeClock'),catalog=JSON.parse(fs.readFileSync(path.join(GAME,'resources/source-catalog.json'))),content=JSON.parse(fs.readFileSync(path.join(GAME,'bundles/home/travel/travel_content.json')));
const flush=()=>{while(queue.length)queue.shift()();},plain=v=>JSON.parse(JSON.stringify(v));
async function fixture(seed=1,eventId=''){let at=1000;const service=new TravelService();service.model.content=plain(content);service.wall_clock=()=>at;service.configure('map_page_test',true);assert.equal(service.depart(700,.3,seed),true);at=eventId?1000+service.model.trip().events.find(e=>e.id===eventId).reached_seconds:1040;service.reconcile();const scope=new core.Lifetime(),gate=new core.ResourceGate(),frames=[],root=new Node('App');
 const assets={catalog,art:k=>catalog.assets[k],font:k=>({k}),effect:k=>({k}),audio:k=>({k}),frame(k,scope){assert.ok(MAP_RESOURCES.includes(k),k);const f={k};frames.push(f);scope.own(()=>f.disposed=true);return f;},async acquireTransient(key,bytes,create,dispose,scope){const lease=await gate.acquire([{key,bytes}],create,dispose,scope);return lease.get(key);}};
 const page=await TravelMapPage.create(root,assets,scope,1280,service,new HomeClock(),()=>true,()=>true);page.resume();return {page,service,scope,gate,assets,frames,root,at:v=>at=v};}
const center=r=>[r[0]+r[2]/2,r[1]+r[3]/2];
function click(n){n.emit('down',1);n.emit('up',1);flush();}
function open(f){const e=f.service.model.trip().events[0];click(f.page.controls['event_'+e.uid]);assert.equal(f.page.session.eventUid,e.uid);return e.uid;}
function hold(f){f.page.advance(.25);f.page.advance(.2);assert.equal(f.page.bubble.snapshot().phase,'hold');}
function bubbleClick(f,key,flushNow=true){const b=f.page.bubble,p=center(key==='close'?b.snapshot().close:b.snapshot().choices[key]);f.page.ui.emit('down',10,p[0],p[1]+f.page.offset);f.page.ui.emit('up',10,p[0],p[1]+f.page.offset);if(flushNow)flush();}
test('Actual map page consumes original resources, retained glint geometry and releases every scoped frame/material/audio on exit',async()=>{
 const f=await fixture();assert.ok(f.page.snapshot().controls.includes('back'));assert.equal(f.page.glints.sprite.mesh.vertices.length/2,772);const arrays=f.page.glints.sprite.mesh.vertices,frames=f.frames.length;
 for(let i=0;i<100;i++)f.page.advance(1/60);assert.equal(f.page.glints.sprite.mesh.vertices,arrays);assert.equal(f.frames.length,frames);assert.ok(f.gate.snapshot().reservedBytes<14*1024*1024);
 assert.ok(MAP_RESOURCES.includes('res://travel/assets/travel_offer_person_v5.png'));assert.equal(MAP_RESOURCES.some(p=>p.endsWith('travel_paper_v1.png')),false);assert.equal(MAP_EFFECTS.length,3);
 f.scope.dispose();assert.ok(f.frames.every(x=>x.disposed));assert.equal(f.page.root.isValid,false);assert.equal(f.gate.snapshot().entries,0);assert.equal(f.page.state.disposed,true);
});
test('Original choice pauses only scene motion; button is blocked before reveal, durable save failure retains retry and double tap settles once',async()=>{
 const f=await fixture(),uid=open(f);assert.equal(f.service.route_snapshot().clock_mode,'CHOICE_PAUSED');const age=f.page.state.age;
 bubbleClick(f,0);assert.equal(f.service.model.data.manual_count,0);assert.equal(f.page.session.eventUid,uid);hold(f);assert.equal(f.page.state.age,age);assert.equal(f.page.bubble.snapshot().contentSupported,true);
 const commit=f.service.store.commit.bind(f.service.store);f.service.store.commit=()=>{f.service.store.error='injected_quota';return false;};bubbleClick(f,0);assert.equal(f.page.session.eventUid,uid);assert.equal(f.service.model.data.manual_count,0);assert.ok(f.service.last_error);
 f.service.store.commit=commit;hold(f);bubbleClick(f,0,false);f.page.ui.emit('down',11,400,620);f.page.ui.emit('up',11,400,620);flush();assert.equal(f.page.session.eventUid,'');assert.equal(f.service.model.data.manual_count,1);assert.ok(f.page.session.feedback);assert.equal(f.service.last_error,'');
 f.page.advance(3.99);assert.ok(f.page.session.feedback);f.page.advance(.02);assert.equal(f.page.session.feedback,'');f.scope.dispose();
});
test('Background releases owned manual pause, cancels queued stale choice and resumes elapsed route without changing merit',async()=>{
 const f=await fixture();open(f);hold(f);const merit=f.service.model.data.merit;bubbleClick(f,0,false);f.at(1050);f.page.pause();flush();assert.equal(f.page.session.eventUid,'');assert.equal(f.service.model.data.manual_count,0);assert.equal(f.service.model.data.merit,merit);f.at(1060);assert.equal(f.service.route_snapshot().route_elapsed_seconds,50);const age=f.page.state.age;f.page.advance(10);assert.equal(f.page.state.age,age);f.page.resume();assert.equal(f.page.bubble,null);f.scope.dispose();
});
test('Modal close/outside ignore crossing and other fingers; tall resize cancels capture and preserves the owned choice',async()=>{
 const f=await fixture(),uid=open(f);const p=center(f.page.bubble.snapshot().close);f.page.ui.emit('down',1,p[0],p[1]);f.page.ui.emit('up',2,p[0],p[1]);flush();assert.equal(f.page.session.eventUid,uid);f.page.resize(1690);f.page.ui.emit('up',1,p[0],p[1]+205);flush();assert.equal(f.page.session.eventUid,uid);assert.equal(f.page.canvas.position.y,-205);assert.equal(f.page.ui.position.y,205);
 f.page.ui.emit('down',4,10,10);f.page.ui.emit('move',4,320,700);f.page.ui.emit('move',4,10,10);f.page.ui.emit('up',4,10,10);flush();assert.equal(f.page.session.eventUid,uid);bubbleClick(f,'close');assert.equal(f.page.session.eventUid,'');assert.equal(f.service.route_snapshot().clock_mode,'RUNNING');f.scope.dispose();
});
test('Strict glyph modal disables unsupported choices; long text scroll is clipped, bounded and pointer-owned',()=>{
 const host=new Node('Host'),ui=core.registerUI(cc),events=[],options={bodyRect:[273,464,390,245],padding:[41,30],fontSize:28,minimumFontSize:20,choiceFontSize:21,choiceHeight:58,interactionRect:[57,390,612,343],showClose:true,fontMetrics:{height:1,ascent:.8,descent:.2},hasGlyph:c=>c!=='?',unsupportedText:'Unavailable',onChoice:i=>events.push(i)};
 const bad=ui.choiceBubble(host,{},'Question?', ['A','B'],[323,732],[16,390,688,365],options);bad.advance(.25);bad.advance(.2);const at=center(bad.snapshot().choices[0]);bad.down(1,at);bad.up(1,at);assert.equal(bad.snapshot().contentSupported,false);assert.deepEqual(events,[]);
 const good=ui.choiceBubble(host,{},'Long narrative '.repeat(60), ['A','B'],[323,732],[16,390,688,365],options);good.advance(.25);good.advance(.2);const r=good.snapshot().textRect,point=center(r);good.down(7,point);good.move(8,[point[0],point[1]-100]);assert.equal(good.snapshot().scroll,0);good.move(7,[point[0],point[1]-40]);assert.equal(good.snapshot().scroll,40);good.up(7,[point[0],point[1]-40]);good.scrollBy(Infinity);assert.equal(good.snapshot().scroll,40);good.scrollBy(1e9);assert.equal(good.snapshot().scroll,good.snapshot().textHeight-r[3]);good.scrollBy(-1e9);assert.equal(good.snapshot().scroll,0);assert.ok(good.text.node.parent.getComponent(cc.Mask));
});
class HomePage{constructor(){this.root=new Node('Home');}setTravelLoading(v){this.loading=v;}setInput(){}restoreTravelOffer(){}resume(){}pause(){}clearRouteWaiting(){}resize(){}}
for(const n of ['HomePage','LoginPage','ComicPage','DarkroomPage','TravelJournalPage'])modules[n]={[n]:n==='HomePage'?HomePage:class{}};
const {Application}=load('Application'),deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function appFixture(){const f=await fixture();f.scope.dispose();const scope=new core.Lifetime(),home=new HomePage(),app=Object.create(Application.prototype),requests=[],events=[];Object.assign(app,{scope,active:true,entering:false,intent:0,height:1280,physicalWidth:720,pageViewports:new WeakMap(),page:home,root:new Node('App'),clock:new HomeClock(),gestureSeen:true,music:{isEnabled:()=>true},current:{page:home,scope:new core.Lifetime(scope)},travel:{service:f.service},travelProps:{suspend(){}},travelLoading:{show:t=>events.push(t),hide(){},failure:t=>events.push(t)},router:{cancel(){},show:async()=>true},frame:async()=>{}});app.homePage=app.current;app.assets={...f.assets,acquireResources(keys,owner){const d=deferred();requests.push({...d,keys,owner});return owner.guard(d.promise);},async acquireEffects(keys){assert.deepEqual(Array.from(keys),Array.from(MAP_EFFECTS));}};return {app,scope,home,requests,events};}
test('Real Home map route waits for admission and rejects cancelled/failed late loads; success returns home and disposes the page',async()=>{
 const f=await appFixture();f.app.openTravelPage('comic');assert.equal(f.requests.length,1);assert.deepEqual(Array.from(f.requests[0].keys),Array.from(MAP_RESOURCES));f.app.cancelJournalLoading();f.requests[0].resolve();await new Promise(setImmediate);assert.equal(f.app.page,f.home);assert.equal(f.app.entering,false);
 const bad=f.app.openJournal('map');f.requests[1].reject(Error('network'));await bad;assert.ok(f.events.includes('地图加载失败，再试一次？'));assert.equal(f.requests[1].owner.active,false);f.app.cancelJournalLoading();const success=f.app.openJournal('map');f.requests[2].resolve();await success;assert.ok(f.app.page instanceof TravelMapPage);assert.equal(f.app.entering,false);const page=f.app.page;await f.app.returnHome();assert.equal(f.app.page,f.home);assert.equal(page.root.isValid,false);assert.equal(f.requests[2].owner.active,false);f.scope.dispose();
});

test('Map native signs keep meshes while unchanged and switch admitted density without new frames',async()=>{
 const f=await fixture(),station=f.page.arrival,progress=f.page.progress,frames=f.frames.length,a=station.sprite.mesh,b=progress.sprite.mesh;
 for(let i=0;i<40;i++)f.page.advance(1/60);assert.equal(station.sprite.mesh,a);assert.equal(progress.sprite.mesh,b);assert.equal(station.string,'当前站：临水坡');
 f.page.resize(1280,1440);assert.equal(station.snapshot().density,2);assert.notEqual(station.sprite.mesh,a);assert.equal(f.frames.length,frames);f.page.resize(1690,720);assert.equal(station.snapshot().density,1);assert.equal(f.frames.length,frames);
 f.scope.dispose();assert.equal(station.sprite.spriteFrame,null);assert.ok(f.frames.every(x=>x.disposed));
});

// Find naturally generated trips; do not inject fabricated encounters into the model.
const {TravelModel}=load('TravelModel'),encounterSeeds=new Map();
for(let seed=1;seed<=256&&encounterSeeds.size<content.events.length;seed++){
 const model=new TravelModel();model.content=plain(content);assert.equal(model.begin(1000,seed,700,.3),true);
 for(const event of model.trip().events)if(!encounterSeeds.has(event.id))encounterSeeds.set(event.id,seed);
}
for(const definition of content.events)for(let choice=0;choice<definition.options.length;choice++)test(`Actual ${definition.id} option ${choice}: cancel, retry failed save, single settlement and readonly revisit`,async()=>{
 assert.ok(encounterSeeds.has(definition.id),'A real generated trip covers '+definition.id);
 const f=await fixture(encounterSeeds.get(definition.id),definition.id),event=f.service.model.trip().events.find(e=>e.id===definition.id),uid=event.uid;
 try{
  const enter=()=>{click(f.page.controls['event_'+uid]);assert.equal(f.page.session.eventUid,uid);hold(f);};
  enter();const firstToken=f.page.session.choiceToken,before=plain(f.service.model.data),paused=f.service.route_snapshot().route_elapsed_seconds;
  assert.equal(f.page.bubble.snapshot().contentSupported,true);assert.equal(f.page.bubble.snapshot().choices.length,2);
  f.at(1000+event.reached_seconds+10);f.service.reconcile();f.page.advance(.2);
  assert.equal(f.service.route_snapshot().route_elapsed_seconds,paused);assert.equal(f.service.route_snapshot().clock_mode,'CHOICE_PAUSED');
  bubbleClick(f,'close');assert.equal(f.page.session.eventUid,'');assert.equal(f.service.route_snapshot().clock_mode,'RUNNING');assert.equal(f.service.model.data.manual_count,0);
  enter();assert.notEqual(f.page.session.choiceToken,firstToken);
  const commit=f.service.store.commit.bind(f.service.store);f.service.store.commit=()=>{f.service.store.error='injected_quota';return false;};
  bubbleClick(f,choice);assert.equal(f.page.session.eventUid,uid);assert.equal(f.service.model.data.merit,before.merit);assert.equal(f.service.model.data.manual_count,0);assert.equal(f.service.model.event_by_uid(uid).settled,false);
  f.service.store.commit=commit;hold(f);bubbleClick(f,choice,false);bubbleClick(f,choice,false);flush();
  const after=f.service.model.data,chosen=f.service.model.event_by_uid(uid),option=definition.options[choice];
  assert.equal(chosen.choice,option.id);assert.equal(chosen.source,'manual');assert.equal(chosen.merit_spent,Math.min(before.merit,option.cost));assert.equal(after.merit,before.merit-Math.min(before.merit,option.cost));
  assert.equal(after.manual_count,1);assert.deepEqual(Array.from(after.active.settlement_order),[uid]);assert.equal(after.active.clock_mode,'RUNNING');assert.equal(f.page.session.feedback,option.result);assert.equal(f.service.last_error,'');
  for(const tag of option.tags)assert.equal(after.manual_tags[tag],1);
  const durable=plain(f.service.store.load_state());assert.equal(durable.active.events.find(e=>e.uid===uid).choice,option.id);assert.equal(durable.manual_count,1);
  enter();assert.equal(f.page.bubble.snapshot().contentSupported,true);assert.equal(f.page.bubble.snapshot().choices.length,0);assert.equal(f.service.route_snapshot().clock_mode,'RUNNING');
  bubbleClick(f,'close');assert.equal(f.page.session.eventUid,'');assert.equal(f.service.model.data.manual_count,1);assert.equal(f.service.model.data.merit,after.merit);
 }finally{f.scope.dispose();assert.equal(f.gate.snapshot().entries,0);}
});
