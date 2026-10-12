"""Downsample the generated transparent footprint; never ship the master."""
from pathlib import Path
from PIL import Image
import hashlib, json
here=Path(__file__).resolve().parent
root=here.parents[1]
source=here/'generated_master.png'
im=Image.open(source).convert('RGBA')
# Ignore alpha <=8 only to identify the meaningful crop. Preserve every alpha
# value inside its padded bounds; do not repaint/recolor the generated artwork.
bounds=im.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()
bounds=(bounds[0]-8,bounds[1]-8,bounds[2]+8,bounds[3]+8)
art=im.crop(bounds)
art.thumbnail((80,116),Image.Resampling.LANCZOS)
canvas=Image.new('RGBA',(96,128),(0,0,0,0))
canvas.alpha_composite(art,((96-art.width)//2,(128-art.height)//2))
dest=root/'games/travel_woodfish/project/travel/assets/travel_footprint_ink_v1.png'
canvas.save(dest,optimize=True)
manifest={'origin':'OpenAI built-in image_gen, generated original sepia ink footprint, 2026-10-07','master_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'master_size':list(im.size),'crop':bounds,'output':str(dest.relative_to(root)),'output_sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'source_size':[96,128],'runtime_display_box':[17,29],'alpha':'preserved transparent art, no baked paper','rgba_bytes':96*128*4,'mipmaps':False,'admission_estimate_bytes':96*128*4+65536,'pack':'travel (requires integrator declaration)','validation':'Viewed original pixels and small-size preview; official importer/pixel audit and actual pack verification pending integrator'}
(here/'provenance.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
