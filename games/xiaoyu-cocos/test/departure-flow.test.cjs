'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../../engines/travel-core/dist/travel-core.js'),'utf8'),context);const core=context.LittleStepsCore;
const modules={};for(const name of ['Engine','TravelModel','TravelStore','TravelService','DepartureFlow','HomeTravelBridge']){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:key=>key==='cc'?{}:modules[key.slice(2)],LittleStepsCore:core,Map,Set,console});modules[name]=exports;}
const {TravelService}=modules.TravelService,{DepartureFlow}=modules.DepartureFlow,content=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/bundles/home/travel/travel_content.json')));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function setup(){
 const service=new TravelService(),owner=new core.Lifetime(),requests=[],events=[];let at=1000,interactive=true,failSave=false,failVisual=false,unloaded=0;
 service.model.content=content;service.wall_clock=()=>at;service.configure('departure_test',true);
 const commit=service.store.commit.bind(service.store);service.store.commit=(state,revision)=>{if(failSave){service.store.error='injected_write_failure';return false;}return commit(state,revision);};
 const port={canInteract:()=>interactive,merit:()=>700,fatigue:()=>.3,prepare:scope=>{const d=deferred();requests.push({scope,...d});scope.own(()=>unloaded++);return d.promise;},showLoading:()=>events.push('loading'),hideLoading:()=>events.push('hide'),loadingFailed:()=>events.push('load-error'),restoreOffer:()=>events.push('restore-offer'),openExisting:mode=>events.push(mode),begin:(scope,text)=>{assert.equal(service.store.load_state().active.status,'traveling','visual must follow durable commit');assert.ok(text);events.push('begin');if(failVisual)throw Error('injected view failure');},finish:()=>events.push('finish'),syncWorld:()=>events.push('sync'),visualFailed:()=>events.push('visual-error')};
 const flow=new DepartureFlow(service,port,owner);return {service,owner,requests,events,flow,port,setTime:v=>at=v,setInteractive:v=>interactive=v,setSaveFailure:v=>failSave=v,setVisualFailure:v=>failVisual=v,unloaded:()=>unloaded};
}
test('Repeated confirmation owns one load and one durable trip; cancelling before ready rejects late success',async()=>{
 const f=setup();assert.equal(f.flow.request(),true);const pending=f.flow.pending;assert.equal(f.flow.request(),true);assert.equal(f.requests.length,1);assert.equal(f.service.model.data.sequence,0);assert.equal(f.flow.cancelLoading(),true);assert.equal(f.requests[0].scope.active,false);f.requests[0].resolve();await pending;
 assert.equal(f.service.model.data.sequence,0);assert.equal(f.events.includes('begin'),false);assert.equal(f.unloaded(),1);assert.equal(f.flow.phase,'idle');f.owner.dispose();assert.equal(f.unloaded(),1);
});
test('A failed load may retry; a late result from an older generation cannot hide or fail the new panel',async()=>{
 const f=setup();f.flow.request();f.requests[0].reject(Error('offline'));await f.flow.pending;assert.equal(f.flow.phase,'failed');assert.equal(f.events.at(-1),'load-error');assert.equal(f.unloaded(),1);
 f.flow.request();const old=f.flow.pending;f.flow.cancelLoading();f.flow.request();const current=f.flow.pending,events=f.events.length;f.requests[1].reject(Error('old offline'));await old;assert.equal(f.events.length,events);assert.equal(f.flow.phase,'loading');f.requests[2].resolve();await current;
 assert.equal(f.service.model.data.sequence,1);assert.equal(f.events.filter(x=>x==='begin').length,1);assert.equal(f.requests[2].scope.active,true);assert.equal(f.flow.cancelLoading(),false);f.flow.request();assert.equal(f.requests.length,3);f.flow.finish();assert.equal(f.unloaded(),3);f.owner.dispose();
});
test('Write failure leaves no trip or animation, releases prepared art and restores the offer; retry commits once',async()=>{
 const f=setup();f.setSaveFailure(true);f.flow.request();f.requests[0].resolve();await f.flow.pending;assert.equal(f.service.model.data.sequence,0);assert.equal(f.events.includes('begin'),false);assert.equal(f.events.filter(x=>x==='restore-offer').length,1);assert.equal(f.unloaded(),1);assert.equal(f.flow.phase,'idle');
 f.setSaveFailure(false);f.flow.request();f.requests[1].resolve();await f.flow.pending;assert.equal(f.service.model.data.sequence,1);assert.equal(f.events.filter(x=>x==='begin').length,1);f.flow.finish();assert.equal(f.flow.finish(),false);assert.equal(f.events.filter(x=>x==='finish').length,1);assert.equal(f.unloaded(),2);f.owner.dispose();
});
test('Foreground recovery uses wall-clock state without replaying departure; parent destruction prevents late entry',async()=>{
 const f=setup();f.flow.request();f.requests[0].resolve();await f.flow.pending;f.flow.suspend();assert.equal(f.flow.phase,'idle');assert.equal(f.unloaded(),1);f.setTime(1050);f.flow.resume();assert.equal(f.service.snapshot().route_elapsed_seconds,50);assert.equal(f.events.filter(x=>x==='begin').length,1);assert.equal(f.flow.request(),false);assert.equal(f.events.at(-1),'comic');
 f.setTime(1100);f.flow.resume();assert.equal(f.service.model.trip().status,'returned');assert.equal(f.flow.request(),false);assert.equal(f.events.at(-1),'rewards');f.owner.dispose();assert.equal(f.flow.request(),false);
 const late=setup();late.flow.request();late.owner.dispose();late.requests[0].resolve();await late.flow.pending;assert.equal(late.service.model.data.sequence,0);assert.equal(late.events.includes('begin'),false);assert.equal(late.unloaded(),1);
});
test('A post-commit visual failure preserves the saved trip and releases art; it cannot silently replay the farewell',async()=>{
 const f=setup();f.setVisualFailure(true);f.flow.request();f.requests[0].resolve();await f.flow.pending;assert.equal(f.service.model.trip().status,'traveling');assert.equal(f.service.store.load_state().active.status,'traveling');assert.equal(f.flow.phase,'idle');assert.equal(f.unloaded(),1);assert.equal(f.events.includes('visual-error'),true);assert.equal(f.flow.request(),false);assert.equal(f.events.filter(x=>x==='begin').length,1);f.owner.dispose();
});
test('Disabled input cannot request resources or change a saved trip',()=>{const f=setup();f.setInteractive(false);assert.equal(f.flow.request(),false);assert.equal(f.requests.length,0);assert.equal(f.service.model.data.sequence,0);f.owner.dispose();});

