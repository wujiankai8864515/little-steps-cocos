from pathlib import Path
from PIL import Image
import hashlib,json
base=Path(__file__).parent;root=base.parents[1]
original=Image.open(base/'merit_digits_original.png').convert('RGBA')
# Existing number/title atlas pixels and every original UV stay byte exact.
atlas=Image.new('RGBA',(original.width,945),(0,0,0,0));atlas.paste(original,(0,0))
regions={}
for key,name,width,x in [('incense','home_incense_03.png',450,8),('diary','home_diary_03.png',660,480)]:
 im=Image.open(base/name).convert('RGBA');box=im.getchannel('A').getbbox();crop=im.crop(box);height=round(width*crop.height/crop.width)
 reduced=crop.resize((width,height),Image.Resampling.LANCZOS)
 assert height<=144
 atlas.paste(reduced,(x,797))
 regions[key]={'region':[x,797,width,height],'source_sha256':hashlib.sha256((base/name).read_bytes()).hexdigest(),'source_crop':list(box),'display_width':118 if key=='incense' else 210,'native_sampling_ratio':width/118 if key=='incense' else width/210}
assert atlas.crop((0,0,original.width,original.height)).tobytes()==original.tobytes()
out=root/'games/travel_woodfish/project/home/feedback/assets/merit_digits_thin_gold.png';atlas.save(out,optimize=True)
(base/'atlas_provenance.json').write_text(json.dumps({'selected_candidate':'03','only_two_home_prompts':True,'pixel_edit':'deterministic atlas packing and Lanczos downsampling only, no letter redraw','original_digit_base_size':list(original.size),'original_digit_base_rgba_sha256':hashlib.sha256(original.tobytes()).hexdigest(),'atlas_size':list(atlas.size),'regions':regions,'runtime_sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'runtime_bytes':out.stat().st_size,'gate_entry_increase':0,'declared_rgba_increase':original.width*(945-original.height)*4},ensure_ascii=False,indent=2)+'\n')
