#!/usr/bin/env python3
"""Explicit held-table checkpoint; actual alpha pick and original controller, not physical input."""
import argparse,hashlib,json,subprocess,sys
from pathlib import Path
from freeze_godot_plants import read_pack,replace_entries
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT.parent/'little-steps/games/travel_woodfish/project'
def sha(v):return hashlib.sha256(v).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--name',required=True);p.add_argument('--engine',choices=['cocos','godot'],required=True);a=p.parse_args();assert a.name and all(c.isalnum() or c in '-_' for c in a.name)
    argv=[sys.executable,str(ROOT/'builds/tools'/('create_candidate.py' if a.engine=='cocos' else 'freeze_godot_plants.py')),'--name',a.name,'--hour','12'];argv+=['--route','home','--freeze','--freeze-plants'] if a.engine=='cocos' else ['--from-reference','godot-reference-noon-v1'];subprocess.run(argv,check=True)
    stage=ROOT/'builds/work'/a.name;record=ROOT/'builds/records/candidates'/f'{a.name}.json';report=json.loads(record.read_text());overrides=[]
    if a.engine=='cocos':
        path=stage/'games/xiaoyu-cocos/assets/game/HomePage.ts';before=path.read_bytes();s=before.decode()
        for old,new in [('this.props.advance(delta)','void 0'),('this.rig.poseAt(0)','void 0'),('this.rig.advanceDragGaze(delta)','void 0'),('this.feedback.advance(delta)','this.feedback.advance(0)')]:assert s.count(old)==1,old;s=s.replace(old,new)
        point='        this.lighting.update();\n        this.shadows.update();';assert s.count(point)==1
        code='''        this.rig.resetSecondary();if(!this.props.down(246,[142,1156])||this.props.selected!=='low_table')throw new Error('QA table alpha pick refused');this.props.move(246,[390,836]);
        for(let reviewStep=0;reviewStep<42;reviewStep++){this.props.advance(1/60);this.feedback.advance(1/60);this.rig.setActiveDragFocus('low_table',this.propVisuals.focusCenter('low_table'),this.dragCarrier);this.rig.advanceDragGaze(1/60);}
        this.lighting.update();this.lighting.syncPresentation(this.dragCarrier);this.shadows.update();this.sortRoomLayers();
        console.info('[LittleSteps QA] table checkpoint '+JSON.stringify({input:this.props.snapshot(),visual:this.propVisuals.snapshot(),shadows:this.shadows.snapshot()}));
''';path.write_text(s.replace(point,code+point));overrides.append({'path':str(path.relative_to(stage)),'sourceSHA256':sha(before),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Declared alpha down[142,1156], move[390,836],42 original1/60 ticks; actual nodes/presentation/light/shadow; keep held without pretending physical touch'})
        report['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f.read_bytes()),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()];report['snapshotSHA256']=sha(json.dumps(report['files'],sort_keys=True).encode())
    else:
        web=stage/'web';pack=web/'index.pck';before=pack.read_bytes();entries={e['path']:e['data'] for e in read_pack(before)[1]};s=entries['qa/home_world.gd'].decode();point='    _advance_drag_gaze ( delta )';assert s.count(point)==1;s=s.replace(point,'    if not _review_table_done: _advance_drag_gaze ( delta )')
        s+='''
var _review_table_done: bool = false
func _review_table_checkpoint() -> void:
    var page: Node = get_parent()
    while page != null and not page.has_method("begin_drag_presentation"): page = page.get_parent()
    var controller: RefCounted = page.interaction
    reset_secondary_pose()
    if not controller.pointer_down(246,Vector2(142,1156)) or controller.selected_id != &"low_table":
        push_error("QA table alpha pick refused")
        return
    controller.pointer_move(246,Vector2(390,836))
    for i: int in range(42):
        controller.update(1.0/60.0)
        _advance_drag_gaze(1.0/60.0)
    _review_table_done = true
    _update_character_meshes()
    _update_pupil_nodes()
    update_lighting()
    var table: Node2D = controller._objects[&"low_table"].node
    var rect: Rect2 = controller.drag_visual_bounds(&"low_table",controller.registry.position_of(&"low_table"))
    print("[LittleSteps QA] table checkpoint ",JSON.stringify({"input":controller.debug_snapshot(),"position":[table.position.x,table.position.y],"rotation":table.rotation,"depth":table.z_index,"bounds":[rect.position.x,rect.position.y,rect.size.x,rect.size.y],"ground":table.get_meta("interaction_ground_y"),"lift":table.get_meta("interaction_lift_height"),"presentation":is_instance_valid(page._drag_canvas)},"",true,true))
'''
        page=(SOURCE/'home/home_page.gd').read_text();point='func _process ( delta : float ) -> void :\n';assert page.count(point)==1;page=page.replace(point,'var _review_table_started: bool = false\n'+point+'    if input_enabled and not _review_table_started:\n        _review_table_started = true\n        world.call_deferred("_review_table_checkpoint")\n');point='    if is_instance_valid ( interaction ) : interaction . update ( delta )';assert page.count(point)==1;page=page.replace(point,'    if is_instance_valid ( interaction ) : pass')
        replacements={'qa/home_world.gd':s.encode(),'home/home_page.gd.remap':b'[remap]\n\npath="res://qa/table_home_page.gd"\n','qa/table_home_page.gd':page.encode()}
        relative='home/interaction/home_interaction_controller.gd';replacements[relative]=(SOURCE/relative).read_bytes();replacements[relative+'.remap']=f'[remap]\n\npath="res://{relative}"\n'.encode()
        after,count,new_count=replace_entries(before,replacements);pack.write_bytes(after)
        for filename in ['resource_packs.host.json','index.html']:
            path=web/filename;raw=path.read_bytes()
            if filename.endswith('.json'):
                data=json.loads(raw);assert data['packs']['core']['sha256']==sha(before);data['packs']['core'].update(bytes=len(after),sha256=sha(after));path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
            else:
                point='"index.pck":'+str(len(before));text=raw.decode();assert text.count(point)==1;path.write_text(text.replace(point,'"index.pck":'+str(len(after))))
            overrides.append({'path':filename,'beforeFixtureSHA256':sha(raw),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Declare actual QA pack SHA/bytes'})
        overrides.append({'path':'index.pck','beforeFixtureSHA256':sha(before),'fixtureSHA256':sha(after),'beforeEntries':count,'fixtureEntries':new_count,'purpose':'Same declared original table controller inputs/42steps; actual carried geometry and public trace; unrelated payloads preserved','replacements':[{'path':k,'sha256':sha(v)} for k,v in replacements.items()]});report['fixtureFiles']=[{'path':str(f.relative_to(web)),'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in sorted(web.rglob('*')) if f.is_file()]
    report['overrides'].extend(overrides);report['tableCheckpoint']={'kind':'Declared fixed controller input, not physical pointer input','down':[142,1156],'move':[390,836],'steps':42,'step':1/60,'hour':12,'browser':'pending','allPagesAndWechat':'pending'};record.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'engine':a.engine,'record':str(record)}))
if __name__=='__main__':main()