test('Already-owned loading stays idempotent after the panel blocks Home input; idle cancellation does not repeat restoration',async()=>{
 const f=setup();f.flow.request();f.setInteractive(false);assert.equal(f.flow.request(),true);assert.equal(f.requests.length,1);f.flow.cancelLoading();const count=f.events.filter(x=>x==='restore-offer').length;assert.equal(f.flow.cancelLoading(),false);assert.equal(f.events.filter(x=>x==='restore-offer').length,count);f.requests[0].resolve();await f.flow.pending;f.owner.dispose();
});
test('A declined visual is reported after commit; thrown visual cleanup still releases the resource scope and synchronizes',async()=>{
 const f=setup();f.port.begin=()=>false;f.flow.request();f.requests[0].resolve();await f.flow.pending;assert.equal(f.service.store.load_state().active.status,'traveling');assert.equal(f.events.includes('visual-error'),true);assert.equal(f.unloaded(),1);f.owner.dispose();
 const g=setup();g.flow.request();g.requests[0].resolve();await g.flow.pending;g.port.finish=()=>{throw Error('view cleanup');};assert.throws(()=>g.flow.finish(),/view cleanup/);assert.equal(g.flow.phase,'idle');assert.equal(g.unloaded(),1);assert.equal(g.events.at(-1),'sync');g.owner.dispose();
});

