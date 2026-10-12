#!/usr/bin/env python3
"""Losslessly remove redundant opaque alpha storage; keep dimensions/UV/meta.

Default is an inspection. --apply requires a new evidence path and verifies
every replacement before touching authoring files. Original decoded pixels,
not encoded PNG bytes, are the fidelity invariant for this declared change.
"""
import argparse
import hashlib
import io
import json
import subprocess
from pathlib import Path
from PIL import Image
from png_transport import exact_png

ROOT = Path(__file__).resolve().parents[2]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def compact(apply, record):
    if apply and (record is None or record.exists()):
        raise ValueError('An unused record path is required before changing PNGs')
    replacements, rows = [], []
    for path in sorted((ROOT / 'games/xiaoyu-cocos/assets/bundles').rglob('*.png')):
        with Image.open(path) as image:
            rgba = image.convert('RGBA')
            if rgba.getchannel('A').getextrema() != (255, 255):
                continue
            # Existing generated assets have no color-profile chunks. Removing
            # one would change rendering even if raw RGBA values were identical.
            if image.info:
                raise ValueError('Review PNG metadata before re-encoding: ' + str(path))
            original = path.read_bytes()
            encoded = exact_png(rgba)
            if len(encoded) >= len(original):
                continue
            meta_path = path.with_suffix('.png.meta')
            old_meta = meta_path.read_bytes()
            meta = json.loads(old_meta)
            meta['userData']['hasAlpha'] = 'A' in Image.open(io.BytesIO(encoded)).getbands()
            new_meta = (json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
            replacements.extend(((path, encoded), (meta_path, new_meta)))
            rows.append({'path': path.relative_to(ROOT).as_posix(), 'size': list(rgba.size),
                         'beforeBytes': len(original), 'afterBytes': len(encoded),
                         'beforeSHA256': sha(original), 'afterSHA256': sha(encoded),
                         'decodedRGBA256': sha(rgba.tobytes()),
                         'metadataBeforeSHA256': sha(old_meta), 'metadataSHA256': sha(new_meta)})
    result = {'schema': 1, 'item': 'M09.09',
              'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'status': 'source_pixels_verified_runtime_pending' if apply else 'inspection_only',
              'images': rows, 'savedBytes': sum(r['beforeBytes'] - r['afterBytes'] for r in rows),
              'invariants': ['RGBA pixel bytes and dimensions exact', 'Only hasAlpha metadata follows encoded channel format; UUID, crop/UV, sampling and mipmaps unchanged',
                             'No lossy encoding, rescaling or new image format', 'Decoded GPU reservation unchanged'],
              'pending': ['Frozen Creator import/export and browser rendering', 'Home 19MB gate still requires output audit', 'WeChat device validation']}
    if apply:
        for path, encoded in replacements:
            path.write_bytes(encoded)
        record.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--record', type=Path)
    args = parser.parse_args()
    print(json.dumps(compact(args.apply, args.record), ensure_ascii=False, indent=2))
