#!/usr/bin/env python3
"""Strict compare of actual native Godot and actual Creator model JSON rows."""
import argparse,hashlib,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def compare(a,b,path,failures):
    if isinstance(a,bool) or isinstance(b,bool):
        if type(a)!=type(b) or a!=b:failures.append(path)
    elif isinstance(a,(int,float)) and isinstance(b,(int,float)):
        if not math.isfinite(a) or not math.isfinite(b) or a!=b:failures.append(path)
    elif type(a)!=type(b):failures.append(path)
    elif isinstance(a,dict):
        if set(a)!=set(b):failures.append(path+'.keys')
        for key in set(a)&set(b):compare(a[key],b[key],path+'.'+key,failures)
    elif isinstance(a,list):
        if len(a)!=len(b):failures.append(path+'.length')
        for index,(left,right) in enumerate(zip(a,b)):compare(left,right,path+f'[{index}]',failures)
    elif a!=b:failures.append(path)
def main():
    p=argparse.ArgumentParser();p.add_argument('--godot',required=True);p.add_argument('--cocos',required=True);p.add_argument('--output',required=True);a=p.parse_args();failures=[];sources=[];data=[]
    for name in [a.godot,a.cocos]:
        path=ROOT/name;rows=json.loads(path.read_text());assert isinstance(rows,list) and len(rows)==45 and all(row['valid'] for row in rows);assert len(set(row['label'] for row in rows))==45;data.append({row['label']:row for row in rows});sources.append({'path':name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    compare(data[0],data[1],'rows',failures);record={'schema':1,'scope':'Actual engine direct TravelModel API traces; source state equality only, no Travel UI, actual pointer, save device or visual acceptance','rows':45,'numberPolicy':'Exact finite numeric equality, no tolerance/rounding','fullState':True,'sources':sources,'mismatches':sorted(failures),'status':'matches' if not failures else 'failed'};(ROOT/a.output).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'rows':45,'mismatches':len(failures),'report':a.output}));assert not failures
if __name__=='__main__':main()
