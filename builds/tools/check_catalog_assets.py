"""Check the complete declared runtime catalogue, including ignored source art."""
import json
from pathlib import Path


def check_catalog(project):
    assets = Path(project) / 'assets'
    catalog = json.loads((assets / 'resources/source-catalog.json').read_text())
    expected = set()
    for key, spec in catalog['assets'].items():
        kind, path = spec['kind'], spec['path']
        if kind == 'texture':
            if not path.endswith('/texture'):
                raise ValueError('Unexpected texture subasset: ' + key)
            path = path[:-len('/texture')] + '.png'
        elif kind in ('mask', 'json', 'font', 'image'):
            path += {'mask': '.json', 'json': '.json', 'font': '.ttf', 'image': '.png'}[kind]
        elif kind == 'audio':
            ext = Path(key).suffix
            if ext not in ('.mp3', '.wav'):
                raise ValueError('Unexpected audio type: ' + key)
            path += ext
        else:
            raise ValueError('Unverified catalogue kind: ' + kind)
        expected.add('bundles/' + spec['bundle'] + '/' + path)
    for name, group in catalog['groups'].items():
        if group.get('cocosAlpha'):
            expected.add('bundles/' + name + '/' + group['cocosAlpha']['path'] + '.json')
    missing = []
    for relative in sorted(expected):
        target = assets / relative
        if not target.resolve().is_relative_to(assets.resolve()):
            raise ValueError('Catalogue path outside assets')
        for file in (target, Path(str(target) + '.meta')):
            if not file.is_file():
                missing.append(str(file.relative_to(assets)))
    return {'catalogAssets': len(catalog['assets']), 'sourceFiles': len(expected), 'missing': missing}
