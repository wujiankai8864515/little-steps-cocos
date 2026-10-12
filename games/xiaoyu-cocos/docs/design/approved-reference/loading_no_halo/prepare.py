from pathlib import Path
from PIL import Image
import json,hashlib,re,base64,io
root=Path(__file__).resolve().parents[2]
base=Path(__file__).parent
source=base/'generated_no_halo.png'
out=root/'games/travel_woodfish/project/entry/assets/backgrounds/loading_clean_bleed_720x1600.png'
im=Image.open(source).convert('RGB').resize((720,1600),Image.Resampling.LANCZOS)
im.save(out,optimize=True)
buf=io.BytesIO();im.resize((216,480),Image.Resampling.LANCZOS).save(buf,format='WEBP',quality=86,method=6)
host=root/'build/web_host_seed/index.html';s=host.read_text();s,n=re.subn(r'(--loading-bg:url\("data:image/webp;base64,)[^\"]+("\))',lambda m:m[1]+base64.b64encode(buf.getvalue()).decode()+m[2],s);assert n==1;host.write_text(s)
(base/'provenance.json').write_text(json.dumps({'source':'builtin imagegen reference edit; viewed original and output','scope':'Remove only painted large circular halo/arc; separate actors/progress unchanged','source_dimensions':[841,1870],'runtime_dimensions':[720,1600],'host_dimensions':[216,480],'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'runtime_sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'host_webp_sha256':hashlib.sha256(buf.getvalue()).hexdigest(),'host_webp_bytes':len(buf.getvalue())},ensure_ascii=False,indent=2)+'\n')
