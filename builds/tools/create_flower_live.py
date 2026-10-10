#!/usr/bin/env python3
"""Observe real product time and browser KV; only the entry route/trace differs.

No clock acceleration, earned-time initialization, isolated Map, storage edit,
or renderer override. A new localhost origin keeps user saves separate.
"""
import argparse, hashlib, json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
def sha(data): return hashlib.sha256(data).hexdigest()

def main():
    p=argparse.ArgumentParser();p.add_argument('--name',required=True);args=p.parse_args()
    subprocess.run([sys.executable,str(ROOT/'builds/tools/create_candidate.py'),'--name',args.name,'--route','home','--hour','12'],check=True)
    stage=ROOT/'builds/work'/args.name;record=ROOT/'builds/records/candidates'/f'{args.name}.json';report=json.loads(record.read_text())
    path=stage/'games/xiaoyu-cocos/assets/game/HomeFlowers.ts';before=path.read_bytes();text=before.decode()
    point='    private frameBounds=new Map<number,number[]>();';assert text.count(point)==1
    text=text.replace(point,point+'''
    private reviewCount=0;private reviewSignature='';
    private reviewTrace(why:string){if(this.reviewCount++<200)console.info('[LittleSteps QA] bouquet live '+JSON.stringify({why,clockHour:this.clock.hour(),clockTotalActive:this.clock.totalActive,markAge:this.markAge,markOwner:this.markOwner,phases:this.bouquet.model.flowers.map(f=>({id:f.id,...this.bouquet.model.phaseFor(f)})),...this.snapshot()}));}
''')
    point='        this.bouquet=new FlowerBouquet(new FlowerStore(';assert text.count(point)==1
    text=text.replace(point,'        const reviewStore=new FlowerStore(')
    point='},65536)));';assert text.count(point)==1
    text=text.replace(point,'''},65536));
        const reviewSave=reviewStore.save.bind(reviewStore);
        reviewStore.save=(model,slot)=>{const saved=reviewSave(model,slot);if(this.reviewCount++<200)console.info('[LittleSteps QA] bouquet save '+JSON.stringify({saved,error:reviewStore.lastError,...model.snapshot()}));return saved;};
        this.bouquet=new FlowerBouquet(reviewStore);''')
    point='        this.updateMark(step);';assert text.count(point)==1
    text=text.replace(point,point+'''
        const young=model.flowers.filter(f=>f.id>0&&this.bouquet.model.phaseFor(f).age<9).map(f=>f.id+':'+Math.floor(this.bouquet.model.phaseFor(f).age)).join(',');
        const reviewSignature=[model.flowers.length,young,this.daylight,this.markSerial,this.markAge<0?'clear':'live'].join('|');
        if(this.reviewSignature!==reviewSignature){this.reviewSignature=reviewSignature;this.reviewTrace('visual_change');}
''')
    point='this.bouquet.setActive(value);';assert text.count(point)==1
    text=text.replace(point,point+"this.reviewTrace(value?'active':'inactive');")
    path.write_text(text)
    report['overrides'].append({'path':str(path.relative_to(stage)),'sourceSHA256':sha(before),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Bounded public save/visual/focus trace only. Real sys.localStorage, original earned-time and pose code unchanged.'})
    report['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f.read_bytes()),'symlink':str(f.readlink()) if f.is_symlink() else None} for directory in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/directory).rglob('*')) if f.is_file()]
    report['snapshotSHA256']=sha(json.dumps(report['files'],sort_keys=True).encode())
    report['flowerLive']={'clock':'Real monotonic product clock, initial hour 12; not frozen or accelerated','storage':'Real browser sys.localStorage on distinct localhost origin; no injected or edited save','scope':'Physical earned minute, eight-second growth, native lighting/day-night, reload and supported actual focus events','browser':'pending','limits':'Direct Home QA; no Godot same-time screenshot parity or WeChat device acceptance'}
    record.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'record':str(record),'traceSHA256':sha(path.read_bytes())}))
if __name__=='__main__':main()
