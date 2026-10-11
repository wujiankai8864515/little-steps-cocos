#!/usr/bin/env python3
"""Transfer native hinted sign glyphs and shaped runs; never rasterize with PIL."""
from pathlib import Path
import hashlib,json,subprocess,uuid
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
ASSETS=ROOT/'games/xiaoyu-cocos/assets'
SCRIPT=r'''extends SceneTree
func _initialize():
    var args=OS.get_cmdline_user_args()
    var input=JSON.parse_string(FileAccess.get_file_as_string(args[0]))
    var font=FontFile.new()
    assert(font.load_dynamic_font(input.font)==OK)
    font.allow_system_fallback=false
    var server=TextServerManager.get_primary_interface()
    var result={"sizes":{},"engine":Engine.get_version_info().string}
    for point_text in input.strings:
        var point=int(point_text)
        var table={"runs":{},"glyphs":{},"height":font.get_height(point),"ascent":font.get_ascent(point)}
        var ids={}
        for value in input.strings[point_text]:
            var line=TextLine.new()
            line.add_string(value,font,point)
            var run={"width":line.get_size().x,"glyphs":[],"ink":[100000.0,-100000.0]}
            var x=0.0
            for glyph in server.shaped_text_get_glyphs(line.get_rid()):
                if glyph.index==0:
                    if not (glyph.flags & TextServer.GRAPHEME_IS_VIRTUAL) and not value.substr(glyph.start,glyph.end-glyph.start).strip_edges().is_empty():
                        print("UNSUPPORTED ",value," ",glyph);quit(1);return
                    x+=glyph.advance*glyph.repeat
                    continue
                ids[glyph.index]=true
                for repeat in glyph.repeat:
                    run.glyphs.append([glyph.index,x+glyph.offset.x,glyph.offset.y])
                    x+=glyph.advance
                var offset=font.get_glyph_offset(0,Vector2i(point,0),glyph.index)
                var extent=font.get_glyph_size(0,Vector2i(point,0),glyph.index)
                if extent.y>0:
                    run.ink[0]=minf(run.ink[0],offset.y)
                    run.ink[1]=maxf(run.ink[1],offset.y+extent.y)
            table.runs[value]=run
        for density in [1,2]:
            var pixels=point*density
            var si=Vector2i(pixels,0)
            var density_glyphs={}
            for id in ids:
                font.render_glyph(0,si,id)
                var variants=[]
                var list=font.get_glyph_list(0,si)
                for shift in 4:
                    var shifted=int(id)|(shift<<27)
                    if not list.has(shifted):continue
                    var texture=font.get_glyph_texture_idx(0,si,shifted)
                    var uv=font.get_glyph_uv_rect(0,si,shifted)
                    var offset=font.get_glyph_offset(0,si,shifted)
                    var extent=font.get_glyph_size(0,si,shifted)
                    if texture>=0:
                        var image=font.get_texture_image(0,si,texture)
                        assert(image.save_png(args[1]+"/raw-%d-%d.png"%[pixels,texture])==OK)
                    variants.append({"texture":"raw-%d-%d.png"%[pixels,texture],"rect":[uv.position.x,uv.position.y,uv.size.x,uv.size.y],"offset":[offset.x/density,offset.y/density],"size":[extent.x/density,extent.y/density]})
                assert(variants.size() in [1,2,4])
                density_glyphs[str(id)]=variants
            table.glyphs[str(density)]=density_glyphs
        result.sizes[point_text]=table
    var output=FileAccess.open(args[1]+"/native.json",FileAccess.WRITE)
    output.store_string(JSON.stringify(result));output.close()
    print("SIGN_FONT_OK");quit()
'''
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,data):p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def main():
    stage=ROOT/'builds/work/travel-sign-fonts-v1';stage.mkdir(exist_ok=True)
    (stage/'project.godot').write_text('config_version=5\n[application]\nconfig/name="Travel sign font export"\n')
    (stage/'export.gd').write_text(SCRIPT)
    scene=ASSETS/'game/TravelSceneData.ts';data=json.loads(scene.read_text().split('= ',1)[1].strip().rstrip(';'))
    strings={'21':['当前站：'+n['name'] for n in data['route']['nodes']], '24':[state+' · '+str(i)+' / 10' for state in ['选择暂停','已经到家','旅途中'] for i in range(11)]}
    font=ASSETS/'bundles/home/travel/assets/travel_ui.ttf'
    write(stage/'input.json',{'font':str(font),'strings':strings})
    engine=ROOT/'builds/work/godot-native-4.5.2/Godot.app/Contents/MacOS/Godot'
    log=ROOT/'builds/reviews/M07-sign-font-export-v3.log'
    with log.open('w') as out:
        result=subprocess.run([str(engine),'--headless','--path',str(stage),'--log-file',str(stage/'native.log'),'--script','res://export.gd','--',str(stage/'input.json'),str(stage)],stdout=out,stderr=subprocess.STDOUT,timeout=45)
    assert result.returncode==0,log.read_text()
    data=json.loads((stage/'native.json').read_text());sources=[];atlases={};catalog_path=ASSETS/'resources/source-catalog.json';catalog=json.loads(catalog_path.read_text())
    template=json.loads((ASSETS/'bundles/travel_visual/travel/assets/travel_map_plate_v5.png.meta').read_text())
    for density in [1,2]:
        width=512*density;x=y=2;row=0;tiles=[]
        for size in sorted(data['sizes'],key=int):
            for index,variants in sorted(data['sizes'][size]['glyphs'][str(density)].items(),key=lambda v:int(v[0])):
                for variant in variants:
                    uv=variant.pop('rect');texture=variant.pop('texture');w,h=map(int,uv[2:]);record={'size':int(size),'density':density,'index':int(index),'shift':variants.index(variant)}
                    if not w or not h:variant['rect']=[0,0,0,0];continue
                    source=Image.open(stage/texture).convert('RGBA');tile=source.crop(tuple(map(int,[uv[0],uv[1],uv[0]+w,uv[1]+h])))
                    if x+w+2>width:x=2;y+=row+4;row=0
                    variant['rect']=[x,y,w,h];tiles.append((x,y,tile));x+=w+4;row=max(row,h)
                    record.update({'native':texture,'nativeRect':uv,'packedRect':variant['rect'],'rgbaSHA256':hashlib.sha256(tile.tobytes()).hexdigest()});sources.append(record)
        height=1<<(y+row+2-1).bit_length();atlas=Image.new('RGBA',(width,height),(255,255,255,0))
        for x,y,tile in tiles:atlas.paste(tile,(x,y))
        name=f'travel_sign_glyphs_{density}x';target=ASSETS/f'bundles/travel_visual/travel/assets/{name}.png';atlas.save(target,optimize=True)
        resource=f'derived://travel/{name}.png';key=str(uuid.uuid5(uuid.NAMESPACE_URL,'little-steps-cocos/'+resource));meta=json.loads(json.dumps(template));meta['uuid']=key;sub=meta['subMetas']['6c48a'];sub['uuid']=key+'@6c48a';sub['displayName']=name;sub['userData']['imageUuidOrDatabaseUri']=key;meta['userData']['redirect']=key+'@6c48a';write(target.with_suffix('.png.meta'),meta)
        catalog['assets'][resource]={'kind':'texture','bundle':'travel_visual','path':f'travel/assets/{name}/texture','size':[width,height],'content':[0,0,width,height],'decodedBytes':width*height*8,'provenance':'Original font native hinted glyph RGBA, decode plus upload reserved'}
        atlases[str(density)]={'resource':resource,'size':[width,height],'sha256':sha(target),'decodedBytes':width*height*8}
    # Every packed glyph is a byte-for-byte crop, including transparent pixels.
    for rec in sources:
        atlas=Image.open(ASSETS/f"bundles/travel_visual/travel/assets/travel_sign_glyphs_{rec['density']}x.png").convert('RGBA');x,y,w,h=rec['packedRect'];assert hashlib.sha256(atlas.crop((x,y,x+w,y+h)).tobytes()).hexdigest()==rec['rgbaSHA256']
    data['atlases']=atlases
    (ASSETS/'game/TravelSignFontData.ts').write_text('// Generated native shaped sign runs and original hinted glyphs. See M07-sign-font-source.json.\nexport const TRAVEL_SIGN_FONTS:any = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
    write(ASSETS/'game/TravelSignFontData.ts.meta',{'ver':'4.0.24','importer':'typescript','imported':True,'uuid':str(uuid.uuid5(uuid.NAMESPACE_URL,'little-steps-cocos/TravelSignFontData')),'files':[],'subMetas':{},'userData':{}})
    catalog_path.write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n')
    write(ROOT/'builds/records/M07-sign-font-source.json',{'schema':1,'engine':data['engine'],'fontSHA256':sha(font),'sceneDataSHA256':sha(scene),'sourceGodotCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT.parent/'little-steps',text=True).strip(),'shapedRuns':{s:len(t['runs']) for s,t in data['sizes'].items()},'atlases':atlases,'glyphCrops':sources,'method':'Native FontFile/TextLine/FreeType hinted glyph crops and shaped advances; no new rasterization, resampling or hand-tuned kerning. Original label integer center and ink-center baseline. Density 2 reuses logical shaping with native double-size glyphs.','boundary':'Only dynamic current-station and progress signs. Browser, other densities and WeChat device require separate validation.'})
    print(json.dumps({'runs':sum(len(t['runs']) for t in data['sizes'].values()),'crops':len(sources),'atlases':atlases},ensure_ascii=False))
if __name__=='__main__':main()
