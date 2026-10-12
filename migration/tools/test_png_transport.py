import io
import unittest
from PIL import Image
from png_transport import exact_png


class PNGTransportTests(unittest.TestCase):
    def test_opaque_pixels_roundtrip_including_rgb_values(self):
        source = Image.frombytes('RGBA', (47, 43), bytes(v for i in range(47 * 43)
                                for v in (i % 256, (i * 7) % 256, (i * 17) % 256, 255)))
        original = io.BytesIO()
        source.save(original, format='PNG', optimize=True)
        encoded = exact_png(source)
        decoded = Image.open(io.BytesIO(encoded))
        self.assertLessEqual(len(encoded), len(original.getvalue()))
        self.assertEqual(decoded.size, source.size)
        self.assertEqual(decoded.convert('RGBA').tobytes(), source.tobytes())

    def test_translucent_and_hidden_rgb_are_preserved(self):
        source = Image.frombytes('RGBA', (2, 2), bytes([255, 1, 2, 0, 3, 254, 4, 1,
                                                       5, 6, 253, 254, 7, 8, 9, 255]))
        decoded = Image.open(io.BytesIO(exact_png(source)))
        self.assertEqual(decoded.mode, 'RGBA')
        self.assertEqual(decoded.tobytes(), source.tobytes())


if __name__ == '__main__':
    unittest.main()
