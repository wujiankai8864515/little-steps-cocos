const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const api={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../../engines/travel-core/src/math.js'),'utf8'),{api,Math,Number,Map,Float32Array,Uint16Array});
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../../engines/travel-core/src/bitmap.js'),'utf8'),{api,Math,Number});
function load(name){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports,Math,Number,Map,Float32Array,Uint16Array,require:id=>id==='./Engine'?{core:api}:load(id.slice(2))});return exports;}
const {DollSkin,DOLL_PARTS}=load('DollSkin'),{DarkroomRound,darkToolPose}=load('DarkroomRound');
const data=path.join(__dirname,'../assets/bundles/darkroom/darkroom/assets/round3'),read=name=>JSON.parse(fs.readFileSync(path.join(data,name+'.json'),'utf8'));
const contract=read('doll_source_contract'),geometry=read('doll_source_geometry'),masks={};DOLL_PARTS.forEach(id=>masks[id]=read('doll_'+id+'_hit'));
const make=()=>new DollSkin(contract,geometry,(id,x,y)=>api.bitMapContains(masks[id],x,y));
const {fitTray,inPolygon,RECESSES,ResponsiveLamp,DARK_PLANT_PARTS}=load('DarkroomVisualRules'),{PlantForest}=load('PlantGeometry');
const near=(a,b,t=1e-4)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}, tolerance ${t}`),json=v=>JSON.parse(JSON.stringify(v));
test('Authored mother pixels use the exact neutral source origin, 1089 vertices and original visible-cell diagonal',()=>{
 const rig=make();assert.equal(rig.mesh.vertices.length,2178);assert.equal(rig.mesh.indices.length,geometry.skin_visible_cells.filter(Boolean).length*6);
 for(let i=0;i<1089;i++){near(rig.mesh.vertices[i*2],rig.mesh.source[i*2]-256);near(rig.mesh.vertices[i*2+1],rig.mesh.source[i*2+1]-480);}
 let at=0;for(let c=0;c<1024;c++)if(geometry.skin_visible_cells[c]){const a=Math.floor(c/32)*33+c%32;assert.deepEqual(Array.from(rig.mesh.indices.slice(at,at+6)),[a,a+1,a+33,a+1,a+34,a+33]);at+=6;}
 assert.equal(rig.partAt(rig.worldPoint([0.5,0.5])), '');assert.equal(rig.contract.source_sha256,'2318067ff0d9d437fbf4e0a7b406989861cb9a24827b8964e375c868681fdfc4');
});
test('Every part remains connected and its original BitMap stays authoritative after bounded spring and drag deformation',()=>{
 const rig=make(),pixels={};for(const id of DOLL_PARTS){const rows=masks[id].rows;let largest=[0,0,0];for(let y=0;y<rows.length;y++)for(let i=0;i<rows[y].length;i+=2)if(rows[y][i+1]-rows[y][i]>largest[2])largest=[(rows[y][i]+rows[y][i+1])/2,y+.5,rows[y][i+1]-rows[y][i]];pixels[id]=largest.slice(0,2);}
 for(let tick=0;tick<100;tick++){if(tick===0)rig.applyContact('slipper',rig.worldPoint(pixels.head));rig.setDragging(tick>=10&&tick<65);rig.rootRotation=.06*Math.sin(tick*.2);rig.advance(1/60,[1800*Math.sin(tick*.3),900*Math.cos(tick*.2)]);
  DOLL_PARTS.forEach((id,i)=>{const spec=contract.parts[id],joint=rig.joints[i],world=api.Math2D.transform(joint,0,0);if(i){const expected=api.Math2D.transform(rig.joints[0],spec.source_pivot[0]-contract.parts.torso.source_pivot[0],spec.source_pivot[1]-contract.parts.torso.source_pivot[1]);near(world[0],expected[0]);near(world[1],expected[1]);}assert.equal(rig.partAt(rig.worldPoint(pixels[id])),id);});
  assert.ok(rig.mesh.vertices.every(Number.isFinite));assert.ok(rig.angles.every(v=>Math.abs(v)<=.140001));
 }
 const state=JSON.stringify(rig.snapshot());rig.advance(NaN);rig.advance(Infinity);assert.equal(JSON.stringify(rig.snapshot()),state);rig.reset();assert.ok(rig.angles.every(v=>v===0));
});
test('Contact is credited at native impact once; rapid taps queue only one strike; pause and drag cancel without late credit',()=>{
 const rig=make(),round=new DarkroomRound(rig);round.inputEnabled=true;const at=rig.worldPoint([240.5,350.5]);round.pendingTarget=at;round.strike();for(let i=0;i<10;i++)round.strike();round.advance(.24);assert.equal(round.contacts,0);round.advance(.02);assert.equal(round.contacts,1);assert.equal(round.misfortune,90);round.advance(.5);assert.equal(round.contacts,1);assert.ok(round.attackTime>=0);round.cancel();round.advance(1);assert.equal(round.contacts,1);assert.equal(round.attackTime,-1);
 assert.equal(round.beginPointer(1,rig.worldPoint([240.5,350.5])),true);assert.equal(round.beginPointer(2,at),false);assert.equal(round.movePointer(2,[0,0]),false);const drag=round.pointerOrigin.map((v,i)=>v+(i? -300:100));round.movePointer(1,drag);round.advance(1/60);assert.equal(round.pointerDragged,true);round.endPointer(1,drag);round.advance(.4);assert.equal(round.contacts,1);assert.equal(round.pointer,null);
 round.active=false;const before=JSON.stringify(round.snapshot());round.advance(2);assert.equal(JSON.stringify(round.snapshot()),before);
});
test('Five slipper impacts remove100 with zero reward, reveal one result, one-second empty gap and complete1.55s spawn',()=>{
 const rig=make(),round=new DarkroomRound(rig);round.inputEnabled=true;round.select('slipper');
 for(let strike=0;strike<5;strike++){round.pendingTarget=rig.worldPoint([240.5,350.5]);assert.equal(round.strike(),true);for(let i=0;i<50;i++)round.advance(1/60);}
 assert.equal(round.contacts,5);assert.equal(round.misfortune,0);assert.equal(round.phase,'clear_out');assert.equal(round.select('needle'),false);
 while(round.phase==='clear_out')round.advance(1/60);assert.equal(round.dollVisible,false);assert.equal(round.completedRounds,1);assert.equal(round.gapRemaining,1);
 const events=round.drainEvents();assert.equal(events.filter(e=>e.kind==='result').length,1);assert.equal(events.filter(e=>e.kind==='finished').length,1);assert.equal(events.find(e=>e.kind==='finished').reward,0);
 round.advance(.5);assert.equal(round.phase,'gap_1s');for(let i=0;i<31;i++)round.advance(1/60);assert.equal(round.phase,'spawn_in');assert.equal(round.roundSerial,2);assert.equal(round.contacts,0);assert.equal(round.misfortune,100);assert.equal(round.select('needle'),false);
 for(let i=0;i<95;i++)round.advance(1/60);assert.equal(round.phase,'ready_full');assert.equal(round.spawnAlpha,1);assert.equal(round.drainEvents().filter(e=>e.kind==='ready').length,1);assert.equal(round.selected,'slipper');round.strike();assert.equal(round.phase,'active');round.restart();assert.equal(round.selected,'needle');assert.equal(round.pointer,null);
});
test('Native tool source pivots touch the captured target exactly at both impact boundaries',()=>{for(const [tool,time] of [['needle',.25],['slipper',.34]]){const pose=darkToolPose(tool,time,[398,638]);assert.deepEqual(json(pose.position),[398,638]);assert.equal(pose.alpha,1);assert.deepEqual(json(pose.pivot),tool==='needle'?[349,813]:[1030,445]);}near(darkToolPose('needle',.64,[0,0]).alpha,0);near(darkToolPose('slipper',.82,[0,0]).alpha,0);});
test('160 native Godot oracle frames preserve seven springs, contacts, expression, alpha-hit probes and complete checkpoint vertices',()=>{
 const native=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/doll-native.json'),'utf8')),rig=make();assert.equal(native.rows.length,160);assert.equal(native.contractSHA256,contract.source_sha256);
 for(const row of native.rows){const i=row.frame;rig.rootRotation=row.rootRotation;
  if(i===0)rig.applyContact('needle',rig.worldPoint([240.5,350.5]));if(i===30)rig.applyContact('slipper',rig.worldPoint([300.5,190.5]));
  if(i===55)rig.setDragging(true);if(i===112)rig.setDragging(false);if(i===100)rig.applyContact('slipper',rig.worldPoint([130.5,307.5]));
  rig.advance(row.delta,row.acceleration);const s=rig.snapshot();
  DOLL_PARTS.forEach((id,j)=>{near(s.joint_angles[id],row.rig.joint_angles[id],2e-8);near(s.velocities[j],row.velocities[j],1.3e-7);});
  for(const [j,x,y] of row.samples){near(rig.mesh.vertices[j*2],x,.00025);near(rig.mesh.vertices[j*2+1],y,.00025);}
  row.fullVertices.forEach((p,j)=>p.forEach((v,axis)=>near(rig.mesh.vertices[j*2+axis],v,.00015)));
  for(const p of row.probes){const at=rig.worldPoint(p.pixel);at.forEach((v,axis)=>near(v,p.world[axis],.00019));assert.equal(rig.partAt(at),p.part);}
  for(const key of ['expression','dragging','hit_serial','last_hit_part','substeps'])assert.equal(s[key],row.rig[key]);
 }
});
test('Both original tool contours fit the authored tray recesses after their pivot rotation and sixteen-step fitting',()=>{
 const geometry=JSON.parse(fs.readFileSync(path.join(data,'../round2/doll_alpha_geometry.json'),'utf8'));
 for(const tool of ['needle','slipper']){const fit=fitTray(tool,geometry.tools[tool]),m=api.Math2D.trs(fit.position,fit.rotation,[fit.scale,fit.scale]);assert.equal(fit.inside,true);assert.ok(fit.scale>.01&&fit.scale<.28);for(const p of geometry.tools[tool].contour)assert.equal(inPolygon(api.Math2D.transform(m,p[0]-fit.pivot[0],p[1]-fit.pivot[1]),RECESSES[tool]),true);}
});
test('Responsive lamp follows automatic clock, reverses a tap continuously, settles in .22s and retains the .34s squish',()=>{
 const lamp=new ResponsiveLamp();lamp.advance(0,.7);near(lamp.value,.7);assert.equal(lamp.toggle(),false);lamp.advance(.11,1);near(lamp.value,.35);const before=lamp.value;assert.equal(lamp.toggle(),true);near(lamp.value,before);lamp.advance(.22,0);near(lamp.value,1);assert.notEqual(lamp.scale()[0],1);lamp.advance(.13,0);near(lamp.scale()[0],1);const state=JSON.stringify(lamp);lamp.advance(NaN,0);assert.equal(JSON.stringify(lamp),state);
});
test('Darkroom uses twenty-one authored independent three-joint plants, with at most two simultaneous source-amplitude pulses',()=>{
 const contract=JSON.parse(fs.readFileSync(path.join(data,'../round2/darkroom_plants_contract.json'),'utf8')),forest=new PlantForest(contract,DARK_PLANT_PARTS,true);assert.equal(forest.parts.length,21);assert.equal(forest.parts.length*18,378);
 for(let i=0;i<720;i++){forest.advance(1/60);assert.ok(forest.activePulses<=2);assert.ok(forest.bindings.every(b=>Math.abs(b.amplitude)<=.063001));assert.ok(forest.parts.every(p=>p.mesh.vertices.every(Number.isFinite)));}
 assert.ok(forest.eventSerial>10);assert.equal(forest.peakActivePulses,2);forest.windEnabled=false;for(let i=0;i<600;i++)forest.advance(1/60);assert.ok(forest.parts.every(p=>p.angles.every(v=>v===0)));
});
