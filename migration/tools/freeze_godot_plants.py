#!/usr/bin/env python3
"""Declare a QA-only rest-pose plant fixture in a verified Godot Web mirror.

Keep the published engine and all other pack entries byte-identical. Redirect
only HomeWorld's script remap to its current source plus a review-mode reset.
This is a modified QA reference, never an unchanged published release.
"""
import argparse
import base64
import hashlib
import json
import math
import struct
import subprocess
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT.parent/'little-steps/games/travel_woodfish/project/home/home_world.gd'
ENGINE_COMMIT='6ce3de25aa58466e14ef354703ba8d9791a417da'
ENGINE_METADATA=Path('/private/tmp/little-steps-godot-pack-exact.json')
ENGINE_BLOB='244469e9d90c3e7663ae8eab4a941d7b2b1e92b1'

def sha(value):return hashlib.sha256(value).hexdigest()

def read_pack(data):
    magic,version,major,minor,patch,flags=struct.unpack_from('<6I',data)
    if (magic,version,major,minor,patch,flags)!=(0x43504447,3,4,5,2,2):
        raise ValueError('Only the verified unencrypted Godot 4.5.2 format-3 pack is supported')
    base,directory=struct.unpack_from('<QQ',data,24)
    if base!=128 or not base<=directory<len(data):raise ValueError('Unexpected pack layout')
    pos=directory;count,=struct.unpack_from('<I',data,pos);pos+=4
    if not 0<count<=10000:raise ValueError('Invalid pack count')
    entries=[];paths=set()
    for _ in range(count):
        length,=struct.unpack_from('<I',data,pos);pos+=4
        if not 0<length<=4096:raise ValueError('Invalid pack path')
        raw_path=data[pos:pos+length];pos+=length
        path=raw_path.split(b'\0',1)[0].decode()
        if not path or path in paths or '..' in Path(path).parts:raise ValueError('Invalid or duplicate path')
        paths.add(path)
        offset,size=struct.unpack_from('<QQ',data,pos);pos+=16
        md5=data[pos:pos+16];pos+=16;entry_flags,=struct.unpack_from('<I',data,pos);pos+=4
        if entry_flags or base+offset+size>directory:raise ValueError('Unsupported or out-of-bounds pack entry')
        value=data[base+offset:base+offset+size]
        if hashlib.md5(value).digest()!=md5:raise ValueError('Pack checksum mismatch: '+path)
        entries.append({'path':path,'rawPath':raw_path,'offset':offset,'size':size,'md5':md5,'flags':entry_flags,'data':value})
    if pos!=len(data):raise ValueError('Unexpected pack trailing data')
    return base,entries

