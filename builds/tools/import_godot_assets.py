#!/usr/bin/env python3
"""Offline transfer of approved source pixels and authored data, never gameplay.

Use the bundled Python/Pillow runtime. Godot remains read-only. A cropped texture
retains its logical size/source origin; the game restores that origin at runtime.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import re
import shutil
import struct
import subprocess
import uuid
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT.parent / 'little-steps'
PROJECT = SOURCE / 'games/travel_woodfish/project'
CACHE = SOURCE / 'games/travel_woodfish/runtime_cache'
ASSETS = ROOT / 'games/xiaoyu-cocos/assets'
NAMESPACE = uuid.UUID('8ad618fb-ce44-4560-a235-ef5934b4225e')

def sha(data):
    return hashlib.sha256(data).hexdigest()

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')

def uid(name):
    return str(uuid.uuid5(NAMESPACE, name))

def font_metrics(path):
    data = path.read_bytes()
    tables = {}
    for i in range(struct.unpack_from('>H', data, 4)[0]):
        tag, _, offset, _ = struct.unpack_from('>4sIII', data, 12 + i * 16)
        tables[tag.decode()] = offset
    units = struct.unpack_from('>H', data, tables['head'] + 18)[0]
    ascent, descent, _ = struct.unpack_from('>hhh', data, tables['hhea'] + 4)
    return {'ascent': ascent / units, 'descent': -descent / units, 'height': (ascent - descent) / units, 'source': 'TrueType hhea/head; raster and Godot hinting comparison still required'}

def basic_meta(path, importer, version='1.0.0', user_data=None):
    write_json(Path(str(path) + '.meta'), {
        'ver': version, 'importer': importer, 'imported': True,
        'uuid': uid(str(path.relative_to(ASSETS))), 'files': [],
        'subMetas': {}, 'userData': user_data or {},
    })

def decode_ctex(path):
    data = path.read_bytes()
    if data[:4] != b'GST2':
        raise ValueError(f'Not a Godot 4 CompressedTexture2D: {path}')
    # Header is fixed for the imported PNG/WebP 2D cache used in this source.
    payload = data[56:]
    if not (payload.startswith(b'RIFF') or payload.startswith(b'\x89PNG')):
        raise ValueError(f'Unsupported CTEX payload; do not invent pixels: {path}')
    image = Image.open(io.BytesIO(payload)).convert('RGBA')
    expected = struct.unpack_from('<II', data, 8)
    if image.size != expected:
        raise ValueError(f'CTEX dimensions differ: {path}: {image.size} vs {expected}')
    return image

def resolve_image(resource, seen=None):
    seen = set() if seen is None else seen
    if resource in seen:
        raise ValueError(f'Cyclic Godot texture remap: {resource}')
    seen.add(resource)
    path = PROJECT / resource.removeprefix('res://')
    dependencies = []
    if path.exists() and path.suffix == '.png':
        return Image.open(path).convert('RGBA'), [path]
    if path.exists() and path.suffix == '.ctex':
        return decode_ctex(path), [path]
    remap = Path(str(path) + '.remap')
    if remap.exists():
        target = re.search(r'path\s*=\s*"([^"]+)"', remap.read_text()).group(1)
        target_path = PROJECT / target.removeprefix('res://')
        if target_path.suffix != '.tres':
            image, dependencies = resolve_image(target, seen)
            return image, [remap] + dependencies
        text = target_path.read_text()
        if 'type="AtlasTexture"' not in text:
            raise ValueError(f'Unsupported remapped texture: {target_path}')
        atlas = re.search(r'\[ext_resource[^\n]*path="([^"]+)"', text).group(1)
        region = [int(float(v)) for v in re.search(r'^region = Rect2\(([^)]+)\)', text, re.M).group(1).split(',')]
        margin_match = re.search(r'^margin = Rect2\(([^)]+)\)', text, re.M)
        margin = [int(float(v)) for v in margin_match.group(1).split(',')] if margin_match else [0, 0, 0, 0]
        original, dependencies = resolve_image(atlas, seen)
        x, y, w, h = region
        piece = original.crop((x, y, x + w, y + h))
        image = Image.new('RGBA', (w + margin[2], h + margin[3]))
        image.paste(piece, (margin[0], margin[1]))
        return image, [remap, target_path] + dependencies
    imported = Path(str(path) + '.import')
    if imported.exists():
        match = re.search(r'path\s*=\s*"([^"]+)"', imported.read_text().replace('\x00', ''))
        if not match:
            raise ValueError(f'No import path: {imported}')
        rel = match.group(1).removeprefix('res://')
        candidates = [PROJECT / rel, CACHE / rel]
        texture = next((p for p in candidates if p.exists()), None)
        if not texture:
            raise FileNotFoundError(f'Imported source unavailable: {resource}: {rel}')
        return decode_ctex(texture), [imported, texture]
    raise FileNotFoundError(resource)

def split_top(text, delimiter=','):
    pieces, start, depth, quoted, escaped = [], 0, 0, False, False
    for i, char in enumerate(text):
        if quoted:
            if escaped: escaped = False
            elif char == '\\': escaped = True
            elif char == '"': quoted = False
        elif char == '"': quoted = True
        elif char in '([{': depth += 1
        elif char in ')]}': depth -= 1
        elif depth == 0 and char == delimiter:
            pieces.append(text[start:i].strip()); start = i + 1
    pieces.append(text[start:].strip())
    return [p for p in pieces if p]

def variant(text):
    text = text.strip()
    if text in ('true', 'false', 'null'): return json.loads(text)
    if text.startswith('&"'): return json.loads(text[1:])
    if text.startswith('"'): return json.loads(text)
    if re.fullmatch(r'[-+\d.eE]+', text): return float(text) if any(c in text for c in '.eE') else int(text)
    if text.startswith('[') and text.endswith(']'): return [variant(v) for v in split_top(text[1:-1])]
    if text.startswith('{') and text.endswith('}'):
        result = {}
        for row in split_top(text[1:-1]):
            fields = split_top(row, ':')
            if len(fields) != 2: raise ValueError(f'Invalid Godot dictionary: {row[:80]}')
            result[str(variant(fields[0]))] = variant(fields[1])
        return result
    match = re.fullmatch(r'(\w+)\((.*)\)', text, re.S)
    if match:
        kind, args = match.groups()
        if kind in ('ExtResource', 'SubResource', 'NodePath'): return {'kind': kind, 'value': variant(args)}
        if kind in ('Vector2', 'Vector3', 'Vector4', 'Color', 'Rect2', 'Transform2D', 'PackedFloat32Array', 'PackedFloat64Array', 'PackedInt32Array', 'PackedVector2Array', 'PackedColorArray', 'PackedStringArray'):
            values = [variant(v) for v in split_top(args)]
            if kind == 'PackedFloat32Array': values = [struct.unpack('<f', struct.pack('<f', v))[0] for v in values]
            return values
    # Keep unsupported authoring values visible for explicit runtime handling.
    return {'unsupported_godot_variant': text}

def scene_data(path):
    text = path.read_text()
    sections = []
    starts = list(re.finditer(r'^\[([^\n]+)\]\s*$', text, re.M))
    for i, match in enumerate(starts):
        header = match.group(1)
        attrs = {k: json.loads(v) for k, v in re.findall(r'(\w+)=("(?:[^"\\]|\\.)*")', header)}
        kind = header.split()[0]
        body = text[match.end():starts[i + 1].start() if i + 1 < len(starts) else len(text)]
        properties = {}
        assignments = list(re.finditer(r'^([^\n=]+?)\s*=\s*', body, re.M))
        for j, prop in enumerate(assignments):
            value = body[prop.end():assignments[j + 1].start() if j + 1 < len(assignments) else len(body)].strip()
            properties[prop.group(1).strip()] = variant(value)
        sections.append({'kind': kind, **attrs, 'properties': properties})
    return {'resource': 'res://' + str(path.relative_to(PROJECT)), 'sha256': sha(path.read_bytes()), 'sections': sections}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--groups', nargs='*')
    args = parser.parse_args()
    groups = json.loads((PROJECT / 'config/resource_groups.json').read_text())['groups']
    names = args.groups or list(groups)
    resources = sorted({r for name in names for r in groups[name]['resources']})
    bundle_for = {r: next(name for name in names if r in groups[name]['resources']) for r in resources}
    catalog, provenance, unsupported, group_masks = {}, [], [], {}
    for resource in resources:
        suffix = Path(resource).suffix
        if suffix not in ('.png', '.ttf', '.json'):
            if suffix in ('.wav', '.mp3', '.res'): unsupported.append(resource)
            continue
        group = bundle_for[resource]
        resource_name = resource.removeprefix('res://')
        destination = ASSETS / 'bundles' / group / resource_name
        destination.parent.mkdir(parents=True, exist_ok=True)
        original = PROJECT / resource_name
        if suffix == '.png':
            image, dependencies = resolve_image(resource)
            w, h = image.size
            bounds = image.getchannel('A').getbbox() or (0, 0, w, h)
            l, t, r, b = bounds
            content = (max(0, l - 3), max(0, t - 3), min(w, r + 3), min(h, b + 3))
            trimmed = image.crop(content)
            trimmed.save(destination, format='PNG', optimize=True)
            reopened = Image.open(destination).convert('RGBA')
            assert reopened.tobytes() == trimmed.tobytes(), f'Pixel transfer changed: {resource}'
            sw, sh = trimmed.size
            image_uuid = uid(str(destination.relative_to(ASSETS)))
            texture_uuid = image_uuid + '@6c48a'
            texture_meta = {'ver': '1.0.22', 'importer': 'texture', 'imported': True, 'uuid': texture_uuid, 'files': ['.json'], 'subMetas': {}, 'userData': {'wrapModeS': 'clamp-to-edge', 'wrapModeT': 'clamp-to-edge', 'minfilter': 'linear', 'magfilter': 'linear', 'mipfilter': 'none', 'premultiplyAlpha': False, 'anisotropy': 0, 'isUuid': True, 'imageUuidOrDatabaseUri': image_uuid, 'visible': False}, 'displayName': destination.stem, 'id': '6c48a', 'name': 'texture'}
            write_json(Path(str(destination) + '.meta'), {'ver': '1.0.27', 'importer': 'image', 'imported': True, 'uuid': image_uuid, 'files': ['.json', '.png'], 'subMetas': {'6c48a': texture_meta}, 'userData': {'type': 'texture', 'redirect': texture_uuid, 'hasAlpha': True, 'fixAlphaTransparencyArtifacts': False}})
            # Run-length alpha rows retain the exact 8-bit source coverage, not a rectangle hit target.
            alpha = trimmed.getchannel('A').tobytes()
            runs = []
            for y in range(sh):
                row = alpha[y * sw:(y + 1) * sw]; packed = []; start = 0
                for x in range(1, sw + 1):
                    if x == sw or row[x] != row[start]:
                        packed.extend([x - start, row[start]]); start = x
                runs.append(packed)
            group_masks.setdefault(group, {})[resource] = {'size': [sw, sh], 'origin': [content[0], content[1]], 'rows': runs}
            # Remove only our generated obsolete per-image masks after consolidation.
            for obsolete in (destination.with_suffix('.alpha.json'), Path(str(destination.with_suffix('.alpha.json')) + '.meta')):
                if obsolete.exists(): obsolete.unlink()
            catalog[resource] = {'kind': 'texture', 'bundle': group, 'path': str(Path(resource_name).with_suffix('')) + '/texture', 'size': [w, h], 'content': [content[0], content[1], sw, sh], 'opaque': list(bounds), 'alpha': 'alpha-masks', 'decodedBytes': sw * sh * 4}
            record = {'resource': resource, 'bundle': group, 'logicalSize': [w, h], 'content': catalog[resource]['content'], 'sourceDecodedRGBA256': sha(image.tobytes()), 'transferredRGBA256': sha(trimmed.tobytes()), 'png256': sha(destination.read_bytes()), 'pngBytes': destination.stat().st_size, 'pixelVerification': 'exact transferred pixels, alpha and source origin; transparent exterior omitted', 'dependencies': [{'path': str(p.relative_to(SOURCE)), 'sha256': sha(p.read_bytes())} for p in dependencies]}
        else:
            if not original.exists(): raise FileNotFoundError(resource)
            shutil.copyfile(original, destination)
            basic_meta(destination, 'ttf-font' if suffix == '.ttf' else 'json', '1.0.1')
            catalog[resource] = {'kind': 'font' if suffix == '.ttf' else 'json', 'bundle': group, 'path': str(Path(resource_name).with_suffix('')), 'decodedBytes': destination.stat().st_size}
            if suffix == '.ttf': catalog[resource]['fontMetrics'] = font_metrics(original)
            record = {'resource': resource, 'bundle': group, 'bytes': destination.stat().st_size, 'sha256': sha(destination.read_bytes()), 'source': str(original.relative_to(SOURCE)), 'verification': 'byte-identical'}
        provenance.append(record)
    for name in names:
        folder = ASSETS / 'bundles' / name
        folder.mkdir(parents=True, exist_ok=True)
        basic_meta(folder, 'directory', '1.2.0', {'isBundle': True, 'bundleName': name, 'priority': groups[name].get('priority', 0), 'compressionType': {}, 'isRemoteBundle': False})
        if name in group_masks:
            masks = folder / 'alpha-masks.json'
            write_json(masks, group_masks[name])
            basic_meta(masks, 'json', '1.0.1')
            groups[name]['cocosAlpha'] = {'path': 'alpha-masks', 'decodedBytes': masks.stat().st_size * 2 + sum(m['size'][0] * m['size'][1] for m in group_masks[name].values())}
    data_path = ASSETS / 'resources' / 'source-catalog.json'
    write_json(data_path, {'schema': 1, 'groups': groups, 'assets': catalog, 'untransferred': unsupported})
    basic_meta(data_path, 'json', '1.0.1')
    scenes_path = ASSETS / 'resources' / 'source-scenes.json'
    scenes = [scene_data(p) for p in sorted(PROJECT.rglob('*.tscn'))]
    write_json(scenes_path, {'schema': 1, 'scenes': scenes})
    basic_meta(scenes_path, 'json', '1.0.1')
    licences = ROOT / 'games/xiaoyu-cocos/licenses/fonts'
    licences.mkdir(parents=True, exist_ok=True)
    for p in (SOURCE / 'build/fonts/licenses').iterdir():
        if p.is_file(): shutil.copyfile(p, licences / p.name)
    shutil.copyfile(SOURCE / 'build/fonts/manifest.json', licences.parent / 'source-font-manifest.json')
    commit = subprocess.check_output(['git', '-C', str(SOURCE), 'rev-parse', 'HEAD'], text=True).strip()
    report = {'schema': 1, 'sourceCommit': commit, 'status': 'pixel_and_authored_data_transfer_verified_runtime_pending', 'assets': provenance, 'scenes': [{'resource': s['resource'], 'sha256': s['sha256'], 'sections': len(s['sections'])} for s in scenes], 'untransferred': unsupported, 'budget': {'decodedTextureBytesAllGroups': sum(v['decodedBytes'] for v in catalog.values() if v['kind'] == 'texture'), 'homeFirstDownloadLimit': 19000000, 'runtimeAdmission': 'pending actual stage closures; do not treat total export size as first screen or resident memory'}, 'sourceModified': False}
    write_json(ROOT / 'builds/records/M02-asset-transfer.json', report)
    print(json.dumps({'assets': len(catalog), 'textures': sum(v['kind'] == 'texture' for v in catalog.values()), 'scenes': len(scenes), 'decodedTextureBytes': report['budget']['decodedTextureBytesAllGroups'], 'untransferred': len(unsupported)}))

if __name__ == '__main__': main()
