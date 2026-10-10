const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const context=vm.createContext({Float32Array,Uint16Array,console});
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../../engines/travel-core/dist/travel-core.js'),'utf8'),context);
const core=context.LittleStepsCore,loaded={};
function load(name){if(loaded[name])return loaded[name];const exports=loaded[name]={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports,require:n=>load(n.slice(2)),Math,Number,Float32Array,Float64Array,Uint16Array});return exports;}
const {IncenseState,IncenseStore,validBurn}=load('IncenseState'),{IncenseSmoke,incenseFlame}=load('IncenseSmoke'),{SessionMerit}=load('MeritFeedback');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(slot,duration=30,storage){let wall=1000,tick=0;const values=new Map(),adapter=storage||{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},checkpoint=new core.CheckpointStore(adapter),store=new IncenseStore(checkpoint),state=new IncenseState(store,()=>wall,()=>tick,slot,duration);return {state,store,checkpoint,values,adapter,set(w,t){wall=w;tick=t;},advance(s){wall+=s;tick+=s*1000;state.advanceClock();},wall:()=>wall,tick:()=>tick};}
function generation(revision,remaining=25){return {schema:1,revision,duration:30,remaining,burn_count:1,started_unix:1000,deadline_unix:1030,saved_unix:1005};}
test('Checkpoint SHA-256 matches independent Node vectors, including multi-block Unicode and invalid UTF-16',()=>{
 for(const input of ['', 'abc', 'a'.repeat(1000), '点击燃香🌙'.repeat(35), '\ud800a\udc00'])assert.equal(core.checkpointSHA256(input),crypto.createHash('sha256').update(input,'utf8').digest('hex'));
 const f=fixture('sha_vectors'),payload='{"schema":1,"message":"燃香🌙"}',envelope=JSON.stringify({payload,sha256:crypto.createHash('sha256').update(payload).digest('hex')});
 assert.equal(f.checkpoint.decode(envelope).message,'燃香🌙');assert.equal(f.checkpoint.decode(envelope.replace('燃香','失效')),null);assert.equal(f.checkpoint.decode(f.checkpoint.envelope({message:'香'.repeat(2000)})),null);
});
test('Recovery chooses the latest validated generation, retains future schemas and refuses equal or stale writes',()=>{
 const f=fixture('generation_recovery'),key='travel_woodfish:home_incense:generation_recovery';
 f.values.set(key,f.checkpoint.envelope(generation(2)));f.values.set(key+'.tmp',f.checkpoint.envelope(generation(5,24)));f.values.set(key+'.bak',f.checkpoint.envelope(generation(3)));
 assert.equal(f.store.load('generation_recovery',1006).revision,5);assert.equal(f.store.lastSource,key+'.tmp');assert.equal(f.store.save('generation_recovery',generation(5)),false);assert.equal(f.store.lastError,'stale_save_revision');
 const future=f.checkpoint.envelope({...generation(9),schema:2});f.values.set(key+'.bak',future);assert.equal(f.store.save('generation_recovery',generation(6)),false);assert.equal(f.store.lastError,'unsupported_saved_schema');assert.equal(f.values.get(key+'.bak'),future);
 for(const change of [{extra:1},{revision:1.2},{burn_count:0},{duration:Infinity},{remaining:31},{started_unix:0},{deadline_unix:1031},{saved_unix:999},{schema:2}])assert.equal(validBurn({...generation(1),...change}),false);
});
test('Failed commit readback retains temporary recovery and does not advance shared committed revision',()=>{
 const values=new Map(),adapter={getItem:k=>values.get(k)||null,setItem:(k,v)=>{if(!k.endsWith('.tmp')&&!k.endsWith('.bak'))throw new Error('quota');values.set(k,v);}},f=fixture('commit_failure',30,adapter);
 assert.equal(f.state.ignite(),true);assert.equal(f.state.revision,0);assert.equal(f.state.persistenceFailed,true);assert.equal(f.store.lastCommittedRevision,-1);assert.match(f.store.lastError,/quota/);
 const recovered=new IncenseStore(new core.CheckpointStore(adapter));near(recovered.load('commit_failure',1010).remaining,20);assert.equal(recovered.lastSource,'travel_woodfish:home_incense:commit_failure.tmp');
 const silent=new core.CheckpointStore({getItem:()=>null,setItem:()=>{}});assert.equal(silent.write('ignored',generation(1)),false);assert.equal(silent.committed,false);assert.match(silent.lastError,/verify_temporary/);
});
test('Incense uses real monotonic and wall clocks, keeps one burn, and switches rewards exactly at expiry',()=>{
 const f=fixture('clock_and_merit'),merit=new SessionMerit();let started=0,finished=0;f.state.onStarted=()=>started++;f.state.onFinished=()=>finished++;
 assert.equal(f.state.ignite(),true);assert.equal(f.state.ignite(),false);assert.equal(started,1);f.advance(29.99);near(f.state.remaining,.01);assert.equal(merit.award(1,f.state.merit()),true);assert.equal(merit.award(1,f.state.merit()),false);assert.equal(merit.count,2);
 f.advance(.01);assert.equal(f.state.burning,false);assert.equal(finished,1);assert.equal(merit.award(2,f.state.merit()),true);assert.equal(merit.count,3);f.advance(100);assert.equal(finished,1);assert.equal(f.state.smokeTail,0);
 const m=fixture('clock_rollback_live');m.state.ignite();m.set(900,7000);m.state.advanceClock();near(m.state.remaining,23);
 // A wall-clock jump alone expires the stick; the original starts its final
 // smoke tail at the observed expiry. Full monotonic background time drains it.
 const w=fixture('clock_wall_jump');w.state.ignite();w.set(1037,20);w.state.advanceClock();assert.equal(w.state.remaining,0);assert.equal(w.state.smokeTail,5.6);
 const background=fixture('clock_background');background.state.ignite();background.set(1037,37000);background.state.advanceClock();assert.equal(background.state.smokeTail,0);
});
test('Reload catches up elapsed time, a rollback expires the checkpoint, and restored duration resets for a new burn',()=>{
 const f=fixture('restore_duration',12);f.state.ignite();f.advance(3);const restored=new IncenseState(new IncenseStore(new core.CheckpointStore(f.adapter)),()=>1008,()=>8000,'restore_duration',30);near(restored.remaining,4);assert.equal(restored.duration,12);restored.advance(4);assert.equal(restored.ignite(),true);assert.equal(restored.duration,30);assert.equal(restored.burnCount,2);
 const rollback=fixture('restore_rollback');rollback.state.ignite();rollback.advance(4);const store=new IncenseStore(new core.CheckpointStore(rollback.adapter));assert.equal(store.load('restore_rollback',1001).remaining,0);assert.equal(store.lastError,'clock_rollback_expired_incense');
});
test('Two live instances synchronize without extending the same stick or accepting a late older save',()=>{
 const f=fixture('shared_generation');f.state.ignite();const other=new IncenseState(new IncenseStore(new core.CheckpointStore(f.adapter)),f.wall,f.tick,'shared_generation');f.advance(4);other.advanceClock();near(other.remaining,26);assert.equal(other.burnCount,1);assert.equal(other.ignite(),false);other.flush();const old=f.state.revision;assert.ok(other.revision>old);f.state.advanceClock();assert.equal(f.state.revision,other.revision);near(f.state.remaining,26);
});
test('Hint pauses before entering, leaves over .18 seconds, and re-enters after the actual burn overshoot',()=>{
 const f=fixture('hint_timing',.5);f.state.advance(1.2);assert.equal(f.state.hintAlpha,0);f.state.advance(.18);near(f.state.hintAlpha,1);f.state.ignite();f.state.advance(.09);near(f.state.hintAlpha,.5);f.state.advance(.09);near(f.state.hintAlpha,0);f.state.advance(.42);near(f.state.hintRest,.1);assert.equal(f.state.hintAlpha,0);f.state.advance(1.28);near(f.state.hintAlpha,1);
});
test('Smoke is bounded, separates re-ignition generations and drains after long background intervals',()=>{
 const smoke=new IncenseSmoke();smoke.ignite(224,1);smoke.advance(8,30,30,0,1);assert.ok(smoke.points.length<=176);smoke.paint(true,224*22/30,8,1);assert.ok(smoke.mesh.vertexData.some(x=>x>0));assert.ok(Array.from(smoke.mesh.vertices).every(Number.isFinite));assert.ok(Math.max(...smoke.mesh.indices)<smoke.capacity*5);
 const boundary=smoke.points.length;smoke.ignite(224,2);smoke.advance(.3,30,30,8,2);const split=smoke.points.findIndex(p=>p.burnId===2);assert.ok(boundary>0&&split>0);smoke.paint(true,221.76,8.3,2);assert.deepEqual(Array.from(smoke.mesh.indices.slice((split-1)*24,split*24)),Array(24).fill(0));
 smoke.advance(50,1,30,8.3,2);smoke.paint(false,0,58.3,2);assert.equal(smoke.points.length,0);assert.ok(smoke.mesh.vertexData.every(x=>x===0));assert.ok(smoke.mesh.indices.every(x=>x===0));assert.equal(incenseFlame(0,[0,0],0).length,0);assert.equal(incenseFlame(1,[0,0],0).length,5);
});
