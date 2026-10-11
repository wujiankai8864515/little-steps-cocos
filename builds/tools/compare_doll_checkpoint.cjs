// Compare migrated bones/continuous skin against publicly logged native frames.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript'),api={};
for(const name of ['math','bitmap'])vm.runInNewContext(fs.readFileSync(path.join(root,'engines/travel-core/src',name+'.js'),'utf8'),{api,Math,Number,Map,Float32Array,Uint16Array});
function load(name){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'games/xiaoyu-cocos/assets/game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports,Math,Number,Map,Float32Array,Uint16Array,require:id=>id==='./Engine'?{core:api}:load(id.slice(2))});return exports;}
const [input,output]=process.argv.slice(2);if(!input||!output)throw new Error('Usage: node compare_doll_checkpoint.cjs native-public.json output.json');
const logs=JSON.parse(fs.readFileSync(input,'utf8')),entry=logs.find(row=>row.message.startsWith('[LittleSteps QA] doll native oracle '));if(!entry)throw new Error('No native oracle log');
const native=JSON.parse(entry.message.slice('[LittleSteps QA] doll native oracle '.length));if(native.rows.length!==160)throw new Error('Incomplete native trace');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'games/xiaoyu-cocos/assets/bundles/darkroom/darkroom/assets/round3',name+'.json'),'utf8'));
const {DollSkin,DOLL_PARTS}=load('DollSkin'),masks={};DOLL_PARTS.forEach(id=>masks[id]=read('doll_'+id+'_hit'));
const rig=new DollSkin(read('doll_source_contract'),read('doll_source_geometry'),(id,x,y)=>api.bitMapContains(masks[id],x,y));
let maxAngle=0,maxVelocity=0,maxSample=0,maxFull=0,maxProbe=0;const mismatches=[],rows=[];
for(const row of native.rows){const i=row.frame;rig.rootRotation=row.rootRotation;
 if(i===0)rig.applyContact('needle',rig.worldPoint([240.5,350.5]));if(i===30)rig.applyContact('slipper',rig.worldPoint([300.5,190.5]));
 if(i===55)rig.setDragging(true);if(i===112)rig.setDragging(false);if(i===100)rig.applyContact('slipper',rig.worldPoint([130.5,307.5]));
 rig.advance(row.delta,row.acceleration);const state=rig.snapshot();
 let angle=0,velocity=0,sample=0,full=0,probe=0;
 DOLL_PARTS.forEach((id,index)=>{angle=Math.max(angle,Math.abs(state.joint_angles[id]-row.rig.joint_angles[id]));velocity=Math.max(velocity,Math.abs(state.velocities[index]-row.velocities[index]));});
 for(const [index,x,y] of row.samples)sample=Math.max(sample,Math.abs(rig.mesh.vertices[index*2]-x),Math.abs(rig.mesh.vertices[index*2+1]-y));
 row.fullVertices.forEach((point,index)=>point.forEach((v,axis)=>full=Math.max(full,Math.abs(rig.mesh.vertices[index*2+axis]-v))));
 for(const item of row.probes){const at=rig.worldPoint(item.pixel);probe=Math.max(probe,Math.abs(at[0]-item.world[0]),Math.abs(at[1]-item.world[1]));const part=rig.partAt(at);if(part!==item.part)mismatches.push({frame:i,pixel:item.pixel,native:item.part,cocos:part});}
 for(const key of ['expression','dragging','hit_serial','last_hit_part','substeps'])if(state[key]!==row.rig[key])mismatches.push({frame:i,key,native:row.rig[key],cocos:state[key]});
 maxAngle=Math.max(maxAngle,angle);maxVelocity=Math.max(maxVelocity,velocity);maxSample=Math.max(maxSample,sample);maxFull=Math.max(maxFull,full);maxProbe=Math.max(maxProbe,probe);rows.push({frame:i,angle,velocity,sample,full,probe});
}
const report={kind:'Native Godot Web160-frame oracle vs migrated TypeScript CPU; shader/browser/physical input not covered',nativeLog:{path:path.resolve(input),sha256:crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex'),timestamp:entry.timestamp,url:entry.url},frames:160,fullVertexFrames:[10,30,90,159],maximum:{angle:maxAngle,velocity:maxVelocity,sample:maxSample,fullVertex:maxFull,worldProbe:maxProbe},mismatches,rows,pending:['Cocos seven masked render passes','Original scene shader/skin screenshot comparison','Darkroom physical input and page lifecycle','WeChat device acceptance']};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({frames:160,maximum:report.maximum,mismatches:mismatches.length,output:path.resolve(output)}));
