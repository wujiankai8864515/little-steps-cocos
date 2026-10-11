#!/usr/bin/env python3
"""Export deterministic data from the unmodified Godot travel scene, headless."""
import argparse, hashlib, json, shutil, subprocess, textwrap
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT.parent/'little-steps/games/travel_woodfish/project'
FILES=['travel/travel_scene_config.gd','travel/travel_scene_runtime.gd','travel/travel_atmosphere.gd','shared_room_lighting/soft_atmosphere.gd','travel/assets/travel_map_plate_v5.png','travel/assets/travel_scene_layers_v1.png','travel/assets/travel_footprint_ink_v1.png']
ORACLE=r'''extends SceneTree
const Config=preload("res://travel/travel_scene_config.gd")
const Runtime=preload("res://travel/travel_scene_runtime.gd")
const Flow=preload("res://encounter_flow.gd")
class Clock:
    extends RefCounted
    var hour:=12.0
    var application_active:=true
    func game_hour()->float:return hour
func packed(value):
    if value is Vector2:return [value.x,value.y]
    if value is Rect2:return [value.position.x,value.position.y,value.size.x,value.size.y]
    if value is Color:return [value.r,value.g,value.b,value.a]
    if value is Dictionary:
        var result:Dictionary={}
        for key in value:result[str(key)]=packed(value[key])
        return result
    if value is Array:
        var result:Array=[]
        for item in value:result.append(packed(item))
        return result
    return value
func snap(scene)->Dictionary:
    var value:Dictionary=scene.snapshot()
    value.light.erase("clock_id")
    value.leaves=[]
    for i:int in range(18):value.leaves.append(scene.leaf_pose(i,scene.age))
    return packed(value)
func step_to(scene,seconds:float)->void:
    while scene.age<seconds-0.00000001:scene.advance(minf(1.0/60.0,seconds-scene.age))
func _initialize()->void:call_deferred("run")
func run()->void:
    var out_path:=OS.get_cmdline_user_args()[0]
    var clock:=Clock.new()
    var scene=Runtime.new();root.add_child(scene);scene.configure(Config.DATA,clock,null);scene.set_process(false)
    var result:Dictionary={"engine":Engine.get_version_info().string,"config":packed(Config.DATA),"route":[],"motion":[],"light":[],"footprints":[],"flow":[],"pcm":[]}
    for i:int in range(201):result.route.append({"fraction":float(i)/200.0,"at":packed(Config.route_position(float(i)/200.0))})
    for seconds:float in [0.0,1.0,3.5,4.0,8.6,12.0,30.0,60.0,120.0]:
        step_to(scene,seconds);result.motion.append(snap(scene))
    scene.update_route(0.35,true);var paused_age:float=scene.age;scene.advance(0.1);assert(scene.age==paused_age)
    scene.update_route(0.35,false);clock.application_active=false;scene.advance(0.1);assert(scene.age==paused_age);clock.application_active=true
    for hour:float in [0.0,3.9,4.0,4.2,5.0,6.0,7.0,12.0,18.0,19.8,20.0,20.2,21.0,23.9]:
        clock.hour=hour;var light:Dictionary=scene.light_snapshot();light.erase("clock_id");result.light.append(packed(light))
    scene.seed_route(0.25);scene.update_route(0.51,false);var began:float=scene.age
    for elapsed:float in [0.0,0.1,0.23,0.3,0.58,1.2]:
        step_to(scene,began+elapsed);var poses:Array=[]
        for index:int in range(11):poses.append(packed(scene.footprint_pose(index)))
        result.footprints.append({"age":scene.age,"elapsed":elapsed,"poses":poses})
    var flow=Flow.new()
    for height:float in [1280.0,1690.0]:
        flow.size=Vector2(720,height);flow.target=Config.route_position(0.4)+Vector2(0,maxf(0.0,(height-1280.0)*0.5))
        for at_time:float in [0.0,0.3,1.0,5.0,100.0]:
            var poses:Array=[]
            for index:int in range(48):poses.append(packed(flow.star_pose(index,at_time)))
            result.flow.append({"height":height,"time":at_time,"target":packed(flow.target),"poses":poses})
    flow.free()
    var audio_values:Array=[Config.DATA.audio,{"sample_rate":22050,"duration":0.78,"frequency":784.0,"partials":[[1.0,0.65,0.32],[1.5,0.19,0.23],[2.0,0.10,0.18]]}]
    for index:int in range(audio_values.size()):
        var stream:AudioStreamWAV=Runtime.synthesize_bell(audio_values[index]);var hash=HashingContext.new();hash.start(HashingContext.HASH_SHA256);hash.update(stream.data)
        var file=FileAccess.open(out_path+"."+str(index)+".pcm",FileAccess.WRITE);file.store_buffer(stream.data);file.close()
        result.pcm.append({"values":audio_values[index],"rate":stream.mix_rate,"bytes":stream.data.size(),"sha256":hash.finish().hex_encode()})
    var output=FileAccess.open(out_path,FileAccess.WRITE);output.store_string(JSON.stringify(result,"",true,true)+"\n");output.close()
    scene.dispose();scene.free();print("TRAVEL_SCENE_ORACLE_OK");quit(0)
'''
def main():
    args=argparse.ArgumentParser();args.add_argument('--name',default='travel-scene-native-v1',help='Use a fresh name to preserve previous evidence');args.add_argument('--godot',default=str(ROOT/'builds/work/godot-native-4.5.2/Godot.app/Contents/MacOS/Godot'));args=args.parse_args()
    assert args.name and all(c.isalnum() or c in '-_' for c in args.name)
    binary=Path(args.godot).resolve();work=ROOT/'builds/work'/args.name
    output=ROOT/'builds/reviews'/f'M07-{args.name}.json'
    if output.exists():raise SystemExit('Evidence already exists; pass a new --name')
    work.mkdir(parents=True,exist_ok=True)
    hashes=[]
    for name in FILES:
        target=work/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(SOURCE/name,target);hashes.append({'path':name,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
    page=(SOURCE/'travel/travel_page.gd').read_text();flow=page.split('class EncounterFlow:\n',1)[1].split('\nvar _event_font:',1)[0];(work/'encounter_flow.gd').write_text(textwrap.dedent(flow))
    hashes.append({'path':'travel/travel_page.gd','sha256':hashlib.sha256((SOURCE/'travel/travel_page.gd').read_bytes()).hexdigest(),'extraction':'EncounterFlow class body, unmodified'})
    (work/'project.godot').write_text('config_version=5\n[application]\nconfig/name="Little Steps numerical oracle"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n')
    (work/'oracle.gd').write_text(ORACLE)
    for phase,argv in [('import',['--editor','--import','--quit']),('oracle',['--script','res://oracle.gd','--',str(output)])]:
        log=ROOT/f'builds/reviews/M07-{args.name}-{phase}.log'
        with log.open('w') as stream:r=subprocess.run([str(binary),'--headless','--path',str(work),*argv],stdout=stream,stderr=subprocess.STDOUT,timeout=60)
        print(json.dumps({'phase':phase,'exit':r.returncode,'log':str(log)}),flush=True)
        if r.returncode or 'SCRIPT ERROR' in log.read_text():raise SystemExit(1)
    data=json.loads(output.read_text());assert 'TRAVEL_SCENE_ORACLE_OK' in (ROOT/f'builds/reviews/M07-{args.name}-oracle.log').read_text()
    (ROOT/f'builds/reviews/M07-{args.name}-source.json').write_text(json.dumps({'schema':1,'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT.parent/'little-steps').decode().strip(),'sourceFiles':hashes,'engine':data['engine'],'headless':True,'visualAcceptance':False,'outputSHA256':hashlib.sha256(output.read_bytes()).hexdigest()},ensure_ascii=False,indent=2)+'\n')
    target=ROOT/'games/xiaoyu-cocos/assets/game/TravelSceneData.ts';target.write_text('// Generated from unmodified Godot travel_scene_config.gd by the native oracle.\nexport const TRAVEL_SCENE:any = '+json.dumps(data['config'],ensure_ascii=False,indent=2)+';\n')
if __name__=='__main__':main()
