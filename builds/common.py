"""Shared packaging paths, source gates, template links and HTTP transport."""
import hashlib
import json
import os
import re
import shutil
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def capture_inputs(root=ROOT):
    """Fingerprint saved runtime inputs, excluding outputs and editor caches."""
    root = Path(root)
    inputs = []
    folders = ['engines/travel-core/src', 'engines/travel-core/dist',
               'engines/travel-core/vendor', 'games/xiaoyu-cocos/assets',
               'games/xiaoyu-cocos/settings', 'games/xiaoyu-cocos/package.json',
               'builds/wechatgame/templates', 'builds/wechatgame/config.json']
    for relative in folders:
        source = root / relative
        paths = [source] if source.is_file() else sorted(source.rglob('*'))
        for path in paths:
            if path.is_file() and path.name != '.DS_Store' and '__pycache__' not in path.parts:
                inputs.append({'path': path.relative_to(root).as_posix(), 'sha256': sha(path),
                               'symlink': str(path.readlink()) if path.is_symlink() else None})
    return inputs

def require_current_inputs(manifest, root=ROOT):
    if manifest.get('sourceMode') == 'local-working-copy':
        expected = manifest.get('workingInputs')
        if expected is None or expected != capture_inputs(root):
            raise ValueError('构建期间游戏、框架或渠道模板已改变；请重新打包，当前项目未覆盖。')

def relocate_path(path, root=ROOT):
    """Read old evidence paths without rewriting immutable historical manifests."""
    path = Path(path)
    if not path.is_absolute():
        path = Path(root) / path
    old = Path(root) / 'builds'
    if path.is_relative_to(old):
        relative = path.relative_to(old)
        if relative.parts and relative.parts[0] in ('work', 'output', 'records', 'reviews', 'qa', 'oracles'):
            migrated = Path(root) / 'migration' / relative
            if migrated.exists():
                return migrated
    return path

def template_sources(root=ROOT):
    root = Path(root)
    sources = [path.relative_to(root).as_posix() for path in sorted((root / 'builds').glob('*/templates')) if path.is_dir()]
    if (root / 'migration/templates').is_dir():
        sources.append('migration/templates')
    return sources

def install_templates(root=ROOT):
    root = Path(root)
    project_templates = root / 'games/xiaoyu-cocos/build-templates'
    channel_templates = root / 'builds/wechatgame/templates'
    # Previously frozen commits keep their original native template link.
    if not channel_templates.is_dir() and (root / 'builds/templates/wechatgame').is_dir():
        if not project_templates.is_symlink() or project_templates.readlink() != Path('../../builds/templates'):
            raise ValueError('Unexpected legacy template layout')
        return project_templates
    if not channel_templates.is_dir():
        raise ValueError('Missing builds/wechatgame/templates')
    if project_templates.is_symlink():
        if project_templates.readlink() != Path('../../builds/templates'):
            raise ValueError('Unexpected old template link')
        project_templates.unlink()
    project_templates.mkdir(exist_ok=True)
    ownership = project_templates / '.managed-platforms.json'
    managed = set(json.loads(ownership.read_text())) if ownership.exists() else set()
    for source in template_sources(root):
        folder = root / source
        # Production channels each own their template; optional migration-only
        # templates remain outside the packaging repository.
        targets = [(folder.parent.name, folder)] if source != 'migration/templates' else [(p.name, p) for p in folder.iterdir() if p.is_dir()]
        for platform, target in targets:
            mirror = project_templates / platform
            relative = Path(os.path.relpath(target, mirror.parent))
            if mirror.is_symlink():
                if mirror.readlink() != relative:
                    raise ValueError('Unexpected template target: ' + platform)
                mirror.unlink()
            elif mirror.exists() and platform not in managed:
                raise ValueError('Refusing to replace a real platform template directory')
            # Creator's fs-extra copy treats a platform-directory symlink as a
            # file. Keep the authoritative template in its channel and give
            # Creator a real, generated directory on every build instead.
            if mirror.exists():
                shutil.rmtree(mirror)
            shutil.copytree(target, mirror, symlinks=False)
            managed.add(platform)
            ownership.write_text(json.dumps(sorted(managed)) + '\n')
    return project_templates / 'wechatgame'


def catalog_path(project):
    assets=Path(project)/'assets'
    original=assets/'resources/source-catalog.json'
    return original if original.is_file() else assets/'bundles/runtime_data/source-catalog.json'

