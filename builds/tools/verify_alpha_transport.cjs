// Cross-check the shipped JS decoder against PNG-derived byte hashes, and the
// previous RLE query implementation against the new constant-time lookup.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),assets=path.join(root,'games/xiaoyu-cocos/assets'),context=vm.createContext({console});
vm.runInContext(fs.readFileSync(path.join(root,'engines/travel-core/dist/travel-core.js'),'utf8'),context);
const core=context.LittleStepsCore,report=JSON.parse(fs.readFileSync(path.join(root,'builds/records/M09-alpha-transport.json'))),checks=[],decoded=new Map();
for(const group of report.groups){
 const at=performance.now(),masks=core.decodeAlphaMasks(JSON.parse(fs.readFileSync(path.join(assets,'bundles',group.group,'alpha-masks.json'))),group.reservation.pixelBytes);
 checks.push({group:group.group,masks:masks.size,decodeMs:performance.now()-at});for(const [key,value]of masks)decoded.set(key,value);
}
for(const plane of report.planes)assert.equal(crypto.createHash('sha256').update(decoded.get(plane.resource).data).digest('hex'),plane.alphaSHA256,plane.resource);
const base=report.sourceBaseline;assert.match(base,/^[0-9a-f]{40}$/);
const previous=JSON.parse(cp.execFileSync('git',['show',base+':games/xiaoyu-cocos/assets/bundles/home/alpha-masks.json'],{cwd:root,maxBuffer:16*1024*1024,encoding:'utf8'}));
assert.ok(!previous.schema,'Benchmark baseline must be pre-change RLE revision');
function oldSample(mask,x,y){const px=Math.floor(x-mask.origin[0]),py=Math.floor(y-mask.origin[1]);if(px<0||py<0||px>=mask.size[0]||py>=mask.size[1])return 0;const row=mask.rows[py];let end=0;for(let i=0;i<row.length;i+=2){end+=row[i];if(px<end)return row[i+1]/255;}throw Error('Bad oracle row');}
function oldBounds(mask,r){let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;for(let y=Math.max(Math.floor(r[1]),mask.origin[1]);y<Math.min(Math.ceil(r[1]+r[3]),mask.origin[1]+mask.size[1]);y++){const row=mask.rows[y-mask.origin[1]];let x=mask.origin[0];for(let i=0;i<row.length;i+=2){const end=x+row[i],a=Math.max(x,r[0]),b=Math.min(end,r[0]+r[2]);if(row[i+1]>0&&b>a){left=Math.min(left,a);right=Math.max(right,b);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}x=end;}}return Number.isFinite(left)?[left,top,right-left,bottom-top]:[r[0],r[1],0,0];}
let samples=0,bounds=0,seed=891231;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const queries=[];
for(const [key,old]of Object.entries(previous)){
 const actual=decoded.get(key);assert.deepEqual(Array.from(actual.origin),old.origin);assert.deepEqual(Array.from(actual.size),old.size);
 for(let i=0;i<1500;i++){const x=old.origin[0]-4+next()*(old.size[0]+8),y=old.origin[1]-4+next()*(old.size[1]+8);assert.equal(core.alphaSample(actual,x,y),oldSample(old,x,y));samples++;queries.push([actual,old,x,y]);}
 for(let i=0;i<32;i++){const r=[old.origin[0]-4+next()*old.size[0],old.origin[1]-4+next()*old.size[1],next()*70,next()*70];assert.deepEqual(Array.from(core.alphaBounds(actual,r)),oldBounds(old,r));bounds++;}
}
// Run both methods in the same VM realm: host versus sandbox builtins have
// different overhead and would otherwise invalidate this comparison.
const oldInRealm=vm.runInContext('('+oldSample.toString()+')',context);
const times={};let checksum=0;
for(const [name,fn,index]of [['old',oldInRealm,1],['new',core.alphaSample,0]]){const start=performance.now();for(let round=0;round<10;round++)for(const q of queries)checksum+=fn(q[index],q[2],q[3]);times[name+'Ms']=performance.now()-start;}
const result={item:'M09.08',sourceBaseline:base,decodedPlanes:decoded.size,verifiedPixels:report.pixelCount,groups:checks,exactSampleComparisons:samples,exactBoundsComparisons:bounds,microbenchmark:{...times,queriesPerMethod:queries.length*10,checksum,boundary:'Node synthetic CPU only; not browser first-draw, FPS or device acceptance'},globalExports:Object.keys(context)};
fs.writeFileSync(path.join(root,'builds/reviews/M09-alpha-decoder-verification-v3.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
