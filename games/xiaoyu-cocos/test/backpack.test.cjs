const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const exportsGeometry={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game/BackpackGeometry.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports:exportsGeometry,Math,Number,Float32Array,Uint16Array,Map,Set});
const {BackpackGeometry,BackpackPart,backpackSample}=exportsGeometry;
const home=path.join(__dirname,'../assets/bundles/home'),contract=JSON.parse(fs.readFileSync(path.join(home,'assets/round2/backpack_parts_contract.json'))),ribbon=JSON.parse(fs.readFileSync(path.join(home,'home/secondary/backpack_ribbon_profile.json')));
const near=(a,b,e=1e-5)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('Actual native Godot 72-frame oracle matches every joint angle/velocity and rounded atlas seam',()=>{
 const oracle=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/backpack-native-motion.json'))),g=new BackpackGeometry(contract,ribbon);
 g.reset(oracle.rootPosition);g.phase=0;for(let i=0;i<oracle.steps;i++)g.advance(oracle.stepSeconds,oracle.rootPosition);
 for(const expected of oracle.parts){const p=g.parts.get(expected.key);assert.deepEqual(Array.from(p.angles),expected.angles);assert.deepEqual(Array.from(p.velocities),expected.velocities);assert.equal(p.inverted(),0);}
 for(const sample of oracle.nearStrapSourceSamples)assert.equal(g.parts.get('near_strap').mesh.source[sample.index],sample.value);
});
test('Five original atlas parts retain 15 joints, measured ribbon rows and authored seam UVs',()=>{
 const g=new BackpackGeometry(contract,ribbon),s=g.snapshot();assert.equal(s.partCount,5);assert.equal(s.bones,15);assert.equal(s.vertices,339);
 for(const [key,p] of g.parts){assert.equal(p.mesh.source.length,p.mesh.vertices.length);assert.ok(p.mesh.indices.every(i=>i<p.mesh.source.length/2));assert.equal(p.mesh.indices.length,p.frontIndices.length+p.backIndices.length);assert.ok(p.mesh.vertices.every(Number.isFinite));if(key.includes('strap'))assert.equal(p.mesh.source.length/2,ribbon.rows[key].length*3);}
 const p=g.parts.get('near_strap');assert.equal(p.ribbon.length,48);near(p.mesh.source[0],contract.parts.near_strap.rect[0]+ribbon.rows.near_strap[0][1]);near(p.mesh.source[1],contract.parts.near_strap.rect[1]+ribbon.rows.near_strap[0][0]);
 const anchor=g.hangingAnchor();near(anchor[0],249);near(anchor[1],51);assert.equal(g.parts.get('side_shell').visible,false);
});
test('Ribbon endpoints remain sewn through 0.24 second morph, and free drag preserves transition ownership',()=>{
 const g=new BackpackGeometry(contract,ribbon),uv=Array.from(g.parts.get('near_strap').mesh.source);g.setWorn(true);g.advance(.12);near(g.wearAmount,(4/120)/.24);for(let i=0;i<7;i++)g.advance(4/120);assert.equal(g.wearAmount,1);assert.equal(g.mode,'worn');assert.ok(Array.from(g.parts.values()).every(p=>!p.visible));
 for(const key of ['near_strap','far_strap']){const p=g.parts.get(key),top=p.transform(p.attachment(p.pivot)),bottom=p.transform(p.attachment(p.tip)),curve=p.curve;near(top[0],p.position[0]);near(top[1],p.position[1]);near(bottom[0],p.position[0]+curve[curve.length-1][0]);near(bottom[1],p.position[1]+curve[curve.length-1][1]);assert.ok(p.mesh.vertices.every(Number.isFinite));}
 g.resumeFreeDrag();g.advance(4/120,[20,30],80);assert.equal(g.mode,'dragging');assert.ok(g.wearAmount<1&&g.wearAmount>0);for(let i=0;i<8;i++)g.advance(4/120,[20,30],80);assert.equal(g.wearAmount,0);assert.equal(g.freeDragTransition,false);assert.equal(g.mode,'dragging');assert.deepEqual(Array.from(g.parts.get('near_strap').mesh.source),uv);
});
test('Independent bounded springs return to rest, and invalid steps do not mutate original parts',()=>{
 const g=new BackpackGeometry(contract,ribbon);for(let i=0;i<360;i++){g.advance(1/60,[Math.sin(i/12)*8,Math.cos(i/12)*4]);for(const p of g.parts.values()){assert.ok(p.angles.every(v=>Math.abs(v)<=.12));assert.ok(p.velocities.every(v=>Math.abs(v)<=.8));assert.ok(p.mesh.vertices.every(Number.isFinite));assert.ok(p.lastSubsteps<=4);}}
 const saved=JSON.stringify(g.snapshot());g.advance(NaN);g.advance(Infinity);assert.equal(JSON.stringify(g.snapshot()),saved);g.reset();for(const p of g.parts.values()){assert.deepEqual(Array.from(p.angles),[0,0,0]);assert.deepEqual(Array.from(p.velocities),[0,0,0]);assert.equal(p.drive,0);}near(g.phase,1.8);
});
test('Wear and free drag transitions retain the sampled room position without artificial inertia',()=>{
 const g=new BackpackGeometry(contract,ribbon),root=[531,379];g.advance(1/60,root,80,[370,950]);g.setWorn(true);g.advance(1/60,root,80,[370,950]);assert.deepEqual(Array.from(g.rootVelocity),[0,0]);
 g.resumeFreeDrag();g.advance(1/60,root,80,[370,950]);assert.deepEqual(Array.from(g.rootVelocity),[0,0]);assert.equal(g.mode,'dragging');
 g.reset();g.advance(1/60,root,80,[370,950]);assert.deepEqual(Array.from(g.rootVelocity),[0,0]);assert.equal(g.mode,'dragging');
});
test('Rendered triangle hits map back to fixed atlas alpha; transparent holes and degenerate/outside triangles reject',()=>{
 const g=new BackpackGeometry(contract,ribbon),p=g.parts.get('front_shell');p.advance(1/30,.1);
 const ia=p.mesh.indices[0]*2,ib=p.mesh.indices[1]*2,ic=p.mesh.indices[2]*2,at=[0,1].map(k=>(p.mesh.vertices[ia+k]+p.mesh.vertices[ib+k]+p.mesh.vertices[ic+k])/3),world=p.transform(at),expected=[0,1].map(k=>(p.mesh.source[ia+k]+p.mesh.source[ib+k]+p.mesh.source[ic+k])/3);let sampled;
 assert.equal(p.hit(world,(x,y)=>{sampled=[x,y];return true;}),true);assert.deepEqual(sampled,expected.map(Math.floor));assert.equal(p.hit(world,()=>false),false);assert.equal(p.hit([-10000,-10000],()=>true),false);
 const uv=backpackSample(p.mesh.vertices,p.mesh.source,p.mesh.indices,at,true);uv.forEach((v,i)=>near(v,expected[i]));assert.equal(backpackSample(new Float32Array(6),new Float32Array(6),new Uint16Array([0,1,2]),[0,0]),null);
 const attachment=p.renderedAttachment(p.tip);assert.ok(attachment.every(Number.isFinite));
});
