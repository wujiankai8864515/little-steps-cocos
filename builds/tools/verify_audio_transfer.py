#!/usr/bin/env python3
"""Recheck all six original cached audio assets and the independent C decoder."""
import hashlib
import io
import json
import subprocess
import tempfile
import wave
from pathlib import Path
from import_godot_assets import ASSETS, ROOT, SOURCE, resolve_audio, sha
from godot_binary import read_resource

def main():
    catalog=json.loads((ASSETS/'resources/source-catalog.json').read_text())['assets']
    vendor=json.loads((ROOT/'builds/tools/vendor/qoa-source.json').read_text())
    assert sha((ROOT/'builds/tools/vendor/qoa.h').read_bytes())==vendor['sha256']
    rows=[]
    with tempfile.TemporaryDirectory(prefix='little-steps-audio-') as temp:
        oracle=Path(temp)/'qoa-oracle'
        subprocess.run(['clang','-O2','-fwrapv','-Wall','-Wextra',str(ROOT/'builds/tools/qoa_oracle.c'),'-o',str(oracle)],check=True)
        for resource,spec in catalog.items():
            if spec['kind']!='audio':continue
            expected,metadata,dependencies=resolve_audio(resource)
            destination=ASSETS/'bundles'/spec['bundle']/resource.removeprefix('res://')
            assert destination.read_bytes()==expected,resource
            props=read_resource(dependencies[-1].read_bytes())['resources'][-1]['properties']
            record={'resource':resource,'sourceCache':str(dependencies[-1].relative_to(SOURCE)),'cache256':sha(dependencies[-1].read_bytes()),'destination':str(destination.relative_to(ROOT)),'destination256':sha(expected),**metadata}
            if resource.endswith('.wav'):
                encoded=Path(temp)/'effect.qoa';encoded.write_bytes(props['data'])
                result=subprocess.run([str(oracle),str(encoded)],capture_output=True,check=True)
                oracle_meta=json.loads(result.stderr)
                with wave.open(io.BytesIO(expected),'rb') as wav:
                    pcm=wav.readframes(wav.getnframes())
                    assert wav.getsampwidth()==2 and wav.getnchannels()==oracle_meta['channels'] and wav.getframerate()==oracle_meta['sampleRate'] and wav.getnframes()==oracle_meta['samples']
                assert pcm==result.stdout,resource
                record.update({'exactSamples':True,'oracle':vendor['gitBlob']})
            else:
                assert expected==props['data'],resource
                record['embeddedMP3ByteIdentity']=True
            rows.append(record)
        assert len(rows)==6
    report={'schema':1,'status':'all_six_offline_audio_transfers_verified_runtime_separate','sourceCommit':subprocess.check_output(['git','-C',str(SOURCE),'rev-parse','HEAD'],text=True).strip(),'assets':rows,'oracle':vendor,'notVerified':['actual Cocos playback','WeChat playback and lifecycle','subjective audible comparison']}
    (ROOT/'builds/records/M02-audio-decode.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'assets':len(rows),'qoaEffectsComparedSampleBySample':sum(r.get('exactSamples',False) for r in rows),'unchangedMP3':sum(r.get('embeddedMP3ByteIdentity',False) for r in rows)}))

if __name__=='__main__':main()
