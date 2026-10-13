"""A storage optimization must preserve original scanlines and all color metadata."""
import importlib.util
from pathlib import Path
import struct
import unittest
import zlib

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('png_storage', ROOT / 'builds/android/png_storage.py')
PNG = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PNG)


def chunk(kind, body):
    return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body) & 0xffffffff)


class PngStorageTests(unittest.TestCase):
    def fixture(self):
        scanlines = (b'\0' + b'\x12\x34\x56\xff' * 32) * 24
        return PNG.SIGNATURE + chunk(b'IHDR', struct.pack('>IIBBBBB', 32, 24, 8, 6, 0, 0, 0)) + \
            chunk(b'gAMA', struct.pack('>I', 45455)) + chunk(b'tEXt', b'Author\0Original asset') + \
            chunk(b'IDAT', zlib.compress(scanlines, 1)) + chunk(b'IEND', b'')

    def test_recompression_preserves_filtered_pixels_and_metadata(self):
        before = self.fixture()
        after, digest = PNG.compact(before)
        self.assertLess(len(after), len(before))
        self.assertRegex(digest, r'^[a-f0-9]{64}$')
        one, two = PNG.chunks(before), PNG.chunks(after)
        self.assertEqual([raw for kind, _, raw in one if kind != b'IDAT'],
                         [raw for kind, _, raw in two if kind != b'IDAT'])
        self.assertEqual(zlib.decompress(b''.join(body for kind, body, _ in one if kind == b'IDAT')),
                         zlib.decompress(b''.join(body for kind, body, _ in two if kind == b'IDAT')))
        self.assertEqual(PNG.compact(after)[0], after)

    def test_corruption_and_truncation_are_rejected(self):
        before = self.fixture()
        for data in [before[:-1], before[:50] + bytes([before[50] ^ 1]) + before[51:]]:
            with self.assertRaises(ValueError):
                PNG.compact(data)


if __name__ == '__main__':
    unittest.main()