const {HomeTravelBridge}=modules.HomeTravelBridge;
function bridgeSetup(existing){
 const service=new TravelService(),owner=new core.Lifetime(),requests=[],events=[];
 if(existing)service.store=existing;
 service.model.content=content;let time=1000,merit=17,canInteract=true,notice=true,visual=false;
 service.wall_clock=()=>time;
 const home={canInteract:()=>canInteract,noticeAvailable:()=>notice,merit:()=>merit,fatigue:()=>.3,setMerit:v=>{merit=v;events.push(['merit',v]);},syncTravel:(away,full,departing)=>events.push(['world',away,full,departing]),prepare:scope=>{const d=deferred();requests.push({...d,scope});return d.promise;},showLoading:()=>events.push(['loading']),hideLoading:()=>events.push(['hide']),loadingFailed:()=>events.push(['failed']),restoreOffer:()=>events.push(['restore']),begin:()=>{visual=true;events.push(['begin']);return true;},finish:()=>{visual=false;events.push(['finish']);},info:text=>{notice=false;events.push(['notice',text]);},openExisting:mode=>events.push(['open',mode]),visualFailed:error=>events.push(['visual-error',error])};
 const bridge=new HomeTravelBridge(service,home,owner);bridge.configure('bridge_test',true);
 return {bridge,service,owner,requests,events,home,time:v=>time=v,interactive:v=>canInteract=v,notice:v=>notice=v,merit:()=>merit,visual:()=>visual};
}
test('Actual Home bridge keeps first-session merit, marks the synchronous commit as departing and observes later merit',async()=>{
 const f=bridgeSetup();assert.equal(f.merit(),17);assert.equal(f.bridge.flow.request(),true);f.requests[0].resolve();await f.bridge.flow.pending;
 const begin=f.events.findIndex(e=>e[0]==='begin'),world=f.events.findIndex(e=>e[0]==='world'&&e[1]===true);
 assert.ok(world<begin);assert.equal(f.events[world][3],true,'world must not hide the native actor before begin');assert.equal(f.service.store.load_state().merit,17);
 f.bridge.flow.finish();f.bridge.observeMerit(31);assert.equal(f.service.store.load_state().merit,31);assert.equal(f.merit(),31);f.owner.dispose();
});
test('Existing saved travel restores without a farewell and terminal return/notice happens once even across repeated foreground events',async()=>{
 const f=bridgeSetup();f.bridge.flow.request();f.requests[0].resolve();await f.bridge.flow.pending;f.owner.dispose();
 const g=bridgeSetup(f.service.store);assert.equal(g.events.some(e=>e[0]==='begin'),false);assert.equal(g.requests.length,0);assert.equal(g.events.find(e=>e[0]==='world')[1],true);
 g.interactive(false);g.notice(false);g.time(1100);g.bridge.resume();assert.equal(g.service.model.trip().status,'returned');assert.equal(g.service.model.data.journals.length,1);
 const rev=g.service.model.data.revision;g.bridge.resume();g.bridge.advance(.2);assert.equal(g.service.model.data.revision,rev);assert.equal(g.events.some(e=>e[0]==='notice'),false);
 g.interactive(true);g.notice(true);g.bridge.advance(.2);assert.equal(g.events.filter(e=>e[0]==='notice').length,1);assert.match(g.events.at(-1)[1],/回来啦/);g.notice(true);g.bridge.advance(.2);assert.equal(g.events.filter(e=>e[0]==='notice').length,1);g.owner.dispose();
});
test('Home bridge defers persistence warnings until local input/note is free and cancels in-flight art on app hide',async()=>{
 const f=bridgeSetup();f.bridge.flow.request();const old=f.bridge.flow.pending;f.bridge.suspend();f.requests[0].resolve();await old;assert.equal(f.service.model.data.sequence,0);assert.equal(f.requests[0].scope.active,false);
 f.service.store.commit=()=>{f.service.store.error='quota';return false;};f.bridge.flow.request();f.requests[1].resolve();await f.bridge.flow.pending;assert.equal(f.bridge.snapshot().warningPending,true);assert.equal(f.visual(),false);
 f.notice(false);f.bridge.advance(.2);assert.equal(f.events.some(e=>e[0]==='notice'),false);f.notice(true);f.bridge.advance(.2);assert.match(f.events.at(-1)[1],/保存暂时不可用/);f.notice(true);f.bridge.advance(.2);assert.equal(f.events.filter(e=>e[0]==='notice').length,1);
 f.owner.dispose();const length=f.events.length;f.bridge.resume();f.bridge.observeMerit(900);f.bridge.advance(1);assert.equal(f.events.length,length);
});

// Run the real Home state adapter without constructing the GPU scene. Only
// node/visual effects are instrumented; the transition method is production.
const homeExports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game/HomePage.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:homeExports,require:()=>({}),console});
function homeState(){
 const log=[],h=Object.create(homeExports.HomePage.prototype);
 Object.assign(h,{travelAway:false,travelFull:false,departure:null,actorProjectionAlpha:1,pointerBinding:{cancel:()=>log.push('pointer')},props:{cancel:()=>log.push('props')},fish:{cancel:()=>log.push('fish')},bag:{cancel:()=>log.push('bag')},feedback:{clear:()=>log.push('feedback')},knock:{stop:()=>log.push('stop')},propVisuals:{marks:{clear:()=>log.push('marks')}},rig:{root:{active:true},suspend:()=>log.push('suspend')},backpack:{proxy:{active:true},projectionAlpha:1}});
 h.restoreReturnedActor=()=>{log.push('returned');h.travelAway=false;};return {h,log};
}
test('Home does not conceal or latch the actor during synchronous departure commit, but a restored away trip hides actor and bag',()=>{
 const {h,log}=homeState();h.syncTravelState(true,false,true);assert.equal(h.travelAway,false);assert.equal(h.rig.root.active,true);assert.equal(log.length,0);
 h.syncTravelState(true,false,false);assert.equal(h.travelAway,true);assert.equal(h.rig.root.active,false);assert.equal(h.backpack.proxy.active,false);assert.equal(h.actorProjectionAlpha,0);assert.equal(h.backpack.projectionAlpha,0);assert.ok(log.includes('pointer'));
 const cancelled=log.filter(x=>x==='pointer').length;h.syncTravelState(true,false,false);assert.equal(log.filter(x=>x==='pointer').length,cancelled);
 h.syncTravelState(false,true,false);assert.equal(h.rig.root.active,true);assert.equal(h.actorProjectionAlpha,1);assert.equal(h.backpack.proxy.active,false);assert.equal(log.filter(x=>x==='returned').length,1);
 h.syncTravelState(false,true,false);assert.equal(log.filter(x=>x==='returned').length,1);h.syncTravelState(false,false,false);assert.equal(h.backpack.proxy.active,true);assert.equal(h.backpack.projectionAlpha,1);
});
