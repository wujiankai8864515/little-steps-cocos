#!/usr/bin/env python3
"""Freeze a local QA mirror, preserving framework links and declaring overrides.

This creates a browser test fixture; shipping remains exclusively wechatgame.
No product rules or rendering implementation belong in this script.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--name', required=True)
    parser.add_argument('--trace',action='store_true',help='Explicitly enable full runtime diagnostics in this QA candidate only')
    parser.add_argument('--route', choices=['login', 'home'], default='login')
    parser.add_argument('--hour',type=float,help='Explicit initial Home hour; freezes only with --freeze')
    parser.add_argument('--freeze',action='store_true',help='Freeze Home time and actor pose in this candidate only')
    parser.add_argument('--freeze-clock',action='store_true',help='Freeze only Home time, preserving real actor animation and input')
    parser.add_argument('--freeze-plants',action='store_true',help='Keep Home plants at their authored rest pose; requires --freeze')
    parser.add_argument('--plant-time',type=float,default=0,help='Deterministically advance plant wind before freezing; fixed 1/60 steps')
    args = parser.parse_args()
    if (args.hour is not None or args.freeze or args.freeze_clock) and args.route!='home':parser.error('Home fixtures require --route home')
    if args.hour is not None and not math.isfinite(args.hour):parser.error('Hour must be finite')
    if args.freeze_plants and not args.freeze:parser.error('--freeze-plants requires --freeze')
    if not math.isfinite(args.plant_time) or not 0<=args.plant_time<=60 or abs(args.plant_time*60-round(args.plant_time*60))>1e-8:parser.error('--plant-time requires 0..60 seconds in exact 1/60 steps')
    if args.plant_time and not args.freeze_plants:parser.error('--plant-time requires --freeze-plants')
    if not all(c.isalnum() or c in '-_' for c in args.name): raise ValueError('Invalid candidate name')
    stage = ROOT / 'builds/work' / args.name
    if stage.exists(): raise FileExistsError('Use a new candidate name; retain previous evidence')
    stage.mkdir(parents=True)
    for directory in ['engines/travel-core', 'games/xiaoyu-cocos']:
        shutil.copytree(ROOT / directory, stage / directory, symlinks=True, ignore=shutil.ignore_patterns('.git', 'library', 'temp', 'local', 'build', 'profiles', 'node_modules', '.DS_Store'))
    project = stage / 'games/xiaoyu-cocos'
    boot = project / 'assets/Boot.ts'
    original = digest(boot)
    overrides = []
    if args.route != 'login':
        text = boot.read_text(); old = 'this.application.start()'
        assert text.count(old) == 1, 'Boot fixture injection point changed'
        boot.write_text(text.replace(old, f"this.application.start('{args.route}')"))
        overrides.append({'file': 'assets/Boot.ts', 'sourceSHA256': original, 'fixtureSHA256': digest(boot), 'purpose': 'Explicit direct Home route to validate the real source rig; not full entry-flow acceptance'})
    if args.hour is not None:
        text=boot.read_text();point="this.application.start('home')"
        assert text.count(point)==1
        boot.write_text(text.replace(point,f'this.application.clock.seekHour({args.hour});\n        '+point))
        overrides[0]['fixtureSHA256']=digest(boot)
        overrides.append({'file':'assets/Boot.ts','hour':args.hour,'fixtureSHA256':digest(boot),'purpose':'Declared initial Home hour; clock freezes only when --freeze is supplied'})
    if args.trace:
        text=boot.read_text(); before=digest(boot); point='    start() {'
        assert text.count(point)==1, 'Boot trace injection point changed'
        boot.write_text(text.replace(point,point+'\n        (globalThis as any).__LITTLE_STEPS_TRACE__ = true;'))
        overrides.append({'file':'assets/Boot.ts','sourceSHA256':before,'fixtureSHA256':digest(boot),'purpose':'Explicit opt-in full runtime diagnostic snapshots; default production remains quiet'})
    if args.freeze or args.freeze_clock:
        replacements=[('Application.ts','this.clock.advance(delta)','this.clock.advance(0)')]
        if args.freeze:replacements.append(('HomePage.ts','this.rig.advance(delta,this.clock.nightProgress()>=0)','this.rig.poseAt(0)'))
        for filename,old,new in replacements:
            path=project/'assets/game'/filename;before=digest(path);text=path.read_text();assert text.count(old)==1
            path.write_text(text.replace(old,new))
            overrides.append({'file':'assets/game/'+filename,'sourceSHA256':before,'fixtureSHA256':digest(path),'purpose':'Freeze product clock only' if args.freeze_clock and not args.freeze else 'Freeze product clock and original actor pose at zero; QA only, not shipping behavior'})
    if args.freeze_plants:
        path=project/'assets/game/HomePage.ts';before=digest(path);text=path.read_text();point='this.plants.advance(delta)';assert text.count(point)==1
        path.write_text(text.replace(point,'this.plants.advance(0)'))
        overrides.append({'file':'assets/game/HomePage.ts','sourceSHA256':before,'fixtureSHA256':digest(path),'purpose':'Freeze independent Home plant phase at zero with neutral joints; QA only, not shipping behavior'})
        if args.plant_time:
            path=project/'assets/game/HomePlants.ts';before=digest(path);text=path.read_text();point='});this.advance(0);this.updateShadows();';assert text.count(point)==1
            path.write_text(text.replace(point,f'}});for(let reviewStep=0;reviewStep<{round(args.plant_time*60)};reviewStep++)this.advance(1/60);this.updateShadows();'))
            overrides.append({'file':'assets/game/HomePlants.ts','sourceSHA256':before,'fixtureSHA256':digest(path),'purpose':'Deterministic plant wind checkpoint before freezing; no shipping override','seconds':args.plant_time,'steps':round(args.plant_time*60),'stepSeconds':1/60})
    config = {
        'platform': 'web-mobile', 'name': 'Little Steps QA candidate', 'outputName': 'preview',
        'buildPath': str(stage / 'output'), 'startScene': 'de1d350c-133c-4d0e-9d2a-1df4d6992aaa',
        'debug': True, 'md5Cache': False, 'sourceMaps': True,
        'packages': {'web-mobile': {'orientation': 'portrait'}},
    }
    (stage / 'build-config.json').write_text(json.dumps(config, indent=2) + '\n')
    files = []
    for directory in ['engines/travel-core', 'games/xiaoyu-cocos']:
        for path in sorted((stage / directory).rglob('*')):
            if path.is_file(): files.append({'path': str(path.relative_to(stage)), 'sha256': digest(path), 'symlink': str(path.readlink()) if path.is_symlink() else None})
    manifest = {
        'schema': 1, 'name': args.name, 'kind': 'QA candidate, not formal release',
        'sourceCommit': subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip(),
        'sourceDirty': bool(subprocess.check_output(['git', '-C', str(ROOT), 'status', '--porcelain'], text=True).strip()),
        'creator': '3.8.8', 'route': args.route, 'overrides': overrides, 'files': files,
        'snapshotSHA256': hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest(),
        'build': 'pending', 'visual': 'pending', 'wechat': 'not covered by this fixture',
        'command': ['/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator', '--project', str(project), '--build', 'configPath=' + str(stage / 'build-config.json')],
    }
    records = ROOT / 'builds/records/candidates'; records.mkdir(parents=True, exist_ok=True)
    (records / (args.name + '.json')).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'project': str(project), 'config': str(stage / 'build-config.json'), 'manifest': str(records / (args.name + '.json')), 'files': len(files), 'overrides': len(overrides)}))

if __name__ == '__main__': main()
