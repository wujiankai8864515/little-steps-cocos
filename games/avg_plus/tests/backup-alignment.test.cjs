require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('module');
const fs=require('node:fs'),path=require('node:path');
class Vector{
 constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
 clone(){return new Vector(this.x,this.y,this.z);}
}
class Widget{constructor(){this.isAlignLeft=true;this.isAlignRight=false;this.isAlignHorizontalCenter=false;this.isAlignBottom=true;}}
class Sprite{}
// Mock only the native geometry boundary. The real renderer selects visible cards,
// runs stable stock layout, updates the button and maintains animation destinations.
class Transform{
 constructor(node,width,anchor=.5){this.node=node;this.width=width;this.anchor=anchor;}
 getBoundingBoxTo(parent){
  const x=(this.node.worldX-parent.worldX)/parent.worldScale;
  const width=this.width*this.node.worldScale/parent.worldScale;
  return {xMin:x-this.anchor*width,xMax:x+(1-this.anchor)*width,width,center:{y:0}};
 }
 getBoundingBoxToWorld(){return this.getBoundingBoxTo({worldX:0,worldScale:1});}
 convertToNodeSpaceAR(point){return new Vector((point.x-this.node.worldX)/this.node.worldScale,point.y,point.z);}
}
class Node{
 constructor(name,x=0,y=0){Object.assign(this,{name,position:new Vector(x,y),scale:new Vector(1,1,1),active:true,isValid:true,angle:0,children:[],parent:null,components:new Map()});}
 get worldMatrix(){return this;}
 get worldScale(){return this.scale.x*(this.parent?.worldScale??1);}
 get worldX(){return (this.parent?.worldX??0)+this.position.x*(this.parent?.worldScale??1);}
 get activeInHierarchy(){return this.active&&(this.parent?.activeInHierarchy??true);}
 add(child){this.children.push(child);child.parent=this;return child;}
 getChildByName(name){return this.children.find(child=>child.name===name)??null;}
 getComponent(type){return this.components.get(type)??null;}
 setPosition(x,y,z){this.position=typeof x==='object'?x.clone():new Vector(x,y,z??0);}
 setScale(x,y,z){this.scale=typeof x==='object'?x.clone():new Vector(x,y,z??1);}
}
const original=Module._load;
Module._load=function(id,...args){if(id==='cc')return {
 _decorator:{ccclass:()=>value=>value,property:()=>()=>{}},Component:class{},Vec3:Vector,UITransform:Transform,Widget,Sprite,
};return original.call(this,id,...args);};
const {GamePresentation}=require('../assets/mods/base-card/GamePresentation.ts');Module._load=original;
const prefab=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/art/resources/prefabs/gamePage.prefab')));
const prefabNode=name=>prefab.find(item=>item.__type__==='cc.Node'&&item._name===name);
function fixture(offsets){
 const page=new GamePresentation(),root=new Node('page');page.node=root;root.components.set(Transform,new Transform(root,1181));
 const backup=root.add(new Node('backup',prefabNode('backup')._lpos.x,-861));
 const button=root.add(new Node('addBackup',prefabNode('addBackup')._lpos.x,-864));
 button.components.set(Widget,new Widget());
 const icon=button.add(new Node('icon'));icon.components.set(Transform,new Transform(icon,326));
 const cards=offsets.map((x,index)=>{
  const card=backup.add(new Node('poker_back_'+index,x));
  card.components.set(Transform,new Transform(card,162));card.components.set(Sprite,{});return card;
 });
 page._level={};page.findNode=id=>id==='backup'?backup:id==='addBackup'?button:null;
 page.ensureBackupCardCapacity=()=>cards;
 page.ensureCardShadow=()=>({setSimulatedHeight(){},setVisible(){},syncNow(){}});
 page.cardShadowFor=()=>null;page.stackBackupCardsLeftToRight=()=>{};
 page.paidActionPositions.set('addBackup',button.position.clone());
 const center=()=>{const rect=icon.getComponent(Transform).getBoundingBoxTo(root);return (rect.xMin+rect.xMax)/2;};
 return {page,root,backup,button,icon,cards,center};
}
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);
const view=(stockRemainingCount,addBackupVisible=false)=>({stockRemainingCount,controls:{addBackupVisible}});

test('the real stock renderer centers the button on 1, 5, 10 cards and the five-card paid preview, not the prefab container',()=>{
 const offsets=prefabNode('backup')._children.map(ref=>prefab[ref.__id__]._lpos.x);
 const {page,backup,button,cards,center}=fixture(offsets),y=button.position.y;
 for(const [count,paid,expected] of [[1,false,-464.792],[5,false,-413.244],[10,false,-345.753],[0,true,-413.244]]){
  page.renderBackup(view(count,paid));close(center(),expected);
  assert.equal(cards.filter(card=>card.active).length,paid?5:count);
  assert.deepEqual(cards.filter(card=>card.active).map(card=>card.position.x),offsets.slice(0,paid?5:count));
  close(page.paidActionPositions.get('addBackup').x,button.position.x);
  assert.equal(button.position.y,y);assert.equal(backup.position.x,prefabNode('backup')._lpos.x);
 }
 const widget=button.getComponent(Widget);
 assert.equal(widget.isAlignLeft,false);assert.equal(widget.isAlignBottom,true);
});

test('right-anchored expanded stock and changed layout are followed without leaving a stale animation destination',()=>{
 const {page,backup,button,center}=fixture(Array.from({length:15},(_,i)=>-140+i*20));
 page._level={portraitLayout:{stockAnchor:'right'}};
 for(const [count,localCenter] of [[15,0],[5,100],[1,140]]){
  page.renderBackup(view(count));close(center(),backup.position.x+localCenter);
 }
 page.renderBackup(view(0,true));close(center(),backup.position.x+100);
 backup.position.x+=73;page.update(0);close(center(),backup.position.x+100);
 close(page.paidActionPositions.get('addBackup').x,button.position.x);
 // Cleanup may restore a transform captured before the paid preview was laid out.
 button.position.x=1000;page.renderBackup(view(0,true));close(center(),backup.position.x+100);
});

test('visual bounds, icon anchors and scales are respected; an empty hidden pile never creates an invalid position',()=>{
 const {page,root,backup,button,icon,cards,center}=fixture([-80,80]);
 root.scale.x=.33;root.position.x=180;
 backup.position.x=-200;backup.scale.x=2;
 cards[0].getComponent(Transform).width=100;cards[0].getComponent(Transform).anchor=0;
 cards[1].getComponent(Transform).width=200;cards[1].getComponent(Transform).anchor=1;
 icon.position.x=17;icon.getComponent(Transform).anchor=.1;button.scale.x=.8;
 page.alignAddBackupToVisibleCards();close(center(),-240);
 close(button.position.x,-357.92);
 const before=button.position.clone();cards.forEach(card=>card.active=false);
 page.alignAddBackupToVisibleCards();assert.deepEqual(button.position,before);
});
