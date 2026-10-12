#!/usr/bin/env python3
"""Explicit same-time incense fixtures in the two real engines; QA only."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
from freeze_godot_plants import read_pack, replace_entries

ROOT=Path(__file__).resolve().parents[2]
def sha(value):return hashlib.sha256(value).hexdigest()
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--engine',choices=['cocos','godot'],required=True)
    parser.add_argument('--name',required=True)
    parser.add_argument('--phase',type=float,default=2)
    parser.add_argument('--hour',type=float,default=12)
    parser.add_argument('--from-reference',default='godot-reference-noon-v1')
    args=parser.parse_args()
    if not math.isfinite(args.phase) or not 0<=args.phase<=35.6 or abs(args.phase*30-round(args.phase*30))>1e-8:parser.error('Phase requires exact 1/30 steps in 0..35.6 seconds')
    tool='create_candidate.py' if args.engine=='cocos' else 'freeze_godot_plants.py'
    argv=[sys.executable,str(ROOT/'migration/tools'/tool),'--name',args.name,'--hour',str(args.hour)]
    argv+=['--route','home','--freeze','--freeze-plants'] if args.engine=='cocos' else ['--from-reference',args.from_reference]
    subprocess.run(argv,check=True)
    stage=ROOT/'migration/work'/args.name
    record=ROOT/'migration/records/candidates'/f'{args.name}.json'
    report=json.loads(record.read_text());overrides=[];steps=round(args.phase*30)
    if args.engine=='cocos':
        script=stage/'games/xiaoyu-cocos/assets/game/HomeIncense.ts';before=script.read_bytes();text=before.decode()
        replacements=[
            ('getItem:(key:string)=>sys.localStorage.getItem(key),setItem:(key:string,value:string)=>sys.localStorage.setItem(key,value)',"getItem:(key:string)=>reviewValues.get(key)||null,setItem:(key:string,value:string)=>{reviewValues.set(key,value);}"),
            ('()=>Date.now()/1000,()=>game.totalTime',"()=>1000,()=>0,'qa_incense_checkpoint'"),
        ]
        point='        const checkpoint=new core.CheckpointStore';assert text.count(point)==1;text=text.replace(point,'        const reviewValues=new Map<string,string>();\n'+point)
        for old,new in replacements:
            assert text.count(old)==1,old;text=text.replace(old,new)
        point='        this.syncTransform();this.draw();this.updateHint(0);'
        assert text.count(point)==1
        patch=f'''        this.state.ignite();
        for(let reviewStep=0;reviewStep<{steps};reviewStep++)this.state.advance(1/30);
        console.info('[LittleSteps QA] incense checkpoint '+JSON.stringify({{phase:{args.phase},state:this.state.snapshot(),points:this.smoke.points}}));
'''
        text=text.replace(point,patch+point);script.write_text(text)
        overrides.append({'path':'games/xiaoyu-cocos/assets/game/HomeIncense.ts','sourceSHA256':sha(before),'fixtureSHA256':sha(script.read_bytes()),'purpose':'Fixed clocks, isolated nonpersistent checkpoint adapter, ignition and deterministic 1/30 advancement; no physical input or storage acceptance'})
        report['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f.read_bytes()),'symlink':str(f.readlink()) if f.is_symlink() else None} for directory in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/directory).rglob('*')) if f.is_file()]
        report['snapshotSHA256']=sha(json.dumps(report['files'],sort_keys=True).encode())
    else:
        web=stage/'web';pack=web/'index.pck';before=pack.read_bytes()
        source=ROOT.parent/'little-steps/games/travel_woodfish/project/home/independent_incense.gd'
        text=source.read_text()
        for old,new in [
            ('return float ( wall_clock . call ( ) ) if wall_clock . is_valid ( ) else Time . get_unix_time_from_system ( )','return 1000.0'),
            ('return int ( tick_clock . call ( ) ) if tick_clock . is_valid ( ) else Time . get_ticks_msec ( )','return 0'),
            ('    _restore_burn ( )\n    _update_hint ( 0.0 )','    persistence_enabled = false\n    _restore_burn ( )\n    _update_hint ( 0.0 )'),
        ]:
            assert text.count(old)==1,old;text=text.replace(old,new)
        point='    set_process ( true )\n    return true';assert text.count(point)==1
        patch=f'''    _ignite ( )
    for review_step : int in range ( {steps} ) : _advance_time ( 1.0 / 30.0 )
    print ( "[LittleSteps QA] incense checkpoint ", JSON . stringify ( {{ "phase" : {args.phase} , "remaining" : remaining_seconds , "duration" : burn_seconds , "burn_count" : burn_count , "visual_time" : _visual_elapsed , "stick_length" : get_stick_length ( ) , "points" : _smoke_points }} ) )
'''
        text=text.replace(point,patch+point)
        replacements={'home/independent_incense.gd.remap':b'[remap]\n\npath="res://qa/independent_incense.gd"\n','qa/independent_incense.gd':text.encode()}
        after,count,new_count=replace_entries(before,replacements);pack.write_bytes(after)
        for filename in ['resource_packs.host.json','index.html']:
            path=web/filename;raw=path.read_bytes()
            if filename.endswith('.json'):
                data=json.loads(raw);assert data['packs']['core']['sha256']==sha(before);data['packs']['core'].update(bytes=len(after),sha256=sha(after));path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
            else:
                point='"index.pck":'+str(len(before));text=raw.decode();assert text.count(point)==1;path.write_text(text.replace(point,'"index.pck":'+str(len(after))))
            overrides.append({'path':filename,'beforeFixtureSHA256':sha(raw),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Declare exact QA pack bytes and checksum'})
        overrides.append({'path':'index.pck','beforeFixtureSHA256':sha(before),'fixtureSHA256':sha(after),'sourceIncenseSHA256':sha(source.read_bytes()),'purpose':'Fixed clocks and nonpersistent original incense at deterministic phase; all unrelated pack payloads preserved','beforeEntries':count,'fixtureEntries':new_count,'unchangedPriorEntries':count-1,'replacements':[{'path':p,'sha256':sha(v)} for p,v in replacements.items()]})
        report['fixtureFiles']=[{'path':str(f.relative_to(web)),'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in sorted(web.rglob('*')) if f.is_file()]
    report['overrides'].extend(overrides)
    report['incenseCheckpoint']={'phase':args.phase,'steps':steps,'stepSeconds':1/30,'wallUnix':1000,'monotonicMilliseconds':0,'burnSeconds':30,'browser':'pending','limits':'Fixed geometry/render checkpoint; physical input, storage, typography and WeChat device parity require separate evidence'}
    report['kind']='Explicit deterministic incense QA checkpoint; not unchanged published behavior or a formal release'
    record.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'name':args.name,'engine':args.engine,'record':str(record)}))
if __name__=='__main__':main()
