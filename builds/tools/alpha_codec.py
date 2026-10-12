"""Lossless alpha transport shared by import and migration tools."""
import base64
import json
import zlib


def plane(mask):
    width, height = mask['size']
    if not 0 < width * height <= 64 * 1024 * 1024:
        raise ValueError('Invalid alpha dimensions')
    if 'data' in mask:
        raw = zlib.decompress(base64.b64decode(mask['data'], validate=True))
    else:
        if len(mask['rows']) != height:
            raise ValueError('Invalid alpha row count')
        raw = bytearray()
        for row in mask['rows']:
            if len(row) % 2 or sum(row[::2]) != width:
                raise ValueError('Invalid alpha row width')
            for count, value in zip(row[::2], row[1::2]):
                if type(count) is not int or count <= 0 or type(value) is not int or not 0 <= value <= 255:
                    raise ValueError('Invalid alpha run')
                raw.extend(bytes([value]) * count)
    if len(raw) != width * height:
        raise ValueError('Invalid alpha plane size')
    return bytes(raw)


def encode_masks(masks):
    encoded, pixels, peak_compressed = {}, 0, 0
    for resource, mask in masks.items():
        raw = plane(mask)
        compressed = zlib.compress(raw, 9)
        assert zlib.decompress(compressed) == raw
        encoded[resource] = {'size': mask['size'], 'origin': mask['origin'],
                             'data': base64.b64encode(compressed).decode('ascii')}
        pixels += len(raw)
        peak_compressed = max(peak_compressed, len(compressed))
    payload = {'schema': 2, 'encoding': 'zlib-u8-base64', 'masks': encoded}
    data = json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n'
    # Runtime writes inflate chunks directly into one final Uint8Array per mask.
    # Reserve parsed UTF-16 JSON, all planes, one compressed buffer and 512 KiB
    # for inflater tables/window/chunks and object overhead. No budget increase.
    estimate = len(data.encode()) * 2 + pixels + peak_compressed + 512 * 1024
    return data, {'path': 'alpha-masks', 'decodedBytes': estimate, 'pixelBytes': pixels,
                  'encoding': 'zlib-u8-base64'}
