#!/usr/bin/env python3
"""Android channel: frozen working-copy export, hot-update packaging, then APK compilation."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone, timedelta

ROOT = Path(__file__).resolve().parents[2]
CHANNEL = Path(__file__).resolve().parent


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def stamp_project(project, game, source_commit, display_version):
    config = project / 'assets/art/resources/config'
    levels = sorted(p.stem for p in (config / 'card-levels').glob('*.json'))
    if not levels:
        raise ValueError('No game JSON levels')
    write_json(config / 'card-index.json', {'schemaVersion': 1, 'levels': levels})
    write_json(config / 'release-info.json', {'schemaVersion': 1, 'displayVersion': display_version,
        'hotUpdateVersion': game['hotUpdateVersion'], 'sourceCommit': source_commit, 'timezone': 'Asia/Shanghai'})


def inputs(project):
    raw = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z',
                                   '--', project, 'builds/android', 'builds/build.py'], cwd=ROOT)
    result = {}
    for name in sorted(set(raw.split(b'\0'))):
        if not name:
            continue
        relative = name.decode()
        path = ROOT / relative
        if path.is_symlink():
            raise ValueError('Android source symlink requires an explicit asset mapping: ' + relative)
        if path.is_file():
            result[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def environment():
    creator = Path(os.environ.get('COCOS_CREATOR',
        '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator'))
    sdk = Path(os.environ.get('ANDROID_SDK_ROOT', str(Path.home() / 'Library/Android/sdk')))
    versions = sorted((sdk / 'ndk').glob('*')) if (sdk / 'ndk').exists() else []
    ndk = Path(os.environ.get('ANDROID_NDK_HOME', str(versions[-1]) if versions else 'missing-ndk'))
    java = Path(os.environ.get('AVG_PLUS_JAVA_HOME',
        '/Applications/Android Studio.app/Contents/jbr/Contents/Home'))
    cmake = creator.parents[1] / 'Resources/tools/cmake/bin/cmake'
    for label, path in [('Cocos Creator', creator), ('Android SDK', sdk), ('NDK', ndk),
                        ('Java', java / 'bin/java'), ('CMake', cmake)]:
        if not path.exists():
            raise FileNotFoundError(label + ': ' + str(path))
    return {'creator': str(creator), 'sdk': str(sdk), 'ndk': str(ndk),
            'java': str(java), 'cmake': str(cmake)}


def export_config(game, stage, env, debug):
    return {
        'name': game['name'], 'platform': 'android', 'outputName': 'android',
        'buildPath': str(stage / 'output'), 'debug': debug, 'md5Cache': False,
        'startScene': game['startScene'],
        'scenes': [{'url': 'db://assets/mods/base-shell/scene.scene', 'uuid': game['startScene']}],
        'packages': {
            'android': {
                'packageName': game['packageName'], 'apiLevel': game['apiLevel'],
                'appABIs': game['appABIs'], 'sdkPath': env['sdk'], 'ndkPath': env['ndk'],
                'javaHome': env['java'], 'useDebugKeystore': debug, 'appBundle': False,
                'orientation': {'portrait': True, 'upsideDown': False,
                                'landscapeLeft': False, 'landscapeRight': False},
                'renderBackEnd': {'vulkan': False, 'gles3': True, 'gles2': True},
            },
            'native': {'encrypted': False, 'makeAfterBuild': False,
                       'JobSystem': 'taskFlow', 'xxteaKey': 'avg-plus-build01'}
        }
    }


def run_logged(command, cwd, log, env):
    with log.open('w') as handle:
        process = subprocess.run(command, cwd=cwd, env=env, stdout=handle, stderr=subprocess.STDOUT)
    if process.returncode not in (0, 36):
        raise RuntimeError(f'Command failed ({process.returncode}); inspect {log}')
    return process.returncode


def configure_startup(assets):
    """Remove Creator's timed default logo only in the isolated channel export."""
    path = Path(assets) / 'src/settings.json'
    settings = json.loads(path.read_text())
    if not isinstance(settings.get('splashScreen'), dict):
        raise ValueError('Unexpected Cocos splash settings contract')
    settings['splashScreen'] = {
        'totalTime': 0, 'displayRatio': 1, 'autoFit': True,
        'logo': {'type': 'none'},
        'background': {'type': 'color', 'color': {'x': 24 / 255, 'y': 14 / 255, 'z': 45 / 255, 'w': 1}},
    }
    write_json(path, settings)
    return {'defaultEngineLogo': False, 'forcedEngineSplashMs': 0,
            'gameLoadingFirstDrawBeforePreparation': True, 'onlyIsolatedExportModified': True}


