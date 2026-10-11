const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
let safeReads=0,safe={x:0,y:0,width:720,height:1280};
class UITransform{constructor(){this.width=720;this.height=1280;}setContentSize(w,h){this.width=w;this.height=h;}get contentSize(){return {width:this.width,height:this.height};}}
class Node{constructor(name){this.name=name;this.children=[];this.ui=new UITransform();this.position={x:0,y:0};this.scale={x:1,y:1};}getComponent(){return this.ui;}setPosition(x,y){this.position={x,y};}setScale(x,y){this.scale={x,y};}getChildByName(name){return this.children.find(c=>c.name===name);}addChild(n){this.children.push(n);n.parent=this;}}
const cc={Node,UITransform,screen:{windowSize:{width:720}},sys:{getSafeAreaRect(){safeReads++;return safe;}},Graphics:class{}};
const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../../engines/travel-core/dist/travel-core.js'),'utf8'),context);const core=context.LittleStepsCore;
const mods={Engine:{core}},load=name=>{if(mods[name])return mods[name];const exports={};mods[name]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:k=>k==='cc'?cc:(mods[k.slice(2)]||{}),console:{info(){},error(){}}});return exports;};
load('Viewport');load('HomeRenderPlan');const {GameAssets}=load('Assets'),{HomePage}=load('HomePage'),{Application}=load('Application');
test('Application resizes active and retained pages exactly once per changed viewport and moves the top-left origin',()=>{
 const canvas=new Node('Canvas'),root=new Node('App'),calls=[];const page={resize:(...a)=>calls.push(['active',...a])},cached={resize:(...a)=>calls.push(['cached',...a])};
 const app=Object.create(Application.prototype);Object.assign(app,{canvas,root,page,homePage:{page},darkroomPage:{page:cached},viewportKey:'',viewportDimensions:'',viewportDirty:true,pageViewports:new WeakMap(),viewportFailures:new WeakMap()});
 safeReads=0;app.refreshViewport();assert.equal(calls.length,2);assert.equal(safeReads,1);assert.deepEqual(root.position,{x:-360,y:640});
 for(let i=0;i<10000;i++)app.refreshViewport();assert.equal(calls.length,2);assert.equal(safeReads,1);
 canvas.ui.setContentSize(720,1690);cc.screen.windowSize.width=1440;safe={x:0,y:34,width:720,height:1612};app.refreshViewport();assert.equal(calls.length,4);assert.equal(app.height,1690);assert.deepEqual(calls[2],['active',1690,1440]);assert.deepEqual(root.position,{x:-360,y:845});
 const late={resize:(...a)=>calls.push(['late',...a])};app.fitPage(late);assert.deepEqual(calls.at(-1),['late',1690,1440]);app.fitPage(late);assert.equal(calls.length,5);
 canvas.ui.setContentSize(0,0);app.refreshViewport();assert.equal(app.height,1690);assert.equal(calls.length,5);
});
test('Budget rejection does not stop the application update loop or spam retries, and a later resize can recover',()=>{
 const app=Object.create(Application.prototype),canvas=new Node('Canvas');let attempts=0,fail=true;
 const page={resize(){attempts++;if(fail)throw Error('budget');}};Object.assign(app,{canvas,root:new Node('App'),page,viewportKey:'',viewportDimensions:'',viewportDirty:true,pageViewports:new WeakMap(),viewportFailures:new WeakMap()});
 app.refreshViewport();for(let i=0;i<30;i++)app.refreshViewport();assert.equal(attempts,1);fail=false;canvas.ui.setContentSize(720,1440);app.refreshViewport();assert.equal(attempts,2);assert.equal(app.pageViewports.get(page),app.viewportKey);
});
test('Home viewport changes retain live actors while updating the actual shared input plan, renderer, HUD and bleed edges',()=>{
 const plan=mods.HomeRenderPlan.homeRenderPlan(1280,720),page=Object.create(HomePage.prototype),events=[],root=new Node('Home'),world=new Node('World');
 for(const n of ['UpperBleedEdge','LowerBleedEdge'])world.addChild(new Node(n));
 const actor={merit:91,pose:123,trip:'saved'};
 Object.assign(page,{plan,root,roomRoot:world,rig:actor,targetLease:{texture:{},resize:(w,h)=>events.push(['target',w,h])},pointerBinding:{cancel:()=>events.push(['cancel'])},travelInteractions:{cancelPointer:()=>events.push(['travelCancel'])},surface:{layout:(...a)=>events.push(['layout',...a])},hud:{resize:h=>events.push(['hud',h])}});
 page.resize(1800,1440);assert.equal(page.viewportOffset,260);assert.equal(plan.offset,260);assert.deepEqual(Array.from(plan.logical),[720,1800]);assert.equal(page.rig,actor);assert.equal(actor.merit,91);assert.deepEqual(world.position,{x:0,y:-260});
 assert.equal(world.getChildByName('UpperBleedEdge').active,true);assert.deepEqual(world.getChildByName('UpperBleedEdge').position,{x:0,y:260});assert.equal(world.getChildByName('LowerBleedEdge').scale.y,100/64);assert.deepEqual(events[0],['target',1440,3600]);
 page.resize(1280,720);assert.equal(world.getChildByName('UpperBleedEdge').active,false);assert.equal(page.viewportOffset,0);assert.equal(page.rig,actor);
});
test('Real GameAssets keeps one admitted target slot across repeated resize, corrects byte reservation and releases once',async()=>{
 const assets=new GameAssets(),scope=new core.Lifetime();let destroyed=0,created=0;
 const renderer={estimateTarget:(w,h)=>w*h*8,createTarget:(w,h)=>{created++;return {width:w,height:h,destroy(){destroyed++;}};},resizeTarget:(v,w,h)=>Object.assign(v,{width:w,height:h})};
 const target=await assets.acquireResizableTarget('viewport-test',720,1280,renderer,scope);
 assert.equal(assets.snapshot().entries,1);for(const [w,h]of [[1440,3380],[720,1280],[1080,2160]]){target.resize(w,h);assert.equal(assets.snapshot().reservedBytes,w*h*8);assert.equal(assets.snapshot().entries,1);assert.equal(target.texture.height,h);}
 assert.equal(created,4);assert.equal(destroyed,3);scope.dispose();assert.equal(destroyed,4);assert.equal(assets.snapshot().reservedBytes,0);
});
