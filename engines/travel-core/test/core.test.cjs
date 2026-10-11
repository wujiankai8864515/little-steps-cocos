const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const context = vm.createContext({Float32Array, Uint16Array, console});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/travel-core.js'), 'utf8'), context);
const core = context.LittleStepsCore;
test('Confirmation layout reserves the original 62px choice row, minimum paper height and stricter head clearance',()=>{
 const safe=[24,135,672,1025],options={confirmation:true,minWidth:320,maxWidth:430,aboveOnly:true},r=core.infoBubbleLayout([350,666],safe,240,28,options);
 assert.deepEqual(Array.from(r),[190,504,320,142]);assert.deepEqual(Array.from(core.infoBubbleLayout([350,308],safe,240,28,options)),[350,308,0,0]);
 const long=core.infoBubbleLayout([350,666],safe,600,72,options);assert.equal(long[2],430);assert.equal(long[3],178);
});
test('Modal choices keep a single sticky target, prohibit early accept, allow early cancel and reject another finger',()=>{
 const owner=new core.BubblePointer(),card=[190,504,320,142],choices={yes:[208,592,136,44],no:[356,592,136,44]};
 owner.down(1,[240,615],card,choices,'pop');assert.equal(owner.up(1,[240,615],card,choices,'hold'),'');
 owner.down(1,[380,615],card,choices,'pop');assert.equal(owner.up(2,[380,615],card,choices,'pop'),null);assert.equal(owner.up(1,[380,615],card,choices,'pop'),'no');
 owner.down(1,[240,615],card,choices,'hold');owner.move(1,[380,615],card);owner.move(1,[240,615],card);assert.equal(owner.up(1,[240,615],card,choices,'hold'),'');
 owner.down(3,[50,50],card,choices,'reveal');owner.move(3,[300,550],card);owner.move(3,[50,50],card);assert.equal(owner.up(3,[50,50],card,choices,'hold'),'');
 owner.down(3,[50,50],card,choices,'reveal');assert.equal(owner.up(3,[50,50],card,choices,'reveal'),'outside');owner.down(3,[240,615],card,choices,'hold');assert.equal(owner.up(3,[240,615],card,choices,'closing'),'');
 owner.down(4,[240,615],card,choices,'hold');owner.cancel();assert.equal(owner.up(4,[240,615],card,choices,'hold'),null);
});
test('Confirmation renderer shares wrapping and head clearance with information bubbles, and emits one decision',()=>{
 class Node {constructor(name){this.name=name;this.children=[];this.active=true;this.components=new Map();}addChild(child){child.parent=this;this.children.push(child);}addComponent(T){const value=new T();value.node=this;this.components.set(T,value);return value;}getComponent(T){return this.components.get(T);}setPosition(x,y){this.position=[x,y];}destroy(){this.destroyed=true;}}
 class UITransform {setAnchorPoint(){}setContentSize(w,h){this.width=w;this.height=h;}}
 class Label {updateRenderData(){const ui=this.node.getComponent(UITransform);if(this.overflow===0)ui.width=240;ui.height=this.lineHeight*1.26;}}
 Label.Overflow={NONE:0,RESIZE_HEIGHT:1,CLAMP:2};Label.HorizontalAlign={CENTER:0};Label.VerticalAlign={CENTER:0};
 class Graphics {clear(){}moveTo(){}lineTo(){}close(){}fill(){}stroke(){}}
 const cc={Node,UITransform,Label,Graphics,UIOpacity:class{},Color:class{constructor(...rgba){this.rgba=rgba;}}},events=[],bubble=core.registerUI(cc).confirmationBubble(new Node('room'),{},'A confirmation',[350,100],[24,135,672,1025],{aboveOnly:true,minWidth:320,cancelLighten:.13,onDecision:value=>events.push(value)});
 bubble.advance(5);assert.equal(bubble.snapshot().phase,'pop');bubble.setAnchor([350,666]);bubble.advance(.25);bubble.advance(.2);assert.equal(bubble.snapshot().phase,'hold');assert.equal(bubble.text.node.getComponent(UITransform).height,40);
 const r=bubble.snapshot().choices.yes,p=[r[0]+r[2]/2,r[1]+r[3]/2];bubble.down(7,p);bubble.up(7,p);assert.deepEqual(events,[true]);assert.equal(bubble.snapshot().phase,'closing');bubble.down(7,p);bubble.up(7,p);assert.deepEqual(events,[true]);bubble.close();bubble.advance(.19);assert.equal(bubble.root.active,false);
});
test('Information bubbles stay in the safe area and reserve head clearance across moving anchors',()=>{
 const safe=[24,135,672,1025],options={minWidth:320,maxWidth:430,aboveOnly:true};
 assert.deepEqual(Array.from(core.infoBubbleLayout([350,100],safe,96,30,options)),[350,100,0,0]);
 for(const anchor of [[350,666],[5,600],[715,900],[350,270]]){const r=core.infoBubbleLayout(anchor,safe,96,30,options);assert.ok(r[0]>=30&&r[0]+r[2]<=690);assert.ok(r[1]>=141&&r[1]+r[3]<=Math.min(1160,anchor[1]+6)-6);assert.equal(r[2],320);}
});
test('Blocked speaker clearance pauses bubble entrance and resumes it without consuming its hold time',()=>{
 class Node {constructor(name){this.name=name;this.children=[];this.active=true;this.components=new Map();}addChild(child){child.parent=this;this.children.push(child);}addComponent(T){const value=new T();value.node=this;this.components.set(T,value);return value;}getComponent(T){return this.components.get(T);}setPosition(){}destroy(){this.destroyed=true;}}
 class UITransform {setAnchorPoint(){}setContentSize(w,h){this.width=w;this.height=h;}}
 class Label {updateRenderData(){const ui=this.node.getComponent(UITransform);if(this.overflow===0)ui.width=96;ui.height=this.lineHeight*1.26;}}
 Label.Overflow={NONE:0,RESIZE_HEIGHT:1,CLAMP:2};Label.HorizontalAlign={CENTER:0};Label.VerticalAlign={CENTER:0};
 class Graphics {clear(){}moveTo(){}lineTo(){}close(){}fill(){}stroke(){}}
 const cc={Node,UITransform,Label,Graphics,UIOpacity:class{},Color:class{constructor(...rgba){this.rgba=rgba;}}},bubble=core.registerUI(cc).infoBubble(new Node('room'),{},'还没燃尽',[350,100],[24,135,672,1025],{aboveOnly:true,minWidth:320});
 assert.equal(bubble.root.active,true);assert.equal(bubble.snapshot().speakerClearanceBlocked,true);assert.ok(bubble.root.children.every(c=>!c.active));bubble.advance(10);assert.equal(bubble.snapshot().phase,'pop');
 bubble.setAnchor([350,666]);assert.equal(bubble.snapshot().speakerClearanceBlocked,false);assert.ok(bubble.root.children.every(c=>c.active));bubble.advance(.25);bubble.advance(.2);assert.equal(bubble.snapshot().phase,'hold');bubble.close();bubble.advance(.19);assert.equal(bubble.root.active,false);bubble.setAnchor([350,600]);assert.equal(bubble.root.active,false);
});
function fakePointerEngine(){
 class Node {constructor(){this.isValid=true;this.activeInHierarchy=true;this.events=new Map();this.ui={width:100,height:80,convertToNodeSpaceAR:p=>p};}on(e,f){this.events.set(e,f);}off(e,f){if(this.events.get(e)===f)this.events.delete(e);}getComponent(){return this.ui;}emit(e,id,x=20,y=30){const event={getID:()=>id,getUILocation:()=>({x,y:-y})};const f=this.events.get(e);if(f)f(event);return event;}}
 Node.EventType={TOUCH_START:'down',TOUCH_MOVE:'move',TOUCH_END:'up',TOUCH_CANCEL:'cancel'};
 class Vec3 {constructor(x,y,z){Object.assign(this,{x,y,z});}}
 const queue=[];return {Node,Vec3,UITransform:class{},Director:{EVENT_AFTER_UPDATE:'frame'},director:{once:(e,f)=>queue.push(f)},flush(){while(queue.length)queue.shift()();}};
}
function fakeWrappedBubbleEngine(){
 class Node {constructor(name){this.name=name;this.children=[];this.active=true;this.components=new Map();}addChild(child){child.parent=this;this.children.push(child);}addComponent(T){const value=new T();value.node=this;this.components.set(T,value);return value;}getComponent(T){return this.components.get(T);}setPosition(x,y){this.position=[x,y];}destroy(){this.destroyed=true;if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}}
 class UITransform {setAnchorPoint(){}setContentSize(w,h){this.width=w;this.height=h;}}
 class Label {updateRenderData(){const ui=this.node.getComponent(UITransform),natural=this.string.length*this.fontSize;if(this.overflow===0)ui.width=natural;ui.height=(Math.ceil(natural/ui.width)+.26)*this.lineHeight;}}
 Label.Overflow={NONE:0,RESIZE_HEIGHT:1,CLAMP:2};Label.HorizontalAlign={CENTER:0};Label.VerticalAlign={CENTER:0};
 class Graphics {clear(){}moveTo(){}lineTo(){}close(){}fill(){}stroke(){}}
 return {Node,UITransform,Label,Graphics,UIOpacity:class{},Color:class{constructor(...rgba){this.rgba=rgba;}}};
}
test('Changing bubble safe width rewraps text, preserves anchor clearance and removes temporary measurement nodes',()=>{
 const cc=fakeWrappedBubbleEngine(),host=new cc.Node('room'),bubble=core.registerUI(cc).infoBubble(host,{},'A long message that requires wrapping',[350,666],[24,28,672,1000],{fontSize:28,minWidth:220,maxWidth:330});
 const wide=bubble.snapshot().card.slice();bubble.setSafe([240,28,220,1000]);const narrow=bubble.snapshot().card;
 assert.ok(narrow[2]<wide[2]);assert.ok(narrow[3]>wide[3]);assert.ok(narrow[0]>=246&&narrow[0]+narrow[2]<=454);assert.ok(narrow[1]+narrow[3]<666);
 for(let i=0;i<20;i++)bubble.setAnchor([350+i,666]);assert.equal(host.children.filter(n=>n.name==='BubbleMeasurement').length,0);
 assert.throws(()=>bubble.setSafe([0,0,NaN,1000]),/Invalid bubble safe rect/);bubble.setSafe([24,28,672,1000]);assert.equal(bubble.snapshot().card[3],wide[3]);
});
test('A cancel-only waiting bubble cannot accept an entry and emits its cancellation once',()=>{
 const cc=fakeWrappedBubbleEngine(),decisions=[],bubble=core.registerUI(cc).confirmationBubble(new cc.Node('room'),{},'Loading',[350,666],[24,28,672,1000],{cancelOnly:true,cancelText:'Cancel',minWidth:320,onDecision:x=>decisions.push(x)});
 bubble.advance(.25);bubble.advance(.2);const state=bubble.snapshot();assert.equal(state.choices.yes,undefined);assert.ok(state.choices.no);
 const r=state.choices.no,p=[r[0]+r[2]/2,r[1]+r[3]/2];bubble.down(1,p);bubble.up(1,p);bubble.down(1,p);bubble.up(1,p);assert.deepEqual(decisions,[false]);assert.equal(bubble.snapshot().phase,'closing');
});
test('Shared pointer ownership ignores another finger and releases all callbacks on disabled capture and disposal',()=>{
 const cc=fakePointerEngine(),node=new cc.Node(),events=[];let enabled=true;
 const binding=core.registerUI(cc).pointer(node,{down:(p,id)=>events.push(['down',id]),move:(p,id)=>events.push(['move',id]),up:(p,id)=>events.push(['up',id]),cancel:()=>events.push(['cancel'])},()=>enabled);
 node.emit('down',1);node.emit('down',2);node.emit('move',2);node.emit('cancel',2);node.emit('up',2);node.emit('move',1,200,30);node.emit('up',1,200,30);assert.deepEqual(events,[['down',1],['move',1],['up',1]]);
 node.emit('down',3);enabled=false;node.emit('move',3);assert.deepEqual(events.slice(-2),[['down',3],['cancel']]);enabled=true;node.emit('up',3);binding.dispose();assert.equal(node.events.size,0);node.emit('down',4);assert.equal(events.length,5);
});
test('Deferred button actions reject a wrong-finger cancel, a withdrawn contact and a late callback after disposal',()=>{
 const cc=fakePointerEngine(),node=new cc.Node();let accepted=0;const binding=core.registerUI(cc).action(node,()=>accepted++);
 node.emit('down',1);node.emit('cancel',2);node.emit('up',1);cc.flush();assert.equal(accepted,1);
 node.emit('down',1);node.emit('move',1,101,30);node.emit('move',1);node.emit('up',1);cc.flush();assert.equal(accepted,1);
 node.emit('down',1);node.emit('up',1);binding.dispose();cc.flush();assert.equal(accepted,1);assert.equal(node.events.size,0);
});
test('A transparent-pixel refusal neither owns nor consumes the pointer and a later accepted contact still releases once',()=>{
 const cc=fakePointerEngine(),node=new cc.Node();let opaque=false,released=0,downs=0;
 const binding=core.registerUI(cc).pointer(node,{down:()=>{downs++;return opaque;},up:()=>released++});
 const rejected=node.emit('down',1);assert.equal(rejected.propagationStopped,undefined);node.emit('up',1);assert.equal(released,0);opaque=true;const accepted=node.emit('down',2);assert.equal(accepted.propagationStopped,true);node.emit('up',2);assert.equal(released,1);assert.equal(downs,2);binding.dispose();
});
test('Suspended paper feedback remains bounded and uses the original positive press impulse',()=>{
 const swing=new core.SwingFeedback();swing.press();assert.equal(swing.velocity,.12);assert.equal(swing.scale,.955);swing.release();assert.equal(swing.pressTime,.075);
 for(let i=0;i<3000;i++){swing.advance(i%17?1/60:1);assert.ok(Math.abs(swing.angle)<=.045);assert.ok(swing.scale>=.955&&swing.scale<=1.01);}const previous=JSON.stringify(swing);swing.advance(NaN);assert.equal(JSON.stringify(swing),previous);assert.equal(swing.scale,1);
});
function fakeSurfaceEngine() {
    class Node {
        constructor(name) {this.name=name;this.layer=1<<30;this.children=[];this.events=new Map();this.active=true;this.destroyCount=0;}
        on(event,callback) {this.events.set(event,callback);}
        off(event,callback) {if(this.events.get(event)===callback)this.events.delete(event);}
        addChild(child) {if(child.parent)child.parent.removeChild(child);child.parent=this;this.children.push(child);const callback=this.events.get('added');if(callback)callback(child);}
        removeChild(child) {this.children.splice(this.children.indexOf(child),1);child.parent=null;const callback=this.events.get('removed');if(callback)callback(child);}
        setPosition(...p) {this.position=p;}
        addComponent(Type) {const component=new Type();component.node=this;return component;}
        destroy() {this.destroyCount++;}
    }
    Node.EventType={CHILD_ADDED:'added',CHILD_REMOVED:'removed'};
    class UITransform {setAnchorPoint(...value){this.anchor=value;}setContentSize(width,height){this.width=width;this.height=height;}}
    class Sprite {} Sprite.SizeMode={CUSTOM:1};
    class SpriteFrame {constructor(){this.destroyCount=0;}destroy(){this.destroyCount++;}}
    class Camera {constructor(){this.enabledInHierarchy=true;}} Camera.ProjectionType={ORTHO:0};Camera.ClearFlag={SOLID_COLOR:1};
    class Canvas {} class Color {constructor(...rgba){this.rgba=rgba;}}
    class RenderTexture {initialize(info){Object.assign(this,info);}setFilters(){}setMipFilter(){}setWrapMode(){}destroy(){this.destroyed=true;}}
    RenderTexture.Filter={LINEAR:2,NONE:0};RenderTexture.WrapMode={CLAMP_TO_EDGE:2};
    const drawListeners=new Set(),director={on(event,callback){drawListeners.add(callback);},off(event,callback){drawListeners.delete(callback);},draw(){for(const callback of drawListeners)callback();}},Director={EVENT_AFTER_DRAW:'draw'};
    return {Node,UITransform,Sprite,SpriteFrame,Camera,Canvas,Color,RenderTexture,director,Director};
}
test('Offscreen surface isolates newly attached descendants and restores detached layers without fading the presentation twice',()=>{
    const cc=fakeSurfaceEngine(),scope=new core.Lifetime(),host=new cc.Node('scene'),displayParent=new cc.Node('page'),renderer=core.registerRenderSurface(cc),target=renderer.createTarget(720,1280,'room');
    displayParent.layer=1<<25;
    const surface=renderer.create({host,displayParent,logicalSize:[720,1440],displayRect:[0,-80,720,1440],target,layer:1<<19},scope);
    const root=new cc.Node('world'),leaf=new cc.Node('sprite');root.addChild(leaf);surface.content.addChild(root);
    assert.equal(root.layer,1<<19);assert.equal(leaf.layer,1<<19);assert.equal(surface.camera.visibility,1<<19);
    assert.equal(surface.content.parent.parent,host);assert.equal(surface.display.parent,displayParent);
    assert.equal(surface.display.layer,1<<25);assert.equal(surface.camera.orthoHeight,720);
    surface.content.removeChild(root);assert.equal(root.layer,1<<30);assert.equal(leaf.layer,1<<30);assert.equal(root.events.size,0);
    surface.content.addChild(root);const dynamic=new cc.Node('later');leaf.addChild(dynamic);assert.equal(dynamic.layer,1<<19);
    surface.setActive(false);assert.equal(surface.snapshot().active,false);surface.setActive(true);
    scope.dispose();surface.dispose();assert.equal(surface.snapshot().disposed,true);assert.equal(surface.camera.targetTexture,null);assert.equal(surface.camera.enabled,false);
    assert.equal(surface.content.parent.destroyCount,1);assert.equal(surface.display.destroyCount,1);assert.equal(leaf.events.size,0);assert.equal(surface.layout([720,1280],[0,0,720,1280],target),false);
    // The caller's resource gate owns the target. Surface disposal never frees
    // a texture while another admitted owner may still use it.
    assert.equal(target.destroyed,undefined);
});
test('Render-target admission includes color/depth before allocation and cancellation releases the late target once',async()=>{
    const renderer=core.registerRenderSurface(fakeSurfaceEngine()),bytes=renderer.estimateTarget(720,1280),gate=new core.ResourceGate({maxBytes:bytes}),scope=new core.Lifetime();
    assert.equal(bytes,7372800);assert.throws(()=>renderer.estimateTarget(0,1),/size/);
    let resolve,created=0,released=0;
    const request=gate.acquire([{key:'room',bytes}],()=>{created++;assert.equal(gate.snapshot().reservedBytes,bytes);return new Promise(r=>resolve=r);},()=>released++,scope);
    await Promise.resolve();await assert.rejects(gate.acquire([{key:'other',bytes:8}],()=>created++,()=>{},scope),/budget/);assert.equal(created,1);
    scope.dispose();assert.equal(gate.snapshot().reservedBytes,bytes);resolve({texture:true});await assert.rejects(request,{name:'CancelledError'});
    assert.equal(released,1);assert.equal(gate.snapshot().reservedBytes,0);
});
test('Surface preparation waits for two completed draws, pauses inactive frames, and cancels without retaining listeners',async()=>{
 const cc=fakeSurfaceEngine(),renderer=core.registerRenderSurface(cc),owner=new core.Lifetime(),host=new cc.Node('scene'),page=new cc.Node('page'),target=renderer.createTarget(720,1280,'room');
 const create=scope=>renderer.create({host,displayParent:page,logicalSize:[720,1280],displayRect:[0,0,720,1280],target},scope);
 const surface=create(owner);let settled=false;surface.ready.then(()=>settled=true);
 surface.setActive(false);cc.director.draw();assert.equal(surface.snapshot().readyFrames,0);surface.setActive(true);
 cc.director.draw();await Promise.resolve();assert.equal(settled,false);cc.director.draw();await surface.ready;assert.equal(settled,true);
 const cancelledScope=new core.Lifetime(),cancelled=create(cancelledScope);assert.notEqual(surface.camera.visibility,cancelled.camera.visibility);cancelledScope.dispose();await assert.rejects(cancelled.ready,{name:'CancelledError'});cc.director.draw();assert.equal(cancelled.snapshot().readyFrames,0);
 const reusedScope=new core.Lifetime(),reused=create(reusedScope);assert.equal(reused.camera.visibility,cancelled.camera.visibility);reusedScope.dispose();await assert.rejects(reused.ready,{name:'CancelledError'});
 owner.dispose();
});
test('UI mesh custom payload preserves unclamped source coordinates and leaves alpha to UIOpacity',()=>{
    class Sprite {constructor(){this.color={r:255,g:255,b:255,a:128};}get renderData(){return this._renderData;}destroyRenderData(){this._renderData=null;}requestRenderData(){return this._renderData={data:[],floatStride:9,chunk:{setIndexBuffer(){}},resize(n){this.chunk.vb=new Float32Array(n*9);},get dataLength(){return this._length;},set dataLength(n){this._length=n;this.data=Array.from({length:n},()=>({}));}};}getRenderMaterial(){return {};}markForUpdateRenderData(){}}
    const Mesh=core.registerCocos({Sprite,_decorator:{ccclass:()=>type=>type}}),sprite=new Mesh();
    const mesh=core.createGrid([0,0,10,10],10);mesh.vertexData=new Float32Array(mesh.source.length/2*3);mesh.vertexData.set([-10,1100,256]);sprite.configure(mesh,[10,10]);
    const vb=sprite._renderData.chunk.vb;near(Array.from(vb.slice(5,8)),[-10,1100,256]);assert.ok(Math.abs(vb[8]-128/255)<1e-7);
    assert.throws(()=>sprite.configure({...mesh,vertexData:new Float32Array(2)},[10,10]),/payload/);
    assert.throws(()=>sprite.configure({...mesh,vertexData:new Float32Array(mesh.vertexData.length).fill(NaN)},[10,10]),/payload/);
});
test('Owned audio stops a queued late start and releases its clip exactly once',()=>{
    class Node {constructor(name){this.name=name;this.events=new Map();}addChild(n){n.parent=this;}addComponent(){return this.source={clip:null,playOnAwake:true,playing:false,volume:1,currentTime:0,plays:0,stops:0,pauses:0,play(){this.plays++;},stop(){this.playing=false;this.stops++;},pause(){this.playing=false;this.pauses++;}};}on(e,f){this.events.set(e,f);}off(e){this.events.delete(e);}destroy(){this.destroyed=true;}}
    const cc={Node,AudioSource:{EventType:{STARTED:'start',ENDED:'end'}}},scope=new core.Lifetime(),parent=new Node('root'),events=[];
    const transport=core.registerAudio(cc),port=transport.player(parent,scope,'effect',(event,state)=>events.push([event,state]));
    // Retain the constructed child through the fake surface, not private engine state.
    let child;const original=parent.addChild;parent.addChild=n=>{child=n;original.call(parent,n);};
    const second=transport.player(parent,scope,'late',(event,state)=>events.push([event,state]));second.assign({name:'clip'});second.play();second.stop();
    child.source.playing=true;child.events.get('start')();assert.equal(child.source.playing,false);assert.equal(second.snapshot().actualStarts,0);assert.equal(second.snapshot().lateStartsStopped,1);
    second.play();child.source.playing=true;child.events.get('start')();assert.equal(second.snapshot().actualStarts,1);second.pause();second.pause();assert.equal(second.snapshot().pauses,1);
    scope.dispose();assert.equal(child.source.clip,null);assert.equal(child.destroyed,true);assert.equal(second.play(),false);second.dispose();assert.equal(events.filter(e=>e[0]==='disposed').length,2);assert.equal(port.snapshot().disposed,true);
});
const near = (actual, expected) => {
    assert.equal(actual.length, expected.length);
    actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-5, `${v} != ${expected[i]}`));
};
test('Nested parent rotation maps coordinates and inverse restores source pixels', () => {
    const m = core.Math2D.multiply(core.Math2D.trs([10, 20], Math.PI / 2), core.Math2D.trs([3, 0], 0, [2, 1]));
    near(core.Math2D.transform(m, 4, 5), [5, 31]);
    near(core.Math2D.transform(core.Math2D.inverse(m), 5, 31), [4, 5]);
});
test('Weighted skin uses rest inverse, retaining original geometry at bind pose', () => {
    const rig = new core.BoneRig([{name: 'root', parent: -1, position: [10, 20]}, {name: 'arm', parent: 0, position: [3, 4]}]);
    near(core.weightedSkin(new Float32Array([7, 8]), [0.25, 0.75], rig.skinMatrices()), [7, 8]);
    rig.bones[1].position[0] += 8;
    rig.update();
    near(core.weightedSkin(new Float32Array([7, 8]), [0.25, 0.75], rig.skinMatrices()), [13, 8]);
    rig.reset();
    near(core.weightedSkin(new Float32Array([7, 8]), [0.25, 0.75], rig.skinMatrices()), [7, 8]);
    assert.throws(() => core.weightedSkin(new Float32Array([1, 1]), [0, 0], rig.skinMatrices()), /sum to one/);
});
test('Deformed triangle hit returns original alpha coordinates, outside hit is rejected', () => {
    const grid = core.createGrid([0, 0, 20, 20], 10);
    for (let i = 0; i < grid.vertices.length; i += 2) { grid.vertices[i] = grid.source[i] * 2 + 5; grid.vertices[i + 1] = grid.source[i + 1] + 3; }
    near(core.sourcePixelAt(grid, [17, 10]), [6, 7]);
    assert.equal(core.sourcePixelAt(grid, [-2, -2]), null);
    assert.equal(grid.indices.length, 24);
});
test('Animation curves clamp endpoints, interpolate vectors, and step visibility', () => {
    near(core.sampleTrack({times: [0, 2], values: [[2, 4], [6, 12]]}, 0.5), [3, 6]);
    assert.equal(core.sampleTrack({times: [0, 1, 2], values: [false, true, false], update: 1}, 1.5), true);
    assert.equal(core.sampleTrack({times: [0, 1], values: [1, 3]}, 100), 3);
});
test('Disposed request rejects late completion and releases the late resource', async () => {
    const scope = new core.Lifetime();
    let resolve, released = 0;
    const guarded = scope.guard(new Promise(r => { resolve = r; }), () => ++released);
    scope.dispose(); resolve({asset: 1});
    await assert.rejects(guarded, {name: 'CancelledError'});
    assert.equal(released, 1);
});
test('Plugin namespace is frozen and nonwritable', () => {
    assert.ok(Object.isFrozen(core));
    assert.equal(Object.getOwnPropertyDescriptor(context, 'LittleStepsCore').writable, false);
});
test('Shared leases deduplicate loads and retain admission until cancelled late work settles', async () => {
    const gate = new core.ResourceGate({maxBytes: 20, maxEntries: 2});
    const one = new core.Lifetime(), two = new core.Lifetime();
    let resolve, loaded = 0, unloaded = 0;
    const loader = () => { ++loaded; return new Promise(r => { resolve = r; }); };
    const a = gate.acquire([{key: 'shared', bytes: 12}], loader, () => ++unloaded, one);
    const b = gate.acquire([{key: 'shared', bytes: 12}], loader, () => ++unloaded, two);
    await Promise.resolve(); one.dispose();
    assert.equal(gate.snapshot().reservedBytes, 12);
    await assert.rejects(gate.acquire([{key: 'too-large', bytes: 9}], loader, () => {}, two), /budget/);
    resolve({texture: 1}); await assert.rejects(a, {name: 'CancelledError'});
    const leased = await b;
    assert.equal(loaded, 1); assert.ok(leased.get('shared'));
    two.dispose(); assert.equal(unloaded, 1); assert.equal(gate.snapshot().reservedBytes, 0);
});
