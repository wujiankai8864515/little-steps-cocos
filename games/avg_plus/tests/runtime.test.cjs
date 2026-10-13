require('../tools/ts-loader.cjs');
const { test } = require('node:test'); const assert = require('node:assert/strict');
const { Runtime } = require('../assets/foundation/Runtime.ts');
const { TaskScope } = require('../assets/foundation/Tasks.ts');
const { sortedMods } = require('../assets/foundation/Data.ts');
const wait = ms => new Promise(r => setTimeout(r, ms));
function mod(id='base', extra={}) { return {manifest:{id,version:'1.0.0',apiVersion:1,order:100},initialState:{n:0}, actions: id==='base'?['test.add']:[],validate(s){assert.ok(Number.isSafeInteger(s[id].n)&&s[id].n>=0)}, execute(ctx){ctx.draft.base.n++;ctx.result={n:ctx.draft.base.n}},...extra}; }
test('dependency order, tie-breaker, missing/cycle/conflicts and action collision',()=>{
 const a=mod('aa');const b=mod('bb',{manifest:{...a.manifest,id:'bb',order:0,requires:['aa']}});
 assert.deepEqual(sortedMods([b,a]).map(m=>m.manifest.id),['aa','bb']);
 assert.throws(()=>sortedMods([b])); a.manifest.requires=['bb']; assert.throws(()=>sortedMods([a,b]));
 assert.throws(()=>new Runtime([mod(),mod('other',{actions:['test.add']})]));
 assert.throws(()=>sortedMods([mod('aa',{manifest:{id:'aa',version:'1.0.0',apiVersion:1,order:1,conflicts:['bb']}}),mod('bb')]));
});
test('all modules commit atomically; hook failure leaves state and history unchanged',async()=>{
 const fail=mod('extension',{beforeCommit(ctx){ctx.draft.extension.n++;throw Error('fail')}});
 const r=new Runtime([mod('base',{execute(ctx){ctx.draft.base.n++;ctx.recordUndo()}}),fail]);await r.open();
 const before=r.exportSnapshot();assert.equal((await r.dispatch({type:'test.add'})).status,'failed');assert.deepEqual(r.exportSnapshot(),before);await r.dispose();
});
test('snapshots are detached and incompatible configs cannot restore',async()=>{
 let retained;
 const r=new Runtime([mod('base',{beforeCommit(ctx){retained=ctx.draft}})],{a:1});await r.open();await r.dispatch({type:'test.add'});retained.base.n=900;
 assert.equal(r.read('base').n,1);const snap=r.exportSnapshot();snap.state.base.n=7;assert.equal(r.read('base').n,1);
 const other=new Runtime([mod()],{a:2});await other.open();assert.throws(()=>other.restoreSnapshot(snap));await r.dispose();await other.dispose();
});
test('beforeAction timeout ignores late draft writes and unlocks',async()=>{
 let retained;const r=new Runtime([mod('base',{async beforeAction(ctx){retained=ctx;await wait(30);ctx.draft.base.n=100}})],{}, {prepareTimeoutMs:5});await r.open();
 assert.equal((await r.dispatch({type:'test.add'})).status,'failed');await wait(40);assert.equal(r.read('base').n,0);assert.equal(r.isBusy,false);await r.dispose();
});
test('presentation timeout preserves committed state, runs cleanup, reports failure',async()=>{
 let cleaned=0;const r=new Runtime([mod('base',{render(){return [{id:'hang',timeoutMs:5,run(scope){scope.own(()=>cleaned++);return new Promise(()=>{})}}]}})]);await r.open();
 const result=await r.dispatch({type:'test.add'});assert.equal(result.status,'committed');assert.equal(result.presentation,'failed');assert.equal(cleaned,1);assert.equal(r.read('base').n,1);await r.dispose();
});
test('busy duplicate input rejected; dispose cancels preparation without commit',async()=>{
 const r=new Runtime([mod('base',{beforeAction:()=>wait(50)})]);await r.open();const task=r.dispatch({type:'test.add'});assert.equal((await r.dispatch({type:'test.add'})).status,'busy');await r.dispose();assert.equal((await task).status,'cancelled');assert.equal(r.read('base').n,0);
});
test('follow-up cycle is bounded',async()=>{
 const r=new Runtime([mod('base',{afterCommit(ctx){ctx.enqueue({type:'test.add'})}})]);await r.open();await r.dispatch({type:'test.add'});assert.equal(r.read('base').n,16);assert.ok(r.diagnostics.some(d=>d.message.includes('16')));await r.dispose();
});
test('async reducers rejected and do not poison next action',async()=>{
 const base=mod('base',{async execute(ctx){ctx.draft.base.n=5;await wait(1)}});const r=new Runtime([base]);await r.open();assert.equal((await r.dispatch({type:'test.add'})).status,'failed');assert.equal(r.read('base').n,0);await r.dispose();
});
test('invalid action payload never leaves runtime busy',async()=>{
 const r=new Runtime([mod()]);await r.open();assert.equal((await r.dispatch({type:'test.add',payload:()=>{}})).status,'failed');assert.equal((await r.dispatch({type:'test.add'})).status,'committed');await r.dispose();
});
test('undo includes every namespace and restores deterministic snapshot',async()=>{
 const base=mod('base',{actions:['test.add','test.undo'],execute(ctx){if(ctx.action.type==='test.undo'){ctx.undo();return}ctx.recordUndo();ctx.draft.base.n++}});
 const ext=mod('extension',{beforeCommit(ctx){if(ctx.action.type==='test.add')ctx.draft.extension.n++}});const r=new Runtime([base,ext]);await r.open();await r.dispatch({type:'test.add'});const snap=r.exportSnapshot();await r.dispatch({type:'test.undo'});assert.equal(r.read('extension').n,0);r.restoreSnapshot(snap);assert.equal(r.read('extension').n,1);await r.dispose();
});
test('late resource completion is discarded once; cancellation cleanup executes',async()=>{
 const scope=new TaskScope();let released=0,cleaned=0;const task=scope.run(s=>{s.own(()=>cleaned++);return wait(25).then(()=>({resource:true}))},5,()=>released++);await assert.rejects(task);await wait(30);assert.equal(cleaned,1);assert.equal(released,1);scope.dispose();
});
test('dispose is reverse dependency order and idempotent',async()=>{
 const calls=[];const a=mod('aa',{dispose(){calls.push('aa')}});const b=mod('bb',{manifest:{...a.manifest,id:'bb',requires:['aa']},dispose(){calls.push('bb')}});const r=new Runtime([b,a]);await r.open();await r.dispose();await r.dispose();assert.deepEqual(calls,['bb','aa']);
});
test('malformed action objects fail without poisoning the session',async()=>{
 const r=new Runtime([{manifest:{id:'demo',version:'1.0.0',apiVersion:1,order:1},initialState:{},actions:['demo.run'],validate(){},execute(ctx){ctx.result={ok:true}}}]);await r.open();
 for(const value of [null,7,[],{}, {type:5}])assert.equal((await r.dispatch(value)).status,'failed');
 assert.equal((await r.dispatch({type:'demo.run'})).status,'committed');await r.dispose();
});
test('presentation plans are sequential and an explicit parallel group owns sibling cancellation',async()=>{
 const order=[];let cleaned=0;let outcome;
 const r=new Runtime([{manifest:{id:'demo',version:'1.0.0',apiVersion:1,order:1},initialState:{count:0},actions:['demo.run'],validate(){},execute(ctx){ctx.draft.demo.count++;ctx.result={};},render(){return [
  {id:'first',run:()=>order.push('first')},
  {id:'parallel',parallel:[{id:'wait',run:scope=>{order.push('wait');scope.own(()=>cleaned++);return new Promise(()=>{});}},{id:'fail',run:()=>{order.push('fail');throw new Error('visual failed');}}]},
  {id:'last',run:()=>order.push('last')}
 ]},afterRender(ctx){outcome=ctx.presentation;}}]);await r.open();
 const result=await r.dispatch({type:'demo.run'});assert.equal(result.status,'committed');assert.equal(outcome,'failed');assert.equal(r.read('demo').count,1);assert.equal(cleaned,1);assert.deepEqual(order,['first','wait','fail','last']);await r.dispose();
});
test('an async hook rejecting with a falsy value still aborts the transaction',async()=>{
 for(const reason of [undefined,null,false,0,'']){
  const r=new Runtime([{manifest:{id:'demo',version:'1.0.0',apiVersion:1,order:1},initialState:{count:0},actions:['demo.run'],validate(){},beforeAction:async()=>{throw reason},execute(ctx){ctx.draft.demo.count++;}}]);await r.open();
  assert.equal((await r.dispatch({type:'demo.run'})).status,'failed');assert.equal(r.read('demo').count,0);await r.dispose();
 }
});
