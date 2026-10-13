require('../tools/ts-loader.cjs');
const { test }=require('node:test');const assert=require('node:assert/strict');
const { Runtime }=require('../assets/foundation/Runtime.ts');
const { createCardMod }=require('../assets/mods/base-card/CardMod.ts');
const { createAvgMod }=require('../assets/mods/base-avg/AvgMod.ts');
const { createRewardVariant }=require('../assets/mods/packages/reward-variant/index.ts');
const { createStoryBranch }=require('../assets/mods/packages/story-branch/index.ts');
const { parseEffectConfig,effectsFor }=require('../assets/mods/shared/EffectConfig.ts');
function card(rank){return {side:'front',assetName:`poker_heart_red_${String(rank).padStart(2,'0')}`,suit:'heart',color:'red',rankCode:String(rank).padStart(2,'0'),rankValue:rank}}
function level(ranks=[2,3,4,5,6]){return {schemaVersion:1,levelId:'level_difficulty1_01',difficulty:1,designSize:{width:1000,height:1000},cardSize:{width:162,height:243},currentCard:{sourceName:'fixed',figmaCard:card(1)},slots:ranks.map((rank,index)=>({id:`slot_00${index+1}`,figmaCard:card(rank),x:index*100,y:0,width:162,height:243,rotation:0,zIndex:index,initialFaceUp:true,coveredBy:[],covers:[]}))}}
test('four hits, multiplier mod, rollback includes extension state and actual reward delta',async()=>{
 const r=new Runtime([createCardMod(level(),123),createRewardVariant({multiplier:2})]);await r.open();
 for(let i=1;i<=4;i++)assert.equal((await r.dispatch({type:'card.play',payload:{slotId:`slot_00${i}`}})).status,'committed');
 assert.equal(r.read('base-card').session.coins,1399);assert.equal(r.read('reward-variant').rewardedActions,1);
 assert.equal((await r.dispatch({type:'card.rollback'})).status,'committed');assert.equal(r.read('base-card').session.coins,899);assert.equal(r.read('reward-variant').rewardedActions,0);
 assert.equal(r.read('base-card').session.streakColors.length,3);
 await r.dispatch({type:'card.play',payload:{slotId:'slot_004'}});assert.equal(r.read('base-card').session.coins,1299);
 await r.dispatch({type:'card.rollback'});assert.equal(r.read('base-card').session.coins,699);assert.equal(r.read('base-card').session.actionUses.rollback,2);await r.dispose();
});
test('invalid play never changes snapshots; draw and undo preserve deck integrity',async()=>{
 const r=new Runtime([createCardMod(level([4,5,6,7,8]),123)]);await r.open();const initial=r.exportSnapshot();
 assert.equal((await r.dispatch({type:'card.play',payload:{slotId:'slot_005'}})).status,'rejected');assert.deepEqual(r.exportSnapshot(),initial);
 await r.dispatch({type:'card.draw'});await r.dispatch({type:'card.rollback'});assert.deepEqual(r.read('base-card').core,initial.state['base-card'].core);assert.equal(r.read('base-card').session.coins,899);await r.dispose();
});
test('drawing while a legal move exists preserves state and requests a missed-move hint',async()=>{
 const results=[];const r=new Runtime([createCardMod(level(),123,{render(ctx){results.push(ctx.result);return []},afterRender(){}})]);await r.open();const initial=r.exportSnapshot();
 assert.equal((await r.dispatch({type:'card.draw'})).status,'committed');assert.deepEqual(r.exportSnapshot(),initial);
 assert.deepEqual(results,[{kind:'missedMove',slotIds:['slot_001']}]);await r.dispose();
});
test('wild-card use is billed only on successful play and its use counter survives undo',async()=>{
 const r=new Runtime([createCardMod(level(),2)]);await r.open();await r.dispatch({type:'card.wild'});assert.equal(r.read('base-card').session.coins,999);
 await r.dispatch({type:'card.play',payload:{slotId:'slot_005'}});assert.equal(r.read('base-card').session.coins,899);
 await r.dispatch({type:'card.rollback'});assert.equal(r.read('base-card').session.actionUses.wild,1);assert.equal(r.read('base-card').session.coins,899);assert.equal(r.read('base-card').session.wildReady,true);await r.dispose();
});
test('base modules run without optional mods; seeded card sessions match',async()=>{
 const a=new Runtime([createCardMod(level(),12)]), b=new Runtime([createCardMod(level(),12)]);await a.open();await b.open();assert.deepEqual(a.read('base-card'),b.read('base-card'));await a.dispose();await b.dispose();
});
test('single-backup test mode keeps one stock card and both opening cards miss the board',async()=>{
 const setup={initialStockCount:1,forceUnmatchedOpeningCards:true};
 const r=new Runtime([createCardMod(level(),12,undefined,setup)]);await r.open();
 let core=r.read('base-card').core;
 const exposedRanks=core.slots.filter(slot=>slot.isFullyExposed&&slot.faceUp).map(slot=>slot.card.rankValue);
 const adjacent=(left,right)=>Math.abs(left-right)===1||Math.abs(left-right)===12;
 assert.equal(core.stockPile.length,1);
 assert.notEqual(core.stockPile[0].cardName,core.currentCard.cardName);
 assert.equal(exposedRanks.some(rank=>adjacent(rank,core.currentCard.rankValue)),false);
 assert.equal((await r.dispatch({type:'card.draw'})).status,'committed');
 core=r.read('base-card').core;
 assert.equal(core.stockPile.length,0);
 assert.equal(exposedRanks.some(rank=>adjacent(rank,core.currentCard.rankValue)),false);
 await r.dispose();
});
const pages=[{chapter:'01',page:'01',choices:['A','B']},{chapter:'01',page:'02',choices:[]},{chapter:'01',page:'03',choices:[]}];
test('AVG default choices advance sequentially; branch mod changes the destination',async()=>{
 const a=new Runtime([createAvgMod(pages)]);await a.open();assert.equal((await a.dispatch({type:'avg.next'})).status,'rejected');await a.dispatch({type:'avg.choose',payload:{index:1}});assert.equal(a.read('base-avg').pageIndex,1);await a.dispose();
 const b=new Runtime([createAvgMod(pages),createStoryBranch({routes:{'01/01/1':'01/03'}},pages)]);await b.open();await b.dispatch({type:'avg.choose',payload:{index:1}});assert.equal(b.read('base-avg').pageIndex,2);assert.equal(b.read('base-avg').variables.lastChoice,1);await b.dispatch({type:'avg.next'});assert.equal(b.read('base-avg').finished,true);await b.dispatch({type:'avg.restart'});assert.equal(b.read('story-branch').choices,0);await b.dispose();
});
test('invalid branch config, duplicate pages, invalid visual effects fail early',()=>{
 assert.throws(()=>createStoryBranch({routes:{'01/01/2':'01/02'}},pages));assert.throws(()=>createAvgMod([pages[0],pages[0]]));
 for(const fx of [{id:'bad',kind:'prefab',target:'root',asset:'../scene'},{id:'bad',kind:'pulse',target:'root',duration:Infinity},{id:'bad',kind:'pulse',target:'unknown'}])assert.throws(()=>parseEffectConfig({schemaVersion:1,events:{'card.play':[fx]}},'card'));
 assert.throws(()=>parseEffectConfig({schemaVersion:1,events:{'card.unknown':[]}},'card'));
 const cfg=parseEffectConfig({schemaVersion:1,events:{'card.play':[{id:'a',kind:'pulse',target:'current',when:'level1'},{id:'b',kind:'shake',target:'root',enabled:false}]}},'card');assert.equal(effectsFor(cfg,'card.play','level2').length,0);assert.equal(effectsFor(cfg,'card.play','level1').length,1);
});
test('all 28 migrated AVG pages parse into JSON-safe config and play through in order',async()=>{
 const fs=require('node:fs'),path=require('node:path');const {parsePage}=require('../assets/mods/base-avg/AvgContent.ts');
 const root=path.join(__dirname,'../assets/art/dramas/霸总的假未婚妻/chapters/第一章');
 const actual=fs.readdirSync(root).filter(name=>name.endsWith('.json')).map(name=>parsePage(JSON.parse(fs.readFileSync(path.join(root,name),'utf8')))).sort((a,b)=>Number(a.page)-Number(b.page));
 assert.equal(actual.length,28);
 const r=new Runtime([createAvgMod(actual)],{pages:actual});await r.open();
 for(let i=0;i<actual.length;i++){
   assert.equal(r.read('base-avg').pageIndex,i);
   const action=actual[i].choices.length?{type:'avg.choose',payload:{index:0}}:{type:'avg.next'};
   assert.equal((await r.dispatch(action)).status,'committed');
 }
 assert.equal(r.read('base-avg').finished,true);await r.dispose();
});
