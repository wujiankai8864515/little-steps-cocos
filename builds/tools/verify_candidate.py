#!/usr/bin/env python3
"""Audit frozen source after Creator import, without accepting runtime drift."""
import argparse,hashlib,json,stat,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def sha(v):return hashlib.sha256(v).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--name',required=True);p.add_argument('--output',required=True);args=p.parse_args()
    report=json.loads((ROOT/'builds/records/candidates'/f'{args.name}.json').read_text());stage=ROOT/'builds/work'/args.name
    assert sha(json.dumps(report['files'],sort_keys=True).encode())==report['snapshotSHA256'],'Frozen manifest changed'
    changes=[];mismatches=[]
    for entry in report['files']:
        at=stage/entry['path'];source=ROOT/entry['path']
        if not at.is_file():mismatches.append({'path':entry['path'],'reason':'missing'});continue
        link=str(at.readlink()) if at.is_symlink() else None
        if link!=entry['symlink']:mismatches.append({'path':entry['path'],'reason':'link_changed'})
        if sha(at.read_bytes())==entry['sha256']:continue
        if not at.name.endswith('.meta') or not source.is_file() or sha(source.read_bytes())!=entry['sha256']:
            mismatches.append({'path':entry['path'],'reason':'frozen_payload_changed','actualSHA256':sha(at.read_bytes())});continue
        before=json.loads(source.read_text());after=json.loads(at.read_text());keys=sorted(k for k in set(before)|set(after) if before.get(k)!=after.get(k))
        if not set(keys)<=set(['files','ver']):mismatches.append({'path':entry['path'],'reason':'unexpected_metadata_change','fields':keys})
        else:changes.append({'path':entry['path'],'fields':keys})
    plugin=ROOT/'games/xiaoyu-cocos/assets/plugins/travel-core.js';target=plugin.resolve();metadata=json.loads(plugin.with_suffix('.js.meta').read_text())
    assert plugin.is_symlink() and stat.S_IMODE(target.stat().st_mode)==0o444 and stat.S_IMODE(target.parent.stat().st_mode)==0o555
    assert all(metadata['userData'].get(k) for k in ['isPlugin','loadPluginInWeb','loadPluginInMiniGame'])
    assert metadata['userData'].get('loadPluginInEditor') is False and metadata['userData'].get('loadPluginInNative') is False
    assert metadata['userData'].get('executionScope')=='global'
    baseline=json.loads((ROOT/'builds/records/M00-editor-baseline.json').read_text());unchanged=[]
    for entry in baseline['files']:
        if entry['path'].endswith('/Boot.ts'):continue
        assert sha((ROOT/entry['path']).read_bytes())==entry['sha256'],entry['path'];unchanged.append(entry['path'])
    boot='games/xiaoyu-cocos/assets/Boot.ts';previous=subprocess.check_output(['git','show',report['sourceCommit']+':'+boot],cwd=ROOT);assert sha(previous)==sha((ROOT/boot).read_bytes())
    result={'schema':1,'candidate':args.name,'sourceCommit':report['sourceCommit'],'sourceDirtyAtFreeze':report['sourceDirty'],'fileCount':len(report['files']),'metadataChanges':changes,'runtimeMismatches':mismatches,'plugin':{'link':str(plugin.readlink()),'sha256':sha(target.read_bytes()),'targetMode':oct(stat.S_IMODE(target.stat().st_mode)),'directoryMode':oct(stat.S_IMODE(target.parent.stat().st_mode))},'userBaseline':{'unchanged':unchanged,'bootChangedThisItem':False,'bootUUID':baseline['boot_uuid'],'sceneUUID':baseline['scene_uuid']}}
    output=ROOT/args.output;output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'candidate':args.name,'files':len(report['files']),'metadataChanges':len(changes),'mismatches':mismatches}));assert not mismatches
if __name__=='__main__':main()
