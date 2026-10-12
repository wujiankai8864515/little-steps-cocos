const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const output={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game/Haptics.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports:output,require:()=>({}),Date,Number,Infinity});
const {HapticFeedback}=output;
function fixture(saved=null){let time=0;const pulses=[],data={value:saved};const feedback=new HapticFeedback({supported:()=>true,pulse:kind=>pulses.push(kind)},{getItem:()=>data.value,setItem:(_,v)=>data.value=v},()=>time);return {feedback,pulses,data,tick:ms=>time+=ms};}
test('All feedback types respect the persistent user switch and background suspension',()=>{
 const f=fixture();assert.equal(f.feedback.pulse('light'),true);f.tick(100);f.feedback.pulse('heavy');f.tick(100);f.feedback.pulse('long');assert.deepEqual(f.pulses,['light','heavy','long']);
 f.feedback.setEnabled(false);assert.equal(f.data.value,'off');f.tick(3000);assert.equal(f.feedback.pulse('heavy'),false);assert.equal(fixture(f.data.value).feedback.isEnabled,false);
 f.feedback.setEnabled(true);assert.equal(f.data.value,'on');f.feedback.setActive(false);assert.equal(f.feedback.pulse('long'),false);f.feedback.setActive(true);assert.equal(f.feedback.pulse('light'),true);
});
test('Repeated callbacks cannot turn into a continuous vibration and unavailable devices are harmless',()=>{
 const f=fixture();f.feedback.pulse('long');for(let i=0;i<10;i++)assert.equal(f.feedback.pulse('light'),false);f.tick(100);assert.equal(f.feedback.pulse('long'),false);f.tick(1900);assert.equal(f.feedback.pulse('long'),true);
 const broken={getItem(){throw Error('storage');},setItem(){throw Error('storage');}};
 for(const port of [undefined,{supported(){throw Error('device');}},{supported:()=>true,pulse(){throw Error('driver');}}]){const h=new HapticFeedback(port,broken);assert.doesNotThrow(()=>h.setEnabled(true));assert.equal(h.pulse('light'),false);}
});
test('WeChat channel dispatches light/heavy short feedback and long feedback without requesting permission',()=>{
 const calls=[],context={wx:{vibrateShort:o=>calls.push(['short',o.type]),vibrateLong:()=>calls.push(['long'])},globalThis:{},module:{exports:{}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../..','builds/wechatgame/templates/platform.js'),'utf8'),context);
 assert.equal(context.globalThis.LittleStepsPlatform,undefined);context.module.exports({scripts:[]});const port=context.globalThis.LittleStepsPlatform.haptics;assert.equal(port.supported(),true);['light','heavy','long'].forEach(kind=>port.pulse(kind));assert.deepEqual(calls,[['short','light'],['short','heavy'],['long']]);
});
