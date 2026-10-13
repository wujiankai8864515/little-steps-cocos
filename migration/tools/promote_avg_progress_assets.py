#!/usr/bin/env python3
"""Preserve the exact six progress sprites already selected by the game prefab."""
from pathlib import Path
import hashlib
import json
import shutil
import uuid

ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / 'games/avg_plus'
SOURCE = GAME / 'assets/art/__figma_static_inbox__/组件库/元件'
DESTINATION = GAME / 'assets/art/textures/progress'
NAMES = ['img_main_progress_' + color + suffix for color in ['gray', 'black', 'red'] for suffix in ['01', '02']]


def main():
    prefab = (GAME / 'assets/art/resources/prefabs/gamePage.prefab').read_text()
    assets = []
    for name in NAMES:
        image, meta = SOURCE / (name + '.png'), SOURCE / (name + '.png.meta')
        metadata = json.loads(meta.read_text())
        assert metadata['subMetas']['f9941']['uuid'] in prefab, name
        assert image.is_file()
        assert not (DESTINATION / image.name).exists()
        assets.append({'source': str(image.relative_to(ROOT)), 'destination': str((DESTINATION / image.name).relative_to(ROOT)),
                       'uuid': metadata['uuid'], 'spriteUuid': metadata['subMetas']['f9941']['uuid'],
                       'sha256': hashlib.sha256(image.read_bytes()).hexdigest(),
                       'metaSHA256': hashlib.sha256(meta.read_bytes()).hexdigest()})
    DESTINATION.mkdir(parents=True, exist_ok=False)
    for asset in assets:
        source = ROOT / asset['source']; destination = ROOT / asset['destination']
        shutil.move(str(source), str(destination))
        shutil.move(str(source) + '.meta', str(destination) + '.meta')
    metadata = {'ver': '1.2.0', 'importer': 'directory', 'imported': True,
                'uuid': str(uuid.uuid5(uuid.NAMESPACE_URL, 'avg_plus:art:textures:progress')),
                'files': [], 'subMetas': {}, 'userData': {}}
    DESTINATION.with_suffix('.meta').write_text(json.dumps(metadata, indent=2) + '\n')
    record = {'item': 'AVG.ART.01', 'trigger': 'Clean native export reported six missing prefab SpriteFrames',
              'rootCause': 'Prefab already selected sprites under an ignored Figma inbox; Git-based isolated export omitted them',
              'authorization': 'User authorized all work needed for existing UI and exact card presentation; selected only sprites already referenced by the prefab',
              'repair': 'Moved original pixels and metadata together to tracked art/textures/progress; prefab references and UUIDs unchanged',
              'assets': assets, 'historical18UUIDs': 'pending; independent pre-existing failure', 'visual': 'pending'}
    target = ROOT / 'migration/reviews/avg_plus/progress-assets-recovery.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'promoted': len(assets), 'record': str(target)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
