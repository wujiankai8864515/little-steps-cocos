#!/usr/bin/env python3
"""Audit Creator output sizes/topology. This is NOT runtime or device acceptance."""
import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path
from create_wechat_candidate import ROOT, TEST_APPID, sha
from check_catalog_assets import check_catalog
from audit_home_payload import audit_home_payload


def startup_resources_present(output):
    configs = list((output / 'assets/resources').glob('config*.json'))
    if len(configs) != 1:
        return False
    config = json.loads(configs[0].read_text())
    paths = {item[0] for item in config.get('paths', {}).values()}
    return {'source-catalog', 'source-scenes', 'effects/login-peek'} <= paths


def audit(name):
    record = ROOT / 'builds/records/candidates' / (name + '.json')
    manifest = json.loads(record.read_text())
    stage = ROOT / 'builds/work' / name
    config = json.loads((stage / 'build-config.json').read_text())
    output = Path(config['buildPath']) / config['outputName']
    if not output.resolve().is_relative_to(stage.resolve()) or config['platform'] != 'wechatgame':
        raise ValueError('Expected isolated WeChat candidate')
    game = json.loads((output / 'game.json').read_text())
    project = json.loads((output / 'project.config.json').read_text())
    settings_files = list((output / 'src').glob('settings*.json'))
    if len(settings_files) != 1:
        raise ValueError('Expected one settings manifest')
    settings = json.loads(settings_files[0].read_text())
    assets = settings['assets']
    expected_remote = {b['name'] for b in config['bundleConfigs'] if b['isRemote']}
    subpackages = game.get('subpackages', game.get('subPackages', []))
    roots = {item['name']: item['root'].rstrip('/') + '/' for item in subpackages}
    inventory, sizes = [], defaultdict(int)
    for path in sorted(output.rglob('*')):
        if not path.is_file():
            continue
        relative = path.relative_to(output).as_posix()
        bucket = 'main'
        if relative.startswith('remote/'):
            bucket = 'remote/' + relative.split('/')[1]
        else:
            for subname, subroot in roots.items():
                if relative.startswith(subroot):
                    bucket = 'subpackage/' + subname
                    break
        size = path.stat().st_size
        sizes[bucket] += size
        inventory.append({'path': relative, 'bytes': size, 'sha256': sha(path), 'bucket': bucket})
    runtime_mismatch, metadata_changes = [], []
    for entry in manifest['files']:
        path = stage / entry['path']
        if not path.is_file() or sha(path) != entry['sha256']:
            (metadata_changes if path.suffix == '.meta' else runtime_mismatch).append(entry['path'])
    remote_scripts = [f['path'] for f in inventory if f['bucket'].startswith('remote/') and Path(f['path']).suffix in ('.js', '.mjs', '.cjs')]
    native_types = {'.png', '.mp3', '.wav', '.ttf'}
    output_hashes = {f['sha256'] for f in inventory if Path(f['path']).suffix in native_types}
    native_sources = [p for p in (stage / 'games/xiaoyu-cocos/assets/bundles').rglob('*')
                      if p.is_file() and p.suffix in native_types]
    missing_native = [str(p.relative_to(stage)) for p in native_sources if sha(p) not in output_hashes]
    unexpected_metadata = [p for p in metadata_changes if p != 'games/xiaoyu-cocos/assets/plugins/travel-core.js.meta']
    plugin = stage / 'games/xiaoyu-cocos/assets/plugins/travel-core.js'
    plugin_meta = json.loads(plugin.with_suffix('.js.meta').read_text())
    plugin_data = plugin_meta['userData']
    home_payload = audit_home_payload(stage / 'games/xiaoyu-cocos', output, assets.get('remoteBundles', []))
    checks = {
        'homeDeferredClosureWithin19MB': home_payload['passed'],
        'sourceCatalogComplete': not check_catalog(stage / 'games/xiaoyu-cocos')['missing'],
        'wechatEntryFiles': all((output / p).is_file() for p in ['game.js', 'game.json', 'project.config.json']),
        'startupResourcesBundlePresent': startup_resources_present(output),
        'portrait': game.get('deviceOrientation') == 'portrait',
        'appidMatchesConfiguration': project.get('appid') == config['packages']['wechatgame']['appid'],
        'remoteBundlesMatch': set(assets.get('remoteBundles', [])) == expected_remote,
        'remoteServerMatches': assets.get('server') == config['server'],
        'remoteScriptsAbsent': not remote_scripts,
        'allRemoteBundlesPresent': all((output / 'remote' / n).is_dir() for n in expected_remote),
        'frozenRuntimeSourceUnchanged': not runtime_mismatch,
        'onlyPluginImporterMetadataChanged': not unexpected_metadata,
        'originalNativeAssetBytesPreserved': not missing_native,
        'configMatchesFrozenHash': sha(stage / 'build-config.json') == manifest['buildConfigSHA256'],
        'mainWithinConservative4MB': sizes['main'] <= 4_000_000,
        'noSourceMaps': not any(f['path'].endswith('.map') for f in inventory),
        'readonlyRelativeFrameworkPlugin': (plugin.is_symlink() and not plugin.readlink().is_absolute()
                                           and plugin.resolve().is_relative_to((stage / 'engines/travel-core/dist').resolve())
                                           and not (plugin.stat().st_mode & 0o222)
                                           and not (plugin.resolve().parent.stat().st_mode & 0o222)),
        'miniGamePluginEnabled': (plugin_meta['uuid'] == '7d0bdc9d-6e8b-5ee4-a751-c655c245ba31'
                                  and plugin_data.get('isPlugin') is True
                                  and plugin_data.get('loadPluginInMiniGame') is True),
    }
    package_bytes = sum(v for k, v in sizes.items() if not k.startswith('remote/'))
    limits = ['Cold Home 19,000,000-byte gate requires measured first-entry transfer; output size does not prove it.',
              'WeChat DevTools, physical touch, audio, storage, background recovery and performance remain unverified.',
              'Resources have not been uploaded and no production HTTPS/domain configuration has been verified.']
    if project.get('appid') == TEST_APPID:
        limits.append('Uses the documented Creator test AppID; not a production account build.')
    return {
        'schema': 1, 'item': 'M10.01', 'candidate': name, 'sourceCommit': manifest['sourceCommit'],
        'status': 'static_packaging_checks_passed_not_release' if all(checks.values()) else 'packaging_checks_failed_not_release',
        'checks': checks, 'rawBytesByBucket': dict(sorted(sizes.items())), 'rawLocalPackageBytes': package_bytes,
        'sizeMethod': 'Sum of exact output file bytes; remote/ excluded from local package. Not wire download, ZIP or device memory.',
        'runtimeSourceMismatches': runtime_mismatch, 'creatorMetadataChanges': metadata_changes,
        'sourceCatalog': check_catalog(stage / 'games/xiaoyu-cocos'),
        'homePayload': home_payload,
        'nativeAssets': {'count': len(native_sources), 'byteIdenticalInOutput': len(native_sources) - len(missing_native),
                         'missing': missing_native},
        'remoteScripts': remote_scripts, 'fileCount': len(inventory), 'files': inventory,
        'inventorySHA256': hashlib.sha256(json.dumps(inventory, sort_keys=True).encode()).hexdigest(),
        'pending': limits,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--name', required=True)
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    if not a.name or not all(c.isalnum() or c in '-_' for c in a.name):
        p.error('Invalid candidate name')
    result = audit(a.name)
    a.out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k not in ('files',)}, ensure_ascii=False))
    raise SystemExit(0 if all(result['checks'].values()) else 1)


if __name__ == '__main__':
    main()
