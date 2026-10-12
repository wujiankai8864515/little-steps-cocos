'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'../../..'),GAME=path.join(ROOT,'games/xiaoyu-cocos/assets'),ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const ctx=vm.createContext({console});vm.runInContext(fs.readFileSync(path.join(ROOT,'engines/travel-core/dist/travel-core.js'),'utf8'),ctx);const core=ctx.LittleStepsCore,queue=[];
class UITransform{setAnchorPoint(){}setContentSize(w,h){this.width=w;this.height=h;}convertToWorldSpaceAR(p){const at=this.node.worldPosition;return {x:p.x+at.x,y:p.y+at.y};}convertToNodeSpaceAR(p){const at=this.node.worldPosition;return {x:p.x-at.x,y:p.y-at.y};}}
class Node{static EventType={TOUCH_START:'down',TOUCH_MOVE:'move',TOUCH_END:'up',TOUCH_CANCEL:'cancel',MOUSE_WHEEL:'wheel',MOUSE_ENTER:'enter',MOUSE_MOVE:'hover',MOUSE_LEAVE:'leave',MOUSE_DOWN:'mouse-down'};constructor(name){this.name=name;this.children=[];this.components=new Map();this.events=new Map();this.position={x:0,y:0};this.scale={x:1,y:1};this.active=true;this.angle=0;this.isValid=true;}addChild(n){this.children.push(n);n.parent=this;}addComponent(T){const c=new T();c.node=this;this.components.set(T,c);return c;}getComponent(T){return this.components.get(T);}getChildByName(name){return this.children.find(c=>c.name===name&&c.isValid);}setPosition(x,y){this.position={x,y};}setScale(x,y){this.scale={x,y};}get worldPosition(){const p=this.parent?.worldPosition||{x:0,y:0};return {x:p.x+this.position.x,y:p.y+this.position.y};}get worldScale(){return {x:1,y:1};}get activeInHierarchy(){return this.isValid&&this.active&&(!this.parent||this.parent.activeInHierarchy);}setSiblingIndex(i){const list=this.parent.children;list.splice(list.indexOf(this),1);list.splice(i,0,this);}destroy(){this.isValid=false;for(const n of this.children.slice())n.destroy();if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}on(e,f){const a=this.events.get(e)||[];a.push(f);this.events.set(e,a);}off(e,f){this.events.set(e,(this.events.get(e)||[]).filter(v=>v!==f));}emit(e,id,x=10,y=10){const at=this.worldPosition,event={getID:()=>id,getUILocation:()=>({x:at.x+x,y:at.y-y})};for(const f of this.events.get(e)||[])f(event);return event;}}
class Sprite{static SizeMode={CUSTOM:1};configure(mesh){this.mesh=mesh;assert.ok(mesh.vertices.length/2<=4096);}geometryChanged(){}}
class Label{static Overflow={NONE:0,RESIZE_HEIGHT:1,CLAMP:2};static HorizontalAlign={CENTER:0,LEFT:1};static VerticalAlign={CENTER:0,TOP:1};updateRenderData(){if(this.overflow!==1)return;const ui=this.node.getComponent(UITransform),lines=this.string.split('\n').reduce((n,s)=>n+Math.max(1,Math.ceil(s.length*this.fontSize/ui.width)),0);ui.height=(lines+.26)*this.lineHeight;}}
class Graphics{clear(){}roundRect(){}moveTo(){}lineTo(){}close(){}fill(){}stroke(){}circle(){}}
class Color{constructor(r,g,b,a=255){Object.assign(this,{r,g,b,a});}}class Vec3{constructor(x,y,z){Object.assign(this,{x,y,z});}}class Vec4{constructor(x,y,z,w){Object.assign(this,{x,y,z,w});}}
class Material{properties={};initialize(){}setProperty(k,v){this.properties[k]=v;}destroy(){this.destroyed=true;}}
const audio=[];class AudioSource{static EventType={STARTED:'started',ENDED:'ended'};play(){this.playing=true;this.node.events.get('started')?.forEach(f=>f());}stop(){this.playing=false;}pause(){this.playing=false;}}
const keys=[],keyUps=[];const cc={view:{getScaleX:()=>1,getScaleY:()=>1},Node,Sprite,UITransform,Label,Graphics,Color,Vec2:Vec3,Vec3,Vec4,Material,AudioSource,LabelOutline:class{},UIOpacity:class{},Mask:class{},Director:{EVENT_AFTER_UPDATE:'update',EVENT_AFTER_DRAW:'draw'},director:{once:(e,f)=>queue.push(f)},Input:{EventType:{KEY_DOWN:'key',KEY_UP:'key-up'}},input:{on:(e,f)=>(e==='key'?keys:keyUps).push(f),off:(e,f)=>{const list=e==='key'?keys:keyUps,i=list.indexOf(f);if(i>=0)list.splice(i,1);}},KeyCode:{ENTER:13,SPACE:32,TAB:9,SHIFT_LEFT:16,SHIFT_RIGHT:2007,ESCAPE:27,ARROW_LEFT:37,ARROW_UP:38,ARROW_DOWN:40,ARROW_RIGHT:39,HOME:36,END:35}},modules={};
require('./viewport-mocks.cjs').installViewportMocks(cc);
const load=name=>{if(modules[name])return modules[name];const exports={};modules[name]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(GAME,'game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:k=>k==='cc'?cc:load(k.slice(2)),LittleStepsCore:core,console:{info(){},error(){}}});if(name==='Engine')exports.meshSprite=()=>Sprite;return exports;};

const {TravelCollectionPage,COLLECTION_RESOURCES}=load('TravelCollectionPage'),{TravelCollectionSession}=load('TravelCollectionSession'),{TravelService}=load('TravelService');
const catalog=JSON.parse(fs.readFileSync(path.join(GAME,'resources/source-catalog.json'))),content=JSON.parse(fs.readFileSync(path.join(GAME,'bundles/home/travel/travel_content.json'))),plain=v=>JSON.parse(JSON.stringify(v));
const flush=()=>{while(queue.length)queue.shift()();},settle=async()=>{for(let i=0;i<4;i++){await new Promise(setImmediate);flush();}};
function fixture(count=0){const service=new TravelService();service.model.content=plain(content);service.configure('collection_test',true);service.model.data.inventory=Array.from({length:count},(_,i)=>({uid:'item'+i,name:'小物'+i,art:i%4,description:'旅途的故事',place:'山门',category:'收藏'}));const root=new Node('App'),scope=new core.Lifetime(),frames=[],requests=[];const assets={catalog,art:k=>catalog.assets[k],font:k=>({k}),effect:k=>({k}),alpha:(k,x,y)=>x%20<10?0:1,frame(k,owner){const f={k};frames.push(f);owner.own(()=>f.disposed=true);return f;},acquireResources(keys,owner){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});requests.push({keys,owner,resolve,reject});return owner.guard(promise);}};const page=new TravelCollectionPage(root,assets,scope,1280,service);page.resume();return {page,service,scope,frames,assets,requests};}
function tap(n,id=1,x=10,y=10){n.emit('down',id,x,y);n.emit('up',id,x,y);flush();}
test('Collection supports empty, single, four and nineteen rewards without mutating inventory or archive count',()=>{
 for(const count of [0,1,4,19]){const f=fixture(count),before=JSON.stringify(f.service.model.data);assert.equal(f.page.snapshot().itemCount,count);assert.equal(f.page.snapshot().controls.filter(k=>k.startsWith('item_')).length,Math.min(count,4));assert.equal(f.page.snapshot().pageCount,Math.max(1,Math.ceil(count/4)));tap(f.page.controls.archive);assert.equal(f.requests.length,0);assert.equal(JSON.stringify(f.service.model.data),before);f.scope.dispose();assert.ok(f.frames.every(v=>v.disposed));assert.equal(f.page.root.isValid,false);}
});
test('Explicit pagination keeps selected detail; arrows browse inventory without moving the current object row',()=>{
 const f=fixture(19),before=JSON.stringify(f.service.model.data);f.page.select(2);tap(f.page.controls.next_page,1,30,75);assert.equal(f.page.snapshot().page,1);assert.equal(f.page.snapshot().selectedIndex,2);assert.deepEqual(plain(f.page.snapshot().controls.filter(k=>k.startsWith('item_'))),['item_4','item_5','item_6','item_7']);keys.forEach(k=>k({keyCode:35}));assert.equal(f.page.snapshot().selectedIndex,18);assert.equal(f.page.snapshot().page,1);assert.equal(JSON.stringify(f.service.model.data),before);f.scope.dispose();
});
test('Live inventory snapshots preserve selected UID across same-count replacements and never leak consumer edits',()=>{
 const s=new TravelCollectionSession(),items=[{uid:'a',name:'A'},{uid:'b',name:'B'},{uid:'c',name:'C'}];assert.equal(s.sync(items,1),true);s.select(1);s.sync([{uid:'b',name:'new'},items[2],items[0]],2);assert.equal(s.index,0);assert.equal(s.item.name,'new');assert.equal(s.archives,2);assert.equal(s.sync([{uid:'b',name:'new'},items[2],items[0]],2),false);s.items[1].name='changed';assert.equal(items[2].name,'C');s.sync([],0);assert.equal(s.index,0);assert.equal(s.page,0);assert.equal(s.select(9),false);
});
test('Object actions use exact fixed source alpha, sticky crossing cancellation, one finger and stale-action invalidation',()=>{
 const f=fixture(4),n=f.page.controls.item_1,o=f.page.objects[1],r=o.rect,region=o.view.region,at=(dx)=>[r[0]-n.position.x+dx*r[2]/region[2],r[1]+n.position.y+r[3]/2],transparent=at(8),opaque=at(23);f.assets.alpha=(_k,x)=>Math.floor(x-region[0])<15?0:1;
 tap(n,1,...transparent);assert.equal(f.page.snapshot().selectedIndex,0);n.emit('down',2,...opaque);n.emit('up',3,...opaque);flush();assert.equal(f.page.snapshot().selectedIndex,0);n.emit('move',2,...transparent);n.emit('move',2,...opaque);n.emit('up',2,...opaque);flush();assert.equal(f.page.snapshot().selectedIndex,0);tap(n,4,...opaque);assert.equal(f.page.snapshot().selectedIndex,1);f.page.select(0);n.emit('down',5,...opaque);n.emit('up',5,...opaque);f.page.pause();flush();assert.equal(f.page.snapshot().selectedIndex,0);f.scope.dispose();
});
function archive(f){let at=1000;f.service.model.data.inventory=[];f.service.wall_clock=()=>at;f.service.configure('collection_archive',true);assert.equal(f.service.depart(700,.3,1),true);at=1100;f.service.reconcile();for(const j of [...f.service.model.data.journals])for(const e of [...j.entries])assert.equal(f.service.review(j.trip_id,e.uid,e.choice),true);f.page.advance(0);assert.equal(f.page.snapshot().archives,1);}
test('Archive waits for resources and draw, returns to the same collection selection, and cannot train twice',async()=>{
 const f=fixture();archive(f);const before=JSON.stringify(f.service.model.data),promise=f.page.openArchive();assert.equal(f.page.snapshot().loading,true);f.requests[0].resolve();await settle();await promise;assert.ok(f.page.snapshot().archive);assert.equal(f.page.snapshot().archive.readonly,true);assert.equal(f.page.canvas.active,false);f.page.archive.page.onBack();assert.equal(f.page.snapshot().archive,null);assert.equal(f.page.canvas.active,true);assert.equal(JSON.stringify(f.service.model.data),before);f.scope.dispose();assert.ok(f.frames.every(v=>v.disposed));
});
test('Cancelled, failed and backgrounded archive loads never revive a closed page and remain retryable',async()=>{
 const f=fixture();archive(f);const late=f.page.openArchive();f.page.cancelArchive();f.requests[0].resolve();await settle();await late;assert.equal(f.page.snapshot().archive,null);assert.equal(f.page.snapshot().loading,false);
 const failure=f.page.openArchive();f.requests[1].reject(Error('network'));await failure;assert.equal(f.page.loading.visible,true);assert.equal(f.page.canvas.active,true);f.page.loading.onRetry();f.requests[2].resolve();await settle();assert.ok(f.page.snapshot().archive);f.page.archive.page.onBack();const hidden=f.page.openArchive();f.page.pause();f.requests[3].resolve();await settle();await hidden;assert.equal(f.page.snapshot().archive,null);f.scope.dispose();
});
test('Collection resize cancels held controls and keeps source layout centered without rebuilding art',()=>{
 const f=fixture(8),frames=f.frames.length,n=f.page.controls.next_page;n.emit('down',1,30,75);f.page.resize(1600);n.emit('up',1,30,75);flush();assert.equal(f.page.snapshot().page,0);assert.equal(f.page.canvas.position.y,-160);assert.equal(f.frames.length,frames);f.scope.dispose();
});

