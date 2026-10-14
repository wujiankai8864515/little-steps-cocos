"""Game-specific WeChat build mapping. Public entry stays builds/build.py.

This does not consume Little Steps' catalog or replace its fixed output.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import fcntl
import hashlib
import json
import os
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
CREATOR = '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator'


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def fingerprint(project):
    inputs = []
    for directory in ['assets', 'settings', 'package.json']:
        source = project / directory
        for p in [source] if source.is_file() else sorted(source.rglob('*')):
            if p.is_file() and p.name != '.DS_Store':
                inputs.append({'path':p.relative_to(project).as_posix(), 'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),
                               'symlink':str(p.readlink()) if p.is_symlink() else None})
    return inputs


def run(args):
    mapping = ROOT / 'builds/wechatgame/games' / (args.game + '.json')
    config = json.loads(mapping.read_text())
    if args.readback or args.stage_existing or args.serve_only or args.server or args.resource_mode == 'remote':
        raise ValueError('This game currently supports fresh local-source native-subpackage candidates only.')
    project = ROOT / config['project']
    if not project.is_dir(): raise ValueError('Configured game project is missing')
    name = args.name or 'zya-wechat-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    if not re.fullmatch(r'[a-zA-Z0-9_-]+',name):raise ValueError('Candidate name must contain only ASCII letters, digits, hyphens or underscores')
    stage = ROOT / 'migration/work' / name
    if stage.exists(): raise FileExistsError('Use a new evidence name; previous candidates are retained')
    cache = ROOT / 'migration/.cache'; cache.mkdir(parents=True,exist_ok=True)
    with (cache / 'zya-wechat-build.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX | fcntl.LOCK_NB)
        return build(args, config, project, stage, name)


def build(args, config, project, stage, name):
    inputs = fingerprint(project)
    mirror = stage / config['project']
    shutil.copytree(project,mirror,symlinks=True,ignore=shutil.ignore_patterns('.git','library','temp','local','build','profiles','node_modules','.creator'))
    framework = stage / 'engines/travel-core/dist'; framework.mkdir(parents=True)
    target = framework / 'travel-core.js'
    shutil.copyfile(ROOT / 'engines/travel-core/dist/travel-core.js',target);os.chmod(target,0o444);os.chmod(framework,0o555)
    framework_hash=hashlib.sha256(target.read_bytes()).hexdigest()
    profiles = {'zya-local':{'displayName':'zya-local','configs':{}},'zya-subpackage':{'displayName':'zya-subpackage','configs':{}}}
    for name_,compression in [('zya-local','merge_dep'),('zya-subpackage','subpackage')]:
        for platform in ['miniGame','native','web']:
            options={'isRemote':False,'compressionType':compression if platform=='miniGame' else 'merge_dep'}
            profiles[name_]['configs'][platform]={'preferredOptions':options,'fallbackOptions':options,'configMode':'auto'}
    builder_path = mirror / 'settings/v2/packages/builder.json'
    builder=json.loads(builder_path.read_text());builder.setdefault('bundleConfig',{}).setdefault('custom',{}).update(profiles)
    write_json(builder_path,builder)
    bundles=[]
    for meta in sorted((mirror/'assets/bundles').glob('*.meta')):
        value=json.loads(meta.read_text());data=value['userData'];name_=data['bundleName']
        compression='merge_dep' if name_=='zya_common' else 'subpackage'
        data['bundleConfigID']='zya-local' if compression=='merge_dep' else 'zya-subpackage'
        write_json(meta,value);bundles.append({'name':name_,'compression':compression,'remote':False})
    appid=args.appid or config['appid']
    options={'platform':'wechatgame','name':config['displayName'],'outputName':'project','buildPath':str(stage/'output'),
             'startScene':config['startScene'],'debug':False,'md5Cache':True,'sourceMaps':False,
             'packages':{'wechatgame':{'appid':appid,'orientation':'portrait','separateEngine':False,
                                      'useSubpackages':True,'useSplashScreen':False}}}
    config_path=stage/'build-config.json';write_json(config_path,options)
    record=ROOT/'migration/reviews/zhaoyunyuadou'/(name+'.json')
    manifest={'schema':1,'game':config['game'],'name':name,'sourceMode':'local-working-copy','workingInputs':inputs,
              'kind':'local development candidate, not a formal release','creator':'3.8.8','bundles':bundles,
              'appid':appid,'resourceMode':'subpackage','device':'pending','build':'pending','visual':'pending',
              'framework':{'sha256':framework_hash,'mode':oct(target.stat().st_mode&0o777)}}
    write_json(record,manifest);log=record.with_suffix('.log')
    try:
        with log.open('w') as handle:
            result=subprocess.run([CREATOR,'--project',str(mirror),'--build','configPath='+str(config_path)],stdout=handle,stderr=subprocess.STDOUT,cwd=ROOT)
        output=stage/'output/project';manifest['buildExitCode']=result.returncode
        if result.returncode not in (0,36) or 'Importer exec failed' in log.read_text(errors='replace'):
            raise RuntimeError('Creator build or asset import failed; inspect '+str(log))
        if not (output/'game.js').is_file() or not (output/'game.json').is_file():raise RuntimeError('Missing generated WeChat entry files')
        files=[p for p in output.rglob('*') if p.is_file()]
        total=sum(p.stat().st_size for p in files)
        game_config=json.loads((output/'game.json').read_text());subpackages=game_config.get('subpackages',game_config.get('subPackages',[]))
        roots=[(entry['name'],entry['root'].strip('/')+'/') for entry in subpackages];sizes={'main':0}
        for file in files:
            relative=file.relative_to(output).as_posix();bucket=next((name_ for name_,root in roots if relative.startswith(root)),'main');sizes[bucket]=sizes.get(bucket,0)+file.stat().st_size
        main=sizes['main'];initial=main+sum(value for key,value in sizes.items() if key in ['zya_home','zya_actors','zya_meta','zya_audio'])
        if total>config['limits']['totalBytes'] or main>config['limits']['mainBytes']:raise RuntimeError('WeChat package exceeds configured byte limits')
        if not subpackages:raise RuntimeError('Native asset subpackages were not generated')
        if any(value>config['limits']['subpackageBytes'] for key,value in sizes.items() if key!='main'):raise RuntimeError('Native subpackage exceeds 4 MB: '+str(sizes))
        if initial>config['limits']['initialBytes']:raise RuntimeError('Home first-load exceeds 19 MB: '+str(initial))
        if (output/'remote').is_dir() and any((output/'remote').rglob('*')):raise RuntimeError('Unexpected remote resource dependency')
        manifest.update(build='pass',audit={'mainBytes':main,'totalBytes':total,'initialBytes':initial,'sizes':sizes,'subpackages':subpackages,'files':len(files)},output=str(output),log=str(log))
        manifest['outputFiles']=[{'path':file.relative_to(output).as_posix(),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()} for file in sorted(files)]
        if fingerprint(project)!=inputs or hashlib.sha256((ROOT/'engines/travel-core/dist/travel-core.js').read_bytes()).hexdigest()!=framework_hash:raise RuntimeError('构建期间源码或资源改变，保留候选并重新打包，固定产物未覆盖。')
        if not args.build_only:
            destination=ROOT/config['destination'];destination.mkdir(parents=True,exist_ok=True)
            active=destination/'project';prepared=destination/('project.next-'+name)
            shutil.copytree(output,prepared)
            if active.exists():
                archive=ROOT/'migration/output/zhaoyunyuadou'/('previous-'+name);archive.parent.mkdir(parents=True,exist_ok=True);active.rename(archive)
            prepared.rename(active)
            entry=destination/'project.config.json'
            entry_config=json.loads(entry.read_text()) if entry.exists() else {'projectname':config['displayName'],'compileType':'game','miniprogramRoot':'project/','setting':{'urlCheck':True,'es6':True},'condition':{}}
            entry_config['appid']=appid;write_json(entry,entry_config)
            manifest['fixedProject']=str(active);manifest['developerToolsRoot']=str(destination)
        write_json(record,manifest);return {k:v for k,v in manifest.items() if k!='workingInputs'}
    except Exception as error:
        manifest.update(build='fail',error=str(error));write_json(record,manifest);raise


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--game',required=True,choices=['zhaoyunyuadou']);parser.add_argument('--name');parser.add_argument('--appid');parser.add_argument('--device',action='store_true');parser.add_argument('--build-only',action='store_true');parser.add_argument('--readback');parser.add_argument('--stage-existing',action='store_true');parser.add_argument('--serve-only',action='store_true');parser.add_argument('--server');parser.add_argument('--resource-mode',default='subpackage',choices=['subpackage','remote']);
    print(json.dumps(run(parser.parse_args()),ensure_ascii=False))
