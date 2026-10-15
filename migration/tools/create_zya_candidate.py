#!/usr/bin/env python3
"""Freeze and build a declared ZYA browser QA mirror, retaining all evidence."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
CREATOR = '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--name', required=True)
    args = parser.parse_args()
    if not args.name.isascii() or not all(c.isalnum() or c in '-_' for c in args.name):
        parser.error('Invalid candidate name')
    destination = ROOT / 'migration/work' / args.name
    if destination.exists(): raise FileExistsError('Use a new name; retain failed evidence')
    source = ROOT / 'games/zhaoyunyuadou'
    project = destination / 'games/zhaoyunyuadou'
    shutil.copytree(source,project,symlinks=True,ignore=shutil.ignore_patterns('.git','library','temp','local','build','profiles','node_modules','.creator'))
    framework = destination / 'engines/travel-core/dist'
    framework.mkdir(parents=True)
    shutil.copyfile(ROOT / 'engines/travel-core/dist/travel-core.js',framework / 'travel-core.js')
    os.chmod(framework / 'travel-core.js',0o444);os.chmod(framework,0o555)
    boot = project / 'assets/Boot.ts'
    before = hashlib.sha256(boot.read_bytes()).hexdigest()
    text = boot.read_text(encoding='utf-8')
    text = "import { HERO_SKILLS } from './game/ReferenceHeroSkills';\n"+text
    helper = """        (globalThis as any).__ZYA_QA__ = true;
        const qaQuery = new URLSearchParams(location.search);
        const fixture = qaQuery.get('fixture');
        let qaRestoring=false,qaRestoreCompleted=false,qaCrossbowFrozen=false;
