require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parseOpeningStockMotion,sampleOpeningStockMotion,buildOpeningDealSchedule,OPENING_DEAL_TIMING}=require('../assets/mods/base-card/GameVisualTypes.ts');
const source=require('../assets/art/resources/config/card-opening-motion.json');
const motion=parseOpeningStockMotion(source);
test('the supplied 30 FPS clip drives a delayed curved chain and settles exactly at 1.6 seconds',()=>{
 assert.equal(motion.referenceFps,30);assert.equal(motion.tracks.length,16);
 assert.equal(source.sourceVideoSha256,'93579c90edd0168631f30c8abd08365a86f5e64c612b73f27e5c5f83c45b8886');
 for(const count of [1,5,11,16,31]){
  for(let index=0;index<count;index++){
   assert.equal(sampleOpeningStockMotion(motion,0,index,count).angle,90);
   assert.deepEqual(sampleOpeningStockMotion(motion,1.6,index,count),{x:0,y:0,angle:0});
   assert.deepEqual(sampleOpeningStockMotion(motion,10,index,count),{x:0,y:0,angle:0});
  }
 }
 const first=sampleOpeningStockMotion(motion,1,0,11),last=sampleOpeningStockMotion(motion,1,10,11);
 assert.ok(first.angle<6);assert.ok(last.angle>40);assert.ok(last.y>first.y+100);
 assert.deepEqual(sampleOpeningStockMotion(motion,1.2,0,11),{x:0,y:0,angle:0});
});
test('sampled chain tracks move upward and straighten without a second independent easing curve',()=>{
 for(let index=0;index<16;index++){
  let previous=sampleOpeningStockMotion(motion,0,index,16);
  for(let frame=1;frame<=96;frame++){
   const pose=sampleOpeningStockMotion(motion,frame/60,index,16);
   assert.ok(pose.y<=previous.y+1e-8);assert.ok(pose.angle<=previous.angle+1e-8);
   previous=pose;
  }
 }
 const clone=()=>JSON.parse(JSON.stringify(source));
 for(const mutate of [m=>m.duration=0,m=>m.tracks[0][1][0]=0,m=>m.tracks[0].at(-1)[1]=1,m=>m.tracks[0][0][3]=45]){
  const invalid=clone();mutate(invalid);assert.throws(()=>parseOpeningStockMotion(invalid),/轨迹/);
 }
});
test('every current Figma board deals covered layers first and completes inside the board budget',()=>{
 const folder=path.join(__dirname,'../assets/art/resources/config/card-levels');
 for(const file of fs.readdirSync(folder).filter(file=>file.endsWith('.json'))){
  const level=JSON.parse(fs.readFileSync(path.join(folder,file))),steps=buildOpeningDealSchedule(level.slots);
  assert.equal(steps.length,level.slots.length);
  const order=new Map(steps.map((step,index)=>[step.slotId,index]));
  for(const slot of level.slots)for(const covered of slot.covers)assert.ok(order.get(covered)<order.get(slot.id),`${file}: ${covered} must enter before ${slot.id}`);
  const finish=steps.at(-1).launchTime+OPENING_DEAL_TIMING.cardDuration+OPENING_DEAL_TIMING.flipHalfDuration*2;
  assert.ok(finish<=1.1+1e-9);assert.ok(finish<1.5);
 }
});
