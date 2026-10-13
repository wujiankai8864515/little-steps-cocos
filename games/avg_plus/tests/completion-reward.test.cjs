require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Runtime}=require('../assets/foundation/Runtime.ts');
const {createCardMod}=require('../assets/mods/base-card/CardMod.ts');
const {GameSessionStore}=require('../assets/mods/base-card/GameSessionStore.ts');
const {parseCatalogConfig}=require('../assets/mods/base-shell/CatalogConfig.ts');
const {createCatalogMod,saveCatalogState,loadCatalogSave}=require('../assets/mods/base-shell/CatalogMod.ts');
const read=(p)=>JSON.parse(fs.readFileSync(path.join(__dirname,p)));
const config=()=>parseCatalogConfig(read('../assets/art/resources/config/catalog.json'));
const level=()=>read('../assets/art/resources/config/card-levels/level_difficulty1_01.json');
const route=()=>read('../../../migration/reviews/avg_plus/reference-cards-solution.json').route;

test('reference five-hit meter uses JSON target, resets on draw, and checkpoint restores all marks without coin rewards',()=>{
 const s=new GameSessionStore(config().economy,5200,15);
 for(let i=0;i<5;i++){s.recordHit('black');s.finishRewardCycle();}
 assert.equal(s.coins,5200);assert.equal(s.streakColors.length,5);assert.equal(s.getViewState().progressCells.length,5);
 const snapshot=s.captureSnapshot();s.recordStockDraw();assert.equal(s.streakColors.length,0);
 s.restoreCheckpoint(snapshot);s.recordHit('red');s.finishRewardCycle();assert.deepEqual(s.streakColors,['red']);
 s.restoreCheckpoint(snapshot);assert.equal(s.streakColors.length,5);assert.equal(s.coins,5200);
 const legacy=new GameSessionStore();for(let i=0;i<4;i++)legacy.recordHit('black');legacy.finishRewardCycle();assert.equal(legacy.coins,1199);assert.equal(legacy.streakColors.length,0);
});

test('completion marker makes the payout idempotent and survives snapshot restore',()=>{
 const s=new GameSessionStore(config().economy,4200,15);assert.equal(s.awardCompletion(),1000);assert.equal(s.awardCompletion(),0);assert.equal(s.coins,5200);
 const reopened=new GameSessionStore(config().economy,0,15);reopened.restoreCheckpoint(s.captureSnapshot());assert.equal(reopened.awardCompletion(),0);assert.equal(reopened.coins,5200);
 const legacy={...s.captureSnapshot()};delete legacy.completionRewarded;reopened.restoreCheckpoint(legacy);assert.equal(reopened.coins,5200);
});

test('winning JSON level commits 1000 once, persists after a presentation failure, and rejects repeated win input',async()=>{
 const c=config(),lv=level(),round=new Runtime([createCardMod(lv,20260917,{
  render:ctx=>ctx.result?.complete?[{id:'failed-win-presentation',run:()=>{throw new Error('interrupted medal');}}]:[],afterRender:()=>{},
 },{economy:c.economy,initialCoins:5200})]);await round.open();
 let last;
 for(const step of route())last=await round.dispatch({type:step.type==='draw'?'card.draw':'card.play',...(step.type==='play'?{payload:{slotId:step.id}}:{})});
 assert.equal(last.status,'committed');assert.equal(last.presentation,'failed');
 const won=round.read('base-card');assert.equal(won.core.isComplete,true);assert.equal(won.session.coins,6200);
 const snapshot=round.exportSnapshot();assert.equal((await round.dispatch({type:'card.play',payload:{slotId:route().at(-1).id}})).status,'rejected');assert.deepEqual(round.exportSnapshot(),snapshot);
 const shell=new Runtime([createCatalogMod(c,[lv.levelId])]);await shell.open();
 await shell.dispatch({type:'shell.page',payload:{page:'intro',levelId:lv.levelId}});await shell.dispatch({type:'shell.start'});const id=shell.read('base-shell').round.id;
 for(let i=0;i<2;i++)await shell.dispatch({type:'shell.card',payload:{roundId:id,complete:true,played:true,coins:won.session.coins}});
 assert.equal(shell.read('base-shell').coins,6200);assert.equal(shell.read('base-shell').daily.counts.wins,1);
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 saveCatalogState(storage,shell.read('base-shell'));const reopened=new Runtime([createCatalogMod(c,[lv.levelId],loadCatalogSave(storage))]);await reopened.open();
 assert.equal(reopened.read('base-shell').coins,6200);assert.deepEqual(reopened.read('base-shell').completedLevels,[lv.levelId]);
 for(const r of [round,shell,reopened])await r.dispose();
});

test('invalid configured rewards reject before a game can apply them',()=>{
 for(const key of ['completionReward','streakRewardCoins'])for(const value of [-1,0.5,NaN,1000000001]){
  const c=config();c.economy[key]=value;assert.throws(()=>parseCatalogConfig(c));
 }
});
