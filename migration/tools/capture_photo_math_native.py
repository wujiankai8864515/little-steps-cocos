from pathlib import Path
import re,json,hashlib
r=Path(__file__).resolve().parents[2];src=r.parent/'little-steps/games/travel_woodfish/project';import argparse,subprocess
a=argparse.ArgumentParser();a.add_argument('--name',required=True);args=a.parse_args();assert all(c.isalnum() or c in '-_' for c in args.name)
stage=r/'migration/work'/args.name;stage.mkdir(exist_ok=False)
files=['photo/photo_paper.gd','photo/photo_art.gd','photo/photo_config.gd','photo/photo_material.gd','shared_room_lighting/soft_atmosphere.gd','shared_room_lighting/lighting_snapshot.gd']
for name in files:
 p=stage/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((src/name).read_bytes())
(stage/'project.godot').write_text('config_version=5\n[application]\nconfig/name="Photo native math oracle"\n')
script='''extends SceneTree
const Paper=preload("res://photo/photo_paper.gd")
const MaterialSpec=preload("res://photo/photo_material.gd")
const Lighting=preload("res://shared_room_lighting/lighting_snapshot.gd")
func point(p:Vector2):return [p.x,p.y]
func _initialize():
    var rows=[]
    for id in ["home_legacy_1","home_legacy_2","reward:旅途😀"]:
        for time in [0.0,0.5,12.0]:
            for hour in [4.0,12.0,23.0]:
                var p=Paper.new()
                p.photo_id=id;p.base_angle=Paper.Config.ANGLES[2];p.seed_phase=float(posmod(id.hash(),10007))/10007.0*TAU+2.0*0.37;p.breeze_rate=0.58+float(posmod(id.hash(),997))/997.0*0.24
                p.position=Paper.Config.ANCHORS[2]+Vector2(sin(time*0.47+2.0*1.31)*0.65,sin(time*0.73+2.0*1.71)*1.65)
                p.surface=Polygon2D.new();p.add_child(p.surface);p.receiver=ShaderMaterial.new();p.receiver.shader=Shader.new();p.receiver.shader.code="shader_type canvas_item; uniform float phase;"
                for i in range(4):
                    var shade=Polygon2D.new();p.add_child(shade);p.penumbra.append(shade)
                var snapshot=Lighting.sample(hour);var light=MaterialSpec.field(snapshot);p.advance(time,snapshot,light)
                rows.append({"id":id,"time":time,"hour":hour,"index":2,"hash":id.hash(),"phase":p.phase,"rotation":p.rotation,"position":point(p.position),"vertices":Array(p.surface.polygon).map(point),"contour":Array(p.contour).map(point),"shadows":p.penumbra.map(func(shade):return Array(shade.polygon).map(point)),"light":{"origin":point(light.origin),"cast":point(light.cast),"elevation":light.elevation,"energy":light.energy,"color":[light.color.x,light.color.y,light.color.z],"ambient":[light.ambient.x,light.ambient.y,light.ambient.z],"night":light.night}})
                p.free()
    var f=FileAccess.open(OS.get_cmdline_user_args()[0],FileAccess.WRITE);f.store_string(JSON.stringify(rows));f.close();print("PHOTO_NATIVE_MATH_OK ",rows.size());quit()
'''
(stage/'oracle.gd').write_text(script)
(r/'migration/records/M08-photo-native-math.json').write_text(json.dumps({'schema':1,'sourceFiles':[{'path':n,'sha256':hashlib.sha256((src/n).read_bytes()).hexdigest()} for n in files],'scriptSHA256':hashlib.sha256(script.encode()).hexdigest(),'purpose':'Unmodified original Paper.advance/deform and Materials.field, numeric geometry oracle; not visual acceptance'},indent=2)+'\n')

engine=r/'migration/work/godot-native-4.5.2/Godot.app/Contents/MacOS/Godot'
with (r/'migration/reviews'/('M08-'+args.name+'.log')).open('w') as log:
 result=subprocess.run([str(engine),'--headless','--path',str(stage),'--script','res://oracle.gd','--',str(r/'games/xiaoyu-cocos/test/fixtures/photo-native-math.json')],stdout=log,stderr=subprocess.STDOUT,timeout=60)
assert result.returncode==0
