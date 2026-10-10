const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const geometry={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game/PlantGeometry.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports:geometry,Math,Number,Float32Array,Uint16Array,Error});
const contract=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/bundles/home/assets/round2/home_plants_contract.json'),'utf8'));
const {SpringPlantPart,PlantForest}=geometry,near=(a,b,tolerance=1e-5)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<tolerance,`${v} != ${b[i]}`));
test('Each original piece has three local joints, immutable atlas UVs and exact nine-row source topology',()=>{
 const forest=new PlantForest(contract);assert.equal(forest.parts.length,18);assert.equal(forest.snapshot().bones,54);assert.equal(forest.snapshot().vertices,324);
 for(const p of forest.parts){assert.equal(p.mesh.vertices.length,36);assert.equal(p.mesh.indices.length,48);const r=p.definition.rect;near(Array.from(p.mesh.source.slice(0,4)),[r[0],r[1],r[0]+r[2],r[1]]);near(Array.from(p.mesh.source.slice(-4)),[r[0],r[1]+r[3],r[0]+r[2],r[1]+r[3]]);}
 const sources=forest.parts.map(p=>Array.from(p.mesh.source));for(let i=0;i<1800;i++)forest.advance(1/60);
 forest.parts.forEach((p,i)=>assert.deepEqual(Array.from(p.mesh.source),sources[i]));assert.ok(forest.parts.some(p=>p.revision>0));
});
test('Successive joints preserve the fixed root and reproduce an independently summed articulated tip',()=>{
 const p=new SpringPlantPart(['test','stem_0',[0,0],1,0],contract.parts.stem_0);p.angles=[.1,-.08,.05];near(p.attachment(p.pivot),[0,0]);
 const l=p.span/3,tail=p.tip[1]-p.pivot[1]-2*l,x=p.tip[0]-p.pivot[0],a=.1,b=.02,c=.07;
 near(p.attachment(p.tip),[-Math.sin(a)*l-Math.sin(b)*l-Math.sin(c)*tail+Math.cos(c)*x,Math.cos(a)*l+Math.cos(b)*l+Math.cos(c)*tail+Math.sin(c)*x]);
 p.position=[50,80];p.rotation=.2;near(p.roomPoint([0,0]),[50,80]);
});
test('Long mixed-frame wind remains local, bounded to two pulses, and every child stays connected to its authored socket',()=>{
 const f=new PlantForest(contract),rootPins=[0,4,10,12].map(i=>f.parts[i].position.slice());
 for(let frame=0;frame<12000;frame++){
  f.advance(frame%100===0?.2:1/60);assert.ok(f.activePulses<=2);assert.ok(f.peakActivePulses<=2);
  f.parts.forEach(p=>{assert.ok(p.lastSubsteps<=4);p.angles.forEach(v=>assert.ok(Math.abs(v)<=.12000001));p.velocities.forEach(v=>assert.ok(Math.abs(v)<=.80000002));near(p.attachment(p.pivot),[0,0]);if(p.recipe[5]!==undefined){const parent=f.parts[p.recipe[5]];near(p.position,parent.roomPoint(parent.attachment(p.recipe[6]||parent.tip)));}});
 }
 [0,4,10,12].forEach((i,j)=>near(f.parts[i].position,rootPins[j]));assert.ok(f.eventSerial>100);
});
test('Removing wind lets each independent joint return to its own rest without atlas drift; invalid time changes nothing',()=>{
 const f=new PlantForest(contract);for(let i=0;i<600;i++)f.advance(1/60);f.windEnabled=false;
 for(let i=0;i<1200;i++)f.advance(1/60);f.parts.forEach(p=>near(p.angles,[0,0,0]));
 const before=JSON.stringify(f.snapshot());f.advance(NaN);assert.equal(JSON.stringify(f.snapshot()),before);
 const revisions=f.parts.map(p=>p.revision);f.advance(0);assert.deepEqual(f.parts.map(p=>p.revision),revisions);
});
