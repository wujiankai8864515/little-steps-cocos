#!/usr/bin/env python3
from pathlib import Path
import json,argparse,hashlib
from PIL import Image
from atlas_packing import pack
ROOT=Path(__file__).resolve().parents[3];HERE=Path(__file__).resolve().parent
ap=argparse.ArgumentParser();ap.add_argument('--with-hd',action='store_true');args=ap.parse_args()
meta=json.loads((HERE/'assets_manifest.json').read_text());source_by_id={x['id']:x for x in meta['assets']}
base=Image.open(HERE/'base_material_atlas_v1.png').convert('RGBA')
images={'paper':base.crop((16,16,432,528)),'clip':base.crop((464,16,752,232))}
ids={'title':'title_paper','hint':'hint_paper','tag':'oval_paper_tag','batch':'batch_folded_card','counter':'counter_wood'}
if args.with_hd: ids.update({'hd_legacy_1':'photo_torii','hd_legacy_2':'photo_blue_lake'})
for name,source_id in ids.items():images[name]=Image.open(HERE/source_by_id[source_id]['runtime']).convert('RGBA')
glyph_meta=json.loads((HERE/'glyphs/metrics.json').read_text())
for ch,g in glyph_meta['glyphs'].items():images['glyph_'+str(ord(ch))]=Image.open(HERE/'glyphs'/g['file']).convert('RGBA')
placed=None
for w,h in [(1024,1024),(1024,1280),(1280,1280)]:
 placed=pack(images,w,h)
 if placed is not None:break
assert placed is not None,'Cannot fit within approved 1280 square atlas maximum'
for a,ra in placed.items():
 for b,rb in placed.items():
  if a>=b:continue
  assert ra[0]+ra[2]<=rb[0] or rb[0]+rb[2]<=ra[0] or ra[1]+ra[3]<=rb[1] or rb[1]+rb[3]<=ra[1],(a,b)
atlas=Image.new('RGBA',(w,h),(0,0,0,0))
for name,im in images.items():atlas.paste(im,placed[name][:2])
version=3 if args.with_hd else 2
filename=f'photo_wall_material_atlas_v{version}.png'
out=ROOT/'games/travel_woodfish/project/photo/assets'/filename;atlas.save(out)
layout={'revision':version,'atlas_size':[w,h],'atlas_file':filename,'linear_gutter_pixels':2,'ui_text_rects':{name:source_by_id[source_id]['text_safe_rect_xywh'] for name,source_id in ids.items() if name not in ['hd_legacy_1','hd_legacy_2']}}
layout.update({name:list(rect) for name,rect in placed.items() if not name.startswith('glyph_')})
layout['glyph_metrics']={k:v for k,v in glyph_meta.items() if k!='glyphs'}
layout['glyph_metrics']['glyphs']={ch:{'region':list(placed['glyph_'+str(ord(ch))]),'advance':g['advance'],'offset':g['offset'],'source':g['source']} for ch,g in glyph_meta['glyphs'].items()}
(ROOT/'games/travel_woodfish/project/photo/assets/atlas_regions.json').write_text(json.dumps(layout,ensure_ascii=False,indent=2)+'\n')
report={'revision':version,'atlas':str(out.relative_to(ROOT)),'size':[w,h],'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'rgba8_bytes':w*h*4,'rgba8_sha256':hashlib.sha256(atlas.tobytes()).hexdigest(),'decoded_increase_vs_original_atlas':w*h*4-768*544*4,'max_increase':4882432,'no_added_png_entry':True,'layout':layout,'source_assets':{name:{'width':im.width,'height':im.height,'rgba8_sha256':hashlib.sha256(im.tobytes()).hexdigest()} for name,im in images.items()}}
assert report['decoded_increase_vs_original_atlas']<=report['max_increase']
(HERE/f'atlas_v{version}_provenance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['layout','source_assets']}))
