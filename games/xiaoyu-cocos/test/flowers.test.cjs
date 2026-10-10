const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript'),loaded={};
function load(name){if(loaded[name])return loaded[name];const exports=loaded[name]={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports,require:n=>load(n.slice(2)),Math,Number,Float32Array,Uint16Array,Set,JSON});return exports;}
const {FlowerLife,FlowerStore,FlowerBouquet}=load('FlowerLife'),{FlowerPose,FlowerHeadMesh,flowerVirtualSun,projectFlowerHead,flowerNormal}=load('FlowerPose');
const context=vm.createContext({Float32Array,Uint16Array});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../../engines/travel-core/dist/travel-core.js'),'utf8'),context);const core=context.LittleStepsCore;
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`),plain=x=>JSON.parse(JSON.stringify(x));
function fixture(){const values=new Map(),adapter={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},checkpoint=new core.RawJSONCheckpointStore(adapter,65536),store=new FlowerStore(checkpoint);return {values,adapter,checkpoint,store};}
test('One established starter and one birth per earned minute; cap ten never retires or backfills offline time',()=>{
 const f=new FlowerLife();f.initialize();f.initialize();assert.equal(f.flowers.length,1);assert.equal(f.flowers[0].born,-8);assert.equal(f.advance(59.99),false);assert.equal(f.advance(.01),true);assert.equal(f.flowers.length,2);assert.equal(f.flowers[1].born,60);assert.equal(f.phaseFor(f.flowers[1]).growth,.045);near(f.phaseFor(f.flowers[1]).head_growth,.08);
 f.advance(8);assert.equal(f.phaseFor(f.flowers[1]).bloom,1);f.advance(3600);assert.equal(f.flowers.length,10);assert.equal(f.nextId,10);const ids=f.flowers.map(x=>x.id);f.advance(3600);assert.deepEqual(plain(f.flowers.map(x=>x.id)),plain(ids));assert.equal(f.snapshot().offline_growth,false);
 const before=JSON.stringify(f.snapshot());for(const bad of [NaN,Infinity,-1,0,3600.01]){assert.equal(f.advance(bad),false);assert.equal(JSON.stringify(f.snapshot()),before);}
});
test('Restoration is atomic, migrates only geometry and preserves empty bouquets and earned boundaries',()=>{
 const f=new FlowerLife(),legacy={schema:1,revision:9,active_seconds:119,next_birth_seconds:120,next_id:2,lifetime_seconds:700,max_flowers:12,flowers:[{id:0,born:-8,lifetime:630,height:120,bend:.1,root_x:4,phase:1,head_size:32}]};
 assert.equal(f.restore(legacy),true);const flower=f.flowers[0];assert.equal(flower.born,-8);assert.equal(flower.lifetime,630);assert.equal(flower.phase,1);assert.equal(flower.height,f.record(0,-8).height);assert.equal(f.nextBirthSeconds,120);assert.equal(f.nextId,2);assert.equal(f.revision,9);assert.equal(f.lifetimeSeconds,700);assert.equal(f.flowers.length,1);assert.equal(f.maxFlowers,10);
 f.advance(1);assert.equal(f.flowers.length,2);assert.equal(f.flowers[1].id,2);const saved=f.snapshot(),before=JSON.stringify(saved);
 for(const changes of [{schema:4},{geometry_version:3},{next_birth_seconds:120},{active_seconds:Infinity},{flowers:[saved.flowers[0],saved.flowers[0]]},{flowers:[{...saved.flowers[0],height:172}]},{flowers:[{...saved.flowers[0],phase:NaN}]}]){assert.equal(f.restore({...saved,...changes}),false);assert.equal(JSON.stringify(f.snapshot()),before);}
 const empty=new FlowerLife();assert.equal(empty.restore({...legacy,active_seconds:0,next_birth_seconds:60,next_id:2,flowers:[]}),true);empty.initialize();assert.equal(empty.flowers.length,0);
});
test('Schema 2 legacy cap shrinks to ten after full validation; geometry v2 and fractional legacy integers retain source rules',()=>{
 const f=new FlowerLife(),list=Array.from({length:12},(_,id)=>({id,born:0,lifetime:360,height:90,bend:.1,root_x:0,phase:1,head_size:32}));
 const old={schema:2,revision:3.9,active_seconds:719,next_birth_seconds:720,next_id:13.9,lifetime_seconds:360,max_flowers:12,flowers:list};assert.equal(f.restore(old),true);assert.equal(f.flowers.length,10);assert.equal(f.revision,3);assert.equal(f.nextId,13);assert.equal(f.flowers[9].id,9);
 const before=JSON.stringify(f.snapshot());old.flowers[11].head_size=100;assert.equal(f.restore(old),false);assert.equal(JSON.stringify(f.snapshot()),before);
 const current=f.snapshot();assert.equal(f.restore(current),true);assert.deepEqual(plain(f.snapshot()),plain(current));
});
test('Raw JSON recovery selects latest valid main/tmp/bak and ties prefer main; failed readback keeps a recoverable generation',()=>{
 const x=fixture(),key='travel_woodfish:home_flowers:vase_v1',f=new FlowerLife();f.initialize();const data=f.snapshot();
 x.values.set(key,JSON.stringify({...data,revision:4}));x.values.set(key+'.tmp',JSON.stringify({...data,revision:7}));x.values.set(key+'.bak',JSON.stringify({...data,revision:6}));assert.equal(x.store.loadInto(f),true);assert.equal(f.revision,7);assert.equal(x.store.lastSource,key+'.tmp');
 x.values.set(key,JSON.stringify({...data,revision:7}));assert.equal(x.store.loadInto(f),true);assert.equal(x.store.lastSource,key);assert.equal(x.store.save(f),true);assert.equal(f.revision,8);assert.equal(JSON.parse(x.values.get(key)).schema,3);assert.equal(JSON.parse(x.values.get(key)).payload,undefined);
 const failed=new core.RawJSONCheckpointStore({getItem:k=>x.values.get(k)||null,setItem:(k,v)=>{if(k===key)throw Error('quota');x.values.set(k,v);}},65536),store=new FlowerStore(failed);f.advance(3);assert.equal(store.save(f),false);assert.equal(f.revision,8);const recovered=new FlowerLife();assert.equal(store.loadInto(recovered),true);assert.equal(recovered.revision,9);assert.equal(recovered.activeSeconds,3);
});
test('Raw store guards UTF8 bytes, invalid saves/slots and silent storage failure without committed revision',()=>{
 const x=fixture(),f=new FlowerLife();f.initialize();assert.equal(x.store.loadInto(f,'../vase'),false);assert.equal(x.store.lastError,'invalid_save_slot');assert.equal(x.checkpoint.decode('[]'),null);assert.equal(x.checkpoint.decode('{'),null);assert.equal(x.checkpoint.decode(JSON.stringify({s:'花'.repeat(22000)})),null);
 f.flowers[0].extra='花'.repeat(22000);assert.equal(x.store.save(f),false);assert.equal(x.store.lastError,'save_too_large');assert.equal(f.revision,0);
 const silent=new FlowerStore(new core.RawJSONCheckpointStore({getItem:()=>null,setItem:()=>{}},65536));f.flowers[0].extra='';assert.equal(silent.save(f),false);assert.match(silent.lastError,/verify_temporary/);assert.equal(f.revision,0);
});
test('External clock anchors once, rolls back without growth, accrues hidden Home time and limits drawing to 30 Hz',()=>{
 const x=fixture(),b=new FlowerBouquet(x.store);let paints=[];b.onVisual=(d,s)=>paints.push([d,s]);b.setActive(true);b.syncActiveElapsed(10);assert.equal(b.model.activeSeconds,0);b.syncActiveElapsed(10+1/60);assert.equal(paints.length,1);b.syncActiveElapsed(10+2/60);assert.equal(paints.length,2);near(paints[1][0],1/30);
 b.setActive(false);const count=paints.length;b.syncActiveElapsed(70);near(b.model.activeSeconds,60);assert.equal(b.model.flowers.length,2);assert.equal(paints.length,count);b.syncActiveElapsed(2);assert.equal(b.model.activeSeconds,60);b.setActive(true);assert.deepEqual(paints[paints.length-1],[0,true]);b.syncActiveElapsed(3603);assert.equal(b.model.activeSeconds,60);
 const saved=b.model.snapshot(),reload=new FlowerBouquet(x.store);assert.equal(reload.model.activeSeconds,saved.active_seconds);reload.syncActiveElapsed(100000);assert.equal(reload.model.activeSeconds,saved.active_seconds);
});
test('A failed flower save retries its earned generation and clears the warning only after verified recovery',()=>{
 const x=fixture(),key='travel_woodfish:home_flowers:vase_v1';let reject=true,warnings=[];
 const checkpoint=new core.RawJSONCheckpointStore({getItem:k=>x.values.get(k)||null,setItem:(k,v)=>{if(reject&&k===key)throw Error('quota');x.values.set(k,v);}},65536),b=new FlowerBouquet(new FlowerStore(checkpoint));
 b.onWarning=reason=>warnings.push(reason);assert.equal(b.flush(),false);assert.equal(b.persistenceFailed,true);assert.equal(b.dirty,true);assert.equal(b.model.revision,0);assert.equal(warnings.length,1);
 b.advanceActive(60);assert.equal(b.model.flowers.length,2);assert.equal(b.persistenceFailed,true);assert.equal(b.model.revision,0);assert.equal(warnings.length,1);
 reject=false;assert.equal(b.flush(),true);assert.equal(b.persistenceFailed,false);assert.equal(b.dirty,false);assert.equal(b.saveAge,0);assert.equal(b.model.revision,1);
 const restored=new FlowerBouquet(x.store);assert.equal(restored.persistenceFailed,false);assert.equal(restored.model.activeSeconds,60);assert.equal(restored.model.flowers.length,2);
 reject=true;b.advanceActive(5);assert.equal(b.persistenceFailed,true);assert.equal(warnings.length,2);assert.equal(b.model.revision,1);
});
test('Five bone transforms keep root and constant segment lengths while sun, night staggering and springs remain bounded',()=>{
 const f=new FlowerLife();f.initialize();f.advance(60);const p=new FlowerPose(f.flowers[0]),q=new FlowerPose(f.flowers[1]),phase=f.phaseFor(f.flowers[0]);p.pose(phase,0,0,true,[0,-447],true);assert.equal(p.points.length,6);assert.equal(p.angles.length,5);near(p.points[0][0],f.flowers[0].root_x);near(p.points[0][1],0);
 for(let i=0;i<5;i++)near(Math.hypot(p.points[i+1][0]-p.points[i][0],p.points[i+1][1]-p.points[i][1]),f.flowers[0].height/5);assert.equal(p.head.frame,4);assert.equal(p.head.blend,0);
 q.pose(phase,0,0,true,[0,-447],true);for(let i=0;i<210;i++){p.pose(phase,i/30,1/30,false,[0,-447]);q.pose(phase,i/30,1/30,false,[0,-447]);}near(p.sleep,1);assert.ok(q.sleep<1);for(let i=0;i<60;i++)q.pose(phase,8+i/30,1/30,false,[0,-447]);near(q.sleep,1);assert.equal(q.head.frame,0);
 for(let i=0;i<3000;i++){p.pose(phase,i/30,1/30,true,[i%2?480:-480,33]);assert.ok(Math.abs(p.bend)<=1.4);assert.ok(Math.abs(p.velocity)<=.48);assert.ok(p.points.flat().every(Number.isFinite));}assert.equal(p.leaves[1].mirror,true);
});
test('Virtual sun covers vase-centered semicircle; mesh uses exact cropped 13x13 source topology and matching tilt normal',()=>{
 for(const [t,at] of [[0,[-480,-46]],[.5,[0,-526]],[1,[480,-46]]])flowerVirtualSun(t).forEach((v,i)=>near(v,at[i]));
 const m=new FlowerHeadMesh([30,47,972,439]);m.publish(4,.2,.3,.4);assert.equal(m.source.length,338);assert.equal(m.indices.length,864);near(m.source[0],30);near(m.source[1],256);near(m.source[336],256);near(m.source[337],486);assert.deepEqual(Array.from(m.indices.slice(0,6)),[0,1,14,0,14,13]);
 const source=Array.from(m.source);m.publish(4,-.4,.3,1);assert.deepEqual(Array.from(m.source),source);assert.ok(m.vertices.every(Number.isFinite));
 // Source smoothstep reaches zero petal tilt at y=218, not the y=216 pivot.
 // Its tiny dome residual at that pivot is intentional source behavior.
 const attachment=projectFlowerHead([138,216],.4,.3,1);assert.ok(Math.hypot(...attachment)<.001&&Math.hypot(...attachment)>0);projectFlowerHead([138,218],.4,.3,1).forEach((v,i)=>near(v,[0,2][i]));
 const n=flowerNormal(.2,.3,.4);near(Math.hypot(...n),1);const p0=projectFlowerHead([136,126],.2,.3,0),px=projectFlowerHead([136.001,126],.2,.3,0),py=projectFlowerHead([136,126.001],.2,.3,0);assert.ok(px[0]>p0[0]);assert.ok(py[1]>p0[1]);
});
