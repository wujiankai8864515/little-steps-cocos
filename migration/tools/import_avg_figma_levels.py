#!/usr/bin/env python3
"""Convert audited Figma bp_poker/bp_open_hand data to the existing runtime JSON contract."""
import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import uuid

ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / 'games/avg_plus'
LEVELS = GAME / 'assets/art/resources/config/card-levels'
LEVEL_NAME = re.compile(r'^level_difficulty(\d+)_(\d{2})$')
FRONT = re.compile(r'^poker_(diamond|heart|spade|club)_(red|black)_(\d{2})$')
COLORS = {'diamond': 'red', 'heart': 'red', 'spade': 'black', 'club': 'black'}
LABELS = ['A'] + [str(n) for n in range(2, 11)] + ['J', 'Q', 'K']


def audit(name):
    back = re.fullmatch(r'poker_back_(\d{2})', name)
    if back:
        return {'side': 'back', 'assetName': name, 'variant': back[1]}
    front = FRONT.fullmatch(name)
    if not front or COLORS[front[1]] != front[2] or not 1 <= int(front[3]) <= 13:
        raise ValueError('Unknown card component: ' + name)
    rank = int(front[3])
    return {'side': 'front', 'assetName': name, 'suit': front[1], 'color': front[2],
            'rankCode': front[3], 'rankValue': rank, 'label': LABELS[rank - 1], 'rankLabel': LABELS[rank - 1]}


def polygon(slot):
    angle = math.radians(slot['rotation'])
    c, s = math.cos(angle), math.sin(angle)
    return [(slot['x'] + x * c - y * s, slot['y'] + x * s + y * c)
            for x, y in [(-slot['width']/2, -slot['height']/2), (slot['width']/2, -slot['height']/2),
                         (slot['width']/2, slot['height']/2), (-slot['width']/2, slot['height']/2)]]


def intersection_area(subject, clip):
    """Convex polygon clipping; cards that only touch an edge do not block one another."""
    result = subject
    for a, b in zip(clip, clip[1:] + clip[:1]):
        source, result = result, []
        if not source:
            return 0.0
        def side(p):
            return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
        previous = source[-1]
        for current in source:
            sp, sc = side(previous), side(current)
            if (sp >= 0) != (sc >= 0):
                t = sp / (sp - sc)
                result.append((previous[0]+t*(current[0]-previous[0]), previous[1]+t*(current[1]-previous[1])))
            if sc >= 0:
                result.append(current)
            previous = current
    return abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(result,result[1:]+result[:1]))) / 2


def convert(raw, source):
    match = LEVEL_NAME.fullmatch(raw['name'])
    board, hands = raw['board'], raw['hand']
    if not match or len(hands) != 1:
        raise ValueError('Each named level must have exactly one opening hand: ' + raw['name'])
    width, height = board['width'], board['height']
    if not all(isinstance(n,(int,float)) and math.isfinite(n) and n > 0 for n in [width,height]):
        raise ValueError('Invalid board size')
    slots = []
    for index, card in enumerate(board['cards']):
        node_id, name, w, h, cx, cy, rotation = card
        if (w,h) != (162,243) or not all(math.isfinite(n) for n in [cx,cy,rotation]):
            raise ValueError('Unexpected original card geometry: ' + node_id)
        semantic = audit(name)
        slots.append({'id': f'slot_{index+1:03d}', 'sourceName': name,
                      'x': round(cx-width/2,6), 'y': round(height/2-cy,6),
                      'width': w, 'height': h, 'rotation': round(rotation,6), 'zIndex': index+1,
                      'initialFaceUp': semantic['side'] == 'front', 'coveredBy': [],
                      'figmaCard': semantic, 'covers': []})
    if not slots:
        raise ValueError('Empty board: ' + raw['name'])
    polygons = [polygon(s) for s in slots]
    # Preserve Figma paint order. A later sibling blocks an earlier overlapping card.
    for lower in range(len(slots)):
        for upper in range(lower+1,len(slots)):
            if intersection_area(polygons[lower],polygons[upper]) > 1.0:
                slots[lower]['coveredBy'].append(slots[upper]['id'])
                slots[upper]['covers'].append(slots[lower]['id'])
    current = audit(hands[0]['name'])
    if current['side'] != 'front':
        raise ValueError('Opening hand must be a standard front card')
    fixed = Counter(s['sourceName'] for s in slots if s['initialFaceUp'])
    fixed[current['assetName']] += 1
    decks = max(math.ceil((len(slots)+11)/52), max(fixed.values()))
    if decks > 4:
        raise ValueError('Level needs more than four decks')
    # Keep original geometry inside the declared area, including harmless float rounding.
    layout_w = max(width, 2*max(abs(x) for p in polygons for x,_ in p))
    layout_h = max(height, 2*max(abs(y) for p in polygons for _,y in p))
    return {'schemaVersion': 1, 'levelId': raw['name'], 'difficulty': int(match[1]),
            'source': {'type':'figma', 'fileKey':source['fileKey'], 'pageName':source['pageName'],
                       'frameName':raw['name'], 'frameId':raw['id'], 'boardId':board['id'],
                       'handId':hands[0]['id'], 'cardNodeIds':[c[0]for c in board['cards']],
                       'boardSize':{'width':width,'height':height}},
            'designSize':{'width':layout_w,'height':layout_h}, 'cardSize':{'width':162,'height':243},
            'initialStockCount':10, 'deckCount':decks, 'slots':slots,
            'currentCard':{'sourceName':current['assetName'], 'figmaCard':current}}


