const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const context=vm.createContext({console});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/travel-core.js'),'utf8'),context);
const core=context.LittleStepsCore;
const payload=(raw,size=[raw.length,1],origin=[0,0])=>({schema:2,encoding:'zlib-u8-base64',masks:{test:{size,origin,data:zlib.deflateSync(raw).toString('base64')}}});
test('Alpha decoding keeps every byte, origin, fractional hit and transparent exterior without browser APIs',()=>{
 const raw=Buffer.from([0,40,41,127,128,255]),mask=core.decodeAlphaMasks(payload(raw,[3,2],[7,11]),6).get('test');
 assert.deepEqual(Buffer.from(mask.data),raw);assert.equal(context.pako,undefined);
 for(let y=0;y<2;y++)for(let x=0;x<3;x++)assert.equal(core.alphaSample(mask,x+7.99,y+11.99),raw[y*3+x]/255);
 for(const p of [[6.99,11],[10,11],[7,10.99],[7,13],[NaN,11],[7,Infinity]])assert.equal(core.alphaSample(mask,...p),0);
 assert.deepEqual(Array.from(core.alphaBounds(mask,[7,11,3,2])),[7,11,3,2]);
 assert.deepEqual(Array.from(core.alphaBounds(mask,[7,11,1,1])),[7,11,0,0]);
 assert.deepEqual(Array.from(core.alphaBounds(mask,[8.25,11,1.25,.2])),[8.25,11,1.25,1]);
});
test('Alpha decoder fails closed on missing format, damaged streams, excess output and reservation violations',()=>{
 const raw=Buffer.from([0,1,40,41,128,255]),good=payload(raw),bad=()=>JSON.parse(JSON.stringify(good));
 for(const value of [null,{}, {...good,schema:1},{...good,masks:[]}])assert.throws(()=>core.decodeAlphaMasks(value));
 for(const n of [0,-1,Infinity,NaN,64*1024*1024+1])assert.throws(()=>core.decodeAlphaMasks(good,n));
 assert.throws(()=>core.decodeAlphaMasks(good,5),/limit/);
 for(const size of [[6,0],[1.5,4],[6],[3,3]]){const p=bad();p.masks.test.size=size;assert.throws(()=>core.decodeAlphaMasks(p));}
 const corrupted=bad(),bytes=Buffer.from(corrupted.masks.test.data,'base64');bytes[bytes.length-1]^=1;corrupted.masks.test.data=bytes.toString('base64');assert.throws(()=>core.decodeAlphaMasks(corrupted),/Corrupt/);
 const truncated=bad();truncated.masks.test.data=Buffer.from(good.masks.test.data,'base64').subarray(0,-3).toString('base64');assert.throws(()=>core.decodeAlphaMasks(truncated),/Corrupt/);
 const extra=payload(Buffer.alloc(1000000),[1,1]);assert.throws(()=>core.decodeAlphaMasks(extra),/exceeds/);
 const invalid=bad();invalid.masks.test.data='====';assert.throws(()=>core.decodeAlphaMasks(invalid));
});
