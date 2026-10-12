"""Transform only the frozen packaging copy; canonical art/audio stay recoverable."""
import hashlib
import io
import json
import os
import subprocess
import sys
import wave
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'migration/.cache/python'))
from PIL import Image, ImageChops, ImageStat
BACKGROUND_NAMES = ('bleed', 'room_no_plants', 'diary_reference', 'diary_plate', 'map_plate',
                    'travel_paper', 'comic_paper', 'neutral_plate')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def optimize(project, stage, policy):
    if not policy.get('enabled'):
        return []
    catalog_path = project / 'assets/resources/source-catalog.json'
    before_catalog = sha(catalog_path)
    catalog = json.loads(catalog_path.read_text())
    rows = []
    def record(path, before, purpose, **details):
        rows.append({'file': path.relative_to(stage).as_posix(), 'sourceSHA256': before,
                     'packagingSHA256': sha(path), 'purpose': purpose, **details})
    for key, spec in catalog['assets'].items():
        if spec['kind'] != 'texture' or spec.get('mipResources') or 'glyph' in key or 'source_mask' in key or key.startswith('derived://backgrounds/'):
            continue
        path = project / 'assets/bundles' / spec['bundle'] / (spec['path'][:-8] + '.png')
        before = sha(path)
        original_bytes = path.stat().st_size
        background = any(name in path.stem for name in BACKGROUND_NAMES)
        # Small sprites and bitmap text retain their original pixels. Larger
        # illustrations retain logical coordinates and independent hit masks.
        if original_bytes < 200_000 and not background:
            continue
        image = Image.open(path).convert('RGBA')
        source_size = image.size
        if background and image.width > policy['backgroundWidth']:
            image = image.resize((policy['backgroundWidth'], round(image.height * policy['backgroundWidth'] / image.width)), Image.Resampling.LANCZOS)
        target = io.BytesIO()
        opaque = image.getchannel('A').getextrema() == (255, 255)
        # RGB median cut is important for pale watercolour; octree RGBA loses
        # subtle colours when it spends palette entries on alpha instead.
        for colors in (256, 192, 128, 96, 64):
            if opaque:
                packed = image.convert('RGB').quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
            else:
                packed = image.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
            target = io.BytesIO()
            packed.save(target, format='PNG', optimize=True)
            if not background or len(target.getvalue()) <= policy['backgroundMaxBytes']:
                break
        if background and len(target.getvalue()) > policy['backgroundMaxBytes']:
            raise ValueError('Background exceeds requested budget: ' + key)
        if len(target.getvalue()) >= original_bytes:
            continue
        path.write_bytes(target.getvalue())
        actual = Image.open(path).convert('RGBA')
        error = ImageStat.Stat(ImageChops.difference(image, actual)).rms
        spec['transport'] = {'size': list(actual.size), 'colors': colors, 'background': background,
                             'sourceSHA256': before, 'payloadSHA256': sha(path)}
        spec['decodedBytes'] = actual.width * actual.height * 4
        record(path, before, 'Balanced PNG palette; logical geometry/alpha hit masks unchanged',
               resource=key, sourceBytes=original_bytes, packagingBytes=path.stat().st_size,
               sourceSize=list(source_size), packagingSize=list(actual.size), colors=colors,
               channelRMSE=error, background=background)
    sys.path.insert(0, str(ROOT / 'migration/.cache/python'))
    import imageio_ffmpeg
    executable = imageio_ffmpeg.get_ffmpeg_exe()
    for key, spec in catalog['assets'].items():
        if spec['kind'] != 'audio':
            continue
        ext = Path(key).suffix
        path = project / 'assets/bundles' / spec['bundle'] / (spec['path'] + ext)
        before, original_bytes = sha(path), path.stat().st_size
        target = path.with_name(path.stem + '-mono' + ext)
        command = [executable, '-nostdin', '-v', 'error', '-y', '-i', str(path), '-map_metadata', '-1', '-ac', '1']
        if ext == '.mp3':
            command += ['-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', str(policy['musicBitrate']), '-write_xing', '1']
        else:
            command += ['-ar', '22050', '-codec:a', 'pcm_s16le']
        subprocess.run(command + [str(target)], check=True)
        if target.stat().st_size >= original_bytes:
            target.unlink()
            continue
        target.replace(path)
        if spec.get('streaming'):
            stream = spec['streaming']
            stream.update(encodedBytes=path.stat().st_size, reservedBytes=path.stat().st_size * 2 + 2 * 1024 * 1024, payloadSHA256=sha(path))
        if spec.get('audio'):
            spec['audio']['channels'] = 1
            spec['audio']['sampleRate'] = 44100 if ext == '.mp3' else 22050
            spec['audio']['verification'] = 'Packaging-only mono transcode; canonical original retained'
        record(path, before, 'Packaging-only mono audio', resource=key, sourceBytes=original_bytes,
               packagingBytes=path.stat().st_size, channels=1, bitrate=policy['musicBitrate'] if ext == '.mp3' else None)
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + '\n')
    record(catalog_path, before_catalog, 'Transport dimensions/reservations and mono stream hashes')
    return rows
