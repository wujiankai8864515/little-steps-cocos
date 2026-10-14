#!/usr/bin/env python3
"""Read inert art/layout data from the public Laya DCC asset container.

Never executes source-package scripts. The original package remains in cache;
only images, fonts, audio, and declarative layout/data are read as references.
"""
from pathlib import Path
import hashlib
import json
import re
import struct

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / 'migration/.cache/zhaoyunyuadou'
DCC = CACHE / 'original-assets/assets/cache/dcc2.0'
OUTPUT = CACHE / 'reference-data'
ALLOWED = {'.png', '.jpg', '.jpeg', '.webp', '.ttf', '.otf', '.fnt',
           '.atlas', '.mp3', '.wav', '.ogg', '.json', '.lh', '.ls',
           '.lmat', '.txt', '.prefab', '.scene', '.xml'}


def read_object(identity):
    payload = (DCC / 'objects' / identity[:2] / identity[2:]).read_bytes()
    if payload[:8] != b'layadcc2':
        raise ValueError('Unrecognized container')
    size = struct.unpack('<I', payload[20:24])[0]
    if size > 64_000_000 or len(payload) != size + 24:
        raise ValueError('Invalid object length')
    key = payload[12:20]
    return bytes(value ^ key[index % 8] for index, value in enumerate(payload[24:]))


def walk(identity, directory=Path()):
    data = read_object(identity)
    if not data.startswith(b'tree '):
        raise ValueError('Expected asset directory')
    for item in re.finditer(rb'(40000|100644) ([^\x00]+)\x00(.{20})', data, re.S):
        mode, raw_name, raw_hash = item.groups()
        name = raw_name.decode('utf-8')
        if '/' in name or '\\' in name or name in {'.', '..'}:
            raise ValueError('Unsafe path')
        relative = directory / name
        child = raw_hash.hex()
        if mode == b'40000':
            yield from walk(child, relative)
        elif relative.suffix.lower() in ALLOWED:
            contents = read_object(child)
            target = OUTPUT / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(contents)
            yield {'path': relative.as_posix(), 'sha256': hashlib.sha256(contents).hexdigest(),
                   'bytes': len(contents), 'object': child}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    records = list(walk(json.loads((DCC / 'head.json').read_text())['root']))
    evidence = ROOT / 'migration/reviews/zhaoyunyuadou/reference/package-assets.json'
    evidence.write_text(json.dumps({'scope': 'Inert art/layout reference only; source scripts excluded',
                                   'source': 'https://apkpure.net/赵云与阿斗/com.zyyad.mihuan/download',
                                   'packageSHA256': hashlib.sha256((CACHE / 'reference-original.xapk').read_bytes()).hexdigest(),
                                   'files': records}, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'files': len(records), 'output': str(OUTPUT), 'evidence': str(evidence)}))


if __name__ == '__main__':
    main()
