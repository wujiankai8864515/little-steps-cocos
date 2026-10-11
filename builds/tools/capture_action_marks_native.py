from pathlib import Path
import argparse,hashlib,json,subprocess
r=Path(__file__).resolve().parents[2];source=r.parent/'little-steps/games/travel_woodfish/project/home/action_marks.gd'
p=argparse.ArgumentParser();p.add_argument('--name',required=True);args=p.parse_args();assert all(c.isalnum() or c in '-_' for c in args.name)
stage=r/'builds/work'/args.name;stage.mkdir(exist_ok=False);(stage/'action_marks.gd').write_bytes(source.read_bytes())
(stage/'project.godot').write_text('config_version=5\n[application]\nconfig/name="Original action mark oracle"\n')
script='''extends SceneTree
const Marks=preload("res://action_marks.gd")
func encode(v):
    if v is Vector2:return [v.x,v.y]
    if v is Rect2:return [v.position.x,v.position.y,v.size.x,v.size.y]
    if v is Color:return [v.r,v.g,v.b,v.a]
    if v is Dictionary:
        var d={}
        for key in v:d[str(key)]=encode(v[key])
        return d
    if v is Array or v is PackedVector2Array:return Array(v).map(encode)
    return v
func _initialize():call_deferred("run")
func run():
    var rows=[];var mark=Marks.new();root.add_child(mark)
    for kind in ["tap","drink","doze","lift"]:
        for age in [0.0,0.02,0.035,0.09,0.15,0.18,0.4,0.81,0.83]:
            mark.clear();var ok=mark.emit_mark(StringName(kind),Vector2(500,750),Rect2(),1);mark.advance(age)
            rows.append({"kind":kind,"at":[500,750],"face":[0,0,0,0],"age":age,"accepted":ok,"snapshot":encode(mark.qa_snapshot()),"glyph":encode(mark._glyph(StringName(kind)))})
    for kind in ["tap","drink","doze","lift"]:
        for at in [Vector2(80,120),Vector2(160,130),Vector2(230,140),Vector2(140,185)]:
            mark.clear();var rect=Rect2(100,100,120,70);var ok=mark.emit_mark(StringName(kind),at,rect,2)
            rows.append({"kind":kind,"at":encode(at),"face":encode(rect),"age":0,"accepted":ok,"snapshot":encode(mark.qa_snapshot())})
    var f=FileAccess.open(OS.get_cmdline_user_args()[0],FileAccess.WRITE)
    f.store_string(JSON.stringify({"rows":rows,"orthogonal":encode(Vector2(1,0).orthogonal())}));f.close();mark.free();print("ACTION_MARK_NATIVE_OK ",rows.size());quit()
'''
(stage/'oracle.gd').write_text(script)
record={'schema':1,'sourceFile':str(source.relative_to(r.parent/'little-steps')),'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'scriptSHA256':hashlib.sha256(script.encode()).hexdigest(),'scope':'Unmodified original emit/face exclusion/lifetime/alpha/tap-motion/glyph execution; not visual acceptance'}
(r/'builds/records/M04-action-marks-native.json').write_text(json.dumps(record,indent=2)+'\n')
engine=r/'builds/work/godot-native-4.5.2/Godot.app/Contents/MacOS/Godot'
with (r/'builds/reviews'/('M04-'+args.name+'.log')).open('w') as log:
 result=subprocess.run([str(engine),'--headless','--path',str(stage),'--script','res://oracle.gd','--',str(r/'games/xiaoyu-cocos/test/fixtures/action-marks-native.json')],stdout=log,stderr=subprocess.STDOUT,timeout=45)
assert result.returncode==0
print('Native mark oracle captured')
