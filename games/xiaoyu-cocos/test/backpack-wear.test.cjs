const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const loaded={};function load(name){if(loaded[name])return loaded[name];const out=loaded[name]={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game/'+name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports:out,require:n=>load(n.replace('./','')),Math,Number,Float32Array,Uint16Array,Map,Set});return out;}
const {ApprovedBackpackGeometry,APPROVED_BIND}=load('ApprovedBackpackGeometry'),{BackpackWear}=load('BackpackWear');
const near=(a,b,e=1e-5)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`),plain=v=>JSON.parse(JSON.stringify(v));
const wall={position:[531,379],scale:[.22,.22],rotation:0},bones={grip:-.25,shoulder:[80,32],tailScale:[1,1]},ground=[350,951];
test('All five approved contours retain actual native float32 UV, fitted vertex and index bytes',()=>{
 const oracle=JSON.parse(fs.readFileSync(path.join(__dirname,'../../..','migration/oracles/approved-backpack-native.json'))),g=new ApprovedBackpackGeometry();assert.equal(g.snapshot().vertices,120);assert.equal(g.snapshot().indices,330);
 for(const p of g.parts){const bytes=Buffer.concat([Buffer.from(p.mesh.source.buffer),Buffer.from(p.fitted.buffer),Buffer.from(p.mesh.indices.buffer)]);let hash=2166136261;for(const v of bytes)hash=Math.imul(hash^v,16777619)>>>0;assert.equal(hash,oracle.nativeFNV1a32[p.key]);const native=oracle.parts.find(o=>o.key===p.key);assert.deepEqual(Array.from(p.mesh.source),native.source.flat());assert.deepEqual(Array.from(p.mesh.indices),native.indices);}
});
test('Wear owns only existing bones for 0.24 seconds and restores captured bones before the return flight',()=>{
 const w=new BackpackWear(wall),g=new ApprovedBackpackGeometry();assert.equal(w.show(ground,bones),true);assert.equal(w.show(ground,bones),false);for(let i=0;i<15;i++)w.advance(1/60,ground);
 near(w.pose.position[0],94);near(w.pose.position[1],719);near(w.pose.scale[0],.3);near(w.pose.scale[1],.36);near(w.pose.rotation,-.06);near(w.bones.grip,.5);assert.deepEqual(plain(w.bones.shoulder),[60,105]);assert.deepEqual(plain(w.bones.tailScale),[1,1.5]);assert.equal(w.depth,10);assert.deepEqual(bones,{grip:-.25,shoulder:[80,32],tailScale:[1,1]});
 w.restore();assert.deepEqual(plain(w.bones),bones);w.advance(1/60,ground);assert.equal(w.depth,180);assert.equal(w.mode,'returning');for(let i=0;i<15;i++)w.advance(1/60,ground);assert.equal(w.mode,'hanging');assert.deepEqual(plain(w.pose),wall);assert.equal(w.depth,-10);
});
test('Cancellation during return finishes exactly once; rewear starts at the wall; free drag retains the interrupted pose',()=>{
 const worn=()=>{const w=new BackpackWear(wall);w.show(ground,bones);for(let i=0;i<15;i++)w.advance(1/60,ground);w.restore();w.advance(1/60,ground);return w;};
 const cancel=worn();assert.equal(cancel.restore(true),true);assert.deepEqual(plain(cancel.pose),wall);assert.equal(cancel.restore(true),false);
 const rewear=worn();rewear.show(ground,bones);assert.deepEqual(plain(rewear.pose),wall);assert.equal(rewear.elapsed,0);
 const drag=worn(),pose=plain(drag.pose);assert.equal(drag.interrupt(),true);drag.advance(1/60,ground);assert.deepEqual(plain(drag.pose),pose);assert.equal(drag.mode,'dragging');assert.equal(drag.interrupt(),false);
 const saved=JSON.stringify(drag.snapshot());drag.advance(NaN,ground);drag.advance(Infinity,ground);assert.equal(JSON.stringify(drag.snapshot()),saved);
});
test('Rendered worn triangles map back through shear to original alpha and reject occluded back layers during hit ownership',()=>{
 const g=new ApprovedBackpackGeometry(),frame=[.18,.025,-.035,.18,132,550];g.update(frame,1);const p=g.parts.find(p=>p.key==='near_band'),a=p.mesh.indices[0]*2,b=p.mesh.indices[1]*2,c=p.mesh.indices[2]*2,point=[0,1].map(k=>(p.mesh.vertices[a+k]+p.mesh.vertices[b+k]+p.mesh.vertices[c+k])/3),expected=[0,1].map(k=>(p.mesh.source[a+k]+p.mesh.source[b+k]+p.mesh.source[c+k])/3);let pixel;
 assert.equal(g.hit(point,(x,y)=>{pixel=[x,y];return true;},true),true);assert.deepEqual(pixel,expected.map(Math.floor));assert.equal(g.hit(point,()=>false),false);assert.equal(g.hit([-10000,-10000],()=>true),false);g.update(frame,.1);assert.equal(g.hit(point,()=>true),false);
});
test('Floor projections share fitted source/UVs, preserve height payloads and rebuild only when encoded support changes',()=>{
 const g=new ApprovedBackpackGeometry(),frame=Array.from(APPROVED_BIND);frame[4]+=150;frame[5]+=560;g.update(frame,1);g.project(frame,[[.3,-.2],[-.25,.15]],951.03125);assert.equal(g.floor,951.0625);assert.equal(g.floorRebuilds,1);
 const p=g.parts[0],i=0,x=p.mesh.vertices[i],y=p.mesh.vertices[i+1],h=Math.max(g.floor-y,0);near(p.passes[0].vertices[i],x+.3*h,.0001);near(p.passes[1].vertices[i+1],g.floor+.15*h,.0001);near(p.passes[0].vertexData[2],h,.0001);assert.deepEqual(Array.from(p.passes[0].source),Array.from(p.mesh.source));assert.deepEqual(Array.from(p.passes[1].indices),Array.from(p.mesh.indices));
 g.project(frame,[[.3,-.2],[-.25,.15]],951.033);assert.equal(g.floorRebuilds,1);g.project(frame,[[.3,-.2],[-.25,.15]],952);assert.equal(g.floorRebuilds,2);assert.equal(g.floor,952);
});
