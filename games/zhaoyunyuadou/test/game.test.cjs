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
const weapons = JSON.parse(fs.readFileSync(path.resolve(__dirname,'../assets/resources/data/weapon.json')));
const now = 1791993600000;
const round = (tutorial=false) => new M.Battle(M.newProfile(now),weapons,0,123456,tutorial);
const location = (area,index) => ({area,index});
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
