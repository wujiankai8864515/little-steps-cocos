const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
function load(name){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,{exports,Math,Number,Set});return exports;}
const {ComicAudio,HomeMusic}=load('AudioBehavior'),{HomeClock}=load('HomeClock');
function player(){return {playing:false,wanted:'stopped',volume:0,clips:[],plays:0,pauses:0,stops:0,disposed:false,
 assign(clip,loop){this.stop();this.clips.push([clip,loop]);},play(){if(this.disposed||this.wanted==='playing')return false;this.wanted='playing';this.playing=true;this.plays++;return true;},
 pause(){if(this.wanted!=='playing')return false;this.wanted='paused';this.playing=false;this.pauses++;return true;},stop(){const pending=this.wanted!=='stopped';this.wanted='stopped';this.playing=false;if(pending)this.stops++;return pending;},
 gain(v){this.volume=v;},snapshot(){return {wanted:this.wanted,playing:this.playing,volume:this.volume};},dispose(){if(this.disposed)return;this.stop();this.disposed=true;}};}
test('Comic reveals sound once per panel, and suspension never replays skipped panels',()=>{
 const ports=[player(),player()],audio=new ComicAudio(ports,{puff:'puff',drink:'drink',joy:'joy'},true);
 audio.setActive(true);audio.reveal(0);audio.reveal(0);audio.reveal(1);
 assert.equal(audio.playCount,3);assert.deepEqual(ports[1].clips,[['drink',undefined]]);
 audio.setActive(false);assert.ok(ports.every(p=>!p.playing));audio.reveal(2);audio.setActive(true);audio.reveal(2);audio.reveal(3);
 assert.equal(audio.playCount,4);assert.deepEqual(Array.from(audio.snapshot().revealedOnce),[0,1,2,3]);
 assert.ok(Math.abs(ports[0].volume-Math.pow(10,-8/20))<1e-12);audio.dispose();assert.ok(ports.every(p=>p.disposed));
 const silent=new ComicAudio([player(),player()],{puff:'puff'},false);silent.setActive(true);silent.reveal(0);assert.equal(silent.playCount,0);
});
test('Home music requires gesture, starts both loops once, and pauses/resumes without restarting the model',()=>{
 const ports=[player(),player()],music=new HomeMusic(ports,['day','night']);music.setActive(true);assert.equal(music.snapshot().startCount,0);
 music.notifyGesture();music.notifyGesture();assert.equal(music.snapshot().startCount,1);assert.ok(ports.every(p=>p.plays===1));
 for(let i=0;i<8;i++)music.advance(.1);assert.ok(Math.abs(ports[0].volume-Math.pow(10,-24/20))<1e-12);assert.equal(ports[1].volume,0);
 music.setActive(false);music.setActive(false);assert.equal(music.snapshot().pauseWrites,2);music.advance(100);assert.equal(music.snapshot().envelope,0);
 music.setActive(true);music.setActive(true);assert.equal(music.snapshot().resumeWrites,2);assert.equal(music.snapshot().startCount,1);
 music.setEnabled(false);music.setEnabled(false);assert.equal(music.snapshot().pauseWrites,4);music.setEnabled(true);assert.equal(music.snapshot().resumeWrites,4);
 music.dispose();music.dispose();music.notifyGesture();music.setActive(true);assert.equal(music.snapshot().stopCount,2);assert.ok(ports.every(p=>p.disposed));
});
test('Day/night gains use the original four second mix, smoothstep and 0.8 second entrance fade',()=>{
 const ports=[player(),player()],music=new HomeMusic(ports,['day','night'],true);music.setActive(true);music.setNightMix(1);
 music.advance(10);assert.equal(music.snapshot().mix,.025);assert.equal(music.snapshot().envelope,.125);
 for(let i=0;i<19;i++)music.advance(.1);assert.ok(Math.abs(music.snapshot().mix-.5)<1e-12);assert.ok(Math.abs(ports[0].volume-ports[1].volume)<1e-12);
 for(let i=0;i<20;i++)music.advance(.1);assert.equal(music.snapshot().mix,1);assert.equal(ports[0].volume,0);assert.ok(Math.abs(ports[1].volume-Math.pow(10,-24/20))<1e-12);
 music.setNightMix(NaN);assert.equal(music.snapshot().targetMix,1);
});
test('Shared clock retains exact dawn, dusk, lamp fades, active time and music transition boundaries',()=>{
 const clock=new HomeClock();assert.equal(clock.hour(),7);clock.seekHour(20);assert.equal(clock.position,30);assert.equal(clock.nightProgress(),0);
 clock.advance(15);assert.equal(clock.hour(),0);assert.equal(clock.lampWeight(),0);clock.advance(1);assert.equal(clock.lampWeight(),.5);clock.advance(1);assert.equal(clock.lampWeight(),1);
 clock.advance(7);assert.equal(clock.lampWeight(),.5);clock.advance(1);assert.equal(clock.lampWeight(),0);clock.advance(5);assert.equal(clock.hour(),4);
 assert.equal(clock.totalActive,30);clock.advance(100,false);assert.equal(clock.totalActive,30);
 clock.seekHour(20.5);assert.equal(clock.nightMix(),.5);clock.seekHour(3.5);assert.equal(clock.nightMix(),.5);clock.seekHour(12);assert.equal(clock.nightMix(),0);
 clock.seekHour(-17);assert.equal(clock.hour(),7);clock.advance(60);assert.ok(Math.abs(clock.hour()-7)<1e-12);
});
