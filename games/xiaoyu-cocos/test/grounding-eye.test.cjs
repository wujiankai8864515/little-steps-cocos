const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
function load(name){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports,Math,Number,Float32Array,Uint16Array,Error});return exports;}
const {contactProfile,shadowGeometry,projectShadow,projectedContacts,supportAt}=load('GroundingGeometry');
const {clampEyeOffset,EYE_CENTERS,EYE_DOMAINS}=load('EyeGeometry'),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
test('Measured contact profiles use original alpha >= .5 and preserve separate feet',()=>{
 const p=contactProfile('Doll',[512,512],(x,y)=>x<200?y===450?.499:y===400?.5:0:y===480?1:0);
 assert.equal(p.contacts.length,2);assert.equal(p.contacts[0].length,42);assert.equal(p.contacts[1].length,48);near(p.profile[0][1],400.5);near(p.profile.at(-1)[1],480.5);
 near(supportAt(p.profile,210.5),400.5+(480.5-400.5)*(210.5-180.5)/(222.5-180.5));
 assert.throws(()=>contactProfile('OriginalBody',[670,402],()=>0));
});
test('Grounded mesh projects each height from its measured support and preserves source coordinates',()=>{
 const mesh=shadowGeometry([20,20],[[[2.5,12.5],[17.5,16.5]]]),source=Array.from(mesh.source),matrix=[2,0,0,3,100,200];
 projectShadow(mesh,matrix,[.5,.25],999,true,true);
 near(mesh.vertexData[0],100);near(mesh.vertexData[1],200);near(mesh.vertexData[2],37.5);near(mesh.vertices[0],118.75);near(mesh.vertices[1],246.875);
 const i=2;near(mesh.vertices[i],mesh.vertexData[3]);near(mesh.vertices[i+1],237.5);near(mesh.vertexData[5],0);
 assert.deepEqual(Array.from(mesh.source),source);assert.ok(mesh.indices.every(i=>i<mesh.source.length/2));
 const contacts=projectedContacts(mesh,matrix,7);near(contacts[0][0][0],105);near(contacts[0][0][1],244.5);
});
test('Legacy floor and wall passes retain their original affine projection behavior',()=>{
 const mesh=shadowGeometry([20,20]),matrix=[1,0,0,1,30,40];projectShadow(mesh,matrix,[.2,.4],50,false,true);
 near(mesh.vertices[0],32);near(mesh.vertices[1],54);near(mesh.vertices[3],46);near(mesh.vertexData[5],0);
 projectShadow(mesh,matrix,[.2,.4],50,false,false,0,[3,7]);near(mesh.vertices[0],33);near(mesh.vertices[1],47);near(mesh.vertexData[2],10);
});
test('Pupil ray clamping keeps whole enlarged pupils inside the authored convex domains',()=>{
 for(let eye=1;eye<=2;eye++)for(let a=0;a<360;a+=5)for(const magnitude of [1,10,1e300]){
  const request=[Math.cos(a*Math.PI/180)*magnitude,Math.sin(a*Math.PI/180)*magnitude],offset=clampEyeOffset(eye,request),at=EYE_CENTERS[eye-1].map((v,i)=>v+offset[i]),polygon=EYE_DOMAINS[eye-1];
  assert.ok(offset.every(Number.isFinite));near(offset[0]*Math.sin(a*Math.PI/180)-offset[1]*Math.cos(a*Math.PI/180),0);
  for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length];assert.ok((q[0]-p[0])*(at[1]-p[1])-(q[1]-p[1])*(at[0]-p[0])>=-1e-8);}
 }
 assert.deepEqual(Array.from(clampEyeOffset(1,[0,0])),[0,0]);assert.deepEqual(Array.from(clampEyeOffset(2,[Infinity,0])),[0,0]);
});
