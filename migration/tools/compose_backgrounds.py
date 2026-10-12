#!/usr/bin/env python3
"""Derive small original-art patches and procedural colour grids; retain source PNGs."""
import hashlib
import json
import uuid
from pathlib import Path
from PIL import Image, ImageFilter, ImageStat

ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / 'games/xiaoyu-cocos'
ASSETS = GAME / 'assets'
CASES = {
    'loading': ('res://entry/assets/backgrounds/loading_clean_bleed_720x1600.png', []),
    'login': ('res://entry/assets/backgrounds/login_clean_bleed_720x1600.png',
              [(0, 120, 370, 440), (120, 560, 480, 600), (500, 660, 220, 440), (0, 1060, 720, 360)]),
    'photo_visual': ('res://photo/assets/photo_wall_neutral_plate_v1.png',
                     [(0, 0, 100, 1060), (860, 0, 81, 1060), (0, 1030, 941, 642)]),
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')


def compose():
    catalog_path = ASSETS / 'resources/source-catalog.json'
    catalog = json.loads(catalog_path.read_text())
    records = []
    for group, (key, rectangles) in CASES.items():
        spec = catalog['assets'][key]
        regenerating = spec['kind'] == 'procedural'
        source = ASSETS / 'bundles' / group / (spec['path'][:-8] + '.png')
        archive = GAME / 'art-source/backgrounds' / source.name
        archive.parent.mkdir(parents=True, exist_ok=True)
        if not regenerating:
            if archive.exists():raise FileExistsError(archive)
            source.rename(archive)
            meta = source.with_name(source.name + '.meta')
            meta.rename(archive.with_name(archive.name + '.meta'))
        original_hash = digest(archive)
        source_meta = json.loads(archive.with_name(archive.name + '.meta').read_text())
        image = Image.open(archive).convert('RGB')
        width, height = image.size
        blurred = image.filter(ImageFilter.GaussianBlur(65))
        colors = []
        for y in range(9):
            for x in range(5):
                px, py = round(x / 4 * (width - 1)), round(y / 8 * (height - 1))
                if group == 'photo_visual':
                    px, py = round(140 + x / 4 * 680), min(py, 960)
                if group == 'login':
                    # Sample the paper rather than baking the leaves into the grid.
                    px = min(max(px, 310), 480)
                colors.extend(blurred.getpixel((px, py)))
        layers = []
        for number, (left, top, w, h) in enumerate(rectangles):
            detail_key = f'derived://backgrounds/{group}-{number}.png'
            relative = f'background-patches/{group}-{number}.png'
            target = ASSETS / 'bundles' / group / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            folder_meta = target.parent.with_name(target.parent.name + '.meta')
            if not folder_meta.exists():
                write(folder_meta, {'ver': '1.2.0', 'importer': 'directory', 'imported': True,
                                    'uuid': str(uuid.uuid5(uuid.NAMESPACE_URL, 'little-steps/background-patches/' + group)),
                                    'files': [], 'subMetas': {}, 'userData': {}})
            patch = image.crop((left, top, left + w, top + h)).convert('RGBA')
            if group == 'login':
                alpha = Image.new('L', (w, h))
                alpha.putdata([round(255 * min(1, min(x if left else 99, w - 1 - x if left + w < width else 99,
                                                       y if top else 99, h - 1 - y if top + h < height else 99) / 28))
                               for y in range(h) for x in range(w)])
                patch.putalpha(alpha)
            scale = min(.75, 720 / width)
            patch = patch.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.Resampling.LANCZOS)
            alpha = patch.getchannel('A')
            patch = patch.convert('RGB').quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
            if group == 'login':
                patch = patch.convert('RGBA')
                patch.putalpha(alpha)
            patch.save(target, optimize=True)
            assert target.stat().st_size <= 500_000
            metadata = json.loads(json.dumps(source_meta))
            uid = str(uuid.uuid5(uuid.NAMESPACE_URL, 'little-steps/' + detail_key))
            metadata['uuid'] = uid
            metadata['userData'].update({'redirect': uid + '@6c48a', 'hasAlpha': group == 'login'})
            for sub in metadata['subMetas'].values():
                sub['uuid'] = uid + '@' + sub['id']
                sub['displayName'] = target.stem
                sub['userData']['imageUuidOrDatabaseUri'] = uid
            write(target.with_name(target.name + '.meta'), metadata)
            catalog['assets'][detail_key] = {'kind': 'texture', 'bundle': group,
                                            'path': relative[:-4] + '/texture', 'size': [width, height],
                                            'content': [left, top, w, h], 'opaque': [left, top, left + w, top + h],
                                            'decodedBytes': patch.width * patch.height * 4}
            layers.append(detail_key)
        recipe = {'size': [128, 288], 'grid': [5, 9], 'colors': colors, 'grain': 2 if group == 'photo_visual' else .6}
        spec.update({'kind': 'procedural', 'procedural': recipe, 'layers': layers,
                     'decodedBytes': 128 * 288 * 4 * 2})
        spec.pop('alpha', None)
        catalog['groups'][group]['resources'] = list(dict.fromkeys([*catalog['groups'][group]['resources'], *layers]))
        # These full-screen masks were never used for hit testing. Remove only
        # those three opaque planes, preserving every interactive alpha byte.
        masks_path = ASSETS / 'bundles' / group / 'alpha-masks.json'
        masks = json.loads(masks_path.read_text())
        masks['masks'].pop(key, None)
        from alpha_codec import encode_masks
        encoded, reservation = encode_masks(masks['masks'])
        masks_path.write_text(encoded)
        catalog['groups'][group]['cocosAlpha'] = reservation
        records.append({'resource': key, 'sourceArchive': str(archive.relative_to(ROOT)),
                        'sourceSHA256': original_hash, 'sourceBytes': archive.stat().st_size,
                        'sourceUnchanged': digest(archive) == original_hash,
                        'patches': [{'resource': k, 'path': catalog['assets'][k]['path'],
                                     'bytes': (ASSETS / 'bundles' / group / (catalog['assets'][k]['path'][:-8] + '.png')).stat().st_size}
                                    for k in layers], 'recipe': recipe})
    write(catalog_path, catalog)
    record = {'item': 'M17.01', 'method': 'Shared procedural low-frequency paper plus cropped original art at 75% sampling, 256 colour PNG; source PNGs archived byte-identically.',
              'backgrounds': records, 'visualAcceptance': 'pending'}
    (ROOT / 'migration/records/M17-composite-backgrounds.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({r['resource']: {'before': r['sourceBytes'], 'afterPatches': sum(p['bytes'] for p in r['patches'])} for r in records}))


if __name__ == '__main__':
    compose()
