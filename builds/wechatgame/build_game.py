#!/usr/bin/env python3
"""Mapped standalone Cocos games, frozen from latest saved local inputs."""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import re
import shutil
import subprocess
import sys
import time
import zipfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
CREATOR = '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def inputs(project, configuration, templates):
    paths = []
    for folder in [project / 'assets', project / 'settings', project / 'package.json', configuration, templates]:
        for path in ([folder] if folder.is_file() else sorted(folder.rglob('*'))):
            if path.is_file() and path.name != '.DS_Store': paths.append({'path': str(path.relative_to(ROOT)), 'sha256': digest(path)})
    return paths


def optimize(project, policy):
    from PIL import Image
    result = []
    for path in sorted((project / 'assets/bundles').rglob('*.png')):
        image = Image.open(path)
        before = digest(path)
        width = policy['portraitWidth'] if path.name == 'hall_stage_boss.png' else policy['backgroundWidth']
        if image.width > width:
            image = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
        image.save(path, optimize=True)
        if image.width >= 480 and path.stat().st_size > policy['largeImageMaxBytes']:
            image = image.convert('RGBA').quantize(colors=256, method=Image.Quantize.FASTOCTREE)
            image.save(path, optimize=True)
        if path.stat().st_size > policy['largeImageMaxBytes'] and image.width >= 480:
            raise ValueError('Image budget exceeded: ' + str(path))
        if digest(path) != before:
            result.append({'path': str(path.relative_to(project)), 'sourceSHA256': before, 'buildSHA256': digest(path), 'bytes': path.stat().st_size, 'size': image.size})
    return result


def audit(output, configuration):
    game = json.loads((output / 'game.json').read_text())
    packages = game.get('subpackages', game.get('subPackages', []))
    roots = [(p['name'], p['root'].strip('/') + '/') for p in packages]
    sizes = {'main': 0}; files = []
    for path in sorted(output.rglob('*')):
        if not path.is_file() or path.name == 'project.private.config.json': continue
        relative = path.relative_to(output).as_posix(); bucket = next((name for name, root in roots if relative.startswith(root)), 'main')
        sizes[bucket] = sizes.get(bucket, 0) + path.stat().st_size
        files.append({'path': relative, 'bytes': path.stat().st_size, 'sha256': digest(path), 'bucket': bucket})
    project = json.loads((output / 'project.config.json').read_text())
    settings_files = list((output / 'src').glob('settings*.json'))
    settings = json.loads(settings_files[0].read_text()) if settings_files else {}
    limits = configuration['limits']
    checks = {'correctAppid': project['appid'] == configuration['appid'], 'portrait': game.get('deviceOrientation') == 'portrait',
              'nativeSubpackages': len(roots) >= 5, 'noRemoteBundle': not settings.get('assets', {}).get('remoteBundles'),
              'mainWithin4MB': sizes['main'] <= limits['mainBytes'], 'eachSubpackageWithin4MB': all(v <= limits['subpackageBytes'] for k, v in sizes.items() if k != 'main'),
              'totalWithin30MB': sum(sizes.values()) <= limits['totalBytes'], 'entryExists': (output / 'game.js').is_file(),
              'friendContextPresent': (output / 'open-data/index.js').is_file(), 'noReferenceCode': not any('boss4' in f['path'] for f in files)}
    return {'game': configuration['game'], 'status': 'local-build-not-published', 'checks': checks, 'sizes': sizes,
            'totalBytes': sum(sizes.values()), 'files': files, 'device': 'pending-actual-device', 'testAppid': configuration['testAppid']}


