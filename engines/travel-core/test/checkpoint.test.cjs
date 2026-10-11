'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/travel-core.js'),'utf8'),context);const core=context.LittleStepsCore;
test('Checkpoint UTF8 size and SHA256 agree with independent Node encodings, including malformed surrogates',()=>{
 for(const value of ['', '小雨，旅行啦。🌧️', '\ud800', '\udc00', '\ud800a\udfff', 'a'.repeat(4096)]){
  assert.equal(core.checkpointUTF8Length(value),Buffer.byteLength(value,'utf8'));
  assert.equal(core.checkpointSHA256(value),crypto.createHash('sha256').update(value).digest('hex'));
 }
});
test('Canonical checkpoint preserves own dictionary keys and rejects mutation of the checksummed payload',()=>{
 const data=JSON.parse('{"tags":{"toString":2,"__proto__":1,"constructor":3},"title":"小雨🌧️"}'),codec=new core.CheckpointStore(null,4096),encoded=codec.envelope(data);
 assert.deepEqual(JSON.parse(JSON.stringify(codec.decode(encoded))),data);
 assert.ok(JSON.parse(encoded).payload.includes('"__proto__":1'));
 const damaged=JSON.parse(encoded);damaged.payload=damaged.payload.replace('小雨','大雨');assert.equal(codec.decode(JSON.stringify(damaged)),null);
 const exact=new core.CheckpointStore(null,Buffer.byteLength(encoded));assert.ok(exact.decode(encoded));const short=new core.CheckpointStore(null,Buffer.byteLength(encoded)-1);assert.equal(short.decode(encoded),null);
});
