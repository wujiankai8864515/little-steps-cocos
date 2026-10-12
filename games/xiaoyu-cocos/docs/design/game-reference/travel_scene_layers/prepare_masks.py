from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parent
polys={
 'leaf_foreground_high': [[164,767],[178,774],[191,781],[202,785],[207,786],[208,792],[205,798],[204,806],[199,808],[196,813],[190,814],[184,817],[177,817],[173,801],[169,801],[166,816],[160,817],[155,814],[149,812],[142,808],[139,804],[133,805],[130,801],[131,796],[141,787],[149,781],[157,773],[158,765]],
 'leaf_foreground_low': [[219,871],[225,878],[236,883],[247,883],[254,887],[254,892],[251,897],[252,903],[247,906],[242,907],[243,914],[235,915],[230,918],[222,918],[218,915],[216,904],[215,913],[208,915],[202,913],[196,913],[191,908],[188,906],[190,902],[185,899],[185,895],[189,891],[194,887],[204,884],[211,879],[213,873]],
 'leaf_foreground_middle': [[228,815],[235,820],[241,825],[248,829],[250,834],[249,839],[249,844],[243,849],[240,854],[233,856],[229,860],[222,859],[220,843],[216,842],[215,856],[209,857],[203,852],[196,849],[194,844],[191,844],[191,839],[197,834],[207,829],[217,821],[223,816]],
}
(ROOT/'leaf_polygons.json').write_text(json.dumps(polys,ensure_ascii=False,indent=2)+'\n')
im=Image.open(ROOT/'source/neutral_generated.png').convert('RGB')
mask=Image.new('L',im.size);d=ImageDraw.Draw(mask)
for pts in polys.values(): d.polygon([tuple(x) for x in pts],fill=255)
mask=mask.filter(ImageFilter.MaxFilter(9))
mask.save(ROOT/'source/leaf_removal_mask.png')
mark=Image.new('RGB',im.size,(255,0,255));Image.composite(mark,im,mask).save(ROOT/'source/leaf_removal_reference.png')
