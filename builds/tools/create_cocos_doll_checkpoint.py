#!/usr/bin/env python3
"""Declared isolated Cocos doll render checkpoint. Production Boot is untouched."""
import argparse,hashlib,json,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def sha(value):return hashlib.sha256(value).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--name',required=True);p.add_argument('--offscreen',action='store_true',help='Explicit diagnostic surface fixture; isolated surface presentation remains pending');a=p.parse_args()
    assert a.name and all(c.isalnum() or c in '-_' for c in a.name)
    subprocess.run([sys.executable,str(ROOT/'builds/tools/create_candidate.py'),'--name',a.name],check=True)
    stage=ROOT/'builds/work'/a.name;path=stage/'games/xiaoyu-cocos/assets/Boot.ts';before=path.read_bytes();s=before.decode()
    s=s.replace("import { Application } from './game/Application';",'''import { Application } from './game/Application';
import { Canvas,Sprite,UITransform } from 'cc';
import { GameAssets } from './game/Assets';
import { lifetime,renderSurfaces } from './game/Engine';
import { DollSkin } from './game/DollSkin';
import { DarkroomDoll } from './game/DarkroomDoll';
import { nodeAt,panel } from './game/Visual';''')
    point="        this.application = new Application(this.node);\n        this.application.start().catch(error => console.error('[LittleSteps] startup failed', error));"
    assert s.count(point)==1
    s=s.replace(point,'''        this.reviewDoll().catch(error=>console.error('[LittleSteps QA] doll render failed',error));''')
    point='    update(deltaTime: number) {';assert s.count(point)==1
    s=s.replace(point,'''    private async reviewDoll() {
        const scope=lifetime(),assets=new GameAssets();await assets.initialize(scope);
        await assets.acquireGroups(['darkroom'],scope);await assets.acquireEffects(['darkroom-doll'],scope);
        const size=this.node.getComponent(UITransform).contentSize,display=nodeAt(this.node,'IsolatedDollReview',-size.width/2,-size.height/2,720,1280),renderer=renderSurfaces();
        const target=await assets.acquireTransient('DollReviewSurface',renderer.estimateTarget(720,1280),()=>renderer.createTarget(720,1280,'DollReview'),texture=>texture.destroy(),scope);
        const surface=renderer.create({host:this.node.scene,displayParent:display,logicalSize:[720,1280],displayRect:[0,0,720,1280],target,name:'DollReviewSurface'},scope),room=surface.content;
        panel(room,'DeclaredReferenceBackground',[0,0,720,1280],[32/255,26/255,25/255]);
        const data='res://darkroom/assets/round3/',rig=new DollSkin(assets.json(data+'doll_source_contract.json'),assets.json(data+'doll_source_geometry.json'),(part,x,y)=>assets.bitmapContains(data+'doll_'+part+'_hit.res',x,y));
        for(let i=0;i<160;i++){
            rig.rootRotation=.035*Math.sin(i*.13);
            if(i===0)rig.applyContact('needle',rig.worldPoint([240.5,350.5]));if(i===30)rig.applyContact('slipper',rig.worldPoint([300.5,190.5]));
            if(i===55)rig.setDragging(true);if(i===112)rig.setDragging(false);if(i===100)rig.applyContact('slipper',rig.worldPoint([130.5,307.5]));
            rig.advance(i%37===0?.05:1/60,[Math.fround(Math.sin(i*.21)*1800),Math.fround(Math.cos(i*.17)*1400)]);
        }
        const doll=new DarkroomDoll(room,assets,scope,rig);doll.sync([1,.97,.91]);
        await scope.guard(surface.ready);
        const pixels=target.readPixels(),camera=this.node.getComponent(Canvas).cameraComponent,presentation=surface.display.getComponent(Sprite);
        console.info('[LittleSteps QA] isolated doll surface diagnostic '+JSON.stringify({targetSamples:pixels?[0,720*640+360,720*360+360,720*900+360].map(at=>Array.from(pixels.slice(at*4,at*4+4))):null,mainCamera:{position:camera.node.worldPosition,visibility:camera.visibility,enabled:camera.enabledInHierarchy,orthoHeight:camera.orthoHeight,priority:camera.priority},display:{layer:surface.display.layer,active:surface.display.activeInHierarchy,color:presentation.color,frameSize:[presentation.spriteFrame.width,presentation.spriteFrame.height],uv:Array.from(presentation.spriteFrame.uv)}}));
        console.info('[LittleSteps QA] isolated doll render '+JSON.stringify({doll:doll.snapshot(),surface:surface.snapshot(),resources:assets.snapshot(),tint:[1,.97,.91],background:[32,26,25]}));
    }
'''+point)
    if not a.offscreen:
        start=s.index("        const size=this.node.getComponent(UITransform).contentSize")
        end=s.index("        const data='res://darkroom/assets/round3/'",start)
        s=s[:start]+"        const size=this.node.getComponent(UITransform).contentSize,room=nodeAt(this.node,'IsolatedDollReview',-size.width/2,-size.height/2,720,1280);\n        panel(room,'DeclaredReferenceBackground',[0,0,720,1280],[32/255,26/255,25/255]);\n"+s[end:]
        start=s.index('        await scope.guard(surface.ready);')
        end=s.index("        console.info('[LittleSteps QA] isolated doll render '",start)
        s=s[:start]+s[end:]
        s=s.replace('surface:surface.snapshot(),','')
    path.write_text(s)
    record=ROOT/'builds/records/candidates'/f'{a.name}.json';report=json.loads(record.read_text());report['overrides'].append({'file':'assets/Boot.ts','sourceSHA256':sha(before),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Isolated original doll data, seven native ownership shader passes; declared160-frame APIs and fixed tint/background; no full-page/physical-input acceptance'})
    report['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f.read_bytes()),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()]
    report['snapshotSHA256']=sha(json.dumps(report['files'],sort_keys=True).encode());report['dollCheckpoint']={'isolated':True,'steps':160,'cocosTarget':'offscreen720x1280' if a.offscreen else 'main405x720','browser':'pending','wechat':'pending'}
    record.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'project':str(stage/'games/xiaoyu-cocos'),'record':str(record)}))
if __name__=='__main__':main()
