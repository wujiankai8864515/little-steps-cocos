#!/usr/bin/env python3
"""Capture the unmodified Godot Travel runtime in a fixed native SubViewport.
This is a scene-only reference, not a full travel page or input acceptance.
"""
import argparse,hashlib,json,math,shutil,subprocess
from pathlib import Path
from verify_travel_scene_native import ROOT,SOURCE,FILES
SCRIPT='''extends SceneTree
const Config=preload("res://travel/travel_scene_config.gd")
const Runtime=preload("res://travel/travel_scene_runtime.gd")
class Clock:
    extends RefCounted
    var hour:=12.0
    var application_active:=true
    func game_hour()->float:return hour
func _initialize()->void:call_deferred("capture")
func capture()->void:
    var args:=OS.get_cmdline_user_args()
    root.size=Vector2i(96,96)
    root.title="Little Steps native scene QA"
    var viewport:=SubViewport.new();viewport.size=Vector2i(720,1280);viewport.disable_3d=true
    viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS
    root.add_child(viewport)
    var background:=ColorRect.new();background.size=Vector2(720,1280);background.color=Color("ecd9b3");viewport.add_child(background)
    var clock:=Clock.new();clock.hour=float(args[1])
    var scene=Runtime.new();viewport.add_child(scene);scene.configure(Config.DATA,clock,null);scene.set_process(false);scene.seed_route(float(args[4]));scene.update_route(float(args[3]),false)
    var age:=float(args[2])
    while scene.age<age-0.00000001:scene.advance(minf(1.0/60.0,age-scene.age))
    await RenderingServer.frame_post_draw
    await RenderingServer.frame_post_draw
    var pixels:=viewport.get_texture().get_image()
    assert(pixels.get_width()==720 and pixels.get_height()==1280)
    var saved:=pixels.save_png(args[0]);assert(saved==OK)
    var report={"scope":"unmodified runtime scene only","engine":Engine.get_version_info().string,"renderer":RenderingServer.get_current_rendering_method(),"hour":clock.hour,"age":scene.age,"progress":scene.route_progress,"fromProgress":float(args[4]),"size":[720,1280],"image":args[0]}
    var output:=FileAccess.open(args[0]+".json",FileAccess.WRITE);output.store_string(JSON.stringify(report));output.close()
    print("TRAVEL_NATIVE_IMAGE_OK "+JSON.stringify(report))
    scene.dispose();quit()
'''
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--name',required=True);p.add_argument('--hour',type=float,default=12);p.add_argument('--age',type=float,default=12);p.add_argument('--progress',type=float,default=.35);p.add_argument('--from-progress',type=float);a=p.parse_args();a.from_progress=a.progress if a.from_progress is None else a.from_progress
 assert all(c.isalnum() or c in '-_' for c in a.name)
 assert all(math.isfinite(v) for v in [a.hour,a.age,a.progress,a.from_progress]) and 0<=a.hour<24 and 0<=a.age<=120 and 0<=a.progress<=1 and 0<=a.from_progress<=1
 stage=ROOT/'builds/work'/a.name;assert not stage.exists(),'Use a fresh name to retain evidence';stage.mkdir(parents=True)
 originals=[]
 for name in FILES:
  source=SOURCE/name;target=stage/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target);originals.append({'path':name,'sha256':digest(target)})
 for name in FILES:
  settings=SOURCE/(name+'.import')
  if settings.is_file():
   target=stage/(name+'.import');shutil.copy2(settings,target);originals.append({'path':name+'.import','sha256':digest(target)})
 (stage/'project.godot').write_text('config_version=5\n[application]\nconfig/name="Little Steps native scene reference"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n')
 (stage/'capture.gd').write_text(SCRIPT)
 engine=ROOT/'builds/work/godot-native-4.5.2/Godot.app/Contents/MacOS/Godot';output=ROOT/'builds/qa'/f'{a.name}.png';assert not output.exists()
 import_log=ROOT/'builds/reviews'/f'M07-{a.name}-import.log';capture_log=ROOT/'builds/reviews'/f'M07-{a.name}-capture.log'
 with import_log.open('w') as log:result=subprocess.run([str(engine),'--headless','--editor','--path',str(stage),'--import','--quit'],stdout=log,stderr=subprocess.STDOUT)
 assert result.returncode==0,import_log
 command=[str(engine),'--path',str(stage),'--rendering-method','gl_compatibility','--script','res://capture.gd','--',str(output),str(a.hour),str(a.age),str(a.progress),str(a.from_progress)]
 with capture_log.open('w') as log:result=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
 record={'schema':1,'scope':'native scene reference; UI/navigation/audio/input not covered','command':command,'exitCode':result.returncode,'originalFiles':originals,'captureScriptSHA256':digest(stage/'capture.gd'),'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT.parent/'little-steps',text=True).strip(),'image':str(output.relative_to(ROOT)),'status':'failed'}
 if result.returncode==0 and output.exists():record.update({'status':'captured_pixels_not_visual_acceptance','imageSHA256':digest(output),'runtime':json.loads(output.with_suffix('.png.json').read_text())})
 (ROOT/'builds/records/candidates'/f'{a.name}.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print(json.dumps(record,ensure_ascii=False));assert record['status']!='failed',capture_log
if __name__=='__main__':main()
