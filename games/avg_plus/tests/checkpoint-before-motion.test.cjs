require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('module');
const load=Module._load;
const hintTweens=[];
Module._load=function(id,...args){if(id==='cc')return {
 _decorator:{ccclass:()=>value=>value,property:()=>()=>{}},
 Component:class{constructor(){this.node={isValid:true};}},Color:class{},
 Vec3:class{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}},
 tween:target=>{const animation={target,frames:[],stopped:false,to(duration,values){this.frames.push({duration,values});return this;},start(){this.started=true;return this;},stop(){this.stopped=true;}};hintTweens.push(animation);return animation;},
};return load.call(this,id,...args);};
const {GamePageUI}=require('../assets/mods/base-card/GamePageUI.ts');
const {TaskScope}=require('../assets/foundation/Tasks.ts');
Module._load=load;
const state={core:{isComplete:false},session:{coins:5150}};
const context={action:{type:'card.draw'},state:{'base-card':state},result:{kind:'draw',cardName:'poker_spade_black_01'}};
function page(){const p=new GamePageUI();p.runtime={};p.model=()=>({core:{stockRemainingCount:9},session:{}});p.getTopBackupNode=()=>null;p.findNode=()=>null;return p;}
test('the real card presentation saves the committed wallet before starting a flight',async()=>{
 const p=page();const events=[];let release;
 p.onCheckpoint=async(value,action)=>{assert.equal(value,state);assert.equal(action,'card.draw');events.push('save');await new Promise(r=>release=r);events.push('saved');};
 p.animateBackupToCurrent=async()=>events.push('flight');
 const scope=new TaskScope();const work=p.present(context,scope);
 assert.deepEqual(events,['save']);assert.equal(p.checkpointSaved,false);
 release();await work;assert.deepEqual(events,['save','saved','flight']);assert.equal(p.checkpointSaved,true);
 scope.dispose();p.cancelVisuals();p.lifetime.dispose();
});
test('failed persistence cannot start an animation or mark its checkpoint saved',async()=>{
 const p=page();let flights=0;p.onCheckpoint=async()=>{throw new Error('写入失败');};p.animateBackupToCurrent=async()=>{flights++;};
 await assert.rejects(p.present(context,{check:()=>{}}),/写入失败/);assert.equal(flights,0);assert.equal(p.checkpointSaved,false);
 p.cancelVisuals();p.lifetime.dispose();
});
test('missed hints start with the flight after saving and never extend its operation lock',async()=>{
 const p=page(),scope=new TaskScope(),events=[];let releaseSave,releaseFlight,hintScope;
 p.onCheckpoint=async()=>{events.push('save');await new Promise(resolve=>releaseSave=resolve);events.push('saved');};
 p.showMissedMoveHint=(ids,ownedScope)=>{assert.deepEqual(ids,['slot_001']);hintScope=ownedScope;events.push('hint');};
 p.animateBackupToCurrent=async()=>{events.push('flight');await new Promise(resolve=>releaseFlight=resolve);};
 const work=p.present({...context,result:{...context.result,missedSlotIds:['slot_001']}},scope);
 assert.deepEqual(events,['save']);releaseSave();await Promise.resolve();await Promise.resolve();
 assert.deepEqual(events,['save','saved','hint','flight']);assert.equal(hintScope.cancelled,false);
 releaseFlight();await work;assert.equal(hintScope.cancelled,true);
 scope.dispose();p.cancelVisuals();p.lifetime.dispose();
});
test('missed hint tweens restore every original rotation on completion or cancellation',async()=>{
 for(const cancel of [false,true]){
  hintTweens.length=0;const p=page(),scope=new TaskScope();let releaseFlight;
  const cards=[{isValid:true,angle:12},{isValid:true,angle:-7}];
  p.findNode=()=>({getChildByName:id=>cards[Number(id)-1]});
  p.animateBackupToCurrent=()=>new Promise(resolve=>releaseFlight=resolve);
  const work=p.present({...context,result:{...context.result,missedSlotIds:['1','2','missing']}},scope);
  assert.equal(hintTweens.length,2);assert.ok(hintTweens.every(tween=>tween.started));
  cards[0].angle=4;cards[1].angle=1;
  if(cancel)scope.dispose();else releaseFlight();
  if(!cancel)await work;
  assert.deepEqual(cards.map(card=>card.angle),[12,-7]);assert.ok(hintTweens.every(tween=>tween.stopped));
  if(cancel){releaseFlight();await assert.rejects(work,/会话已取消/);}
  scope.dispose();p.cancelVisuals();p.lifetime.dispose();
 }
});
