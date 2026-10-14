#!/usr/bin/env python3
"""Publish immutable client assets with retries/digest readback, then remove only verified build outputs."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request

ROOT=Path(__file__).resolve().parents[2]
CHANNEL=Path(__file__).resolve().parent
GH=shutil.which('gh') or '/opt/homebrew/bin/gh'


def gh(*args, optional=False):
    result=subprocess.run([GH,*args],cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if result.returncode:
        if optional:return None
        raise RuntimeError('GitHub CLI operation failed: '+result.stderr.strip())
    return result.stdout


def api(repository,tag):
    output=gh('api',f'repos/{repository}/releases/tags/{tag}',optional=True)
    if output:return json.loads(output)
    # A newly created draft can be listed by its owner while the tag endpoint
    # still returns 404. Do not create a duplicate or lose upload recovery.
    for page in range(1,101):
        items=json.loads(gh('api',f'repos/{repository}/releases?per_page=100&page={page}'))
        if not isinstance(items,list):raise ValueError('Unexpected releases API response')
        found=next((release for release in items if release.get('tag_name')==tag),None)
        if found is not None:
            release=json.loads(gh('api',f'repos/{repository}/releases/{found["id"]}'))
            if release.get('tag_name')!=tag:raise ValueError('Release tag readback differs')
            return release
        if len(items)<100:return None
    raise RuntimeError('Release listing did not reach its end')


def base_snapshot(game):
    from delta import validate_snapshot
    url=game['hotUpdateBaseUrl']+'delta/latest/avg-plus-content.json'
    with urllib.request.urlopen(url,timeout=30)as response:data=response.read(2*1024*1024+1)
    if len(data)>2*1024*1024:raise ValueError('Content index too large')
    return validate_snapshot(json.loads(data))


def next_version(game):
    from delta import key
    versions=[game['hotUpdateVersion']]
    for page in range(1,101):
        items=json.loads(gh('api',f'repos/{game["githubRepository"]}/releases?per_page=100&page={page}'))
        for release in items:
            match=re.fullmatch(r'avg-plus-android-(\d+\.\d+\.\d+\.\d+)',release['tag_name'])
            if match:versions.append(match[1])
        if len(items)<100:break
    newest=max(versions,key=key);parts=list(key(newest))
    # The configured unpublished bridge is the first allocation; later versions advance.
    if newest==game['hotUpdateVersion']and api(game['githubRepository'],'avg-plus-android-'+newest)is None:return newest
    parts[-1]+=1;return '.'.join(map(str,parts))


def wait_pages(game,version,kind,archive_sha):
    url=game['hotUpdateBaseUrl'];deadline=time.monotonic()+900
    while time.monotonic()<deadline:
        try:
            if kind=='bridge':
                with urllib.request.urlopen(url+'versions/'+version+'/avg-plus-project.manifest?t='+str(time.time_ns()),timeout=20)as response:data=json.load(response)
                if data['version']==version and data['assets']['avg-plus-assets.zip']['md5']==archive_sha:return
            else:
                with urllib.request.urlopen(url+'delta/latest/index.json?t='+str(time.time_ns()),timeout=20)as response:data=json.load(response)
                if any(p['version']==version and p['archive']['sha256']==archive_sha for p in data['updates']):return
        except (OSError,ValueError,KeyError):pass
        time.sleep(10)
    raise RuntimeError('Pages is not yet verified; published release retained, local build retained for retry')


def download_digest(url,expected_bytes):
    digest=hashlib.sha256();count=0
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'AVG-Plus-Publisher'}),timeout=60)as response:
        while True:
            block=response.read(1024*1024)
            if not block:break
            count+=len(block)
            if count>expected_bytes:raise ValueError('Public asset larger than frozen file')
            digest.update(block)
    if count!=expected_bytes:raise ValueError('Public asset incomplete')
    return digest.hexdigest()


def clean_build(record,game):
    """No template, configuration, documentation, source, or tracked file is eligible."""
    stage=Path(record['stage']).resolve()
    expected=(ROOT/'migration/work'/record['candidate']).resolve()
    if stage!=expected or not re.fullmatch(r'avg-plus-android-\d{8}T\d{12}Z',stage.name)or not(stage/'build-config.json').is_file():
        raise ValueError('Not a known isolated build output')
    tracked=subprocess.check_output(['git','ls-files','--cached','-z','--',str(stage.relative_to(ROOT))],cwd=ROOT)
    if tracked:raise ValueError('Refusing cleanup containing tracked files')
    delivery=CHANNEL/'avg_plus'
    removed=[]
    for apk in record.get('apk',[])if isinstance(record.get('apk'),list)else []:
        path=delivery/Path(apk['path']).name
        if path.is_file()and hashlib.sha256(path.read_bytes()).hexdigest()==apk['sha256']:
            path.unlink();removed.append(path.relative_to(ROOT).as_posix())
    hot=delivery/'hot-update';payload_record=hot/'payload-record.json'
    if payload_record.is_file():
        local=json.loads(payload_record.read_text())
        if local.get('version')==game['hotUpdateVersion']and local.get('sha256')==record['hotUpdate']['sha256']:
            allowed={'avg-plus-assets.zip','avg-plus-project.manifest','avg-plus-version.manifest','payload-record.json','delta'}
            if any(p.name not in allowed for p in hot.iterdir()):raise ValueError('Unknown file in output; retained')
            if subprocess.check_output(['git','ls-files','--cached','-z','--',str(hot.relative_to(ROOT))],cwd=ROOT):raise ValueError('Tracked delivery retained')
            shutil.rmtree(hot);removed.append(hot.relative_to(ROOT).as_posix())
    build_record=delivery/'build-record.json'
    if build_record.is_file()and json.loads(build_record.read_text()).get('candidate')==record['candidate']:
        build_record.unlink();removed.append(build_record.relative_to(ROOT).as_posix())
    if delivery.exists()and not any(delivery.iterdir()):delivery.rmdir()
    shutil.rmtree(stage);removed.append(stage.relative_to(ROOT).as_posix())
    return removed


def publish(record_path, game, keep_output=False):
    from delta import validate_delta
    from pages import validate_payload
    record_path=Path(record_path);record=json.loads(record_path.read_text())
    if record.get('sourceUnchanged')is not True or record.get('export')!='passed':raise ValueError('Frozen source/export verification missing')
    if gh('auth','status',optional=True)is None:raise RuntimeError('GitHub CLI requires its one-time account authorization')
    repository=game['githubRepository'];version=record['hotUpdate']['version'];tag=record['hotUpdate']['tag']
    if repository!='wujiankai8864515/little-steps-cocos'or not re.fullmatch(r'avg-plus-android-\d+\.\d+\.\d+\.\d+',tag):raise ValueError('Unexpected publication destination')
    stage=Path(record['stage']);hot=stage/'hot-update';delta=hot/'delta';kind=record['delta']['kind']
    if kind=='delta':
        metadata=json.loads((delta/'avg-plus-delta.json').read_text());base=base_snapshot(game)
        validate_delta(metadata,(delta/'avg-plus-assets.zip').read_bytes(),base)
        paths=[delta/'avg-plus-assets.zip',delta/'avg-plus-delta.json',delta/'avg-plus-content.json']
    else:
        validate_payload(json.loads((hot/'avg-plus-project.manifest').read_text()),(hot/'avg-plus-assets.zip').read_bytes(),game['hotUpdateBaseUrl'])
        paths=[hot/'avg-plus-assets.zip',hot/'avg-plus-project.manifest',hot/'avg-plus-version.manifest',delta/'avg-plus-content.json']
    if isinstance(record.get('apk'),list):paths+=[Path(a['path'])for a in record['apk']]
    frozen={p.name:{'path':p,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in paths}
    source=record['sourceCommit']
    remote=subprocess.check_output(['git','ls-remote','origin','refs/heads/main'],cwd=ROOT,text=True).split()[0]
    if source!=remote:raise ValueError('Source commit was not read back from main')
    for name,expected in record['workingInputs'].items():
        data=subprocess.run(['git','cat-file','blob',source+':'+name],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if data.returncode or hashlib.sha256(data.stdout).hexdigest()!=expected:
            raise ValueError('Frozen input was not backed up to this source commit: '+name)
    body=stage/'release-body.txt'
    body.write_text(f"AVG Plus 安卓预览版本 {record['displayVersion']}（北京时间）。\n\n包含现有剧情与动态 Figma JSON 关卡。{'此次为必要游戏文件的增量更新，不需要重新安装 APK。'if kind=='delta'else'包含完整首装 APK 与旧客户端的更新桥接资源。'}\n\n源码：{source}\n"+
        '\n'.join(f"- {name}: {data['bytes']} bytes, SHA-256 {data['sha256']}"for name,data in frozen.items())+'\n')
    release=api(repository,tag)
    if release is None:
        gh('release','create',tag,'--repo',repository,'--target',source,'--title','AVG Plus 安卓 '+record['displayVersion'],
           '--notes-file',str(body),'--prerelease','--draft')
        release=api(repository,tag)
    for name,data in frozen.items():
        for attempt in range(4):
            release=api(repository,tag);asset=next((a for a in release['assets']if a['name']==name),None)
            if asset and asset.get('state')=='uploaded' and asset['size']==data['bytes']and asset.get('digest')=='sha256:'+data['sha256']:break
            if asset:
                if not release.get('draft')or asset.get('state')=='uploaded'or asset.get('size',0)>0:raise ValueError('Published asset differs; allocate a new version')
                gh('api','--method','DELETE',f'repos/{repository}/releases/assets/{asset["id"]}')
            if not release.get('draft'):raise ValueError('Published release is immutable')
            gh('release','upload',tag,str(data['path']),'--repo',repository,optional=True)
            checked=api(repository,tag)
            uploaded=next((a for a in checked['assets']if a['name']==name),None)if checked else None
            if uploaded and uploaded.get('state')=='uploaded'and uploaded['size']==data['bytes']and uploaded.get('digest')=='sha256:'+data['sha256']:break
            if attempt<3:time.sleep(2)
        else:raise RuntimeError('Upload verification failed: '+name)
    release=api(repository,tag)
    for name,data in frozen.items():
        asset=next((a for a in release['assets']if a['name']==name),None)
        if not asset or asset.get('digest')!='sha256:'+data['sha256']or asset['size']!=data['bytes']:raise ValueError('Server digest readback failed')
    if release.get('draft'):gh('release','edit',tag,'--repo',repository,'--draft=false')
    release=api(repository,tag)
    for name,data in frozen.items():
        asset=next(a for a in release['assets']if a['name']==name)
        if download_digest(asset['browser_download_url'],data['bytes'])!=data['sha256']:raise ValueError('Anonymous download digest failed')
    gh('workflow','run','avg-plus-pages.yml','--repo',repository,'--ref','main')
    archive_sha=frozen['avg-plus-assets.zip']['sha256']
    print('Release downloads verified; waiting for the Pages resource endpoint…',flush=True)
    wait_pages(game,version,kind,archive_sha)
    result={'item':'AVG.PUBLISH.06','version':version,'displayVersion':record['displayVersion'],'kind':kind,
            'sourceCommit':source,'releaseUrl':release['html_url'],'assets':[{'name':a['name'],'bytes':a['size'],'digest':a.get('digest'),'url':a['browser_download_url']}for a in release['assets']],
            'serverDigestReadback':True,'anonymousFullDownloads':True,'pages':'live immutable endpoint and version/hash verified',
            'cleanup':[]}
    # Retain only compact verification documentation, never raw logs or a local APK backup.
    result_path=ROOT/'migration/reviews/avg_plus'/('publication-'+version+'.json')
    result_path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    if not keep_output:
        cleanup_game={**game,'hotUpdateVersion':version};result['cleanup']=clean_build(record,cleanup_game)
        result_path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--record',required=True,type=Path)
    parser.add_argument('--keep-output',action='store_true');args=parser.parse_args()
    game=json.loads((CHANNEL/'config.json').read_text())['games']['avg_plus']
    print(json.dumps(publish(args.record,game,args.keep_output),ensure_ascii=False,indent=2))
