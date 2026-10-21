require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('module');
const fs=require('node:fs'),path=require('node:path');
class Transform{constructor(width,anchor=.5){this.width=width;this.anchorPoint={x:anchor,y:.5};}}
class Vec3{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}}
class Node{
 constructor(name){Object.assign(this,{name,active:true,children:[],parent:null,position:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},transform:null,destroyed:false});}
 addChild(child){this.children.push(child);child.parent=this;}
 getChildByName(name){return this.children.find(child=>child.name===name)??null;}
 getComponent(type){return type===Transform?this.transform:null;}
 setPosition(x,y,z){this.position={x,y,z};}
 setScale(x,y,z){this.scale={x,y,z};}
 removeFromParent(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}}
 destroy(){this.destroyed=true;}
}
function clone(node){const result=new Node(node.name);result.transform=node.transform;node.children.forEach(child=>result.addChild(clone(child)));return result;}
const original=Module._load;
Module._load=function(id,...args){if(id==='cc')return {_decorator:{ccclass:()=>value=>value,property:()=>()=>{}},Component:class{},Vec3,UITransform:Transform,instantiate:clone};return original.call(this,id,...args);};
const {GamePresentation}=require('../assets/mods/base-card/GamePresentation.ts');
const {GameSessionStore}=require('../assets/mods/base-card/GameSessionStore.ts');
Module._load=original;
const read=file=>JSON.parse(fs.readFileSync(path.join(__dirname,'..',file)));
const prefab=read('assets/art/resources/prefabs/gamePage.prefab');
function fixture(){
 const fromPrefab=index=>{const value=prefab[index],node=new Node(value._name);const transform=value._components.map(ref=>prefab[ref.__id__]).find(component=>component.__type__==='cc.UITransform');if(transform)node.transform=new Transform(transform._contentSize.width,transform._anchorPoint.x);value._children.forEach(ref=>node.addChild(fromPrefab(ref.__id__)));return node;};
 const index=prefab.findIndex(value=>value.__type__==='cc.Node'&&value._name==='progress_items');
 const items=fromPrefab(index),progress=new Node('progress');progress.addChild(items);
 const page=new GamePresentation();page.findNode=id=>id==='progress'?progress:null;
 return {page,items};
}
const visibleVariants=items=>items.children.filter(item=>item.active).map(item=>item.children.filter(variant=>variant.active).map(variant=>variant.name));
test('the real progress renderer fills four prefab cells and begins a new cycle on the fifth hit',()=>{
 const {page,items}=fixture(),session=new GameSessionStore(read('assets/art/resources/config/catalog.json').economy,5200);
 for(const color of ['red','black','red','black']){session.recordHit(color);session.finishRewardCycle();page.renderProgress(session.getViewState());assert.equal(items.children.length,4);}
 assert.deepEqual(visibleVariants(items),[['img_main_progress_red01'],['img_main_progress_black02'],['img_main_progress_red02'],['img_main_progress_black02']]);
 session.recordHit('red');session.finishRewardCycle();page.renderProgress(session.getViewState());
 assert.equal(items.children.length,4);assert.deepEqual(visibleVariants(items),[['img_main_progress_red01'],['img_main_progress_gray02'],['img_main_progress_gray02'],['img_main_progress_gray02']]);
 assert.equal(session.coins,5200);
});
test('oversized progress input and stale children cannot create a fifth node during redraw or restore',async()=>{
 const {page,items}=fixture(),extras=[];
 while(items.children.length<6){const item=clone(items.children[1]);extras.push(item);items.addChild(item);}
 const overflow=extras.slice(2);page.renderProgressItems(items,Array(7).fill('black'));
 assert.equal(items.children.length,4);assert.equal(items.children.filter(item=>item.active).length,4);
 assert.ok(overflow.every(item=>item.parent===null&&item.destroyed));
 await page.animateProgressReset(Array(4).fill('empty'));
 assert.deepEqual(visibleVariants(items),[['img_main_progress_gray01'],['img_main_progress_gray02'],['img_main_progress_gray02'],['img_main_progress_gray02']]);
 await page.animateProgressRestore(Array(7).fill('black'),['red','black']);
 assert.equal(items.children.length,4);assert.equal(items.children.filter(item=>item.active).length,2);
 page.ensureProgressItemCount(items,12);assert.equal(items.children.length,4);
 page.renderProgressItems(items,Array(4).fill('red'));assert.equal(items.children.filter(item=>item.active).length,4);
});
test('four unequal prefab shapes keep equal arrow gaps and balanced margins through resizing and redraw',()=>{
 const {page,items}=fixture(),close=(left,right)=>assert.ok(Math.abs(left-right)<1e-8,`${left} != ${right}`);
 const bounds=item=>({left:item.position.x-item.transform.width*item.transform.anchorPoint.x*item.scale.x,right:item.position.x+item.transform.width*(1-item.transform.anchorPoint.x)*item.scale.x});
 for(const width of [200,160,260])for(const anchor of [.5,0]){
  items.transform.width=width;items.transform.anchorPoint.x=anchor;
  page.renderProgressItems(items,['red','black','red','black']);
  const cells=items.children,first=bounds(cells[0]),last=bounds(cells.at(-1));
  const leftMargin=first.left+width*anchor,rightMargin=width*(1-anchor)-last.right;
  close(leftMargin,rightMargin);assert.ok(leftMargin>=12-1e-8);
  for(let i=1;i<cells.length;i++)close(bounds(cells[i]).left+13*cells[i].scale.x-bounds(cells[i-1]).right,6*cells[i].scale.x);
  const geometry=cells.map(item=>({position:{...item.position},scale:{...item.scale}}));
  page.renderProgressItems(items,['empty','empty','empty','empty']);
  assert.deepEqual(cells.map(item=>({position:{...item.position},scale:{...item.scale}})),geometry);
 }
});
