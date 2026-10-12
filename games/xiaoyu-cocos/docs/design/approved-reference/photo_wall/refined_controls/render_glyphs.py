#!/usr/bin/env python3
"""Rasterize licensed source-font single glyphs; never bake whole UI labels."""
from pathlib import Path
import json,hashlib
from PIL import Image,ImageDraw,ImageFont,features
import PIL
from fontTools.ttLib import TTFont
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent/'glyphs'
FONT_PIXELS=96
TEXT='照片墙拖动夹子，选给小屋换一批①②0123456789 /'
SOURCES={
 'brush':ROOT/'build/fonts/travel_brush/sources/MaShanZheng-Regular.ttf',
 'circle':ROOT/'build/fonts/sources/LXGWWenKai-Regular-v1.522.ttf',
}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
OUT.mkdir(exist_ok=True)
fonts={name:ImageFont.truetype(str(path),FONT_PIXELS) for name,path in SOURCES.items()}
cmaps={name:TTFont(str(path)).getBestCmap() for name,path in SOURCES.items()}
glyphs={}
for ch in sorted(set(TEXT)):
 name='circle' if ch in '①②' else 'brush'
 assert ord(ch) in cmaps[name],f'No allowed glyph for U+{ord(ch):04X}'
 font=fonts[name]
 x0,y0,x1,y1=font.getbbox(ch,anchor='ls');pad=2
 advance=font.getlength(ch)
 image=Image.new('RGBA',(max(1,x1-x0)+pad*2,max(1,y1-y0)+pad*2),(255,255,255,0))
 ImageDraw.Draw(image).text((pad-x0,pad-y0),ch,font=font,fill=(255,255,255,255),anchor='ls')
 path=OUT/f'{ord(ch):04X}.png';image.save(path)
 glyphs[ch]={'file':path.name,'source':name,'codepoint':ord(ch),'advance':advance,'offset':[x0-pad,y0-pad],'width':image.width,'height':image.height,'sha256':sha(path)}
meta={'font_pixels':FONT_PIXELS,'ascent':85,'descent':12,'line_height':100,'glyphs':glyphs,'sources':{k:{'path':str(p.relative_to(ROOT)),'sha256':sha(p)} for k,p in SOURCES.items()},'licenses':['build/fonts/licenses/MaShanZheng-OFL.txt','build/fonts/licenses/LXGWWenKai-OFL.txt'],'explicit_circle_source':True,'system_fallback':False,'full_phrase_bitmap':False,'pillow_version':PIL.__version__,'freetype_version':features.version_module('freetype2')}
(OUT/'metrics.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'glyphs':len(glyphs),'pixels':sum(g['width']*g['height'] for g in glyphs.values()),'sources':meta['sources']}))