def audit_native_export(stage, game):
    project = stage / 'output/android/proj'
    properties_path = project / 'gradle.properties'
    properties = properties_path.read_text()
    for key in ['PROP_COMPILE_SDK_VERSION', 'PROP_MIN_SDK_VERSION', 'PROP_TARGET_SDK_VERSION']:
        value = re.search(r'^' + key + r'=(.*)$', properties, re.M)
        if not value or not value.group(1).strip().isdigit():
            raise ValueError('Invalid generated Android SDK property: ' + key)
    # Cocos defaults to a build-tools version that may not be installed locally.
    properties = re.sub(r'^PROP_BUILD_TOOLS_VERSION=.*$',
                        'PROP_BUILD_TOOLS_VERSION=' + game['buildToolsVersion'], properties, flags=re.M)
    properties_path.write_text(properties)
    if not re.fullmatch(r'\d{4}(?:-\d{2}){5}', game['version']) or not isinstance(game['versionCode'], int) or game['versionCode'] < 1:
        raise ValueError('Invalid configured Android application version')
    datetime.strptime(game['version'], '%Y-%m-%d-%H-%M-%S')
    # Creator's native template has hard-coded 1.0/1, independent of its game metadata.
    gradle_path = stage / game['project'] / 'native/engine/android/app/build.gradle'
    gradle = gradle_path.read_text()
    gradle, code_count = re.subn(r'\bversionCode\s+\d+', 'versionCode ' + str(game['versionCode']), gradle)
    gradle, name_count = re.subn(r'\bversionName\s+"[^"]*"', 'versionName "' + game['version'] + '"', gradle)
    if code_count != 1 or name_count != 1:
        raise ValueError('Unexpected Cocos native application version template')
    gradle_path.write_text(gradle)
    log = (stage / 'export.log').read_text()
    missing = sorted(set(re.findall(r'Missing uuid: "([^"]+)"', log)))
    if missing:
        raise ValueError('Native prefab references missing assets: ' + ', '.join(missing))
    return {'numericSdkProperties': True, 'buildToolsVersion': game['buildToolsVersion'],
            'versionName': game['version'], 'versionCode': game['versionCode'], 'missingReferences': []}


def audit_apk(path, game, env):
    tools = Path(env['sdk']) / 'build-tools' / game['buildToolsVersion']
    badging = subprocess.check_output([str(tools / 'aapt'), 'dump', 'badging', str(path)], text=True)
    expected = f"package: name='{game['packageName']}' versionCode='{game['versionCode']}' versionName='{game['version']}'"
    if expected not in badging:
        raise ValueError('APK package/version does not match its configured channel identity')
    xml = subprocess.check_output([str(tools / 'aapt'), 'dump', 'xmltree', str(path), 'AndroidManifest.xml'], text=True)
    activities = []
    current = None
    for line in xml.splitlines():
        element = re.match(r'^(\s*)E: (\w+)', line)
        if element:
            depth = len(element.group(1))
            if current is not None and depth <= current['depth']:
                current = None
            if element.group(2) == 'activity':
                current = {'depth': depth, 'name': '', 'orientation': None}
                activities.append(current)
        if current is None or len(line) - len(line.lstrip()) != current['depth'] + 2:
            continue
        name = re.search(r'android:name\([^)]*\)="([^"]+)"', line)
        orientation = re.search(r'screenOrientation\([^)]*\)=\(type 0x10\)(0x[0-9a-f]+)', line)
        if name:
            current['name'] = name.group(1)
        if orientation:
            current['orientation'] = orientation.group(1)
    launcher = next((activity for activity in activities if activity['name'] == 'com.cocos.game.AppActivity'), None)
    # CocosEditBoxActivity uses BEHIND (3): it follows the portrait activity below it.
    if not launcher or launcher['orientation'] not in ('0x1', '0x7') or any(
            activity['orientation'] not in (None, '0x1', '0x7', '0x3') for activity in activities):
        raise ValueError('APK launcher is not portrait or an auxiliary activity overrides it')
    certificate = subprocess.check_output([str(tools / 'apksigner'), 'verify', '--print-certs', str(path)], text=True,
                                          env=dict(os.environ, JAVA_HOME=env['java']))
    match = re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-f]+)', certificate)
    if not match:
        raise ValueError('APK signature verification did not return a certificate digest')
    native_code = re.search(r"native-code: (.*)", badging)
    abis = re.findall(r"'([^']+)'", native_code.group(1)) if native_code else []
    if sorted(abis) != sorted(game['appABIs']):
        raise ValueError('APK ABI differs from the configured channel')
    return {'packageName': game['packageName'], 'versionName': game['version'], 'versionCode': game['versionCode'],
            'orientation': 'portrait', 'activities': [{k: v for k, v in a.items() if k != 'depth'} for a in activities],
            'abis': abis, 'signatureVerified': True, 'certificateSha256': match.group(1),
            'signing': 'debug-candidate'}


