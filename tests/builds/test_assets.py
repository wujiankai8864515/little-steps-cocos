import hashlib
import json
import shutil
import sys
import tempfile
import unittest
import wave
from pathlib import Path
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'builds/wechatgame'))
from assets import optimize


class PackagingAssetsTest(unittest.TestCase):
    def test_only_packaging_copy_changes_and_background_and_audio_fit_policy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original = root / 'original'
            base = original / 'assets/bundles/home'
            base.mkdir(parents=True)
            image = Image.new('RGBA', (941, 1672))
            image.putdata([(220+x%25, 165+y%40, 95+(x*y)%70, 240+(x+y)%16)
                           for y in range(1672) for x in range(941)])
            image.save(base / 'neutral_plate.png')
            shutil.copyfile(base / 'neutral_plate.png', base / 'source_mask.png')
            with wave.open(str(base / 'knock.wav'), 'wb') as audio:
                audio.setnchannels(2);audio.setsampwidth(2);audio.setframerate(44100)
                audio.writeframes(b'\x00\x01\x00\x01' * 44100)
            specs = {'plate': {'kind': 'texture', 'bundle': 'home', 'path': 'neutral_plate/texture', 'decodedBytes': 941*1672*4},
                     'source_mask': {'kind': 'texture', 'bundle': 'home', 'path': 'source_mask/texture'},
                     'res://knock.wav': {'kind': 'audio', 'bundle': 'home', 'path': 'knock'}}
            catalog = original / 'assets/resources/source-catalog.json'
            catalog.parent.mkdir();catalog.write_text(json.dumps({'assets': specs}))
            before = hashlib.sha256((base / 'neutral_plate.png').read_bytes()).hexdigest()
            stage = root / 'stage'
            project = stage / 'game'
            shutil.copytree(original, project)
            rows = optimize(project, stage, {'enabled': True, 'backgroundWidth': 720,
                                             'backgroundMaxBytes': 500000, 'musicBitrate': 48000})
            payload = project / 'assets/bundles/home/neutral_plate.png'
            self.assertEqual(Image.open(payload).width, 720)
            self.assertLessEqual(payload.stat().st_size, 500000)
            self.assertEqual(hashlib.sha256((base / 'neutral_plate.png').read_bytes()).hexdigest(), before)
            self.assertEqual((project / 'assets/bundles/home/source_mask.png').read_bytes(), (base / 'source_mask.png').read_bytes())
            with wave.open(str(project / 'assets/bundles/home/knock.wav')) as audio:
                self.assertEqual(audio.getnchannels(), 1)
                self.assertEqual(audio.getframerate(), 22050)
            self.assertTrue(any(row['sourceSHA256'] != row['packagingSHA256'] for row in rows))
