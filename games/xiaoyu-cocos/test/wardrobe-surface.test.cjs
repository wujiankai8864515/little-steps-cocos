const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..'),ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'engines/travel-core/dist/travel-core.js'),'utf8'),context);const core=context.LittleStepsCore,plain=x=>JSON.parse(JSON.stringify(x));
class Vec3{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}}class Vec4{constructor(x=0,y=0,z=0,w=0){Object.assign(this,{x,y,z,w});}}
class Events{constructor(){this.events=new Map();}on(e,f){if(!this.events.has(e))this.events.set(e,new Set());this.events.get(e).add(f);}off(e,f){this.events.get(e)?.delete(f);if(!this.events.get(e)?.size)this.events.delete(e);}emit(e,...args){for(const f of [...(this.events.get(e)||[])])f(...args);}}
class Node extends Events{
 static EventType={CHILD_ADDED:'added',CHILD_REMOVED:'removed',TOUCH_START:'down',TOUCH_MOVE:'move',TOUCH_END:'up',TOUCH_CANCEL:'cancel'};
 constructor(name){super();Object.assign(this,{name,layer:1<<25,children:[],components:new Map(),position:new Vec3(),scale:new Vec3(1,1,1),active:true,isValid:true,angle:0});}
 get scene(){return this.parent?.scene||this;}get activeInHierarchy(){return this.active&&(!this.parent||this.parent.activeInHierarchy);}get worldScale(){const p=this.parent?.worldScale||new Vec3(1,1,1);return new Vec3(p.x*this.scale.x,p.y*this.scale.y,p.z*this.scale.z);}get worldPosition(){const p=this.parent?.worldPosition||new Vec3(),s=this.parent?.worldScale||new Vec3(1,1,1);return new Vec3(p.x+this.position.x*s.x,p.y+this.position.y*s.y,p.z+this.position.z*s.z);}
 addChild(n){n.parent?.removeChild(n);this.children.push(n);n.parent=this;this.emit('added',n);}removeChild(n){this.children.splice(this.children.indexOf(n),1);n.parent=null;this.emit('removed',n);}getChildByName(s){return this.children.find(n=>n.name===s);}addComponent(T){const c=new T();c.node=this;this.components.set(T,c);return c;}getComponent(T){return this.components.get(T);}
 setPosition(x,y,z=0){this.position=new Vec3(x,y,z);}setScale(x,y,z=1){this.scale=new Vec3(x,y,z);}getSiblingIndex(){return this.parent?.children.indexOf(this)||0;}setSiblingIndex(i){const a=this.parent.children;a.splice(a.indexOf(this),1);a.splice(i,0,this);}destroy(){if(!this.isValid)return;this.isValid=false;for(const n of [...this.children])n.destroy();this.parent?.removeChild(this);this.events.clear();}
}
class UITransform{constructor(){this.width=1;this.height=1;}setAnchorPoint(){}setContentSize(w,h){this.width=w;this.height=h;}convertToWorldSpaceAR(p){const q=this.node.worldPosition,s=this.node.worldScale;return new Vec3(q.x+p.x*s.x,q.y+p.y*s.y);}convertToNodeSpaceAR(p){const q=this.node.worldPosition,s=this.node.worldScale;return new Vec3((p.x-q.x)/s.x,(p.y-q.y)/s.y);}}
class Graphics{clear(){}moveTo(){}lineTo(){}close(){}fill(){}stroke(){}circle(){}roundRect(){}}
class Label{static Overflow={NONE:0,RESIZE_HEIGHT:1,CLAMP:2};static HorizontalAlign={CENTER:0};static VerticalAlign={CENTER:0};updateRenderData(){const ui=this.node.getComponent(UITransform);if(this.overflow===0)ui.width=this.string.length*this.fontSize*.6;ui.height=this.lineHeight*1.26;}}
class Sprite{static SizeMode={CUSTOM:1};configure(mesh){this.mesh=mesh;}geometryChanged(){}}
class SpriteFrame{destroy(){this.destroyed=true;}}
class Material{initialize(){}setProperty(){}destroy(){this.destroyed=true;}}
class Camera{static ProjectionType={ORTHO:0};static ClearFlag={SOLID_COLOR:1};enabled=true;get enabledInHierarchy(){return this.enabled&&this.node.activeInHierarchy;}get targetTexture(){return this.target;}set targetTexture(t){if(this.target===t)return;this.target?.cameras.delete(this);this.target=t;t?.cameras.add(this);}}
let targets=[];class RenderTexture{static Filter={LINEAR:2,NONE:0};static WrapMode={CLAMP_TO_EDGE:2};constructor(){this.cameras=new Set();targets.push(this);}initialize(v){Object.assign(this,v);}setFilters(){}setMipFilter(){}setWrapMode(){}destroy(){assert.equal(this.cameras.size,0,'detach surface before freeing target');assert.equal(this.destroyed,undefined,'free target once');this.destroyed=true;}}
const director=new Events();director.once=(event,fn)=>{const cb=()=>{director.off(event,cb);fn();};director.on(event,cb);};const input=new Events(),cc={Node,UITransform,Graphics,Label,Sprite,SpriteFrame,Camera,RenderTexture,Material,Canvas:class{},Color:Vec4,Vec3,Vec4,UIOpacity:class{},director,Director:{EVENT_AFTER_DRAW:'draw',EVENT_AFTER_UPDATE:'update'},input,Input:{EventType:{KEY_DOWN:'key'}},KeyCode:{ESCAPE:27}};
require('./viewport-mocks.cjs').installViewportMocks(cc);
const audio=()=>({player:()=>({gain(){},stop(){},assign(){},play(){}})});
const mods={Engine:{core,lifetime:p=>new core.Lifetime(p),renderSurfaces:()=>core.registerRenderSurface(cc),sharedUI:()=>core.registerUI(cc),meshSprite:()=>Sprite,audioTransport:audio}};
const load=name=>{if(mods[name])return mods[name];const exports={};mods[name]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game/'+name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:k=>k==='cc'?cc:load(k.slice(2)),console});return exports;};
// The real surface, resource gate, page factory, UI and session run below.
// GPU art adapters are substitutes; these checks do not establish rendered art.
for(const name of ['HomeLighting','HomeShadows'])mods[name]={[name]:class{layers=[];receiver(){}add(){}bindSoft(){}update(){}}};
mods.PromptSparkles={PromptSparkles:class{advance(){}}};
mods.ActionMarks={ActionMarks:class{constructor(parent){this.root=load('Visual').nodeAt(parent,'ActionMarks');}clear(){}advance(){}render(){}snapshot(){return {};}}};
const applied=[];mods.OutfitBinding={applyOutfit:(rig,assets,id)=>{applied.push(id);return true;}};
mods.XiaoyuRig={XiaoyuRig:class{receivers=[];liftHeight=0;constructor(parent){this.root=load('Visual').nodeAt(parent,'Rig',15,615);this.body=load('Visual').nodeAt(this.root,'Body');}softMeshes(){return [];}snapshot(){return {};}hitAt(){return true;}focusLost(){}resume(){}suspend(){}resetSecondary(){}advance(){}tap(){}beginLift(){}lift(){}land(){}advanceLanding(){return false;}backpackNodes(){return {body:this.body};}}};
mods.TravelAtlasSprite={TravelAtlasSprite:class{constructor(parent){this.root=load('Visual').nodeAt(parent,'Art');this.sprite=this.root.addComponent(Sprite);}place(r){this.root.setPosition(r[0],-r[1]);}}};
const saved=new Map();mods.TravelStore={travelRuntimeStorage:()=>({getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)})};
const {GameAssets}=load('Assets'),{WardrobePage}=load('WardrobePage'),{WardrobeViewport}=load('WardrobeViewport'),{WardrobeStore}=load('WardrobeStore'),{HomeClock}=load('HomeClock');
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/resources/source-catalog.json')));
function fixture(height=1280){const scene=new Node('Scene'),parent=load('Visual').nodeAt(scene,'App',-360,-640,720,height),scope=new core.Lifetime(),assets=new GameAssets();assets.catalog=catalog;assets.art=k=>catalog.assets[k];assets.frame=()=>({});assets.font=()=>({});assets.effect=()=>({});return {scene,parent,scope,assets,height};}
async function tickUntil(fn){for(let i=0;i<30&&!fn();i++)await Promise.resolve();assert.ok(fn());}
const touch=(node,type,id,world)=>{const e={getID:()=>id,getUILocation:()=>world};node.emit(type,e);return e;};
const worldAt=(node,p)=>node.getComponent(UITransform).convertToWorldSpaceAR(new Vec3(p[0],-p[1]));
async function create(f){let done=false;const p=WardrobePage.create(f.parent,f.assets,f.scope,f.height,new WardrobeStore(),new HomeClock(),()=>false).then(page=>{done=true;return page;});await tickUntil(()=>input.events.has('key'));assert.ok(applied.length>0,'saved outfit is applied before the first draw');assert.equal(done,false);director.emit('draw');await Promise.resolve();assert.equal(done,false);director.emit('draw');const page=await p;assert.equal(page.snapshot().surface.active,false);return page;}
test('Wardrobe waits for full content draws, fits fixed pixels, and maps screen presses into unchanged source coordinates',async()=>{
 const f=fixture(900),page=await create(f),target=targets.at(-1);page.resume();const before=targets.length;
 assert.equal(f.assets.snapshot().reservedBytes,5184000);assert.deepEqual([target.width,target.height],[720,900]);assert.deepEqual(plain(page.snapshot().surface.displayRect),[0,0,720,900]);assert.equal(page.canvas.scale.x,.703125);
 const frame=page.viewport.input;let seen;const down=page.down.bind(page);page.down=(p,id)=>{seen=plain(p);return down(p,id);};
 // Original 900-high contained transform for the right cloth centre.
 const at={x:-360+106.875+490*.703125,y:640-405*.703125};touch(frame,'down',1,at);touch(frame,'up',1,at);assert.deepEqual(seen,[490,405]);assert.equal(page.session.selected,'peach');assert.deepEqual(plain(page.session.choices),['直接解锁','先不换']);
 page.advance(.25);page.advance(.2);const no=page.bubble.snapshot().choices.no,p=[no[0]+no[2]/2,no[1]+no[3]/2];touch(frame,'down',2,worldAt(frame,p));touch(frame,'up',2,worldAt(frame,p));await Promise.resolve();assert.equal(page.session.selected,'original');
 page.resize(1600,1440);assert.deepEqual(plain(page.snapshot().surface.displayRect),[0,0,720,1600]);assert.equal(page.canvas.scale.x,1);assert.equal(targets.length,before+1);assert.equal(page.snapshot().surface.pixels[0],720);assert.equal(page.snapshot().surface.pixels[1],1600);
 const parentScale=.75;f.parent.setScale(parentScale,parentScale);page.resize(900,405);seen=null;touch(frame,'down',3,{x:-360+(106.875+490*.703125)*parentScale,y:640-405*.703125*parentScale});touch(frame,'up',3,worldAt(frame,[490,405]));assert.deepEqual(seen,[490,405]);
 page.pause();assert.equal(page.snapshot().surface.active,false);page.resume(false);assert.equal(page.snapshot().surface.active,true);assert.equal(page.active,false);page.resume();f.scope.dispose();assert.equal(f.assets.snapshot().reservedBytes,0);assert.equal(target.destroyed,true);assert.equal(input.events.size,0);assert.equal(f.scene.children.length,1);assert.equal(f.parent.children.length,0);
});
test('Offscreen hanging return owns an onscreen hit area, rejects another finger and withdrawn/stale actions, and cleans listeners',async()=>{
 const f=fixture(900),page=await create(f);page.resume();let backs=0;page.onBack=()=>backs++;const frame=page.viewport.input,hit=frame.getChildByName('FixedReturnHitArea');assert.ok(hit);assert.equal(page.returnControl.root.getChildByName('FixedReturnHitArea'),undefined);assert.notEqual(hit.layer,page.returnControl.root.layer);
 const at=worldAt(hit,[hit.getComponent(UITransform).width/2,hit.getComponent(UITransform).height/2]);touch(hit,'down',8,at);touch(hit,'cancel',9,at);touch(hit,'up',8,at);director.emit('update');assert.equal(backs,1);
 touch(hit,'down',8,at);touch(hit,'move',8,worldAt(frame,[200,400]));touch(hit,'move',8,at);touch(hit,'up',8,at);director.emit('update');assert.equal(backs,1);
 touch(hit,'down',8,at);touch(hit,'up',8,at);page.pause();director.emit('update');assert.equal(backs,1);page.resume();touch(hit,'down',8,at);touch(hit,'up',8,at);f.scope.dispose();director.emit('update');assert.equal(backs,1);assert.equal(hit.isValid,false);assert.equal(hit.events.size,0);
});
test('Window glass triangles cover the original polygon without overlapping and sample the actual window pixels after resizing',async()=>{
 const f=fixture(),page=await create(f),glass=page.canvas.getChildByName('WindowGlass').getComponent(Sprite),mesh=glass.mesh;
 const triangleArea=(a,b,c)=>{const p=mesh.vertices;return ((p[b*2]-p[a*2])*(p[c*2+1]-p[a*2+1])-(p[b*2+1]-p[a*2+1])*(p[c*2]-p[a*2]))/2;};
 const areas=[];for(let i=0;i<mesh.indices.length;i+=3)areas.push(triangleArea(...mesh.indices.slice(i,i+3)));
 assert.ok(areas.every(v=>v>0),'both triangles must share winding; crossed Godot order overlaps the glass');
 assert.equal(areas.reduce((a,b)=>a+b,0),141*(603+595)/2);
 assert.deepEqual(plain(mesh.source),plain(mesh.vertices),'reflection mask must sample underlying wood and glass at the same position');
 for(const height of [900,1280,1600,2160]){page.resize(height);assert.deepEqual(plain(mesh.source),plain(mesh.vertices));}
 f.scope.dispose();
});
test('Cancellation before first draw destroys target/listeners without presenting; each repeated page needs two fresh draws',async()=>{
 const f=fixture();const cancelled=WardrobePage.create(f.parent,f.assets,f.scope,1280,new WardrobeStore(),new HomeClock(),()=>false);await tickUntil(()=>input.events.has('key'));f.scope.dispose();await assert.rejects(cancelled,{name:'CancelledError'});assert.equal(f.assets.snapshot().entries,0);assert.equal(input.events.size,0);assert.equal(director.events.size,0);
 for(let i=0;i<8;i++){const next=fixture(i%2?900:1600),page=await create(next);page.resume();page.resize(1280,2160);page.pause();next.scope.dispose();assert.equal(next.assets.snapshot().entries,0);assert.equal(next.parent.children.length,0);}assert.equal(director.events.size,0);assert.ok(targets.every(t=>t.destroyed));
});
test('Budget and constructor failures release partial pages and allow later retry under the original owner',async()=>{
 const f=fixture();f.assets.gate=new core.ResourceGate({maxBytes:7372799});const count=targets.length;await assert.rejects(WardrobePage.create(f.parent,f.assets,f.scope,1280,new WardrobeStore(),new HomeClock(),()=>false));assert.equal(targets.length,count);assert.equal(f.scope.active,true);assert.equal(f.scope.disposers.length,0);assert.equal(f.parent.children.length,0);
 f.assets.gate=new core.ResourceGate();f.assets.effect=()=>{throw Error('shader unavailable');};await assert.rejects(WardrobePage.create(f.parent,f.assets,f.scope,1280,new WardrobeStore(),new HomeClock(),()=>false),/shader unavailable/);assert.equal(f.assets.snapshot().entries,0);assert.equal(f.parent.children.length,0);assert.equal(f.scope.disposers.length,0);assert.equal(director.events.size,0);
 f.assets.effect=()=>({});const page=await create(f);page.resume();f.scope.dispose();assert.equal(f.assets.snapshot().entries,0);
});

test('Saved peach is bound during preparation, before the first visible render target frame',async()=>{
 const f=fixture(),store=new WardrobeStore();store.unlockTemporaryLocal('peach');store.equip('peach');const before=applied.length;const request=WardrobePage.create(f.parent,f.assets,f.scope,1280,store,new HomeClock(),()=>false);await tickUntil(()=>input.events.has('key'));assert.equal(applied.length,before+1);assert.equal(applied.at(-1),'peach');director.emit('draw');director.emit('draw');const page=await request;assert.equal(page.session.active,false);page.resume();assert.equal(page.session.selected,'peach');f.scope.dispose();
});
