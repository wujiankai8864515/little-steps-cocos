const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),assets=path.join(root,'games/xiaoyu-cocos/assets'),context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'engines/travel-core/dist/travel-core.js'),'utf8'),context);
const contains=context.LittleStepsCore.bitMapContains,catalog=JSON.parse(fs.readFileSync(path.join(assets,'resources/source-catalog.json'))).assets,report=JSON.parse(fs.readFileSync(path.join(root,'builds/records/M02-bitmap-transfer.json')));
test('Runtime interval hit queries reconstruct every defined bit of all 19 original masks',()=>{
 for(const record of report.bitmaps){
  const spec=catalog[record.resource],mask=JSON.parse(fs.readFileSync(path.join(assets,'bundles',spec.bundle,spec.path+'.json'))),[width,height]=mask.size,packed=Buffer.alloc(Math.ceil(width*height/8));
  let pixels=0;for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(contains(mask,x+.25,y+.25)){const offset=y*width+x;packed[offset>>3]|=1<<(offset%8);pixels++;}
  assert.equal(crypto.createHash('sha256').update(packed).digest('hex'),record.sourcePackedBits256,record.resource);assert.equal(pixels,record.coveredPixels);
  for(const point of [[-0.01,0],[0,-.01],[width,0],[0,height],[NaN,0],[0,Infinity]])assert.equal(contains(mask,...point),false);
 }
 assert.equal(report.bitmaps.length,19);
});
