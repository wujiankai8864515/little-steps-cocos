#!/usr/bin/env python3
"""Build once, then refresh builds/wechatgame for WeChat DevTools."""
import argparse
import fcntl
import json
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen
from audit_wechat_candidate import audit
from build_templates import install
from create_wechat_candidate import ROOT, freeze, sha
from serve_wechat import DIRECTORY, HEALTH_PATH

CACHE = ROOT / 'builds/.cache'
DESTINATION = ROOT / 'builds/wechatgame'
STATE = CACHE / 'wechat-workspace.json'
CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def update_files(prepared, destination):
    """Keep the watched project directory and update the entry after dependencies."""
    destination.mkdir(parents=True, exist_ok=True)
    files = [path for path in prepared.rglob('*') if path.is_file()]
    expected = {path.relative_to(prepared).as_posix() for path in files}
    files.sort(key=lambda path: (path.name in ('game.js', 'project.config.json'), path.as_posix()))
    for origin in files:
        target = destination / origin.relative_to(prepared)
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.is_file() or sha(origin) != sha(target):
            origin.replace(target)
    for target in list(destination.rglob('*')):
        if target.is_file() and target.relative_to(destination).as_posix() not in expected:
            target.unlink()
    for folder in sorted((path for path in destination.rglob('*') if path.is_dir()),
                         key=lambda path: len(path.parts), reverse=True):
        if not any(folder.iterdir()):
            folder.rmdir()


def refresh(name, report):
    # A DevTools workspace may be useful while product budget acceptance is still
    # pending. It is always a candidate; stage_wechat_delivery keeps every gate.
    failed = [key for key, passed in report['checks'].items()
              if not passed and key != 'homeDeferredClosureWithin19MB']
    if failed:
        raise ValueError('Refusing to replace working project: ' + ', '.join(failed))
    stage = ROOT / 'builds/work' / name
    source = stage / 'output/wechatgame'
    package = json.loads((source / 'project.config.json').read_text())
    if package.get('compileType') != 'game' or package.get('miniprogramRoot') != './':
        raise ValueError('Invalid WeChat DevTools project root')
    previous = json.loads(STATE.read_text()) if STATE.exists() else None
    if DESTINATION.exists() and previous is None:
        raise ValueError('Existing workspace has no ownership record; refusing to replace it')
    if DESTINATION.is_symlink() or DIRECTORY.is_symlink():
        raise ValueError('Output roots must be real directories')
    prepared = stage / 'workspace'
    prepared.mkdir()
    local, cdn = prepared / 'wechatgame', prepared / 'cdn'
    local.mkdir()
    cdn.mkdir()
    owned = []
    for item in report['files']:
        relative = Path(item['path'])
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('Invalid generated path')
        target = (cdn if item['bucket'].startswith('remote/') else local) / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / relative, target)
        if sha(target) != item['sha256']:
            raise ValueError('Generated copy differs: ' + str(relative))
        if not item['bucket'].startswith('remote/'):
            owned.append(relative.as_posix())
    # Only previous generated paths belong to the builder. Personal DevTools
    # settings and user-added files survive; removed generated files disappear.
    preserved = []
    if previous:
        prior_owned = set(previous['generatedFiles'])
        for origin in sorted(DESTINATION.rglob('*')):
            if origin.is_symlink():
                raise ValueError('Workspace contains a symlink: ' + str(origin))
            if not origin.is_file():
                continue
            relative = origin.relative_to(DESTINATION)
            if relative.as_posix() in prior_owned and relative.name != 'project.private.config.json':
                continue
            target = local / relative
            if target.exists() and relative.name != 'project.private.config.json':
                raise ValueError('New build conflicts with user-added file: ' + str(relative))
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(origin, target)
            preserved.append(relative.as_posix())
    backup_local, backup_cdn = stage / 'previous-wechatgame', stage / 'previous-cdn'
    DIRECTORY.parent.mkdir(parents=True, exist_ok=True)
    had_local, had_cdn = DESTINATION.exists(), DIRECTORY.exists()
    # A failed backup must leave the original untouched, including when only
    # part of the backup could be copied.
    if had_local:
        shutil.copytree(DESTINATION, backup_local)
    try:
        if had_cdn:
            DIRECTORY.rename(backup_cdn)
        update_files(local, DESTINATION)
        cdn.rename(DIRECTORY)
        state = {'schema': 1, 'candidate': name, 'directory': str(DESTINATION),
                 'cdnDirectory': str(DIRECTORY), 'sourceCommit': report['sourceCommit'],
                 'generatedFiles': owned, 'preservedFiles': preserved,
                 'status': 'local-devtools-candidate-not-release',
                 'homePayloadPassed': report['checks']['homeDeferredClosureWithin19MB']}
        write_json(STATE, state)
    except Exception:
        if had_local and backup_local.exists():
            # Roll back files without replacing the root watched by DevTools.
            restore = prepared / 'restore'
            shutil.copytree(backup_local, restore)
            update_files(restore, DESTINATION)
        elif not had_local and DESTINATION.exists():
            shutil.rmtree(DESTINATION)
        if DIRECTORY.exists() and not cdn.exists():
            DIRECTORY.rename(cdn)
        if had_cdn and backup_cdn.exists():
            backup_cdn.rename(DIRECTORY)
        raise
    write_json(ROOT / 'builds/reviews' / (name + '-workspace.json'), state)
    return state


