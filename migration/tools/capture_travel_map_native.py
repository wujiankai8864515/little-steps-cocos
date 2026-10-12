#!/usr/bin/env python3
"""Capture unmodified Godot map page with deterministic native service and clock."""
from legacy_source import legacy_reference
from pathlib import Path
import re,json,hashlib,subprocess,shutil,argparse
ROOT=Path(__file__).resolve().parents[2];SOURCE=legacy_reference() / 'games/travel_woodfish/project'
SCRIPT='''extends SceneTree
const Page=preload("res://travel/travel_page.gd")
const Service=preload("res://travel/travel_service.gd")
class Clock:
    extends RefCounted
    var application_active=true
    func game_hour():return 12.0
var at=1000.0
func freeze(node):
    node.set_process(false)
    for child in node.get_children():freeze(child)
func align_labels(node):
    if node.has_method("align_ink"):node.align_ink()
    for child in node.get_children():align_labels(child)
func _initialize():call_deferred("capture")
func capture():
    var args=OS.get_cmdline_user_args()
    root.size=Vector2i(96,96);root.title="Little Steps native map QA"
    var viewport=SubViewport.new();viewport.size=Vector2i(720,1280);viewport.disable_3d=true;viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS;root.add_child(viewport)
    var background=ColorRect.new();background.size=Vector2(720,1280);background.color=Color("ecd9b3");viewport.add_child(background)
    var service=Service.new()
    service.wall_clock=func():return at
    service.configure("qa_map_native",true)
    var departed=service.depart(700,.3,1)
    if not departed:print("NATIVE_MAP_DEPART_FAILED ",service.last_error);quit(1);return
    at=1040;service.reconcile()
    var page=Page.new();viewport.add_child(page);page.configure(service,null);page.set_viewport_size(Vector2(720,1280));page.bind_scene_context(Clock.new(),null);page.open("comic");freeze(page)
    var scene=page.scene_runtime
    while scene.age<12.0-0.00000001:scene.advance(minf(1.0/60.0,12.0-scene.age))
    page.elapsed=12.0;page._enter_cell(str(service.model.trip().events[0].uid));page._process(0.0);freeze(page)
    var bubble=page.controls.event_panel;bubble.advance_animation(.25);bubble.advance_animation(.2);align_labels(page)
    await RenderingServer.frame_post_draw
    await RenderingServer.frame_post_draw
    var image=viewport.get_texture().get_image();var saved=image.save_png(args[0])
    if saved!=OK:print("NATIVE_MAP_SAVE_FAILED ",saved);quit(1);return
    var record={"engine":Engine.get_version_info().string,"hour":12,"pageElapsed":page.elapsed,"sceneAge":scene.age,"route":service.route_snapshot(),"bubble":bubble.snapshot(),"size":[720,1280]}
    var f=FileAccess.open(args[0]+".json",FileAccess.WRITE);f.store_string(JSON.stringify(record));f.close();print("NATIVE_MAP_OK ",JSON.stringify(record));page._release_scene();quit()
'''
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--name',required=True);a=p.parse_args();assert all(c.isalnum() or c in '-_' for c in a.name)
 stage=ROOT/'migration/work'/a.name;assert not stage.exists();stage.mkdir(parents=True);done=set();records=[]
 def copy(name):
  if name in done:return
  done.add(name);source=(legacy_reference() / 'framework'/name) if name.startswith('addons/travel_core/') else SOURCE/name;assert source.is_file(),name;target=stage/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target);records.append({'path':name,'sha256':sha(target)})
  if source.suffix=='.gd':
   text=source.read_text()
   for path in re.findall(r'(?:preload|load)\s*\(\s*[\"\']([^\"\']+\.gd)[\"\']',text)+re.findall(r'extends\s+[\"\']([^\"\']+\.gd)[\"\']',text):
    copy(path[6:] if path.startswith('res://') else str(Path(name).parent/path))
  settings=Path(str(source)+'.import')
  if settings.is_file():shutil.copy2(settings,str(target)+'.import');records.append({'path':name+'.import','sha256':sha(settings)})
 for name in ['travel/travel_page.gd','travel/travel_service.gd','travel/travel_content.json','home/feedback/assets/returned_bag_diamond.png','shared_room_lighting/soft_atmosphere.gd']:
  copy(name)
 for name in ['travel_map_plate_v5.png','travel_scene_layers_v1.png','travel_footprint_ink_v1.png','travel_offer_person_v5.png','travel_people_v5.png','travel_map_actor_v5.png','travel_paper_v1.png','travel_ui.ttf','travel_brush.ttf']:copy('travel/assets/'+name)
 (stage/'capture.gd').write_text(SCRIPT);(stage/'project.godot').write_text('config_version=5\n[application]\nconfig/name="Native Travel map QA"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n')
 engine=ROOT/'migration/work/godot-native-4.5.2/Godot.app/Contents/MacOS/Godot';out=ROOT/'migration/qa'/(a.name+'.png');report={'schema':1,'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=SOURCE,text=True).strip(),'files':records,'scope':'Full native map manual offer, hour12 sceneAge12 pageElapsed12 route.4 seed1; no source override','status':'pending'}
 for phase,cmd in [('import',[str(engine),'--headless','--editor','--path',str(stage),'--import','--quit']),('capture',[str(engine),'--path',str(stage),'--rendering-method','gl_compatibility','--script','res://capture.gd','--',str(out)])]:
  log=ROOT/'migration/reviews'/f'M07-{a.name}-{phase}.log'
  with log.open('w') as f:result=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,timeout=60)
  report[phase]={'exit':result.returncode,'log':str(log.relative_to(ROOT))};assert result.returncode==0,log
 assert out.exists();report['status']='captured_not_visual_acceptance';report['imageSHA256']=sha(out);(ROOT/'migration/records/candidates'/(a.name+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(str(out))
if __name__=='__main__':main()