def replace_entries(data,replacements):
    base,entries=read_pack(data)
    # Keep the original body, padding and old directory for provenance. New
    # payloads and a replacement directory follow; old offsets remain valid.
    output=bytearray(data)
    for path,value in replacements.items():
        output.extend(b'\0'*(-len(output)%16));offset=len(output)-base;output.extend(value)
        entry=next((e for e in entries if e['path']==path),None)
        if entry is None:
            raw=path.encode();raw+=b'\0'*(-len(raw)%4)
            entry={'path':path,'rawPath':raw};entries.append(entry)
        entry.update(offset=offset,size=len(value),md5=hashlib.md5(value).digest(),flags=0,data=value)
    output.extend(b'\0'*(-len(output)%16));directory=len(output)
    output.extend(struct.pack('<I',len(entries)))
    for entry in entries:
        raw=entry['rawPath'];output.extend(struct.pack('<I',len(raw)));output.extend(raw)
        output.extend(struct.pack('<QQ',entry['offset'],entry['size']));output.extend(entry['md5']);output.extend(struct.pack('<I',entry['flags']))
    struct.pack_into('<Q',output,32,directory)
    result=bytes(output);_,roundtrip=read_pack(result)
    original={e['path']:e['data'] for e in read_pack(data)[1]};actual={e['path']:e['data'] for e in roundtrip}
    for path,value in original.items():
        if path not in replacements and actual[path]!=value:raise ValueError('Changed unrelated entry: '+path)
    for path,value in replacements.items():
        if actual[path]!=value:raise ValueError('Replacement mismatch: '+path)
    return result,len(original),len(roundtrip)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--name',required=True);parser.add_argument('--from-reference',required=True);parser.add_argument('--hour',required=True,type=float);parser.add_argument('--plant-time',type=float,default=0);args=parser.parse_args()
    if not math.isfinite(args.plant_time) or not 0<=args.plant_time<=60 or abs(args.plant_time*60-round(args.plant_time*60))>1e-8:parser.error('--plant-time requires 0..60 seconds in exact 1/60 steps')
    for name in [args.name,args.from_reference]:
        if not all(c.isalnum() or c in '-_' for c in name):raise ValueError('Invalid fixture name')
    if not ENGINE_METADATA.exists():
        with urllib.request.urlopen(f'https://api.github.com/repos/godotengine/godot/git/blobs/{ENGINE_BLOB}',timeout=30) as response:
            ENGINE_METADATA.write_bytes(response.read())
    metadata=json.loads(ENGINE_METADATA.read_text());engine=base64.b64decode(metadata['content'])
    git_blob=hashlib.sha1(b'blob '+str(len(engine)).encode()+b'\0'+engine).hexdigest()
    if git_blob!=metadata['sha'] or git_blob!=ENGINE_BLOB:raise ValueError('Official engine source git blob mismatch')
    subprocess.run(['python3',str(ROOT/'migration/tools/mirror_godot_reference.py'),'--name',args.name,'--hour',str(args.hour),'--from-reference',args.from_reference],check=True)
    stage=ROOT/'migration/work'/args.name;web=stage/'web';pack=web/'index.pck';original_pack=pack.read_bytes()
    source=SOURCE.read_text();point='    freeze_for_review = still\n'
    if source.count(point)!=1:raise ValueError('Review fixture source injection point changed')
    patch='''    if still :
        var review_plants : Variant = get_node ( "IndependentRoomPlants" )
        review_plants . reset_motion ( )
        review_plants . set_process ( false )
'''
    if args.plant_time:patch+=f'        for review_step : int in range ( {round(args.plant_time*60)} ) :\n            review_plants . advance ( 1.0 / 60.0 )\n'
    fixture_source=source.replace(point,point+patch)
    # HomeWorld applies the sought hour AFTER resetting the actor. Plant shadows
    # update only in RoomPlants.advance, so refresh at dt=0 after that lighting
    # update; otherwise disabling its process would preserve the previous hour.
    light_point='    update_lighting ( )\n\nfunc set_cycle_position'
    if fixture_source.count(light_point)!=1:raise ValueError('Review lighting refresh point changed')
    refresh='''    update_lighting ( )
    if still :
        var review_plants : Variant = get_node ( "IndependentRoomPlants" )
        review_plants . advance ( 0.0 )
        review_plants . wind_enabled = false
        print ( "[LittleSteps QA] Home plants frozen with current room lighting ", review_plants . debug_snapshot ( ) , " context ", get_room_lighting_context ( ) )

func set_cycle_position'''
    fixture_source=fixture_source.replace(light_point,refresh).encode()
    replacements={'home/home_world.gd.remap':b'[remap]\n\npath="res://qa/home_world.gd"\n','qa/home_world.gd':fixture_source}
    new_pack,original_count,new_count=replace_entries(original_pack,replacements);pack.write_bytes(new_pack)
    overrides=[]
    manifest=web/'resource_packs.host.json';before=manifest.read_bytes();host=json.loads(before)
    if host['packs']['core']['sha256']!=sha(original_pack):raise ValueError('Original host core SHA mismatch')
    host['packs']['core'].update(bytes=len(new_pack),sha256=sha(new_pack));manifest.write_text(json.dumps(host,ensure_ascii=False,indent=2)+'\n')
    overrides.append({'path':'resource_packs.host.json','originalSHA256':sha(before),'fixtureSHA256':sha(manifest.read_bytes()),'purpose':'Declare actual QA core pack size and SHA; preserve integrity validation'})
    index=web/'index.html';before=index.read_bytes();point='"index.pck":'+str(len(original_pack));text=before.decode()
    if text.count(point)!=1:raise ValueError('Expected index PCK size not found')
    index.write_text(text.replace(point,'"index.pck":'+str(len(new_pack))))
    overrides.append({'path':'index.html','originalSHA256':sha(before),'fixtureSHA256':sha(index.read_bytes()),'purpose':'Declare actual QA pack byte count; preserve original review-hour argument'})
    record=ROOT/'migration/records/candidates'/f'{args.name}.json';report=json.loads(record.read_text())
    report.update(kind='QA-modified Godot reference; not the unchanged published runtime',publishedMirrorBeforeQA=report['publishedFiles'],reviewSourceCommit=subprocess.check_output(['git','-C',str(ROOT.parent/'little-steps'),'rev-parse','HEAD'],text=True).strip())
    report['overrides'].extend([{'path':'index.pck','publishedSHA256':sha(original_pack),'fixtureSHA256':sha(new_pack),'originalBytes':len(original_pack),'fixtureBytes':len(new_pack),'purpose':'Only HomeWorld remap and added plain source for review-mode plant freezing','originalEntries':original_count,'fixtureEntries':new_count,'unchangedEntries':original_count-1,'remapPath':'home/home_world.gd.remap','addedScript':'qa/home_world.gd','sourceSHA256':sha(SOURCE.read_bytes()),'fixtureScriptSHA256':sha(fixture_source),'roundTripMD5AndUntouchedPayloads':'verified'},*overrides])
    report['referenceState']['plants']={'phase':args.plant_time,'steps':round(args.plant_time*60),'stepSeconds':1/60,'windAndProcess':'disabled after deterministic QA advance','browser':'pending'}
    report['referenceState']['plantShadows']='refreshed at dt=0 after set_review_hour updates lighting; must verify actual logged room hour/context'
    report['fixtureFiles']=[{'path':str(p.relative_to(web)),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(web.rglob('*')) if p.is_file()]
    report['packFormatSource']={'url':f'https://github.com/godotengine/godot/blob/{ENGINE_COMMIT}/core/io/file_access_pack.cpp','gitBlob':git_blob,'gitBlobVerified':True,'engineCommit':ENGINE_COMMIT}
    report['sameStateAcceptance']='pending actual browser and snapshot verification'
    record.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'web':str(web),'originalEntries':original_count,'fixtureEntries':new_count,'unchangedEntries':original_count-1,'fixturePackSHA256':sha(new_pack)}))

if __name__=='__main__':main()
