const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'../../..'),GAME=path.join(ROOT,'games/xiaoyu-cocos/assets'),ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(ROOT,'engines/travel-core/dist/travel-core.js'),'utf8'),ctx);const core=ctx.LittleStepsCore;
class UITransform{setAnchorPoint(){}setContentSize(w,h){this.width=w;this.height=h;}}
class Node{constructor(name){this.name=name;this.children=[];this.components=new Map();this.position={x:0,y:0};this.scale={x:1,y:1};this.angle=0;this.active=true;}addChild(n){this.children.push(n);n.parent=this;}addComponent(C){const c=new C();c.node=this;this.components.set(C,c);return c;}getComponent(C){return this.components.get(C);}setPosition(x,y){this.position={x,y};}setScale(x,y){this.scale={x,y};}get worldPosition(){const p=this.parent?.worldPosition||{x:0,y:0},s=this.parent?.worldScale||{x:1,y:1};return {x:p.x+this.position.x*s.x,y:p.y+this.position.y*s.y};}get worldScale(){const s=this.parent?.worldScale||{x:1,y:1};return {x:this.scale.x*s.x,y:this.scale.y*s.y};}setSiblingIndex(){}destroy(){this.destroyed=true;this.children.forEach(n=>n.destroy());}}
class Sprite{static SizeMode={CUSTOM:0};configure(mesh,size,content){assert.ok(mesh.vertices.length/2<=4096);this.mesh=mesh;this.sourceRect=content||[0,0,...size];this.configurations=(this.configurations||0)+1;}geometryChanged(){this.changes=(this.changes||0)+1;}}
class Material{properties={};initialize(values){this.effect=values.effectAsset;}setProperty(k,v){this.properties[k]=v;}destroy(){this.destroyed=true;}}
class Vec4{constructor(x,y,z,w){Object.assign(this,{x,y,z,w});}}
const cc={Node,Sprite,Material,Vec4,UITransform},mods={Engine:{core,meshSprite:()=>Sprite}},load=name=>{if(mods[name])return mods[name];const exports={};mods[name]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(GAME,'game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:k=>k==='cc'?cc:load(k.slice(2)),console});return exports;};
const {TravelSceneState}=load('TravelSceneState'),{TravelSceneView,TRAVEL_SCENE_BUFFER_BYTES}=load('TravelSceneView'),{TravelRouteInk,mergeInk}=load('TravelSceneGeometry'),{HomeClock}=load('HomeClock');
const catalog=JSON.parse(fs.readFileSync(path.join(GAME,'resources/source-catalog.json'))),native=JSON.parse(fs.readFileSync(path.join(ROOT,'builds/reviews/M07-travel-scene-native-v1.json')));
const plain=v=>JSON.parse(JSON.stringify(v)),near=(a,b,t=.0006)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
function fixture(){const scope=new core.Lifetime(),gate=new core.ResourceGate(),frames=[],effects=[];const assets={catalog,art:key=>catalog.assets[key],frame(key,owner){const f={resource:key};frames.push(f);owner.own(()=>f.destroyed=true);return f;},effect:key=>{effects.push(key);return {name:key};},async acquireTransient(key,bytes,create,dispose,owner){const lease=await gate.acquire([{key,bytes}],create,dispose,owner);return lease.get(key);}};const state=new TravelSceneState(),clock=new HomeClock(),parent=new Node('Page');state.updateRoute(0,false);return {scope,gate,assets,state,clock,parent,frames,effects};}
function actualPoint(node,point){let at=[point[0],-point[1]],n=node;while(n){const c=Math.cos(n.angle*Math.PI/180),s=Math.sin(n.angle*Math.PI/180),x=at[0]*n.scale.x,y=at[1]*n.scale.y;at=[n.position.x+c*x-s*y,n.position.y+s*x+c*y];n=n.parent;}return [at[0],-at[1]];}
function checkPiece(piece,at,extent,pivot,angle){const mesh=piece.image.sprite.mesh,r=piece.image.region;for(let i=0;i<4;i++){const actual=actualPoint(piece.image.sprite.node,[mesh.vertices[i*2],mesh.vertices[i*2+1]]),local=[(mesh.source[i*2]-r[0])/r[2]*extent[0]-pivot[0],(mesh.source[i*2+1]-r[1])/r[3]*extent[1]-pivot[1]],expected=[at[0]+Math.cos(angle)*local[0]-Math.sin(angle)*local[1],at[1]+Math.sin(angle)*local[0]+Math.cos(angle)*local[1]];actual.forEach((v,j)=>near(v,expected[j],.002));}}
test('Actual layered scene uses source atlas UVs, source draw order, bounded mesh batches and three shared materials',async()=>{
 const f=fixture(),view=await TravelSceneView.create(f.parent,f.assets,f.scope,f.clock,f.state),s=view.snapshot();assert.equal(s.routeBatches,10);assert.equal(s.routeVertices,34560);assert.equal(s.layers.length,64);assert.equal(s.lighting.materials,3);assert.deepEqual(f.effects,['travel-atmosphere','travel-atmosphere','travel-atmosphere']);
 const index=n=>s.layers.indexOf(n);assert.ok(index('OriginalMapBase')<index('Cloud0'));assert.ok(index('SceneShadows')<index('FallingLeaf0'));assert.ok(index('FallingLeaf0')<index('RoutePigment0'));assert.ok(index('RoutePigment9')<index('OriginalFootprint0'));assert.ok(index('OriginalFootprint10')<index('LandmarkBoards'));assert.ok(index('LandmarkBoards')<index('Branch0'));assert.ok(index('BellBody')<index('BellTongue'));assert.ok(index('BellTongue')<index('BellOccluder'));assert.ok(index('BellOccluder')<index('FallingLeaf2'));assert.equal(s.layers.at(-1),'SharedAtmosphericVolume');assert.ok(!s.layers.some(n=>/sun|moon|disc/i.test(n)));
 for(const mesh of view.route.batches){assert.equal(mesh.vertices.length/2,3456);assert.ok(mesh.indices.every(i=>i<3456));}
 const matrices=view.lighting.materials;for(const [mode,m]of matrices){assert.equal(m.properties.renderMode.x,mode);assert.equal(m.properties.renderMode.y,10);assert.equal(m.properties.portal0.w,native.config.light.beam_portals[0].strength*1.65);assert.equal(m.properties.exclusion4.x,native.config.route.landmarks[0].rect[0]-3);}
 assert.equal(f.gate.snapshot().reservedBytes,TRAVEL_SCENE_BUFFER_BYTES);f.scope.dispose();assert.equal(f.gate.snapshot().entries,0);assert.ok(f.frames.every(f=>f.destroyed));assert.ok([...matrices.values()].every(m=>m.destroyed));assert.equal(f.state.disposed,true);assert.equal(view.root.destroyed,true);
});
test('Actual Cocos node and atlas transforms follow nine native Godot checkpoints through 120 seconds',async()=>{
 const f=fixture(),view=await TravelSceneView.create(f.parent,f.assets,f.scope,f.clock,f.state),c=f.state.config;
 for(const row of native.motion){while(f.state.age+1e-7<row.age)f.state.advance(1/60);view.render();
  view.clouds.forEach((p,i)=>checkPiece(p,row.cloud_positions[i],c.clouds[i].size,[0,0],0));view.branches.forEach((p,i)=>checkPiece(p,c.branches[i].at,c.branches[i].size,c.branches[i].pivot,row.branch_states[i].angle));
  checkPiece(view.bell.body,c.bell.position,c.bell.body_size,c.bell.body_pivot,row.bell_body_angle);checkPiece(view.bell.tongue,row.tongue_position,c.bell.clapper_size,c.bell.clapper_pivot,row.bell_clapper_angle);
  row.leaves.forEach((pose,i)=>{const [x,y]=pose.at,[w,h]=pose.extent,visible=x+w>-80&&x-w<800&&y+h>100&&y-h<1270;assert.equal(view.leaves[i].pivot.active,visible);if(visible)checkPiece(view.leaves[i],pose.at,pose.extent,pose.extent.map(v=>v/2),pose.turn);});
 }
 const before=plain(f.state.snapshot());f.state.choicePaused=true;view.advance(3);assert.equal(f.state.age,before.age);assert.equal(f.state.contacts,before.contacts);f.scope.dispose();
});
test('Incremental route recoloring matches full redraw across forward jumps and rewinds without rebuilding vertices',()=>{
 const state=new TravelSceneState(),route=new TravelRouteInk(state),arrays=route.batches.map(m=>m.vertices),before=route.updates;
 for(let i=0;i<1000;i++)assert.equal(route.update().length,0);assert.equal(route.updates,before);
 for(const progress of [.001,.035,.1,.431,.8,1,.6,.002,0]){state.updateRoute(progress,false);route.update();const fresh=new TravelRouteInk(state);route.batches.forEach((m,i)=>{assert.equal(m.vertices,arrays[i]);assert.deepEqual(Array.from(m.vertexUV),Array.from(fresh.batches[i].vertexUV));assert.deepEqual(Array.from(m.vertexData),Array.from(fresh.batches[i].vertexData));});}
 const first=route.batches[0],color=state.config.route.unwalked;near(first.vertexUV[0],color[0],1e-7);near(first.vertexData[1],color[3]*(.62+.5*.30)*.13,1e-7);
 assert.throws(()=>mergeInk([...route.batches]),/capacity/);
});
test('Footprint images keep native rotation, drop, scale, warm contact and un-tinted ink; all dynamic alpha avoids Color byte quantization',async()=>{
 const f=fixture(),view=await TravelSceneView.create(f.parent,f.assets,f.scope,f.clock,f.state);f.state.updateRoute(.1,false);for(let i=0;i<9;i++)view.advance(1/60);
 const pose=f.state.footprintPose(1),foot=view.footprints[1];near(foot.image.pivot.position.y,-foot.at[1]-pose.drop);near(foot.image.pivot.scale.x,pose.scale[0]);near(foot.image.pivot.scale.y,pose.scale[1]);near(foot.image.image.sprite.mesh.vertexData[0],pose.alpha,1e-7);assert.equal(foot.image.image.sprite.mesh.vertexData[1],0);
 for(const p of view.clouds)assert.equal(p.image.sprite.mesh.vertexData[1],1);const darkLeaf=view.leaves.find(p=>p.image.sprite.mesh.vertexData[2]>.01);assert.ok(darkLeaf);near(darkLeaf.image.sprite.mesh.vertexData[2],.10,1e-8);
 f.scope.dispose();
});
test('Shared field receives the current scene transform and all fourteen native day/night light states',async()=>{
 const f=fixture();f.parent.setPosition(-360,845);f.parent.setScale(1.5,1.5,1);const view=await TravelSceneView.create(f.parent,f.assets,f.scope,f.clock,f.state);
 for(const row of native.light){f.clock.seekHour(row.hour);view.render();const s=view.lighting.light;for(const m of view.lighting.materials.values()){assert.deepEqual(plain(m.properties.sceneOrigin),{x:-360,y:845,z:1.5,w:1.5});near(m.properties.castState.x,-row.direction[0]);near(m.properties.castState.y,-row.direction[1]);near(m.properties.castState.w,row.daylight+.6*row.moon_weight);near(m.properties.lightState.w,row.daylight+row.moon_weight);near(m.properties.sceneTint.x,row.tint[0]);}}
 f.scope.dispose();
});
test('Godot filled circle primitive uses 64 native fan triangles and rejects invalid input',()=>{
 const mesh=core.filledCircle([4,-7],23);assert.equal(mesh.vertices.length,132);assert.equal(mesh.indices.length,192);assert.deepEqual(Array.from(mesh.indices.slice(0,6)),[65,0,1,65,1,2]);near(mesh.vertices[0],27);near(mesh.vertices[1],-7);assert.equal(mesh.vertices[130],4);assert.equal(mesh.vertices[131],-7);assert.throws(()=>core.filledCircle([0,0],NaN),/circle/);assert.throws(()=>core.filledCircle([0,Infinity],1),/circle/);
});

test('Drawing transforms match native scale_basis order for actor shadows, footprint press and halo',async()=>{
 const matrixRows=JSON.parse(fs.readFileSync(path.join(ROOT,'builds/reviews/M07-travel-scene-native-v2.json'))).drawingMatrices;
 const {transformInk,polygonInk}=load('TravelSceneGeometry');
 for(const row of matrixRows){const mesh=transformInk(polygonInk(row.source,[1,1,1,1]),row.at,row.angle,row.scale);Array.from(mesh.vertices).forEach((v,i)=>near(v,row.points[Math.floor(i/2)][i%2],.0001));}
 const f=fixture(),view=await TravelSceneView.create(f.parent,f.assets,f.scope,f.clock,f.state);f.state.updateRoute(.1,false);for(let i=0;i<26;i++)view.advance(1/60);
 const foot=view.footprints[1],pose=f.state.footprintPose(1);assert.ok(Math.abs(pose.scale[0]-pose.scale[1])>.2);const mesh=foot.image.image.sprite.mesh,r=foot.image.image.region;
 for(let i=0;i<4;i++){const local=[(mesh.source[i*2]-r[0])/r[2]*26-13,(mesh.source[i*2+1]-r[1])/r[3]*35-17.5],c=Math.cos(foot.angle),s=Math.sin(foot.angle),expected=[foot.at[0]+(local[0]*c-local[1]*s)*pose.scale[0],foot.at[1]+pose.drop+(local[0]*s+local[1]*c)*pose.scale[1]],actual=actualPoint(foot.image.image.sprite.node,[mesh.vertices[i*2],mesh.vertices[i*2+1]]);actual.forEach((v,j)=>near(v,expected[j],.002));}
 f.scope.dispose();
});
