#!/usr/bin/env python3
"""Compile pinned original PCG C++ arithmetic to produce independent vectors."""
import base64,hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
PINS={'pcg.h':'0faab73e6409ef94b3cde25ae606fd8e764a7ef0','pcg.cpp':'914a353874d79802ed6ce024f28e77e5968bc85c'}
def main():
    stage=ROOT/'builds/work/pcg-native-reference';stage.mkdir(exist_ok=True);sources=[]
    for name,blob in PINS.items():
        metadata=json.loads((ROOT/'builds/work'/f'godot-4.5.2-{name}.api.json').read_text());raw=base64.b64decode(metadata['content']);assert metadata['sha']==blob==hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
        text=raw.decode();text=text.replace('"core/typedefs.h"','<stdint.h>') if name.endswith('.h') else text
        (stage/name).write_text(text);sources.append({'path':'thirdparty/misc/'+name,'gitBlob':blob,'sha256':hashlib.sha256(raw).hexdigest(),'adapter':'header core/typedefs.h replaced with system stdint.h only' if name.endswith('.h') else 'original function bytes unchanged'})
    harness='''#include "pcg.h"
#include <stdio.h>
int main(){
uint64_t seeds[]={0,1,2,7,31,42,65536,2147483646,4294967295ULL,4294967296ULL,9007199254740991ULL};
uint64_t bounds[]={1,2,8,13,2147483649ULL,4294967295ULL,4294967296ULL};
printf("[");
for(int s=0;s<11;s++){
pcg32_random_t rng;pcg32_srandom_r(&rng,seeds[s],PCG_DEFAULT_INC_64);
printf("%s{\\"seed\\":%llu,\\"raw\\":[",s?",":"",(unsigned long long)seeds[s]);
for(int i=0;i<128;i++)printf("%s%u",i?",":"",pcg32_random_r(&rng));
pcg32_srandom_r(&rng,seeds[s],PCG_DEFAULT_INC_64);
printf("],\\"mixedBounds\\":[");
for(int i=0;i<128;i++){
uint64_t bound=bounds[i%7];uint32_t value=bound==4294967296ULL?pcg32_random_r(&rng):pcg32_boundedrand_r(&rng,(uint32_t)bound);
printf("%s%u",i?",":"",value);
}printf("]}");
}printf("]\\n");return0;
}'''.replace('return0','return 0')
    (stage/'oracle.cpp').write_text(harness)
    subprocess.run(['/usr/bin/clang++','-std=c++11',str(stage/'oracle.cpp'),str(stage/'pcg.cpp'),'-o',str(stage/'oracle')],check=True,timeout=30)
    result=json.loads(subprocess.check_output([str(stage/'oracle')],text=True,timeout=10));assert len(result)==11
    path=ROOT/'engines/travel-core/test/fixtures/pcg-godot-4.5.2.json';path.parent.mkdir(exist_ok=True);path.write_text(json.dumps({'source':sources,'scope':'Pinned native PCG uint64 compiler oracle, not native Godot UI/device acceptance','bounds':[1,2,8,13,2147483649,4294967295,4294967296],'vectors':result},indent=2)+'\n');print(json.dumps({'vectors':11,'draws':2816,'fixture':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}))
if __name__=='__main__':main()
