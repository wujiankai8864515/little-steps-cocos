#!/usr/bin/env python3
"""Assemble Pages from verified release assets; source code is never copied into the site."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import urllib.request
import zipfile


def request(url, maximum=2 * 1024 * 1024):
    headers = {'User-Agent': 'AVG-Plus-Pages', 'Accept': 'application/vnd.github+json'}
    token = os.environ.get('GITHUB_TOKEN')
    if token and url.startswith('https://api.github.com/'):
        headers['Authorization'] = 'Bearer ' + token
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as response:
        data = response.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError('Release asset exceeds configured size limit')
    return data


def validate_payload(manifest, payload, base):
    version = manifest.get('version', '')
    if not re.fullmatch(r'\d+\.\d+\.\d+\.\d+', version):
        raise ValueError('Invalid hot-update version')
    if manifest.get('packageUrl') != base + 'versions/' + version + '/':
        raise ValueError('Release manifest must reference its immutable Pages version directory')
    if manifest.get('remoteManifestUrl') != base + 'latest/avg-plus-project.manifest':
        raise ValueError('Release points to an unexpected update channel')
    if manifest.get('remoteVersionUrl') != base + 'latest/avg-plus-version.manifest':
        raise ValueError('Release points to an unexpected version channel')
    if manifest.get('searchPaths') != [''] or set(manifest.get('assets', {})) != {'avg-plus-assets.zip'}:
        raise ValueError('Unsupported update archive or search path')
    asset = manifest['assets']['avg-plus-assets.zip']
    if asset.get('compressed') is not True or asset.get('size') != len(payload):
        raise ValueError('Release ZIP size/compression mismatch')
    if asset.get('md5') != hashlib.sha256(payload).hexdigest():
        raise ValueError('Release ZIP SHA-256 mismatch')
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        total = 0
        for entry in archive.infolist():
            path = PurePosixPath(entry.filename)
            if path.is_absolute() or '..' in path.parts or '\\' in entry.filename or not path.parts or path.parts[0] not in ['src', 'assets']:
                raise ValueError('Archive path escapes game payload')
            if 'cocos-js' in path.parts or (entry.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Archive must not contain engine replacement or symlinks')
            total += entry.file_size
        if total > 256 * 1024 * 1024 or len(archive.infolist()) > 10000:
            raise ValueError('Expanded update is too large')
        if archive.testzip() is not None:
            raise ValueError('Corrupt ZIP entry')
    return version


def releases(repository):
    result = []
    for page in range(1, 101):
        items = json.loads(request(f'https://api.github.com/repos/{repository}/releases?per_page=100&page={page}'))
        if not isinstance(items, list):
            raise ValueError('Unexpected releases API response')
        result.extend(item for item in items if not item.get('draft'))
        if len(items) < 100:
            return result
    raise ValueError('Too many release pages')


def assemble(repository, destination, fetch=request, release_list=None):
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
        raise ValueError('Invalid repository')
    owner, name = repository.split('/')
    base = f'https://{owner}.github.io/{name}/avg-plus/android/'
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=False)
    versions = {}
    for release in releases(repository) if release_list is None else release_list:
        names = {asset['name']: asset for asset in release.get('assets', [])}
        required = ['avg-plus-project.manifest', 'avg-plus-version.manifest', 'avg-plus-assets.zip']
        if not all(name in names for name in required):
            continue
        manifest_bytes = fetch(names[required[0]]['browser_download_url'])
        manifest = json.loads(manifest_bytes)
        payload = fetch(names[required[2]]['browser_download_url'], 128 * 1024 * 1024)
        version = validate_payload(manifest, payload, base)
        digest = hashlib.sha256(payload).hexdigest()
        if version in versions and (versions[version]['sha256'] != digest or
                                    versions[version]['manifestBytes'] != manifest_bytes):
            raise ValueError('A previously published version was changed')
        version_manifest_bytes = fetch(names[required[1]]['browser_download_url'])
        version_manifest = json.loads(version_manifest_bytes)
        for key in ['version', 'engineVersion', 'nativeCompatibility', 'remoteManifestUrl', 'remoteVersionUrl']:
            if version_manifest.get(key) != manifest.get(key):
                raise ValueError('Version and project manifests disagree')
        folder = destination / 'avg-plus/android/versions' / version
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'avg-plus-assets.zip').write_bytes(payload)
        (folder / required[0]).write_bytes(manifest_bytes)
        (folder / required[1]).write_bytes(version_manifest_bytes)
        versions[version] = {'version': version, 'sha256': digest, 'tag': release['tag_name'],
                             'releaseUrl': release['html_url'], 'manifestBytes': manifest_bytes,
                             'versionBytes': version_manifest_bytes}
    if versions:
        current = max(versions, key=lambda value: tuple(map(int, value.split('.'))))
        latest = destination / 'avg-plus/android/latest'
        latest.mkdir(parents=True)
        (latest / 'avg-plus-project.manifest').write_bytes(versions[current]['manifestBytes'])
        (latest / 'avg-plus-version.manifest').write_bytes(versions[current]['versionBytes'])
        text = f'当前资源版本：{current}。安卓安装包见对应版本发布页。'
    else:
        current = None
        text = '安卓更新资源正在准备。'
    index = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AVG Plus 安卓更新</title><body><main><h1>AVG Plus 安卓更新</h1><p>''' + text + '''</p><p><a href="https://github.com/''' + repository + '''/releases">安卓版本下载</a></p></main></body></html>'''
    (destination / 'index.html').write_text(index)
    (destination / '.nojekyll').touch()
    record = {'repository': repository, 'baseUrl': base, 'latestVersion': current,
              'versions': [{key: value for key, value in entry.items() if not key.endswith('Bytes')} for entry in versions.values()]}
    (destination / 'deployment.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(record, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', required=True)
    parser.add_argument('--destination', required=True)
    args = parser.parse_args()
    assemble(args.repository, args.destination)


if __name__ == '__main__':
    main()
