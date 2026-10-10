const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const behavior={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game/AmbientBehavior.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports:behavior,Math,Number});
const {AmbientDirector,SecondaryMotion,CharacterBehavior}=behavior;
test('Every variable-tempo automatic strike crosses once at original contact pose and retains the authored moving segment',()=>{
 const b=new CharacterBehavior(),hits=[],ends=[];let real=0,last=0;
 for(let i=0;i<1600;i++){real+=1/120;const before=b.actionNumber,frame=b.advance(1/120,false);if(frame.contact){hits.push(real);assert.equal(frame.poseTime,1.29);assert.ok(b.tapTime>=1.29&&b.tapTime<1.302);}if(b.actionNumber!==before){ends.push(real-last);last=real;}}
 assert.equal(hits.length,b.contacts);assert.equal(hits.length,ends.length+(b.tapTime>=1.29?1:0));assert.ok(ends.length>=5);
 ends.slice(0,5).forEach((seconds,i)=>{const speeds=[1,1.065,.965,1.035,.985];assert.ok(Math.abs(seconds-(2.15/(1.08*speeds[i])+.28))<1/100);});
});
test('Night doze begins only after a complete strike, holds across night and wakes through the original dawn rest',()=>{
 const b=new CharacterBehavior();let hit=0;
 for(let i=0;i<300;i++){const f=b.advance(1/60,true);if(f.contact)hit++;}
 assert.equal(hit,1);assert.equal(b.director.state,'doze');assert.equal(b.director.reason,'nightfall');
 for(let i=0;i<3600;i++)b.advance(1/60,true);
 assert.equal(b.director.state,'doze');assert.ok(b.director.fatigue>=.45);assert.equal(b.contacts,1);
 b.advance(1/60,false);assert.equal(b.director.state,'rest');assert.equal(b.director.reason,'dawn_waking');
 for(let i=0;i<39;i++)b.advance(1/60,false);assert.equal(b.director.state,'self_tap');assert.equal(b.director.reason,'day_resume');
});
test('Manual priority plays one full clip, recovers for 0.8 seconds, and focus loss discards an unseen strike',()=>{
 const b=new CharacterBehavior();b.requestPlayerTap();let hits=0,real=0;
 while(b.playerTapActive&&real<4){real+=1/120;if(b.advance(1/120,true).contact)hits++;}
 assert.equal(hits,1);assert.equal(b.playerHits,1);assert.equal(b.director.state,'rest');assert.ok(real>=3.2/1.08&&real<3.2/1.08+.01);
 for(let i=0;i<95;i++)b.advance(1/120,true);assert.equal(b.director.state,'rest');
 b.advance(1/120,true);b.advance(1/120,true);assert.equal(b.director.state,'doze');
 b.requestPlayerTap();for(let i=0;i<100;i++)b.advance(1/120,false);const before=b.contacts;b.focusLost();assert.equal(b.playerTapActive,false);assert.equal(b.tapTime,0);assert.equal(b.contacts,before);assert.equal(b.hitReactionAge,-1);
});
test('Spring integration caps slow frames at four substeps and keeps every bone within source motion bounds',()=>{
 const s=new SecondaryMotion();s.impulse([500,-500,500,-500]);
 for(let i=0;i<10000;i++){const p=s.advance(i%2?.1:1/120,[1,-1,1,-1]);assert.ok(s.lastSubsteps<=4);p.forEach((v,j)=>assert.ok(Math.abs(v)<=[.045,.14,.045,.07][j]));s.velocity.forEach((v,j)=>assert.ok(Math.abs(v)<=[.75,1.8,.8,1.1][j]));}
 const before=s.offset.slice();s.advance(NaN,[0,0,0,0]);assert.equal(s.lastSubsteps,0);assert.deepEqual(s.offset,before);
});
test('Long day simulation produces cooldown-separated microdozes and bounded face motion, and invalid deltas leave the pose intact',()=>{
 const b=new CharacterBehavior();let dozes=0,last='self_tap',rests=0;
 for(let i=0;i<12000;i++){const f=b.advance(1/60,false);if(b.director.state==='doze'&&last!=='doze')dozes++;if(last==='doze'&&b.director.state==='self_tap')rests++;last=b.director.state;assert.ok(Math.abs(f.mouth)<=2.8);assert.ok(Math.hypot(...b.faceGaze([2.6,0],f.step,f.closed))<=2.60000001);assert.ok(f.jelly.every(Number.isFinite));}
 assert.ok(dozes>=3);assert.ok(rests>=2);const before=JSON.stringify(b.snapshot());assert.equal(b.advance(Infinity,false),null);assert.equal(JSON.stringify(b.snapshot()),before);
 const d=new AmbientDirector(),snapshot=JSON.stringify(d.snapshot());d.advance(NaN,false,true);assert.equal(JSON.stringify(d.snapshot()),snapshot);
});