test('Source return tag, conditional actionable sparkles and stretched edge art survive long-screen resize',()=>{
 const f=fixture(8);assert.equal(f.page.returnTag.root.position.x,26);assert.equal(f.page.returnTag.root.position.y,-24);assert.equal(f.page.controls.back.getComponent(UITransform).width,78*.82);assert.equal(f.page.sparkles.length,2);assert.equal(f.page.background.sprite.mesh.vertices.length,8);f.page.resize(1600);const ys=Array.from(f.page.background.sprite.mesh.vertices).filter((_,i)=>i%2);assert.equal(Math.min(...ys),-160);assert.equal(Math.max(...ys),1440);assert.equal(f.page.returnTag.root.worldPosition.y,-24);const frames=f.frames.length;f.page.resize(1280);assert.equal(f.frames.length,frames);assert.equal(f.page.background.sprite.mesh.vertices.length,8);let back=0;f.page.onBack=()=>back++;tap(f.page.controls.back);assert.equal(back,1);f.scope.dispose();assert.ok(f.frames.every(v=>v.disposed));
});
test('Save failure remains visible even when inventory has not changed and clears after recovery',()=>{
 const f=fixture(1);f.service.last_error='quota';f.page.advance(.3);assert.ok(f.page.content.getChildByName('SaveFailure'));f.service.last_error='';f.page.advance(.3);assert.equal(f.page.content.getChildByName('SaveFailure'),undefined);f.scope.dispose();
});

