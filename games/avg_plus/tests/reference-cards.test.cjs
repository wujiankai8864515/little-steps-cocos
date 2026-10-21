require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Runtime}=require('../assets/foundation/Runtime.ts');
const {createCardMod}=require('../assets/mods/base-card/CardMod.ts');
const {GameSessionStore}=require('../assets/mods/base-card/GameSessionStore.ts');
const root=path.resolve(__dirname,'..');
const level=()=>JSON.parse(fs.readFileSync(path.join(root,'../../migration/history/avg_plus/pre-figma-20261014/level_difficulty1_01.json')));
test('the archived video JSON remains playable after the current levels switch back to Figma',async()=>{
 const json=level();assert.equal(json.slots.length,19);assert.equal(json.initialStockCount,15);
 for(let fan=0;fan<4;fan++){
  const group=json.slots.slice(fan*4,fan*4+4);
  for(let i=0;i<3;i++){assert.deepEqual(group[i].coveredBy,[group[i+1].id]);assert.equal(group[i].initialFaceUp,false);}
  assert.equal(group[3].initialFaceUp,true);assert.equal(group[3].figmaCard.suit,'spade');assert.equal(group[3].figmaCard.rankValue,fan+1);
 }
 assert.deepEqual(json.slots[18].covers,['slot_017','slot_018']);assert.equal(json.slots[18].figmaCard.assetName,'poker_heart_red_13');
 const r=new Runtime([createCardMod(json,20260917)]);await r.open();const s=r.read('base-card');
 assert.equal(s.core.slots.filter(x=>x.faceUp&&x.isFullyExposed).length,5);assert.equal(s.core.stockRemainingCount,15);assert.equal(s.core.currentCard.cardName,'poker_diamond_red_07');
 const cards=[...s.core.slots.map(x=>x.card),s.core.currentCard];assert.equal(cards.length,20);assert.equal(new Set(cards.map(x=>x.cardName)).size,20);await r.dispose();
});
test('configured free stock ends on the fifteenth draw and checkpoint restore keeps that boundary',()=>{
 const session=new GameSessionStore(undefined,5700,15);
 for(let i=0;i<14;i++)session.recordStockDraw();assert.equal(session.getViewState().freeStockUsedUp,false);
 const previous=session.captureSnapshot();session.recordStockDraw();assert.equal(session.getViewState().freeStockUsedUp,true);
 session.restoreCheckpoint(previous);assert.equal(session.freeStockDraws,14);assert.equal(session.getViewState().freeStockUsedUp,false);
 session.recordStockDraw();session.recordStockDraw();assert.equal(session.freeStockDraws,15);
 assert.throws(()=>new GameSessionStore(undefined,5700,-1));assert.throws(()=>new GameSessionStore(undefined,5700,Number.MAX_SAFE_INTEGER+1));
 const large=new GameSessionStore(undefined,5700,100);for(let i=0;i<100;i++)large.recordStockDraw();assert.equal(large.freeStockDraws,100);assert.equal(large.getViewState().freeStockUsedUp,true);
});
test('card backs and wild cards use the existing project assets without video crops',()=>{
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/art/resources/assets/poker/card-catalog.json')));
 const crypto=require('node:crypto');
 for(const name of ['poker_back_01','poker_wild']){
  const item=catalog.assets[name];assert.equal(item.region,undefined);
  const folder=name==='poker_back_01'?'backs':'fronts';
  assert.equal(item.resourcePath,`assets/poker/${folder}/${name}/spriteFrame`);
  const data=fs.readFileSync(path.join(root,`assets/art/resources/assets/poker/${folder}/${name}.png`));
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'),item.sha256);
 }
});
