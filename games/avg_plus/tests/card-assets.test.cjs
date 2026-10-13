require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('module');
const originalLoad=Module._load;let catalog={},spriteError=null;let spriteLoads=0;
const source=()=>({isValid:true,texture:{width:960,height:432},rect:{x:0,y:0,width:960,height:432},refs:0,addRef(){this.refs++;return this},clone(){return {...this,rect:{...this.rect}}}});
class Rect{constructor(x,y,width,height){Object.assign(this,{x,y,width,height})}}
class Size{constructor(width,height){Object.assign(this,{width,height})}}
class Vec2{constructor(x,y){Object.assign(this,{x,y})}}
Module._load=function(id,...args){if(id==='cc')return {JsonAsset:class{},SpriteFrame:class{},Rect,Size,Vec2,resources:{load(path,type,callback){queueMicrotask(()=>path.includes('card-catalog')?callback(null,{json:catalog}):(spriteLoads++,callback(spriteError,source())))}}};return originalLoad.call(this,id,...args)};
const {CardSpriteLoader}=require('../assets/mods/base-card/CardSpriteLoader.ts');Module._load=originalLoad;
test('bad catalog and missing card texture reject and can recover on the next request',async()=>{
 await assert.rejects(CardSpriteLoader.loadSpriteFrame('demo'),/缺少 assets/);
 catalog={assets:{demo:{resourcePath:'demo/spriteFrame'}}};spriteError=new Error('missing texture');
 await assert.rejects(CardSpriteLoader.loadSpriteFrame('demo'),/missing texture/);
 spriteError=null;const frame=await CardSpriteLoader.loadSpriteFrame('demo');assert.equal(frame.isValid,true);assert.equal(spriteLoads,2);
 frame.isValid=false;assert.notEqual(await CardSpriteLoader.loadSpriteFrame('demo'),frame);assert.equal(spriteLoads,3);
});
test('video UV regions are independent from their source and invalid/oversized regions cannot poison retries',async()=>{
 CardSpriteLoader._catalogTask=null;CardSpriteLoader._spriteTasks.clear();
 catalog={assets:{back:{resourcePath:'video/spriteFrame',region:{x:435,y:322,width:61,height:89}},bad:{resourcePath:'video/spriteFrame',region:{x:950,y:400,width:61,height:89}}}};
 const back=await CardSpriteLoader.loadSpriteFrame('back');
 assert.deepEqual({...back.rect},{x:435,y:322,width:61,height:89});assert.deepEqual({...back.originalSize},{width:61,height:89});assert.equal(back.packable,false);
 await assert.rejects(CardSpriteLoader.loadSpriteFrame('bad'),/超出原图/);assert.equal(CardSpriteLoader._spriteTasks.has('bad'),false);
 CardSpriteLoader._catalogTask=null;catalog={assets:{bad:{resourcePath:'video/spriteFrame',region:{x:-1,y:322,width:61,height:89}}}};
 await assert.rejects(CardSpriteLoader.loadSpriteFrame('bad'),/裁切配置非法/);
 CardSpriteLoader._catalogTask=null;catalog={assets:{bad:{resourcePath:'video/spriteFrame',region:{x:0,y:0,width:61,height:89}}}};
 assert.equal((await CardSpriteLoader.loadSpriteFrame('bad')).isValid,true);
});
