require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('module'),{EventEmitter}=require('node:events');
const frames=new EventEmitter();
const original=Module._load;
Module._load=function(id,...args){if(id==='cc')return {
 _decorator:{ccclass:()=>value=>value},Component:class{constructor(){this.node={isValid:true};}},
 Color:class{},Director:{EVENT_AFTER_DRAW:'draw'},director:frames,
};return original.call(this,id,...args);};
const {StartupPresentation}=require('../assets/mods/base-shell/StartupPresentation.ts');Module._load=original;
test('startup preparation waits for a real first drawn frame',async()=>{
 const page=new StartupPresentation();let ready=false;
 const pending=page.firstDraw().then(()=>{ready=true;});await Promise.resolve();
 assert.equal(ready,false);assert.equal(frames.listenerCount('draw'),1);
 frames.emit('draw');await pending;assert.equal(ready,true);assert.equal(frames.listenerCount('draw'),0);
 page.onDestroy();
});
test('destroying a loading page cancels its first-frame wait and removes the engine listener',async()=>{
 const page=new StartupPresentation();const pending=page.firstDraw();await Promise.resolve();
 assert.equal(frames.listenerCount('draw'),1);page.onDestroy();
 await assert.rejects(pending,/取消/);assert.equal(frames.listenerCount('draw'),0);
 frames.emit('draw');page.onDestroy();
});
