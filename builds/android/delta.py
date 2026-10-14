"""Package changed game files; the complete snapshot index keeps skipped-version updates verifiable."""
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import zipfile

ARCHIVE = 'avg-plus-assets.zip'
META = 'avg-plus-content.json'


def key(version):
    if not isinstance(version,str) or not re.fullmatch(r'\d+\.\d+\.\d+\.\d+',version):
        raise ValueError('Invalid update version')
    return tuple(map(int,version.split('.')))


def safe_path(name):
    if not isinstance(name,str):raise ValueError('Invalid game resource path')
    p=PurePosixPath(name)
    if not isinstance(name,str) or str(p)!=name or p.is_absolute() or '..'in p.parts or '\\'in name \
            or len(p.parts)<2 or p.parts[0] not in ('src','assets') or 'cocos-js'in p.parts:
        raise ValueError('Invalid game resource path')
    return name


def validate_snapshot(snapshot):
    if snapshot.get('schemaVersion')!=2 or not isinstance(snapshot.get('files'),list) or not 1<=len(snapshot['files'])<=10000:
        raise ValueError('Invalid content snapshot')
    key(snapshot['version'])
    display=snapshot.get('displayVersion','')
    if not isinstance(display,str)or (display and not re.fullmatch(r'\d{4}(?:-\d{2}){5}',display)):
        raise ValueError('Invalid public version label')
    seen=set();total=0
    for file in snapshot['files']:
        name=safe_path(file['path'])
        if name in seen or not re.fullmatch(r'[a-f0-9]{64}',file.get('sha256','')) or type(file.get('bytes'))is not int or not 0<=file['bytes']<=128*1024*1024:
            raise ValueError('Invalid file hash/size or duplicate path')
        seen.add(name);total+=file['bytes']
    if total>256*1024*1024:raise ValueError('Snapshot too large')
    return snapshot


def prepare(full_output, base_snapshot=None):
    full_output=Path(full_output)
    record=json.loads((full_output/'payload-record.json').read_text())
    snapshot={'schemaVersion':2,'version':record['version'],'displayVersion':record.get('displayVersion',''),
              'nativeCompatibility':record['nativeCompatibility'],'files':record['files']}
    validate_snapshot(snapshot)
    output=full_output/'delta';output.mkdir(exist_ok=False)
    (output/META).write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+'\n')
    if base_snapshot is None:
        return {'kind':'bridge','snapshot':str(output/META),'files':len(snapshot['files'])}
    base=validate_snapshot(base_snapshot)
    if key(snapshot['version'])<=key(base['version']) or snapshot['nativeCompatibility']!=base['nativeCompatibility']:
        raise ValueError('Delta must advance the same native contract')
    old={f['path']:f for f in base['files']};new={f['path']:f for f in snapshot['files']}
    changed=[f for f in snapshot['files']if old.get(f['path'])!=f]
    removed=sorted(set(old)-set(new))
    payload=output/ARCHIVE
    with zipfile.ZipFile(full_output/ARCHIVE)as source,zipfile.ZipFile(payload,'w',zipfile.ZIP_DEFLATED,compresslevel=6)as target:
        for file in changed:
            data=source.read(file['path'])
            if len(data)!=file['bytes'] or hashlib.sha256(data).hexdigest()!=file['sha256']:raise ValueError('Frozen payload changed')
            info=zipfile.ZipInfo(file['path'],(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;target.writestr(info,data)
        # A removal-only update still has a real archive; no arbitrary chunking is used.
    padding=(-payload.stat().st_size)%32
    if padding:
        with zipfile.ZipFile(payload,'a')as archive:archive.comment=b' '*padding
    metadata={**snapshot,'baseVersion':base['version'],'changed':changed,'removed':removed,
              'archive':{'bytes':payload.stat().st_size,'sha256':hashlib.sha256(payload.read_bytes()).hexdigest()}}
    (output/'avg-plus-delta.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
    return {'kind':'delta','baseVersion':base['version'],'version':snapshot['version'],'changedFiles':len(changed),
            'removedFiles':len(removed),'uploadBytes':payload.stat().st_size,'fullZipBytes':record['zipBytes'],
            'metadata':str(output/'avg-plus-delta.json'),'archive':str(payload)}


def validate_delta(metadata,payload,base_snapshot):
    validate_snapshot(metadata);base=validate_snapshot(base_snapshot)
    if metadata.get('baseVersion')!=base['version'] or key(metadata['version'])<=key(base['version']) \
            or metadata['nativeCompatibility']!=base['nativeCompatibility']:raise ValueError('Invalid delta parent')
    asset=metadata.get('archive',{})
    if asset.get('bytes')!=len(payload)or asset.get('sha256')!=hashlib.sha256(payload).hexdigest():raise ValueError('Delta archive integrity mismatch')
    old={f['path']:f for f in base['files']};new={f['path']:f for f in metadata['files']}
    changed=[f for f in metadata['files']if old.get(f['path'])!=f];removed=sorted(set(old)-set(new))
    if metadata.get('changed')!=changed or metadata.get('removed')!=removed:raise ValueError('Delta changes do not reproduce the complete snapshot')
    with zipfile.ZipFile(io.BytesIO(payload))as archive:
        if len(archive.namelist())!=len(set(archive.namelist()))or set(archive.namelist())!={f['path']for f in changed}:raise ValueError('Unexpected delta archive members')
        for f in changed:
            info=archive.getinfo(safe_path(f['path']))
            if (info.external_attr>>16)&0o170000==0o120000:raise ValueError('Delta symlink rejected')
            if info.file_size!=f['bytes']:raise ValueError('Delta expanded size mismatch')
            data=archive.read(info)
            if hashlib.sha256(data).hexdigest()!=f['sha256']:raise ValueError('Delta file digest mismatch')
    return metadata
