"""Reproducible alpha-preserving runtime downsample. Master never ships."""
from pathlib import Path
from PIL import Image
import hashlib,json
here=Path(__file__).resolve().parent
root=here.parents[1]
source=here/'generated_master.png'
im=Image.open(source).convert('RGBA')
bounds=im.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()
bounds=(max(0,bounds[0]-8),max(0,bounds[1]-8),min(im.width,bounds[2]+8),min(im.height,bounds[3]+8))
art=im.crop(bounds);art.thumbnail((88,120),Image.Resampling.LANCZOS)
canvas=Image.new('RGBA',(96,128),(0,0,0,0));canvas.alpha_composite(art,((96-art.width)//2,(128-art.height)//2))
# Explicit replacement of the existing runtime identity avoids two resident prints.
dest=root/'games/travel_woodfish/project/travel/assets/travel_footprint_ink_v1.png'
canvas.save(dest,optimize=True)
manifest={'requirement':'W5','origin':'OpenAI built-in image_gen style-transfer of the inspected rejected footprint, 2026-10-07','master_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'master_size':list(im.size),'crop':bounds,'output':str(dest.relative_to(root)),'output_sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'source_size':[96,128],'runtime_display_box':[26,35],'dpr_1_2_3':'96x128 source exceeds 3x largest settled display and covers entrance scale up to 35.1x47.25 at DPR2; enlarged entrance DPR3 may mildly upscale','alpha':'generated genuine transparency, alpha-preserving crop/resize only','rgba_bytes':49152,'mipmaps':False,'admission_estimate_bytes':114688,'pack':'travel.pck; declared travel_visual group; same replaced resource identity','viewed':'Original old runtime, full generated master, and runtime small-scale preview were inspected','validation':'Candidate; official importer pixel/hash check and aggregate cold pack pending'}
(here/'provenance.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