def ensure_server(server):
    address = urlsplit(server)
    if address.hostname != '127.0.0.1' or address.scheme != 'http' or address.path not in ('', '/'):
        return {'url': server, 'mode': 'external-server-not-started'}
    url = server.rstrip('/') + HEALTH_PATH

    def healthy():
        try:
            with urlopen(url, timeout=1) as response:
                data = json.load(response)
            return data.get('directory') == str(DIRECTORY)
        except (OSError, ValueError):
            return False

    if healthy():
        return {'url': server, 'mode': 'existing-local-server'}
    CACHE.mkdir(parents=True, exist_ok=True)
    with (CACHE / 'wechat-server.log').open('ab') as log:
        process = subprocess.Popen([sys.executable, str(ROOT / 'builds/tools/serve_wechat.py'),
                                    '--port', str(address.port or 80)],
                                   cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                   start_new_session=True)
    for _ in range(30):
        if healthy():
            write_json(CACHE / 'wechat-server.json', {'pid': process.pid, 'url': server})
            return {'pid': process.pid, 'url': server, 'mode': 'started-local-server'}
        if process.poll() is not None:
            break
        time.sleep(0.1)
    if process.poll() is None:
        process.terminate()
    raise RuntimeError('Local resource server unavailable; inspect builds/.cache/wechat-server.log')


def run(args):
    settings = json.loads((ROOT / 'builds/configs/wechatgame.json').read_text())
    server = args.server or settings['server']
    if args.serve_only:
        return {'project': str(DESTINATION), 'resourceServer': ensure_server(server)}
    install()
    name = args.name or datetime.now(timezone.utc).strftime('wechat-%Y%m%dT%H%M%S%fZ')
    record = ROOT / 'builds/records/candidates' / (name + '.json')
    log_path = ROOT / 'builds/reviews' / (name + '-build.log')
    if args.stage_existing:
        manifest = json.loads(record.read_text())
        server = manifest['resourceServer']
    else:
        result = freeze(name, args.readback.resolve() if args.readback else None,
                        server, args.appid or settings['appid'], settings['trimUnused'])
        manifest = json.loads(Path(result['manifest']).read_text())
        print(json.dumps({'candidate': name, 'buildLog': str(log_path)}, ensure_ascii=False), flush=True)
        with log_path.open('w') as log:
            completed = subprocess.run(manifest['command'], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
        manifest['buildExitCode'] = completed.returncode
        manifest['build'] = 'passed' if completed.returncode == 36 else 'failed'
        write_json(record, manifest)
        if completed.returncode != 36:
            raise RuntimeError('Creator build failed; see ' + str(log_path))
    report = audit(name)
    write_json(ROOT / 'builds/reviews' / (name + '-package.json'), report)
    state = refresh(name, report)
    state['resourceServer'] = ensure_server(server)
    if args.open:
        completed = subprocess.run([CLI, 'open', '--project', str(DESTINATION)], cwd=ROOT)
        state['devtoolsOpen'] = 'opened' if completed.returncode == 0 else 'manual-import-required'
        if completed.returncode:
            state['devtoolsHint'] = '开发者工具命令行不可用；在工具中导入 builds/wechatgame。构建与固定目录更新已完成。'
    return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--name', help='Optional evidence name; normally generated automatically')
    parser.add_argument('--readback', type=Path, help='Build the recorded remote revision; default is local working copy')
    parser.add_argument('--appid', help='Override builds/configs/wechatgame.json')
    parser.add_argument('--server', help='Override the remote resource root')
    parser.add_argument('--stage-existing', action='store_true', help='Refresh from an already built named candidate')
    parser.add_argument('--serve-only', action='store_true', help='Restart resource server after reboot without rebuilding')
    parser.add_argument('--open', action='store_true', help='Open fixed project using installed WeChat DevTools CLI')
    args = parser.parse_args()
    if args.stage_existing and (not args.name or args.readback or args.appid or args.server):
        parser.error('--stage-existing requires --name and no build overrides')
    if args.name and (not args.name.isascii() or not all(c.isalnum() or c in '-_' for c in args.name)):
        parser.error('Invalid candidate name')
    CACHE.mkdir(parents=True, exist_ok=True)
    with (CACHE / 'wechat-build.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            result = run(args)
        except Exception as error:
            failure = {'trigger': vars(args) | {'readback': str(args.readback) if args.readback else None},
                       'error': str(error), 'device': 'pending', 'release': 'not-created'}
            filename = datetime.now(timezone.utc).strftime('M12-build-workspace-failure-%Y%m%dT%H%M%S%fZ.json')
            write_json(ROOT / 'builds/reviews' / filename, failure)
            raise
    print(json.dumps({key: value for key, value in result.items() if key != 'generatedFiles'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
