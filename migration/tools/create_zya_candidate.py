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
"""
    text = text.replace('    start() {','    start() {\n'+helper)
    text = text.replace('        void this.application.start();', """        const app:any=this.application;
        const inspectVisible=app.inspect.bind(app);
        app.inspect=()=>({...inspectVisible(),visibleStars:app.page==='home'?[0,1,2,3,4].map(index=>{const e=app.ui.find('star'+index,app.screen),sprite=e?.body.getComponent(Sprite);return {index,skin:e?.body.__inkSkin,rect:sprite?.spriteFrame?.rect,color:sprite?.color,gray:sprite?.grayscale,visible:e?.node.activeInHierarchy};}):null});
        if(fixture==='home-stars'){app.profile.stars=Number(qaQuery.get('stars')||'2');app.profile.gold=20;app.profile.tutorial=true;}
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
            else if(fixture==='weapons')await app.weapons();
            else if(fixture==='result'){
                await app.startRound(0);app.matchTime=999;app.battle.finish(qaQuery.get('win')==='1');await app.result();
            }else if(fixture==='settings')app.settings();
            if(qaQuery.get('capture')==='1'){
                let captureTime=0;
                director.on(Director.EVENT_AFTER_DRAW,()=>{
                    if(captureTime===0&&(fixture==='tutorial'&&(app.page!=='battle'||app.revision!==app.battle?.revision)||fixture==='result'&&app.page!=='result'))return;
                    const now=performance.now();if(now-captureTime<600)return;captureTime=now;
                    const canvas=document.getElementById('GameCanvas') as HTMLCanvasElement;
                    if(canvas){document.documentElement.dataset.zyaPng=canvas.toDataURL('image/png');document.documentElement.dataset.zyaPngState=JSON.stringify(app.inspect());}
                });
            }
        });""")
    text = text.replace('                let captureTime=0;', '                let captureTime=0;let captureRequested=true;input.on(Input.EventType.KEY_DOWN,e=>{if(e.keyCode===KeyCode.F9)captureRequested=true;});')
    text = text.replace('if(now-captureTime<600)return;captureTime=now;', 'if(!captureRequested||now-captureTime<600)return;captureTime=now;captureRequested=false;')
    text = "import { director, Director, input, Input, KeyCode, Sprite } from 'cc';\nimport { ITEMS } from './game/GameModel';\n" + text
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
