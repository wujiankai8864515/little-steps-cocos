"""Build immutable GitHub Release payloads for the native AssetsManager."""
import hashlib
import json
from pathlib import Path
import re
import zipfile


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def prepare(assets, output, game, templates):
    assets, output, templates = Path(assets), Path(output), Path(templates)
    repository, tag = game['githubRepository'], game['hotUpdateTag']
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
        raise ValueError('Invalid GitHub repository')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+', tag):
        raise ValueError('Invalid immutable release tag')
    if not re.fullmatch(r'\d+\.\d+\.\d+\.\d+', game['hotUpdateVersion']):
        raise ValueError('Hot-update versions must contain four numeric components')
    output.mkdir(parents=True, exist_ok=False)
    owner, name = repository.split('/')
    base = game['hotUpdateBaseUrl']
    if base != f'https://{owner}.github.io/{name}/avg-plus/android/':
        raise ValueError('Pages URL must point to the configured repository and Android resource folder')
    manifest_url = base + 'latest/avg-plus-project.manifest'
    identity = {
        'nativeCompatibility': game['nativeCompatibility'],
        'packageName': game['packageName'], 'githubRepository': repository,
        'remoteManifestUrl': manifest_url,
        'hotUpdateBaseUrl': base,
        'version': game['hotUpdateVersion'], 'engineVersion': '3.8.8'
    }
    write(assets / 'avg-plus-native.json', identity)
    main = assets / 'main.js'
    original = main.read_text()
    hook = (templates / 'hot-update-bootstrap.js').read_text()
    if '// Runs before SystemJS' in original:
        raise ValueError('Startup hook already installed; use a fresh frozen export')
    main.write_text(hook + '\n' + original)
    # The engine/adapter and native identity are APK contracts. Game code/config/art remain updatable.
    sources = [p for folder in ['src', 'assets'] for p in (assets / folder).rglob('*')
               if p.is_file() and not (folder == 'src' and 'cocos-js' in p.relative_to(assets).parts)]
    if not sources:
        raise ValueError('No game scripts/assets in the native export')
    payload = output / 'avg-plus-assets.zip'
    files = []
    with zipfile.ZipFile(payload, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for source in sorted(sources):
            relative = source.relative_to(assets).as_posix()
            data = source.read_bytes()
            # Stable metadata prevents unrelated rebuild timestamps from changing every ZIP.
            info = zipfile.ZipInfo(relative, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data)
            files.append({'path': relative, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    # Legacy APK verification compares native Asset.size (float) with the exact JSON integer.
    # A legal ZIP comment aligns its length so float32 remains exact up to the 128 MiB limit.
    padding = (-payload.stat().st_size) % 32
    if padding:
        with zipfile.ZipFile(payload, 'a') as archive:
            archive.comment = b' ' * padding
    digest = hashlib.sha256(payload.read_bytes()).hexdigest()
    manifest = {
        'packageUrl': base + 'versions/' + game['hotUpdateVersion'] + '/',
        'remoteManifestUrl': manifest_url,
        'remoteVersionUrl': base + 'latest/avg-plus-version.manifest',
        'version': game['hotUpdateVersion'], 'engineVersion': '3.8.8',
        'displayVersion': game.get('displayVersion', ''),
        'nativeCompatibility': game['nativeCompatibility'],
        'assets': {'avg-plus-assets.zip': {
            'size': payload.stat().st_size, 'md5': digest, 'compressed': True
        }},
        'searchPaths': ['']
    }
    write(assets / 'project.manifest', manifest)
    write(output / 'avg-plus-project.manifest', manifest)
    write(output / 'avg-plus-version.manifest', {k: manifest[k] for k in
        ['version', 'engineVersion', 'nativeCompatibility', 'remoteManifestUrl', 'remoteVersionUrl']})
    record = {'repository': repository, 'tag': tag, 'version': game['hotUpdateVersion'],
              'displayVersion': game.get('displayVersion', ''),
              'nativeCompatibility': game['nativeCompatibility'], 'zipBytes': payload.stat().st_size,
              'sha256': digest, 'files': files, 'engineExcluded': True, 'legacyFloatSizeAligned': True,
              'nativeDeviceUpgrade': 'pending', 'githubDownload': 'pending'}
    write(output / 'payload-record.json', record)
    return record
