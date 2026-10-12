const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),python='/Users/wkk/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
test('Committed 11 mip PNGs decode to original native pixels and all image decode/upload memory is reserved',()=>{
 const record=JSON.parse(fs.readFileSync(path.join(root,'migration/records/M04-backpack-mipmap-source.json'))),catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/resources/source-catalog.json'))),bag=catalog.assets['res://travel/assets/home_worn_bag_pixels.png'];
 const actual=JSON.parse(cp.execFileSync(python,['-c','import json,hashlib,sys;from PIL import Image;d=json.load(sys.stdin);print(json.dumps([{ "size":list((im:=Image.open(p).convert("RGBA")).size),"sha256":hashlib.sha256(im.tobytes()).hexdigest()} for p in d]))'],{input:JSON.stringify(record.levels.map(p=>path.join(root,p.output))),encoding:'utf8'}));
 assert.equal(actual.length,11);assert.equal(bag.mipResources.length,10);assert.deepEqual(bag.content,[0,0,1254,1254]);assert.equal(bag.decodedBytes,1254*1254*4);
 actual.forEach((v,i)=>{assert.deepEqual(v.size,record.levels[i].size);assert.equal(v.sha256,record.levels[i].pixelRGBA256);if(i){const spec=catalog.assets[bag.mipResources[i-1]];assert.equal(spec.kind,'image');assert.equal(spec.bundle,'home');assert.ok(spec.decodedBytes>=v.size[0]*v.size[1]*8);}});
});