def check_catalog(project):
    assets = Path(project) / 'assets'
    catalog = json.loads(catalog_path(project).read_text())
    expected = set()
    for key, spec in catalog['assets'].items():
        kind, path = spec['kind'], spec['path']
        if kind == 'procedural':
            if not spec.get('procedural'):
                raise ValueError('Missing procedural recipe: ' + key)
            continue
        if kind == 'texture':
            if not path.endswith('/texture'):
                raise ValueError('Unexpected texture subasset: ' + key)
            path = path[:-len('/texture')] + '.png'
        elif kind in ('mask', 'json', 'font', 'image'):
            path += {'mask': '.json', 'json': '.json', 'font': '.ttf', 'image': '.png'}[kind]
        elif kind == 'audio':
            ext = Path(key).suffix
            if ext not in ('.mp3', '.wav'):
                raise ValueError('Unexpected audio type: ' + key)
            path += ext
        else:
            raise ValueError('Unverified catalogue kind: ' + kind)
        expected.add('bundles/' + spec['bundle'] + '/' + path)
    for name, group in catalog['groups'].items():
        if group.get('cocosAlpha'):
            expected.add('bundles/' + name + '/' + group['cocosAlpha']['path'] + '.json')
    missing = []
    for relative in sorted(expected):
        target = assets / relative
        if not target.resolve().is_relative_to(assets.resolve()):
            raise ValueError('Catalogue path outside assets')
        for file in (target, Path(str(target) + '.meta')):
            if not file.is_file():
                missing.append(str(file.relative_to(assets)))
    return {'catalogAssets': len(catalog['assets']), 'sourceFiles': len(expected), 'missing': missing}

HOME_LIMIT = 19_000_000
STARTUP = frozenset(('core_code', 'shared_boot_ui'))
OPTIONAL = frozenset(('travel_visual', 'departure_visual', 'darkroom', 'photo_visual',
                      'wardrobe_visual', 'outfit_visual'))


def audit_home_payload(project, output, remote_bundles):
    groups = json.loads(catalog_path(project).read_text())['groups']
    startup = frozenset(('main','loading','internal')) if 'runtime_data' in groups else STARTUP
    output = Path(output)
    remote = set(remote_bundles)
    visiting, visited, bundles, excluded, errors = set(), set(), [], [], []

    def visit(name):
        if not isinstance(name, str) or not re.fullmatch(r'[a-zA-Z0-9_-]+', name):
            raise ValueError('Invalid Home dependency name')
        if name in visiting:
            raise ValueError('Cyclic Home dependency: ' + name)
        if name in visited:
            return
        if name not in groups:
            raise ValueError('Unknown Home dependency: ' + name)
        visiting.add(name)
        for dependency in groups[name].get('depends_on', []):
            visit(dependency)
        root = output / ('remote' if name in remote else 'assets') / name
        if name not in remote and (output / 'subpackages' / name).is_dir():
            root = output / 'subpackages' / name
        configs = list(root.glob('config*.json'))
        if len(configs) != 1:
            raise ValueError('Expected one output bundle config: ' + name)
        config = json.loads(configs[0].read_text())
        if config.get('name') != name:
            raise ValueError('Output bundle identity mismatch: ' + name)
        for dependency in config.get('deps', []):
            visit(dependency)
        paths = sorted(p for p in root.rglob('*') if p.is_file())
        if not paths or any(not p.resolve().is_relative_to(output.resolve()) for p in paths):
            raise ValueError('Missing or escaping output bundle: ' + name)
        row = {'name': name, 'directory': root.relative_to(output).as_posix(),
               'fileCount': len(paths), 'rawBytes': sum(p.stat().st_size for p in paths)}
        (excluded if name in startup else bundles).append(row)
        visiting.remove(name)
        visited.add(name)

    try:
        visit('home')
    except (KeyError, TypeError, ValueError, OSError) as error:
        errors.append(str(error))
    forbidden = sorted(visited & OPTIONAL)
    total = sum(row['rawBytes'] for row in bundles)
    passed = not errors and not forbidden and total <= HOME_LIMIT
    return {'status': 'passed_static_closure_only' if passed else 'failed',
            'passed': passed, 'limitBytes': HOME_LIMIT, 'rawDeferredBytes': total,
            'excessBytes': max(0, total - HOME_LIMIT), 'bundles': bundles,
            'excludedStartupBundles': excluded, 'forbiddenDependencies': forbidden,
            'errors': errors, 'method': 'Exact output bytes of the transitive Home bundle closure; excluded startup bundles: '+','.join(sorted(startup))+'. Not network transfer, startup time or memory.',
            'sourceContract': 'little-steps/build/check_loading_contract.py: Home non-startup dependency packs <= 19,000,000 bytes; no travel/departure dependency.'}

class PreviewHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        self.remaining = None
        path = self.translate_path(self.path)
        header = self.headers.get('Range')
        if not header or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', header)
        start, end = 0, size - 1
        valid = bool(match and size)
        if valid:
            first, last = match.groups()
            if first:
                start = int(first)
                end = min(int(last), size - 1) if last else size - 1
                valid = start <= end and start < size
            elif last and int(last) > 0:
                start = max(0, size - int(last))
            else:
                valid = False
        if not valid:
            self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            self.send_header('Content-Range', f'bytes */{size}')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        source = open(path, 'rb')
        source.seek(start)
        self.remaining = end - start + 1
        self.send_response(HTTPStatus.PARTIAL_CONTENT)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(self.remaining))
        self.send_header('Last-Modified', self.date_time_string(os.path.getmtime(path)))
        self.end_headers()
        return source

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def copyfile(self, source, outputfile):
        try:
            if self.remaining is None:
                super().copyfile(source, outputfile)
                return
            while self.remaining:
                chunk = source.read(min(64 * 1024, self.remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                self.remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            # A media element may stop reading a range when paused or destroyed.
            pass
