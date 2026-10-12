const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
class UITransform{setAnchorPoint(){}setContentSize(w,h){this.width=w;this.height=h;}}
class Node{constructor(name){this.name=name;this.children=[];this.components=new Map();this.position={x:0,y:0};this.scale={x:1,y:1};}addChild(n){this.children.push(n);n.parent=this;}addComponent(T){const c=new T();c.node=this;this.components.set(T,c);return c;}getComponent(T){return this.components.get(T);}setPosition(x,y){this.position={x,y};}setScale(x,y){this.scale={x,y};}get worldPosition(){const p=this.parent?.worldPosition||{x:0,y:0},s=this.parent?.worldScale||{x:1,y:1};return {x:p.x+this.position.x*s.x,y:p.y+this.position.y*s.y};}get worldScale(){const s=this.parent?.worldScale||{x:1,y:1};return {x:s.x*this.scale.x,y:s.y*this.scale.y};}}
class Sprite{static SizeMode={CUSTOM:1};configure(mesh){this.mesh=mesh;}geometryChanged(){}}
class Vec4{constructor(x,y,z,w){Object.assign(this,{x,y,z,w});}}
class Material{properties={};initialize(){}setProperty(k,v){this.properties[k]=v;}destroy(){}}
const cc={Node,UITransform,Sprite,Vec4,Material,Graphics:class{}},mods={Engine:{meshSprite:()=>Sprite}};
require('./viewport-mocks.cjs').installViewportMocks(cc);
function load(name){if(mods[name])return mods[name];const exports={};mods[name]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:k=>k==='cc'?cc:load(k.slice(2))});return exports;}
const {pageLayout,pinTop,safeViewport}=load('Viewport'),{nodeAt}=load('Visual'),{PageBackground}=load('PageBackground'),{photoLight}=load('PhotoGeometry'),{PhotoLighting}=load('PhotoLighting');
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/resources/source-catalog.json'))),scope={own(){}};
const entries=[['res://photo/assets/photo_wall_neutral_plate_v1.png'],['res://travel/assets/travel_diary_reference_v5.png',undefined,0,1280,230],['res://travel/assets/travel_paper_v1.png'],['res://travel/assets/travel_map_plate_v5.png',undefined,0,1280,225],['res://wardrobe/assets/wardrobe_runtime_atlas.png',[0,0,720,1280]],['res://entry/assets/backgrounds/login_clean_bleed_720x1600.png',undefined,-160,1600],['res://entry/assets/backgrounds/loading_clean_bleed_720x1600.png',undefined,-160,1600]];
test('Backgrounds cover every viewport and retain their admitted base and detail textures across resize',()=>{
 for(const [resource,region,top=0,artHeight=1280,pinned=0] of entries){let frames=0;const assets={art:k=>catalog.assets[k],frame:()=>{frames++;return {};}};
 const root=nodeAt(new Node('Scene'),'Screen',0,0,720,1280),canvas=nodeAt(root,'Art',0,0,720,1280),bg=new PageBackground(canvas,assets,scope,resource,'Backdrop',region,top,artHeight,pinned);
 for(const h of [900,1200,1280,1440,1560,1600,1690,1800,2160,1280]){const l=pageLayout(h);canvas.setPosition(l.x,-l.offset);canvas.setScale(l.scale,l.scale);bg.resize(h,l);const m=bg.sprite.mesh,points=Array.from({length:m.vertices.length/2},(_,i)=>[l.x+m.vertices[i*2]*l.scale,l.offset+m.vertices[i*2+1]*l.scale]);assert.ok(points.flat().every(Number.isFinite));assert.equal(Math.min(...points.map(p=>p[0])),0);assert.equal(Math.max(...points.map(p=>p[0])),720);assert.ok(Math.min(...points.map(p=>p[1]))<=0);assert.ok(Math.max(...points.map(p=>p[1]))>=h);
 // All adjacent bands meet geometrically and share the exact edge source row.
 for(let i=0;i<m.vertices.length/8-1;i++){assert.equal(m.vertices[i*8+5],m.vertices[(i+1)*8+1]);assert.equal(m.source[i*8+5],m.source[(i+1)*8+1]);}
 assert.ok(m.vertices.length/2<=20);assert.equal(frames,1+(catalog.assets[resource].layers||[]).length);
 } }
});
test('Widgets keep the return control at the real safe top while its illustration parent moves and scales',()=>{
 cc.sys.getSafeAreaRect=()=>({x:6,y:34,width:708,height:1612});assert.deepEqual(Array.from(safeViewport(1690)),[6,44,708,1612]);
 const screen=nodeAt(new Node('Scene'),'Screen',0,0,720,1690),art=nodeAt(screen,'Art',0,205,720,1280),tag=nodeAt(art,'Return',26,24,78,128);pinTop(tag,screen,32,68);assert.equal(tag.worldPosition.x,32);assert.equal(tag.worldPosition.y,-68);art.setPosition(100,-140);art.setScale(.7,.7);pinTop(tag,screen,32,68);assert.equal(tag.worldPosition.x,32);assert.ok(Math.abs(tag.worldPosition.y+68)<1e-9);
 cc.sys.getSafeAreaRect=()=>({x:0,y:0,width:0,height:0});assert.deepEqual(Array.from(safeViewport(1800)),[0,0,720,1800]);
});
test('Home preserves the whole authored 1600-high bleed and samples only its narrow border on extra-tall screens',()=>{
 const resource='res://assets/round2/home_neutral_bleed_no_plants.png',assets={art:k=>catalog.assets[k],frame:()=>({})},root=nodeAt(new Node('Scene'),'HomeWorld');
 const background=new PageBackground(root,assets,scope,resource,'ExtendedRoomBleed',undefined,-160,1600);
 for(const height of [1280,1560,1600,1710,2160]){const offset=(height-1280)/2;background.resize(height,{scale:1,x:0,offset,top:-offset,bottom:1280+offset});const mesh=background.sprite.mesh,bands=mesh.vertices.length/8;
 assert.equal(mesh.source.length,mesh.vertices.length);let centre=0;
 for(let i=0;i<bands;i++){const from=mesh.vertices[i*8+1],to=mesh.vertices[i*8+5],sourceFrom=mesh.source[i*8+1],sourceTo=mesh.source[i*8+5];
  if(from===-160&&to===1440){centre++;assert.deepEqual([sourceFrom,sourceTo],[0,1600]);}
  else {assert.ok(Math.abs(sourceTo-sourceFrom)<=48,'an extension must not squeeze the full background into a narrow band');assert.ok(to<=-160||from>=1440);}
 }
 assert.equal(centre,1);assert.ok(Math.min(...Array.from(mesh.vertices).filter((_,i)=>i%2))<=-offset);assert.ok(Math.max(...Array.from(mesh.vertices).filter((_,i)=>i%2))>=1280+offset);
 }
});
test('Photo light starts above the visible top and updates the same receiver and volume extent after resizing, in day and night',()=>{
 const screen=nodeAt(new Node('Scene'),'Screen'),canvas=nodeAt(screen,'Canvas'),assets={effect:()=>({})},lighting=new PhotoLighting(canvas,assets),renderer=new Sprite(),m=lighting.bind(renderer,'volume',scope);
 for(const h of [1280,1560,1800])for(const hour of [12,23]){const layout=pageLayout(h),snapshot=load('LightingSnapshot').lightingSnapshot(hour),base=photoLight(snapshot),light=photoLight(snapshot,layout.top);assert.ok(light.origin[1]<layout.top);assert.ok(Math.abs(light.origin[1]-layout.top-base.origin[1])<1e-9);assert.ok(Math.abs(Math.hypot(...light.cast)-1)<1e-9);canvas.setPosition(0,-layout.offset);lighting.update(light,layout);assert.equal(m.properties.lightState.y,light.origin[1]);assert.equal(m.properties.pageState.x,layout.top);assert.equal(m.properties.pageState.y,layout.bottom);assert.equal(m.properties.pageState.z,h);}
 assert.throws(()=>pageLayout(0));assert.throws(()=>pageLayout(Infinity));
});
