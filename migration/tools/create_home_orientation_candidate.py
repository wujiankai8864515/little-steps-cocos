#!/usr/bin/env python3
"""Freeze original Home with visible read-only resize diagnostics and PNG export."""
from pathlib import Path
import argparse,subprocess,sys,json,hashlib
ROOT=Path(__file__).resolve().parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
METHOD=r'''    private installQA(){
        const app:any=this.application;let url='';
        const sample=()=>{const home=app.homePage.page,s=home.surface,display=s.display.getComponent(Sprite),frame=display.spriteFrame,camera=s.camera,c=camera.camera;const v={app:{height:app.height,physicalWidth:app.physicalWidth,viewportKey:app.viewportKey,root:[app.root.position.x,app.root.position.y],canvas:app.canvas.getComponent(UITransform).contentSize},plan:home.plan,surface:s.snapshot(),camera:{orthoHeight:camera.orthoHeight,rect:camera.rect,width:c.width,height:c.height,projection:[c.matProj.m00,c.matProj.m05,c.matProj.m12,c.matProj.m13]},display:{size:s.display.getComponent(UITransform).contentSize,frameSize:frame.originalSize,rect:frame.rect,uv:Array.from(frame.uv)},resources:app.assets.snapshot()};console.info('[LittleSteps QA] ORIENTATION '+JSON.stringify(v));return v;};
        const status=document.createElement('pre');status.style.cssText='position:fixed;bottom:28px;left:4px;max-width:98%;max-height:180px;overflow:auto;background:#fff3dc;font:10px monospace;white-space:pre-wrap;z-index:99999;display:none';document.body.appendChild(status);
        const button=(text:string,x:number,fn:()=>void)=>{const b=document.createElement('button');b.textContent=text;b.style.cssText='position:fixed;bottom:4px;left:'+x+'px;z-index:99999';b.onclick=fn;document.body.appendChild(b);};
        button('视口状态',4,()=>{status.style.display=status.style.display==='none'?'block':'none';status.textContent=JSON.stringify(sample());});
        const link=document.createElement('a');link.textContent='下载 PNG';link.download='__NAME__.png';link.style.cssText='position:fixed;right:4px;bottom:4px;z-index:99999;background:white;display:none';document.body.appendChild(link);
        button('截取 PNG',110,()=>{director.once(Director.EVENT_AFTER_DRAW,()=>{const canvas=document.getElementById('GameCanvas') as HTMLCanvasElement;canvas.toBlob(blob=>{if(!blob)return;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);link.href=url;link.style.display='block';console.info('[LittleSteps QA] ORIENTATION_CAPTURE '+JSON.stringify({size:[canvas.width,canvas.height],state:sample()}));},'image/png');});});
        sample();
    }
'''
def main():
 p=argparse.ArgumentParser();p.add_argument('--name',required=True);a=p.parse_args();subprocess.run([sys.executable,str(ROOT/'migration/tools/create_candidate.py'),'--name',a.name,'--route','home','--hour','12','--freeze','--freeze-plants'],check=True)
 stage=ROOT/'migration/work'/a.name;boot=stage/'games/xiaoyu-cocos/assets/Boot.ts';text=boot.read_text();before=sha(boot);text=text.replace('Component, profiler','Component, director, Director, Sprite, UITransform, profiler');text=text.replace("this.application.start('home').catch","this.application.start('home').then(()=>this.installQA()).catch");at=text.rfind('}');text=text[:at]+METHOD.replace('__NAME__',a.name)+text[at:];boot.write_text(text)
 m=ROOT/'migration/records/candidates'/(a.name+'.json');v=json.loads(m.read_text());v['overrides'].append({'file':'assets/Boot.ts','sourceSHA256':before,'fixtureSHA256':sha(boot),'purpose':'Visible read-only viewport/camera/surface diagnostics and PNG export; real live window resize remains unchanged'})
 v['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()];v['snapshotSHA256']=hashlib.sha256(json.dumps(v['files'],sort_keys=True).encode()).hexdigest();m.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n');print(stage)
if __name__=='__main__':main()
