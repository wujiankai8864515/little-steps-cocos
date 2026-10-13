"""Recompress PNG storage in the isolated export without changing pixels or metadata."""
import hashlib
from pathlib import Path
import struct
import zlib

SIGNATURE = b'\x89PNG\r\n\x1a\n'


def chunks(data):
    if not data.startswith(SIGNATURE):
        raise ValueError('PNG signature missing')
    position, result = 8, []
    while position < len(data):
        if position + 12 > len(data):
            raise ValueError('Truncated PNG chunk')
        size = struct.unpack_from('>I', data, position)[0]
        end = position + size + 12
        if end > len(data):
            raise ValueError('Truncated PNG data')
        kind, body = data[position + 4:position + 8], data[position + 8:end - 4]
        crc = struct.unpack_from('>I', data, end - 4)[0]
        if zlib.crc32(kind + body) & 0xffffffff != crc:
            raise ValueError('PNG CRC mismatch')
        result.append((kind, body, data[position:end]))
        position = end
    if not result or result[0][0] != b'IHDR' or result[-1][0] != b'IEND':
        raise ValueError('PNG header/end missing')
    return result


def compact(data):
    original = chunks(data)
    if any(kind == b'acTL' for kind, _, _ in original):
        return data, None  # Animated PNG storage is left intact.
    encoded = b''.join(body for kind, body, _ in original if kind == b'IDAT')
    stream = zlib.decompressobj()
    scanlines = stream.decompress(encoded, 256 * 1024 * 1024 + 1)
    if len(scanlines) > 256 * 1024 * 1024 or not stream.eof or stream.unused_data:
        raise ValueError('Invalid or excessively large PNG stream')
    compressed = zlib.compress(scanlines, 9)
    idat = struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', zlib.crc32(b'IDAT' + compressed) & 0xffffffff)
    parts, replaced = [SIGNATURE], False
    for kind, _, raw in original:
        if kind != b'IDAT':
            parts.append(raw)
        elif not replaced:
            parts.append(idat)
            replaced = True
    output = b''.join(parts)
    if len(output) >= len(data):
        return data, None
    # Preserve every non-image-data chunk byte-for-byte, including color/ICC metadata.
    updated = chunks(output)
    if [raw for kind, _, raw in original if kind != b'IDAT'] != [raw for kind, _, raw in updated if kind != b'IDAT']:
        raise ValueError('PNG metadata changed')
    if zlib.decompress(b''.join(body for kind, body, _ in updated if kind == b'IDAT')) != scanlines:
        raise ValueError('PNG filtered scanlines changed')
    return output, hashlib.sha256(scanlines).hexdigest()


def compact_assets(assets, originals):
    assets, originals = Path(assets), Path(originals)
    record = {'mode': 'lossless-IDAT-storage', 'pixelsAndMetadataPreserved': True, 'savedBytes': 0, 'files': []}
    for path in sorted((assets / 'assets').rglob('*.png')):
        before = path.read_bytes()
        after, scanline_hash = compact(before)
        if after == before:
            continue
        relative = path.relative_to(assets)
        backup = originals / relative
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_bytes(before)
        path.write_bytes(after)
        record['savedBytes'] += len(before) - len(after)
        record['files'].append({'path': relative.as_posix(), 'beforeBytes': len(before), 'afterBytes': len(after),
            'beforeSha256': hashlib.sha256(before).hexdigest(), 'afterSha256': hashlib.sha256(after).hexdigest(),
            'filteredScanlineSha256': scanline_hash})
    return record
