#!/usr/bin/env python3
"""Declare observer-only input traces and a plant rest pose in QA mirrors."""
import argparse,hashlib,json
from pathlib import Path
from freeze_godot_plants import read_pack,replace_entries
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT.parent/'little-steps/games/travel_woodfish/project'
def sha(v):return hashlib.sha256(v).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--name',required=True);p.add_argument('--engine',choices=['cocos','godot'],required=True);a=p.parse_args()
    assert a.name and all(c.isalnum() or c in '-_' for c in a.name)
    stage=ROOT/'builds/work'/a.name;record=ROOT/'builds/records/candidates'/f'{a.name}.json';report=json.loads(record.read_text());overrides=[]
    if a.engine=='cocos':
        path=stage/'games/xiaoyu-cocos/assets/game/HomePage.ts';before=path.read_bytes();s=before.decode();point='this.plants.advance(delta)';assert s.count(point)==1;s=s.replace(point,'this.plants.advance(0)');point='    private active=false;';assert s.count(point)==1;s=s.replace(point,point+'private reviewBagState="";');point='this.note.advance(delta);';assert s.count(point)==1
        s=s.replace(point,point+'''const reviewState=this.bag.state+':'+this.note.snapshot().phase+':'+this.backpack.wear.mode; if(reviewState!==this.reviewBagState){this.reviewBagState=reviewState;console.info('[LittleSteps QA] bag browser '+JSON.stringify({input:this.bag.snapshot(),backpack:this.backpack.snapshot(),note:this.note.snapshot()}));}''');point='this.rig.advance(delta,this.clock.nightProgress()>=0)';assert s.count(point)==1;s=s.replace(point,"if(this.fish.state==='IDLE'&&!this.bag.offered)this.rig.poseAt(0);else "+point);path.write_text(s)
        overrides.append({'path':str(path.relative_to(stage)),'sourceSHA256':sha(before),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Ambient/plant rest pose, retaining controller-driven fish/bag bones, and public state-change observer; real browser inputs and bag/note motion remain unchanged'})
        report['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f.read_bytes()),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()];report['snapshotSHA256']=sha(json.dumps(report['files'],sort_keys=True).encode())
    else:
        web=stage/'web';pack=web/'index.pck';before=pack.read_bytes();replacements={}
        relative='home/home_page.gd';source=(SOURCE/relative).read_bytes();s=source.decode();point='    if is_instance_valid ( interaction ) : interaction . update ( delta )';assert s.count(point)==1
        s=s.replace(point,point+'''
    if input_enabled and is_instance_valid(interaction):
        var review_state: String = str(interaction.state) + ":" + str(note.phase) + ":" + str(room_props.is_backpack_worn()) + ":" + str(room_props.is_restoring_backpack())
        if review_state != _review_bag_state:
            _review_bag_state = review_state
            _review_bag_browser()
''');point='    if used : get_viewport ( ) . set_input_as_handled ( )';assert s.count(point)==1;s=s.replace(point,'    if used : _review_bag_browser()\n'+point)
        s+='''
var _review_bag_state: String = ""
func _review_bag_browser() -> void:
    var bag: Node2D = world.get_node("Bag")
    var bounds: Rect2 = room_props.backpack_visual_bounds()
    var proxy_frame: Transform2D = bag.transform
    print("[LittleSteps QA] bag browser ",JSON.stringify({"input":interaction.debug_snapshot(),"backpack":room_props.debug_snapshot(),"note":note.snapshot(),"proxy":{"position":[bag.position.x,bag.position.y],"scale":[bag.scale.x,bag.scale.y],"rotation":bag.rotation,"depth":bag.z_index},"visual_bounds":[bounds.position.x,bounds.position.y,bounds.size.x,bounds.size.y],"bones":{"grip":world.grip_bone.rotation,"shoulder":[world.shoulder_bone.position.x,world.shoulder_bone.position.y],"tail_scale":[world.tail_bone.scale.x,world.tail_bone.scale.y]},"presentation":is_instance_valid(_drag_canvas)},"",true,true))
'''
        replacements[relative+'.remap']=b'[remap]\n\npath="res://qa/bag_input_home_page.gd"\n';replacements['qa/bag_input_home_page.gd']=s.encode()
        for relative in ['home/room_props_controller.gd','home/interaction/home_interaction_controller.gd','home/secondary/articulated_backpack.gd','home/secondary/spring_mesh_part.gd']:
            replacements[relative]=(SOURCE/relative).read_bytes();replacements[relative+'.remap']=f'[remap]\n\npath="res://{relative}"\n'.encode()
        after,count,new_count=replace_entries(before,replacements);pack.write_bytes(after)
        for filename in ['resource_packs.host.json','index.html']:
            path=web/filename;raw=path.read_bytes()
            if filename.endswith('.json'):
                data=json.loads(raw);assert data['packs']['core']['sha256']==sha(before);data['packs']['core'].update(bytes=len(after),sha256=sha(after));path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
            else:
                point='"index.pck":'+str(len(before));text=raw.decode();assert text.count(point)==1;path.write_text(text.replace(point,'"index.pck":'+str(len(after))))
            overrides.append({'path':filename,'beforeFixtureSHA256':sha(raw),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Declare actual observer QA pack SHA and bytes'})
        overrides.append({'path':'index.pck','beforeFixtureSHA256':sha(before),'fixtureSHA256':sha(after),'beforeEntries':count,'fixtureEntries':new_count,'sourceHomePageSHA256':sha(source),'purpose':'Latest original prop/controller/mesh scripts and observer-only HomePage source; inputs are browser pointer events; no controller-driving or state changes','replacements':[{'path':k,'sha256':sha(v)} for k,v in replacements.items()]});report['fixtureFiles']=[{'path':str(f.relative_to(web)),'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in sorted(web.rglob('*')) if f.is_file()]
    report['overrides'].extend(overrides);report['bagInput']={'motion':'real pointer input and wall-clock controller ticks','clock':'declared noon fixture','observations':'public browser logs and actual screenshots','browser':'pending','limits':'Only bag drag/offer/cancel entry, not completed travel or device acceptance'};record.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'engine':a.engine,'record':str(record)}))
if __name__=='__main__':main()
