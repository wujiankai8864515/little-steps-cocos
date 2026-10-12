'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const root=path.resolve(__dirname,'../../..'),context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'engines/travel-core/dist/travel-core.js'),'utf8'),context);
const modules={},environments={},platform={LittleStepsCore:context.LittleStepsCore};
for(const name of ['Engine','TravelModel','TravelStore','TravelService']){
 const exports={},environment={...platform,exports,require:key=>key==='cc'?{}:modules[key.slice(2)],Map,Set,console};environments[name]=environment;vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,environment);modules[name]=exports;
}
const {TravelModel:Model}=modules.TravelModel,{TravelStore:Store,TRAVEL_SAVE_PREFIX:PREFIX,TRAVEL_SAVE_MAX_BYTES:MAX,travelRuntimeStorage}=modules.TravelStore,{TravelService:Service}=modules.TravelService;
const plain=value=>JSON.parse(JSON.stringify(value)),content=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/bundles/home/travel/travel_content.json')));
class MemoryStorage {constructor(){this.data=new Map();this.reads=[];this.writes=[];this.fail=false;}getItem(key){this.reads.push(key);return this.data.has(key)?this.data.get(key):null;}setItem(key,value){if(this.fail)throw new Error('quota');this.writes.push(key);this.data.set(key,value);}}
class FailingStore extends Store {failNext=false;commit(state,expected){if(this.failNext){this.failNext=false;this.error='injected_write_failure';return false;}return super.commit(state,expected);}seed(state){this._memory=plain(state);}}
function fresh(){let at=1000;const s=new Service();s.model.content=plain(content);s.store=new FailingStore();s.wall_clock=()=>at;s.configure('test_main',true);assert.equal(s.depart(700,.3,1),true);return {s,at:value=>at=value};}
test('Failed entry/choice/arrival roll back the whole durable transaction; retry and every reward grant apply once',()=>{
 const {s,at}=fresh(),uid=s.model.trip().events[0].uid;at(1040);s.store.failNext=true;assert.equal(s.enter(uid),false);assert.equal(s.model.trip().clock_mode,'RUNNING');assert.equal(s.enter(uid),true);const token=s.model.trip().choice_token;
 at(1070);s.store.failNext=true;assert.equal(s.choose(uid,0,token),false);assert.equal(s.model.data.manual_count,0);assert.equal(s.model.trip().clock_mode,'CHOICE_PAUSED');assert.equal(s.choose(uid,0,token),true);assert.equal(s.choose(uid,0,token),false);
 at(1130);s.store.failNext=true;const before=plain(s.model.data);assert.equal(s.reconcile(),false);assert.deepEqual(plain(s.model.data),before);assert.equal(s.model.data.auto_count,0);assert.equal(s.model.data.journals.length,0);at(1131);assert.equal(s.reconcile(),true);assert.equal(s.model.trip().returned_at,1130);
 assert.equal(s.claim(),true);assert.equal(s.model.data.inventory.length,0);const reward=s.model.trip().rewards[0].uid;s.store.failNext=true;assert.equal(s.start_reward_flight(reward),false);assert.equal(s.model.reward_by_uid(reward).state,'FLOATING');assert.equal(s.start_reward_flight(reward),true);assert.equal(s.start_reward_flight(reward),false);
 const restored=new Service();restored.store=s.store;restored.model.content=plain(content);restored.wall_clock=s.wall_clock;restored.configure('test_main',true);assert.equal(restored.model.reward_by_uid(reward).state,'FLYING');restored.store.failNext=true;assert.equal(restored.complete_reward_flight(reward),false);assert.equal(restored.model.data.inventory.length,0);assert.equal(restored.complete_reward_flight(reward),true);assert.equal(restored.complete_reward_flight(reward),false);assert.equal(restored.model.can_depart(),false);
 for(const item of restored.model.trip().rewards){if(item.state==='FLOATING')restored.start_reward_flight(item.uid);if(item.state==='FLYING')restored.complete_reward_flight(item.uid);}assert.equal(restored.model.can_depart(),true);assert.equal(restored.model.data.inventory.length,restored.model.trip().rewards.length);
 const entry=restored.model.data.journals[0].entries[0],trip=restored.model.trip().id,inventory=plain(restored.model.data.inventory);restored.store.failNext=true;assert.equal(restored.review(trip,entry.uid,entry.options[1].id),false);assert.equal(restored.model.data.review_count,0);assert.equal(restored.review(trip,entry.uid,entry.options[1].id),true);assert.equal(restored.review(trip,entry.uid,entry.options[1].id),false);assert.deepEqual(plain(restored.model.data.inventory),inventory);
});
test('Failed cancellation keeps its original release time, projects without mutation and retries active time',()=>{
 const {s,at}=fresh(),uid=s.model.trip().events[0].uid;at(1040);s.enter(uid);at(1070);s.store.failNext=true;assert.equal(s.cancel_event(),false);const before=plain(s.model.data);at(1080);assert.equal(s.snapshot().route_elapsed_seconds,50);assert.equal(s.snapshot().clock_mode,'RUNNING');assert.equal(s.snapshot().persistence_pending,true);assert.deepEqual(plain(s.model.data),before);assert.equal(s.reconcile(),true);assert.equal(s.model.trip().route_elapsed_seconds,50);assert.equal(s.model.event_by_uid(uid).state,'waiting');assert.equal(s.model.data.manual_count,0);
});
test('Restart releases abandoned ownership, stale writers adopt the newer revision, and stale recovery cannot steal a new token',()=>{
 const {s,at}=fresh(),uid=s.model.trip().events[0].uid;at(1040);s.enter(uid);at(1069);s.reconcile();at(1100);const restore=new Service();restore.store=s.store;restore.wall_clock=s.wall_clock;restore.configure('test_main',true);assert.equal(restore.model.trip().route_elapsed_seconds,71);assert.equal(restore.model.trip().clock_mode,'RUNNING');
 const stale=new Service();stale.store=s.store;stale.wall_clock=s.wall_clock;stale.configure('test_main',true);restore.capture_merit(999);stale.capture_merit(888);assert.equal(stale.last_error,'stale_revision');assert.equal(stale.model.data.merit,999);
 const next=fresh();next.at(1040);const event=next.s.model.trip().events[0].uid;next.s.enter(event);const delayed=new Service();delayed.store=next.s.store;delayed.wall_clock=next.s.wall_clock;next.s.store.failNext=true;delayed.configure('test_main',true);next.at(1070);next.s.cancel_event();next.s.enter(event);const token=next.s.model.trip().choice_token;assert.equal(delayed.reconcile(),false);assert.equal(delayed.last_error,'stale_revision');assert.equal(delayed.model.trip().choice_token,token);delayed.reconcile();assert.equal(delayed.model.trip().choice_token,token);assert.equal(delayed.model.trip().clock_mode,'CHOICE_PAUSED');
});
test('Browser main key is the sole authority; integrity/future/invalid slots/quota fail without resurrecting backups or advancing revisions',()=>{
 const storage=new MemoryStorage(),store=new Store(storage),key=PREFIX+'main',state=Model.fresh();assert.equal(store.commit(state,0),true);assert.equal(state.revision,1);assert.deepEqual(storage.writes,[key]);const envelope=JSON.parse(storage.data.get(key));assert.equal(envelope.sha256,crypto.createHash('sha256').update(envelope.payload).digest('hex'));
 storage.data.set(key+'.bak',storage.data.get(key));storage.data.set(key+'.tmp',storage.data.get(key));storage.data.set(key,'broken');assert.deepEqual(plain(store.load_state()),{});assert.equal(store.error,'invalid_saved_data');assert.equal(storage.reads.some(key=>/\.tmp$|\.bak$/.test(key)),false);
 storage.data.set(key,Store.envelope({...plain(state),schema:99}));assert.deepEqual(plain(store.load_state()),{});assert.equal(store.error,'unsupported_saved_schema');assert.equal(store.commit(state,1),false);assert.equal(state.revision,1);
 storage.data.delete(key);store.slot='../escape';assert.equal(store.commit(Model.fresh(),0),false);assert.equal(store.error,'invalid_slot');store.slot='main';storage.fail=true;const clean=Model.fresh();assert.equal(store.commit(clean,0),false);assert.equal(store.error,'web_write_failed');assert.equal(clean.revision,0);
 const noops=new Store({getItem:()=>null,setItem:()=>{}});assert.equal(noops.commit(Model.fresh(),0),false);assert.equal(noops.error,'web_write_failed');const unavailable=new Store({getItem:()=>undefined,setItem:()=>{}});assert.deepEqual(plain(unavailable.load_state()),{});assert.equal(unavailable.error,'web_read_failed');
});
test('CAS recheck rejects a writer arriving between reads; real adapter exceptions are not hidden',()=>{
 const storage=new MemoryStorage(),key=PREFIX+'main';storage.getItem=function(k){const value=MemoryStorage.prototype.getItem.call(this,k);if(this.reads.length===1)this.data.set(key,Store.envelope({...plain(Model.fresh()),revision:1,merit:888}));return value;};const state=Model.fresh(),store=new Store(storage);assert.equal(store.commit(state,0),false);assert.equal(store.error,'stale_revision');assert.equal(state.revision,0);assert.equal(JSON.parse(JSON.parse(storage.data.get(key)).payload).merit,888);assert.equal(storage.writes.length,0);
 const adapter=travelRuntimeStorage();assert.throws(()=>adapter.getItem(key),/storage_unavailable/);assert.throws(()=>adapter.setItem(key,'x'),/storage_unavailable/);
});
test('Large UTF8 states and prototype-named learned tags are validated by exact byte capacity and preserve all own keys',()=>{
 const storage=new MemoryStorage(),store=new Store(storage),state=Model.fresh();state.manual_tags=JSON.parse('{"__proto__":1,"toString":2}');assert.equal(store.commit(state,0),true);assert.deepEqual(plain(store.load_state().manual_tags),plain(state.manual_tags));const huge=plain(state);huge.extra='雨'.repeat(Math.ceil(MAX/3));assert.equal(Model.valid(huge),true);assert.equal(store.commit(huge,1),false);assert.equal(store.error,'save_capacity');assert.equal(huge.revision,1);assert.equal(store.load_state().revision,1);
});
test('Durable schema1 migration retains all owned rewards and never replays them; blocked corruption refuses departures',()=>{
 const legacy=JSON.parse(fs.readFileSync(path.join(root,'builds/reviews/M07-travel-native-rows-v1.json'))).find(row=>row.label==='migration:claimed').result,storage=new MemoryStorage(),key=PREFIX+'main';storage.data.set(key,Store.envelope(legacy));const s=new Service();s.store=new Store(storage);s.wall_clock=()=>1200;s.configure();assert.equal(s.blocked,false);assert.equal(s.model.data.schema,2);assert.equal(s.store.load_state().schema,2);assert.equal(s.model.trip().claimed,true);assert.equal(s.model.data.inventory.length,legacy.inventory.length);assert.equal(s.open_rewards(),false);
 storage.data.set(key,'corrupt');s.configure();assert.equal(s.blocked,true);assert.equal(s.depart(700,.3,1),false);assert.equal(storage.data.get(key),'corrupt');
});
test('WeChat synchronous adapter distinguishes absent keys from corrupt empty strings and propagates platform errors',()=>{
 const data=new Map(),environment=environments.TravelStore,key=PREFIX+'main';environment.wx={getStorageInfoSync:()=>({keys:Array.from(data.keys())}),getStorageSync:key=>data.get(key)||'',setStorageSync:(key,value)=>data.set(key,value)};
 try {
  const storage=travelRuntimeStorage(),store=new Store(storage);assert.equal(storage.getItem(key),null);assert.equal(store.commit(Model.fresh(),0),true);assert.equal(store.load_state().revision,1);data.set(key,'');assert.deepEqual(plain(store.load_state()),{});assert.equal(store.error,'invalid_saved_data');
  environment.wx.getStorageInfoSync=()=>{throw new Error('read failed');};assert.deepEqual(plain(store.load_state()),{});assert.equal(store.error,'web_read_failed');
  environment.wx.getStorageInfoSync=()=>({keys:[]});environment.wx.setStorageSync=()=>{throw new Error('quota');};const state=Model.fresh();assert.equal(store.commit(state,0),false);assert.equal(store.error,'web_write_failed');assert.equal(state.revision,0);
 }finally{delete environment.wx;}
});
test('Current native Godot envelopes, including full-precision JSON and schema1 owned rewards, decode without data loss',()=>{
 const rows=JSON.parse(fs.readFileSync(path.join(root,'builds/reviews/M07-travel-service-native-envelopes-v1.json')));assert.equal(rows.length,3);
 for(const row of rows){const storage=new MemoryStorage();storage.data.set(PREFIX+'main',row.envelope);const store=new Store(storage),expected=plain(Model.migrate(row.data));assert.deepEqual(plain(store.load_state()),expected,row.label);assert.equal(store.error,'');assert.equal(store.needs_migration,row.data.schema===1);const box=JSON.parse(row.envelope);assert.equal(box.sha256,crypto.createHash('sha256').update(box.payload).digest('hex'));}
});
test('A stale cancellation cannot project a newer owned choice as running, even while storage fails again',()=>{
 const {s,at}=fresh(),uid=s.model.trip().events[0].uid;at(1040);assert.equal(s.enter(uid),true);const oldToken=s.model.trip().choice_token;
 at(1050);const newer=new Service();newer.store=s.store;newer.wall_clock=s.wall_clock;newer.model.content=plain(content);newer.configure('test_main',true);assert.equal(newer.enter(uid),true);const token=newer.model.trip().choice_token;assert.notEqual(token,oldToken);
 at(1060);assert.equal(s.cancel_event(uid,oldToken),false);assert.equal(s.last_error,'stale_revision');assert.equal(s.model.trip().choice_token,token);
 assert.equal(s.route_snapshot().clock_mode,'CHOICE_PAUSED');const elapsed=s.route_snapshot().route_elapsed_seconds;
 s.store.failNext=true;assert.equal(s.reconcile(),false);at(1065);assert.equal(s.route_snapshot().clock_mode,'CHOICE_PAUSED');assert.equal(s.route_snapshot().route_elapsed_seconds,elapsed);assert.equal(s.model.trip().choice_token,token);
 assert.equal(s.reconcile(),true);assert.equal(s.model.trip().choice_token,token);assert.equal(s.model.data.manual_count,0);
 assert.equal(s.choose(uid,0,oldToken),false);assert.equal(s.choose(uid,0,token),true);assert.equal(s.model.data.manual_count,1);
});
test('Reconfiguring from unreadable storage to a valid empty trip clears stale failure status without writing',()=>{
 const storage=new MemoryStorage(),key=PREFIX+'main',s=new Service();s.store=new Store(storage);s.wall_clock=()=>1000;
 storage.data.set(key,'corrupt');s.configure();assert.equal(s.blocked,true);assert.equal(s.last_error,'invalid_saved_data');
 storage.data.set(key,Store.envelope({...plain(Model.fresh()),revision:7}));const before=storage.data.get(key),writes=storage.writes.length;s.configure();
 assert.equal(s.blocked,false);assert.equal(s.last_error,'');assert.equal(s.route_snapshot().persistence_pending,false);assert.equal(s.model.data.revision,7);assert.equal(storage.data.get(key),before);assert.equal(storage.writes.length,writes);
});
