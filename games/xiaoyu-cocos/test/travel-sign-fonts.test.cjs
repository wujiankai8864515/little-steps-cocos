const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),game=path.join(root,'games/xiaoyu-cocos/assets'),read=name=>JSON.parse(fs.readFileSync(path.join(game,'game',name+'.ts'),'utf8').split('= ')[1].trim().replace(/;$/,'')),data=read('TravelSignFontData'),scene=read('TravelSceneData');
const ctx=vm.createContext({console});vm.runInContext(fs.readFileSync(path.join(root,'engines/travel-core/dist/travel-core.js'),'utf8'),ctx);const core=ctx.LittleStepsCore;
test('Every source station and all route status/count combinations retain native shaping at both admitted densities',()=>{
 const strings={21:scene.route.nodes.map(n=>'当前站：'+n.name),24:['选择暂停','已经到家','旅途中'].flatMap(s=>Array.from({length:11},(_,i)=>s+' · '+i+' / 10'))};
 for(const size of Object.keys(strings))for(const text of strings[size])for(const density of [1,2]){
  const table=data.sizes[size],run=table.runs[text];assert.ok(run,text);const rect=size==='21'?[240,158,250,36]:[239,1190,239,42],mesh=core.shapedInkLineMesh(table,run,rect,density),atlas=data.atlases[density];
  assert.ok(mesh.indices.length>0);assert.equal(mesh.vertices.length,mesh.source.length);assert.ok([...mesh.vertices].every(Number.isFinite));assert.ok([...mesh.indices].every(i=>i<mesh.vertices.length/2));
  for(let i=0;i<mesh.source.length;i+=2){assert.ok(mesh.source[i]>=0&&mesh.source[i]<=atlas.size[0]);assert.ok(mesh.source[i+1]>=0&&mesh.source[i+1]<=atlas.size[1]);}
  for(let i=0;i<mesh.vertices.length;i+=2){assert.ok(mesh.vertices[i]>=rect[0]&&mesh.vertices[i]<=rect[0]+rect[2]);assert.ok(mesh.vertices[i+1]>=rect[1]&&mesh.vertices[i+1]<=rect[1]+rect[3]);}
 }
 const table=data.sizes['21'],mesh=core.shapedInkLineMesh(table,table.runs['当前站：临水坡'],[240,158,250,36],1);
 assert.deepEqual(Array.from(mesh.vertices.slice(0,8)),[293,166,310,166,310,187,293,187]);
 assert.throws(()=>core.shapedInkLineMesh(table,null,[0,0,100,20]),/Invalid/);
});
test('Native glyph atlases retain verified payloads, optional map ownership and conservative decode/upload reservation',()=>{
 const catalog=JSON.parse(fs.readFileSync(path.join(game,'resources/source-catalog.json'))),record=JSON.parse(fs.readFileSync(path.join(root,'migration/records/M07-sign-font-source.json')));let bytes=0;
 for(const tier of Object.keys(data.atlases)){const a=data.atlases[tier],s=catalog.assets[a.resource],file=path.join(game,'bundles',s.bundle,s.path.replace(/\/texture$/,'')+'.png');assert.equal(s.bundle,'travel_visual');assert.equal(s.decodedBytes,a.size[0]*a.size[1]*8);bytes+=s.decodedBytes;assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),record.atlases[tier].sha256);}
 assert.ok(bytes<=3*1024*1024);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(game,'bundles/home/travel/assets/travel_ui.ttf'))).digest('hex'),record.fontSHA256);
});
