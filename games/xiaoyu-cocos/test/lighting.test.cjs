const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const exportsLight={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game/LightingSnapshot.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports:exportsLight,Math,Number,Error});
const {lightingSnapshot,homeLighting,dustGate}=exportsLight,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
test('Source noon geometry and latest Home gains remain distinct from shared light values',()=>{
 const s=lightingSnapshot(12),h=homeLighting(12,1);near(s.elevation,70*Math.PI/180);near(s.cast[0],0);near(s.cast[1],1);
 near(s.sunVector[1],-Math.cos(70*Math.PI/180));near(s.sunVector[2],Math.sin(70*Math.PI/180));near(s.sunEnergy,.69);
 near(h.receiverSun,.69*1.12);near(h.shaftSun,.69);near(h.receiverMoon,0);near(h.lampEnergy,0);
 near(s.ambient[0],.43);near(s.ambient[1],.46);near(s.ambient[2],.48);near(s.sunPosition[0],180);near(s.sunPosition[1],28);
});
test('Night transition, moon positions and ambient accents preserve dawn/dusk boundaries',()=>{
 near(lightingSnapshot(20).night,0);near(lightingSnapshot(20.5).night,.5);near(lightingSnapshot(21).night,1);near(lightingSnapshot(3.5).night,.5);near(lightingSnapshot(4).night,0);
 const h=homeLighting(0,1);near(h.receiverMoon,.7*1.28);near(h.shaftMoon,.7);near(h.receiverAmbient[0],.115*.94);near(h.lampEnergy,.78);
 near(h.moonPosition[0],180);near(h.moonPosition[1],29);near(h.moonCast[0],0);near(h.moonCast[1],1);
 near(homeLighting(0,0).lampEnergy,0);near(homeLighting(0,2).lampEnergy,.78);
});
test('All 24h light samples remain finite, bounded, normalized and periodic',()=>{
 for(let hour=-48;hour<=48;hour+=.125){const s=lightingSnapshot(hour),other=lightingSnapshot(hour+24);near(s.hour,other.hour);near(s.sunEnergy,other.sunEnergy);assert.ok(s.cot>=0&&s.cot<=5);assert.ok(s.night>=0&&s.night<=1);assert.ok(s.sunEnergy>=0&&s.sunEnergy<=.75);near(Math.hypot(...s.sunVector),1);for(const v of Object.values(s)){if(typeof v==='number')assert.ok(Number.isFinite(v));}}
 assert.throws(()=>lightingSnapshot(NaN));assert.throws(()=>lightingSnapshot(Infinity));
});
test('Dust is confined to the approved projected window rather than a full-screen overlay',()=>{
 const s=lightingSnapshot(12);near(dustGate([100,100],s.cast,s.cot),0);near(dustGate([700,300],s.cast,s.cot),0);near(dustGate([156,400],s.cast,s.cot),1);near(dustGate([156,1600],s.cast,s.cot),0);
 assert.ok(dustGate([156-.23*(119+(400-145)*.46),400],s.cast,s.cot)<.62);
});
