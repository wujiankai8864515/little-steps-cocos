'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context=vm.createContext({console});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/travel-core.js'),'utf8'),context);
const {Lifetime,ResourceGate}=context.LittleStepsCore;

test('Finished page scopes detach from a live application across 1000 entry/cancel cycles',()=>{
 const app=new Lifetime();let disposed=0;app.own(()=>disposed++);
 for(let i=0;i<1000;i++){const page=new Lifetime(app);page.own(()=>disposed++);page.dispose();page.dispose();assert.equal(app.disposers.length,1,'application retains a finished page');}
 assert.equal(disposed,1000);app.dispose();assert.equal(disposed,1001);
});
test('Parent teardown still runs live children in reverse order and cleans all children after a failure',()=>{
 const app=new Lifetime(),events=[];app.own(()=>events.push('app'));
 const first=new Lifetime(app);first.own(()=>events.push('first'));const second=new Lifetime(app);second.own(()=>{events.push('second');throw new Error('expected cleanup fault');});
 assert.throws(()=>app.dispose(),/expected cleanup fault/);assert.deepEqual(events,['second','first','app']);assert.equal(first.active,false);assert.equal(second.active,false);assert.equal(app.disposers.length,0);app.dispose();
 const late=new Lifetime(app);assert.equal(late.active,false);late.own(()=>events.push('late'));assert.equal(events.at(-1),'late');
});
test('Explicitly released resource leases detach and do not retain assets in a cached page',async()=>{
 const page=new Lifetime(),gate=new ResourceGate();let unloaded=0;
 for(let i=0;i<1000;i++){const lease=await gate.acquire([{key:'art',bytes:10}],()=>({id:i}),()=>unloaded++,page);assert.equal(lease.get('art').id,i);lease.release();assert.throws(()=>lease.get('art'),{name:'CancelledError'});assert.equal(page.disposers.length,0,'cached page retains released leases');}
 assert.equal(unloaded,1000);assert.equal(gate.snapshot().entries,0);assert.equal(gate.snapshot().reservedBytes,0);page.dispose();assert.equal(unloaded,1000);
});
test('One unload failure cannot strand the other assets or admission reservations',async()=>{
 const page=new Lifetime(),gate=new ResourceGate(),unloaded=[];
 await gate.acquire([{key:'bad',bytes:10},{key:'good',bytes:20}],s=>s.key,value=>{unloaded.push(value);if(value==='bad')throw new Error('GPU destroy failed');},page);
 assert.throws(()=>page.dispose(),/GPU destroy failed/);assert.deepEqual(unloaded,['bad','good']);assert.equal(gate.snapshot().entries,0);assert.equal(gate.snapshot().reservedBytes,0);page.dispose();assert.equal(unloaded.length,2);
});
test('Cancellation keeps pending capacity until settlement, disposes a late result once, and cannot revive a page',async()=>{
 const app=new Lifetime(),page=new Lifetime(app),gate=new ResourceGate();let resolve,unloaded=0;
 const pending=gate.acquire([{key:'late',bytes:10}],()=>new Promise(r=>resolve=r),()=>unloaded++,page);
 await Promise.resolve();page.dispose();assert.equal(gate.snapshot().pending,1);assert.equal(gate.snapshot().reservedBytes,10);assert.equal(app.disposers.length,0);
 resolve({});await assert.rejects(pending,{name:'CancelledError'});assert.equal(unloaded,1);assert.equal(gate.snapshot().entries,0);app.dispose();assert.equal(unloaded,1);
});
test('Paused transitions retain only the pending frame callback and still wait for a real draw',async()=>{
 const listeners=new Map(),scopes=new Set(),original=Lifetime.prototype.own;Lifetime.prototype.own=function(fn){scopes.add(this);return original.call(this,fn);};
 const cc={Director:{EVENT_AFTER_UPDATE:'update',EVENT_AFTER_DRAW:'draw'},director:{once(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},off(type,fn){listeners.get(type)?.delete(fn);}},UIOpacity:class{}};
 const root={active:false,isValid:true,parent:{children:[0]},setSiblingIndex(){},getComponent(){return this.opacity;},addComponent(){return this.opacity={};}},owner=new Lifetime();let running=false;
 const router=context.LittleStepsCore.createPageRouter(cc,owner),emit=async type=>{const set=listeners.get(type);for(const fn of [...(set||[])]){set.delete(fn);fn();}await Promise.resolve();await Promise.resolve();};
 try {
  const result=router.show(root,0,()=>running);await emit('update');await emit('update');assert.equal(listeners.get('draw').size,1);assert.equal(root.opacity.opacity,0);await emit('draw');
  for(let i=0;i<1000;i++){await emit('update');for(const scope of scopes)if(scope!==owner)assert.ok(scope.disposers.length<=2,'completed frame callbacks accumulate while waiting for foreground');}
  running=true;await emit('update');assert.equal(await result,true);assert.equal(root.opacity.opacity,255);assert.equal(root.active,true);assert.equal(owner.disposers.length,1);
  const cancelled=router.show(root,0);router.cancel();assert.equal(await cancelled,false);assert.equal(root.active,false);assert.equal(owner.disposers.length,1);assert.equal([...listeners.values()].reduce((n,s)=>n+s.size,0),0);
 } finally {owner.dispose();Lifetime.prototype.own=original;}
});
