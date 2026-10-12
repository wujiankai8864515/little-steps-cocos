const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const context = vm.createContext({Float32Array, Uint16Array});
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../../engines/travel-core/dist/travel-core.js'),'utf8'),context);
const core = context.LittleStepsCore;
function load(name) {
    const output={},source=fs.readFileSync(path.join(__dirname,name==='LoadingMotion'||name==='LoadingMath'?'../assets/startup':'../assets/game',name+'.ts'),'utf8');
    vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports:output,require:specifier=>specifier==='./LoadingMath'?load('LoadingMath'):{core},Math,Number});return output;
}
const {OpeningClock}=load('OpeningClock'),{loadingPose}=load('LoadingMotion');
test('Opening never skips time while paused or accepts the final action before the full hold',()=>{
    const clock=new OpeningClock();let finished=0;clock.onFinished=()=>finished++;
    assert.equal(clock.enter(true),false);clock.start();
    for(let i=0;i<100;i++)clock.tick(.1,false);
    assert.equal(clock.elapsed,0);assert.equal(clock.revealed,0);
    clock.tick(10,true);assert.equal(clock.elapsed,.1);
    for(let i=0;i<79;i++)clock.tick(.1,true);
    assert.equal(clock.enterAvailable,false);assert.equal(clock.enter(true),false);
    clock.tick(.1,true);assert.equal(clock.enterAvailable,true);
    assert.equal(clock.enter(false),false);assert.equal(clock.enter(true),true);assert.equal(clock.enter(true),false);assert.equal(finished,1);
});
test('Cancel is terminal, retries are owned once and a new entry starts blank',()=>{
    const clock=new OpeningClock();clock.start();for(let i=0;i<81;i++)clock.tick(.1,true);clock.enter(true);
    let retries=0;clock.onRetry=()=>retries++;clock.fail('offline');assert.equal(clock.retry(false),false);
    assert.equal(clock.retry(true),true);assert.equal(clock.retry(true),false);assert.equal(retries,1);
    assert.equal(clock.cancel(),true);assert.equal(clock.cancel(),false);clock.tick(.1,true);assert.equal(clock.enter(true),false);
    assert.deepEqual(Array.from(new OpeningClock().amounts),[0,0,0,0]);
});
test('Loading mallet contacts the doll at all three authored strikes without sliding its support',()=>{
    for(let i=0;i<66;i++){
        const pose=loadingPose(i);assert.ok(Math.hypot(pose.support[0]-572,pose.support[1]-778.5)<1e-8);
        if([14,15,28,29,40,41].includes(i))assert.ok(Math.hypot(pose.mallet[0]-pose.contact[0],pose.mallet[1]-pose.contact[1])<1e-8);
    }
    assert.equal(loadingPose(14).impact,0);assert.equal(loadingPose(17).impact,3);assert.equal(loadingPose(18).impact,-1);
});
test('Diagonal comic panels clip at the reveal edge and retain original texture coordinates',()=>{
    const polygon=[[8,8],[647,8],[512,635],[8,613]],clipped=core.clipPolygonBelow(polygon,200);
    assert.equal(clipped.length,4);assert.ok(clipped.every(p=>p[1]<=200));
    const right=clipped.find(p=>p[1]===200&&p[0]>100);
    assert.ok(Math.abs(right[0]-(647+(512-647)*(200-8)/(635-8)))<1e-9);
    const contour=core.paperBubbleContour([88,228,280,104],[280,358],false);
    assert.ok(contour.some(p=>p[0]===280&&p[1]===358));assert.deepEqual(Array.from(contour[0]),Array.from(contour[contour.length-1]));
});
