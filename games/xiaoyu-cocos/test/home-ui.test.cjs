const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
function load(name){const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports:out,Math,Number});return out;}
const {HomeEntryIntent}=load('HomeEntryIntent'),{SessionMerit,meritLayout}=load('MeritFeedback');
test('Settings ignores moved contacts, waits for the full bounce, and cannot reopen after cancellation',()=>{
 const entry=new HomeEntryIntent();assert.equal(entry.down([20,30]),true);entry.move([29.001,30]);entry.move([20,30]);assert.equal(entry.up([20,30]),false);assert.equal(entry.advance(1),false);
 assert.equal(entry.down([20,30]),true);assert.equal(entry.up([29,30]),true);assert.equal(entry.down([20,30]),false);assert.equal(entry.advance(.279),false);assert.equal(entry.advance(.0011),true);assert.equal(entry.advance(1),false);
 entry.down([20,30]);entry.up([20,30]);entry.cancel();assert.equal(entry.advance(10),false);entry.down([20,30]);entry.cancel();assert.equal(entry.up([20,30]),false);
});
test('Merit is tied to unique monotonic contacts, survives a pose reset, and expires after the authored full elapsed time',()=>{
 const s=new SessionMerit();assert.equal(s.award(1),true);assert.equal(s.count,1);assert.equal(s.award(1),false);assert.equal(s.award(0),false);assert.equal(s.award(2,NaN),false);assert.equal(s.count,1);
 s.advance(.12);assert.equal(s.snapshot().alpha,1);assert.equal(s.snapshot().position[1],606.6);s.advance(.58);assert.equal(s.snapshot().alpha,1);s.advance(.55);assert.equal(s.snapshot().visible,false);
 assert.equal(s.award(2,3),true);assert.equal(s.count,4);s.advance(NaN);assert.equal(s.age,0);s.advance(2);assert.equal(s.snapshot().visible,false);
});
test('Merit one keeps its approved bitmap while arbitrary rewards remain centered and fit the original width',()=>{
 const one=meritLayout(1);assert.equal(one.draws.length,2);assert.equal(one.draws[1].glyph,'+1');assert.deepEqual(Array.from(one.draws[1].region),[396,510,532,467]);assert.equal(one.bounds[3],103.5);
 for(const amount of [0,2,10,100,99999,Number.MAX_SAFE_INTEGER]){const result=meritLayout(amount);assert.ok(result.bounds[2]<=174.00000000001);assert.ok(Math.abs(result.bounds[0]*2+result.bounds[2])<1e-9);assert.equal(result.draws.slice(2).map(g=>g.glyph).join(''),String(amount));assert.ok(result.draws.every(g=>g.rect.every(Number.isFinite)));assert.ok(result.draws.length<=18);}
 assert.throws(()=>meritLayout(Infinity));
});
test('Credits retain every original artist, license paragraph and URL without text substitutions',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../../../../little-steps/games/travel_woodfish/project/home/audio/music_credits.gd'),'utf8'),literal=source.match(/const CREDITS_TEXT\s*:\s*=\s*("(?:[^"\\]|\\.)*")/)[1];assert.equal(load('HomeCreditsText').HOME_CREDITS_TEXT,JSON.parse(literal));
});
