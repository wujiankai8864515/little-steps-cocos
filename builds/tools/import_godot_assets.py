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
import wave
from pathlib import Path
from PIL import Image
from godot_binary import read_resource, qoa_pcm16
from alpha_codec import encode_masks
from png_transport import exact_png

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
    if path.exists() and path.suffix == '.res':
        model=read_resource(path.read_bytes());main=model['resources'][-1]
        if main['type']!='ImageTexture':raise ValueError('Binary image must be an ImageTexture')
        reference=main['properties']['image']
        if set(reference)!= {'godotInternalResource'}:raise ValueError('Expected internal Image reference')
        image_resource=model['resources'][reference['godotInternalResource']]
        if image_resource['type']!='Image':raise ValueError('ImageTexture points to unsupported resource')
        image=image_resource['properties']['data'];w,h=image['width'],image['height']
        if image['format']!='RedGreen' or image['mipmaps'] or not 0<w*h<=64*1024*1024 or len(image['data'])!=w*h*2:
            raise ValueError('Unsupported binary Image layout')
        # RG8 samples as (R,G,0,1); an LA PNG would put G in alpha incorrectly.
        rgba=bytearray(w*h*4);rgba[0::4]=image['data'][0::2];rgba[1::4]=image['data'][1::2];rgba[3::4]=b'\xff'*(w*h)
        return Image.frombytes('RGBA',(w,h),bytes(rgba)),[path]
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

