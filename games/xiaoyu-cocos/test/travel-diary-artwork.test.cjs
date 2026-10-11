'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const root=path.resolve(__dirname,'../../..'),context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'engines/travel-core/dist/travel-core.js'),'utf8'),context);
const core=context.LittleStepsCore,modules={},plain=v=>JSON.parse(JSON.stringify(v));
class Color{constructor(r=255,g=255,b=255,a=255){Object.assign(this,{r,g,b,a});}}
class Vec4{constructor(x=0,y=0,z=0,w=0){Object.assign(this,{x,y,z,w});}}
class UITransform{setAnchorPoint(){}setContentSize(w,h){this.width=w;this.height=h;}}
class Node{constructor(name){this.name=name;this.children=[];this.components=new Map();this.active=true;}addChild(n){this.children.push(n);n.parent=this;}addComponent(T){const c=new T();c.node=this;this.components.set(T,c);return c;}getComponent(T){return this.components.get(T);}setPosition(x,y){this.position={x,y};}setScale(x,y){this.scale={x,y};}destroy(){this.destroyed=true;}}
class Sprite{static SizeMode={CUSTOM:1};configure(mesh,size,rect){this.mesh=mesh;this.size=size;this.rect=rect;}geometryChanged(){}getMaterialInstance(){return this.customMaterial;}}
class Label extends Sprite{static Overflow={CLAMP:1};static HorizontalAlign={CENTER:0,LEFT:1};static VerticalAlign={CENTER:0};}
class Material{constructor(){this.properties={};}initialize(v){this.effect=v.effectAsset;}setProperty(k,v){this.properties[k]=v;}destroy(){this.destroyed=true;}}
const cc={Color,Vec4,Node,Sprite,Label,UITransform,Material,Graphics:class{}};
modules.Engine={core,meshSprite:()=>Sprite};
for(const name of ['Visual','TravelHomeRules','TravelAtlasSprite','LightingSnapshot','HomeLighting','TravelDiaryDrawing','TravelDiaryArtwork']){
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:key=>key==='cc'?cc:modules[key.slice(2)]||{},console});modules[name]=exports;
}
const R=modules.TravelDiaryDrawing;
test('Native aligned route dashes reach both endpoints without adding AA fringes',()=>{
 assert.deepEqual(plain(R.diaryDashes([0,0],[20,0])),[[[0,0],[4,0]],[[8,0],[12,0]],[[16,0],[20,0]]]);
 assert.deepEqual(plain(R.diaryDashes([0,0],[15,0])),[[[0,0],[5.5,0]],[[9.5,0],[15,0]]]);
 assert.deepEqual(plain(R.diaryDashes([0,0],[2,0])),[[[0,0],[2,0]]]);assert.deepEqual(plain(R.diaryDashes([1,1],[1,1])),[]);
 const mesh=R.diaryRouteDrawing();assert.ok(mesh.indices.length>30);for(let i=0;i<mesh.vertexData.length;i+=3)assert.equal(mesh.vertexData[i],1);
 assert.ok(mesh.vertices.every(Number.isFinite));assert.equal(R.diaryStartDot().vertices.length,128);assert.equal(R.diaryStartDot().indices.length,62*3);
 assert.ok(R.diaryEndRing().vertexData.some(x=>x===0));assert.ok(R.diaryPencil([75,304],163).vertices.every(Number.isFinite));
});
test('Actual diary artwork stays attached to book and all ink shares room lighting without new textures',()=>{
 const owned=[],frames=[],scope={own:fn=>owned.push(fn)};
 const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/resources/source-catalog.json')));
 const assets={catalog,art:resource=>catalog.assets[resource],font:resource=>({resource}),frame:resource=>{frames.push(resource);return {resource};},effect:name=>({name})};
 let hour=12,lamp=0;const room=new Node('Room');room.worldPosition={x:30,y:40};room.worldScale={x:.5,y:.5};
 const lighting=new modules.HomeLighting.HomeLighting(room,assets,scope,{hour:()=>hour,lampWeight:()=>lamp});
 const book=new modules.TravelAtlasSprite.TravelAtlasSprite(room,assets,scope,modules.TravelHomeRules.TRAVEL_PROPS,modules.TravelHomeRules.PROP_REGIONS.open_diary,'OpenBook');
 const art=new modules.TravelDiaryArtwork.TravelDiaryArtwork(book,assets,scope,lighting);
 assert.equal(art.root.parent,book.root);assert.deepEqual(art.root.position,{x:-290,y:201});assert.equal(art.root.children.length,12);
 assert.equal(lighting.receivers.length,12);assert.equal(new Set(frames).size,3,'only original prop/reward atlas and existing inert stroke frame');
 const texts=art.root.children.flatMap(n=>n.children).map(n=>n.getComponent(Label)).filter(Boolean);
 assert.deepEqual(texts.map(t=>t.string),['旅行小记','路上的小事','把今天收好']);assert.ok(texts.every(t=>t.horizontalAlign===Label.HorizontalAlign.LEFT));
 const expected=modules.LightingSnapshot.homeLighting(12,0);lighting.update();
 for(const {material,node} of lighting.receivers){assert.equal(material.effect.name,'home-diary-ink');assert.equal(material.properties.ambientState.w,expected.receiverSun);assert.equal(material.properties.roomOrigin.x,30);let p=node;while(p&&p!==art.root)p=p.parent;assert.equal(p,art.root);}
 hour=22;lamp=1;lighting.update();for(const {material} of lighting.receivers)assert.ok(material.properties.weightsState.z>0,'every drawing receives lamp changes');
 assert.equal(lighting.receivers.filter(r=>r.material.properties.inkMode.x===1).length,7);
 owned.forEach(fn=>fn());assert.ok(lighting.receivers.every(r=>r.material.destroyed),'all twelve materials are scope-owned');
});
