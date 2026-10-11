const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const c=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../../../engines/travel-core/dist/travel-core.js'),'utf8'),c);const core=c.LittleStepsCore;
const storage=()=>{const values=new Map();return {getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,v),values};};
class Vec4{constructor(x,y,z,w){Object.assign(this,{x,y,z,w});}}
const mods={Engine:{core},TravelStore:{travelRuntimeStorage:storage},XiaoyuRig:{}},load=name=>{const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game/'+name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:key=>key==='cc'?{Vec4}:mods[key.slice(2)],console});return mods[name]=exports;};
const {WardrobeStore,WARDROBE_SAVE_PREFIX,unlockPolicy}=load('WardrobeStore'),{WardrobeSession}=load('WardrobeSession'),{applyOutfit}=load('OutfitBinding'),{WardrobeMotion,wardrobeParticle}=load('WardrobeGeometry');
const saved=s=>JSON.stringify(s.snapshot());const delay=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('Latest source local-unlock policy persists ownership separately from worn skin and restores across instances and slots',()=>{
 const disk=storage(),a=new WardrobeStore(disk);assert.equal(a.configure(),true);assert.equal(a.equip('peach'),false);assert.equal(a.unlockTemporaryLocal('unknown'),false);
 assert.equal(a.unlockTemporaryLocal('peach'),true);const revision=a.revision;for(let i=0;i<5;i++)assert.equal(a.unlockTemporaryLocal('peach'),true);assert.equal(a.revision,revision);assert.equal(a.worn,'original');assert.equal(a.equip('peach'),true);
 const b=new WardrobeStore(disk);assert.equal(b.configure(),true);assert.equal(b.worn,'peach');assert.equal(b.equip('original'),true);assert.deepEqual(Array.from(b.unlocked),['original','peach']);assert.equal(b.configure('other'),true);assert.deepEqual(Array.from(b.unlocked),['original']);assert.equal(b.worn,'original');assert.equal(b.configure('main'),true);assert.equal(b.unlocked.length,2);
 assert.equal(unlockPolicy(),'temporary_local');assert.equal(unlockPolicy('unknown'),'verified_reward');assert.equal(b.acceptVerifiedReward('peach',false),false);
});
test('Wardrobe failed writes roll back unlock and equip, while corruption/read failures never overwrite existing saves',()=>{
 const disk=storage(),s=new WardrobeStore(disk);s.configure();const write=disk.setItem,before=saved(s);disk.setItem=()=>{throw Error('quota');};assert.equal(s.unlockTemporaryLocal('peach'),false);assert.equal(saved(s),before);disk.setItem=write;assert.equal(s.unlockTemporaryLocal('peach'),true);const unlocked=saved(s);disk.setItem=()=>{throw Error('quota');};assert.equal(s.equip('peach'),false);assert.equal(saved(s),unlocked);disk.setItem=write;
 disk.values.set(WARDROBE_SAVE_PREFIX+'main','broken');const bad=new WardrobeStore(disk);assert.equal(bad.configure(),false);assert.equal(bad.unlockTemporaryLocal('peach'),false);assert.equal(disk.getItem(WARDROBE_SAVE_PREFIX+'main'),'broken');
 disk.getItem=()=>{throw Error('read denied');};assert.equal(bad.configure('new'),false);assert.equal(bad.unlockTemporaryLocal('peach'),false);
});
test('Wardrobe stale writers and future save schemas fail closed, and disabled persistence does not touch storage',()=>{
 const disk=storage(),a=new WardrobeStore(disk),b=new WardrobeStore(disk);a.configure();b.configure();a.unlockTemporaryLocal('peach');assert.equal(b.unlockTemporaryLocal('peach'),false);assert.equal(b.error,'stale_revision');assert.equal(b.unlocked.length,1);
 const future={schema:2,revision:10,worn:'peach',unlocked:['original','peach']},raw=new core.CheckpointStore(null,65536).envelope(future);disk.values.set(WARDROBE_SAVE_PREFIX+'main',raw);assert.equal(b.configure(),false);assert.equal(b.error,'unsupported_saved_schema');assert.equal(b.unlockTemporaryLocal('peach'),false);assert.equal(disk.getItem(WARDROBE_SAVE_PREFIX+'main'),raw);
 const memory=new WardrobeStore({getItem(){throw Error('must not read');},setItem(){throw Error('must not write');}});memory.configure('test',false);assert.equal(memory.unlockTemporaryLocal('peach'),true);assert.equal(memory.equip('peach'),true);memory.configure('test',false);assert.equal(memory.worn,'original');
});
test('Preview, unlock and explicit equip follow original choices; cancel and closing preserve committed clothing',async()=>{
 const s=new WardrobeStore(storage());s.configure();let preview;const page=new WardrobeSession(s,{preview:id=>{preview=id;return true;},equip:async(id,current)=>current()&&s.equip(id)});page.open();const initial=saved(s);page.select('peach');assert.equal(preview,'peach');assert.equal(saved(s),initial);assert.equal(page.choices[0],'直接解锁');await page.choose(1);assert.equal(preview,'original');assert.equal(saved(s),initial);
 page.select('peach');await page.choose(0);assert.equal(page.choices[0],'穿上');assert.equal(s.worn,'original');await page.choose(0);assert.equal(s.worn,'peach');assert.equal(page.message,'这身很适合今天。');page.select('original');page.close();assert.equal(preview,'peach');assert.equal(s.worn,'peach');
});
test('Verified-provider policy never falls back to local unlock and discards delayed success after close',async()=>{
 const s=new WardrobeStore(storage());s.configure();const ports={preview:()=>true,equip:async()=>false};let page=new WardrobeSession(s,ports,'invalid');page.open();page.select('peach');await page.choose(0);assert.match(page.message,/广告暂时不可用/);assert.equal(s.unlocked.length,1);
 const pending=delay();page=new WardrobeSession(s,{...ports,reward:()=>pending.promise},'verified_reward');page.open();page.select('peach');const wait=page.choose(0);page.close();pending.resolve(true);await wait;assert.equal(s.unlocked.length,1);
 page=new WardrobeSession(s,{...ports,reward:async()=>false},'verified_reward');page.open();page.select('peach');await page.choose(0);assert.equal(s.unlocked.length,1);assert.match(page.message,/还没解锁/);
 page=new WardrobeSession(s,{...ports,reward:async()=>true},'verified_reward');page.open();page.select('peach');await page.choose(0);assert.equal(s.unlocked.length,2);assert.equal(s.worn,'original');assert.equal(page.choices[0],'穿上');
});
test('Outfit binding keeps the same rig/material and animated mouth, maps trimmed source pixels, then disables safely',()=>{
 const values={bodyState:new Vec4(1.2,0,0,0)},material={getProperty:k=>values[k],setProperty:(k,v)=>values[k]=v},body={node:{name:'OriginalBody'},sprite:{customMaterial:material}},rig={receivers:[body]},textures={peach:{},body:{}};
 const assets={texture:p=>p.indexOf('peach')>=0?textures.peach:textures.body,art:()=>({size:[1005,603],content:[52,20,785,551]})};assert.equal(applyOutfit(rig,assets,'peach'),true);assert.equal(values.bodyState.x,1.2);assert.equal(values.bodyState.z,1);assert.equal(values.outfit_texture,textures.peach);assert.equal(body.sprite.customMaterial,material);assert.equal(values.outfitCrown.z,12);
 const crop=values.outfitCrop,source=[335/670,290/402],local=[(source[0]-crop.x)/crop.z,(source[1]-crop.y)/crop.w];assert.ok(Math.abs(local[0]-(source[0]*1005-52)/785)<1e-12);assert.ok(Math.abs(local[1]-(source[1]*603-20)/551)<1e-12);
 assert.equal(applyOutfit(rig,assets,'original'),true);assert.equal(values.bodyState.z,0);assert.equal(values.bodyState.x,1.2);assert.equal(values.outfit_texture,textures.body);assert.equal(applyOutfit(rig,assets,'missing'),false);
});
test('Cloth impulses and seven vines remain bounded; original particle lifetime is finite across repeated selection',()=>{
 const m=new WardrobeMotion();for(let frame=0;frame<6000;frame++){if(frame%5===0)m.select(frame%2);m.advance(frame%37===0?1:1/60);assert.ok(m.cloth.every(v=>Number.isFinite(v)&&Math.abs(v)<=24));assert.ok(m.vine.every(v=>Number.isFinite(v)&&Math.abs(v)<=.06));}
 for(let i=0;i<22;i++){assert.equal(wardrobeParticle(i,4).visible,false);assert.equal(wardrobeParticle(i,4).alpha,0);assert.equal(wardrobeParticle(i,0).visible,i===0);assert.ok(wardrobeParticle(i,1).position.every(Number.isFinite));}m.cancel();assert.ok(m.cloth.every(v=>v===0));
});

mods.Engine.lifetime=parent=>new core.Lifetime(parent);
const {Application}=load('Application');
function outfitApplication(){
 const app=Object.create(Application.prototype),owner=new core.Lifetime(),store=new WardrobeStore(storage());store.configure();store.unlockTemporaryLocal('peach');
 const values={bodyState:new Vec4(0,0,0,0)},rig={receivers:[{node:{name:'OriginalBody'},sprite:{customMaterial:{getProperty:k=>values[k],setProperty:(k,v)=>values[k]=v}}}]};
 const pending=[];Object.assign(app,{homePage:{scope:owner,page:{rig}},skins:store,assets:{acquireResources(paths,scope){const d=delay();pending.push({...d,scope,paths});return scope.guard(d.promise);},texture:()=>({}),art:()=>({size:[100,100],content:[0,0,100,100]})}});return {app,owner,store,pending,values};
}
test('Actual outfit transaction releases a failed or cancelled lease without touching the committed body',async()=>{
 const f=outfitApplication(),cancelled=f.app.equipOutfit('peach',()=>false);f.pending[0].resolve();assert.equal(await cancelled,false);assert.equal(f.pending[0].scope.active,false);assert.equal(f.app.outfitScope,undefined);assert.equal(f.store.worn,'original');
 const old=f.store.storage.setItem;f.store.storage.setItem=()=>{throw Error('quota');};const failed=f.app.equipOutfit('peach',()=>true);f.pending[1].resolve();assert.equal(await failed,false);assert.equal(f.pending[1].scope.active,false);assert.equal(f.values.bodyState.z,0);f.store.storage.setItem=old;f.owner.dispose();
});
test('A late cancelled outfit attempt cannot release a newer successful wear lease; original releases the winner',async()=>{
 const f=outfitApplication(),old=f.app.equipOutfit('peach',()=>false),next=f.app.equipOutfit('peach',()=>true);f.pending[1].resolve();assert.equal(await next,true);const winner=f.app.outfitScope;assert.equal(winner.active,true);assert.equal(f.values.bodyState.z,1);
 f.pending[0].resolve();assert.equal(await old,false);assert.equal(f.app.outfitScope,winner);assert.equal(winner.active,true);assert.equal(f.pending[0].scope.active,false);
 assert.equal(await f.app.equipOutfit('original',()=>true),true);assert.equal(winner.active,false);assert.equal(f.app.outfitScope,null);assert.equal(f.values.bodyState.z,0);assert.equal(f.store.worn,'original');f.owner.dispose();
});
