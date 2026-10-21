require('../tools/ts-loader.cjs');
const {test}=require('node:test'), assert=require('node:assert/strict'),Module=require('module');
// Only the native boundary is mocked: these tests exercise the real presentation lifetime adapter.
const originalLoad=Module._load;
Module._load=function(id,...args){if(id==='cc')return {_decorator:{ccclass:()=>value=>value},Component:class{constructor(){this.node={isValid:true}}},tween:()=>({stopped:false,stop(){this.stopped=true}})};return originalLoad.call(this,id,...args)};
const {PresentationComponent}=require('../assets/mods/shared/PresentationComponent.ts');
const {boardFlightAngle,buildOpeningDealSchedule,openingBoardLaunchInterval,buildMissedMoveSwayKeyframes,stableVisibleBackupCardOffsets,OPENING_DEAL_POSITION_EASING,OPENING_DEAL_TIMING}=require('../assets/mods/base-card/GameVisualTypes.ts');
const {visibleBackupCardCount}=require('../assets/mods/base-card/GameUIContract.ts');
Module._load=originalLoad;
test('paid backup entry previews the five cards it unlocks',()=>{
 const view={stockRemainingCount:0,controls:{addBackupVisible:true}};
 assert.equal(visibleBackupCardCount(view),5);
 assert.equal(visibleBackupCardCount({...view,controls:{addBackupVisible:false}}),0);
 assert.equal(visibleBackupCardCount({...view,stockRemainingCount:3}),5);
});
test('drawing the top backup card never repositions the remaining pile',()=>{
 const slots=[-117,-95,-69,-42,-14,12,37,63,94,121];
 const before=stableVisibleBackupCardOffsets(slots,6);
 const after=stableVisibleBackupCardOffsets(slots,5);
 assert.deepEqual(before,[-117,-95,-69,-42,-14,12]);
 assert.deepEqual(after,[-117,-95,-69,-42,-14]);
 assert.deepEqual(after,before.slice(0,-1));
});
test('backup slots expand dynamically from the fixed left edge',()=>{
 const offsets=stableVisibleBackupCardOffsets([-117,-95],5);
 assert.deepEqual(offsets,[-117,-95,-73,-51,-29]);
});
test('opening deal sends lower layers first, then scans each layer left-to-right and top-to-bottom',()=>{
 const schedule=buildOpeningDealSchedule([
  {id:'bottom-right',x:100,y:-170,covers:[]},
  {id:'top-right',x:100,y:210,covers:['top-left']},
  {id:'middle',x:0,y:40,covers:['bottom-left','bottom-right']},
  {id:'top-left',x:-100,y:245,covers:[]},
  {id:'bottom-left',x:-100,y:-120,covers:[]},
 ]);
 assert.deepEqual(schedule.map(step=>step.slotId),['top-left','bottom-left','bottom-right','top-right','middle']);
 assert.deepEqual(schedule.map(step=>step.layer),[0,0,0,1,1]);
 assert.deepEqual(schedule.map(step=>step.row),[0,1,1,0,1]);
 assert.deepEqual(schedule.map(step=>step.launchTime),[0,.12,.24,.36,.48]);
});
test('opening deal rejects cyclic cover relationships',()=>{
 assert.throws(()=>buildOpeningDealSchedule([
  {id:'left',x:-10,y:0,covers:['right']},
  {id:'right',x:10,y:0,covers:['left']},
 ]),/遮挡关系存在循环/);
});
test('opening falls linearly and adapts its stagger to finish large boards within 1.5 seconds',()=>{
 assert.equal(OPENING_DEAL_POSITION_EASING,'linear');
 assert.deepEqual(OPENING_DEAL_TIMING,{
  boardDuration:1.1,cardDuration:0.24,maximumLaunchInterval:.12,
  currentDrawDelay:0.2,currentDrawDuration:0.18,flipHalfDuration:0.07,
 });
 const schedule=buildOpeningDealSchedule([
  ...Array.from({length:8},(_,i)=>({id:`base-${i}`,x:i,y:-200,covers:[]})),
  {id:'middle',x:0,y:0,covers:['base-0']},
  {id:'top',x:0,y:200,covers:['middle']},
 ]);
 const interval=openingBoardLaunchInterval(schedule.length);
 assert.deepEqual(schedule.map(step=>step.launchTime),schedule.map((_,i)=>i*interval));
 for(const count of [1,11,19,40,51]){
  const end=(count-1)*openingBoardLaunchInterval(count)+OPENING_DEAL_TIMING.cardDuration+OPENING_DEAL_TIMING.flipHalfDuration*2;
  assert.ok(end<=1.1+1e-9);assert.ok(end<1.5);
 }
});
test('missed-move hint completes four left-right sways in exactly one second',()=>{
 const frames=buildMissedMoveSwayKeyframes();
 assert.equal(frames.reduce((sum,frame)=>sum+frame.duration,0),1);
 assert.deepEqual(frames.map(frame=>frame.angleOffset),[-8,8,-8,8,-8,8,-8,8,0]);
});
test('board flight rotation matches the measured reference-video frames',()=>{
 const progressAtFrame=frame=>(frame-143)/45;
 const normalizedAngle=frame=>boardFlightAngle(0,360,progressAtFrame(frame))/360;
 assert.ok(Math.abs(normalizedAngle(145)-0.138)<0.002);
 assert.ok(Math.abs(normalizedAngle(155)-0.519)<0.002);
 assert.ok(Math.abs(normalizedAngle(161)-0.674)<0.002);
 assert.ok(Math.abs(normalizedAngle(183)-0.977)<0.002);
 assert.ok(Math.abs(normalizedAngle(187)-0.997)<0.002);
 assert.equal(boardFlightAngle(20,-360,1),-360);
 assert.equal(boardFlightAngle(-40,360,1),360);
});
test('JSON levels retain card geometry and declare an area containing every rotated card',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const prefab=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/art/resources/prefabs/gamePage.prefab'),'utf8'));
 const boardIndex=prefab.findIndex(item=>item?.__type__==='cc.Node'&&item._name==='content');
 assert.notEqual(boardIndex,-1);
 const board=prefab[boardIndex];
 const transform=board._components.map(ref=>prefab[ref.__id__]).find(item=>item?.__type__==='cc.UITransform');
 assert.deepEqual(transform._contentSize,{__type__:'cc.Size',width:1179,height:779});
 const configRoot=path.join(__dirname,'../assets/art/resources/config/card-levels');
 const levels=fs.readdirSync(configRoot).filter(name=>name.endsWith('.json')).map(name=>JSON.parse(fs.readFileSync(path.join(configRoot,name),'utf8')));
 for(const level of levels){
  for(const slot of level.slots){
   assert.deepEqual({width:slot.width,height:slot.height},level.cardSize);
   const angle=slot.rotation*Math.PI/180;
   const rx=Math.abs(Math.cos(angle))*slot.width/2+Math.abs(Math.sin(angle))*slot.height/2;
   const ry=Math.abs(Math.sin(angle))*slot.width/2+Math.abs(Math.cos(angle))*slot.height/2;
   assert.ok(Math.abs(slot.x)+rx<=level.designSize.width/2,`${level.levelId}/${slot.id} exceeds horizontal layout`);
   assert.ok(Math.abs(slot.y)+ry<=level.designSize.height/2,`${level.levelId}/${slot.id} exceeds vertical layout`);
  }
 }
});
test('a late asset continuation cannot mutate the presentation after cancellation',async()=>{
 const view=new PresentationComponent();let resolveAsset;let writes=0;
 const check=view.visualCheckpoint();const task=(async()=>{await new Promise(resolve=>{resolveAsset=resolve});check();writes++;})();
 view.cancelVisuals();const next=view.visualCheckpoint();resolveAsset();await assert.rejects(task,/失效/);next();assert.equal(writes,0);
});
test('scene destruction settles animation waits and stops every owned tween',async()=>{
 const view=new PresentationComponent();let animation;
 const pending=view.waitForVisual(()=>{animation=view.visualTween({})});
 const check=view.visualCheckpoint();view.onDestroy();await pending;
 assert.equal(animation.stopped,true);assert.throws(check,/失效/);view.onDestroy();
});

test('reference right-anchored stock removes leftmost slots and keeps the top card fixed through draw and undo',()=>{
 const slots=Array.from({length:15},(_,i)=>-117+i*22);
 assert.deepEqual(stableVisibleBackupCardOffsets(slots,15,'right'),slots);
 const after=stableVisibleBackupCardOffsets(slots,14,'right');assert.deepEqual(after,slots.slice(1));assert.equal(after.at(-1),slots.at(-1));
 assert.deepEqual(stableVisibleBackupCardOffsets(slots,1,'right'),[slots.at(-1)]);
 assert.deepEqual(stableVisibleBackupCardOffsets(slots,15,'right'),slots);
});