def mp3_budget(data):
    """Conservative decoded float32 buffer size from actual MPEG frame headers."""
    at = 0
    if data[:3] == b'ID3':
        if len(data) < 10 or any(n & 128 for n in data[6:10]): raise ValueError('Invalid ID3 size')
        at = 10 + sum(n << shift for n, shift in zip(data[6:10], [21,14,7,0]))
        if data[5] & 16: at += 10
    frames, samples, channels, rate = 0, 0, 0, 0
    while at < len(data):
        if len(data)-at == 128 and data[at:at+3] == b'TAG': break
        if at + 4 > len(data): raise ValueError('Truncated MP3 frame')
        h = int.from_bytes(data[at:at+4], 'big')
        version, layer, bit, hz = (h>>19)&3, (h>>17)&3, (h>>12)&15, (h>>10)&3
        if h>>21 != 0x7ff or version == 1 or layer != 1 or bit in (0,15) or hz == 3:
            raise ValueError(f'Unsupported MP3 frame at {at}')
        bitrate = ([0,32,40,48,56,64,80,96,112,128,160,192,224,256,320] if version == 3 else [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[bit]*1000
        current_rate = [44100,48000,32000][hz] // (1 if version == 3 else 2 if version == 2 else 4)
        current_channels = 1 if (h>>6)&3 == 3 else 2
        if frames and (current_rate != rate or current_channels != channels): raise ValueError('MP3 layout changes')
        rate, channels = current_rate, current_channels
        length = (144 if version == 3 else 72)*bitrate//rate + ((h>>9)&1)
        if at+length > len(data): raise ValueError('Truncated MP3 payload')
        samples += 1152 if version == 3 else 576; frames += 1; at += length
    if not frames: raise ValueError('No MP3 frames')
    return {'sampleRate':rate, 'channels':channels, 'frames':frames, 'maximumDecodedSamples':samples, 'decodedBytes':samples*channels*4, 'durationUpperBound':samples/rate}

def resolve_audio(resource):
    original = PROJECT / resource.removeprefix('res://')
    imported = Path(str(original) + '.import')
    if not imported.exists(): raise FileNotFoundError(f'Missing original audio import: {resource}')
    match = re.search(r'path\s*=\s*"([^"]+)"', imported.read_text())
    if not match: raise ValueError(f'No audio import target: {resource}')
    rel = match.group(1).removeprefix('res://')
    target = next((p for p in [PROJECT / rel, CACHE / rel] if p.exists()), None)
    if target is None: raise FileNotFoundError(rel)
    value = read_resource(target.read_bytes())['resources'][-1]
    props, dependencies = value['properties'], [imported, target]
    if value['type'] == 'AudioStreamMP3':
        data = props['data']
        return data, {**mp3_budget(data), 'verification':'byte-identical embedded original MP3', 'embeddedPayload256':sha(data)}, dependencies
    if value['type'] != 'AudioStreamWAV' or props.get('format') != 3:
        raise ValueError(f'Unsupported original audio encoding: {resource}')
    pcm, info = qoa_pcm16(props['data'])
    if props.get('mix_rate',44100) != info['sampleRate'] or (2 if props.get('stereo',False) else 1) != info['channels']:
        raise ValueError('QOA and Godot audio metadata disagree')
    output = io.BytesIO()
    with wave.open(output,'wb') as wav:
        wav.setnchannels(info['channels']);wav.setsampwidth(2);wav.setframerate(info['sampleRate']);wav.writeframes(pcm)
    return output.getvalue(), {**info, 'decodedBytes':info['samples']*info['channels']*4, 'pcm256':sha(pcm), 'verification':'PCM16 identical to Godot 4.5 QOA decoder; no additional lossy compression'}, dependencies

def bitmap_rows(value):
    w,h=value['size'];bits=value['data']
    if not all(isinstance(n,int) and n>0 for n in (w,h)) or w*h>64*1024*1024 or len(bits)!=(w*h+7)//8:
        raise ValueError('Invalid authored BitMap dimensions')
    rows=[]
    for y in range(h):
        spans=[];start=None
        for x in range(w+1):
            offset=y*w+x;on=x<w and bool(bits[offset//8] & (1<<(offset%8)))
            if on and start is None:start=x
            elif not on and start is not None:spans.extend([start,x]);start=None
        rows.append(spans)
    # Reconstruct the packed bytes independently, including non-byte-aligned rows.
    restored=bytearray(len(bits))
    for y,row in enumerate(rows):
        for i in range(0,len(row),2):
            for x in range(row[i],row[i+1]):
                offset=y*w+x;restored[offset//8]|=1<<(offset%8)
    # Padding bits are not pixels; retain them in provenance, compare defined bits.
    for index,(a,b) in enumerate(zip(bits,restored)):
        mask=255 if index<len(bits)-1 or w*h%8==0 else (1<<(w*h%8))-1
        if a&mask!=b&mask:raise ValueError('BitMap row transfer changed a pixel')
    return {'size':[w,h],'rows':rows},sha(bits),sum(n.bit_count() for n in restored)

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
    catalog, provenance, unsupported, group_masks, bitmaps = {}, [], [], {}, []
    for resource in resources:
        suffix = Path(resource).suffix
        if suffix not in ('.png', '.ttf', '.json', '.wav', '.mp3', '.res'):
            continue
        group = bundle_for[resource]
        resource_name = resource.removeprefix('res://')
        destination = ASSETS / 'bundles' / group / resource_name
        destination.parent.mkdir(parents=True, exist_ok=True)
        original = PROJECT / resource_name
        model=read_resource(original.read_bytes()) if suffix=='.res' else None
        if model and model['resources'][-1]['type']=='BitMap':
            records=model['resources'];keys={i:resource if i==len(records)-1 else resource+'::'+str(i) for i in range(len(records))}
            def references(value):
                if isinstance(value,dict) and set(value)=={'godotInternalResource'}:
                    index=value['godotInternalResource']
                    if index not in keys:raise ValueError('Invalid internal BitMap index')
                    return {'resource':keys[index]}
                return value
            for i,part in enumerate(records):
                if part['type']!='BitMap':raise ValueError('Unsupported subresource in BitMap')
                payload,digest,count=bitmap_rows(part['properties']['data'])
                payload['metadata']={k.removeprefix('metadata/'):references(v) for k,v in part['properties'].items() if k.startswith('metadata/')}
                target=destination.with_suffix('.json') if i==len(records)-1 else destination.with_name(destination.stem+'-sub'+str(i)+'.json')
                write_json(target,payload);basic_meta(target,'json','1.0.1')
                size=target.stat().st_size;estimate=size*2+len(payload['rows'])*48+sum(len(row)*8 for row in payload['rows'])
                catalog[keys[i]]={'kind':'mask','bundle':group,'path':str(target.relative_to(ASSETS/'bundles'/group).with_suffix('')),'size':payload['size'],'decodedBytes':estimate}
                row={'resource':keys[i],'bundle':group,'size':payload['size'],'sourcePackedBits256':digest,'sourceFile':str(original.relative_to(SOURCE)),'sourceFile256':sha(original.read_bytes()),'json256':sha(target.read_bytes()),'jsonBytes':size,'coveredPixels':count,'bitVerification':'every defined source bit reconstructed exactly, LSB-first with continuous row indexing','metadata':payload['metadata']};bitmaps.append(row);provenance.append(row)
            continue
        if model and model['resources'][-1]['type']!='ImageTexture':
            unsupported.append(resource);continue
        if suffix=='.png' or model:
            if model:destination=destination.with_suffix('.png')
            image, dependencies = resolve_image(resource)
            w, h = image.size
            bounds = image.getchannel('A').getbbox() or (0, 0, w, h)
            l, t, r, b = bounds
            content = (max(0, l - 3), max(0, t - 3), min(w, r + 3), min(h, b + 3))
            trimmed = image.crop(content)
            destination.write_bytes(exact_png(trimmed))
            reopened = Image.open(destination).convert('RGBA')
            assert reopened.tobytes() == trimmed.tobytes(), f'Pixel transfer changed: {resource}'
            sw, sh = trimmed.size
            image_uuid = uid(str(destination.relative_to(ASSETS)))
            texture_uuid = image_uuid + '@6c48a'
            texture_meta = {'ver': '1.0.22', 'importer': 'texture', 'imported': True, 'uuid': texture_uuid, 'files': ['.json'], 'subMetas': {}, 'userData': {'wrapModeS': 'clamp-to-edge', 'wrapModeT': 'clamp-to-edge', 'minfilter': 'linear', 'magfilter': 'linear', 'mipfilter': 'none', 'premultiplyAlpha': False, 'anisotropy': 0, 'isUuid': True, 'imageUuidOrDatabaseUri': image_uuid, 'visible': False}, 'displayName': destination.stem, 'id': '6c48a', 'name': 'texture'}
            if model:
                # doll_source_mask.gdshaderinc explicitly uses nearest data sampling.
                texture_meta['userData']['minfilter']=texture_meta['userData']['magfilter']='nearest'
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
            if model:
                record['binaryImage']={'format':'RedGreen','channelExpansion':'(R,G,0,255), preserving RG8 shader sampling','sourceRG256':sha(model['resources'][0]['properties']['data']['data'])}
        elif suffix in ('.wav', '.mp3'):
            data, audio, dependencies = resolve_audio(resource)
            destination.write_bytes(data)
            basic_meta(destination, 'audio-clip', '1.0.0', {'downloadMode':0})
            meta_path = Path(str(destination) + '.meta')
            meta = json.loads(meta_path.read_text());meta['files']=[suffix,'.json'];write_json(meta_path,meta)
            catalog[resource] = {'kind':'audio', 'bundle':group, 'path':str(Path(resource_name).with_suffix('')), 'decodedBytes':audio['decodedBytes'], 'audio':audio}
            record = {'resource':resource, 'bundle':group, 'bytes':len(data), 'sha256':sha(data), **audio, 'dependencies':[{'path':str(p.relative_to(SOURCE)), 'sha256':sha(p.read_bytes())} for p in dependencies]}
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
            encoded, reservation = encode_masks(group_masks[name])
            masks.write_text(encoded)
            basic_meta(masks, 'json', '1.0.1')
            groups[name]['cocosAlpha'] = reservation
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
    music_licences = licences.parent / 'music'
    music_licences.mkdir(parents=True, exist_ok=True)
    for p in (SOURCE / 'build/web_host_seed/licenses/music').iterdir():
        if p.is_file(): shutil.copyfile(p, music_licences / p.name)
    credits = (PROJECT / 'home/audio/music_credits.gd').read_text()
    literal = re.search(r'const CREDITS_TEXT : = ("[^\n]+")', credits).group(1)
    (music_licences / 'source-credits.txt').write_text(json.loads(literal) + '\n')
    commit = subprocess.check_output(['git', '-C', str(SOURCE), 'rev-parse', 'HEAD'], text=True).strip()
    report = {'schema': 1, 'sourceCommit': commit, 'status': 'pixel_and_authored_data_transfer_verified_runtime_pending', 'assets': provenance, 'scenes': [{'resource': s['resource'], 'sha256': s['sha256'], 'sections': len(s['sections'])} for s in scenes], 'untransferred': unsupported, 'budget': {'decodedTextureBytesAllGroups': sum(v['decodedBytes'] for v in catalog.values() if v['kind'] == 'texture'), 'homeFirstDownloadLimit': 19000000, 'runtimeAdmission': 'pending actual stage closures; do not treat total export size as first screen or resident memory'}, 'sourceModified': False}
    report['coverage']='declared resource_groups assets; procedural/embedded script art and all gameplay migration remain separate'
    write_json(ROOT / 'builds/records/M02-asset-transfer.json', report)
    write_json(ROOT / 'builds/records/M02-bitmap-transfer.json', {'schema':1,'sourceCommit':commit,'status':'offline_bits_and_RG_texture_verified_runtime_pending','bitmaps':bitmaps,'binaryImages':[r for r in provenance if 'binaryImage' in r],'formatSources':[{'url':'https://github.com/godotengine/godot/blob/4.5/core/io/file_access_compressed.cpp','gitBlob':'892a66bc7c604d9c5aa2f46652e8cee7de69660e'},{'url':'https://github.com/godotengine/godot/blob/4.5/core/io/resource_format_binary.cpp','gitBlob':'7ce92989f7f747b7c18c5717b66365a44b21dd48'},{'url':'https://github.com/godotengine/godot/blob/4.5/scene/resources/bit_map.cpp','gitBlob':'322dbf5ae643e96e353873f6c543e26ecdbb1152'}],'notVerified':['all actual page input hit regions','Darkroom RG mask shader display','full runtime embedded art beyond declared resource groups']})
    print(json.dumps({'assets': len(catalog), 'textures': sum(v['kind'] == 'texture' for v in catalog.values()), 'scenes': len(scenes), 'decodedTextureBytes': report['budget']['decodedTextureBytesAllGroups'], 'untransferred': len(unsupported)}))

if __name__ == '__main__': main()
