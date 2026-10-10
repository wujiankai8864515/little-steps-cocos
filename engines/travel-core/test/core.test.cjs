const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const context = vm.createContext({Float32Array, Uint16Array, console});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/travel-core.js'), 'utf8'), context);
const core = context.LittleStepsCore;
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
