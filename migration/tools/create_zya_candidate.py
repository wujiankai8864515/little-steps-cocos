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
    helper = """        (globalThis as any).__ZYA_QA__ = true;
        const qaQuery = new URLSearchParams(location.search);
        const fixture = qaQuery.get('fixture');
        let qaRestoring=false,qaRestoreCompleted=false;
"""
    text = text.replace('    start() {','    start() {\n'+helper)
    text = text.replace('        void this.application.start();', """        const app:any=this.application;
        const inspectApp=app.inspect.bind(app);
        const inspectBase=()=>({...inspectApp(),lives:app.page==='battle'&&app.board?app.board.children.filter((n:any)=>n.name.startsWith('lives-')).map((n:any)=>({name:n.name,position:n.position,world:n.worldMatrix,children:n.children.map((child:any)=>{const s=child.getComponent(Sprite),f=s?.spriteFrame,t=child.getComponent(QAUITransform),d=s?.renderData;return {name:child.name,position:child.position,world:child.worldMatrix,size:t?.contentSize,anchor:t?.anchorPoint,trim:s?.trim,sizeMode:s?.sizeMode,color:s?.color,frame:f?{rect:f.rect,original:f.originalSize,offset:f.offset,uv:Array.from(f.uv),packable:f.packable}:null,vertices:d?.chunk?Array.from(d.chunk.vb.slice(0,d.dataLength*d.floatStride)):null};})})):null});
        const inspectVisible=()=>({...inspectBase(),adouRigs:app.page==='battle'&&qaQuery.get('rigs')==='1'?app.rigs.filter((rig:any)=>rig.source.includes('/aDou/')).map((rig:any)=>({time:rig.time,name:rig.name,length:rig.length,clock:rig.simulationClock,clocked:app.battleClocks.includes(rig),parent:rig.root.parent?.name,world:rig.root.worldMatrix,slots:rig.slots.map((slot:any)=>({name:slot.node.name,active:slot.node.active,position:slot.node.position,world:slot.node.worldMatrix,vertices:slot.mesh?Array.from(slot.mesh.vertices):null,uv:slot.mesh?Array.from(slot.mesh.vertexUV):null,color:slot.sprite.color}))})):null,combat:app.battle?{enemies:app.battle.enemies.map((e:any)=>({id:e.id,side:e.side,hp:e.hp,x:e.x,y:e.y})),strikes:app.battle.weaponStrikes||[],shots:app.battle.shots,projectileNodes:Array.from(app.projectiles.entries()).map(([id,node]:any)=>({id,position:node.position,size:node.getComponent(QAUITransform).contentSize,anchor:node.getComponent(QAUITransform).anchorPoint,ready:!!node.getComponent(Sprite)?.spriteFrame,skin:node.__inkSkin}))}:null});
        const inspectControl=(name:string)=>{const e=app.screen&&app.ui.find(name,app.screen),sprite=e?.body.getComponent(Sprite),transform=e?.body.getComponent(QAUITransform);return e?{name,active:e.node.active,visible:e.node.activeInHierarchy,bodyActive:e.body.activeInHierarchy,skin:e.body.__inkSkin,frame:sprite?.spriteFrame?.rect,spriteEnabled:sprite?.enabledInHierarchy,position:e.node.position,world:e.node.worldPosition,bodyWorld:e.body.worldPosition,scale:e.node.scale,bounds:transform?.getBoundingBoxToWorld(),sibling:e.node.getSiblingIndex()}:null;};
        app.inspect=()=>({...inspectVisible(),visibleStars:app.page==='home'?[0,1,2,3,4].map(index=>{const e=app.ui.find('star'+index,app.screen),sprite=e?.body.getComponent(Sprite);return {index,skin:e?.body.__inkSkin,rect:sprite?.spriteFrame?.rect,color:sprite?.color,gray:sprite?.grayscale,visible:e?.node.activeInHierarchy};}):null,homeControls:app.page==='home'?['shopBtn','shopWalk','talkHitArea','mat','weaponBtn'].map(inspectControl):null,heroWeapons:Array.from(app.heroViews.values()).map((view:any)=>{const w=view.weapon;return {hero:view.hero.name,side:view.side,ready:view.ready,weapon:w?{id:w.id,type:w.spec.type,ready:!!w.body.getComponent(Sprite)?.spriteFrame,visible:w.root.activeInHierarchy,angle:w.root.angle,bodyPosition:w.body.position,bodyScale:w.body.scale,size:w.body.getComponent(QAUITransform).contentSize,elapsed:w.motion.time,attacks:w.motion.attacks,sibling:w.parent.getSiblingIndex(),siblings:view.node.children.length}:null};})});
        if(fixture==='home-stars'){app.profile.stars=Number(qaQuery.get('stars')||'2');app.profile.gold=20;app.profile.tutorial=true;}
        if(fixture==='merchant-home'){app.profile.losses=1;app.profile.tutorial=true;app.profile.gold=8623;app.profile.stamina=25;}
        if(fixture==='heroes')app.profile.tutorial=true;
        if(fixture==='shop'||fixture==='lottery') {
            app.profile.gold=8623;app.profile.stamina=25;
            app.profile.items=['trash','range','pill','allSpeed','life','shovel','exorcism','together'];
        }
        if(fixture==='weapons'){app.profile.gold=1000;app.profile.weapons={1:2,11:2,12:1,19:1,21:2,30:2};}
        void app.start().then(async()=>{
            if(fixture==='shop'||fixture==='lottery'){
                app.offers=['recruit','farmer','promotion'].map(id=>ITEMS.find(item=>item.id===id));
                await app.shop(fixture==='lottery'?'lottery':'shop');
            }else if(fixture==='tutorial'){await app.startRound(Number(qaQuery.get('map')||'0'));}
            else if(fixture==='heroes'){
                await app.startRound(1);app.matchTime=999;const battle=app.battle;
                battle.aiTime=100000;battle.spawnTime=100000;battle.waveTime=-100000;
                const level=Math.max(1,Math.min(5,Number(qaQuery.get('level')||'1')));
                for(const side of [0,1]){const army=battle.armies[side],used=new Set<number>();army.units={};army.unlocked=battle.map.grass.filter((cell:number)=>battle.owns(side,cell));
                    for(const hero of HEROES.slice(side*6,side*6+6)){const cell=army.unlocked.find((cell:number)=>cell%8<7&&army.unlocked.includes(cell+1)&&!used.has(cell)&&!used.has(cell+1));if(cell===undefined)throw new Error('Hero fixture requires a legal adjacent pair');used.add(cell);used.add(cell+1);army.units[cell]=battle.unit('字',hero.chars[0],level);army.units[cell+1]=battle.unit('字',hero.chars[1],level);}
                    if(qaQuery.get('attack')==='1')for(let index=1;index<battle.map.paths[side].length-1;index+=3){const pos=battle.position(battle.map.paths[side][index]);battle.enemies.push({id:battle.nextId++,side,progress:index*80,hp:1000000,maxHp:1000000,speed:0,boss:false,slowed:0,x:pos.x,y:pos.y});}
                }
                await app.showBattle();battle.paused=true;
                if(qaQuery.get('attack')==='1'){
                    const startWhenReady=()=>{if(app.art.metrics().admission.pending>0||Array.from(app.heroViews.values()).some((view:any)=>!view.ready||!view.weapon?.body.getComponent(Sprite)?.spriteFrame))return;battle.paused=false;director.off(Director.EVENT_AFTER_DRAW,startWhenReady);};
                    director.on(Director.EVENT_AFTER_DRAW,startWhenReady);
                    const freezeAt=Number(qaQuery.get('freezeAt')||'0');
                    if(Number.isFinite(freezeAt)&&freezeAt>0)director.on(Director.EVENT_AFTER_UPDATE,()=>{if(battle.time<freezeAt)return;battle.paused=true;
                        if(qaQuery.get('restore')==='1'&&!qaRestoring&&!qaRestoreCompleted){qaRestoring=true;const restored=Battle.restore(battle.snapshot(),app.profile,app.art.weapons);if(!restored)throw new Error('QA saved hero round failed restoration');restored.paused=true;app.battle=restored;void app.showBattle().then(()=>{restored.paused=true;qaRestoring=false;qaRestoreCompleted=true;document.documentElement.dataset.zyaRestored='true';});}
                    });
                }
            }
            else if(fixture==='weapons')await app.weapons();
            else if(fixture==='result'){
                await app.startRound(0);app.matchTime=999;app.battle.finish(qaQuery.get('win')==='1');await app.result();
            }else if(fixture==='settings')app.settings();
            if(qaQuery.get('capture')==='1'){
                let captureTime=0;
                director.on(Director.EVENT_AFTER_DRAW,()=>{
                    if(qaRestoring||qaQuery.get('restore')==='1'&&!qaRestoreCompleted)return;
                    if(captureTime===0&&(fixture==='tutorial'&&(app.page!=='battle'||app.revision!==app.battle?.revision)||fixture==='result'&&app.page!=='result'))return;
                    if(captureTime===0&&fixture==='heroes'&&(app.art.metrics().admission.pending>0||Array.from(app.heroViews.values()).some((view:any)=>!view.ready||!view.weapon?.body.getComponent(Sprite)?.spriteFrame)))return;
                    if(captureTime===0&&fixture==='heroes'&&Number(qaQuery.get('freezeAt')||'0')>0&&app.battle.time<Number(qaQuery.get('freezeAt')))return;
                    const now=performance.now();if(now-captureTime<600)return;captureTime=now;
                    const canvas=document.getElementById('GameCanvas') as HTMLCanvasElement;
                    if(canvas){document.documentElement.dataset.zyaPng=canvas.toDataURL('image/png');document.documentElement.dataset.zyaPngState=JSON.stringify(app.inspect());}
                });
            }
        });""")
    text = text.replace('                let captureTime=0;', '                let captureTime=0;let captureRequested=true;input.on(Input.EventType.KEY_DOWN,e=>{if(e.keyCode===KeyCode.F9)captureRequested=true;});')
    text = text.replace('if(now-captureTime<600)return;captureTime=now;', 'if(!captureRequested||now-captureTime<600)return;captureTime=now;captureRequested=false;')
    text = "import { director, Director, input, Input, KeyCode, Sprite, UITransform as QAUITransform } from 'cc';\nimport { Battle, ITEMS, HEROES } from './game/GameModel';\n" + text
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
