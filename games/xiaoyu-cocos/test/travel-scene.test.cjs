'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const root=path.resolve(__dirname,'../../..'),modules={},context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'engines/travel-core/dist/travel-core.js'),'utf8'),context);
for(const name of ['Engine','TravelModel','TravelStore','TravelService','TravelSceneData','TravelSceneState','TravelEncounterSession']){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:key=>key==='cc'?{}:modules[key.slice(2)],LittleStepsCore:context.LittleStepsCore,console});modules[name]=exports;}
const {TravelSceneState,routePosition,travelLight,encounterStar,synthesizeBell,narrativeMapping}=modules.TravelSceneState,{TravelEncounterSession}=modules.TravelEncounterSession,{TravelService}=modules.TravelService;
const oracle=JSON.parse(fs.readFileSync(path.join(root,'migration/reviews/M07-travel-scene-native-v1.json'))),max={error:0,path:''};
function near(actual,expected,label='root'){
 if(typeof expected==='number'){assert.equal(typeof actual,'number',label);const error=Math.abs(actual-expected);if(error>max.error)Object.assign(max,{error,path:label});assert.ok(error<.0006,`${label}: ${actual} != ${expected} (absolute error ${error})`);return;}
 if(expected&&typeof expected==='object'){assert.ok(actual,label);for(const key of Object.keys(expected))near(actual[key],expected[key],label+'.'+key);return;}
 assert.equal(actual,expected,label);
}
function toTime(scene,seconds){while(scene.age<seconds-1e-8)scene.advance(Math.min(1/60,seconds-scene.age));}
test('Native Godot scene export: all 201 smooth-route points and 14 day/night snapshots match',()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(modules.TravelSceneData.TRAVEL_SCENE)),oracle.config);
 for(const r of oracle.route)near(routePosition(r.fraction),r.at,'route.'+r.fraction);
 for(const r of oracle.light)near(travelLight(r.hour),r,'light.'+r.hour);
 for(let i=0;i<=10;i++)near(routePosition(i/10),oracle.config.route.nodes[i].at,'exact station '+i);
 const mapping=narrativeMapping({cells:[{place:{name:'随机叙事地点'}}]},6);assert.equal(mapping.node_name,'秋叶寺');assert.equal(mapping.story_place,'随机叙事地点');
});
test('Native Godot 120-second spring/cloud/leaf/bell trajectory and queued footprint arrivals match',()=>{
 const scene=new TravelSceneState();for(const expected of oracle.motion){toTime(scene,expected.age);const actual=scene.snapshot();actual.leaves=scene.leaves.map((_,i)=>scene.leafPose(i));near(actual,expected,'motion.'+expected.age);}
 scene.updateRoute(.35,true);const age=scene.age;scene.advance(.1);assert.equal(scene.age,age);scene.updateRoute(.35,false);scene.clockActive=false;scene.advance(.1);assert.equal(scene.age,age);scene.clockActive=true;
 scene.seedRoute(.25);scene.updateRoute(.51,false);for(const expected of oracle.footprints){toTime(scene,expected.age);expected.poses.forEach((pose,i)=>near(scene.footprintPose(i),pose,`footprints.${expected.elapsed}.${i}`));}
 scene.updateRoute(.1,false);assert.equal(scene.footprintPose(2).visible,false);scene.dispose();assert.equal(scene.leaves.length,0);assert.equal(scene.active,false);scene.advance(.1);assert.equal(scene.age,oracle.footprints.at(-1).age);
});
test('Native Godot 48 convergence glints preserve timed trajectories at both viewport heights',()=>{
 for(const group of oracle.flow)group.poses.forEach((pose,i)=>near(encounterStar(i,group.time,group.target,[720,group.height]),pose,`flow.${group.height}.${group.time}.${i}`));
});
test('Both bounded synthesized bell sounds match native Godot PCM bytes exactly',()=>{
 oracle.pcm.forEach((row,i)=>{const {rate,samples}=synthesizeBell(row.values),bytes=Buffer.alloc(samples.length*2);samples.forEach((v,k)=>bytes.writeInt16LE(v,k*2));assert.equal(rate,row.rate);assert.equal(bytes.length,row.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),row.sha256);assert.deepEqual(bytes,fs.readFileSync(path.join(root,`migration/reviews/M07-travel-scene-native-v1.json.${i}.pcm`)));});
});
test('Scene audio obeys gesture, mute, pause, cooldown and nonoverlapping bell/cue ownership',()=>{
 let enabled=true,gesture=false;const live=new Set(),events=[];
 const sound={enabled:()=>enabled,gestureSeen:()=>gesture,playing:k=>live.has(k),play(k,db){assert.equal(live.size,0);live.add(k);events.push({kind:k,db});},stop(k){live.delete(k);}};
 const scene=new TravelSceneState(undefined,sound);assert.equal(scene.announceEncounter(),false);gesture=true;assert.equal(scene.announceEncounter(),true);assert.equal(scene.announceEncounter(),false);scene.setActive(false);assert.equal(live.size,0);const age=scene.age;scene.advance(1);assert.equal(scene.age,age);scene.setActive(true);
 for(let i=0;i<900;i++){scene.advance(1/60);if(i%120===0)live.clear();}assert.ok(scene.contacts>0);assert.ok(events.some(e=>e.kind==='bell'&&e.db===-12));
 enabled=false;scene.advance(.01);assert.equal(live.size,0);assert.equal(scene.announceEncounter(),false);enabled=true;scene.updateRoute(.4,true);assert.equal(scene.announceEncounter(),false);scene.dispose();assert.equal(live.size,0);
});
function encounter(){let at=1000;const service=new TravelService();service.model.content=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/bundles/home/travel/travel_content.json')));service.wall_clock=()=>at;service.configure('encounter_tests',true);assert.equal(service.depart(700,.3,1),true);at=1040;service.reconcile();return {service,session:new TravelEncounterSession(service),at:v=>at=v};}
test('Encounter selection pauses route time, handles save retry, charges only once and retains decided review',()=>{
 const f=encounter(),uid=f.service.model.trip().events[0].uid;assert.equal(f.session.enter(uid),true);const token=f.session.choiceToken,commit=f.service.store.commit.bind(f.service.store);assert.equal(f.session.ownsChoice(),true);f.at(1060);assert.equal(f.service.route_snapshot().route_elapsed_seconds,40);
 f.service.store.commit=()=>{f.service.store.error='injected_write_failure';return false;};assert.equal(f.session.choose(0,uid,token),'failed');assert.equal(f.session.eventUid,uid);assert.equal(f.service.model.data.manual_count,0);f.service.store.commit=commit;
 assert.equal(f.session.choose(0,uid,token),'chosen');assert.equal(f.service.model.data.manual_count,1);const merit=f.service.model.data.merit;assert.equal(f.session.choose(0,uid,token),'ignored');assert.equal(f.service.model.data.merit,merit);assert.ok(f.session.feedback);
 f.session.advance(3.99);assert.ok(f.session.feedback);f.session.advance(.02);assert.equal(f.session.feedback,'');assert.equal(f.session.enter(uid),true);assert.equal(f.session.event.state,'decided');assert.equal(f.session.choose(1),'ignored');assert.equal(f.session.back(),'panel');assert.equal(f.session.back(),'close');
});
test('Encounter cancellation/stale callbacks cannot release or choose a newer token; failed cancellation keeps its original resume time',()=>{
 const f=encounter(),uid=f.service.model.trip().events[0].uid;f.session.enter(uid);const oldToken=f.session.choiceToken;f.at(1050);assert.equal(f.session.suspend(),true);assert.equal(f.session.eventUid,'');assert.equal(f.session.enter(uid),true);const newToken=f.session.choiceToken;assert.notEqual(newToken,oldToken);assert.equal(f.session.choose(0,uid,oldToken),'ignored');assert.equal(f.session.ownsChoice(),true);
 const stale=new TravelEncounterSession(f.service);stale.eventUid=uid;stale.choiceToken=oldToken;assert.equal(stale.releaseChoice(),true);assert.equal(f.service.model.trip().choice_token,newToken);
 const commit=f.service.store.commit.bind(f.service.store);f.service.store.commit=()=>{f.service.store.error='quota';return false;};f.at(1070);assert.equal(f.session.suspend(),true);assert.equal(f.session.eventUid,'');f.at(1080);assert.equal(f.service.route_snapshot().route_elapsed_seconds,50);f.service.store.commit=commit;f.service.reconcile();assert.equal(f.service.model.trip().route_elapsed_seconds,50);assert.equal(f.service.model.data.manual_count,0);
});
test('Scene equations reject nonfinite frame deltas and declared data has bounded population',()=>{
 const scene=new TravelSceneState();scene.advance(NaN);scene.advance(Infinity);scene.advance(-1);assert.equal(scene.age,0);assert.equal(scene.leaves.length,18);assert.equal(scene.routeSamples.length,10);scene.routeSamples.forEach(points=>assert.equal(points.length,33));
 console.info('[Travel scene native numeric maximum]',JSON.stringify(max));
});
