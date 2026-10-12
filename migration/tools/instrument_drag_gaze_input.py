#!/usr/bin/env python3
"""Observer-only real pointer gaze traces layered over declared ambient-rest QA."""
import argparse,hashlib,json,subprocess,sys
from pathlib import Path
from freeze_godot_plants import read_pack,replace_entries
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT.parent/'little-steps/games/travel_woodfish/project'
def sha(v):return hashlib.sha256(v).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--name',required=True);p.add_argument('--engine',choices=['cocos','godot'],required=True);a=p.parse_args()
    subprocess.run([sys.executable,str(ROOT/'migration/tools/instrument_backpack_input.py'),'--name',a.name,'--engine',a.engine],check=True)
    stage=ROOT/'migration/work'/a.name;record=ROOT/'migration/records/candidates'/f'{a.name}.json';report=json.loads(record.read_text());overrides=[]
    if a.engine=='cocos':
        path=stage/'games/xiaoyu-cocos/assets/game/HomePage.ts';before=path.read_bytes();s=before.decode();point='    private active=false;';assert s.count(point)==1;s=s.replace(point,point+'private reviewGazeState="";private reviewGazeAge=0;');point='this.rig.advanceDragGaze(delta);';assert s.count(point)==1;s=s.replace(point,point+'''this.reviewGazeAge+=delta;const reviewGazeKey=this.rig.dragGaze.activeId+':'+(this.rig.dragGaze.weight>0);if(reviewGazeKey!==this.reviewGazeState||(this.rig.dragGaze.activeId&&this.reviewGazeAge>=.15)){this.reviewGazeState=reviewGazeKey;this.reviewGazeAge=0;console.info('[LittleSteps QA] drag gaze pointer '+JSON.stringify({gaze:this.rig.dragGaze.snapshot(),pupils:this.rig.pupilOffsets(),bag:this.bag.snapshot()}));}''');path.write_text(s);overrides.append({'path':str(path.relative_to(stage)),'sourceSHA256':sha(before),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Observe actual gaze state after production update; no fake focus or controller driving'})
        report['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f.read_bytes()),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()];report['snapshotSHA256']=sha(json.dumps(report['files'],sort_keys=True).encode())
    else:
        web=stage/'web';pack=web/'index.pck';before=pack.read_bytes();entries={e['path']:e['data'] for e in read_pack(before)[1]};s=entries['qa/home_world.gd'].decode();point='    _advance_drag_gaze ( delta )\n';assert s.count(point)==1;s=s.replace(point,point+'''    _review_gaze_age += delta
    var review_key: String = str(drag_gaze.active_id) + ":" + str(drag_gaze.weight > 0.0)
    if review_key != _review_gaze_key or (drag_gaze.active_id != &"" and _review_gaze_age >= 0.15):
        _review_gaze_key = review_key
        _review_gaze_age = 0.0
        print("[LittleSteps QA] drag gaze pointer ",JSON.stringify({"gaze":{"active_id":str(drag_gaze.active_id),"target_world":[drag_gaze.target_world.x,drag_gaze.target_world.y],"left":[drag_gaze.left.x,drag_gaze.left.y],"right":[drag_gaze.right.x,drag_gaze.right.y],"weight":drag_gaze.weight},"pupils":[[left_pupil_offset.x,left_pupil_offset.y],[right_pupil_offset.x,right_pupil_offset.y]]},"",true,true))
''');s+='\nvar _review_gaze_age: float = 0.0\nvar _review_gaze_key: String = ""\n';replacements={'qa/home_world.gd':s.encode()}
        for relative in ['home/behavior/drag_gaze.gd','home/behavior/character_geometry.gd','home/behavior/eye_geometry.gd']:
            replacements[relative]=(SOURCE/relative).read_bytes();replacements[relative+'.remap']=f'[remap]\n\npath="res://{relative}"\n'.encode()
        after,count,new_count=replace_entries(before,replacements);pack.write_bytes(after)
        for filename in ['resource_packs.host.json','index.html']:
            path=web/filename;raw=path.read_bytes()
            if filename.endswith('.json'):
                data=json.loads(raw);assert data['packs']['core']['sha256']==sha(before);data['packs']['core'].update(bytes=len(after),sha256=sha(after));path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
            else:
                point='"index.pck":'+str(len(before));text=raw.decode();assert text.count(point)==1;path.write_text(text.replace(point,'"index.pck":'+str(len(after))))
            overrides.append({'path':filename,'beforeFixtureSHA256':sha(raw),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Declare actual observer QA pack SHA/bytes'})
        overrides.append({'path':'index.pck','beforeFixtureSHA256':sha(before),'fixtureSHA256':sha(after),'beforeEntries':count,'fixtureEntries':new_count,'purpose':'Observer-only after native gaze update and current exact original gaze scripts; no input or focus injection','replacements':[{'path':k,'sha256':sha(v)} for k,v in replacements.items()]});report['fixtureFiles']=[{'path':str(f.relative_to(web)),'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in sorted(web.rglob('*')) if f.is_file()]
    report['overrides'].extend(overrides);report['gazePointer']={'mode':'Real browser pointer with public state observer only','browser':'pending','limits':'Frame times unsynchronized; distinct from fixed-step eye oracle and not complete physical/device acceptance'};record.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'engine':a.engine,'record':str(record)}))
if __name__=='__main__':main()
