#!/usr/bin/env python3
"""Re-encode exact CPU alpha planes; never change image/audio/font bytes."""
import hashlib
import json
import subprocess
from pathlib import Path
from PIL import Image
from alpha_codec import encode_masks, plane

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'games/xiaoyu-cocos/assets'


def compact():
    catalog_path = ASSETS / 'resources/source-catalog.json'
    catalog = json.loads(catalog_path.read_text())
    groups, rows, prepared = [], [], []
    for path in sorted((ASSETS / 'bundles').glob('*/alpha-masks.json')):
        old = path.read_bytes()
        source = json.loads(old)
        masks = source['masks'] if source.get('schema') == 2 else source
        for resource, mask in masks.items():
            spec = catalog['assets'][resource]
            texture = ASSETS / 'bundles' / spec['bundle'] / (spec['path'].removesuffix('/texture') + '.png')
            raw = plane(mask)
            with Image.open(texture) as image:
                # The worn bag restores its full mipmap canvas after import;
                # its original mask remains cropped with a logical origin.
                x, y = (mask['origin'][i] - spec['content'][i] for i in range(2))
                w, h = mask['size']
                assert x >= 0 and y >= 0 and x + w <= image.width and y + h <= image.height, resource
                reconstructed = Image.new('L', image.size)
                reconstructed.paste(Image.frombytes('L', (w, h), raw), (x, y))
                assert image.convert('RGBA').getchannel('A').tobytes() == reconstructed.tobytes(), resource
            rows.append({'resource': resource, 'pixels': len(raw), 'alphaSHA256': hashlib.sha256(raw).hexdigest(),
                         'textureSHA256': hashlib.sha256(texture.read_bytes()).hexdigest()})
        data, reservation = encode_masks(masks)
        prepared.append((path, data))
        catalog['groups'][path.parent.name]['cocosAlpha'] = reservation
        groups.append({'group': path.parent.name, 'beforeBytes': len(old), 'afterBytes': len(data.encode()),
                       'beforeSHA256': hashlib.sha256(old).hexdigest(), 'afterSHA256': hashlib.sha256(data.encode()).hexdigest(),
                       'reservation': reservation})
    # Validate all original pixels first; a bad source leaves authoring untouched.
    for path, data in prepared:
        path.write_text(data)
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + '\n')
    record = {'schema': 1, 'item': 'M09.08', 'status': 'offline_lossless_planes_verified_runtime_pending',
              'sourceBaseline': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'groups': groups, 'planes': rows, 'pixelCount': sum(r['pixels'] for r in rows),
              'beforeBytes': sum(r['beforeBytes'] for r in groups), 'afterBytes': sum(r['afterBytes'] for r in groups),
              'method': 'Every reconstructed old RLE pixel equals the original approved transferred PNG alpha byte; zlib roundtrip exact. PNG/audio/font files never written.',
              'runtimeDecoder': 'Generic readonly framework, pinned pako2.1.0 inflate with explicit output bound and checksum; O(1) pixel lookup.',
              'pending': ['Browser page flow and first-draw timing', 'Final Home cold-transfer budget', 'WeChat/device validation']}
    (ROOT / 'migration/records/M09-alpha-transport.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in record.items() if k not in ('groups', 'planes')}))


if __name__ == '__main__':
    compact()
