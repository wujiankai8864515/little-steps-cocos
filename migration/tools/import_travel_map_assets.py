#!/usr/bin/env python3
"""Export original hinted font metrics and lossless bounded native scene audio."""
from pathlib import Path
import json,hashlib,uuid,wave,subprocess
R=Path(__file__).resolve().parents[2];A=R/'games/xiaoyu-cocos/assets';stage=R/'migration/work/travel-map-font-v1';stage.mkdir(exist_ok=True)
(stage/'project.godot').write_text('config_version=5\n[application]\nconfig/name="Travel font metric export"\n')
script='''extends SceneTree
func _initialize():
    var args=OS.get_cmdline_user_args()
    var font=FontFile.new()
    assert(font.load_dynamic_font(args[0])==OK)
    var brush=FontFile.new()
    assert(brush.load_dynamic_font(args[1])==OK)
    var result={"brushCharacters":brush.get_supported_chars(),"ui":{}}
    var chars="当前站：选择暂停已经到家旅途中 · 0123456789/出发小院归途山溪竹林晚风树林老桥驿站花田石径茶摊柳岸旅程城郊渡口河畔"
    chars+=args[3]
    var server=TextServerManager.get_primary_interface()
    for size in [19,21,24]:
        var table={"height":font.get_height(size),"ascent":font.get_ascent(size),"glyphs":{}}
        for character in chars:
            font.get_string_size(character,HORIZONTAL_ALIGNMENT_LEFT,-1,size)
            for rid in font.get_rids():
                var index=server.font_get_glyph_index(rid,size,character.unicode_at(0),0)
                if index==0:continue
                var extent=server.font_get_glyph_size(rid,Vector2i(size,0),index)
                var offset=server.font_get_glyph_offset(rid,Vector2i(size,0),index)
                if extent.y>0:table.glyphs[character]=[offset.y,offset.y+extent.y]
                break
        result.ui[str(size)]=table
    var f=FileAccess.open(args[2],FileAccess.WRITE);f.store_string(JSON.stringify(result));f.close()
    print("MAP_FONT_OK ",result.brushCharacters.length());quit()
'''
(stage/'export.gd').write_text(script)
config=json.loads((A/'game/TravelSceneData.ts').read_text().split('= ',1)[1].strip().rstrip(';'));chars=''.join(v['name'] for v in config['route']['nodes']+config['route']['landmarks'])
output=R/'migration/reviews/M07-map-font-native-v1.json';engine=R/'migration/work/godot-native-4.5.2/Godot.app/Contents/MacOS/Godot';ui=A/'bundles/home/travel/assets/travel_ui.ttf';brush=A/'bundles/travel_visual/travel/assets/travel_brush.ttf'
with (R/'migration/reviews/M07-map-font-native-v1.log').open('w') as f:
 result=subprocess.run([str(engine),'--headless','--path',str(stage),'--script','res://export.gd','--',str(ui),str(brush),str(output),chars],stdout=f,stderr=subprocess.STDOUT,timeout=45)
assert result.returncode==0,(R/'migration/reviews/M07-map-font-native-v1.log').read_text()
data=json.loads(output.read_text());(A/'game/TravelFontData.ts').write_text('// Native Godot 4.5.2 glyph coverage and hinted ink bounds. See M07-map-font-native-v1.json.\nexport const TRAVEL_FONT_DATA:any = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
ns=uuid.UUID('8ad618fb-ce44-4560-a235-ef5934b4225e');uid=lambda k:str(uuid.uuid5(ns,k))
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
catp=A/'resources/source-catalog.json';catalog=json.loads(catp.read_text());records=[]
for i,name in enumerate(['travel_bell','travel_encounter']):
 pcm=R/f'migration/reviews/M07-travel-scene-native-v2.json.{i}.pcm';target=A/f'bundles/travel_visual/travel/assets/{name}.wav'
 with wave.open(str(target),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(22050);w.writeframes(pcm.read_bytes())
 key=f'derived://travel/{name}.wav';size=len(pcm.read_bytes());catalog['assets'][key]={'kind':'audio','bundle':'travel_visual','path':f'travel/assets/{name}','decodedBytes':size*2,'sourcePCM':str(pcm.relative_to(R))}
 write(target.with_suffix('.wav.meta'),{'ver':'1.0.0','importer':'audio-clip','imported':True,'uuid':uid(key),'files':['.json','.wav'],'subMetas':{},'userData':{'downloadMode':0}})
 records.append({'resource':key,'source':str(pcm.relative_to(R)),'pcmSHA256':hashlib.sha256(pcm.read_bytes()).hexdigest(),'wavSHA256':hashlib.sha256(target.read_bytes()).hexdigest(),'frames':size//2,'reservationBytes':size*2})
catp.write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n')
for name in ['TravelFontData']:
 write(A/f'game/{name}.ts.meta',{'ver':'4.0.24','importer':'typescript','imported':True,'uuid':uid('game/'+name),'files':[],'subMetas':{},'userData':{}})
write(R/'migration/records/M07-map-derived-assets.json',{'source':'native Godot 4.5.2, original committed runtime/config/fonts','uiFontSHA256':hashlib.sha256(ui.read_bytes()).hexdigest(),'brushFontSHA256':hashlib.sha256(brush.read_bytes()).hexdigest(),'audio':records,'audioAdditionalPlaybackReservation':600000-sum(r['reservationBytes'] for r in records),'boundary':'lossless WAV wrapper around verified native PCM; playback and visual font alignment still need runtime verification'})
print(json.dumps({'glyphs':len(data['brushCharacters']),'audio':records},ensure_ascii=False))
