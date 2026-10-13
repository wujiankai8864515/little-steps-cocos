require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('module');
const originalLoad=Module._load;let catalog={},spriteError=null;let spriteLoads=0;
Module._load=function(id,...args){if(id==='cc')return {JsonAsset:class{},SpriteFrame:class{},resources:{load(path,type,callback){queueMicrotask(()=>path.includes('card-catalog')?callback(null,{json:catalog}):(spriteLoads++,callback(spriteError,{isValid:true})))}}};return originalLoad.call(this,id,...args)};
const {CardSpriteLoader}=require('../assets/mods/base-card/CardSpriteLoader.ts');Module._load=originalLoad;
test('bad catalog and missing card texture reject and can recover on the next request',async()=>{
 await assert.rejects(CardSpriteLoader.loadSpriteFrame('demo'),/缺少 assets/);
 catalog={assets:{demo:{resourcePath:'demo/spriteFrame'}}};spriteError=new Error('missing texture');
 await assert.rejects(CardSpriteLoader.loadSpriteFrame('demo'),/missing texture/);
 spriteError=null;const frame=await CardSpriteLoader.loadSpriteFrame('demo');assert.equal(frame.isValid,true);assert.equal(spriteLoads,2);
 frame.isValid=false;assert.notEqual(await CardSpriteLoader.loadSpriteFrame('demo'),frame);assert.equal(spriteLoads,3);
});
