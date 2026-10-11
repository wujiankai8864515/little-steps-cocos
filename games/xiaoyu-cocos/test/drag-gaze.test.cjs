const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
function load(name){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports,Math,Number,require:id=>{assert.equal(id,'./EyeGeometry');return load('EyeGeometry');}});return exports;}
const {DragGaze}=load('DragGaze'),{clampEyeOffset,EYE_TRAVEL}=load('EyeGeometry');
const native=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/drag-gaze-native.json'),'utf8'));
const near=(a,b,t=1e-5)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}; tolerance ${t}`);
test('Independent drag eye springs and face blend reproduce160 real native source oracle frames',()=>{
 const gaze=new DragGaze();assert.equal(native.rows.length,160);
 for(const row of native.rows){gaze.setTarget(row.set_id,row.set_target);gaze.advance(row.delta,()=>row.local_target,row.jelly);const state=gaze.snapshot();assert.equal(state.active_id,row.gaze.active_id);near(state.weight,row.gaze.weight,0);for(const key of ['left','right','left_velocity','right_velocity','target_world'])state[key].forEach((v,i)=>near(v,row.gaze[key][i],0));gaze.offsets([.7,-.45],false).forEach((eye,i)=>eye.forEach((v,j)=>near(v,row.blend[i][j],0)));}
});
test('Invalid delta/body do not advance; invalid focus retains last target and fades only on valid ticks',()=>{
 const gaze=new DragGaze();gaze.setTarget('bag',[619,528]);gaze.advance(1/60,p=>p,[0,0]);const before=JSON.stringify(gaze.snapshot());for(const dt of [NaN,Infinity,0,-1])gaze.advance(dt,p=>p,[0,0]);gaze.advance(1/60,null,[0,0]);assert.equal(JSON.stringify(gaze.snapshot()),before);gaze.setTarget('bad',[Infinity,0]);assert.equal(gaze.activeId,'');assert.deepEqual(Array.from(gaze.targetWorld),[619,528]);gaze.advance(.05,p=>p,[0,0]);assert.equal(gaze.weight,0);assert.deepEqual(JSON.parse(JSON.stringify(gaze.offsets([1,2],true))),[[0,0],[0,0]]);
});
test('Large elapsed caps at50ms; velocity and elliptical travel stay bounded and enlarged pupils remain inside their own domains',()=>{
 const a=new DragGaze(),b=new DragGaze();for(const g of [a,b])g.setTarget('bag',[1e5,-1e5]);a.advance(9,p=>p,[0,0]);b.advance(.05,p=>p,[0,0]);assert.deepEqual(JSON.parse(JSON.stringify(a.snapshot())),JSON.parse(JSON.stringify(b.snapshot())));
 for(let frame=0;frame<240;frame++){if(frame===120)a.setTarget('doll',[-1e5,1e5]);a.advance(1/60,p=>p,[2,-3]);[a.left,a.right].forEach((eye,i)=>{assert.ok(Math.hypot(eye[0]/EYE_TRAVEL[i][0],eye[1]/EYE_TRAVEL[i][1])<=1.000001);const safe=clampEyeOffset(i+1,eye);assert.ok(safe.every(Number.isFinite));});assert.ok(Math.hypot(...a.leftVelocity)<=85.00001);assert.ok(Math.hypot(...a.rightVelocity)<=85.00001);}
 assert.notDeepEqual(Array.from(a.left),Array.from(a.right));a.setTarget('',[0,0]);for(let i=0;i<120;i++)a.advance(1/60,p=>p,[0,0]);assert.equal(a.weight,0);assert.ok(Math.hypot(...a.left)<1e-4);assert.ok(Math.hypot(...a.right)<1e-4);
});