def run(source_path, verify_only=False):
    source_path = Path(source_path)
    source = json.loads(source_path.read_text())
    if source.get('fileKey') != 'YMuq2nhziNuRf309T17tkc' or source.get('pageName') != '卡牌玩法界面':
        raise ValueError('Wrong Figma game/page')
    raw_levels = source['levels']
    if len({l['name']for l in raw_levels}) != len(raw_levels):
        raise ValueError('Duplicate Figma level name')
    levels = [convert(l,source)for l in raw_levels]
    assets = json.loads((GAME/'assets/art/resources/assets/poker/card-catalog.json').read_text())['assets']
    for level in levels:
        for name in [s['sourceName']for s in level['slots']]+[level['currentCard']['sourceName']]:
            if name not in assets:
                raise ValueError('Component has no existing project card asset: '+name)
    if not verify_only:
        history=ROOT/'migration/history/avg_plus/pre-figma-20261014';history.mkdir(parents=True,exist_ok=True)
        for p in LEVELS.glob('*.json'):
            if not (history/p.name).exists():
                shutil.copy2(p,history/p.name)
                if p.with_suffix('.json.meta').exists():shutil.copy2(p.with_suffix('.json.meta'),history/(p.name+'.meta'))
        for level in levels:
            path=LEVELS/(level['levelId']+'.json')
            path.write_text(json.dumps(level,ensure_ascii=False,indent=2)+'\n')
            meta=path.with_suffix('.json.meta')
            if not meta.exists():
                meta.write_text(json.dumps({'ver':'2.0.1','importer':'json','imported':True,
                    'uuid':str(uuid.uuid5(uuid.NAMESPACE_URL,'avg-plus:card-level:'+level['levelId'])),
                    'files':['.json'],'subMetas':{},'userData':{}},indent=2)+'\n')
    report={'item':'AVG.FIGMA.02','fileKey':source['fileKey'],'page':source['pageName'],
            'sourceSha256':hashlib.sha256(source_path.read_bytes()).hexdigest(),'levelCount':len(levels),
            'slotCount':sum(len(l['slots'])for l in levels),'written':not verify_only,
            'format':'existing schemaVersion 1; optional deckCount allows large/repeated-card designs',
            'geometry':'Figma center relative to bp_poker; Y inverted; rotation and sibling order retained',
            'occlusion':'rotated rectangle intersection area > 1 square pixel, from later siblings',
            'levels':[{'id':l['levelId'],'cards':len(l['slots']),'deckCount':l['deckCount'],
                       'coverEdges':sum(len(s['coveredBy'])for s in l['slots'])}for l in levels],
            'verification':{'types':'pending','allLevelsStartRestoreUndo':'pending','android':'pending'}}
    if not verify_only:
        (ROOT/'migration/reviews/avg_plus/figma-level-import-20261014.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    return report


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('--verify-only',action='store_true')
    args=parser.parse_args()
    print(json.dumps(run(args.source,args.verify_only),ensure_ascii=False,indent=2))
