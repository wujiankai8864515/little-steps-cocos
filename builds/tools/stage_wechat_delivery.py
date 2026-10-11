#!/usr/bin/env python3
"""Separate the audited local WeChat package from CDN files; never upload or publish."""
import argparse
import json
import shutil
import zipfile
from pathlib import Path
from audit_wechat_candidate import audit
from create_wechat_candidate import ROOT, sha


def stage_delivery(name):
    if not name or not all(c.isalnum() or c in '-_' for c in name):
        raise ValueError('Invalid candidate name')
    report = audit(name)
    if not all(report['checks'].values()):
        raise ValueError('Packaging audit failed; refusing to stage a delivery')
    destination = ROOT / 'builds/output' / name
    if destination.exists():
        raise FileExistsError('Do not replace previous delivery evidence')
    source = ROOT / 'builds/work' / name / 'output/wechatgame'
    destination.mkdir(parents=True)
    files = []
    for item in report['files']:
        relative = item['path']
        origin = source / relative
        target = destination / ('cdn' if item['bucket'].startswith('remote/') else 'package') / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(origin, target)
        if sha(target) != item['sha256']:
            raise ValueError('Delivery copy hash mismatch: ' + relative)
        files.append({'path': target.relative_to(destination).as_posix(),
                      'bytes': item['bytes'], 'sha256': item['sha256']})
    local = [item for item in files if item['path'].startswith('package/')]
    assert sum(item['bytes'] for item in local) == report['rawLocalPackageBytes']
    # CDN files never reside in the directory imported by WeChat DevTools, so
    # the uploader cannot silently add remote resources back into the main pack.
    assert not (destination / 'package/remote').exists()
    archive = destination / 'wechat-candidate.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zipped:
        for item in local:
            info = zipfile.ZipInfo(item['path'][len('package/'):], (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            zipped.writestr(info, (destination / item['path']).read_bytes())
    receipt = {
        'schema': 1, 'candidate': name, 'kind': 'WeChat packaging candidate, not release',
        'sourceCommit': report['sourceCommit'], 'inputInventorySHA256': report['inventorySHA256'],
        'packageDirectory': str(destination / 'package'), 'cdnRoot': str(destination / 'cdn'),
        'localFileCount': len(local), 'rawLocalPackageBytes': report['rawLocalPackageBytes'],
        'archive': {'path': str(archive), 'bytes': archive.stat().st_size, 'sha256': sha(archive)},
        'allCopiesByteVerified': True, 'remoteFilesInsidePackage': False,
        'pending': report['pending'], 'files': files,
    }
    (destination / 'delivery.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--name', required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    result = stage_delivery(args.name)
    args.receipt.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'files'}, ensure_ascii=False))
