require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('module');
const load=Module._load;
Module._load=function(id,...args){if(id==='cc')return {JsonAsset:class{},resources:{}};return load.call(this,id,...args)};
const {CardLevelRepository}=require('../assets/mods/base-card/CardLevelRepository.ts');Module._load=load;
const {Runtime}=require('../assets/foundation/Runtime.ts');
const {createCardMod}=require('../assets/mods/base-card/CardMod.ts');
const {HighLowSolitaireCore}=require('../assets/mods/base-card/HighLowSolitaireCore.ts');
const base=path.join(__dirname,'../assets/art/resources/config/card-levels');
const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../../../migration/reviews/avg_plus/figma-level-source-20261014.json')));
const levels=source.levels.map(raw=>JSON.parse(fs.readFileSync(path.join(base,raw.name+'.json'))));
const repository=new CardLevelRepository();
test('all 40 Figma boards retain every real card component, local center, rotation and opening hand',()=>{
 assert.equal(levels.length,40);assert.equal(levels.reduce((n,l)=>n+l.slots.length,0),893);
 assert.deepEqual([1,2,3,4].map(d=>levels.filter(l=>l.difficulty===d).length),[10,10,10,10]);
 for(let index=0;index<levels.length;index++){
  const level=levels[index],raw=source.levels[index];repository.validateLevel(level.levelId,level);
  assert.equal(level.source.frameId,raw.id);assert.equal(level.slots.length,raw.board.cards.length);
  assert.equal(level.currentCard.sourceName,raw.hand[0].name);
  level.slots.forEach((slot,i)=>{
   const card=raw.board.cards[i];assert.equal(slot.sourceName,card[1]);assert.equal(level.source.cardNodeIds[i],card[0]);
   assert.ok(Math.abs(slot.x-(card[4]-raw.board.width/2))<0.000001);
   assert.ok(Math.abs(slot.y-(raw.board.height/2-card[5]))<0.000001);
   assert.ok(Math.abs(slot.rotation-card[6])<0.000001);assert.equal(slot.zIndex,i+1);
   for(const id of slot.coveredBy){const upper=level.slots.find(s=>s.id===id);assert.ok(upper.zIndex>slot.zIndex);assert.ok(upper.covers.includes(slot.id));}
  });
 }
});
test('all 40 actual levels start, restore, perform a legal move or draw, and undo without losing cards',async()=>{
 for(const level of levels){
  const runtime=new Runtime([createCardMod(level,20260917,undefined,{initialStockCount:level.initialStockCount})]);await runtime.open();
  const before=runtime.read('base-card').core;
  const core=new HighLowSolitaireCore(level);core.restoreSnapshot(before);
  assert.equal(before.slots.length,level.slots.length);assert.equal(before.stockPile.length,10);
  const physical=[before.currentCard,...before.slots.map(s=>s.card),...before.stockPile,...before.usedPile,...before.deck];
  assert.equal(physical.length,52*level.deckCount);assert.equal(new Set(physical.map(c=>c.cardName+'@'+(c.copyIndex??0))).size,physical.length);
  for(const slot of before.slots){const config=level.slots.find(s=>s.id===slot.slotId);if(config.initialFaceUp)assert.equal(slot.card.cardName,config.sourceName);}
  const legal=core.legalMoveSlotIds[0];
  assert.equal((await runtime.dispatch(legal?{type:'card.play',payload:{slotId:legal}}:{type:'card.draw'})).status,'committed',level.levelId);
  assert.equal((await runtime.dispatch({type:'card.rollback'})).status,'committed',level.levelId);
  assert.deepEqual(runtime.read('base-card').core,before,level.levelId);
  await runtime.dispose();
 }
});
test('duplicate fixed cards and the 52-slot board require distinct physical copies; corrupted copies reject',()=>{
 const repeated=levels.find(l=>l.levelId==='level_difficulty1_06'),large=levels.find(l=>l.levelId==='level_difficulty4_02');
 assert.equal(repeated.deckCount,2);assert.equal(large.slots.length,52);assert.equal(large.deckCount,2);
 for(const level of [repeated,large]){
  assert.throws(()=>repository.validateLevel(level.levelId,{...level,deckCount:1}));
  const core=new HighLowSolitaireCore(level);core.startGame(10);const snapshot=core.captureSnapshot();
  const bad=JSON.parse(JSON.stringify(snapshot));bad.currentCard.copyIndex=8;assert.throws(()=>core.restoreSnapshot(bad),/副本编号/);
  const duplicate=JSON.parse(JSON.stringify(snapshot));duplicate.deck[1]=duplicate.deck[0];assert.throws(()=>core.restoreSnapshot(duplicate),/重复牌/);
  core.restoreSnapshot(snapshot);assert.deepEqual(core.captureSnapshot(),snapshot);
 }
});
test('every actual Figma board completes across two seeds with pause, undo, snapshot recovery and conserved physical cards',async()=>{
 const economy=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/art/resources/config/catalog.json'))).economy;
 for(const level of levels)for(const seed of [1,20260917]){
  const runtime=new Runtime([createCardMod(level,seed,undefined,{economy,initialCoins:1000000,retryCost:500})]);await runtime.open();
  let turns=0;
  while(!runtime.read('base-card').core.isComplete){
   assert.ok(turns++<200,level.levelId+' did not progress');
   const before=runtime.read('base-card'),core=new HighLowSolitaireCore(level);core.restoreSnapshot(before.core);
   if(turns===4){const saved=runtime.exportSnapshot();runtime.restoreSnapshot(saved);assert.deepEqual(runtime.read('base-card'),before);}
   if(turns===7){
    await runtime.dispatch({type:'card.pause'});const paused=runtime.exportSnapshot();
    assert.equal((await runtime.dispatch({type:'card.draw'})).status,'rejected');assert.deepEqual(runtime.exportSnapshot(),paused);
    await runtime.dispatch({type:'card.pause'});assert.deepEqual(runtime.read('base-card').core,before.core);assert.equal(runtime.read('base-card').session.coins,before.session.coins);
   }
   const legal=core.legalMoveSlotIds;
   if(!legal.length&&core.stockRemainingCount){assert.equal((await runtime.dispatch({type:'card.draw'})).status,'committed');continue;}
   let slotId=legal[(turns+seed)%legal.length];
   if(!slotId){
    assert.equal((await runtime.dispatch({type:'card.wild'})).status,'committed');
    slotId=core.slots.find(slot=>slot.card&&slot.faceUp&&slot.isFullyExposed)?.slotId;
    assert.ok(slotId,level.levelId+' has a permanently covered board');
   }
   const prior=runtime.read('base-card');
   assert.equal((await runtime.dispatch({type:'card.play',payload:{slotId}})).status,'committed');
   if(turns%5===0&&!runtime.read('base-card').core.isComplete){
    assert.equal((await runtime.dispatch({type:'card.rollback'})).status,'committed');
    assert.deepEqual(runtime.read('base-card').core,prior.core);assert.equal(runtime.read('base-card').session.coins,prior.session.coins-50);
    assert.equal((await runtime.dispatch({type:'card.play',payload:{slotId}})).status,'committed');
   }
   const snapshot=runtime.read('base-card').core;
   const physical=[snapshot.currentCard,...snapshot.slots.map(s=>s.card),...snapshot.stockPile,...snapshot.usedPile,...snapshot.deck].filter(Boolean);
   assert.equal(physical.length,52*level.deckCount);assert.equal(new Set(physical.map(c=>c.cardName+'@'+(c.copyIndex??0))).size,physical.length);
  }
  const won=runtime.exportSnapshot();assert.equal(won.state['base-card'].session.completionRewarded,true);
  assert.equal((await runtime.dispatch({type:'card.play',payload:{slotId:'already-won'}})).status,'rejected');assert.deepEqual(runtime.exportSnapshot(),won);
  await runtime.dispose();
 }
});
