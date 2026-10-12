#!/usr/bin/env python3
"""Freeze latest saved local inputs or an explicit read-back revision for WeChat packaging."""
import argparse
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import hashlib
import io
import json
import re
import shutil
import subprocess
import tarfile
from urllib.parse import urlsplit
from common import check_catalog, relocate_path, capture_inputs
from common import install_templates
from assets import optimize
from isolation import prepare as isolate_loading

ROOT = Path(__file__).resolve().parents[2]
BOOT = '8dacabd2-f20d-42ab-aa32-8ffb576527d7'
SCENE = 'de1d350c-133c-4d0e-9d2a-1df4d6992aaa'
TEST_APPID = 'wx6ac3f5090a6b99c5'  # Creator's documented test ID, never a release ID.
CREATOR = '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def freeze(name, readback_path, server, appid=TEST_APPID, trim_unused=False, resource_mode='remote', asset_policy=None, separate_engine=False):
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', name):
        raise ValueError('Invalid candidate name')
    if resource_mode not in ('remote', 'subpackage'):
        raise ValueError('Unknown resource packaging mode')
    if resource_mode == 'subpackage':
        server = ''
    address = urlsplit(server)
    if resource_mode == 'remote' and (address.scheme not in ('http', 'https') or not address.netloc or address.query or address.fragment or address.username):
        raise ValueError('Use an HTTP(S) resource root without credentials/query/fragment')
    if not re.fullmatch(r'wx[0-9a-f]{16}', appid):
        raise ValueError('Invalid WeChat appid')
    if readback_path is not None:
        readback = json.loads(readback_path.read_text())
        commit, ref = readback['commit'], readback['ref']
        if not re.fullmatch(r'[0-9a-f]{40}', commit) or not ref.startswith('refs/verify/'):
            raise ValueError('Expected a recorded remote read-back commit/ref')
        actual = subprocess.check_output(['git', 'rev-parse', '--verify', ref + '^{commit}'], cwd=ROOT, text=True).strip()
        if actual != commit:
            raise ValueError('Remote read-back ref no longer matches the recorded commit')
    else:
        commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    source_dirty = bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip()) if readback_path is None else False
    stage = ROOT / 'migration/work' / name
    if stage.exists():
        raise FileExistsError('Use a new name; previous candidates are retained')
    stage.mkdir(parents=True)
    if readback_path is None:
        install_templates(ROOT)
        working_inputs = capture_inputs(ROOT)
        for folder in ['engines/travel-core', 'games/xiaoyu-cocos', 'builds/wechatgame/templates']:
            shutil.copytree(ROOT / folder, stage / folder, symlinks=True,
                            ignore=shutil.ignore_patterns('.git', 'library', 'temp', 'local', 'build', 'profiles', 'node_modules', '__pycache__', '.DS_Store'))
        config_source = ROOT / 'builds/wechatgame/config.json'
        shutil.copy2(config_source, stage / 'builds/wechatgame/config.json')
        if capture_inputs(ROOT) != working_inputs or capture_inputs(stage) != working_inputs:
            raise ValueError('复制期间源文件已改变，请重新打包；未更新当前项目。')
    else:
        working_inputs = None
        folders = ['engines/travel-core', 'games/xiaoyu-cocos']
        for folder in ['builds/wechatgame/templates', 'builds/wechatgame/config.json', 'builds/templates', 'builds/configs']:
            if subprocess.check_output(['git', 'ls-tree', commit, folder], cwd=ROOT):
                folders.append(folder)
        archive = subprocess.check_output(['git', 'archive', commit, *folders], cwd=ROOT)
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            for entry in tar.getmembers():
                target = stage / entry.name
                if not target.resolve().is_relative_to(stage.resolve()):
                    raise ValueError('Archive path escapes candidate')
                if entry.issym() and not (target.parent / entry.linkname).resolve().is_relative_to(stage.resolve()):
                    raise ValueError('Archive symlink escapes candidate')
            tar.extractall(stage)
    if (stage / 'builds/wechatgame/templates').is_dir() or (stage / 'builds/templates').is_dir():
        install_templates(stage)
    project = stage / 'games/xiaoyu-cocos'
    coverage = check_catalog(project)
    if coverage['missing']:
        raise ValueError('Frozen source is incomplete: ' + ', '.join(coverage['missing']))
    assert json.loads((project / 'assets/Boot.ts.meta').read_text())['uuid'] == BOOT
    assert json.loads((project / 'assets/scene.scene.meta').read_text())['uuid'] == SCENE
    # Restore OS read-only permissions, which Git alone does not preserve.
    plugin = stage / 'engines/travel-core/dist'
    for path in plugin.rglob('*'):
        path.chmod(0o555 if path.is_dir() else 0o444)
    plugin.chmod(0o555)
    linked = project / 'assets/plugins/travel-core.js'
    assert linked.is_symlink() and not linked.readlink().is_absolute()
    assert linked.resolve().is_relative_to(plugin.resolve())
    assert linked.stat().st_mode & 0o222 == 0
    bundles, packaging_overrides = [], []
    packaging_overrides.extend(optimize(project, stage, asset_policy or {}))
    packaging_overrides.extend(isolate_loading(project,stage))
    isolated_loading=(project/'assets/bundles/runtime_data').is_dir()
    priority = {'core_code': 6, 'shared_boot_ui': 6, 'shared_room_visual': 5,
                'loading': 4, 'login': 4, 'comic': 4, 'home': 3, 'outfit_visual': 3}
    # resources.load() uses dynamic paths, so the built-in resources bundle
    # must be explicitly included alongside the game's custom bundles.
    for meta in [p for p in [project/'assets/resources.meta',project/'assets/game.meta',project/'assets/plugins.meta',*sorted((project/'assets/bundles').glob('*.meta'))] if p.is_file()]:
        metadata = json.loads(meta.read_text())
        data = metadata['userData']
        if not data.get('isBundle'):
            continue
        name_ = data['bundleName']
        # Keep code and small shared startup resources local. Remote data keeps
        # optional pages lazy; do not zip a whole optional atlas bundle on entry.
        optional = name_!='loading' if isolated_loading else name_ not in ('resources', 'core_code', 'shared_boot_ui', 'loading')
        remote = resource_mode == 'remote' and optional and name_ not in ('gameplay_code','framework_code')
        compression = 'subpackage' if resource_mode == 'subpackage' and optional else 'merge_dep'
        # Creator 3.8 resolves a named project Bundle configuration. Older
        # isRemoteBundle maps and CLI IBundleOptions do not select that profile.
        # Only the packaging copy changes; authoring metadata stays intact.
        before = sha(meta)
        data['priority'] = priority.get(name_, 2) if name_ != 'resources' else data.get('priority', 8)
        data['bundleConfigID'] = ('little-steps-subpackage' if compression == 'subpackage' else
                                'little-steps-remote' if remote else 'little-steps-local')
        meta.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
        packaging_overrides.append({'file': str(meta.relative_to(stage)), 'sourceSHA256': before,
                                    'packagingSHA256': sha(meta), 'purpose': 'WeChat bundle placement only'})
        bundle_root = meta.with_suffix('').relative_to(project / 'assets').as_posix()
        bundles.append({'root': 'db://assets/' + bundle_root, 'name': name_,
                        'priority': data.get('priority', 0), 'compressionType': compression,
                        'isRemote': remote, 'output': True})
    builder_path = project / 'settings/v2/packages/builder.json'
    before = sha(builder_path)
    builder = json.loads(builder_path.read_text())
    profiles = builder.setdefault('bundleConfig', {}).setdefault('custom', {})
    for remote in [False, True]:
        name_ = 'little-steps-remote' if remote else 'little-steps-local'
        options = {'isRemote': remote, 'compressionType': 'merge_dep'}
        profiles[name_] = {'displayName': name_, 'configs': {
            'miniGame': {'preferredOptions': options, 'fallbackOptions': options, 'configMode': 'auto'},
            'native': {'preferredOptions': {'isRemote': False, 'compressionType': 'merge_dep'}},
            'web': {'preferredOptions': {'isRemote': False, 'compressionType': 'merge_dep'}},
        }}
    profiles['little-steps-subpackage'] = {'displayName': 'little-steps-subpackage', 'configs': {
        'miniGame': {'preferredOptions': {'isRemote': False, 'compressionType': 'subpackage'},
                     'fallbackOptions': {'isRemote': False, 'compressionType': 'subpackage'}, 'configMode': 'auto'},
        'native': {'preferredOptions': {'isRemote': False, 'compressionType': 'merge_dep'}},
        'web': {'preferredOptions': {'isRemote': False, 'compressionType': 'merge_dep'}},
    }}
    builder_path.write_text(json.dumps(builder, ensure_ascii=False, indent=2) + '\n')
    packaging_overrides.append({'file': str(builder_path.relative_to(stage)), 'sourceSHA256': before,
                                'packagingSHA256': sha(builder_path), 'purpose': 'Creator 3.8 named Bundle configurations'})
    if trim_unused:
        unsupported = re.compile(r'\b(?:sp|dragonBones)\s*\.|\b(?:RigidBody2D|PhysicsSystem2D|'
                                 r'Collider2D|ParticleSystem2D|TiledMap|VideoPlayer|WebView)\b')
        for folder in [project / 'assets', stage / 'engines/travel-core/src']:
            for script in folder.rglob('*'):
                if script.is_file() and script.suffix in {'.ts', '.js', '.scene', '.prefab'}:
                    if unsupported.search(script.read_text()):
                        raise ValueError('Re-audit engine trim: removed integration referenced by ' + str(script))
        engine_path = project / 'settings/v2/packages/engine.json'
        before = sha(engine_path)
        engine = json.loads(engine_path.read_text())
        modules = engine['modules']
        profile = json.loads(json.dumps(modules['configs'][modules['globalConfigKey']]))
        unused = {'spine', 'spine-3.8', 'spine-4.2', 'dragon-bones', 'physics-2d',
                  'physics-2d-box2d', 'physics-2d-box2d-wasm', 'physics-2d-builtin',
                  'physics-2d-box2d-jsb', 'particle-2d', 'tiled-map', 'video', 'webview'}
        profile['name'] = 'Little Steps WeChat'
        removed = sorted(set(profile['includeModules']) & unused)
        profile['includeModules'] = [m for m in profile['includeModules'] if m not in unused]
        for module in unused:
            if module in profile['cache']:
                profile['cache'][module]['_value'] = False
        modules['configs']['littleStepsWeChat'] = profile
        engine_path.write_text(json.dumps(engine, ensure_ascii=False, indent=2) + '\n')
        packaging_overrides.append({'file': str(engine_path.relative_to(stage)), 'sourceSHA256': before,
                                    'packagingSHA256': sha(engine_path), 'purpose': 'Remove unused engine integrations only',
                                    'removedModules': removed, 'runtimeAcceptance': 'pending'})
    config = {
        'platform': 'wechatgame', 'name': 'Little Steps WeChat candidate',
        'outputName': 'wechatgame', 'buildPath': str(stage / 'output'),
        'startScene': SCENE, 'scenes': [{'url': 'db://assets/scene.scene', 'uuid': SCENE}],
        'debug': False, 'sourceMaps': False, 'md5Cache': True,
        'useSplashScreen': False,
        'server': server.rstrip('/') + '/' if server else '', 'mainBundleIsRemote': False,
        'startSceneAssetBundle': False, 'bundleConfigs': bundles,
        'packages': {'wechatgame': {'appid': appid, 'orientation': 'portrait',
                                   'separateEngine': separate_engine, 'buildOpenDataContextTemplate': False}},
    }
    if trim_unused:
        config['engineModulesConfigKey'] = 'littleStepsWeChat'
    config_path = stage / 'build-config.json'
    config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
    files = []
    for folder in ['engines/travel-core', 'games/xiaoyu-cocos', 'builds/wechatgame/templates', 'builds/wechatgame/config.json', 'builds/templates', 'builds/configs']:
        for path in ([stage / folder] if (stage / folder).is_file() else sorted((stage / folder).rglob('*'))):
            if path.is_file():
                files.append({'path': str(path.relative_to(stage)), 'sha256': sha(path),
                              'symlink': str(path.readlink()) if path.is_symlink() else None})
    manifest = {
        'schema': 1, 'name': name, 'kind': 'WeChat packaging candidate, not release',
        'sourceCommit': commit, 'sourceMode': 'remote-readback' if readback_path else 'local-working-copy',
        'sourceDirty': source_dirty,
        'resourceMode': resource_mode,
        'assetPolicy': asset_policy or {}, 'separateEngine': separate_engine,
        'workingInputs': working_inputs,
        'sourceReadback': str(readback_path.relative_to(ROOT)) if readback_path else None,
        'sourceReadbackSHA256': sha(readback_path) if readback_path else None, 'gameSourceOverrides': [],
        'packagingOverrides': packaging_overrides,
        'creator': '3.8.8', 'platform': 'wechatgame', 'testAppid': appid == TEST_APPID,
        'resourceServer': config['server'], 'resourcesUploaded': False,
        'files': files, 'snapshotSHA256': hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest(),
        'buildConfigSHA256': sha(config_path), 'build': 'pending', 'runtime': 'pending',
        'device': 'pending', 'homeColdDownloadGate': 'pending',
        'command': [CREATOR, '--project', str(project), '--build', 'configPath=' + str(config_path)],
    }
    record = ROOT / 'migration/records/candidates' / (name + '.json')
    record.parent.mkdir(parents=True, exist_ok=True)
    record.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    return {'project': str(project), 'config': str(config_path), 'manifest': str(record),
            'files': len(files), 'sourceCommit': commit, 'remoteBundles': sum(b['isRemote'] for b in bundles)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--name', required=True)
    parser.add_argument('--readback', required=True, type=Path)
    parser.add_argument('--server', required=True, help='Resource root; loopback is QA only')
    parser.add_argument('--appid', default=TEST_APPID)
    parser.add_argument('--trim-unused', action='store_true', help='Use audited engine subset; runtime QA still required')
    args = parser.parse_args()
    print(json.dumps(freeze(args.name, relocate_path(args.readback), args.server, args.appid, args.trim_unused)))


if __name__ == '__main__':
    main()
