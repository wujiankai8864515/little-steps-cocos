#!/usr/bin/env python3
"""Create lossless Cocos art and declarative layout references from inert data."""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import uuid
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'migration/.cache/zhaoyunyuadou/reference-data'
GAME = ROOT / 'games/zhaoyunyuadou'
ASSETS = GAME / 'assets'


def identity(path):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'zya-cocos/' + str(path)))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def meta(path, importer, version, user_data=None, files=None):
    write_json(Path(str(path) + '.meta'), {'ver': version, 'importer': importer, 'imported': True,
               'uuid': identity(path.relative_to(GAME)), 'files': files or [], 'subMetas': {},
               'userData': user_data or {}})


def clean_layout(node):
    # Retain only declarative appearance. No proprietary script/runtime fields.
    keep = {'name', 'x', 'y', 'width', 'height', 'anchorX', 'anchorY', 'scaleX', 'scaleY',
            'rotation', 'alpha', 'visible', 'skin', 'text', 'fontSize', 'font', 'color',
            'bold', 'italic', 'align', 'valign', 'wordWrap', 'leading', 'stroke',
            'strokeColor', 'sizeGrid', 'stateNum', 'left', 'right', 'top', 'bottom',
            'centerX', 'centerY', 'bgColor', 'zIndex', 'labels', 'gray', '_gcmds'}
    out = {k: v for k, v in node.items() if k in keep}
    out['kind'] = node.get('_$type', 'Prefab')
    out['children'] = [clean_layout(child) for child in node.get('_$child', [])]
    mask_id = node.get('mask', {}).get('_$ref')
    if mask_id:
        for original, cleaned in zip(node.get('_$child', []), out['children']):
            if original.get('_$id') == mask_id:
                cleaned['maskGeometry'] = True
    return out


def category(path):
    if '/sound/' in path or '/music/' in path: return 'audio'
    if path == 'resources/img/gameOverUI/AutoAtlas.png': return 'common'
    if '/anim/' in path: return 'actors'
    if '/loading/' in path or '/commonUI/' in path: return 'common'
    if '/mainUI/' in path or '/matchUI/' in path: return 'home'
    if '/map/' in path: return 'maps'
    if '/props/' in path or '/effect/' in path:return 'effects'
    if any('/' + group + '/' in path for group in ['map', 'gameObject', 'battleUI', 'props', 'effect']): return 'battle'
    return 'meta'


