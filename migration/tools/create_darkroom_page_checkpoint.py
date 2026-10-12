#!/usr/bin/env python3
"""Declare neutral full Darkroom references; compiled native World/Rig unchanged."""
from legacy_source import legacy_reference
import argparse,hashlib,json,subprocess,sys,uuid
from pathlib import Path
from freeze_godot_plants import replace_entries
ROOT=Path(__file__).resolve().parents[2]
SOURCE=legacy_reference() / 'games/travel_woodfish/project'
def sha(value):return hashlib.sha256(value).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--name',required=True);p.add_argument('--engine',choices=['godot','cocos'],required=True);p.add_argument('--hour',type=float,default=12);p.add_argument('--inspect-strokes',action='store_true');p.add_argument('--flat-strokes',action='store_true');p.add_argument('--custom-strokes',action='store_true');a=p.parse_args()
    if a.flat_strokes and a.custom_strokes:raise ValueError('Select one Graphics diagnostic')
    if a.engine=='cocos' and (a.inspect_strokes or a.flat_strokes or a.custom_strokes) and 'addComponent(Graphics)' not in (ROOT/'games/xiaoyu-cocos/assets/game/DarkroomHUD.ts').read_text():
        p.error('Legacy Graphics diagnostics require the frozen M06.02 HUD; current HUD uses native mesh geometry')
    if not a.name or not all(c.isalnum() or c in '-_' for c in a.name):raise ValueError('Invalid checkpoint name')
    if a.engine=='cocos':
        subprocess.run([sys.executable,str(ROOT/'migration/tools/create_candidate.py'),'--name',a.name,'--route','home','--hour',str(a.hour),'--freeze-clock'],check=True)
        stage=ROOT/'migration/work'/a.name;path=stage/'games/xiaoyu-cocos/assets/game/DarkroomPage.ts';before=path.read_bytes();text=before.decode();point='this.plants.advance(delta)';assert text.count(point)==1;text=text.replace(point,'this.plants.advance(0)');path.write_text(text)
        record=ROOT/'migration/records/candidates'/f'{a.name}.json';r=json.loads(record.read_text());r['overrides'].append({'file':'assets/game/DarkroomPage.ts','sourceSHA256':sha(before),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Freeze Darkroom plant phase at neutral; actual Home offer, real pointer and all original game draw code remain active'})
        r['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f.read_bytes()),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()];r['snapshotSHA256']=sha(json.dumps(r['files'],sort_keys=True).encode())
        if a.inspect_strokes:
            path=stage/'games/xiaoyu-cocos/assets/game/DarkroomHUD.ts';before=path.read_bytes();text=before.decode().replace("import { Color, Graphics, Node }", "import { Color, Graphics, Node, director, Director }")
            point='this.advance();';assert text.count(point)==1
            text=text.replace(point,point+'''const inspect=()=>{if(!this.root.activeInHierarchy)return;director.off(Director.EVENT_AFTER_DRAW,inspect);console.info('[LittleSteps QA] Graphics geometry '+JSON.stringify(this.root.children.map(n=>{const g=n.getComponent(Graphics) as any;if(!g)return {name:n.name};return {name:n.name,width:g.lineWidth,color:g.strokeColor,data:g.impl.getRenderDataList().map(d=>({vertices:d.vertexStart,indices:d.indexStart,finite:Array.from(d.vData.slice(0,d.vertexStart*8)).every(Number.isFinite),sample:Array.from(d.vData.slice(0,48)),indexSample:Array.from(d.iData.slice(0,18))}))};})));};director.on(Director.EVENT_AFTER_DRAW,inspect);''');path.write_text(text)
            r['overrides'].append({'file':'assets/game/DarkroomHUD.ts','sourceSHA256':sha(before),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Public one-time Creator Graphics CPU geometry diagnostic after actual visible draw; does not change authored drawing or input'})
            r['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f.read_bytes()),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()];r['snapshotSHA256']=sha(json.dumps(r['files'],sort_keys=True).encode())
        if a.flat_strokes or a.custom_strokes:
            path=stage/'games/xiaoyu-cocos/assets/game/DarkroomLighting.ts';before=path.read_bytes();text=before.decode().replace("DARKROOM_EFFECTS=['darkroom-doll'","DARKROOM_EFFECTS=['qa-graphics-flat','darkroom-doll'");assert text!=before.decode();path.write_text(text);r['overrides'].append({'file':str(path.relative_to(stage/'games/xiaoyu-cocos')),'sourceSHA256':sha(before),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Reserve diagnostic Graphics effect in the existing resource gate'})
            path=stage/'games/xiaoyu-cocos/assets/game/DarkroomHUD.ts';before=path.read_bytes();text=before.decode().replace('import { Color, Graphics, Node','import { Material, Color, Graphics, Node');point='this.advance();';assert text.count(point)==1;text=text.replace(point,"const flat=new Material();flat.initialize({effectAsset:assets.effect('qa-graphics-flat')});this.root.children.forEach(n=>{const g=n.getComponent(Graphics);if(g)g.customMaterial=flat;});"+point);path.write_text(text);r['overrides'].append({'file':str(path.relative_to(stage/'games/xiaoyu-cocos')),'sourceSHA256':sha(before),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Diagnostic only: keep geometry/colors/input, disable builtin Graphics antialias alpha to isolate missing strokes; only actual Graphics components receive this material; not a fidelity candidate'})
            engine=Path('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/editor/assets/effects/internal/builtin-graphics.effect');before=engine.read_bytes();text=before.decode();assert text.count('o *= alpha;')==1;text=text.replace('o *= alpha;','o *= 1.0;');path=stage/'games/xiaoyu-cocos/assets/resources/effects/qa-graphics-flat.effect';path.write_text(text);meta={'ver':'1.7.1','importer':'effect','imported':True,'uuid':str(uuid.uuid5(uuid.NAMESPACE_URL,'little-steps-qa/graphics-flat')),'files':['.json'],'subMetas':{},'userData':{}};path.with_suffix('.effect.meta').write_text(json.dumps(meta,indent=2)+'\n');r['overrides'].append({'file':str(path.relative_to(stage/'games/xiaoyu-cocos')),'engineSourceSHA256':sha(before),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Creator 3.8.8 builtin Graphics shader, only alpha multiplication disabled for a declared diagnostic'})
            if a.custom_strokes:
                for path in [stage/'games/xiaoyu-cocos/assets/game/DarkroomLighting.ts',stage/'games/xiaoyu-cocos/assets/game/DarkroomHUD.ts']:
                    path.write_text(path.read_text().replace('qa-graphics-flat','qa-graphics-control'))
                    for override in r['overrides']:
                        if override['file']==str(path.relative_to(stage/'games/xiaoyu-cocos')):override['fixtureSHA256']=sha(path.read_bytes());override['purpose']='Diagnostic control only: original untouched Creator Graphics shader consumed as a custom Material; keeps antialias alpha and all drawing/input'
                flat=stage/'games/xiaoyu-cocos/assets/resources/effects/qa-graphics-flat.effect';control=flat.with_name('qa-graphics-control.effect');flat.rename(control);control.write_bytes(engine.read_bytes());flat.with_suffix('.effect.meta').rename(control.with_suffix('.effect.meta'));meta['uuid']=str(uuid.uuid5(uuid.NAMESPACE_URL,'little-steps-qa/graphics-control'));control.with_suffix('.effect.meta').write_text(json.dumps(meta,indent=2)+'\n');r['overrides'][-1].update(file=str(control.relative_to(stage/'games/xiaoyu-cocos')),fixtureSHA256=sha(control.read_bytes()),purpose='Diagnostic control: original Creator 3.8.8 builtin Graphics effect bytes unchanged; isolate custom-material path from alpha override')
            r['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f.read_bytes()),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()];r['snapshotSHA256']=sha(json.dumps(r['files'],sort_keys=True).encode())
    else:
        subprocess.run([sys.executable,str(ROOT/'migration/tools/freeze_godot_plants.py'),'--name',a.name,'--from-reference','godot-reference-noon-v1','--hour',str(a.hour)],check=True)
        stage=ROOT/'migration/work'/a.name;web=stage/'web';pack=web/'index.pck';before=pack.read_bytes();page=(SOURCE/'darkroom/darkroom_page.gd').read_text()+'''
var _review_full_started := false
func _process(_delta: float) -> void:
    if input_enabled and not _review_full_started:
        _review_full_started = true
        world.set_process(false)
        world.restart_session()
        world.shared_clock.seek_hour(_review_full_hour)
        world.sync_clock(0.0)
        var plants: Node2D = world.get_node("IndependentRoomPlants")
        plants.reset_motion()
        plants.set_process(false)
        plants.advance(0.0)
        print("[LittleSteps QA] native full Darkroom ",JSON.stringify(debug_snapshot(),"",true,true))
        print("[LittleSteps QA] native root stretch ",JSON.stringify({"final_scale":get_tree().root.get_final_transform().get_scale(),"window_size":get_tree().root.size,"content_scale_size":get_tree().root.content_scale_size,"content_scale_factor":get_tree().root.content_scale_factor},"",true,true))
'''
        page=page.replace('var _review_full_started := false','var _review_full_hour := '+str(a.hour)+'\nvar _review_full_started := false')
        replacements={'darkroom/darkroom_page.gd.remap':b'[remap]\n\npath="res://qa/darkroom_page.gd"\n','qa/darkroom_page.gd':page.encode()}
        after,count,newcount=replace_entries(before,replacements);pack.write_bytes(after);overrides=[]
        for filename in ['resource_packs.host.json','index.html']:
            path=web/filename;raw=path.read_bytes()
            if filename.endswith('.json'):
                data=json.loads(raw);assert data['packs']['core']['sha256']==sha(before);data['packs']['core'].update(bytes=len(after),sha256=sha(after));path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
            else:
                point='"index.pck":'+str(len(before));text=raw.decode();assert text.count(point)==1;path.write_text(text.replace(point,'"index.pck":'+str(len(after))))
            overrides.append({'path':filename,'beforeFixtureSHA256':sha(raw),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Preserve actual QA PCK byte count and integrity hash'})
        overrides.append({'path':'index.pck','beforeFixtureSHA256':sha(before),'fixtureSHA256':sha(after),'beforeEntries':count,'fixtureEntries':newcount,'purpose':'Page-only source overlay; after real entry stop native World processing at reset pose and freeze plant wind; original compiled World, Rig and shaders unchanged','replacements':[{'path':k,'sha256':sha(v)} for k,v in replacements.items()]})
        record=ROOT/'migration/records/candidates'/f'{a.name}.json';r=json.loads(record.read_text());r['overrides'].extend(overrides);r['fixtureFiles']=[{'path':str(f.relative_to(web)),'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in sorted(web.rglob('*')) if f.is_file()]
    r['darkroomPageCheckpoint']={'hour':a.hour,'plants':'neutral phase','doll':'neutral until actual pointer input; Godot World processing frozen for initial still only','actualEntry':'pending','screenshot':'pending','wechat':'pending'};record.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'record':str(record),'stage':str(stage)}))
if __name__=='__main__':main()
