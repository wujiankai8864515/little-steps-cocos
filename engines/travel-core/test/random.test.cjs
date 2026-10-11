'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/travel-core.js'),'utf8'),context);const PCG=context.LittleStepsCore.PCG32,fixture=require('./fixtures/pcg-godot-4.5.2.json');
test('Two-word PCG matches2816 independently compiled native uint64 draws including rejection and full unsigned ranges',()=>{
 for(const row of fixture.vectors){const rng=new PCG(row.seed);assert.deepEqual(Array.from({length:128},()=>rng.next()),row.raw,'raw seed'+row.seed);rng.seed(row.seed);assert.deepEqual(Array.from({length:128},(_,i)=>rng.bounded(fixture.bounds[i%7])),row.mixedBounds,'bounded seed'+row.seed);}
});
test('Inclusive native ranges reverse endpoints, preserve a singleton state and reject invalid seeds/bounds',()=>{
 const a=new PCG(7),b=new PCG(7);assert.equal(a.range(3,3),3);assert.equal(a.next(),b.next());for(let i=0;i<64;i++)assert.equal(a.range(9,-4),b.range(-4,9));
 for(const seed of [-1,Infinity,NaN,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>new PCG(seed));
 for(const bound of [0,-1,1.2,Infinity,4294967297])assert.throws(()=>a.bounded(bound));assert.throws(()=>a.range(-2147483649,0));
});
