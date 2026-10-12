#!/usr/bin/env python3
"""Exact actual-engine service traces plus separately declared browser reload."""
import argparse,hashlib,json
from pathlib import Path
from compare_travel_states import compare
ROOT=Path(__file__).resolve().parents[2]
def main():
    p=argparse.ArgumentParser();p.add_argument('--godot',required=True);p.add_argument('--cocos',required=True);p.add_argument('--before',required=True);p.add_argument('--after',required=True);p.add_argument('--output',required=True);a=p.parse_args();sources=[];traces=[];failures=[]
    for name in [a.godot,a.cocos,a.before,a.after]:
        path=ROOT/name;sources.append({'path':name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()});traces.append(json.loads(path.read_text()))
    for rows in traces[:2]:assert len(rows)==31 and len({row['label'] for row in rows})==31 and all(row['valid'] for row in rows)
    compare({row['label']:row for row in traces[0]},{row['label']:row for row in traces[1]},'service',failures)
    assert len(traces[2])==1 and traces[2][0]['phase']=='before-reload'
    before=traces[2][0];after=[row for row in traces[3] if row['phase']=='after-reload'];assert len(after)==1;after=after[0]
    assert before['valid'] and after['valid'] and not before['error'] and not after['error'] and not before['store_error'] and not after['store_error']
    assert before['started'] and before['entered'] and before['data']['revision']==3 and before['data']['active']['clock_mode']=='CHOICE_PAUSED' and before['data']['active']['route_elapsed_seconds']==40
    assert after['data']['revision']==4 and after['data']['active']['clock_mode']=='RUNNING' and after['data']['active']['route_elapsed_seconds']==71
    assert not after['data']['active']['choice_token'] and not after['data']['active']['active_event_uid'] and after['data']['manual_count']==0 and after['data']['auto_count']==0 and after['data']['inventory']==[]
    compare(before['data']['active']['cells'],after['data']['active']['cells'],'browser.savedRoute',failures);compare(before['data']['active']['rewards'],after['data']['active']['rewards'],'browser.savedRewards',failures)
    record={'schema':1,'scope':'31 actual-engine direct TravelService API traces including full memory checkpoint and projection; browser reload uses real localStorage and explicit QA fixed clock/button. Product Travel UI and WeChat device unverified.','numberPolicy':'Exact finite equality; no tolerance/rounding','rows':31,'sources':sources,'browserReload':{'beforeRevision':3,'afterRevision':4,'beforeElapsed':40,'afterElapsed':71,'manualLearning':0,'inventory':0,'scope':'Real navigation/restore, QA clock1000/1040/1069/1100; not elapsed real-time measurement'},'mismatches':sorted(failures),'status':'matches' if not failures else 'failed'};(ROOT/a.output).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'rows':31,'mismatches':len(failures),'browserReload':'passed','output':a.output}));assert not failures
if __name__=='__main__':main()
