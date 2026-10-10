"""Read the bounded Godot 4.5 RSRC/RSCC subset used by audio/BitMaps.

Based on the format specification in Godot's MIT-licensed core/io/
resource_format_binary.{cpp,h}; audio math follows AudioStreamPlaybackWAV.
This is an offline packaging adapter, not a runtime engine dependency.
Unknown variants or compression fail explicitly rather than inventing data.
"""
import ctypes
import ctypes.util
import struct
from pathlib import Path

def compressed_payload(data):
    """Godot FileAccessCompressed RSCC: bounded Zstd blocks + footer magic."""
    r=Reader(data)
    if r.take(4)!=b'RSCC': raise ValueError('Not Godot compressed resource')
    mode,block,total=r.u32(),r.u32(),r.u32()
    if mode!=2 or not 0<block<=16*1024*1024 or not 0<total<=256*1024*1024:
        raise ValueError('Unsupported/oversized Godot compressed resource')
    count=total//block+1
    if count>65536: raise ValueError('Too many compressed blocks')
    sizes=[r.u32() for _ in range(count)]
    if sum(sizes)+r.at+4!=len(data) or data[-4:]!=b'RSCC': raise ValueError('Invalid compressed resource bounds/footer')
    library=ctypes.util.find_library('zstd')
    if not library:
        library=next((str(p) for p in [Path('/opt/homebrew/lib/libzstd.dylib'),Path('/usr/local/lib/libzstd.dylib')] if p.exists()),None)
    if not library: raise RuntimeError('Offline BitMap transfer requires installed libzstd')
    lib=ctypes.CDLL(library)
    lib.ZSTD_decompress.argtypes=[ctypes.c_void_p,ctypes.c_size_t,ctypes.c_void_p,ctypes.c_size_t]
    lib.ZSTD_decompress.restype=ctypes.c_size_t
    lib.ZSTD_isError.argtypes=[ctypes.c_size_t];lib.ZSTD_isError.restype=ctypes.c_uint
    output=bytearray()
    for index,size in enumerate(sizes):
        expected=min(block,total-index*block);buffer=ctypes.create_string_buffer(max(expected,1))
        payload=r.take(size)
        if payload[:4]!=b'\x28\xb5\x2f\xfd':raise ValueError('Expected a Zstd block')
        actual=lib.ZSTD_decompress(buffer,expected,payload,len(payload))
        if lib.ZSTD_isError(actual) or actual!=expected:raise ValueError('Zstd block output size mismatch')
        output.extend(buffer.raw[:expected])
    return bytes(output)

class Reader:
    def __init__(self, data):
        self.data, self.at, self.endian, self.real_double = data, 0, '<', False

    def take(self, length):
        if length < 0 or self.at + length > len(self.data):
            raise ValueError('Truncated/oversized Godot binary field')
        value = self.data[self.at:self.at + length]; self.at += length
        return value

    def number(self, fmt):
        return struct.unpack(self.endian + fmt, self.take(struct.calcsize(fmt)))[0]

    def u32(self): return self.number('I')
    def u64(self): return self.number('Q')
    def string(self): return self.take(self.u32()).rstrip(b'\0').decode('utf-8')

    def count(self, limit=100000):
        n = self.u32()
        if n > limit: raise ValueError('Godot collection exceeds supported bound')
        return n

    def variant(self):
        kind = self.u32()
        if kind == 1: return None
        if kind == 2: return bool(self.u32())
        if kind == 3: return self.number('i')
        if kind == 40: return self.number('q')
        if kind == 4: return self.number('d' if self.real_double else 'f')
        if kind == 41: return self.number('d')
        if kind == 5: return self.string()
        if kind == 11: return [self.number('d' if self.real_double else 'f') for _ in range(4)]
        if kind == 45: return [self.number('i'), self.number('i')]
        if kind == 24:
            reference = self.u32()
            if reference == 0: return None
            if reference == 2: return {'godotInternalResource': self.u32()}
            raise ValueError('External binary object references are not supported')
        if kind == 26:
            count = self.u32() & 0x7fffffff
            if count > 100000: raise ValueError('Godot dictionary exceeds supported bound')
            result = {}
            for _ in range(count):
                key = self.variant(); result[key] = self.variant()
            return result
        if kind == 31:
            n = self.count(256 * 1024 * 1024); value = self.take(n)
            self.take((-n) % 4); return value
        raise ValueError(f'Unsupported Godot binary variant {kind} at {self.at - 4}')