def main():
    records, frames = [], {}
    previous_path=GAME/'docs/ASSET_PROVENANCE.json'
    previous=json.loads(previous_path.read_text()).get('files',[]) if previous_path.exists() else []
    for p in sorted((SOURCE / 'resources').rglob('*')):
        if not p.is_file() or p.suffix.lower() not in {'.png', '.jpg', '.mp3', '.wav', '.ogg', '.json'}:
            continue
        rel = p.relative_to(SOURCE).as_posix()
        if any(lang in p.name for lang in ['_en', '_jp', '_kr', '_tch']) or p.name == 'fileconfig.json':
            continue
        if p.suffix == '.json' and '/anim/' not in rel:
            continue
        bundle = category(rel)
        key = hashlib.sha256(rel.encode()).hexdigest()[:20]
        target = ASSETS / 'bundles' / ('zya_' + bundle) / (key + p.suffix)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(p, target)
        if p.suffix == '.json':
            # Creator otherwise detects skeleton-shaped JSON and picks its Spine
            # importer, even with the runtime module disabled. This is inert data.
            meta(target, 'json', '2.0.1', files=['.json'])
        records.append({'source': rel, 'target': target.relative_to(GAME).as_posix(),
                        'sha256': hashlib.sha256(p.read_bytes()).hexdigest(), 'bytes': p.stat().st_size})
        if p.suffix in {'.png', '.jpg'}:
            w, h = Image.open(p).size
            frames[rel] = {'bundle': 'zya_' + bundle, 'file': key, 'width': w, 'height': h,
                           'rect': [0, 0, w, h], 'original': [w, h], 'offset': [0, 0]}
            atlas = p.with_suffix('.atlas')
            if p.stem == 'AutoAtlas' and atlas.is_file():
                info = json.loads(atlas.read_text())
                prefix = info['meta'].get('prefix', p.parent.relative_to(SOURCE).as_posix() + '/')
                for name, entry in info['frames'].items():
                    if any(lang in name for lang in ['_en', '_jp', '_kr', '_tch']): continue
                    f, s, o = entry['frame'], entry['sourceSize'], entry['spriteSourceSize']
                    frames[prefix + name] = {'bundle': 'zya_' + bundle, 'file': key,
                         'width': w, 'height': h, 'rect': [f['x'], f['y'], f['w'], f['h']],
                         'original': [s['w'], s['h']], 'offset': [o['x'], o['y']]}
        else:
            frames[rel] = {'bundle': 'zya_' + bundle, 'file': key, 'kind': p.suffix[1:], 'bytes':p.stat().st_size}
    current_targets={record['target'] for record in records}
    for record in previous:
        if record['target'] in current_targets:continue
        old=GAME/record['target']
        if old.exists():
            if hashlib.sha256(old.read_bytes()).hexdigest()!=record['sha256']:raise ValueError('Preserve changed asset '+str(old))
            old.unlink()
            metadata=Path(str(old)+'.meta')
            if metadata.exists():metadata.unlink()
    # Actor atlases use independent region data; the game evaluates bones/meshes
    # itself through the shared Cocos UI assembler, without a Spine dependency.
    actor_atlases = {}
    for atlas in (SOURCE / 'resources/anim').rglob('*.atlas'):
        if any(lang in atlas.name for lang in ['_kr', '_jp', '_tch']): continue
        lines = atlas.read_text().splitlines()
        texture, region, result = None, None, {}
        for line in lines:
            if not line.strip(): continue
            if not line.startswith(' ') and ':' not in line:
                if line.endswith('.png'):
                    texture = atlas.parent.relative_to(SOURCE).as_posix() + '/' + line
                else:
                    region = line; result[region] = {}
            elif region and ':' in line:
                k, value = line.strip().split(':', 1); result[region][k] = value.strip()
        actor_atlases[atlas.with_suffix('.json').relative_to(SOURCE).as_posix()] = {'texture': texture, 'regions': result}
    layouts = {}
    for folder in ['scene', 'dialog', 'prefab']:
        for p in sorted((SOURCE / folder).glob('*')):
            if p.suffix in {'.ls', '.lh'}:
                layouts[p.stem] = clean_layout(json.loads(p.read_text()))
    write_json(ASSETS / 'resources/data/art.json', {'frames': frames, 'actors': actor_atlases})
    write_json(ASSETS / 'resources/data/layouts.json', layouts)
    for name in ['weapon', 'rank', 'rankData', 'weaponTxt']:
        shutil.copyfile(SOURCE / 'data' / (name + '.json'), ASSETS / 'resources/data' / (name + '.json'))
    for name in ['common', 'home', 'maps', 'battle', 'effects', 'meta', 'actors', 'audio']:
        directory = ASSETS / 'bundles' / ('zya_' + name)
        meta(directory, 'directory', '1.2.0', {'isBundle': True, 'bundleName': 'zya_' + name,
             'priority': 10, 'compressionType': {}, 'isRemoteBundle': False})
    # Consume the already published readonly framework without modifying it.
    plugin = ASSETS / 'plugins/travel-core.js'
    plugin.parent.mkdir(exist_ok=True)
    target = ROOT / 'engines/travel-core/dist/travel-core.js'
    if target.stat().st_mode & 0o222: raise ValueError('Framework target is not readonly')
    if not plugin.is_symlink(): plugin.symlink_to(os.path.relpath(target, plugin.parent))
    if plugin.resolve() != target: raise ValueError('Unexpected framework link')
    meta(plugin, 'javascript', '4.0.24', {'isPlugin': True, 'loadPluginInEditor': False,
         'loadPluginInWeb': True, 'loadPluginInNative': False, 'loadPluginInMiniGame': True,
         'executionScope': 'global'})
    evidence = {'packageSHA256': hashlib.sha256((SOURCE.parent / 'reference-original.xapk').read_bytes()).hexdigest(),
                'scope': 'Lossless art + declarative appearance only. Original runtime excluded.',
                'framework': {'link': str(plugin.relative_to(GAME)), 'targetMode': '0444',
                     'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}, 'files': records}
    write_json(GAME / 'docs/ASSET_PROVENANCE.json', evidence)
    print(json.dumps({'assets': len(records), 'frames': len(frames), 'layouts': len(layouts),
                      'bytes': sum(item['bytes'] for item in records)}))


if __name__ == '__main__': main()