const keyDown=code=>keys.slice().forEach(f=>f({keyCode:code})),keyUp=code=>keyUps.slice().forEach(f=>f({keyCode:code})),keyTap=code=>{keyDown(code);keyUp(code);flush();};
test('Original collection selected/hover color stays above one in float payload without altering source alpha hits',()=>{
 const f=fixture(4),n=f.page.controls.item_1,o=f.page.objects[1],at=[o.rect[0]-n.position.x+o.rect[2]/2,o.rect[1]+n.position.y+o.rect[3]/2];f.assets.alpha=()=>1;
 assert.ok(Math.abs(f.page.objects[0].view.sprite.mesh.vertexData[0]-1.06)<1e-6);assert.equal(o.view.sprite.mesh.vertexData[0],1);
 n.emit('enter',0,...at);assert.equal(f.page.snapshot().feedback.item_1.hovered,true);assert.ok(Math.abs(o.view.sprite.mesh.vertexData[0]-1.06)<1e-6);
 f.assets.alpha=()=>0;n.emit('hover',0,...at);assert.equal(f.page.snapshot().feedback.item_1.hovered,false);assert.equal(o.view.sprite.mesh.vertexData[0],1);
 f.assets.alpha=()=>1;n.emit('down',1,...at);assert.equal(f.page.snapshot().focus,'');n.emit('up',1,...at);flush();assert.equal(f.page.snapshot().selectedIndex,1);assert.equal(f.page.objects[0].view.sprite.mesh.vertexData[0],1);
 n.emit('mouse-down',0,...at);assert.equal(f.page.snapshot().focus,'item_1');assert.equal(f.page.focusMarks.item_1.active,true);f.page.pause();assert.equal(f.page.focusMarks.item_1.active,false);f.scope.dispose();
});
test('Keyboard repeated downs are ignored until release; readonly navigation preserves row and save revision',()=>{
 const f=fixture(19),before=JSON.stringify(f.service.model.data);keyDown(39);keyDown(39);assert.equal(f.page.snapshot().selectedIndex,1);keyUp(39);keyTap(39);assert.equal(f.page.snapshot().selectedIndex,2);keyTap(35);assert.equal(f.page.snapshot().selectedIndex,18);assert.equal(f.page.snapshot().page,0);keyTap(39);assert.equal(f.page.snapshot().selectedIndex,0);keyTap(37);assert.equal(f.page.snapshot().selectedIndex,18);keyTap(36);assert.equal(f.page.snapshot().selectedIndex,0);assert.equal(JSON.stringify(f.service.model.data),before);f.scope.dispose();assert.equal(keyUps.length,0);
});
test('Tab focus skips disabled controls, Shift reverses, keyboard activate releases once and pause cancels a held key',()=>{
 const f=fixture(8);keyTap(9);assert.equal(f.page.snapshot().focus,'back');keyTap(9);assert.equal(f.page.snapshot().focus,'item_0');for(let i=0;i<4;i++)keyTap(9);assert.equal(f.page.snapshot().focus,'next_page');keyDown(32);keyDown(32);assert.equal(f.page.snapshot().page,0);assert.equal(f.page.snapshot().feedback.next_page.pressed,true);keyUp(32);flush();assert.equal(f.page.snapshot().page,1);assert.equal(f.page.snapshot().focus,'');
 keyTap(9);keyDown(16);keyTap(9);keyUp(16);assert.equal(f.page.snapshot().focus,'previous_page');keyDown(13);f.page.pause();keyUp(13);flush();assert.equal(f.page.snapshot().page,1);assert.equal(f.page.snapshot().focus,'');f.page.resume();keyTap(9);let back=0;f.page.onBack=()=>back++;keyTap(13);assert.equal(back,1);f.scope.dispose();
});
test('Page press uses original darkening and sticky owner, archive line is enabled only on real hover/focus',()=>{
 const f=fixture(8),n=f.page.controls.next_page,paint=f.page.pagePaint.next_page;n.emit('down',1,30,75);assert.ok(Math.abs(paint.mesh.vertexData[0]-.9)<1e-6);n.emit('up',2,30,75);assert.ok(Math.abs(paint.mesh.vertexData[0]-.9)<1e-6);n.emit('move',1,-5,75);assert.equal(paint.mesh.vertexData[0],1);n.emit('move',1,30,75);n.emit('up',1,30,75);flush();assert.equal(f.page.snapshot().page,0);
 f.page.controls.archive.emit('enter',0,100,150);assert.equal(f.page.focusMarks.archive.active,false);archive(f);f.page.controls.archive.emit('enter',0,100,150);assert.equal(f.page.focusMarks.archive.active,true);f.page.controls.archive.emit('hover',0,1,1);assert.equal(f.page.focusMarks.archive.active,false);f.page.resize(1600);assert.equal(f.page.snapshot().feedback.archive.hovered,false);f.scope.dispose();
});

