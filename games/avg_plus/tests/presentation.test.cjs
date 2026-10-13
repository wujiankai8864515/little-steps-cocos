require('../tools/ts-loader.cjs');
const {test}=require('node:test'), assert=require('node:assert/strict'),Module=require('module');
// Only the native boundary is mocked: these tests exercise the real presentation lifetime adapter.
const originalLoad=Module._load;
Module._load=function(id,...args){if(id==='cc')return {_decorator:{ccclass:()=>value=>value},Component:class{constructor(){this.node={isValid:true}}},tween:()=>({stopped:false,stop(){this.stopped=true}})};return originalLoad.call(this,id,...args)};
const {PresentationComponent}=require('../assets/mods/shared/PresentationComponent.ts');
const {boardFlightAngle,buildOpeningDealSchedule,buildOpeningStockSchedule,buildMissedMoveSwayKeyframes,stableVisibleBackupCardOffsets,OPENING_DEAL_POSITION_EASING,OPENING_DEAL_TIMING}=require('../assets/mods/base-card/GameVisualTypes.ts');
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
 assert.deepEqual(schedule.map(step=>step.launchFrame),[0,4,8,12,16]);
});
test('opening deal rejects cyclic cover relationships',()=>{
 assert.throws(()=>buildOpeningDealSchedule([
  {id:'left',x:-10,y:0,covers:['right']},
  {id:'right',x:10,y:0,covers:['left']},
 ]),/遮挡关系存在循环/);
});
test('opening timeline honors the configured render-frame interval',()=>{
 assert.equal(OPENING_DEAL_POSITION_EASING,'backOut');
 assert.deepEqual(OPENING_DEAL_TIMING,{
  cardDuration:0.32,backupCardDuration:0.32,launchFrameGap:4,referenceFps:60,
  currentDrawDuration:0.36,flipHalfDuration:0.07,
 });
 const schedule=buildOpeningDealSchedule([
  ...Array.from({length:8},(_,i)=>({id:`base-${i}`,x:i,y:-200,covers:[]})),
  {id:'middle',x:0,y:0,covers:['base-0']},
  {id:'top',x:0,y:200,covers:['middle']},
 ]);
 assert.deepEqual(schedule.map(step=>step.launchFrame),[0,4,8,12,16,20,24,28,32,36]);
 // 十张真实备用牌加一张将翻成当前牌的临时顶牌；顶牌到位后立即抽出，
 // 真实备用牌不递进、不补位。
 const stock=buildOpeningStockSchedule(11);
 assert.deepEqual(stock.map(step=>step.launchFrame),[0,4,8,12,16,20,24,28,32,36,40]);
 const finalLaunchFrame=schedule.length*OPENING_DEAL_TIMING.launchFrameGap+stock[stock.length-1].launchFrame;
 const settleTime=finalLaunchFrame/OPENING_DEAL_TIMING.referenceFps+OPENING_DEAL_TIMING.backupCardDuration;
 assert.ok(Math.abs(settleTime-1.6533333333333333)<1e-9);
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
test('paid backup button is centered over the backup cards',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const prefab=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/art/resources/prefabs/gamePage.prefab'),'utf8'));
 const node=name=>prefab.find(item=>item?.__type__==='cc.Node'&&item._name===name);
 assert.equal(node('backup')._lpos.x,node('addBackup')._lpos.x);
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