def build(args):
    settings = json.loads((CHANNEL / 'config.json').read_text())
    if args.game not in settings['games']:
        raise ValueError('No Android configuration for game: ' + args.game)
    game = settings['games'][args.game]
    game = dict(game)
    if args.hot_version:
        if not re.fullmatch(r'\d+\.\d+\.\d+\.\d+', args.hot_version):
            raise ValueError('Invalid hot-update version')
        game['hotUpdateVersion'] = args.hot_version
        game['hotUpdateTag'] = 'avg-plus-android-' + args.hot_version
    if args.publish:
        from publish import next_version, base_snapshot, gh
        if gh('auth','status',optional=True)is None:raise RuntimeError('Automatic publication requires one-time GitHub CLI authorization')
        if not args.hot_version:
            game['hotUpdateVersion']=next_version(game);game['hotUpdateTag']='avg-plus-android-'+game['hotUpdateVersion']
        if args.hot_only and not args.delta_base:
            args._delta_snapshot=base_snapshot(game)
    if args.release:
        raise ValueError('Release signing has not been configured; do not label debug APKs as releases')
    env = environment()
    plan = {'game': args.game, 'source': game['project'], 'environment': env,
            'orientation': 'portrait', 'githubRepository': game['githubRepository'],
            'release': False, 'verification': 'pending', 'hotOnly': args.hot_only}
    if args.inspect:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return
    before = inputs(game['project'])
    source_commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    display_version = datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d-%H-%M-%S')
    game['version'] = display_version
    game['displayVersion'] = display_version
    name = 'avg-plus-android-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    stage = ROOT / 'migration/work' / name
    stage.mkdir(parents=True)
    project = stage / game['project']
    for relative in before:
        if relative.startswith(game['project'] + '/'):
            target = stage / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / relative, target)
    if inputs(game['project']) != before:
        raise RuntimeError('Source changed while freezing; previous candidate retained')
    stamp_project(project, game, source_commit, display_version)
    configuration = export_config(game, stage, env, debug=True)
    config_path = stage / 'build-config.json'
    write_json(config_path, configuration)
    # Project profile overrides allow an isolated editor invocation to discover installed tools.
    write_json(project / 'profiles/v2/packages/program.json', {
        '__version__': '1.0.4', 'android_sdk': env['sdk'], 'android_ndk': env['ndk'],
        'androidSDK': {'path': env['sdk']}, 'androidNDK': {'path': env['ndk']},
        'javaHome': {'path': env['java']}, 'cmake': {'path': env['cmake']}})
    child_env = dict(os.environ, JAVA_HOME=env['java'], ANDROID_SDK_ROOT=env['sdk'],
                     ANDROID_HOME=env['sdk'], ANDROID_NDK_HOME=env['ndk'])
    record = dict(plan, item='AVG.ANDROID.01', candidate=name,
                  sourceCommit=source_commit, displayVersion=display_version,
                  sourceMode='local-working-copy', workingInputs=before, stage=str(stage),
                  export='pending', apk='pending', hotUpdate='pending', device='pending', fidelity='pending')
    review = ROOT / 'migration/reviews/avg_plus' / (name + '.json')
    write_json(review, record)
    try:
        print('Exporting frozen project: ' + str(project), flush=True)
        record['exportExitCode'] = run_logged([env['creator'], '--project', str(project), '--build',
            'configPath=' + str(config_path)], ROOT, stage / 'export.log', child_env)
        assets = stage / 'output/android/assets'
        if not (assets / 'main.js').is_file():
            raise RuntimeError('Creator did not export a native main.js')
        record['startup'] = configure_startup(assets)
        record['nativeProjectAudit'] = audit_native_export(stage, game)
        from icons import install as install_icons
        record['icons'] = install_icons(stage, game)
        record['export'] = 'passed'
        record['sourceUnchanged'] = inputs(game['project']) == before
        if not record['sourceUnchanged']:
            raise RuntimeError('Source changed during native export; retained as a candidate')
        write_json(review, record)
        if args.export_only:
            print(json.dumps({'stage': str(stage), 'review': str(review), 'export': 'passed'}))
            return
        from png_storage import compact_assets
        record['pngStorage'] = compact_assets(assets, stage / 'png-storage-originals')
        from hot_update import prepare
        record['hotUpdate'] = prepare(assets, stage / 'hot-update', game, CHANNEL / 'templates')
        from delta import prepare as prepare_delta
        delta_base=json.loads(Path(args.delta_base).read_text()) if args.delta_base else getattr(args,'_delta_snapshot',None)
        record['delta'] = prepare_delta(stage / 'hot-update', delta_base)
        write_json(review, record)
        if args.hot_only:
            record['apk'] = 'not-built: game-only update; existing installation retained'
            if inputs(game['project']) != before:
                raise RuntimeError('Source changed during hot export; candidate retained')
            destination = CHANNEL / args.game / 'hot-update'
            if destination.exists():
                destination.rename(stage / 'previous-hot-delivery')
            try:
                shutil.copytree(stage / 'hot-update', destination)
            except Exception:
                if destination.exists():
                    shutil.rmtree(destination)
                if (stage / 'previous-hot-delivery').exists():
                    (stage / 'previous-hot-delivery').rename(destination)
                raise
            record['delivery'] = str(destination)
            write_json(review, record)
            if args.publish:
                from publish import publish
                print(json.dumps(publish(review,game),ensure_ascii=False,indent=2));return
            print(json.dumps({'delivery': str(destination), 'review': str(review),
                              'apk': 'not-built', 'device': 'pending'}, ensure_ascii=False))
            return
        print('Compiling APK; log: ' + str(stage / 'compile.log'), flush=True)
        record['makeExitCode'] = run_logged([env['creator'], '--project', str(project), '--build',
            'stage=make;configPath=' + str(config_path)], ROOT, stage / 'compile.log', child_env)
        apks = sorted((stage / 'output/android').rglob('*.apk'))
        if not apks:
            raise RuntimeError('Native compile produced no APK')
        record['apk'] = [{'path': str(p), 'bytes': p.stat().st_size,
                          'sha256': hashlib.sha256(p.read_bytes()).hexdigest(),
                          'audit': audit_apk(p, game, env)} for p in apks]
        record['sourceUnchanged'] = inputs(game['project']) == before
        if not record['sourceUnchanged']:
            raise RuntimeError('Source changed during build; candidate retained, fixed output not updated')
        destination = CHANNEL / args.game
        replacement = stage / 'delivery'
        replacement.mkdir()
        for apk in apks:
            shutil.copy2(apk, replacement / apk.name)
        shutil.copytree(stage / 'hot-update', replacement / 'hot-update')
        write_json(replacement / 'build-record.json', record)
        if destination.exists():
            destination.rename(stage / 'previous-delivery')
        try:
            shutil.copytree(replacement, destination)
        except Exception:
            if destination.exists():
                shutil.rmtree(destination)
            if (stage / 'previous-delivery').exists():
                (stage / 'previous-delivery').rename(destination)
            raise
        record['delivery'] = str(destination)
        write_json(review, record)
        if args.publish:
            from publish import publish
            print(json.dumps(publish(review,game),ensure_ascii=False,indent=2));return
        print(json.dumps({'delivery': str(destination), 'review': str(review), 'device': 'pending',
                          'fidelity': 'pending'}, ensure_ascii=False))
    except Exception as error:
        record['failure'] = {'message': str(error), 'logs': [str(p) for p in stage.glob('*.log')]}
        write_json(review, record)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', required=True)
    parser.add_argument('--inspect', action='store_true', help='Print verified local tool paths without building')
    parser.add_argument('--export-only', action='store_true', help='Export a candidate native project without claiming APK delivery')
    parser.add_argument('--release', action='store_true')
    parser.add_argument('--hot-only', action='store_true', help='Export game scripts/resources without compiling or replacing the APK')
    parser.add_argument('--hot-version', help='Allocate a hot-resource version without editing the game/channel source configuration')
    parser.add_argument('--delta-base', help='Verified prior content snapshot; emits only changed files in the delta delivery')
    parser.add_argument('--publish', action='store_true', help='Automatically upload verified necessary client artifacts, verify Pages, and clean build outputs')
    build(parser.parse_args())


if __name__ == '__main__':
    main()
