#!/usr/bin/env python3
"""Make an offline browser reference from the user's published Godot files.

No publication, pack editing or gameplay changes. The original command-line QA
hour/pose contract is the only runtime override, declared in the output record.
"""
import argparse
import concurrent.futures
import hashlib
import json
import math
import urllib.request
from pathlib import Path, PurePosixPath

ROOT=Path(__file__).resolve().parents[2]
BASE='https://wujiankai8864515.github.io/little-steps-play/'
def sha(data):return hashlib.sha256(data).hexdigest()
def fetch(path):
    p=PurePosixPath(path)
    if p.is_absolute() or '..' in p.parts:raise ValueError('Invalid manifest path')
    with urllib.request.urlopen(BASE+str(p),timeout=60) as response:return response.read()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--name',required=True);parser.add_argument('--hour',type=float,required=True);parser.add_argument('--from-reference',help='Reuse a verified frozen reference instead of downloading again');args=parser.parse_args()
    if not all(c.isalnum() or c in '-_' for c in args.name) or not math.isfinite(args.hour):raise ValueError('Invalid fixture')
    stage=ROOT/'builds/work'/args.name
    if stage.exists():raise FileExistsError('Retain earlier evidence; choose a new name')
    stage.mkdir(parents=True);web=stage/'web';web.mkdir()
    prior=None
    if args.from_reference:
        if not all(c.isalnum() or c in '-_' for c in args.from_reference):raise ValueError('Invalid source fixture')
        prior=json.loads((ROOT/'builds/records/candidates'/f'{args.from_reference}.json').read_text())
        source=ROOT/'builds/work'/args.from_reference
        manifest_bytes=(source/'published-release-manifest.json').read_bytes()
    else:manifest_bytes=fetch('release-manifest.json')
    manifest=json.loads(manifest_bytes);(stage/'published-release-manifest.json').write_bytes(manifest_bytes)
    files=manifest.get('current_files',manifest.get('original_files'));assert files
    def transfer(item):
        relative,expected=item
        if prior:
            data=(source/'web'/relative).read_bytes()
            expected_frozen=next(r for r in prior['publishedFiles'] if r['path']==relative)
            if relative=='index.html':
                assert sha(data)==prior['overrides'][0]['fixtureSHA256']
                old='"args":'+json.dumps(prior['overrides'][0]['args'],separators=(',',':'))
                text=data.decode();assert text.count(old)==1;data=text.replace(old,'"args":[]').encode()
            assert sha(data)==expected_frozen['sha256']
        else:data=fetch(relative)
        digest=sha(data)
        # The public host can be updated after the engine/pack release. Never
        # silently accept a changed runtime, PCK, or image under the same path.
        host_only=relative=='index.html' or relative.startswith('host/') and relative.endswith('.js')
        matched=digest==expected['sha256'] and len(data)==expected['bytes']
        if not matched and not host_only:raise ValueError('Published file differs from declared release: '+relative)
        destination=web/relative;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(data)
        return {'path':relative,'bytes':len(data),'sha256':digest,'manifestIdentity':matched,'laterHostSnapshot':not matched}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:records=sorted(pool.map(transfer,files.items()),key=lambda x:x['path'])
    index=web/'index.html';original=sha(index.read_bytes());text=index.read_text();point='"args":[]';assert text.count(point)==1
    qa_args=['--',f'--review-hour={args.hour}']
    index.write_text(text.replace(point,'"args":'+json.dumps(qa_args,separators=(',',':'))))
    report={'schema':1,'name':args.name,'kind':'published Godot QA reference, not a new release','publishedURL':BASE,
        'releaseSourceCommit':manifest['source_commit'],'releaseSnapshot':manifest['source_snapshot_sha256'],'publishedFiles':records,
        'overrides':[{'path':'index.html','publishedSHA256':original,'fixtureSHA256':sha(index.read_bytes()),'args':qa_args,'purpose':'Original app set_review_hour freezes clock and actor; no game pack or engine changes'}],
        'referenceState':{'hour':args.hour,'actorPose':'original set_review_hour still=true'},'browser':'pending','sameStateAcceptance':'pending'}
    if prior:report['reusedReference']=args.from_reference
    (ROOT/'builds/records/candidates'/f'{args.name}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'files':len(records),'bytes':sum(r['bytes'] for r in records),'laterHostSnapshots':sum(r['laterHostSnapshot'] for r in records),'web':str(web)}))

if __name__=='__main__':main()
