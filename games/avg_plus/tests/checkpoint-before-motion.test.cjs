require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('module');
const load=Module._load;
Module._load=function(id,...args){if(id==='cc')return {
 _decorator:{ccclass:()=>value=>value,property:()=>()=>{}},
 Component:class{constructor(){this.node={isValid:true};}},Color:class{},
 Vec3:class{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}},
};return load.call(this,id,...args);};
const {GamePageUI}=require('../assets/mods/base-card/GamePageUI.ts');
Module._load=load;
const state={core:{isComplete:false},session:{coins:5150}};
const context={action:{type:'card.draw'},state:{'base-card':state},result:{kind:'draw',cardName:'poker_spade_black_01'}};
function page(){const p=new GamePageUI();p.runtime={};p.model=()=>({core:{stockRemainingCount:9},session:{}});p.getTopBackupNode=()=>null;return p;}
test('the real card presentation saves the committed wallet before starting a flight',async()=>{
 const p=page();const events=[];let release;
 p.onCheckpoint=async(value,action)=>{assert.equal(value,state);assert.equal(action,'card.draw');events.push('save');await new Promise(r=>release=r);events.push('saved');};
 p.animateBackupToCurrent=async()=>events.push('flight');
 const work=p.present(context,{check:()=>{}});
 assert.deepEqual(events,['save']);assert.equal(p.checkpointSaved,false);
 release();await work;assert.deepEqual(events,['save','saved','flight']);assert.equal(p.checkpointSaved,true);
 p.cancelVisuals();p.lifetime.dispose();
});
test('failed persistence cannot start an animation or mark its checkpoint saved',async()=>{
 const p=page();let flights=0;p.onCheckpoint=async()=>{throw new Error('写入失败');};p.animateBackupToCurrent=async()=>{flights++;};
 await assert.rejects(p.present(context,{check:()=>{}}),/写入失败/);assert.equal(flights,0);assert.equal(p.checkpointSaved,false);
 p.cancelVisuals();p.lifetime.dispose();
});
