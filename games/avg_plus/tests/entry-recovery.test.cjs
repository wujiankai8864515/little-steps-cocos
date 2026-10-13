require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Runtime}=require('../assets/foundation/Runtime.ts');
const {parseCatalogConfig}=require('../assets/mods/base-shell/CatalogConfig.ts');
const {createCatalogMod}=require('../assets/mods/base-shell/CatalogMod.ts');
const config=parseCatalogConfig(JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/art/resources/config/catalog.json'))));
const id='level_difficulty1_01';
test('a crash during unplayed entry refunds once on persisted reopening; played and completed rounds do not refund',async()=>{
 let saved=null;
 const create=()=>new Runtime([createCatalogMod(config,[id],saved,{save:s=>{saved=structuredClone(s);}})]);
 const first=create();await first.open();await first.dispatch({type:'shell.page',payload:{page:'intro',levelId:id}});await first.dispatch({type:'shell.start'});assert.equal(saved.coins,5200);await first.dispose();
 const recovery=create();await recovery.open();await recovery.dispatch({type:'shell.open'});assert.equal(saved.coins,5700);assert.equal(saved.round,null);await recovery.dispose();
 const again=create();await again.open();assert.equal(again.read('base-shell').coins,5700);
 await again.dispatch({type:'shell.page',payload:{page:'intro',levelId:id}});await again.dispatch({type:'shell.start'});const round=again.read('base-shell').round.id;
 await again.dispatch({type:'shell.card',payload:{roundId:round,coins:5200,played:true,complete:false}});await again.dispose();
 const played=create();await played.open();assert.equal(played.read('base-shell').coins,5200);await played.dispatch({type:'shell.open'});await played.dispatch({type:'shell.page',payload:{page:'intro',levelId:id}});await played.dispatch({type:'shell.start'});
 await played.dispatch({type:'shell.card',payload:{roundId:played.read('base-shell').round.id,coins:5700,played:true,complete:true}});await played.dispose();
 const won=create();await won.open();assert.equal(won.read('base-shell').coins,5700);assert.deepEqual(won.read('base-shell').completedLevels,[id]);await won.dispose();
});
