require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('module');
class Vec2 { constructor(x=0,y=0){Object.assign(this,{x,y});} }
class Graphics { clear(){} rect(){} fill(){} }
class UITransform { setAnchorPoint(){} }
class Mask { static Type={GRAPHICS_STENCIL:0}; }
class ScrollView {
 static EventType={SCROLL_ENDED:'scroll-ended'};
 constructor(){this.offset=new Vec2();this.automatic=false;this.queued=[];this.moves=[];}
 getScrollOffset(){return this.offset;} isAutoScrolling(){return this.automatic;}
 scheduleOnce(callback){this.queued.push(callback);}
 flushScheduled(){const callbacks=this.queued.splice(0);for(const callback of callbacks)callback();}
 scrollToOffset(offset,time){this.moves.push({x:offset.x,time});this.offset=new Vec2(-offset.x,0);this.automatic=true;}
}
class Node {
 static EventType={TOUCH_START:'touch-start',TOUCH_END:'touch-end',TOUCH_CANCEL:'touch-cancel'};
 constructor(name='root'){this.name=name;this.isValid=true;this.children=[];this.listeners=new Map();this.components=new Map([[UITransform,new UITransform()]]);}
 addComponent(type){const value=new type();this.components.set(type,value);if(type===Mask)this.components.set(Graphics,new Graphics());return value;}
 getComponent(type){return this.components.get(type);}
 on(name,callback){const listeners=this.listeners.get(name)||[];listeners.push(callback);this.listeners.set(name,listeners);}
 emit(name,event={}){for(const callback of this.listeners.get(name)||[])callback(event);}
}
const original=Module._load;
Module._load=function(id,...args){if(id==='cc')return {
 _decorator:{ccclass:()=>value=>value},Component:class{constructor(){this.node=new Node();}},
 Node,ScrollView,Vec2,UITransform,Mask,Graphics,Color:class{},
};return original.call(this,id,...args);};
const {CatalogUI}=require('../assets/mods/base-shell/CatalogUI.ts');Module._load=original;
function carousel(){
 const ui=new CatalogUI(),root=new Node(),story={id:'real'};
 ui.config={placeholderStories:[{}, {}, {}]};ui.text=()=>({});ui.realStoryCard=ui.placeholderStoryCard=()=>{};
 ui.child=(parent,name)=>{const child=new Node(name);parent.children.push(child);return child;};
 ui.storyCarousel(root,[story],story);
 const viewport=root.children.find(node=>node.name==='storyViewport');return {viewport,scroll:viewport.getComponent(ScrollView)};
}
test('a native release before the buffered final movement still settles the complete book on the next frame',()=>{
 const {viewport,scroll}=carousel();
 viewport.emit(Node.EventType.TOUCH_START);
 viewport.emit(Node.EventType.TOUCH_END); // Native input dispatch finishes before ScrollView.update applies this frame's movement.
 assert.equal(scroll.moves.length,0);
 scroll.offset=new Vec2(-830,0); // The final movement becomes visible in the component update phase.
 scroll.flushScheduled();assert.deepEqual(scroll.moves,[{x:1030,time:.2}]);
 scroll.automatic=false;viewport.emit(ScrollView.EventType.SCROLL_ENDED);scroll.flushScheduled();
 assert.equal(scroll.moves.length,1,'completion at the aligned book must not start another animation');
});
test('synthetic button cancellation and a new finger press never align a book while it is still being dragged',()=>{
 const {viewport,scroll}=carousel();
 viewport.emit(Node.EventType.TOUCH_START);scroll.offset=new Vec2(-830,0);
 viewport.emit(Node.EventType.TOUCH_CANCEL,{simulate:true});viewport.emit(ScrollView.EventType.SCROLL_ENDED);
 scroll.flushScheduled();assert.equal(scroll.moves.length,0);
 viewport.emit(Node.EventType.TOUCH_END);scroll.flushScheduled();assert.equal(scroll.moves[0].x,1030);
 viewport.emit(ScrollView.EventType.SCROLL_ENDED);viewport.emit(Node.EventType.TOUCH_START);
 scroll.automatic=false;scroll.offset=new Vec2(-2070,0);scroll.flushScheduled();assert.equal(scroll.moves.length,1);
 viewport.emit(Node.EventType.TOUCH_END);scroll.flushScheduled();assert.equal(scroll.moves[1].x,2060);
});
