'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const root=path.resolve(__dirname,'../../..'),context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'engines/travel-core/dist/travel-core.js'),'utf8'),context);
const exportsEngine={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game/Engine.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports:exportsEngine,require:()=>({}),LittleStepsCore:context.LittleStepsCore});
const exportsModel={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game/TravelModel.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports:exportsModel,require:()=>exportsEngine,Map,Set});
const Model=exportsModel.TravelModel,plain=value=>JSON.parse(JSON.stringify(value));
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/resources/source-catalog.json'))),spec=catalog.assets['res://travel/travel_content.json'];
const content=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/bundles',spec.bundle,spec.path+'.json')));
const reference=new Map(JSON.parse(fs.readFileSync(path.join(root,'builds/reviews/M07-travel-native-rows-v1.json'))).map(row=>[row.label,row]));
function fresh(seed=1){const m=new Model();m.content=plain(content);assert.equal(m.begin(1000,seed,700,.3),true);return m;}
function row(label,m,result=null){const expected=reference.get(label);assert.ok(expected,label+' native reference');assert.deepEqual(plain(m.data),expected.data,label+' entire source data');assert.deepEqual(plain(result),expected.result,label+' result');assert.equal(Model.valid(m.data),expected.valid,label+' source validity');}
test('Eight current native Godot plans and terminal transactions retain every route, event, reward and diary value',()=>{
 for(const seed of [0,1,2,7,31,42,65536,2147483646]){const m=fresh(seed);row('initial:'+seed,m);m.reconcile(1099.999);row('preterminal:'+seed,m);m.reconcile(1100);row('terminal:'+seed,m);const before=plain(m.data);assert.equal(m.reconcile(99999),false);assert.deepEqual(plain(m.data),before);}
});
test('Native manual pause, terminal delay, individual grants, explicit learning and schema1 migration match the whole45-row oracle',()=>{
 const m=fresh(1),uid=m.trip().events[0].uid;row('manual:enter',m,m.enter_event(uid,1040));const token=m.trip().choice_token;
 m.reconcile(1070);row('manual:paused',m);row('manual:choose',m,m.choose(uid,0,1070,token));row('manual:duplicate',m,m.choose(uid,0,1070,token));m.reconcile(1129.999);row('manual:preterminal',m);m.reconcile(1130);row('manual:terminal',m);
 row('reward:open',m,m.open_rewards());const reward=m.trip().rewards[0].uid;row('reward:start',m,m.start_reward_flight(reward,1131));row('reward:complete',m,m.complete_reward_flight(reward,1132));row('reward:duplicate',m,m.complete_reward_flight(reward,1133));
 for(const item of m.trip().rewards){if(item.state==='FLOATING')m.start_reward_flight(item.uid,1134);if(item.state==='FLYING')m.complete_reward_flight(item.uid,1135);}row('reward:all',m);
 const journal=m.data.journals[0],event=journal.entries[0],preferred=event.options[1].id;row('review:first',m,m.review(journal.trip_id,event.uid,preferred));row('review:duplicate',m,m.review(journal.trip_id,event.uid,preferred));
 const legacy=reference.get('migration:claimed').result;m.data=Model.migrate(plain(legacy));row('migration:claimed',m,legacy);
});
test('Native cancellation tokens, abandoned choice recovery, rollback and offline overshoot are identical',()=>{
 let m=fresh(1),uid=m.trip().events[0].uid;m.enter_event(uid,1040);const token=m.trip().choice_token;row('cancel:release',m,m.cancel_event(uid,1070,token));row('cancel:reopen',m,m.enter_event(uid,1070));row('cancel:stale',m,m.choose(uid,0,1070,token));m.cancel_event(uid,1070);m.reconcile(1130);row('cancel:terminal',m);
 m=fresh(1);uid=m.trip().events[0].uid;m.enter_event(uid,1040);m.reconcile(1069);m.recover_session(1100);row('recovery:abandoned',m);
 m=fresh(7);m.reconcile(1055);m.reconcile(1030);row('clock:rollback',m);m.reconcile(2000);row('clock:overshoot',m);
});
test('Boundary100 wins entry;99.999 owns its pause, partial rewards block departure and malformed nested saves fail safely',()=>{
 const before=fresh(),uid=before.trip().events[0].uid;assert.equal(before.enter_event(uid,1099.999),true);before.reconcile(1200);assert.equal(before.trip().status,'traveling');before.cancel_event(uid,1200);before.reconcile(1200.0011);assert.equal(before.trip().status,'returned');
 const exact=fresh();assert.equal(exact.enter_event(exact.trip().events[0].uid,1100),false);assert.equal(exact.trip().status,'returned');assert.equal(exact.can_depart(),false);assert.equal(exact.claim_rewards(),true);assert.equal(exact.data.inventory.length,0);assert.equal(exact.can_depart(),false);
 const broken=plain(exact.data);broken.active.events[0].options=[{id:'broken'}];assert.equal(Model.valid(broken),false);assert.deepEqual(plain(Model.migrate(broken)),{});for(const value of [null,[],{},false,{schema:{}},{schema:Infinity},{schema:99}])assert.deepEqual(plain(Model.migrate(value)),{});
});
test('Source dictionary tags do not inherit JavaScript prototype values or overwrite their prototype',()=>{
 const m=fresh(),uid=m.trip().events[0].uid;m.enter_event(uid,1040);const event=m.event_by_uid(uid);event.options[0].tags=['__proto__','toString'];assert.ok(m.score_options(event).scores.every(Number.isFinite));assert.equal(m.choose(uid,0,1040),true);assert.deepEqual(plain(m.data.manual_tags),JSON.parse('{"__proto__":1,"toString":1}'));assert.equal(Model.valid(m.data),true);
});