def read_resource(data):
    r = Reader(data)
    magic=r.take(4)
    if magic==b'RSCC':
        # The virtual compressed stream has no RSRC magic; offsets start at 0.
        data=compressed_payload(data);r=Reader(data)
    elif magic!=b'RSRC': raise ValueError('Expected RSRC/RSCC resource')
    big = r.u32(); r.u32(); r.endian = '>' if big else '<'
    major, minor, version = r.u32(), r.u32(), r.u32()
    if major != 4 or version > 6: raise ValueError('Unsupported Godot binary version')
    resource_type = r.string(); r.u64(); flags = r.u32(); r.u64()
    r.real_double = bool(flags & 4)
    if flags & 8: r.string()
    r.take(11 * 4)
    strings = [r.string() for _ in range(r.count())]
    external = r.count()
    if external: raise ValueError('External resources are not supported by this adapter')
    internal = [(r.string(), r.u64()) for _ in range(r.count())]
    resources = []
    for path, offset in internal:
        if offset <= 0 or offset >= len(data): raise ValueError('Invalid internal resource offset')
        r.at = offset; kind = r.string(); properties = {}
        for _ in range(r.count()):
            key = r.u32()
            if key & 0x80000000: name = r.take(key & 0x7fffffff).rstrip(b'\0').decode('utf-8')
            else:
                if key >= len(strings): raise ValueError('Invalid Godot property string index')
                name = strings[key]
            properties[name] = r.variant()
        resources.append({'path': path, 'type': kind, 'properties': properties})
    if not resources or resources[-1]['type'] != resource_type: raise ValueError('Missing/main resource type mismatch')
    return {'engine': [major, minor], 'binaryVersion': version, 'resources': resources}

QOA_SCALES = [1,7,21,45,84,138,211,304,421,562,731,928,1157,1419,1715,2048]
# Quarter units allow exact ties-away-from-zero rounding without float math.
QOA_DEQUANT = [[(scale * n + 2) // 4 * sign for n, sign in
                [(3,1),(3,-1),(10,1),(10,-1),(18,1),(18,-1),(28,1),(28,-1)]]
               for scale in QOA_SCALES]

def qoa_pcm16(data):
    r = Reader(data); r.endian = '>'
    if r.take(4) != b'qoaf': raise ValueError('Not QOA audio')
    total = r.u32()
    if not 0 < total <= 16_000_000: raise ValueError('Unsupported QOA sample count')
    output, channels, rate, decoded = bytearray(), None, None, 0
    while decoded < total:
        start = r.at; header = int.from_bytes(r.take(8), 'big')
        nc, hz, samples, size = header >> 56, (header >> 32) & 0xffffff, (header >> 16) & 0xffff, header & 0xffff
        if not 1 <= nc <= 8 or not hz or not 1 <= samples <= 5120:
            raise ValueError('Invalid QOA frame dimensions')
        if channels is None: channels, rate = nc, hz
        if nc != channels or hz != rate or decoded + samples > total:
            raise ValueError('Inconsistent QOA frame')
        if size != 8 + 16 * nc + ((samples + 19) // 20) * 8 * nc:
            raise ValueError('Invalid QOA frame size')
        state = [list(struct.unpack('>8h', r.take(16))) for _ in range(nc)]
        frame = bytearray(samples * nc * 2)
        for block in range(0, samples, 20):
            for channel in range(nc):
                value = int.from_bytes(r.take(8), 'big'); table = QOA_DEQUANT[value >> 60]
                history, weights = state[channel][:4], state[channel][4:]
                for i in range(min(20, samples - block)):
                    residual = table[(value >> (57 - i * 3)) & 7]
                    # Match the reference decoder's signed int32 accumulator.
                    prediction = sum(h * w for h, w in zip(history, weights))
                    prediction = ((prediction + 0x80000000) & 0xffffffff) - 0x80000000
                    sample = max(-32768, min(32767, (prediction >> 13) + residual))
                    struct.pack_into('<h', frame, ((block + i) * nc + channel) * 2, sample)
                    delta = residual >> 4
                    weights = [w + (-delta if h < 0 else delta) for h, w in zip(history, weights)]
                    history = history[1:] + [sample]
                state[channel] = history + weights
        if r.at != start + size: raise ValueError('QOA frame read mismatch')
        output.extend(frame); decoded += samples
    if r.at != len(data): raise ValueError('Trailing QOA data')
    return bytes(output), {'channels': channels, 'sampleRate': rate, 'samples': total, 'seconds': total / rate}