test('Actual page directional focus matches native Godot dispatch across every reachable row/paging/archive layout',()=>{
 const oracle=JSON.parse(fs.readFileSync(path.join(ROOT,'builds/records/M08-collection-focus-native.json'))).cases;let checked=0;
 for(let count=0;count<=4;count++)for(const paging of [0,1,2,3])for(const archives of [0,1]){
  if((paging===1&&count===0)||(paging>=2&&count!==4))continue;
  const total=paging===0?count:paging===1?4+count:paging===2?8:12,pageIndex=paging===1||paging===3?1:0,f=fixture(total);
  f.service.model.data.journals=archives?[{archived:true}]:[];f.page.advance(.3);f.page.session.page=pageIndex;f.page.build();
  const rows=oracle[count+'-'+paging+'-'+archives],absolute=name=>name.startsWith('item_')?'item_'+(Number(name.slice(5))+pageIndex*4):name;
  for(const [name,states]of Object.entries(rows))for(const [direction,code]of [['left',37],['up',38],['right',39],['down',40]]){
   f.page.select(0);f.page.focus(absolute(name));keyTap(code);const expected=states[direction];assert.equal(f.page.snapshot().focus,absolute(expected.focus),count+'-'+paging+'-'+archives+' '+name+' '+direction);
   assert.equal(f.page.snapshot().selectedIndex,expected.fallback&&total>=2?(direction==='left'?total-1:1):0);checked++;
  }
  f.scope.dispose();
 }
 assert.equal(checked,412);
});

test('Keyboard confirm takes effect before a following focus move in the same frame, as native Button does',()=>{
 const f=fixture(4);f.page.focus('item_1');keyDown(13);keyUp(13);keyDown(39);keyUp(39);assert.equal(f.page.snapshot().selectedIndex,1);assert.equal(f.page.snapshot().focus,'item_2');flush();assert.equal(f.page.snapshot().selectedIndex,1);f.scope.dispose();
});
