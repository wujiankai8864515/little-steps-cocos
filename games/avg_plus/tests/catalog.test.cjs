require('../tools/ts-loader.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {Runtime}=require('../assets/foundation/Runtime.ts');
const {parseCatalogConfig}=require('../assets/mods/base-shell/CatalogConfig.ts');
const {createCatalogMod,initialCatalogState,validateCatalogState,loadCatalogSave,saveCatalogState}=require('../assets/mods/base-shell/CatalogMod.ts');
const {GameSessionStore,PaidGameAction}=require('../assets/mods/base-card/GameSessionStore.ts');
const {createCardMod}=require('../assets/mods/base-card/CardMod.ts');
const {createAvgMod}=require('../assets/mods/base-avg/AvgMod.ts');
const {createStoryBranch}=require('../assets/mods/packages/story-branch/index.ts');
const config=()=>parseCatalogConfig(JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/art/resources/config/catalog.json'))));
const ids=['level_difficulty1_01','level_difficulty1_02','level_difficulty1_03'];
async function shell(options={}){const r=new Runtime([createCatalogMod(config(),ids,options.saved,null,()=>options.day??21000)]);await r.open();return r;}
const send=(r,type,payload)=>r.dispatch({type,...(payload===undefined?{}:{payload})});
const read=r=>r.read('base-shell');
test('reference economy, story catalog and collection unlocks reference existing original assets/pages',()=>{
 const c=config();assert.equal(c.economy.initialCoins,5700);assert.equal(c.economy.entryCost,500);
 const story=c.stories[0],root=path.join(__dirname,'../assets/art/dramas/霸总的假未婚妻');
 for(const p of [story.background,...story.roles,...story.collections.map(x=>x.asset)])assert.ok(fs.existsSync(path.join(root,p+'.png')));
 for(const x of story.collections)assert.ok(fs.existsSync(path.join(root,'chapters/第一章',String(x.unlockPage).padStart(2,'0')+'.json')));
 for(const mutate of [x=>x.economy.rollback.base=-1,x=>x.stories[0].background='../x',x=>x.stories.push(x.stories[0]),x=>x.quests[0].target=0]){const invalid=config();mutate(invalid);assert.throws(()=>parseCatalogConfig(invalid));}
});
test('daily login reward is claimable once; incomplete quests and duplicate inputs cannot grant coins',async()=>{
 const r=await shell();assert.equal(read(r).coins,5700);
 assert.equal((await send(r,'shell.claim',{id:'wins'})).status,'rejected');assert.equal(read(r).coins,5700);
 assert.equal((await send(r,'shell.claim',{id:'login'})).status,'committed');assert.equal(read(r).coins,5800);
 assert.equal((await send(r,'shell.claim',{id:'login'})).status,'rejected');assert.equal(read(r).coins,5800);await r.dispose();
});
test('daily reset occurs on a newer UTC day; clock rollback cannot reopen an already claimed day',async()=>{
 let day=21000;const r=new Runtime([createCatalogMod(config(),ids,null,null,()=>day)]);await r.open();
 await send(r,'shell.claim',{id:'login'});day++;
 await send(r,'shell.page',{page:'quests'});assert.deepEqual(read(r).daily.claimed,[]);
 await send(r,'shell.claim',{id:'login'});assert.equal(read(r).coins,5900);
 day--;assert.equal((await send(r,'shell.claim',{id:'login'})).status,'rejected');
 await send(r,'shell.page',{page:'quests'});assert.equal(read(r).returnPage,'catalog');await r.dispose();
});
test('card entry debits once, early load failure refunds once, stale rounds and duplicate wins are rejected or idempotent',async()=>{
 const r=await shell();await send(r,'shell.page',{page:'intro',levelId:ids[0]});
 await send(r,'shell.start');const first=read(r).round.id;assert.equal(read(r).coins,5200);
 assert.equal((await send(r,'shell.start')).status,'rejected');assert.equal(read(r).coins,5200);
 await send(r,'shell.abort',{roundId:first});assert.equal(read(r).coins,5700);
 assert.equal((await send(r,'shell.abort',{roundId:first})).status,'rejected');
 await send(r,'shell.start');const next=read(r).round.id;
 assert.equal((await send(r,'shell.card',{roundId:first,coins:999999,complete:true,played:true})).status,'rejected');
 await send(r,'shell.card',{roundId:next,coins:5300,complete:true,played:true});
 await send(r,'shell.card',{roundId:next,coins:5300,complete:true,played:true});
 assert.equal(read(r).daily.counts.wins,1);assert.deepEqual(read(r).completedLevels,[ids[0]]);
 assert.equal((await send(r,'shell.abort',{roundId:next})).status,'rejected');
 await send(r,'shell.page',{page:'intro'});assert.equal(read(r).selectedLevel,ids[1]);await r.dispose();
});
test('likes, favourites, rating and music preferences persist without changing wallet or actual chapter content',async()=>{
 const r=await shell();await send(r,'shell.like');await send(r,'shell.favourite');await send(r,'shell.rate',{rating:5});await send(r,'shell.setting',{key:'music'});
 const saved=read(r);const reopened=await shell({saved});
 assert.equal(read(reopened).stories['fake-fiancee'].favourite,true);assert.equal(read(reopened).stories['fake-fiancee'].rating,5);assert.equal(read(reopened).settings.music,false);assert.equal(read(reopened).coins,5700);await r.dispose();await reopened.dispose();
});
test('real AVG snapshot resumes the next page, keeps extension state, and reset retains earned collection progress',async()=>{
 const pages=[{chapter:'01',page:'01',choices:['A','B']},{chapter:'01',page:'02',choices:[]}];
 const modules=()=>[createAvgMod(pages),createStoryBranch({routes:{'01/01/0':'01/02'}},pages)];
 const avg=new Runtime(modules(),{pages});await avg.open();await send(avg,'avg.choose',{index:0});
 const snapshot=avg.exportSnapshot();const r=await shell();
 await send(r,'shell.avg',{storyId:'fake-fiancee',snapshot,pageIndex:1,pageCount:2,finished:false,choice:true});
 assert.equal(read(r).daily.counts.choices,1);assert.equal(read(r).stories['fake-fiancee'].highestPage,2);
 const resume=new Runtime(modules(),{pages});await resume.open();resume.restoreSnapshot(read(r).stories['fake-fiancee'].snapshot);assert.equal(resume.read('base-avg').pageIndex,1);assert.equal(resume.read('story-branch').choices,1);assert.equal(resume.read('base-avg').variables.lastChoice,0);
 await send(r,'shell.reset');assert.equal(read(r).stories['fake-fiancee'].snapshot,null);assert.equal(read(r).stories['fake-fiancee'].highestPage,2);
 for(const x of [avg,r,resume])await x.dispose();
});
test('corrupt primary save falls back to a valid previous generation and retains rejected bytes; corrupt both fails visibly',()=>{
 const values=new Map();const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const a=initialCatalogState(config(),21000);saveCatalogState(storage,a);const b=structuredClone(a);b.coins=5800;saveCatalogState(storage,b);
 values.set('avg-plus.catalog.v1','bad json');assert.equal(loadCatalogSave(storage).coins,5700);assert.equal(values.get('avg-plus.catalog.v1'),'bad json');
 values.set('avg-plus.catalog.v1.previous','broken');assert.throws(()=>loadCatalogSave(storage));
 const invalid=structuredClone(a);invalid.coins=-1;assert.throws(()=>validateCatalogState(invalid));
});
test('reference paid actions use JSON costs and preserve consumption history on undo',()=>{
 const s=new GameSessionStore(config().economy,5200);assert.equal(s.getActionCost(PaidGameAction.Rollback),50);assert.equal(s.getActionCost(PaidGameAction.Wild),500);assert.equal(s.getActionCost(PaidGameAction.AddBackup),500);
 const before=s.captureSnapshot();s.spend(PaidGameAction.Wild);assert.equal(s.coins,4700);assert.equal(s.getActionCost(PaidGameAction.Wild),600);
 s.restoreForRollback(before,-500);assert.equal(s.coins,5150);assert.equal(s.getActionCost(PaidGameAction.Wild),600);assert.equal(s.getActionCost(PaidGameAction.Rollback),50);
});
test('retry charges the current wallet instead of resetting it to the initial balance; insufficient retry preserves state',async()=>{
 const level=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/art/resources/config/card-levels',ids[0]+'.json')));
 const r=new Runtime([createCardMod(level,20260917,null,{economy:config().economy,initialCoins:5200,retryCost:500})]);await r.open();
 await send(r,'card.restart');assert.equal(r.read('base-card').session.coins,4700);
 for(let i=0;i<9;i++)await send(r,'card.restart');assert.equal(r.read('base-card').session.coins,200);
 const before=r.exportSnapshot();assert.equal((await send(r,'card.restart')).status,'rejected');assert.deepEqual(r.exportSnapshot(),before);await r.dispose();
});
