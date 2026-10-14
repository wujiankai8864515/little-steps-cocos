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
Module._load=originalLoad;

for(const fps of [10,15,30,60])test(`52-card opening keeps its elapsed-time beat at ${fps} FPS and waits for every landing`,async()=>{
 running.clear();now=0;const page=new GamePresentation(),launches=[],landed=[];
 const count=63; // 52 board cards, ten stock cards and the temporary current card.
 const pending=page.animateOpeningLaunches(Array.from({length:count},(_,index)=>()=>{
  launches.push({index,time:now});
  return page.waitForVisual(done=>page.visualTween({elapsed:0}).to(.32,{elapsed:1}).call(()=>{landed.push(index);done();}).start());
 }));
 let finished=false;pending.then(()=>{finished=true;});
 for(let frame=0;frame<fps*6&&!finished;frame++){
  now+=1/fps;for(const tween of [...running])tween.step(1/fps);
  await Promise.resolve();await Promise.resolve();
 }
 await pending;
 assert.deepEqual(launches.map(item=>item.index),Array.from({length:count},(_,i)=>i));
 assert.deepEqual(landed,Array.from({length:count},(_,i)=>i));
 const idealLastLaunch=(count-1)*4/60;
 assert.ok(launches.at(-1).time<=idealLastLaunch+3/fps,`last launch drifted to ${launches.at(-1).time}s`);
 assert.ok(now<5.2,`deal exceeded 5.2s: ${now}`);
 assert.equal(running.size,0,'all owned clock and landing tweens must stop');
 page.onDestroy();
});

test('cancelling the shared opening clock prevents later launches and settles existing landings',async()=>{
 running.clear();now=0;const page=new GamePresentation();let launched=0;
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
 running.clear();const page=new GamePresentation();
 const pending=page.animateOpeningLaunches([()=>Promise.reject(new Error('落牌失败'))]);
 await assert.rejects(pending,/落牌失败/);page.onDestroy();
});
