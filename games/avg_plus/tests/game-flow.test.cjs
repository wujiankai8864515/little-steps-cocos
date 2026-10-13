require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parseGameFlow}=require('../assets/mods/base-shell/GameFlow.ts');
test('the win handoff resolves a JSON card level to the existing AVG chapter',()=>{
 const read=file=>JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/art/resources/config',file),'utf8'));
 const flow=parseGameFlow(read('game-flow.json')),chapters=read('avg-chapters.json');
 for(const [levelId,chapterId] of Object.entries(flow.afterWin)){
  const level=read('card-levels/'+levelId+'.json');assert.equal(level.levelId,levelId);
  const chapter=chapters.chapters.find(item=>item.id===chapterId);assert.ok(chapter);
  assert.equal(chapter.bundle,'drama_fake_fiancee');assert.equal(chapter.path,'chapters/第一章');
 }
 assert.equal(flow.afterWin.level_difficulty1_01,'first-chapter');
});
test('game flow validates references and leaves future JSON levels independently configurable',()=>{
 assert.deepEqual(parseGameFlow({schemaVersion:1,afterWin:{}}).afterWin,{});
 assert.equal(parseGameFlow({schemaVersion:1,afterWin:{level_difficulty2_07:'second-chapter'}}).afterWin.level_difficulty2_07,'second-chapter');
 for(const value of [null,{schemaVersion:2,afterWin:{}},{schemaVersion:1,afterWin:[]},{schemaVersion:1,afterWin:{'../level':'chapter'}},{schemaVersion:1,afterWin:{level_difficulty1_01:null}}])assert.throws(()=>parseGameFlow(value));
});
