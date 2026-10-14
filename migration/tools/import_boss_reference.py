"""Import inert art and configuration from the user-supplied boss4 archive.

Compiled reference scripts are never installed into the authored game.
Source PNG bytes stay unchanged; channel optimization happens in a build mirror.
"""
from pathlib import Path
import hashlib
import json
import shutil
import uuid
import wave
import math
import struct

ROOT = Path(__file__).resolve().parents[2]
PROJECT = ROOT / 'games/boss'
REFERENCE = ROOT / 'migration/references/boss4/boss4/assets/resources'
NS = uuid.UUID('fe7384ba-51f6-45b0-88f4-b78e02900f56')


def metadata(path, importer, data=None):
    identity = str(uuid.uuid5(NS, path.relative_to(PROJECT).as_posix()))
    result = {'ver': '1.2.0' if importer == 'directory' else '1.0.0',
              'importer': importer, 'imported': True, 'uuid': identity,
              'files': [], 'subMetas': {}, 'userData': data or {}}
    if importer == 'image':
        result['ver'] = '1.0.27'
        result['files'] = ['.json', '.png']
        result['userData'] = {'type': 'texture', 'redirect': identity + '@6c48a',
                              'hasAlpha': True, 'fixAlphaTransparencyArtifacts': False}
        result['subMetas']['6c48a'] = {
            'ver': '1.0.22', 'importer': 'texture', 'imported': True,
            'uuid': identity + '@6c48a', 'files': ['.json'], 'subMetas': {},
            'displayName': path.stem, 'id': '6c48a', 'name': 'texture',
            'userData': {'wrapModeS': 'clamp-to-edge', 'wrapModeT': 'clamp-to-edge',
                         'minfilter': 'linear', 'magfilter': 'linear', 'mipfilter': 'none',
                         'premultiplyAlpha': False, 'anisotropy': 0, 'isUuid': True,
                         'imageUuidOrDatabaseUri': identity, 'visible': False}}
    path.with_name(path.name + '.meta').write_text(json.dumps(result, indent=2) + '\n')


def main():
    source = json.loads((ROOT / 'migration/references/boss4-assets.json').read_text())
    provenance = []
    for name, identity, files in source:
        if not files:
            continue
        parts = name.split('/')
        category = parts[1]
        if category == 'level':
            level = int(parts[2][2:])
            bundle = 'company_' + str((level - 1) // 5 + 1)
            relative = '/'.join(parts[2:])
        elif category in ('hall', 'loading'):
            bundle = 'home' if category == 'hall' else 'loading'
            relative = parts[-1]
        elif category == 'experience':
            bundle, relative = 'cards', parts[2]
        elif category == 'experience_card':
            bundle, relative = 'cards', parts[-1]
        else:
            bundle, relative = 'shared', parts[-1]
        target = PROJECT / 'assets/bundles' / bundle / (relative + '.png')
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / files[0], target)
        metadata(target, 'image')
        provenance.append({'referencePath': name, 'referenceUUID': identity,
                           'path': str(target.relative_to(PROJECT)),
                           'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
    for directory in (PROJECT / 'assets/bundles').iterdir():
        if directory.is_dir():
            metadata(directory, 'directory', {'isBundle': True, 'bundleName': directory.name,
                                             'priority': 5, 'compressionType': {}, 'isRemoteBundle': False})
    data = PROJECT / 'assets/resources/data'
    data.mkdir(parents=True, exist_ok=True)
    level_json = REFERENCE / 'import/a4/a4c8f1e2-9b3d-4a7e-8f2c-1d5e6b7a9c0d.json'
    levels = json.loads(level_json.read_text())[5][0][2]
    for level in levels['levels']:
        level['bossEnergy'] = 360 + level['id'] * 110
        level['reward'] = 20 + level['id'] * 8
    (data / 'levels.json').write_text(json.dumps(levels, ensure_ascii=False, indent=2) + '\n')
    (data / 'platform.json').write_text(json.dumps({'rewardedAdUnitId': '', 'leaderboardEndpoint': ''}, indent=2) + '\n')
    font = PROJECT / 'assets/resources/font/Alibaba-PuHuiTi-Heavy.ttf'
    font.parent.mkdir(parents=True, exist_ok=True)
    original = REFERENCE / 'native/75/75957138-2eb1-491b-9d09-9088cad5b175/Alibaba-PuHuiTi-Heavy.ttf'
    shutil.copyfile(original, font)
    metadata(font, 'ttf-font')
    provenance.append({'referencePath': str(original.relative_to(REFERENCE)),
                       'path': str(font.relative_to(PROJECT)),
                       'sha256': hashlib.sha256(font.read_bytes()).hexdigest()})
    audio = PROJECT / 'assets/resources/audio'
    audio.mkdir(parents=True, exist_ok=True)
    # Original, deterministic mono chiptune cues; no third-party audio samples.
    def synth(name, seconds, tones):
        rate = 22050
        frames = bytearray()
        for i in range(int(rate * seconds)):
            t = i / rate
            beat = int(t / .18)
            hz = tones[beat % len(tones)]
            envelope = min(1, (t % .18) * 80) * max(0, 1 - (t % .18) / .18)
            value = (.6 * math.sin(2 * math.pi * hz * t) + .2 * math.sin(4 * math.pi * hz * t)) * envelope
            frames.extend(struct.pack('<h', int(value * 7000)))
        path = audio / (name + '.wav')
        with wave.open(str(path), 'wb') as output:
            output.setnchannels(1); output.setsampwidth(2); output.setframerate(rate); output.writeframes(frames)
        metadata(path, 'audio-clip')
    synth('music', 11.52, [220, 330, 440, 330, 262, 392, 523, 392, 294, 440, 587, 440, 247, 370, 494, 330])
    synth('click', .08, [600])
    synth('pickup', .35, [523, 784])
    synth('hit', .22, [120, 70])
    synth('fire', .14, [85])
    synth('win', 1.1, [392, 523, 659, 784, 1046, 1318])
    synth('lose', .75, [330, 247, 196, 110])
    source_dir = PROJECT / 'source'
    source_dir.mkdir(exist_ok=True)
    (source_dir / 'provenance.json').write_text(json.dumps({
        'source': 'User-supplied boss4.zip', 'zipSHA256': hashlib.sha256(Path('/Users/wkk/Downloads/boss4.zip').read_bytes()).hexdigest(),
        'scope': 'Original PNG/font bytes and declarative level data; reference code excluded',
        'audio': 'Original synthesized mono PCM, import_boss_reference.py', 'assets': provenance,
    }, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'assets': len(provenance), 'project': str(PROJECT)}))


if __name__ == '__main__':
    main()
