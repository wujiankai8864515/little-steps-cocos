'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const source = path.resolve(__dirname,'../assets/game');
function moduleFrom(name) {
    const code = ts.transpileModule(fs.readFileSync(path.join(source,name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    const m = {exports:{}}; const load = name => name.startsWith('./') ? moduleFrom(name.slice(2)) : require(name);
    vm.runInNewContext(code,{module:m,exports:m.exports,require:load,Date,Math,Set,Map,Float32Array,Uint16Array,console}); return m.exports;
}
const M = moduleFrom('GameModel');
const R = moduleFrom('InkRigMath');
const U = moduleFrom('ReferenceUnits');
const H = moduleFrom('ReferenceHeroes');
const W = moduleFrom('ReferenceWeapons');
const C = moduleFrom('ReferenceWeaponCombat');
const S = moduleFrom('ReferenceHeroSkills');
const P = moduleFrom('ReferenceProgression');
const X = moduleFrom('ReferenceSpecialWeapons');
const weapons = JSON.parse(fs.readFileSync(path.resolve(__dirname,'../assets/resources/data/weapon.json')));
const now = 1791993600000;
const round = (tutorial=false) => new M.Battle(M.newProfile(now),weapons,0,123456,tutorial);
const location = (area,index) => ({area,index});
function heroRound(name,cell=40,level=1){
    const b=new M.Battle(M.newProfile(now),weapons,1,7),hero=M.HEROES.find(h=>h.name===name),unit=b.unit('字',hero.chars[0],level);
    b.armies[0].units={[cell]:unit,[cell+1]:b.unit('字',hero.chars[1],level)};b.armies[0].unlocked=b.map.grass.filter(n=>b.owns(0,n));b.aiTime=b.spawnTime=10000;b.waveTime=-10000;
    b.heroes(0);unit.attacks=1;unit.weaponAt=0;unit.weaponRate=1;
    const add=(id,x,y,side=0)=>{const e={id,side,progress:0,hp:100,maxHp:100,speed:0,boss:false,slowed:0,x,y};b.enemies.push(e);return e;};
    const attack=target=>{const pos=b.position(cell);pos.x+=40;b.weaponAttack(unit,0,target,pos,b.stats(unit,hero,level,0),hero,cell);};
    return {b,hero,unit,add,attack};
}
function startSkill(fixture){
    const {b,hero,unit}=fixture;return b.startHeroSkill(unit,0,40,hero,unit.level,b.stats(unit,hero,unit.level,0));
}
const closeTo=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
function weaponHitShot(f,id,target,damage=10){return {id:990,from:f.unit.id,side:0,target:target.id,x:target.x,y:target.y,damage,speed:0,kind:'melee',splash:0,weaponId:id,hero:f.hero.name,heroId:f.b.heroes(0)[0].id};}
test('iron pike applies one immediate twofold ground hit and a half-second hold, only on its first contact',()=>{
    const f=heroRound('赵云'),target=f.add(901,100,340),other=f.add(902,180,340);f.b.random.next=()=>0;
    f.b.weaponHit(weaponHitShot(f,12,target),target);assert.equal(target.hp,80);assert.equal(other.hp,100);assert.equal(target.held,.5);assert.equal(f.b.shots.length,0);
    const effect=f.b.effects.find(e=>e.piercing);assert.equal(effect.piercing.weaponId,12);assert.equal(effect.piercing.spikes.length,1);
    f.b.weaponHit(weaponHitShot(f,12,target),target);assert.equal(target.hp,80);assert.equal(f.b.effects.filter(e=>e.piercing).length,1);
});
test('tiger pike chooses three distinct enemies, or five for Ma Chao, each at threefold damage',()=>{
    for(const [name,count]of [['赵云',3],['马超',5]]){
        const f=heroRound(name),targets=Array.from({length:6},(_,i)=>f.add(901+i,80+i*80,240));const rival=f.add(920,80,240,1);f.b.random.next=()=>0;
        f.b.weaponHit(weaponHitShot(f,17,targets[0]),targets[0]);assert.equal(targets.filter(e=>e.hp===70).length,count);assert.equal(rival.hp,100);assert.equal(f.b.shots.length,0);
        const effects=f.b.effects.filter(e=>e.piercing);assert.equal(new Set(effects.map(e=>e.piercing.target)).size,count);assert.ok(effects.every(e=>e.piercing.spikes.length===5&&e.piercing.weaponId===17));
    }
});
test('first-contact pike history retains a living target beyond 128 expired contacts',()=>{
    const f=heroRound('赵云'),old=f.add(901,100,340),next=f.add(902,180,340);f.unit.seen=[old.id,...Array.from({length:128},(_,i)=>1000+i)];f.b.random.next=()=>0;
    f.b.weaponHit(weaponHitShot(f,12,next),next);f.b.weaponHit(weaponHitShot(f,12,old),old);assert.equal(next.hp,80);assert.equal(old.hp,100);assert.ok(f.unit.seen.includes(old.id));
});
test('Long Dan proc occurs once per released thrust, with Zhao Yun five percent and other generals ten percent',()=>{
    for(const [name,roll,count]of [['赵云',.06,0],['赵云',.05,3],['张苞',.06,3]]){
        const f=heroRound(name);f.b.profile.equipped[name]=19;const target=f.add(901,400,240);f.add(902,480,240);f.add(903,560,240);f.b.random.next=()=>roll;f.attack(target);
        assert.equal(f.b.shots.length,0);const strike=f.b.weaponStrikes[0];f.b.time=strike.born;f.b.advanceWeaponStrikes(1/30);
        assert.equal(f.b.shots.filter(s=>s.flyingPike).length,count);f.b.advanceWeaponStrikes(1/1000);assert.equal(f.b.shots.filter(s=>s.flyingPike).length,count);
    }
});
test('flying pikes cover the entire living side, preserve enumeration fades and deal fivefold snapshotted power',()=>{
    const f=heroRound('张苞');f.b.profile.equipped['张苞']=19;const a=f.add(901,400,410);f.add(920,80,410,1);const c=f.add(902,600,410);const dead=f.add(903,520,410);dead.hp=0;f.b.random.next=()=>0;f.attack(a);
    f.b.time=f.b.weaponStrikes[0].born;f.b.advanceWeaponStrikes(1/30);const shots=f.b.shots.filter(s=>s.flyingPike);assert.equal(shots.length,2);assert.deepEqual(Array.from(shots,s=>s.target),[a.id,c.id]);
    closeTo(shots[0].flyingPike.appear,shots[0].flyingPike.born+.1);closeTo(shots[1].flyingPike.appear,shots[1].flyingPike.born+.3);
    assert.ok(shots.every(s=>s.damage===85&&s.width===20&&s.height===66&&s.flyingPike.launch===s.flyingPike.born+1));
});
test('delayed flying pikes stay still before launch, restore in flight, and never damage another enemy',()=>{
    const f=heroRound('赵云');f.b.profile.equipped['赵云']=19;const target=f.add(901,400,410),rival=f.add(902,80,410,1);target.hp=1000;f.b.random.next=()=>0;f.attack(target);
    f.b.time=f.b.weaponStrikes[0].born;f.b.advanceWeaponStrikes(1/30);const shot=f.b.shots.find(s=>s.flyingPike),x=shot.x,y=shot.y,born=shot.flyingPike.born;
    f.b.time=born+.5;f.b.advanceShots(.5);assert.equal(shot.x,x);assert.equal(shot.y,y);assert.equal(target.hp,1000);
    f.b.time=born+1.05;f.b.advanceShots(.05);assert.ok(shot.x>x);const saved=f.b.snapshot(),restored=M.Battle.restore(saved,f.b.profile,weapons);assert.ok(restored);assert.equal(restored.snapshot(),saved);
    f.b.paused=true;f.b.advance(1);assert.equal(f.b.snapshot(),saved.replace('"paused":false','"paused":true'));f.b.paused=false;
    for(let i=1;i<=6;i++){f.b.time=restored.time=born+1.05+i*.05;f.b.advanceShots(.05);restored.advanceShots(.05);assert.equal(f.b.snapshot(),restored.snapshot());}
    assert.equal(target.hp,940);assert.equal(rival.hp,100);assert.equal(f.b.shots.length,0);
});
test('ground pike lift and flying-pike fades retain the native phase landmarks',()=>{
    const pose=X.groundPikePose(.075);closeTo(pose.growth,.875);closeTo(pose.lift,52.5);closeTo(X.groundPikePose(.625).lift,52.5);closeTo(X.groundPikePose(.8).scaleY,.6);closeTo(X.groundPikePose(.9).scaleX,1.25);assert.equal(X.groundPikePose(1).alpha,0);
    const timing=X.flyingPikeTiming(2,3);assert.equal(timing.appear,2.3);assert.equal(timing.launch,3);closeTo(X.flyingPikePose(2.4,timing).alpha,.5);closeTo(X.flyingPikePose(3.1,timing).ringAlpha,.5);assert.equal(X.flyingPikePose(3.5,timing).ringFrame,X.flyingPikePose(3,timing).ringFrame);
});
test('a ground proc reads the current general power after promotion without borrowing a reformed identity',()=>{
    const f=heroRound('马超');f.b.profile.equipped['马超']=12;const target=f.add(901,100,340),other=f.add(902,180,340);target.hp=other.hp=1000;const shot=weaponHitShot(f,12,target,13);f.b.random.next=()=>0;
    f.b.addHeroExperience(f.b.heroProgress[0],10);f.b.weaponHit(shot,target);closeTo(target.hp,961);
    f.b.move(location('board',41),location('reserve',0));f.b.move(location('reserve',0),location('board',41));f.b.addHeroExperience(f.b.heroProgress[0],25);
    f.b.weaponHit({...shot,target:other.id},other);closeTo(other.hp,974);
});
test('a kill during a multi-target ground proc promotes the general before the next target is hit',()=>{
    const f=heroRound('马超');f.b.profile.equipped['马超']=17;const first=f.add(901,100,340),second=f.add(902,180,340),third=f.add(903,260,340);first.hp=1;second.hp=third.hp=1000;f.b.addHeroExperience(f.b.heroProgress[0],9);f.b.random.next=()=>0;
    f.b.weaponHit(weaponHitShot(f,17,first,16),first);assert.equal(f.b.heroes(0)[0].level,2);closeTo(second.hp,928);closeTo(third.hp,928);
});
test('malformed new pike payloads are discarded while legacy projectiles and the round survive',()=>{
    const f=heroRound('赵云'),target=f.add(901,400,410),raw=JSON.parse(f.b.snapshot());
    raw.shots=[{...weaponHitShot(f,19,target),kind:'flyingPike',speed:1200,flyingPike:{born:0,appear:-1,launch:1}}, {...weaponHitShot(f,19,target),id:991,kind:'flyingPike',speed:550}];
    raw.effects=[{id:992,side:0,kind:'groundPike',x:100,y:340,ttl:1,duration:1,piercing:{target:901,weaponId:12,spikes:[{x:null,y:70,angle:0}]}}];
    const restored=M.Battle.restore(JSON.stringify(raw),f.b.profile,weapons);assert.ok(restored);assert.equal(restored.shots.length,1);assert.equal(restored.shots[0].id,991);assert.equal(restored.effects.length,0);
});
test('a speed spell on either half affects the general once and records both inherited parts',()=>{
    const {b,hero,unit}=heroRound('赵云');b.profile.items=['speed'];
    assert.equal(b.active('speed',41),'');closeTo(b.stats(unit,hero).interval,.8/1.4);
    assert.equal(b.boosts[unit.id],.4);assert.equal(b.boosts[b.armies[0].units[41].id],.4);
    b.cooldowns.speed=0;assert.equal(b.active('speed',40),'');closeTo(b.stats(b.armies[0].units[41],hero).interval,.8/1.8);
    const saved=b.snapshot(),restored=M.Battle.restore(saved,b.profile,weapons);assert.ok(restored);assert.equal(restored.snapshot(),saved);closeTo(restored.stats(restored.armies[0].units[41],hero).interval,.8/1.8);
});
test('feeding stores permanent bonuses on the destination part without retroactively buffing the current general',()=>{
    const {b,hero,unit}=heroRound('赵云');b.profile.items=['speed'];b.active('speed',41);
    const incoming=b.unit('字','云');b.armies[0].reserve[0]=incoming;b.boosts[incoming.id]=1.2;b.ranges[incoming.id]=2;
    const identity=b.heroes(0)[0].id;assert.equal(b.move(location('reserve',0),location('board',40)),'');
    assert.equal(b.heroes(0)[0].id,identity);closeTo(b.stats(unit,hero,2).interval,.8/1.3/1.4);assert.equal(b.stats(unit,hero,2).range,200);
    closeTo(b.boosts[unit.id],1.6);assert.equal(b.ranges[unit.id],2);assert.equal(b.boosts[incoming.id],undefined);assert.equal(b.ranges[incoming.id],undefined);
    assert.equal(b.move(location('board',41),location('reserve',0)),'');assert.equal(b.move(location('reserve',0),location('board',41)),'');
    assert.notEqual(b.heroes(0)[0].id,identity);closeTo(b.stats(unit,hero,2).interval,.8/1.3/3);assert.equal(b.stats(unit,hero,2).range,400);
});
test('a range spell targets one ranged general, refuses a duplicate, and retains part inheritance on reformation',()=>{
    const {b,hero,unit}=heroRound('黄忠');b.profile.items=['range'];const other=b.unit('弓');b.armies[0].units[42]=other;
    assert.equal(b.active('range',41),'');assert.equal(b.stats(unit,hero).range,720);assert.equal(b.stats(other).range,280);
    b.cooldowns.range=0;assert.notEqual(b.active('range',40),'');assert.equal(b.cooldowns.range,0);
    const saved=b.snapshot(),restored=M.Battle.restore(saved,b.profile,weapons);assert.equal(restored.snapshot(),saved);assert.equal(restored.stats(restored.armies[0].units[41],hero).range,720);
    b.move(location('board',41),location('reserve',0));b.move(location('reserve',0),location('board',41));assert.equal(b.stats(unit,hero).range,1080);
});
test('targeted permanent spells reject farmers, loose characters, melee range targets and existing weapon range buffs',()=>{
    const b=round();b.profile.items=['speed','range'];b.armies[0].units[58]=b.unit('农');b.armies[0].reserve[0]=b.unit('字','赵');
    assert.notEqual(b.active('speed',58),'');assert.notEqual(b.active('speed',-1,location('reserve',0)),'');assert.equal(b.cooldowns.speed,undefined);
    const melee=heroRound('赵云');melee.b.profile.items=['range'];assert.notEqual(melee.b.active('range',41),'');assert.equal(melee.b.cooldowns.range,undefined);
    const bow=heroRound('黄忠');bow.b.profile.items=['range'];bow.b.profile.equipped['黄忠']=1;assert.notEqual(bow.b.active('range',41),'');assert.equal(bow.b.cooldowns.range,undefined);
});
test('basic merges inherit additive speed, retain one range grant and remove consumed bonus records',()=>{
    const b=round(),source=b.unit('弓'),target=b.unit('弓');b.armies[0].units[58]=source;b.armies[0].units[59]=target;
    b.boosts[source.id]=.8;b.boosts[target.id]=.4;b.ranges[source.id]=b.ranges[target.id]=2;
    assert.equal(b.move(location('board',58),location('board',59)),'');assert.equal(target.level,2);
    closeTo(b.stats(target).interval,.8/1.5/2.2);assert.equal(b.stats(target).range,560);assert.equal(b.boosts[source.id],undefined);assert.equal(b.ranges[source.id],undefined);
});
test('legacy general bonus migration preserves applied speed, range, identity and in-flight counters',()=>{
    const {b,hero,unit}=heroRound('黄忠');b.profile.equipped['黄忠']=1;b.boosts[unit.id]=.4;b.boosts[b.armies[0].units[41].id]=.8;b.ranges[unit.id]=2;unit.skillCount=17;
    const raw=JSON.parse(b.snapshot()),id=raw.heroProgress[0].id;delete raw.heroProgress[0].speedBonus;delete raw.heroProgress[0].rangeBonus;
    const restored=M.Battle.restore(JSON.stringify(raw),b.profile,weapons);assert.ok(restored);assert.equal(restored.heroes(0)[0].id,id);assert.equal(restored.armies[0].units[40].skillCount,17);
    closeTo(restored.stats(restored.armies[0].units[40],hero).interval,.8/1.4);closeTo(restored.stats(restored.armies[0].units[41],hero).range,800);
    raw.heroProgress[0].speedBonus=null;raw.heroProgress[0].rangeBonus=-1;const repaired=M.Battle.restore(JSON.stringify(raw),b.profile,weapons);assert.equal(repaired.heroes(0)[0].id,id);closeTo(repaired.stats(repaired.armies[0].units[40],hero).interval,.8/1.4);
});
test('a later range spell appends to fed part records and cannot be used during the ranged cast',()=>{
    const {b,hero,unit,add}=heroRound('黄忠');b.profile.items=['range'];const incoming=b.unit('字','忠');b.armies[0].reserve[0]=incoming;b.ranges[incoming.id]=2;
    b.move(location('reserve',0),location('board',41));assert.equal(b.stats(unit,hero).range,360);
    add(901,100,340);assert.equal(b.startHeroSkill(unit,0,40,hero,2,b.stats(unit,hero,2)),true);assert.notEqual(b.active('range',40),'');assert.equal(b.cooldowns.range,undefined);b.heroSkills=[];
    assert.equal(b.active('range',40),'');assert.equal(b.ranges[b.armies[0].units[41].id],3);
    b.move(location('board',41),location('reserve',0));b.move(location('reserve',0),location('board',41));assert.equal(b.stats(unit,hero).range,1440);
});
test('permanent speed changes retain elapsed cooldown work, and temporary formation buffs do not survive splitting',()=>{
    const {b,hero,unit}=heroRound('赵云');b.profile.items=['speed'];unit.cooldown=.6;
    b.active('speed',41);closeTo(unit.cooldown,.6+.8/1.4-.8);
    unit.speedBuff=.5;unit.speedUntil=100;b.move(location('board',41),location('reserve',0));assert.equal(unit.speedBuff,undefined);assert.equal(unit.speedUntil,undefined);
    b.move(location('reserve',0),location('board',41));closeTo(b.stats(unit,hero).interval,.8/1.8);
    const ordinary=round(),a=ordinary.unit('弓'),c=ordinary.unit('弓');ordinary.armies[0].units[58]=a;ordinary.armies[0].units[59]=c;c.cooldown=.6;ordinary.boosts[a.id]=.4;
    ordinary.move(location('board',58),location('board',59));closeTo(c.cooldown,Math.max(0,.6+.8/1.5/1.4-.8));
});
test('native formations inherit maximum part experience, with separate major/minor thresholds',()=>{
    const b=heroRound('赵云').b;b.armies[0].units={40:b.unit('字','赵',2),41:b.unit('字','云',4)};
    let link=b.heroes(0)[0];assert.equal(link.level,4);assert.equal(link.experience,75);assert.equal(link.maxLevel,5);assert.equal(b.armies[0].units[40].level,4);
    b.armies[0].units={40:b.unit('字','关'),41:b.unit('字','平')};link=b.heroes(0)[0];const progress=b.heroProgress[0];
    b.addHeroExperience(progress,8);assert.equal(b.heroes(0)[0].level,2);assert.equal(progress.experience,8);assert.equal(b.armies[0].units[40].experience,10);
    b.addHeroExperience(progress,.1);assert.equal(b.armies[0].units[41].experience,8.1);
    b.addHeroExperience(progress,14.9);assert.equal(progress.level,3);assert.equal(progress.experience,23);assert.equal(b.armies[0].units[40].experience,35);
    b.addHeroExperience(progress,100);b.addHeroExperience(progress,-23);assert.equal(progress.level,3);assert.equal(progress.experience,23);assert.equal(b.armies[0].units[40].experience,35);
    assert.equal(P.characterLevelCap('关'),5);assert.equal(P.characterLevelCap('平'),3);assert.equal(P.partExperience(5),130);
});
test('one named general per side retains the existing formation when an earlier duplicate appears',()=>{
    const f=heroRound('赵云',42),original=f.b.heroes(0)[0];
    f.b.armies[0].units[40]=f.b.unit('字','赵',5);f.b.armies[0].units[41]=f.b.unit('字','云',5);
    const links=f.b.heroes(0);assert.equal(links.length,1);assert.equal(links[0].id,original.id);assert.equal(links[0].left,42);assert.equal(links[0].level,1);
    assert.equal(f.b.move(location('board',43),location('reserve',0)),'');assert.equal(f.b.heroes(0)[0].left,40);assert.equal(f.b.heroes(0)[0].level,5);
});
test('standalone equal characters swap; a matching character feeds either half regardless of source level',()=>{
    const f=heroRound('赵云'),b=f.b,identity=b.heroes(0)[0].id;
    b.armies[0].reserve[0]=b.unit('字','赵',5);assert.equal(b.move(location('reserve',0),location('board',41)),'');assert.equal(b.armies[0].reserve[0],null);
    let hero=b.heroes(0)[0];assert.equal(hero.id,identity);assert.equal(hero.level,2);assert.equal(hero.experience,10);assert.equal(b.armies[0].units[40].char,'赵');assert.equal(b.armies[0].units[41].char,'云');
    b.armies[0].reserve[0]=b.unit('字','云');b.move(location('reserve',0),location('board',40));hero=b.heroes(0)[0];assert.equal(hero.level,3);assert.equal(hero.experience,35);assert.equal(b.armies[0].units[41].level,3);
    const a=b.unit('字','祖'),c=b.unit('字','祖');b.armies[0].reserve[0]=a;b.armies[0].reserve[1]=c;b.move(location('reserve',0),location('reserve',1));assert.equal(b.armies[0].reserve[0].id,c.id);assert.equal(b.armies[0].reserve[1].id,a.id);assert.equal(a.level,1);assert.equal(c.level,1);
});
test('feeding preserves the target cast and counters, splits the source general, and never eats a max-level target',()=>{
    const f=heroRound('关平'),b=f.b;f.add(901,100,340);startSkill(f);f.unit.skillCount=7;const cast=b.heroSkills[0].id,target=b.heroes(0)[0].id;
    b.armies[0].units[42]=b.unit('字','关');b.armies[0].units[43]=b.unit('字','羽');const source=b.heroes(0).find(h=>h.hero.name==='关羽').id;
    assert.equal(b.move(location('board',42),location('board',41)),'');assert.equal(b.heroProgress.some(p=>p.id===source),false);assert.equal(b.heroes(0)[0].id,target);assert.equal(b.heroSkills[0].id,cast);assert.equal(f.unit.skillCount,7);assert.equal(b.armies[0].units[43].char,'羽');
    b.armies[0].reserve[0]=b.unit('字','平');b.move(location('reserve',0),location('board',40));assert.equal(b.heroes(0)[0].level,3);
    const spare=b.unit('字','平'),old=b.armies[0].units[40];b.armies[0].reserve[0]=spare;b.move(location('reserve',0),location('board',40));assert.equal(b.armies[0].reserve[0].id,old.id);assert.equal(b.armies[0].units[40].id,spare.id);assert.equal(b.heroSkills.length,0);
});
test('hero kills award one experience and divide .5 among other contributors, with one settlement',()=>{
    const f=heroRound('赵云'),b=f.b;for(const [cell,name]of [[42,'关羽'],[44,'黄忠']]){b.armies[0].units[cell]=b.unit('字',name[0]);b.armies[0].units[cell+1]=b.unit('字',name[1]);}
    const heroes=b.heroes(0),enemy=f.add(901,100,340),owner=h=>({side:0,hero:true,heroId:h.id});enemy.hp=3;
    b.damageEnemy(enemy,.5,owner(heroes[0]));b.damageEnemy(enemy,.5,owner(heroes[1]));b.damageEnemy(enemy,2,owner(heroes[2]));
    assert.equal(b.heroProgress.find(p=>p.id===heroes[0].id).experience,.25);assert.equal(b.heroProgress.find(p=>p.id===heroes[1].id).experience,.25);assert.equal(b.heroProgress.find(p=>p.id===heroes[2].id).experience,1);
    b.damageEnemy(enemy,999,owner(heroes[0]));assert.equal(b.heroProgress.find(p=>p.id===heroes[0].id).experience,.25);assert.equal(enemy.experienceSettled,true);
    const boss=f.add(902,100,340);boss.boss=true;boss.hp=1;b.damageEnemy(boss,1,owner(heroes[0]));assert.equal(b.heroProgress.find(p=>p.id===heroes[0].id).experience,1.25);
});
test('basic kills share .2; destroyed generals remain in the assist divisor; ownerless deaths grant no experience',()=>{
    const f=heroRound('赵云'),b=f.b,id=b.heroes(0)[0].id,enemy=f.add(901,100,340);enemy.hp=2;
    b.damageEnemy(enemy,.1,{side:0,hero:true,heroId:id});b.damageEnemy(enemy,.1,{side:0,hero:true,heroId:9999});b.damageEnemy(enemy,2,{side:0,hero:false});assert.equal(b.heroProgress[0].experience,.1);
    const noSource=f.add(902,100,340);noSource.hp=1;b.damageEnemy(noSource,.1,{side:0,hero:true,heroId:id});b.damageEnemy(noSource,1);assert.equal(b.heroProgress[0].experience,.1);
    const awards=P.experienceAwards({side:0,hero:true,heroId:id},[id,id,8,9]);assert.equal(awards.length,3);assert.equal(awards[0].experience,1);assert.equal(awards[1].experience,.25);
});
test('released projectiles retain a destroyed formation identity after splitting, reforming and restoring',()=>{
    const f=heroRound('黄祖'),b=f.b,enemy=f.add(901,200,340),old=b.heroes(0)[0].id;enemy.hp=1;
    const shot=b.fire(f.unit,0,enemy,{x:80,y:440},10,'arrow',0,undefined,'黄祖');assert.equal(shot.heroId,old);
    b.move(location('board',41),location('reserve',0));b.move(location('reserve',0),location('board',41));const current=b.heroes(0)[0].id;assert.notEqual(current,old);
    const restored=M.Battle.restore(b.snapshot(),b.profile,weapons);assert.ok(restored);assert.equal(restored.shots[0].heroId,old);restored.hitShot(restored.shots[0],restored.enemies[0]);assert.equal(restored.heroProgress[0].experience,0);
});
test('promotion uses the general experience table, respects character caps, and training uses native odds',()=>{
    const f=heroRound('关平'),b=f.b;b.profile.items=['god','training'];assert.equal(b.active('god',41),'');assert.equal(b.heroes(0)[0].experience,8);assert.equal(b.heroes(0)[0].level,2);b.cooldowns.god=0;
    assert.equal(b.active('god',40),'');assert.equal(b.heroes(0)[0].experience,23);assert.equal(b.heroes(0)[0].level,3);b.cooldowns.god=0;
    assert.notEqual(b.active('god',41),'');assert.equal(b.cooldowns.god,0);assert.notEqual(b.active('training',40),'');assert.equal(b.cooldowns.training,undefined);
    b.armies[0].reserve[0]=b.unit('字','平',3);assert.notEqual(b.active('god',-1,location('reserve',0)),'');b.armies[0].reserve[0]=b.unit('字','关',3);assert.equal(b.active('god',-1,location('reserve',0)),'');assert.equal(b.armies[0].reserve[0].level,4);
    assert.equal(P.trainingDelta(1,.99),1);assert.equal(P.trainingDelta(2,.99),1);assert.equal(P.trainingDelta(3,.7),1);assert.equal(P.trainingDelta(3,.7001),-1);assert.equal(P.trainingDelta(4,.6),1);assert.equal(P.trainingDelta(4,.6001),-1);
});
test('growth preserves cooldown work, serializes fractional assists and restores legacy levels/casts without resetting',()=>{
    const f=heroRound('赵云'),b=f.b,p=b.heroProgress[0];f.unit.cooldown=.6;const before=b.stats(f.unit,f.hero,1).interval;b.addHeroExperience(p,10);assert.ok(Math.abs(f.unit.cooldown-(.6+.8/1.3-before))<1e-12);
    b.addHeroExperience(p,.25);const saved=b.snapshot(),restored=M.Battle.restore(saved,b.profile,weapons);assert.equal(restored.snapshot(),saved);assert.equal(restored.heroProgress[0].experience,10.25);
    const legacy=JSON.parse(saved);delete legacy.heroProgress;for(const unit of Object.values(legacy.armies[0].units))delete unit.experience;legacy.armies[0].units[40].level=4;legacy.armies[0].units[41].level=2;legacy.armies[0].units[40].attacks=29;legacy.armies[0].units[40].skillCount=28;
    const old=M.Battle.restore(JSON.stringify(legacy),b.profile,weapons);assert.ok(old);assert.equal(old.heroes(0)[0].level,2);assert.equal(old.armies[0].units[40].level,4);assert.equal(old.armies[0].units[40].attacks,29);assert.equal(old.armies[0].units[40].skillCount,28);
    const corrupt=JSON.parse(saved);corrupt.heroProgress[0].experience=-1;corrupt.armies[0].units[40].experience='bad';const repaired=M.Battle.restore(JSON.stringify(corrupt),b.profile,weapons);assert.ok(repaired);assert.equal(repaired.heroes(0)[0].level,2);assert.ok(Number.isFinite(repaired.armies[0].units[40].experience));
});
test('Ma Chao passive lethal damage awards experience once; basic melee distributes existing assists',()=>{
    const f=heroRound('马超'),b=f.b,enemy=f.add(901,100,340);enemy.hp=2;b.random.next=()=>0;
    const shot={id:999,from:f.unit.id,side:0,target:enemy.id,x:0,y:0,damage:1,speed:0,kind:'melee',splash:0,hero:'马超',heroId:b.heroes(0)[0].id};
    b.hitShot(shot,enemy);assert.equal(b.heroProgress[0].experience,1);b.hitShot(shot,enemy);assert.equal(b.heroProgress[0].experience,1);
    const basic=b.unit('刀'),other=f.add(902,100,340);b.armies[0].units[42]=basic;other.hp=3;b.damageEnemy(other,1,{side:0,hero:true,heroId:shot.heroId});
    b.releaseBasicAttack({unit:basic.id,side:0,cell:42,kind:'刀',target:other.id,damage:3,range:200,x:100,y:340,targetX:100,targetY:340});assert.equal(b.heroProgress[0].experience,1.2);
});
test('legacy in-flight skills acquire the preserved general identity and malformed growth IDs cannot overflow it',()=>{
    const f=heroRound('赵云'),b=f.b;f.add(901,100,340);startSkill(f);f.unit.skillCount=17;
    const raw=JSON.parse(b.snapshot()),phase=raw.heroSkills[0].phase;delete raw.heroProgress;for(const skill of raw.heroSkills)delete skill.heroId;
    const restored=M.Battle.restore(JSON.stringify(raw),b.profile,weapons);assert.ok(restored);assert.equal(restored.heroSkills[0].phase,phase);assert.equal(restored.heroSkills[0].heroId,restored.heroes(0)[0].id);assert.equal(restored.armies[0].units[40].skillCount,17);
    restored.time=.8;restored.advanceHeroSkills(1/30);assert.equal(restored.heroSkills[0].phase,1);
    const broken=JSON.parse(b.snapshot());broken.heroProgress[0].id=Number.MAX_SAFE_INTEGER;const repaired=M.Battle.restore(JSON.stringify(broken),b.profile,weapons);assert.ok(repaired);assert.ok(Number.isSafeInteger(repaired.nextId));assert.ok(repaired.heroes(0)[0].id<Number.MAX_SAFE_INTEGER);
});
test('mine and meteor deaths collect food and kills once, retain assists, and never leak after dying',()=>{
    for(const kind of ['mine','meteor']){
        const f=heroRound('赵云'),b=f.b,road=b.map.paths[0],cell=road.at(-1),pos=b.position(cell),enemy=f.add(901,pos.x,pos.y);enemy.progress=(road.length-2)*80+79;enemy.speed=1000;enemy.hp=10;b.enemyPosition(enemy);f.unit.debuff='sealed';f.unit.debuffLevel=f.unit.level;
        b.damageEnemy(enemy,1,{side:0,hero:true,heroId:b.heroes(0)[0].id});if(kind==='mine')b.hazards=[{cell,kind:'mine',ttl:60}];else b.profile.items=['meteor'];
        const food=b.armies[0].food,lives=b.armies[0].lives;b.advance(1/30);assert.equal(b.armies[0].food,food+1);assert.equal(b.kills,1);assert.equal(b.heroProgress[0].experience,.2);assert.equal(b.armies[0].lives,lives);assert.equal(b.enemies.length,0);
        b.advance(1/30);assert.equal(b.armies[0].food,food+1);assert.equal(b.kills,1);assert.equal(b.heroProgress[0].experience,.2);
    }
});
test('reflected boss deaths settle once before movement, while genuine leaks grant no kill rewards or experience',()=>{
    const f=heroRound('赵云'),b=f.b,road=b.map.paths[0],p=b.position(road.at(-2)),boss=f.add(901,p.x,p.y);boss.progress=(road.length-2)*80+79;boss.speed=1000;boss.hp=10;boss.boss=true;boss.bossType=0;boss.castIn=0;f.unit.debuff='sealed';b.profile.items=['exorcism'];b.random.next=()=>0;
    const food=b.armies[0].food,lives=b.armies[0].lives;b.damageEnemy(boss,1,{side:0,hero:true,heroId:b.heroes(0)[0].id});b.advance(1/30);assert.equal(b.armies[0].food,food+20);assert.equal(b.kills,1);assert.equal(b.armies[0].lives,lives);assert.equal(b.heroProgress[0].experience,0);
    const enemy=f.add(902,p.x,p.y);enemy.progress=(road.length-2)*80+79;enemy.speed=1000;b.damageEnemy(enemy,1,{side:0,hero:true,heroId:b.heroes(0)[0].id});b.advance(1/30);assert.equal(b.armies[0].lives,lives-1);assert.equal(b.armies[0].food,food+20);assert.equal(b.kills,1);assert.equal(b.heroProgress[0].experience,0);
});
test('native skills have separate pre/post counts, independent cast speed, and no invented Huang Gai ability',()=>{
    const expected={'赵云':[30,false],'张飞':[15,true],'马超':[0,false],'关羽':[20,true],'黄忠':[30,true],'关平':[15,true],'关兴':[0,false],'张苞':[0,false],'张翼':[20,true],'黄盖':[0,false],'刘备':[20,false],'黄祖':[30,true]};
    for(const hero of M.HEROES){const spec=S.HERO_SKILLS[hero.name];assert.equal(spec.every,expected[hero.name][0]);assert.equal(spec.before,expected[hero.name][1]);assert.equal(hero.skill,spec.name);}
    assert.equal(S.skillRate(1),1.2);assert.equal(S.skillRate(5),2);assert.equal(S.HERO_SKILLS['黄盖'].kind,undefined);
    for(const name of ['张飞','刘备','黄盖']){
        const f=heroRound(name),{b,unit}=f,pos=b.position(40),path=b.map.paths[0];let nearest=0,distance=Infinity;
        path.forEach((cell,index)=>{const p=b.position(cell),d=Math.hypot(p.x-pos.x-40,p.y-pos.y);if(d<distance){nearest=index;distance=d;}});
        const p=b.position(path[nearest]),target=f.add(901,p.x,p.y);target.progress=nearest*80;target.hp=target.maxHp=1e9;
        unit.attacks=0;unit.skillCount=name==='刘备'?19:14;b.advance(1/30);
        if(name==='刘备'){assert.equal(b.shots.some(s=>s.kind==='holyBlade'),true);assert.equal(unit.skillCount,0);}
        else{assert.equal(unit.attacks,1);assert.equal(b.heroSkills.length,0);for(let i=0;i<40;i++)b.advance(1/30);assert.equal(b.heroSkills.some(s=>s.kind==='shout'),name==='张飞');}
    }
});
test('both shouts grow three native rings, stun once, and resume without direct damage or global knockback',()=>{
    for(const [name,stun] of [['张飞',2],['关平',1]]){
        const f=heroRound(name),target=f.add(901,140,440),far=f.add(902,600,440);assert.equal(startSkill(f),true);const {b,unit}=f;
        b.time=.49;b.advanceHeroSkills(1/30);assert.equal(target.held,undefined);
        b.time=.7;b.advanceHeroSkills(1/30);assert.equal(target.hp,100);assert.equal(target.progress,0);assert.equal(target.held,stun);assert.equal(far.held,undefined);assert.equal(b.heroSkills[0].visited.length,1);
        b.time=.8;b.advanceHeroSkills(1/30);assert.equal(target.held,stun);b.time=1.01;b.advanceHeroSkills(1/30);assert.equal(b.heroSkills.length,0);assert.equal(unit.skillResume,true);
        const ring=S.shoutRing(.7,1.2,200,0);assert.ok(Math.abs(ring.scale-1.5)<1e-12);assert.equal(S.shoutRing(.7,1.2,200,2).alpha,.7);
    }
});
test('Ma Chao, Guan Xing and Zhang Bao trigger per-hit passives with distinct boss rules',()=>{
    for(const name of ['马超','关兴','张苞'])for(const boss of [false,true]){
        const f=heroRound(name),target=f.add(901,100,340);target.boss=boss;f.b.random.next=()=>0;
        f.b.hitShot({id:1,from:f.unit.id,side:0,target:target.id,x:0,y:0,damage:10,speed:0,kind:'melee',splash:0,hero:name},target);
        assert.equal(target.hp,name==='马超'?(boss?88:80):90);assert.equal(target.held,name==='马超'?(boss?.2:.5):boss?undefined:.3);assert.equal(f.b.heroSkills.length,0);
    }
});
test('Huang Zhong plateaus at levels 3/5 and shoots 1/1/2/2/3 straight piercing arrows',()=>{
    const powers=[],intervals=[];
    for(let level=1;level<=5;level++){
        const f=heroRound('黄忠',40,level),target=f.add(901,200,440);const stats=f.b.stats(f.unit,f.hero,level,0);powers.push(stats.power);intervals.push(stats.interval);f.attack(target);
        assert.equal(f.b.weaponStrikes.length,[1,1,2,2,3][level-1]);f.b.time=.45;f.b.advanceWeaponStrikes(1/30);assert.equal(f.b.shots.length,[1,1,2,2,3][level-1]);assert.equal(f.b.shots[0].motion.kind,'line');assert.equal(f.b.shots[0].flight,undefined);
    }
    assert.deepEqual(powers,[6,9,9,12.600000000000001,12.600000000000001]);assert.equal(intervals[1],intervals[2]);assert.equal(intervals[3],intervals[4]);
    const f=heroRound('黄忠'),target=f.add(901,240,440),second=f.add(902,350,440),behind=f.add(903,0,440);f.attack(target);f.b.time=.45;f.b.advanceWeaponStrikes(1/30);const shot=f.b.shots[0];f.b.time=.6;f.b.advanceSkillProjectile(shot,.15);assert.equal(target.hp,94);assert.equal(second.hp,94);assert.equal(behind.hp,100);assert.ok(shot.damage>0);
});
test('Guan Ping sweeps a whole circle, while Liu Bei/Zhang Yi target and Huang Gai stop on the first overlap',()=>{
    const g=heroRound('关平'),first=g.add(901,55,300),back=g.add(902,55,550);g.attack(first);g.b.time=.39;g.b.advanceWeaponStrikes(1/30);assert.equal(first.hp,100);
    for(let i=12;i<=24;i++){g.b.time=i/30;g.b.advanceWeaponStrikes(1/30);}assert.equal(first.hp,97);assert.equal(back.hp,97);assert.equal(W.weaponBusyDuration(2,'关平'),1.01);
    for(const name of ['刘备','张翼']){const f=heroRound(name),target=f.add(901,20,300),near=f.add(902,20,310);f.attack(target);f.b.time=.2;f.b.advanceWeaponStrikes(1/30);assert.equal(target.hp,100-f.hero.power);assert.equal(near.hp,100);}
    const f=heroRound('黄盖'),a=f.add(901,0,300),b=f.add(902,10,300);f.attack(a);for(let i=0;i<=6;i++){f.b.time=i/30;f.b.advanceWeaponStrikes(1/30);}assert.equal([a,b].filter(e=>e.hp<100).length,1);
});
test('Guan Yu builds additive speed only on a repeated target and resets on retarget',()=>{
    const f=heroRound('关羽'),a=f.add(901,100,340),b=f.add(902,110,350);f.attack(a);const interval=f.b.stats(f.unit,f.hero).interval;f.attack(a);assert.equal(f.unit.chain,.05);assert.ok(f.b.stats(f.unit,f.hero).interval<interval);for(let i=0;i<150;i++)f.attack(a);assert.equal(f.unit.chain,5);f.attack(b);assert.equal(f.unit.chain,0);
});
test('arrow rain releases five groups of ten; fire rain covers the road without instant global damage',()=>{
    const f=heroRound('黄祖'),enemy=f.add(901,100,340);assert.equal(startSkill(f),true);
    for(let i=1;i<=5;i++){f.b.time=i*.228/1.2;f.b.advanceHeroSkills(1/30);assert.equal(f.b.shots.length,i*10);assert.equal(enemy.hp,100);}
    assert.equal(f.b.heroSkills.length,0);assert.equal(f.unit.skillResume,true);assert.ok(f.b.shots.every(s=>s.kind==='rainArrow'&&s.width===22&&s.height===72&&s.flight.multiplier===.5));
    const fire=heroRound('黄忠');fire.add(901,100,340);startSkill(fire);const skill=fire.b.heroSkills[0],count=skill.points.length;assert.ok(count>=fire.b.map.paths[0].length-1);fire.b.time=3;fire.b.advanceHeroSkills(1/30);assert.equal(fire.b.shots.length,count);assert.equal(fire.b.heroSkills.length,0);assert.ok(fire.b.shots.every(s=>s.damage===12&&s.splash===150&&s.motion.kind==='point'));
});
test('holy blade deals fivefold piercing damage and knockdown without awarding food',()=>{
    const f=heroRound('刘备'),enemy=f.add(901,100,440),food=f.b.armies[0].food;startSkill(f);assert.equal(f.b.armies[0].food,food);assert.equal(f.b.shots[0].damage,50);assert.equal(f.b.shots[0].kind,'holyBlade');assert.equal(f.b.shots[0].motion.kind,'wave');f.b.hitShot(f.b.shots[0],enemy);assert.equal(enemy.hp,50);assert.equal(enemy.knocked,2);assert.equal(f.b.armies[0].food,food);
});
test('jump slash has one/five landings, distance-faded splash, a return flight and identical restored state',()=>{
    for(const name of ['张翼','关羽']){
        const f=heroRound(name),enemy=f.add(901,140,400);enemy.hp=enemy.maxHp=10000;startSkill(f);let restored=M.Battle.restore(f.b.snapshot(),f.b.profile,weapons);assert.ok(restored);let landings=0;
        for(let i=1;i<400&&f.b.heroSkills.length;i++){f.b.time=restored.time=i/30;const before=f.b.effects.length;f.b.advanceHeroSkills(1/30);restored.advanceHeroSkills(1/30);landings+=f.b.effects.slice(before).filter(e=>e.kind==='stomp').length;assert.equal(f.b.snapshot(),restored.snapshot());}
        assert.equal(landings,name==='张翼'?1:5);assert.equal(f.b.heroSkills.length,0);assert.equal(f.unit.skillResume,false);assert.ok(enemy.hp<10000-f.hero.power*landings);
    }
});
test('Zhao Yun phantom follows the road for seven return passes and is cancelled when his name is split',()=>{
    const f=heroRound('赵云'),path=f.b.map.paths[0],p=f.b.position(path[5]),enemy=f.add(901,p.x,p.y);enemy.progress=400;enemy.hp=enemy.maxHp=100000;assert.equal(startSkill(f),true);
    f.b.time=.8;f.b.advanceHeroSkills(1/30);assert.equal(f.b.heroSkills[0].phase,1);const saved=f.b.snapshot(),restored=M.Battle.restore(saved,f.b.profile,weapons);assert.ok(restored);assert.equal(restored.snapshot(),saved);
    let passes=0;for(let i=1;i<9000&&f.b.heroSkills.length;i++){f.b.time=.8+i/30;f.b.advanceHeroSkills(1/30);passes=Math.max(passes,f.b.heroSkills[0]?.count||0);}
    assert.equal(f.b.heroSkills.length,0);assert.equal(passes,6);assert.ok(enemy.hp<100000);
    startSkill(f);assert.equal(f.b.heroSkills.length,1);const free=f.b.armies[0].unlocked.find(cell=>!f.b.armies[0].units[cell]);assert.equal(f.b.move(location('board',41),location('board',free)),'');assert.equal(f.b.heroSkills.length,0);
});
test('malformed skill and skill-projectile data is discarded while legacy saves keep the round',()=>{
    const f=heroRound('黄祖');f.add(901,100,340);startSkill(f);const raw=JSON.parse(f.b.snapshot());raw.heroSkills[0].rate=0;raw.shots=[{id:991,from:f.unit.id,target:901,side:0,x:0,y:0,damage:1,speed:1,kind:'arrow',splash:0,motion:{kind:'point',born:0,startX:0,startY:0,dx:0,dy:0,speed:1,expires:1,toX:0,toY:0,arc:1,duration:0}}];
    const restored=M.Battle.restore(JSON.stringify(raw),f.b.profile,weapons);assert.ok(restored);assert.equal(restored.heroSkills.length,0);assert.equal(restored.shots.length,0);delete raw.heroSkills;delete raw.shots;assert.ok(M.Battle.restore(JSON.stringify(raw),f.b.profile,weapons));
});
test('native range tests enemy boxes; rotated hit areas distinguish overlap from edge contact',()=>{
    assert.equal(C.enemyInRange({x:0,y:0},200,{x:239,y:0}),true);assert.equal(C.enemyInRange({x:0,y:0},200,{x:240,y:0}),false);
    const line={x:0,y:0,angle:0,length:200,bold:5};assert.equal(C.strikeOverlaps(line,{x:0,y:-100}),true);assert.equal(C.strikeOverlaps(line,{x:44,y:-100}),true);assert.equal(C.strikeOverlaps(line,{x:45,y:-100}),false);assert.equal(C.strikeOverlaps(line,{x:0,y:-250}),false);
    assert.equal(C.strikeOverlaps({...line,angle:90},{x:100,y:0}),true);assert.equal(C.strikeOverlaps({...line,angle:90},{x:-100,y:0}),false);
});
test('knife hits the chosen target at cut completion without a projectile or intercepting a neighbour',()=>{
    const {b,unit,add,attack}=heroRound('关兴'),target=add(901,100,340),neighbour=add(902,110,350);attack(target);
    b.time=.45;b.advanceWeaponStrikes(1/30);assert.equal(target.hp,100);assert.equal(b.shots.length,0);
    const saved=b.snapshot(),restored=M.Battle.restore(saved,b.profile,weapons);assert.ok(restored);b.paused=true;b.advance(1);assert.equal(b.snapshot(),saved);b.paused=false;
    target.x=600;restored.enemies[0].x=600;b.time=restored.time=.46;b.advanceWeaponStrikes(1/30);restored.advanceWeaponStrikes(1/30);
    assert.equal(target.hp,93);assert.equal(neighbour.hp,100);assert.equal(b.weaponStrikes.length,0);assert.equal(b.shots.length,0);assert.equal(b.snapshot(),restored.snapshot());
    assert.deepEqual(Array.from(unit.seen),[901]);
});
test('Zhao Yun has five distinct piercing hits; each thrust hits a target once and ignores off-line or other-side enemies',()=>{
    const {b,add,attack}=heroRound('赵云'),target=add(901,50,300),behind=add(902,50,230),offLine=add(903,150,300),otherSide=add(904,50,300,1);attack(target);
    assert.equal(b.weaponStrikes.length,5);let restored;
    for(let i=1;i<=20;i++){b.time=i/30;b.advanceWeaponStrikes(1/30);if(i===6)restored=M.Battle.restore(b.snapshot(),b.profile,weapons);else if(i>6){restored.time=b.time;restored.advanceWeaponStrikes(1/30);assert.equal(b.snapshot(),restored.snapshot());}}
    assert.equal(target.hp,90);assert.equal(behind.hp,90);assert.equal(offLine.hp,100);assert.equal(otherSide.hp,100);assert.equal(b.shots.length,0);
});
test('Zhang Fei sweeps every direction once, while a sword sweep excludes targets behind it',()=>{
    const z=heroRound('张飞',42),targets=[[210,290],[360,440],[210,590],[60,440]].map((p,i)=>z.add(901+i,...p)),far=z.add(910,510,440);z.attack(targets[0]);
    z.b.time=.09;z.b.advanceWeaponStrikes(1/30);assert.ok(targets.every(e=>e.hp===100));
    for(let i=3;i<=14;i++){z.b.time=i/30;z.b.advanceWeaponStrikes(1/30);}assert.ok(targets.every(e=>e.hp===90));assert.equal(far.hp,100);assert.equal(z.b.shots.length,0);
    const s=heroRound('刘备',42),front=s.add(921,160,320),back=s.add(922,160,560);s.attack(front);
    for(let i=1;i<=8;i++){s.b.time=i/30;s.b.advanceWeaponStrikes(1/30);}assert.equal(front.hp,90);assert.equal(back.hp,100);assert.equal(s.b.shots.length,0);
});
test('five fast thrusts survive sub-frame durations and weapon/word sampling follows the saved simulation clock',()=>{
    const {b,add,attack}=heroRound('赵云',40,5),target=add(901,50,300);attack(target);
    assert.ok(b.weaponStrikes[1].duration<1/30);for(let i=1;i<=12;i++){b.time=i/30;b.advanceWeaponStrikes(1/30);}assert.ok(Math.abs(target.hp-(100-5*6.552))<1e-9);
    const pike=W.weaponGeometry(1,'赵云'),motion=new W.WeaponMotion(pike,'赵云'),word=new H.HeroMotion(),aim={dx:100,dy:0,distance:100,range:200};
    motion.advance(.1,1,true,1.5,aim,.2);word.advance(.1,1,.4,1.5,.2);assert.ok(Math.abs(motion.time-.3)<1e-12);assert.ok(Math.abs(word.elapsed-.3)<1e-12);
    const state=JSON.stringify(motion);motion.advance(0,1,true,1.5,aim,.2);assert.equal(JSON.stringify(motion),state);
});
test('idle word phase survives reconstruction and new units start their own idle clock',()=>{
    const {b,unit}=heroRound('张苞');unit.attacks=0;b.time=.5333333333333333;const restored=M.Battle.restore(b.snapshot(),b.profile,weapons);assert.ok(restored);
    const live=new H.HeroMotion(),rebuilt=new H.HeroMotion();
    const a=live.advance(.017,0,0,1,undefined,b.time-unit.idleAt),other=restored.armies[0].units[40],c=rebuilt.advance(.1,0,0,1,undefined,restored.time-other.idleAt);
    assert.deepEqual(a.pose,c.pose);assert.equal(live.elapsed,b.time);b.time=4;assert.equal(b.unit('字','张').idleAt,4);
    const spec=W.weaponGeometry(1,'张苞'),first=new W.WeaponMotion(spec,'张苞'),second=new W.WeaponMotion(spec,'张苞'),target={dx:100,dy:0,distance:100,range:200};
    const p=first.advance(.017,0,false,1,target,undefined,3.3),q=second.advance(.1,0,false,1,target,undefined,3.3);assert.deepEqual(p,q);assert.equal(first.idleTime,3.3);
    assert.equal(W.attackPose(W.weaponGeometry(1,'张飞'),'张飞',.7,0,0,100,200,1).angle,130);
});
test('bow and Ma Chao wait for release, preserve native projectile dimensions, and save curved flight progress',()=>{
    const bow=heroRound('黄祖'),target=bow.add(901,240,440);bow.attack(target);bow.b.time=.44;bow.b.advanceWeaponStrikes(1/30);assert.equal(bow.b.shots.length,0);
    bow.b.time=.45;bow.b.advanceWeaponStrikes(1/30);assert.equal(bow.b.shots.length,1);const arrow=bow.b.shots[0];assert.equal(arrow.width,22);assert.equal(arrow.height,72);assert.equal(arrow.anchorY,.9);assert.equal(arrow.flight.multiplier,3);
    const pose=C.advanceFlight(arrow.flight,arrow,target,.5);assert.equal(pose.arrived,false);assert.ok(pose.y<arrow.y-10);arrow.x=pose.x;arrow.y=pose.y;arrow.rotation=pose.angle;bow.b.time=.5;
    const saved=bow.b.snapshot(),restored=M.Battle.restore(saved,bow.b.profile,weapons);assert.ok(restored);assert.equal(restored.snapshot(),saved);bow.b.paused=true;bow.b.advance(1);assert.equal(bow.b.snapshot(),saved);
    const m=heroRound('马超'),enemy=m.add(902,140,320);m.attack(enemy);m.b.time=.19;m.b.advanceWeaponStrikes(1/30);assert.equal(m.b.shots.length,0);m.b.time=.2;m.b.advanceWeaponStrikes(1/30);const spear=m.b.shots[0];assert.equal(spear.kind,'throw');assert.equal(spear.width,42);assert.equal(spear.height,132);assert.equal(spear.anchorX,0);assert.equal(spear.flight.multiplier,5);
});
test('splitting a hero cancels queued strikes; corrupt new flight data is discarded without losing the round',()=>{
    const {b,add,attack}=heroRound('赵云');attack(add(901,50,300));assert.equal(b.weaponStrikes.length,5);assert.equal(b.move(location('board',41),location('reserve',0)),'');assert.equal(b.weaponStrikes.length,0);
    const legacy=JSON.parse(b.snapshot());delete legacy.weaponStrikes;assert.ok(M.Battle.restore(JSON.stringify(legacy),b.profile,weapons));
    const bow=heroRound('黄祖');bow.attack(bow.add(902,240,440));bow.b.time=.45;bow.b.advanceWeaponStrikes(1/30);const bad=JSON.parse(bow.b.snapshot());bad.shots[0].flight.progress=null;const restored=M.Battle.restore(JSON.stringify(bad),bow.b.profile,weapons);assert.ok(restored);assert.equal(restored.shots.length,0);
});
test('native weapons retain separate handle pivots, short-blade reach and pike offsets',()=>{
    const bow=W.weaponGeometry(0,'黄忠'),knife=W.weaponGeometry(2,'关羽'),sword=W.weaponGeometry(3,'刘备');
    assert.equal(bow.width,124);assert.equal(bow.height,56);assert.equal(bow.childY,10);
    assert.equal(knife.rootHeight*knife.anchorY,94.4);assert.equal(knife.x,55);assert.equal(knife.y,38);
    assert.equal(sword.width,33.6);assert.equal(sword.height,105.6);assert.equal(W.weaponGeometry(2,'关平',20).reach,30);
    const short=W.weaponGeometry(1,'赵云',10);assert.equal(short.childY,41);assert.equal(short.tipY,50);assert.equal(W.weaponGeometry(1,'赵云',11).childY,66);assert.equal(W.weaponGeometry(1,'马超').x,140);
    assert.equal(W.aimAngle(100,0),90);assert.equal(W.aimAngle(0,-100),0);assert.equal(W.aimAngle(0,100),180);assert.equal(W.angleDelta(720,-170),-170);assert.equal(W.angleDelta(179,-179),2);
});
test('weapon landmarks preserve five thrusts, full Zhang Fei sweep and Ma Chao hidden interval',()=>{
    const pike=W.weaponGeometry(1,'赵云'),samples=[];
    for(let t=.15;t<.58;t+=.005)samples.push(W.attackPose(pike,'赵云',t,0,90,100,200,1).trail);
    assert.equal(samples.filter((value,index)=>value&&(index===0||!samples[index-1])).length,5);
    assert.equal(W.attackPose(pike,'赵云',.25,0,90,100,200,1).childY,-39);
    const zhang=W.weaponGeometry(1,'张飞');assert.equal(W.attackPose(zhang,'张飞',.1,0,0,100,200,1).angle,130);assert.equal(W.attackPose(zhang,'张飞',.4,0,0,100,200,1).angle,-230);
    const ma=W.weaponGeometry(1,'马超');assert.equal(W.attackPose(ma,'马超',.2,0,90,100,200,1).visible,false);assert.equal(W.attackPose(ma,'马超',1.2,0,90,100,200,1).rootScale,0);assert.equal(W.attackPose(ma,'马超',1.4,0,90,100,200,1).visible,true);
    const sword=W.weaponGeometry(3,'刘备');assert.equal(W.attackPose(sword,'刘备',0,0,0,100,200,1).angle,-60);assert.equal(W.attackPose(sword,'刘备',0,0,0,100,200,2).angle,60);
    const motion=new W.WeaponMotion(pike,'赵云'),target={dx:100,dy:0,distance:100,range:200};motion.advance(.1,1,true,1,target);const frozen=JSON.stringify(motion);motion.advance(0,1,true,1,target);assert.equal(JSON.stringify(motion),frozen);motion.reset(1);assert.equal(motion.active,false);assert.equal(motion.time,0);
    const rearm=new W.WeaponMotion(ma,'马超');rearm.resume(1,1.3,1,target);const restoredPose=rearm.advance(0,1,true,1,target);assert.equal(restoredPose.visible,true);assert.ok(Math.abs(restoredPose.rootScale-.5)<1e-12);assert.equal(rearm.attacks,1);
});
test('Ma Chao finishes his throw and rearm before attacking again, including save and pause',()=>{
    const b=new M.Battle(M.newProfile(now),weapons,1,7),unit=b.unit('字','马');b.armies[0].units={53:unit,54:b.unit('字','超')};b.aiTime=10000;b.spawnTime=10000;
    const p=b.position(53),index=b.map.paths[0].findIndex(cell=>{const e=b.position(cell);return Math.hypot(e.x-p.x-40,e.y-p.y)<150;}),target=b.position(b.map.paths[0][index]);assert.ok(index>=0);
    b.enemies=[{id:900,side:0,progress:index*80,hp:1000000,maxHp:1000000,speed:0,boss:false,slowed:0,x:target.x,y:target.y}];
    for(let i=0;i<20;i++)b.advance(1/30);assert.equal(unit.attacks,1);const saved=b.snapshot(),restored=M.Battle.restore(saved,b.profile,weapons);assert.ok(restored);
    b.paused=true;b.advance(1);assert.equal(b.snapshot(),saved);b.paused=false;
    for(let i=0;i<16;i++){b.advance(1/30);restored.advance(1/30);}assert.equal(unit.attacks,1);assert.equal(b.snapshot(),restored.snapshot());
    for(let i=0;i<10;i++){b.advance(1/30);restored.advance(1/30);}assert.equal(unit.attacks,2);assert.equal(b.snapshot(),restored.snapshot());
    assert.equal(W.weaponPlaybackRate(0,'黄忠',-1,2,.5),1);assert.equal(W.weaponPlaybackRate(0,'黄忠',3,2,.5),1.5);assert.equal(W.weaponPlaybackRate(1,'张飞',18,2,.5),1);
});
test('initial geometry, roads and unlock cells are valid on all four maps',()=>{
    for(const map of M.MAPS){
        const b = new M.Battle(M.newProfile(now),weapons,map.id,1);
        for(const side of [0,1]){
            assert.ok(b.armies[side].unlocked.length >= 4);
            assert.ok(b.armies[side].unlocked.every(n=>b.owns(side,n)&&map.grass.includes(n)));
            for(const cell of map.paths[side])assert.ok(Number.isInteger(cell)&&cell>=0&&cell<80);
            assert.ok(map.paths[side].every(n=>!map.grass.includes(n)),'road never overlaps a deployment cell');
            for(let i=1;i<map.paths[side].length;i++){
                const a=b.position(map.paths[side][i-1]),c=b.position(map.paths[side][i]); assert.equal(Math.abs(a.x-c.x)+Math.abs(a.y-c.y),80);
            }
        }
    }
});
test('recruitment is atomic when short of food, camp full or paused',()=>{
    const b=round(); assert.equal(b.cost(),10); assert.equal(b.recruit(),''); assert.equal(b.armies[0].food,10); assert.equal(b.cost(),12);
    const before=b.snapshot(); assert.notEqual(b.recruit(),''); assert.equal(b.snapshot(),before);
    b.armies[0].food=1000; for(let i=1;i<5;i++)assert.equal(b.recruit(),'');
    const food=b.armies[0].food,count=b.armies[0].recruitCount;assert.notEqual(b.recruit(),'');assert.equal(b.armies[0].food,food);assert.equal(b.armies[0].recruitCount,count);
    b.paused=true;assert.notEqual(b.recruit(),'');assert.equal(b.armies[0].food,food);
});
test('observed first tutorial recruits an archer and deploy unlocks battle clock',()=>{
    const b=round(true);b.advance(1);assert.equal(b.time,0);assert.equal(b.recruit(),'');assert.equal(b.armies[0].reserve[0].kind,'弓');
    assert.deepEqual(Array.from(Object.values(b.armies[1].units),u=>u.kind),['骑','枪','刀']);
    b.advance(1);assert.equal(b.time,0);assert.equal(b.move(location('reserve',0),location('board',58)),'');
    b.advance(1/30);assert.ok(b.time>0);assert.equal(b.profile.tutorial,true);
});
test('invalid enemy-side/road drops preserve both source and food',()=>{
    const b=round();b.armies[0].reserve[0]=b.unit('刀');
    for(const cell of [11,0,79,-1,100]){const before=b.snapshot();assert.notEqual(b.move(location('reserve',0),location('board',cell)),'');assert.equal(b.snapshot(),before);}
});
test('shovels unlock a single legal plot and are consumed exactly once',()=>{
    const b=round();b.armies[0].reserve[0]=b.unit('铲');const cell=b.map.grass.find(n=>b.owns(0,n)&&!b.armies[0].unlocked.includes(n));
    const count=b.armies[0].unlocked.length;assert.equal(b.move(location('reserve',0),location('board',cell)),'');assert.equal(b.armies[0].unlocked.length,count+1);assert.equal(b.armies[0].reserve[0],null);
    b.move(location('reserve',0),location('board',cell));assert.equal(b.armies[0].unlocked.length,count+1);
});
test('equal units merge, different units swap, level five never silently destroys units',()=>{
    const b=round();b.armies[0].reserve[0]=b.unit('枪');b.armies[0].units[58]=b.unit('枪');
    assert.equal(b.move(location('reserve',0),location('board',58)),'');assert.equal(b.armies[0].units[58].level,2);assert.equal(b.armies[0].reserve[0],null);
    const a=b.unit('刀'),c=b.unit('弓');b.armies[0].reserve[0]=a;b.armies[0].units[59]=c;b.move(location('reserve',0),location('board',59));assert.equal(b.armies[0].reserve[0].id,c.id);assert.equal(b.armies[0].units[59].id,a.id);
    const d=b.unit('枪','枪',5),e=b.unit('枪','枪',5);b.armies[0].reserve[1]=d;b.armies[0].units[60]=e;b.move(location('reserve',1),location('board',60));assert.equal(b.armies[0].reserve[1].id,e.id);assert.equal(b.armies[0].units[60].id,d.id);
});
test('heroes require ordered horizontal name fragments, breaking adjacency removes the link',()=>{
    const b=round();b.armies[0].units[58]=b.unit('字','赵',2);b.armies[0].units[59]=b.unit('字','云',2);assert.equal(b.heroes(0)[0].hero.name,'赵云');
    b.move(location('board',59),location('board',66));assert.equal(b.heroes(0).length,0);
    b.armies[0].units[59]=b.unit('字','赵');assert.equal(b.heroes(0).length,0);
    b.armies[0].units[63]=b.unit('字','赵');b.armies[0].units[64]=b.unit('字','云');assert.equal(b.heroes(0).length,0);
});
test('active items use legal targets and enforce cooldown; invalid drops do not consume cooldown',()=>{
    const b=round();b.profile.items=['god','speed'];b.armies[0].units[58]=b.unit('刀');assert.notEqual(b.active('god',59),'');assert.equal(b.cooldowns.god,undefined);
    assert.equal(b.active('god',58),'');assert.equal(b.armies[0].units[58].level,2);assert.notEqual(b.active('god',58),'');assert.equal(b.armies[0].units[58].level,2);
    assert.equal(b.active('speed',58),'');assert.equal(b.boosts[b.armies[0].units[58].id],.4);
});
test('shop purchases and 2/6 slot limits do not charge on failure',()=>{
    const p=M.newProfile(now);p.gold=1000;assert.equal(M.purchase(p,'god'),'');const gold=p.gold;assert.notEqual(M.purchase(p,'god'),'');assert.equal(p.gold,gold);
    M.purchase(p,'speed');const balance=p.gold;assert.notEqual(M.purchase(p,'training'),'');assert.equal(p.gold,balance);
    for(const id of ['farmer','recruit','promotion','shovel','seeker','life'])assert.equal(M.purchase(p,id),'');const g=p.gold;assert.notEqual(M.purchase(p,'allSpeed'),'');assert.equal(p.gold,g);
});
test('weapons are type-compatible, count-limited and equipped copies survive recycling',()=>{
    const p=M.newProfile(now);p.weapons[11]=1;p.weapons[1]=2;assert.equal(M.equipWeapon(p,weapons,'赵云',11),'');assert.notEqual(M.equipWeapon(p,weapons,'张飞',11),'');assert.notEqual(M.equipWeapon(p,weapons,'关羽',11),'');
    const gold=M.recycleWeapons(p,weapons);assert.equal(p.weapons[11],1);assert.equal(p.weapons[1],0);assert.ok(gold>0);
});
test('settlement is idempotent including double reward and reload',()=>{
    const b=round();b.finish(true);const r=b.result;assert.equal(M.claimResult(b.profile,r,true),true);const gold=b.profile.gold,stars=b.profile.stars;
    assert.equal(M.claimResult(b.profile,r,true),false);const p=M.restoreProfile(JSON.stringify(b.profile),now);assert.equal(M.claimResult(p,r,false),false);assert.equal(p.gold,gold);assert.equal(p.stars,stars);
});
test('weapon fragments assemble at the reference threshold and never duplicate a restored reward',()=>{
    const p=M.newProfile(now);
    assert.equal(M.awardWeaponFragments(p,1,1,2),0);assert.equal(p.weapons[1],0);assert.equal(p.fragments[1],1);
    assert.equal(M.awardWeaponFragments(p,1,4,2),2);assert.equal(p.weapons[1],2);assert.equal(p.fragments[1],1);
    const r={id:'fragment-reward',win:true,reward:20,wave:6,weaponId:1,weaponFragments:1,weaponRequired:2};
    assert.equal(M.claimResult(p,r,true),true);assert.equal(p.weapons[1],3);assert.equal(p.fragments[1],0);assert.equal(p.gold,40);
    const restored=M.restoreProfile(JSON.stringify(p),now);assert.equal(M.claimResult(restored,r),false);assert.equal(restored.weapons[1],3);
    assert.equal(M.awardWeaponFragments(p,1,-10,2),0);assert.equal(p.weapons[1],3);
    assert.equal(M.claimResult(p,{id:'legacy-promised-reward',win:true,reward:20,wave:1,weaponId:1}),true);assert.equal(p.weapons[1],4);
});
test('day boundary clears only daily items; stamina uses elapsed time and caps at 30',()=>{
    const p=M.newProfile(now);p.items=['god'];p.gold=100;p.stamina=5;p.staminaAt=now;
    M.refreshProfile(p,now+900000);assert.equal(p.stamina,8);M.refreshProfile(p,now+86400000);assert.equal(p.stamina,30);assert.equal(p.gold,100);assert.equal(p.items.length,0);
});
test('reference archer reaches distant enemies and opponent does not borrow player gear',()=>{
    const b=round(),unit=b.unit('弓');b.armies[0].units[58]=unit;const p=b.position(58);
    b.enemies.push({id:100,side:0,progress:0,hp:100,maxHp:100,speed:0,boss:false,slowed:0,x:p.x+200,y:p.y});
    b.advance(1/30);assert.equal(b.shots.length,0);assert.equal(b.pendingAttacks.length,1);
    for(let i=0;i<17;i++)b.advance(1/30);assert.equal(b.shots.length,1);
    b.profile.equipped['赵云']=19;assert.equal(b.stats(b.unit('字','赵'),M.HEROES[0],1,1).weapon,undefined);
});
test('native attack interval is seconds; bow releases after its wind-up and survives pause/restore',()=>{
    const b=round(),unit=b.unit('弓');b.armies[0].units[58]=unit;b.spawnTime=10000;b.aiTime=10000;
    assert.equal(b.stats(unit).interval,.8);assert.equal(b.stats(b.unit('刀','刀',2)).interval,.8/1.5);assert.equal(b.stats(b.unit('字','赵'),M.HEROES[0]).interval,.8);
    const p=b.position(b.map.paths[0][1]);b.enemies.push({id:900,side:0,progress:80,hp:100,maxHp:100,speed:0,boss:false,slowed:0,x:p.x,y:p.y});
    b.advance(.2);assert.equal(b.shots.length,0);assert.equal(b.pendingAttacks.length,1);
    const saved=b.snapshot();b.paused=true;b.advance(2);assert.equal(b.snapshot(),saved);b.paused=false;
    const restored=M.Battle.restore(saved,b.profile,weapons);assert.ok(restored);
    for(let i=0;i<14;i++){b.advance(1/30);restored.advance(1/30);}
    assert.equal(b.snapshot(),restored.snapshot());assert.ok(b.shots.length>0||b.enemies[0].hp<100);
});
test('basic melee targets nearest, knife hits one, pike pierces a line and cavalry sweeps an area',()=>{
    for(const kind of ['刀','枪','骑']){
        const b=round(),unit=b.unit(kind);b.armies[0].units[58]=unit;
        const p=b.position(58);b.enemies=[{id:901,side:0,progress:0,hp:100,maxHp:100,speed:0,boss:false,slowed:0,x:p.x+60,y:p.y},{id:902,side:0,progress:100,hp:100,maxHp:100,speed:0,boss:false,slowed:0,x:p.x+100,y:p.y},{id:903,side:0,progress:200,hp:100,maxHp:100,speed:0,boss:false,slowed:0,x:p.x+60,y:p.y+40}];
        b.releaseBasicAttack({unit:unit.id,side:0,cell:58,kind,target:901,ttl:0,damage:3,range:160,x:p.x,y:p.y,targetX:p.x+60,targetY:p.y});
        assert.equal(b.shots.length,0);assert.equal(b.enemies[0].hp,97);assert.equal(b.enemies[1].hp,kind==='刀'?100:97);assert.equal(b.enemies[2].hp,kind==='骑'?97:100);
    }
});
test('hero damage and speed use their distinct native growth tables; speed bonuses add',()=>{
    const b=round(),unit=b.unit('字','赵',2),hero=M.HEROES[0],stats=b.stats(unit,hero);
    assert.ok(Math.abs(stats.power-3)<1e-12);assert.ok(Math.abs(stats.interval-.8/1.3)<1e-12);
    const max=b.stats(b.unit('字','赵',5),hero);assert.ok(Math.abs(max.power-6.552)<1e-12);assert.ok(Math.abs(max.interval-.8/1.9734)<1e-12);
    const basic=b.unit('刀');b.profile.items=['together','allSpeed'];b.boosts[basic.id]=.4;
    assert.ok(Math.abs(b.stats(basic).interval-.4)<1e-12);assert.ok(Math.abs(b.stats(basic,undefined,1,1).interval-.8/1.8)<1e-12);
});
test('farmer harvest waits for the native 20/10/5/3/2 thresholds and merging retains work',()=>{
    for(const level of [4,5]){
        const b=round(),farmer=b.unit('农','农',level);b.armies[0].units[58]=farmer;b.spawnTime=10000;b.aiTime=10000;
        const limit=level===4?3:2,food=b.armies[0].food;
        for(let i=0;i<(limit-.2)*30;i++)b.advance(1/30);assert.equal(b.armies[0].food,food);
        for(let i=0;i<10;i++)b.advance(1/30);assert.equal(b.armies[0].food,food+1);assert.equal(b.profile.gold,1);
    }
    const b=round(),farmer=b.unit('农');b.armies[0].units[58]=farmer;b.armies[0].reserve[0]=b.unit('农');b.spawnTime=10000;b.aiTime=10000;
    for(let i=0;i<180;i++)b.advance(1/30);const food=b.armies[0].food;assert.equal(b.profile.gold,0);
    assert.equal(b.move(location('reserve',0),location('board',58)),'');assert.equal(farmer.level,2);assert.ok(Math.abs(farmer.cooldown-4)<1e-9);
    for(let i=0;i<114;i++)b.advance(1/30);assert.equal(b.armies[0].food,food);
    for(let i=0;i<10;i++)b.advance(1/30);assert.equal(b.armies[0].food,food+1);
});
test('original unit frame canvases retain trim offsets and complete one attack before returning to idle',()=>{
    const art=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../assets/resources/data/art.json')));
    for(const kind of ['刀','弓','枪','骑']){
        const spec=U.BASIC_UNITS[kind],player=new U.UnitFramePlayer(kind);let path=player.advance(0,0,.8);
        const f=art.frames[path];assert.ok(f);assert.ok(spec.offset[0]+f.offset[0]>=0);assert.ok(spec.offset[1]+f.offset[1]>=0);assert.ok(spec.offset[0]+f.offset[0]+f.rect[2]<=80);assert.ok(spec.offset[1]+f.offset[1]+f.rect[3]<=80);
        path=player.advance(0,1,.8);assert.ok(path.includes('attack_00'));assert.ok(art.frames[path]);
        const frozen=player.elapsed;player.advance(0,1,.8);assert.equal(player.elapsed,frozen);
        path=player.advance(spec.attackDuration/spec.initialRate+1e-5,1,.8);assert.equal(player.clip,'zhan');assert.ok(art.frames[path]);
        player.reset(0);player.advance(0,1,.8,true);path=player.advance(spec.attackDuration/spec.initialRate+1e-5,1,.8,true);assert.equal(player.clip,'attack');assert.ok(path.includes(String(spec.attackFrames-1).padStart(2,'0')));player.advance(0,1,.8,false);assert.equal(player.clip,'zhan');
        for(let i=0;i<200;i++){path=player.advance(1/60,i<50?1:2,.4);assert.ok(art.frames[path],path);}
    }
});
test('paired hero clips keep left/right glyphs and native bottom-pivot motion through pauses',()=>{
    assert.equal(H.HERO_RIGS['赵云'],'zhaoYun');assert.equal(H.heroAppearance('赵云',4).skin,'2');assert.equal(H.heroAppearance('马超',5).skin,'3');
    assert.equal(H.heroAppearance('刘备',2).background,1);assert.equal(H.heroAppearance('关平',2).background,3);assert.equal(H.heroAppearance('黄忠',4).color,'#ffffff');
    const motion=new H.HeroMotion();let event=motion.advance(.15,1,.7,1);assert.equal(event.started,true);assert.equal(event.attacking,true);assert.ok(Math.abs(event.pose.rotation+3)<1e-12);assert.ok(Math.abs(event.pose.scaleY-.95)<1e-12);
    const frozen=motion.elapsed;motion.advance(0,1,.7,1);assert.equal(motion.elapsed,frozen);
    event=motion.advance(.06,1,.5,2);assert.ok(Math.abs(event.pose.scaleY-1.05)<1e-12);assert.ok(Math.abs(event.pose.rotation+2)<1e-12);
    event=motion.advance(0,1,0,1);assert.equal(event.attacking,false);assert.equal(event.pose.scaleY,1);
    motion.reset(1);assert.equal(motion.attacking,false);assert.equal(motion.elapsed,0);
    const art=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../assets/resources/data/art.json')));
    for(const folder of Object.values(H.HERO_RIGS)){
        const spec=art.frames['resources/anim/'+folder+'/skeleton_zh.json'];const data=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../assets/bundles/'+spec.bundle+'/'+spec.file+'.json')));
        for(const name of ['zhan1','zhan2','attack1','attack2'])assert.ok(data.animations[name]);for(const skin of ['1','2','3'])assert.ok(data.skins[skin]);
    }
});
test('brush, trash and traps preserve legal targets and reserve effects',()=>{
    const b=round();b.profile.items=['brush','trash','trap'];b.armies[0].reserve[0]=b.unit('字','赵');
    assert.equal(b.active('brush',0,location('reserve',0)),'');assert.notEqual(b.armies[0].reserve[0].char,'赵');
    const food=b.armies[0].food;assert.equal(b.active('trash',0,location('reserve',0)),'');assert.equal(b.armies[0].reserve[0],null);assert.equal(b.armies[0].food,food+1);
    assert.notEqual(b.active('trap',58),'');assert.equal(b.cooldowns.trap,undefined);assert.equal(b.hazards.length,0);
    assert.equal(b.active('trap',b.map.paths[0][1]),'');assert.equal(b.hazards.length,1);
});
test('passive pills affect both camps as described; periodic shovel survives a full camp',()=>{
    const p=M.newProfile(now);p.items=['pill','life','shovel'];const b=new M.Battle(p,weapons,0,1);assert.deepEqual(Array.from(b.armies,a=>a.lives),[9,6]);
    b.spawnTime=10000;b.aiTime=10000;b.waveTime=-10000;for(let i=0;i<5;i++)b.armies[0].reserve[i]=b.unit('刀');
    for(let i=0;i<1810;i++)b.advance(1/30);assert.equal(b.armies[0].reserve.filter(u=>u.kind==='铲').length,0);
    b.armies[0].reserve[2]=null;b.advance(1/30);assert.equal(b.armies[0].reserve[2].kind,'铲');
});
test('promotion upgrades in-place; march pill consumes no daily slot; UID remains stable',()=>{
    const p=M.newProfile(now);p.gold=500;p.stamina=10;assert.equal(M.purchase(p,'promotion'),'');assert.equal(M.purchase(p,'promotion'),'');assert.equal(p.itemLevels.promotion,2);assert.equal(p.items.length,1);
    assert.equal(M.purchase(p,'promotion'),'');assert.equal(p.itemLevels.promotion,3);const gold=p.gold;assert.notEqual(M.purchase(p,'promotion'),'');assert.equal(p.gold,gold);
    assert.equal(M.purchase(p,'march'),'');assert.equal(p.stamina,20);assert.equal(p.items.length,1);const uid=p.uid;M.refreshProfile(p,now+900000);assert.equal(p.uid,uid);assert.equal(M.restoreProfile(JSON.stringify(p),now+900000).uid,uid);
});
test('every compatible weapon completes a bounded combat simulation and survives restoration',()=>{
    for(const weapon of weapons){const b=round(),hero=M.HEROES.find(h=>h.weaponType===weapon.type);if(!hero)continue;b.profile.equipped[hero.name]=weapon.id;
        b.armies[0].units[58]=b.unit('字',hero.chars[0],3);b.armies[0].units[59]=b.unit('字',hero.chars[1],3);
        for(let i=0;i<2000&&!b.completed;i++)b.advance(1/30);assert.ok(Number.isFinite(b.time));assert.ok(b.enemies.every(e=>Number.isFinite(e.hp)&&Number.isFinite(e.x)&&Number.isFinite(e.y)));assert.ok(b.shots.length<=160);
        const restored=M.Battle.restore(b.snapshot(),b.profile,weapons);assert.ok(restored);assert.equal(restored.snapshot(),b.snapshot());
    }
});
test('corrupt storage safely restores fresh state and unfinished rounds retain deterministic combat',()=>{
    assert.equal(M.restoreProfile('{bad',now).stamina,30);const b=round();b.armies[0].units[58]=b.unit('弓','弓',3);
    for(let i=0;i<400;i++)b.advance(1/30);
    const c=M.Battle.restore(b.snapshot(),b.profile,weapons);assert.ok(c);
    for(let i=0;i<90;i++){b.advance(1/30);c.advance(1/30);}assert.equal(c.snapshot(),b.snapshot());
});
test('full AI battle terminates, bounds live entities and reaches real kill/leak settlement',()=>{
    const b=round();b.armies[0].units[58]=b.unit('弓','弓',3);b.armies[0].units[59]=b.unit('枪','枪',3);
    let max=0;for(let i=0;i<18030&&!b.completed;i++){b.advance(1/30);max=Math.max(max,b.enemies.length);}
    assert.equal(b.completed,true);assert.ok(b.result);assert.ok(max<=200);assert.ok(b.kills>0);assert.ok(b.time<=600.1);
});
test('reference bone curves, weights and mesh vertices stay finite in all imported actors',()=>{
    const root=path.resolve(__dirname,'../assets/resources/data/art.json');const art=JSON.parse(fs.readFileSync(root));
    for(const [source,spec]of Object.entries(art.frames)){
        if(spec.kind!=='json'||!source.includes('/anim/'))continue;
        const data=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../assets/bundles',spec.bundle,spec.file+'.json')));
        if(!data.bones||!data.animations)continue;
        const bones=new Map(data.bones.map((b,i)=>[b.name,i]));
        for(const animation of Object.values(data.animations))for(const t of [0,R.duration(animation)*0.37,R.duration(animation)*0.79]){
            const matrices=R.boneMatrices(data,animation,t);assert.ok(matrices.flat().every(Number.isFinite));
            for(const slot of data.slots){const name=R.attachmentAt(slot,animation,t),a=data.skins.default?.[slot.name]?.[name];if(!a)continue;
                const v=a.type==='mesh'?R.meshVertices(a,matrices,bones.get(slot.bone),animation.deform?.default?.[slot.name]?.[name],t):R.regionVertices(a,matrices[bones.get(slot.bone)]);assert.ok([...v].every(Number.isFinite));}
        }
    }
});