"""
    text = text.replace('    start() {','    start() {\n'+helper)
    text = text.replace('        void this.application.start();', """        const app:any=this.application;
        const inspectApp=app.inspect.bind(app);
        const inspectBase=()=>({...inspectApp(),lives:app.page==='battle'&&app.board?app.board.children.filter((n:any)=>n.name.startsWith('lives-')).map((n:any)=>({name:n.name,position:n.position,world:n.worldMatrix,children:n.children.map((child:any)=>{const s=child.getComponent(Sprite),f=s?.spriteFrame,t=child.getComponent(QAUITransform),d=s?.renderData;return {name:child.name,position:child.position,world:child.worldMatrix,size:t?.contentSize,anchor:t?.anchorPoint,trim:s?.trim,sizeMode:s?.sizeMode,color:s?.color,frame:f?{rect:f.rect,original:f.originalSize,offset:f.offset,uv:Array.from(f.uv),packable:f.packable}:null,vertices:d?.chunk?Array.from(d.chunk.vb.slice(0,d.dataLength*d.floatStride)):null};})})):null});
        const inspectVisible=()=>({...inspectBase(),overlayElements:app.overlayUI?app.overlayUI.elements.filter((e:any)=>['shopBg','shopMan','xBtn','shopLabel','lotteryLabel','list','btn','price','introduce','propsBox','goldBg','staminaBg','Text_1','confirmBtn','cancelBtn','title','power','speed','lvlTip','expNum','expBar'].includes(e.definition.name)).map((e:any)=>({name:e.definition.name,parent:e.node.parent?.parent?.name,active:e.node.activeInHierarchy,skin:e.body.__inkSkin,position:e.node.position,size:e.body.getComponent(QAUITransform)?.contentSize,world:e.node.worldMatrix,bounds:e.body.getComponent(QAUITransform)?.getBoundingBoxToWorld(),text:e.body.getComponent(Label)?.string})):null,adouRigs:app.page==='battle'&&qaQuery.get('rigs')==='1'?app.rigs.filter((rig:any)=>rig.source.includes('/aDou/')).map((rig:any)=>({time:rig.time,name:rig.name,length:rig.length,clock:rig.simulationClock,clocked:app.battleClocks.includes(rig),parent:rig.root.parent?.name,world:rig.root.worldMatrix,slots:rig.slots.map((slot:any)=>({name:slot.node.name,active:slot.node.active,position:slot.node.position,world:slot.node.worldMatrix,vertices:slot.mesh?Array.from(slot.mesh.vertices):null,uv:slot.mesh?Array.from(slot.mesh.vertexUV):null,color:slot.sprite.color}))})):null,combat:app.battle?{enemies:app.battle.enemies.map((e:any)=>({id:e.id,side:e.side,hp:e.hp,x:e.x,y:e.y,held:e.held,burn:e.burn,push:e.push,rejoin:e.rejoin})),drawOrder:app.combatLayer?.children.map((node:any)=>({name:node.name,position:node.position,angle:node.angle,scale:node.scale})),skills:app.battle.heroSkills||[],skillNodes:Array.from(app.skillViews.entries()).map(([id,view]:any)=>({id,name:view.node.name,active:view.node.activeInHierarchy,position:view.node.position,scale:view.node.scale,rig:view.rig?{time:view.rig.time,name:view.rig.name}:null,rings:view.node.children.filter((node:any)=>node.name.startsWith('ring')).map((node:any)=>({name:node.name,scale:node.scale,ready:!!node.getComponent(Sprite)?.spriteFrame}))})),strikes:app.battle.weaponStrikes||[],shots:app.battle.shots,dragonFires:app.battle.dragonFires,effects:app.battle.effects,enemyNodes:Array.from(app.mobs.entries()).map(([id,node]:any)=>({id,glyphPosition:node.getChildByName('mob-glyph')?.position,glyphScale:node.getChildByName('mob-glyph')?.scale,glyphAngle:node.getChildByName('mob-glyph')?.angle,burn:node.getChildByName('arrow-burn')?{skin:node.getChildByName('arrow-burn').__inkSkin,scale:node.getChildByName('arrow-burn').scale,active:node.getChildByName('arrow-burn').activeInHierarchy}:null})),groundPikeNodes:Array.from(app.effects.entries()).filter(([id,node]:any)=>node.name.startsWith('ground-pike-')).map(([id,node]:any)=>({id,position:node.position,active:node.activeInHierarchy,opacity:node.getComponent(UIOpacity)?.opacity,spikes:node.children.map((child:any)=>({position:child.position,scale:child.scale,angle:child.angle,ready:!!child.getComponent(Sprite)?.spriteFrame}))})),projectileNodes:Array.from(app.projectiles.entries()).map(([id,node]:any)=>({id,parts:node.name.startsWith('fire-dragon-')?node.children.map((part:any)=>({name:part.name,active:part.activeInHierarchy,position:part.position,angle:part.angle,scale:part.scale,size:part.getComponent(QAUITransform).contentSize,images:part.children.map((child:any)=>({skin:child.__inkSkin,ready:!!child.getComponent(Sprite)?.spriteFrame,position:child.position,size:child.getComponent(QAUITransform).contentSize}))})):undefined,position:node.position,size:node.getComponent(QAUITransform).contentSize,anchor:node.getComponent(QAUITransform).anchorPoint,ready:!!node.getComponent(Sprite)?.spriteFrame,skin:node.__inkSkin,scale:node.scale,opacity:node.getComponent(UIOpacity)?.opacity,flash:node.getChildByName('eagle-hit')?.activeInHierarchy,ring:node.getChildByName('flying-pike-ring')?{skin:node.getChildByName('flying-pike-ring').__inkSkin,opacity:node.getChildByName('flying-pike-ring').getComponent(UIOpacity)?.opacity}:null}))}:null});
        const inspectActorNode=(node:any)=>{if(!node)return null;const t=node.getComponent(QAUITransform),sprite=node.getComponent(Sprite),label=node.getComponent(Label),ld=label?.renderData,f=sprite?.spriteFrame,d=sprite?.renderData;return {name:node.name,valid:node.isValid,active:node.active,visible:node.activeInHierarchy,layer:node.layer,position:node.position,scale:node.scale,world:node.worldMatrix,anchor:t?.anchorPoint,size:t?.contentSize,bounds:t?.getBoundingBoxToWorld(),opacity:node.getComponent(UIOpacity)?.opacity,label:label?{text:label.string,stencilStage:label.stencilStage,indexCount:ld?.indexCount,dataHash:ld?.dataHash,textureHash:ld?.textureHash,renderFlag:label._renderFlag}:null,sprite:sprite?{enabled:sprite.enabled,renderFlag:sprite._renderFlag,stencilStage:sprite.stencilStage,indexCount:d?.indexCount,vertexCount:d?.vertexCount,dataHash:d?.dataHash,color:sprite.color,trim:sprite.trim,frame:f?{rect:f.rect,original:f.originalSize,offset:f.offset,packable:f.packable,textureWidth:f.texture?.width,textureHeight:f.texture?.height}:null,vertices:d?.chunk?Array.from(d.chunk.vb.slice(0,d.dataLength*d.floatStride)):null}:null};};
        const inspectActor=(view:any)=>{const ancestors=[];for(let node=view.node.parent;node&&ancestors.length<10;node=node.parent)ancestors.push(inspectActorNode(node));return {unit:view.unit,node:inspectActorNode(view.node),glyph:inspectActorNode(view.glyph),level:inspectActorNode(view.level),motion:inspectActorNode(view.motion),frame:view.frame?{kind:view.frame.kind,clip:view.frame.clip,elapsed:view.frame.elapsed,seenAttacks:view.frame.seenAttacks}:null,ancestors};};
        const inspectControl=(name:string)=>{const e=app.screen&&app.ui.find(name,app.screen),sprite=e?.body.getComponent(Sprite),transform=e?.body.getComponent(QAUITransform);return e?{name,active:e.node.active,visible:e.node.activeInHierarchy,bodyActive:e.body.activeInHierarchy,skin:e.body.__inkSkin,frame:sprite?.spriteFrame?.rect,spriteEnabled:sprite?.enabledInHierarchy,position:e.node.position,world:e.node.worldPosition,bodyWorld:e.body.worldPosition,scale:e.node.scale,bounds:transform?.getBoundingBoxToWorld(),sibling:e.node.getSiblingIndex()}:null;};
        app.inspect=()=>({...inspectVisible(),permanentBuffs:fixture==='buffs'&&app.battle?{progress:app.battle.heroProgress,boosts:app.battle.boosts,ranges:app.battle.ranges,cooldowns:app.battle.cooldowns,stats:app.battle.heroes(0).flatMap((link:any)=>[link.left,link.right].map(cell=>{const stats=app.battle.stats(app.battle.armies[0].units[cell],link.hero,link.level);return {name:link.hero.name,cell,interval:stats.interval,range:stats.range};}))}:null,renderProbes:qaQuery.get('actors')==='1'?{guide:inspectActorNode(app.tutorial),mask:inspectActorNode(app.screen&&app.ui.find('maskImg',app.screen)?.body)}:null,basicActors:qaQuery.get('actors')==='1'?Array.from(app.actors.values()).map(inspectActor):null,visibleStars:app.page==='home'?[0,1,2,3,4].map(index=>{const e=app.ui.find('star'+index,app.screen),sprite=e?.body.getComponent(Sprite);return {index,skin:e?.body.__inkSkin,rect:sprite?.spriteFrame?.rect,color:sprite?.color,gray:sprite?.grayscale,visible:e?.node.activeInHierarchy};}):null,homeControls:app.page==='home'?['shopBtn','shopWalk','talkHitArea','mat','weaponBtn'].map(inspectControl):null,heroWeapons:Array.from(app.heroViews.values()).map((view:any)=>{const w=view.weapon;return {hero:view.hero.name,side:view.side,ready:view.ready,weapon:w?{id:w.id,type:w.spec.type,ready:!!w.body.getComponent(Sprite)?.spriteFrame,visible:w.root.activeInHierarchy,angle:w.root.angle,bodyPosition:w.body.position,bodyScale:w.body.scale,size:w.body.getComponent(QAUITransform).contentSize,nocked:w.nocked?{active:w.nocked.activeInHierarchy,skin:w.nocked.__inkSkin,size:w.nocked.getComponent(QAUITransform).contentSize,anchor:w.nocked.getComponent(QAUITransform).anchorPoint,position:w.nocked.position,overlay:w.nocked.getChildByName('crossbow-nocked-arrow')?.activeInHierarchy}:null,elapsed:w.motion.time,attacks:w.motion.attacks,sibling:w.parent.getSiblingIndex(),siblings:view.node.children.length}:null};})});
        if(qaQuery.get('probeNoGuide')==='1'||qaQuery.get('probeNoRecruitMask')==='1'||qaQuery.get('probeGuideBehindUnits')==='1')director.on(Director.EVENT_AFTER_UPDATE,()=>{
            if(app.page!=='battle')return;
            if(qaQuery.get('probeNoGuide')==='1'&&app.tutorial)app.tutorial.active=false;
            if(qaQuery.get('probeGuideBehindUnits')==='1'&&app.tutorial&&app.tutorial.parent!==app.board){const map=app.ui.find('map',app.screen);app.tutorial.setParent(app.board);app.tutorial.setPosition(15,-294+(map?.definition.y||200));}
            if(qaQuery.get('probeNoRecruitMask')==='1'){const e=app.ui.find('maskImg',app.screen);if(e)e.node.active=false;}
        });
        if(fixture==='home-stars'){app.profile.stars=Number(qaQuery.get('stars')||'2');app.profile.gold=20;app.profile.tutorial=true;}
        if(fixture==='merchant-home'){app.profile.losses=1;app.profile.tutorial=true;app.profile.gold=8623;app.profile.stamina=25;}
        if(fixture==='heroes'||fixture==='growth'||fixture==='buffs'||fixture==='pikes'||fixture==='birds'||fixture==='crossbow'||fixture==='dragon')app.profile.tutorial=true;
        if(fixture==='buffs')app.profile.items=['speed','range'];
        if(fixture==='shop'||fixture==='lottery') {
            app.profile.gold=8623;app.profile.stamina=25;
            app.profile.items=['trash','range','pill','allSpeed','life','shovel','exorcism','together'];
        }
        if(fixture==='weapons'){app.profile.gold=1000;app.profile.weapons={1:2,11:2,12:1,19:1,21:2,30:2};}
        void app.start().then(async()=>{
            if(fixture==='shop'||fixture==='lottery'){
                app.offers=['recruit','farmer','promotion'].map(id=>ITEMS.find(item=>item.id===id));
                await app.shop(fixture==='lottery'?'lottery':'shop');
                // Declared raster-quality experiment, only in this QA mirror.
                // It preserves each label's displayed bounds and font family.
                if(qaQuery.get('textRaster')==='2')for(const e of app.overlayUI.elements){
                    const label=e.body.getComponent(Label);if(!label||e.body.children.length)continue;
                    const transform=e.body.getComponent(QAUITransform),size=transform.contentSize;
                    transform.setContentSize(size.width*2,size.height*2);e.body.setScale(.5,.5);
                    label.fontSize*=2;label.lineHeight*=2;label.outlineWidth*=2;
                }
            }else if(fixture==='tutorial'){await app.startRound(Number(qaQuery.get('map')||'0'));}
            else if(fixture==='crossbow'){
                app.profile.equipped={'黄忠':9};app.profile.weapons={9:1};app.profile.items=[];
                await app.startRound(1);app.matchTime=999;const battle=app.battle;
                battle.aiTime=battle.spawnTime=100000;battle.waveTime=-100000;battle.tutorialStep=0;battle.armies[1].units={};
                battle.armies[0].units={40:battle.unit('字','黄'),41:battle.unit('字','忠')};battle.armies[0].unlocked=battle.map.grass.filter((cell:number)=>battle.owns(0,cell));battle.armies[0].reserve=[null,null,null,null,null];
                const unit=battle.armies[0].units[40],path=battle.map.paths[0];battle.heroes(0);battle.random.state=1;
                const indices=qaQuery.get('targets')==='sparse'?Array.from(new Set(Array.from({length:6},(_,i)=>1+Math.floor(i*(path.length-3)/5)))):Array.from({length:path.length-2},(_,i)=>i+1);
                for(const i of indices){const p=battle.position(path[i]);battle.enemies.push({id:battle.nextId++,side:0,progress:i*80,hp:100000,maxHp:100000,speed:0,boss:false,slowed:0,x:p.x,y:p.y});}
                const phase=Number(qaQuery.get('phase')||'.7'),advance=battle.advance.bind(battle);
                // Natural ten-attack charge; only cap the final QA capture step.
                battle.advance=(dt:number)=>advance(unit.crossbowVolley?Math.min(dt,Math.max(0,unit.crossbowVolley.born+phase-battle.time)):dt);
                await app.showBattle();
                director.on(Director.EVENT_AFTER_UPDATE,()=>{const volley=unit.crossbowVolley;if(!volley||battle.time+1e-8<volley.born+phase)return;battle.paused=true;qaCrossbowFrozen=true;
                    if(qaQuery.get('restore')==='1'&&!qaRestoring&&!qaRestoreCompleted){qaRestoring=true;const restored=Battle.restore(battle.snapshot(),app.profile,app.art.weapons);if(!restored)throw new Error('QA crossbow restoration failed');restored.paused=true;app.battle=restored;void app.showBattle().then(()=>{restored.paused=true;qaRestoring=false;qaRestoreCompleted=true;document.documentElement.dataset.zyaRestored='true';});}
                });
            }
            else if(fixture==='dragon'){
                app.profile.equipped={'黄忠':5};app.profile.weapons={5:1};app.profile.items=[];
                await app.startRound(1);app.matchTime=999;const battle=app.battle;
                battle.aiTime=battle.spawnTime=100000;battle.waveTime=-100000;battle.tutorialStep=0;battle.armies[1].units={};
                battle.armies[0].units={40:battle.unit('字','黄',5),41:battle.unit('字','忠',5)};
                battle.armies[0].unlocked=battle.map.grass.filter((cell:number)=>battle.owns(0,cell));battle.armies[0].reserve=[null,null,null,null,null];
                const link=battle.heroes(0)[0],unit=battle.armies[0].units[link.left],path=battle.map.paths[0];
                for(let i=1;i<path.length-1;i++){const p=battle.position(path[i]);battle.enemies.push({id:battle.nextId++,side:0,progress:i*80,hp:100000,maxHp:100000,speed:0,boss:false,slowed:0,x:p.x,y:p.y});}
                const stats=battle.stats(unit,link.hero,link.level),pos=battle.position(link.left);pos.x+=40;unit.attacks=1;unit.weaponAt=0;unit.weaponRate=stats.weaponRate;unit.cooldown=unit.weaponUntil=100000;battle.random.state=1;
                battle.weaponAttack(unit,0,battle.enemies[0],pos,stats,link.hero,link.left);
                const freezeAt=Number(qaQuery.get('freezeAt')||'1.6'),advance=battle.advance.bind(battle);battle.advance=(dt:number)=>advance(Math.min(dt,Math.max(0,freezeAt-battle.time)));
                await app.showBattle();director.on(Director.EVENT_AFTER_UPDATE,()=>{if(battle.time+1e-8<freezeAt)return;battle.paused=true;
                    if(qaQuery.get('restore')==='1'&&!qaRestoring&&!qaRestoreCompleted){qaRestoring=true;const restored=Battle.restore(battle.snapshot(),app.profile,app.art.weapons);if(!restored)throw new Error('QA fire dragon restoration failed');restored.paused=true;app.battle=restored;void app.showBattle().then(()=>{restored.paused=true;qaRestoring=false;qaRestoreCompleted=true;document.documentElement.dataset.zyaRestored='true';});}
                });
            }
            else if(fixture==='birds'){
                app.profile.equipped={'黄忠':4,'黄祖':8};app.profile.weapons={4:1,8:1};app.profile.items=[];
                await app.startRound(1);app.matchTime=999;const battle=app.battle;
                battle.aiTime=battle.spawnTime=100000;battle.waveTime=-100000;battle.tutorialStep=0;battle.armies[1].units={};
                battle.armies[0].units={40:battle.unit('字','黄'),41:battle.unit('字','忠'),42:battle.unit('字','黄'),43:battle.unit('字','祖')};
                battle.armies[0].unlocked=battle.map.grass.filter((cell:number)=>battle.owns(0,cell));battle.armies[0].reserve=[null,null,null,null,null];
                const links=battle.heroes(0),path=battle.map.paths[0],indices=Array.from(new Set(Array.from({length:6},(_,i)=>1+Math.floor(i*(path.length-3)/5))));
                for(const index of indices){const p=battle.position(path[index]);battle.enemies.push({id:battle.nextId++,side:0,progress:index*80,hp:100000,maxHp:100000,speed:0,boss:false,slowed:0,x:p.x,y:p.y});}
                battle.random.state=1;
                for(const link of links){const unit=battle.armies[0].units[link.left],stats=battle.stats(unit,link.hero,link.level),pos=battle.position(link.left);pos.x+=40;unit.attacks=1;unit.weaponAt=0;unit.weaponRate=stats.weaponRate;unit.cooldown=unit.weaponUntil=100000;battle.weaponAttack(unit,0,battle.enemies[0],pos,stats,link.hero,link.left);}
                await app.showBattle();const freezeAt=Number(qaQuery.get('freezeAt')||'.7');
                director.on(Director.EVENT_AFTER_UPDATE,()=>{if(battle.time+1e-8<freezeAt)return;battle.paused=true;
                    if(qaQuery.get('restore')==='1'&&!qaRestoring&&!qaRestoreCompleted){qaRestoring=true;const restored=Battle.restore(battle.snapshot(),app.profile,app.art.weapons);if(!restored)throw new Error('QA bird restoration failed');restored.paused=true;app.battle=restored;void app.showBattle().then(()=>{restored.paused=true;qaRestoring=false;qaRestoreCompleted=true;document.documentElement.dataset.zyaRestored='true';});}
                });
            }
            else if(fixture==='pikes'){
                app.profile.equipped={'赵云':19,'马超':17,'张苞':12};app.profile.weapons={19:1,17:1,12:1};app.profile.items=[];
                await app.startRound(1);app.matchTime=999;const battle=app.battle;
                battle.aiTime=battle.spawnTime=100000;battle.waveTime=-100000;battle.tutorialStep=0;battle.armies[1].units={};
                battle.armies[0].units={40:battle.unit('字','赵'),41:battle.unit('字','云'),42:battle.unit('字','马'),43:battle.unit('字','超'),58:battle.unit('字','张'),59:battle.unit('字','苞')};
                battle.armies[0].unlocked=battle.map.grass.filter((cell:number)=>battle.owns(0,cell));battle.armies[0].reserve=[null,null,null,null,null];
                const links=battle.heroes(0),path=battle.map.paths[0],indices=Array.from(new Set(Array.from({length:6},(_,i)=>1+Math.floor(i*(path.length-3)/5))));for(const index of indices){const p=battle.position(battle.map.paths[0][index]);battle.enemies.push({id:battle.nextId++,side:0,progress:index*80,hp:100000,maxHp:100000,speed:0,boss:false,slowed:0,x:p.x,y:p.y});}
                const hit=(name:string,id:number,target:any)=>{const link=links.find((h:any)=>h.hero.name===name),unit=battle.armies[0].units[link.left];battle.random.state=1;battle.weaponHit({id:0,side:0,from:unit.id,target:target.id,x:target.x,y:target.y,damage:battle.stats(unit,link.hero,link.level).power,speed:0,kind:'melee',splash:0,weaponId:id,hero:name,heroId:link.id},target);};
                hit('马超',17,battle.enemies[0]);hit('张苞',12,battle.enemies.find((enemy:any)=>!battle.effects.some((e:any)=>e.piercing?.target===enemy.id)));
                for(const link of links){const unit=battle.armies[0].units[link.left];unit.cooldown=unit.weaponUntil=100000;}
                const zhao=links.find((h:any)=>h.hero.name==='赵云'),unit=battle.armies[0].units[zhao.left],stats=battle.stats(unit,zhao.hero,zhao.level),pos=battle.position(zhao.left);pos.x+=40;
                unit.attacks=1;unit.weaponAt=0;unit.weaponRate=stats.weaponRate;battle.random.state=1;
                battle.weaponAttack(unit,0,battle.enemies.slice().sort((a:any,b:any)=>Math.hypot(a.x-pos.x,a.y-pos.y)-Math.hypot(b.x-pos.x,b.y-pos.y))[0],pos,stats,zhao.hero,zhao.left);
                await app.showBattle();const freezeAt=Number(qaQuery.get('freezeAt')||'.2');
                director.on(Director.EVENT_AFTER_UPDATE,()=>{if(battle.time+1e-8<freezeAt)return;battle.paused=true;
                    if(qaQuery.get('restore')==='1'&&!qaRestoring&&!qaRestoreCompleted){qaRestoring=true;const restored=Battle.restore(battle.snapshot(),app.profile,app.art.weapons);if(!restored)throw new Error('QA pike restoration failed');restored.paused=true;app.battle=restored;void app.showBattle().then(()=>{restored.paused=true;qaRestoring=false;qaRestoreCompleted=true;document.documentElement.dataset.zyaRestored='true';});}
                });
            }
            else if(fixture==='buffs'&&qaQuery.get('resume')==='1'){
                // Keep the normal saved-round prompt for a real continue click.
            }
            else if(fixture==='buffs'){
                await app.startRound(1);app.matchTime=999;const battle=app.battle;
                battle.aiTime=battle.spawnTime=100000;battle.waveTime=-100000;battle.random.state=0x5a5941;battle.tutorialStep=0;battle.armies[1].units={};
                battle.armies[0].units={40:battle.unit('字','赵'),41:battle.unit('字','云'),42:battle.unit('字','黄'),43:battle.unit('字','忠')};
                battle.armies[0].unlocked=battle.map.grass.filter((cell:number)=>battle.owns(0,cell));
                const incoming=battle.unit('字','云');battle.boosts[incoming.id]=.4;
                battle.armies[0].reserve=[incoming,battle.unit('农'),battle.unit('弓'),null,null];
                battle.heroes(0);await app.showBattle();
            }
            else if(fixture==='growth'&&qaQuery.get('resume')==='1'){
                // Retain the normal saved-round prompt for a real UI click.
            }
            else if(fixture==='growth'){
                await app.startRound(1);app.matchTime=999;const battle=app.battle;
                battle.aiTime=battle.spawnTime=100000;battle.waveTime=-100000;battle.random.state=0x5a5941;battle.tutorialStep=0;battle.armies[1].units={};
                battle.armies[0].units={40:battle.unit('字','赵',3),41:battle.unit('字','云',3),42:battle.unit('字','关'),43:battle.unit('字','平')};
                battle.armies[0].unlocked=battle.map.grass.filter((cell:number)=>battle.owns(0,cell));
                battle.armies[0].reserve=[battle.unit('字','赵',5),battle.unit('字','云'),battle.unit('字','关',5),battle.unit('字','平'),battle.unit('字','赵')];
                battle.heroes(0);await app.showBattle();
            }
            else if(fixture==='heroes'){
                await app.startRound(1);app.matchTime=999;const battle=app.battle;
                battle.aiTime=100000;battle.spawnTime=100000;battle.waveTime=-100000;battle.random.state=0x5a5941;
                const level=Math.max(1,Math.min(5,Number(qaQuery.get('level')||'1')));
                for(const side of [0,1]){const army=battle.armies[side],used=new Set<number>();army.units={};army.unlocked=battle.map.grass.filter((cell:number)=>battle.owns(side,cell));
                    for(const hero of HEROES.slice(side*6,side*6+6)){const cell=army.unlocked.find((cell:number)=>cell%8<7&&army.unlocked.includes(cell+1)&&!used.has(cell)&&!used.has(cell+1));if(cell===undefined)throw new Error('Hero fixture requires a legal adjacent pair');used.add(cell);used.add(cell+1);army.units[cell]=battle.unit('字',hero.chars[0],level);army.units[cell+1]=battle.unit('字',hero.chars[1],level);}
                    if(qaQuery.get('skills')==='1')for(const link of battle.heroes(side)){const spec=HERO_SKILLS[link.hero.name];army.units[link.left].skillCount=Math.max(0,spec.every-(spec.before?0:1));}
                    if(qaQuery.get('attack')==='1')for(let index=1;index<battle.map.paths[side].length-1;index+=3){const pos=battle.position(battle.map.paths[side][index]);battle.enemies.push({id:battle.nextId++,side,progress:index*80,hp:1000000,maxHp:1000000,speed:0,boss:false,slowed:0,x:pos.x,y:pos.y});}
                }
                await app.showBattle();battle.paused=true;
                if(qaQuery.get('attack')==='1'){
                    const startWhenReady=()=>{if(app.art.metrics().admission.pending>0||Array.from(app.heroViews.values()).some((view:any)=>!view.ready||!view.weapon?.body.getComponent(Sprite)?.spriteFrame))return;battle.paused=false;director.off(Director.EVENT_AFTER_DRAW,startWhenReady);};
                    director.on(Director.EVENT_AFTER_DRAW,startWhenReady);
                    const freezeAt=Number(qaQuery.get('freezeAt')||'0');
                    if(Number.isFinite(freezeAt)&&freezeAt>0)director.on(Director.EVENT_AFTER_UPDATE,()=>{if(battle.time+1e-8<freezeAt)return;battle.paused=true;
                        if(qaQuery.get('restore')==='1'&&!qaRestoring&&!qaRestoreCompleted){qaRestoring=true;const restored=Battle.restore(battle.snapshot(),app.profile,app.art.weapons);if(!restored)throw new Error('QA saved hero round failed restoration');restored.paused=true;app.battle=restored;void app.showBattle().then(()=>{restored.paused=true;qaRestoring=false;qaRestoreCompleted=true;document.documentElement.dataset.zyaRestored='true';});}
                    });
                }
            }
            else if(fixture==='weapons')await app.weapons();
            else if(fixture==='result'){
                await app.startRound(0);app.matchTime=999;app.battle.finish(qaQuery.get('win')==='1');await app.result();
            }else if(fixture==='settings')app.settings();
            if(qaQuery.get('capture')==='1'){
                let captureTime=0;let qaCaptureBusy=false;let qaReadyFrames=0;let qaCaptureSerial=0;
                director.on(Director.EVENT_AFTER_DRAW,()=>{
                    if(qaCaptureBusy)return;
                    if(fixture==='crossbow'&&!qaCrossbowFrozen)return;
                    if(app.art.metrics().admission.pending>0){qaReadyFrames=0;return;}
                    if(++qaReadyFrames<3)return;
                    if(qaRestoring||qaQuery.get('restore')==='1'&&!qaRestoreCompleted)return;
                    if(captureTime===0&&(fixture==='tutorial'&&(app.page!=='battle'||app.revision!==app.battle?.revision)||fixture==='result'&&app.page!=='result'))return;
                    if(captureTime===0&&fixture==='heroes'&&(app.art.metrics().admission.pending>0||Array.from(app.heroViews.values()).some((view:any)=>!view.ready||!view.weapon?.body.getComponent(Sprite)?.spriteFrame)||Array.from(app.skillViews.values()).some((view:any)=>view.node.name.startsWith('skill-phantom')&&!view.rig)))return;
                    if(captureTime===0&&fixture==='heroes'&&Number(qaQuery.get('freezeAt')||'0')>0&&app.battle.time+1e-8<Number(qaQuery.get('freezeAt')))return;
                    if(captureTime===0&&(fixture==='pikes'||fixture==='birds')&&app.battle.time+1e-8<Number(qaQuery.get('freezeAt')||'.2'))return;
                    const now=performance.now();if(now-captureTime<600)return;captureTime=now;
                    const canvas=document.getElementById('GameCanvas') as HTMLCanvasElement;
                    if(canvas&&qaQuery.get('captureRT')==='1'){
                        const camera=this.node.getComponent(Canvas)?.cameraComponent;if(!camera)throw new Error('QA Canvas camera missing');
                        const texture=new RenderTexture(),width=canvas.width,height=canvas.height;texture.reset({name:'QA complete scene',width,height});
                        const previousTarget=camera.targetTexture,wasSuspended=app.suspended;qaCaptureBusy=true;app.suspended=true;camera.targetTexture=texture;
                        const cleanup=()=>{camera.targetTexture=previousTarget;app.suspended=wasSuspended;qaCaptureBusy=false;texture.destroy();};
                        // Submit a full frame to an explicit framebuffer, then
                        // read it before the following frame can overwrite it.
                        director.once(Director.EVENT_BEFORE_DRAW,()=>director.once(Director.EVENT_AFTER_DRAW,()=>director.once(Director.EVENT_BEFORE_DRAW,()=>{
                            try{
                                const pixels=texture.readPixels(0,0,width,height);if(!pixels)throw new Error('QA render texture readPixels failed');
                                const output=document.createElement('canvas');output.width=width;output.height=height;const context=output.getContext('2d')!;
                                const bitmap=context.createImageData(width,height),row=width*4,flip=qaQuery.get('rtFlip')!=='0';
                                for(let y=0;y<height;y++){const source=flip?height-y-1:y;bitmap.data.set(pixels.subarray(source*row,(source+1)*row),y*row);}context.putImageData(bitmap,0,0);
                                document.documentElement.dataset.zyaPng=output.toDataURL('image/png');document.documentElement.dataset.zyaPngState=JSON.stringify({...app.inspect(),qaCapture:{method:'render-texture',width,height,flip,fullFrameWait:true,serial:++qaCaptureSerial,at:performance.now(),readyFrames:qaReadyFrames}});
                            }catch(error){document.documentElement.dataset.zyaCaptureError=String(error);console.error('[ZYA QA] full capture',error);}finally{cleanup();}
                        })));
                    }else if(canvas){document.documentElement.dataset.zyaPng=canvas.toDataURL('image/png');document.documentElement.dataset.zyaPngState=JSON.stringify({...app.inspect(),qaCapture:{method:'canvas-after-draw',serial:++qaCaptureSerial,at:performance.now(),readyFrames:qaReadyFrames}});} 
                });
            }
        });""")
    text = text.replace('                let captureTime=0;let qaCaptureBusy=false;', """                let captureTime=0;let qaCaptureBusy=false;let captureRequested=true;input.on(Input.EventType.KEY_DOWN,e=>{if(e.keyCode===KeyCode.F9)captureRequested=true;});
                if(qaQuery.get('captureButton')==='1'){const button=document.createElement('button');button.textContent='抓取验证帧';button.id='zya-qa-capture';button.style.cssText='position:fixed;right:0;bottom:0;z-index:2147483647;font-size:10px';button.onclick=()=>{captureRequested=true;document.documentElement.dataset.zyaCaptureRequested=String(performance.now());};document.body.appendChild(button);}
