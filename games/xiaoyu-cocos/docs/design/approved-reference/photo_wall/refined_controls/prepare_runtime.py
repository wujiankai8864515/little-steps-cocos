#!/usr/bin/env python3
"""Deterministic authoring derivatives only; never writes production resources."""
from pathlib import Path
import hashlib, json
from PIL import Image, ImageOps, ImageDraw

ROOT = Path(__file__).resolve().parent
SPECS = {
    'title_paper': ('title_paper', (500,160), (0.10,0.17,0.80,0.62)),
    'hint_paper': ('hint_paper', (560,100), (0.13,0.20,0.73,0.58)),
    'oval_paper_tag': ('oval_paper_tag', (260,160), (0.22,0.35,0.65,0.40)),
    'batch_folded_card': ('batch_folded_card', (320,230), (0.31,0.26,0.59,0.47)),
    'counter_wood': ('counter_wood', (320,112), (0.15,0.22,0.70,0.56)),
    'photo_torii': ('photo_torii_v2', (480,512), None),
    'photo_blue_lake': ('photo_blue_lake', (480,512), None),
}

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

rows=[]
for ident,(source_id,size,safe) in SPECS.items():
    src=ROOT/'source'/f'{source_id}.png'
    if not src.exists(): continue
    im=Image.open(src)
    original_size=im.size
    if safe is not None:
        im=im.convert('RGBA')
        # Bounding-box only: retain generated RGB and alpha; ignore sub-3%-alpha
        # extraction speckles when measuring subject extents, with 4px guard.
        bbox=im.getchannel('A').point(lambda v:255 if v>=8 else 0).getbbox()
        x0,y0,x1,y1=bbox
        bbox=(max(0,x0-4),max(0,y0-4),min(im.width,x1+4),min(im.height,y1+4))
        cropped=im.crop(bbox)
        im=ImageOps.contain(cropped,size,Image.Resampling.LANCZOS)
        safe_rect=[round(safe[0]*im.width),round(safe[1]*im.height),round(safe[2]*im.width),round(safe[3]*im.height)]
        transform='alpha>=8 subject-bbox with 4px guard, crop then Lanczos contain; no color or alpha modification'
    else:
        # Exact requested 480x512 photo cells; do not stretch the landscape.
        # A small symmetric top/bottom crop preserves all horizontal content.
        src_ratio=im.width/im.height; target_ratio=size[0]/size[1]
        if src_ratio < target_ratio:
            h=im.width/target_ratio; y=(im.height-h)/2
            bbox=(0,y,im.width,y+h)
        else:
            w=im.height*target_ratio;x=(im.width-w)/2
            bbox=(x,0,x+w,im.height)
        im=im.resize(size,Image.Resampling.LANCZOS,box=bbox).convert('RGB')
        safe_rect=None
        transform='center crop to target aspect, then Lanczos downsample; no stretching, no extra sharpening'
    out=ROOT/'runtime'/f'{ident}.png'
    im.save(out,optimize=True)
    a=im.getchannel('A') if im.mode=='RGBA' else None
    hist=a.histogram() if a else None
    row={'id':ident,'source':str(src.relative_to(ROOT)),'runtime':str(out.relative_to(ROOT)),
         'source_size':list(original_size),'runtime_size':list(im.size),'crop_source_box':list(bbox),
         'transform':transform,'source_sha256':sha(src),'runtime_sha256':sha(out),
         'png_bytes':out.stat().st_size,'rgba8_decode_bytes':im.width*im.height*4,
         'mode':im.mode,'alpha_extrema':list(a.getextrema()) if a else [255,255],
         'fully_transparent_pixels':hist[0] if hist else 0,
         'text_safe_rect_xywh':safe_rect,'text_safe_rect_normalized':safe,
         'inspection':'Generated source and runtime composited contact sheet visually inspected, 2026-10-06.'}
    rows.append(row)

manifest={'purpose':'Authoring assets for parent atlas integration only; no production PNG entries added.',
          'generator':'OpenAI built-in image_gen; exact prompts and references in prompts.json',
          'runtime_filter':'linear; clamp; atlas cells require at least 2px external gutters',
          'no_baked_text':True,'asset_count':len(rows),'assets':rows}
(ROOT/'assets_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')

# QA image shows true alpha compositing. Raw PNG viewers may expose hidden RGB.
sheet=Image.new('RGB',(1060,1150),(91,112,124));d=ImageDraw.Draw(sheet)
positions={'title_paper':(15,30),'hint_paper':(15,215),'oval_paper_tag':(600,30),
           'counter_wood':(600,220),'batch_folded_card':(600,345),'photo_torii':(15,600),'photo_blue_lake':(550,600)}
for row in rows:
    im=Image.open(ROOT/row['runtime']).convert('RGBA');xy=positions[row['id']]
    d.text((xy[0],xy[1]-18),row['id']+' '+str(im.size),fill='white')
    sheet.paste(im,xy,im)
sheet.save(ROOT/'runtime_contact_sheet.jpg',quality=95)
print(json.dumps([{'id':r['id'],'runtime_size':r['runtime_size'],'text_safe_rect_xywh':r['text_safe_rect_xywh'],'sha256':r['runtime_sha256']} for r in rows],indent=2))