def install_output(source, destination, manifest, current):
    # Existing outputs are replaced only when their ownership and inputs are known.
    state_path = ROOT / 'migration/.cache/wechatgame' / (manifest['game'] + '-workspace.json')
    old = json.loads(state_path.read_text()) if state_path.exists() else None
    project = destination / 'project'
    if project.exists() and old is None: raise ValueError('Existing game output has no ownership record')
    if current() != manifest['inputs']: raise ValueError('源码在构建期间改变，保留候选，请重新打包。')
    prepared = source.parent / 'prepared-project'
    shutil.copytree(source, prepared)
    owned = {p.relative_to(prepared).as_posix() for p in prepared.rglob('*') if p.is_file()}
    if old:
        prior = set(old['generatedFiles'])
        for path in project.rglob('*'):
            if not path.is_file(): continue
            name = path.relative_to(project).as_posix()
            if name not in prior or path.name == 'project.private.config.json':
                target = prepared / name
                if target.exists() and path.name != 'project.private.config.json': raise ValueError('Build conflicts with user file: ' + name)
                target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(path, target)
    destination.mkdir(parents=True, exist_ok=True)
    previous = source.parent / 'previous-project'
    if project.exists(): shutil.copytree(project, previous)
    project.mkdir(exist_ok=True)
    try:
        from build import update_files
        update_files(prepared, project)
        launcher = json.loads((project / 'project.config.json').read_text()); launcher['miniprogramRoot'] = 'project/'
        write(destination / 'project.config.json', launcher)
        (destination / 'remote').mkdir(exist_ok=True)
        write(state_path, {'game': manifest['game'], 'name': manifest['name'], 'generatedFiles': sorted(owned), 'inputsSHA256': manifest['inputsSHA256']})
    except Exception:
        if previous.exists():
            restore = source.parent / 'restore-project'; shutil.copytree(previous, restore); update_files(restore, project)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', required=True); parser.add_argument('--preview', action='store_true'); parser.add_argument('--device', action='store_true')
    parser.add_argument('--name'); parser.add_argument('--build-only', action='store_true'); parser.add_argument('--open', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9_-]+', args.game): raise ValueError('Invalid game name')
    path = ROOT / 'builds/wechatgame/games' / (args.game + '.json')
    if not path.is_file(): raise SystemExit('No WeChat mapping for game: ' + args.game)
    config = json.loads(path.read_text()); project = ROOT / config['project']; templates = ROOT / config['templates']
    if not project.is_relative_to(ROOT / 'games') or not templates.is_relative_to(ROOT / 'builds/wechatgame/game-templates'): raise ValueError('Invalid mapping')
    assert json.loads((project / 'assets/scene.scene.meta').read_text())['uuid'] == config['scene']
    assert json.loads((project / 'assets/Boot.ts.meta').read_text())['uuid'] == config['boot']
    captured = inputs(project, path, templates)
    name = args.name or config['game'] + '-' + ('web-' if args.preview else 'wechat-') + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    if not name or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in name): raise ValueError('Invalid build name')
    stage = ROOT / 'migration/work' / name
    if stage.exists(): raise ValueError('Use a fresh build name; previous candidates are retained')
    mirror = stage / config['project']; mirror.parent.mkdir(parents=True)
    shutil.copytree(project, mirror, ignore=shutil.ignore_patterns('.git', 'library', 'temp', 'local', 'build', 'profiles', 'node_modules', '__pycache__', '.DS_Store', '.creator', 'build-templates', 'source', 'test', 'docs'))
    if captured != inputs(project, path, templates): raise ValueError('复制期间源码改变，请重新打包。')
    modifications = optimize(mirror, config['assetPolicy'])
    shutil.copytree(templates, mirror / 'build-templates/wechatgame')
    engine_path = mirror / 'settings/v2/packages/engine.json'; engine = json.loads(engine_path.read_text())
    profile = copy.deepcopy(engine['modules']['configs']['defaultConfig'])
    keep = {'2d', 'affine-transform', 'animation', 'audio', 'base', 'custom-pipeline', 'gfx-webgl', 'gfx-webgl2', 'graphics', 'mask', 'profiler', 'tween', 'ui'}
    profile['includeModules'] = [v for v in profile['includeModules'] if v in keep]
    for key, value in profile['cache'].items():
        if key not in keep and key not in {'render-pipeline'}: value['_value'] = False
    profile['name'] = 'Boss WeChat 2D'; engine['modules']['configs']['bossWeChat'] = profile
    write(engine_path, engine)
    builder_path = mirror / 'settings/v2/packages/builder.json'; builder = json.loads(builder_path.read_text())
    custom = builder.setdefault('bundleConfig', {}).setdefault('custom', {})
    custom['boss-subpackage'] = {'displayName': 'Boss native subpackage', 'configs': {
        'miniGame': {'preferredOptions': {'isRemote': False, 'compressionType': 'subpackage'}, 'fallbackOptions': {'isRemote': False, 'compressionType': 'subpackage'}, 'configMode': 'auto'},
        'web': {'preferredOptions': {'isRemote': False, 'compressionType': 'merge_dep'}}}}
    bundles = [{'root': 'db://assets/resources', 'output': True}]
    for meta in sorted((mirror / 'assets/bundles').glob('*.meta')):
        data = json.loads(meta.read_text()); bundle = data['userData']['bundleName']; remote = bundle != 'loading'
        if remote: data['userData']['bundleConfigID'] = 'boss-subpackage'; write(meta, data)
        bundles.append({'root': 'db://assets/bundles/' + bundle, 'output': True})
    write(builder_path, builder)
    platform = 'web-mobile' if args.preview else 'wechatgame'
    build_config = {'platform': platform, 'name': config['title'], 'outputName': platform, 'buildPath': str(stage / 'output'),
        'startScene': config['scene'], 'scenes': [{'url': 'db://assets/scene.scene', 'uuid': config['scene']}],
        'debug': args.preview, 'sourceMaps': False, 'md5Cache': True, 'useSplashScreen': False, 'engineModulesConfigKey': 'bossWeChat',
        'server': '', 'mainBundleIsRemote': False, 'bundleConfigs': bundles,
        'packages': {'wechatgame': {'appid': config['appid'], 'orientation': 'portrait', 'separateEngine': False, 'buildOpenDataContextTemplate': False}}}
    write(stage / 'build-config.json', build_config)
    evidence = ROOT / 'migration/reviews/boss'; evidence.mkdir(parents=True, exist_ok=True)
    manifest = {'game': config['game'], 'name': name, 'platform': platform, 'sourceMode': 'latest-saved-local-copy',
                'inputs': captured, 'inputsSHA256': hashlib.sha256(json.dumps(captured, sort_keys=True).encode()).hexdigest(),
                'artOverrides': modifications, 'sourceCommit': subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=project, text=True, capture_output=True).stdout.strip(),
                'creator': '3.8.8', 'device': 'pending-actual-device'}
    log = evidence / (name + '-build.log'); print(json.dumps({'name': name, 'log': str(log)}, ensure_ascii=False), flush=True)
    with log.open('w') as stream:
        result = subprocess.run([CREATOR, '--project', str(mirror), '--build', 'configPath=' + str(stage / 'build-config.json')], cwd=ROOT, stdout=stream, stderr=subprocess.STDOUT)
    manifest['creatorExitCode'] = result.returncode
    write(evidence / (name + '-manifest.json'), manifest)
    if result.returncode != 36: raise RuntimeError('Creator build failed; retained evidence: ' + str(log))
    output = stage / 'output' / platform
    if args.preview:
        destination = ROOT / 'migration/output/boss-web'
        if captured != inputs(project, path, templates): raise ValueError('源码改变，请重新打包。')
        if destination.exists(): shutil.rmtree(destination)
        shutil.copytree(output, destination)
        print(json.dumps({'preview': str(destination), 'name': name}, ensure_ascii=False)); return
    for file in (templates / 'open-data').rglob('*'):
        if file.is_file(): target = output / 'open-data' / file.relative_to(templates / 'open-data'); target.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(file, target)
    game_path = output / 'game.json'; game_config = json.loads(game_path.read_text()); game_config.update(json.loads((templates / 'game.json').read_text())); write(game_path, game_config)
    report = audit(output, config); write(evidence / (name + '-package.json'), report)
    failed = [key for key, passed in report['checks'].items() if not passed]
    if failed: raise ValueError('Package gates failed: ' + ', '.join(failed))
    if captured != inputs(project, path, templates): raise ValueError('源码在构建期间改变，已保留候选，请重新打包。')
    if not args.build_only: install_output(output, ROOT / config['destination'], manifest, lambda: inputs(project, path, templates))
    archive = ROOT / 'migration/output' / (config['game'] + '-wechatgame-' + config['version'] + '.zip'); archive.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for file in output.rglob('*'):
            if file.is_file(): z.write(file, file.relative_to(output))
    if args.open and not args.build_only: subprocess.run(['/Applications/wechatwebdevtools.app/Contents/MacOS/cli', 'open', '--project', str(ROOT / config['destination'])])
    print(json.dumps({'project': str(ROOT / config['destination']), 'archive': str(archive), 'checks': report['checks'], 'sizes': report['sizes'], 'device': report['device']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
