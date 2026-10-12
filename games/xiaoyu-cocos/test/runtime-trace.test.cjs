'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
// Run the production contact callback verbatim: logging must not consume a
// gameplay event, serialize a snapshot, or change audio/merit persistence.
function contact(trace){
 const source=fs.readFileSync(path.join(__dirname,'../assets/game/HomePage.ts'),'utf8'),ast=ts.createSourceFile('HomePage.ts',source,ts.ScriptTarget.Latest,true);let callback;
 function visit(n){if(ts.isBinaryExpression(n)&&n.left.getText(ast)==='this.rig.onContact')callback=n.right.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(callback);
 const counts={awards:0,snapshots:0,logs:0,sounds:0,persisted:0,feedback:0};
 const host={active:true,travelAway:false,rig:{behavior:{contacts:0}},incense:{state:{merit:()=>1}},merit:{count:0,award(){this.count++;counts.awards++;return true;},snapshot(){counts.snapshots++;return {count:this.count};}},hud:{merit:{setValue(){}}},onMeritChanged(){counts.persisted++;},knock:{assign(){},play(){counts.sounds++;}}};
 const context=vm.createContext({__LITTLE_STEPS_TRACE__:trace,host,haptics:()=>({pulse:()=>counts.feedback++}),gestureSeen:()=>true,assets:{audio:()=>({})},console:{info:()=>counts.logs++}});
 vm.runInContext(ts.transpileModule('host.run=(function(){return '+callback+';}).call(host)',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,context);
 return {host,counts};
}
test('10,000 actual contacts keep merit, persistence and sound while default diagnostics do no snapshot work',()=>{
 const {host,counts}=contact(undefined);for(let i=0;i<10000;i++)host.run();
 assert.deepEqual(counts,{awards:10000,snapshots:0,logs:0,sounds:10000,persisted:10000,feedback:10000});
 host.travelAway=true;host.run();host.travelAway=false;host.active=false;host.run();assert.equal(counts.awards,10000);
});
test('Explicit trace keeps the same contact behavior and string truthiness does not enable it',()=>{
 for(const flag of [true,false,'true']){const {host,counts}=contact(flag);host.run();assert.equal(counts.awards,1);assert.equal(counts.sounds,1);assert.equal(counts.persisted,1);assert.equal(counts.logs,flag===true?1:0);assert.equal(counts.snapshots,flag===true?1:0);}
});