""")
    text = text.replace('if(now-captureTime<600)return;captureTime=now;', 'if(!captureRequested||now-captureTime<600)return;captureTime=now;captureRequested=false;')
    text = "import { Canvas, RenderTexture, director, Director, input, Input, KeyCode, Label, Sprite, UIOpacity, UITransform as QAUITransform } from 'cc';\nimport { Battle, ITEMS, HEROES } from './game/GameModel';\n" + text
    boot.write_text(text,encoding='utf-8')
    app_path = project / 'assets/game/GameApp.ts'
    app_text=app_path.read_text(encoding='utf-8')
    for original,suffix in [('zya.cocos.profile.v1','profile.v1'),('zya.cocos.round.v1','round.v1')]:
        app_text=app_text.replace("'"+original+"'", "'zya.qa."+args.name+".'+(new URLSearchParams(location.search).get('fixture')||'flow')+'-'+(new URLSearchParams(location.search).get('map')||'')+'-'+(new URLSearchParams(location.search).get('win')||'')+'."+suffix+"'")
    app_path.write_text(app_text,encoding='utf-8')
    config = {'platform':'web-mobile','name':'ZYA QA candidate','outputName':'preview','buildPath':str(destination/'output'),
              'startScene':'be5c944f-c8e2-49aa-9330-2704b04f05c9','debug':True,'md5Cache':False,'sourceMaps':True,
              'packages':{'web-mobile':{'orientation':'portrait'}}}
    config_path = destination / 'build-config.json'
    config_path.write_text(json.dumps(config,indent=2)+'\n')
    (destination/'preview.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>赵云与阿斗 · Cocos 预览</title><style>html,body{margin:0;width:100%;height:100%;background:#171615}body{display:grid;place-items:center}iframe{border:0;width:min(100vw,calc(100vh * 320 / 704));height:min(100vh,calc(100vw * 704 / 320))}</style><iframe title="赵云与阿斗" src="./output/preview/"></iframe>',encoding='utf-8')
    files = [{'path':p.relative_to(source).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(source.rglob('*')) if p.is_file() and not any(s in p.relative_to(source).parts for s in ['.git','library','temp','local','build','profiles','.creator'])]
    evidence = ROOT / 'migration/reviews/zhaoyunyuadou' / (args.name+'.json')
    evidence.parent.mkdir(parents=True,exist_ok=True)
    manifest = {'name':args.name,'kind':'browser QA candidate, not formal release','creator':'3.8.8','files':files,
                'overrides':[{'file':'assets/Boot.ts','sourceSHA256':before,'purpose':'Declared QA inspection including visible home-star skins/UVs, optional fixed-state fixture and paired actual-canvas/state capture; original runtime not executed'},
                             {'file':'assets/game/GameApp.ts','purpose':'Isolated QA storage namespace; production saves untouched'}],
                'build':'pending','visual':'pending','wechatDevice':'pending','startScene':config['startScene']}
    evidence.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    log = evidence.with_suffix('.log');start = time.monotonic()
    with log.open('w') as handle:
        result = subprocess.run([CREATOR,'--project',str(project),'--build','configPath='+str(config_path)],stdout=handle,stderr=subprocess.STDOUT,cwd=ROOT)
    importer_failure = 'Importer exec failed' in log.read_text(errors='replace')
    passed = result.returncode in (0,36) and not importer_failure and (destination/'output/preview/index.html').is_file()
    manifest.update(build='pass' if passed else 'fail',returnCode=result.returncode,assetImports='fail' if importer_failure else 'pass',seconds=time.monotonic()-start,log=str(log),output=str(destination/'output/preview'))
    evidence.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in manifest.items() if k not in ['files','overrides']},ensure_ascii=False))
    raise SystemExit(0 if passed else 1)


if __name__ == '__main__': main()
