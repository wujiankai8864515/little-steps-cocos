require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('module');
const running=new Set();let now=0;
// Native Tween boundary with its first-tick delay. The real presentation owns waits,
// cancellations, launch order and the shared clock; only frame delivery is simulated.
class FrameTween {
 constructor(target){this.target=target;this.actions=[];this.index=0;this.elapsed=0;this.firstTick=true;this.stopped=false;}
 to(duration,values,options={}){this.actions.push({duration,values,options});return this;}
 call(callback){this.actions.push({callback});return this;}
 start(){running.add(this);return this;}
 stop(){this.stopped=true;running.delete(this);return this;}
 step(dt){
  if(this.firstTick){this.firstTick=false;return;}
  const action=this.actions[this.index];if(!action)return;
  if(action.callback){action.callback();this.index++;return;}
  this.elapsed+=dt;const ratio=Math.min(1,this.elapsed/action.duration);
  for(const [key,value] of Object.entries(action.values))this.target[key]=value*ratio;
  action.options.onUpdate?.(this.target,ratio);
  if(ratio>=1){this.index++;this.elapsed=0;}
 }
}
const originalLoad=Module._load;
Module._load=function(id,...args){if(id==='cc')return {
 _decorator:{ccclass:()=>value=>value,property:()=>()=>{}},
 Component:class{constructor(){this.node={isValid:true};}},
 Vec3:class{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}},
 tween:target=>new FrameTween(target),
};return originalLoad.call(this,id,...args);};
const {GamePresentation}=require('../assets/mods/base-card/GamePresentation.ts');
const {OPENING_DEAL_TIMING,openingBoardLaunchInterval,parseOpeningStockMotion}=require('../assets/mods/base-card/GameVisualTypes.ts');
const motion=parseOpeningStockMotion(require('../assets/art/resources/config/card-opening-motion.json'));
Module._load=originalLoad;
function makePage(){const page=new GamePresentation();page.openingTime=()=>now;return page;}

for(const fps of [10,15,30,60])test(`51-card opening keeps its bounded elapsed-time beat at ${fps} FPS and waits for every landing`,async()=>{
 running.clear();now=0;const page=makePage(),launches=[],landed=[];
 const count=51;
 const pending=page.animateOpeningLaunches(Array.from({length:count},(_,index)=>()=>{
  launches.push({index,time:now});
  return page.waitForVisual(done=>page.visualTween({elapsed:0}).to(OPENING_DEAL_TIMING.cardDuration,{elapsed:1}).call(()=>{landed.push(index);done();}).start());
 }));
 let finished=false;pending.then(()=>{finished=true;});
 for(let frame=0;frame<fps*6&&!finished;frame++){
  now+=1/fps;for(const tween of [...running])tween.step(1/fps);
  await Promise.resolve();await Promise.resolve();
 }
 await pending;
 assert.deepEqual(launches.map(item=>item.index),Array.from({length:count},(_,i)=>i));
 assert.deepEqual(landed,Array.from({length:count},(_,i)=>i));
 const idealLastLaunch=(count-1)*openingBoardLaunchInterval(count);
 assert.ok(launches.at(-1).time<=idealLastLaunch+3/fps,`last launch drifted to ${launches.at(-1).time}s`);
 assert.ok(now<=1.1+4/fps+1e-9,`deal drifted beyond its frame allowance: ${now}`);
 if(fps>=30)assert.ok(now<1.5,`board failed to land within 1.5 seconds: ${now}`);
 assert.equal(running.size,0,'all owned clock and landing tweens must stop');
 page.onDestroy();
});

for(const fps of [15,60])test(`the sampled stock chain shares one clock at ${fps} FPS and settles parallel`,async()=>{
 running.clear();now=0;const page=makePage(),cards=Array.from({length:11},(_,index)=>({
  node:{isValid:true,angle:0,setPosition(x,y,z){this.position={x,y,z};}},
  position:{x:index*25,y:0,z:0},angle:0,width:162,height:243,bottomDistance:400,
 }));
 page.applyOpeningStockPose(cards,motion,0);assert.ok(cards.every(card=>card.node.angle===-90&&card.node.position.y < -400));
 page.applyOpeningStockPose(cards,motion,1);assert.ok(cards[0].node.angle>cards.at(-1).node.angle+20);assert.ok(cards[0].node.position.y>cards.at(-1).node.position.y);
 const work=page.animateOpeningStock(cards,motion);let finished=false;work.then(()=>finished=true);
 assert.equal(running.size,1,'the chain must share one clock rather than accumulating per-card tweens');
 for(let frame=0;frame<fps*3&&!finished;frame++){now+=1/fps;for(const tween of [...running])tween.step(1/fps);await Promise.resolve();await Promise.resolve();}
 await work;assert.ok(now<=motion.duration+3/fps);
 for(const card of cards){assert.deepEqual(card.node.position,card.position);assert.equal(card.node.angle,0);}
 assert.equal(running.size,0);page.onDestroy();
});

test('the board landing uses linear position and angle and owns all its tweens',async()=>{
 running.clear();now=0;const positions=[],page=makePage(),node={position:{x:0,y:100,z:0,clone(){return {...this};}},angle:12,setScale(){},setPosition(x,y,z){this.position={x,y,z};positions.push(y);}};page.cardShadowFor=()=>null;
 const work=page.animateOpeningLanding(node,{x:1,y:2,z:0},0,{x:1,y:1,z:1},.24);
 assert.equal(running.size,1);for(const tween of running)assert.equal(tween.actions[0].options.easing,'linear');
 let done=false;work.then(()=>done=true);
 // Real time advances while the native tween's delta is deliberately much smaller.
 for(let frame=0;frame<12&&!done;frame++){now+=.04;for(const tween of [...running])tween.step(.001);await Promise.resolve();await Promise.resolve();}
 await work;assert.ok(now<=.32);assert.deepEqual(node.position,{x:1,y:2,z:0});assert.equal(node.angle,0);
 assert.ok(positions.every((y,index)=>y>=2&&y<=100&&(index===0||y<=positions[index-1])));
 assert.equal(running.size,0);page.onDestroy();
});

test('cancelling the sampled stock clock stops every later pose update',async()=>{
 running.clear();const page=makePage();let updates=0;page.applyOpeningStockPose=()=>updates++;
 const work=page.animateOpeningStock([{}],motion);for(const tween of [...running])tween.step(.1);
 page.cancelVisuals();await assert.rejects(work,/失效/);const stopped=updates;
 for(const tween of [...running])tween.step(1);assert.equal(updates,stopped);assert.equal(running.size,0);page.onDestroy();
});

test('cancelling the shared opening clock prevents later launches and settles existing landings',async()=>{
 running.clear();now=0;const page=makePage();let launched=0;
 const pending=page.animateOpeningLaunches(Array.from({length:63},()=>()=>{
  launched++;return page.waitForVisual(done=>page.visualTween({elapsed:0}).to(.32,{elapsed:1}).call(done).start());
 }));
 now=.1;for(const tween of [...running])tween.step(.1);
 page.cancelVisuals();const atCancel=launched;
 await assert.rejects(pending,/失效/);
 assert.equal(running.size,0);assert.equal(launched,atCancel);assert.equal(launched,1);
 page.onDestroy();
});

test('a failed landing remains an error after the launch clock completes',async()=>{
 running.clear();const page=makePage();
 const pending=page.animateOpeningLaunches([()=>Promise.reject(new Error('落牌失败'))]);
 await assert.rejects(pending,/落牌失败/);page.onDestroy();
});
