import { Color, Graphics, Material, Node, Sprite, sys, UITransform, Vec3, Vec4 } from 'cc';
import { ArtSpec, GameAssets } from './Assets';
import { core, meshSprite, Scope } from './Engine';
import { FlowerBouquet, FlowerRecord, FlowerStore, flowerClamp as clamp, flowerSmooth as smooth } from './FlowerLife';
import { FlowerHeadMesh, FlowerPose, flowerNormal, flowerVirtualSun, projectFlowerHead } from './FlowerPose';
import { HomeClock } from './HomeClock';
import { HomeLighting } from './HomeLighting';
import { HomeShadows } from './HomeShadows';
import { nodeAt, picture } from './Visual';
const VASE='res://home/flowers/assets/empty_vase_candidate.png',SHEET='res://home/flowers/assets/daisy_heads_candidate.png',LEAF='res://home/flowers/assets/daisy_leaf_candidate.png';
const RATIO=100/(958*320/1138),ROOT=[0,-79];
type RenderStem={pose:FlowerPose;stemRoot:Node;headRoot:Node;graphics:Graphics;leaves:Array<ReturnType<typeof picture>>;joints:Node[];heads:Array<{node:Node;mesh:FlowerHeadMesh;sprite:any}>;material:Material};
export class HomeFlowers {
    readonly root:Node;readonly headsRoot:Node;readonly frontRoot:Node;readonly marksRoot:Node;readonly bouquet:FlowerBouquet;
    readonly layers:Array<{node:Node;z:number;order:number}>;
    private stems=new Map<number,RenderStem>();private vase:ReturnType<typeof picture>;private leafMaterial:Material=null;private mark:Graphics;
    private daylight=true;private sun=[-480,-46];private dayProgress=0;private sleepTime=0;private markAge=-1;private markOwner=-1;private markScale=.82;private markSerial=0;
    private frameBounds=new Map<number,number[]>();
    constructor(private room:Node,private table:Node,private assets:GameAssets,private scope:Scope,private lighting:HomeLighting,shadows:HomeShadows,private clock:HomeClock){
        this.root=nodeAt(room,'PersistentVaseFlowers');this.headsRoot=nodeAt(room,'BouquetHeads');this.frontRoot=nodeAt(room,'CeramicVaseFront');this.marksRoot=nodeAt(room,'BouquetSleepMark');
        this.layers=[{node:this.root,z:23,order:1100},{node:this.headsRoot,z:24,order:1101},{node:this.frontRoot,z:25,order:1102},{node:this.marksRoot,z:27,order:1103}];
        const p={centered:false,position:[-160*RATIO,-1182*389/1382*RATIO],scale:[RATIO,RATIO]};
        this.vase=picture(this.root,assets,scope,VASE,'CeramicVaseBack',p);this.receiver(this.vase.sprite,this.vase.spec,false);
        const front=picture(this.frontRoot,assets,scope,VASE,'CeramicVaseFrontLip',p);this.receiver(front.sprite,front.spec,false,.025,435*389/1382);
        shadows.add(this.vase.root,VASE,{'metadata/floor':true,'metadata/shadow_z':21,'metadata/thickness':0,'metadata/table':table,'metadata/height_factor':.48,'metadata/spans':[[87,235]],'metadata/ground':()=>this.canonical(this.root,[0,0],room)[1]});
        this.mark=this.marksRoot.addComponent(Graphics);
        this.bouquet=new FlowerBouquet(new FlowerStore(new core.RawJSONCheckpointStore({getItem:(k:string)=>sys.localStorage.getItem(k),setItem:(k:string,v:string)=>sys.localStorage.setItem(k,v)},65536)));
        this.bouquet.onWarning=reason=>console.warn('[LittleSteps] vase persistence '+reason);this.bouquet.isVisible=()=>this.root.activeInHierarchy;this.bouquet.onVisual=(step,snap)=>this.draw(step,snap);
        if(this.bouquet.persistenceFailed)console.warn('[LittleSteps] vase save not restored');
        this.syncTransform();this.draw(0,true);this.bouquet.flush();console.info('[LittleSteps] vase ready '+JSON.stringify(this.snapshot()));scope.own(()=>{this.clearMark();this.bouquet.flush();});
    }
    private receiver(component:Sprite|Graphics,spec:ArtSpec,small:boolean,cleanup=.025,clip=-1){const material=this.lighting.receiver(component,spec,1,[0,0,1,1],component instanceof Graphics?'flower-line':'flower');material.setProperty('flowerState',new Vec4(cleanup,clip,small?1:0,spec.size[1]));return material;}
    private canonical(node:Node,p:number[],target:Node){const world=node.getComponent(UITransform).convertToWorldSpaceAR(new Vec3(p[0],-p[1])),local=target.getComponent(UITransform).convertToNodeSpaceAR(world);return [local.x,-local.y];}
    private syncTransform(){const at=this.canonical(this.table,[174,203],this.room);for(const node of [this.root,this.headsRoot,this.frontRoot,this.marksRoot]){node.setPosition(at[0],-at[1]);node.setScale(this.table.scale);node.angle=this.table.angle;}}
    private syncClock(){const day=this.clock.position<this.clock.daySeconds;if(this.daylight!==day){this.clearMark();this.sleepTime=0;}this.daylight=day;this.dayProgress=clamp(this.clock.position/this.clock.daySeconds,0,1);this.sun=flowerVirtualSun(this.dayProgress);}
    private build(f:FlowerRecord):RenderStem {
        const stemRoot=nodeAt(this.root,'Flower_'+f.id,...ROOT as [number,number]),headRoot=nodeAt(this.headsRoot,'FlowerHead_'+f.id,...ROOT as [number,number]),pose=new FlowerPose(f),joints:Node[]=[];let parent=nodeAt(stemRoot,'StemSkeleton');
        for(let i=0;i<5;i++){parent=nodeAt(parent,'StemSegment_'+i);joints.push(parent);}
        const graphics=nodeAt(stemRoot,'RoundStemLines').addComponent(Graphics);graphics.lineJoin=Graphics.LineJoin.ROUND;graphics.lineCap=Graphics.LineCap.BUTT;this.receiver(graphics,this.assets.art(SHEET),true);
        const leaves=[0,1].map(i=>{const leaf=picture(stemRoot,this.assets,this.scope,LEAF,'SpringLeaf_'+i,{centered:false});leaf.child.setPosition(leaf.spec.content[0]-226,-leaf.spec.content[1]+113);if(!this.leafMaterial)this.leafMaterial=this.receiver(leaf.sprite,leaf.spec,true,.035);else leaf.sprite.customMaterial=this.leafMaterial;return leaf;});
        let material:Material=null;const spec=this.assets.art(SHEET),heads=[0,1].map(i=>{const node=nodeAt(headRoot,i?'DayNightHeadBlend':'DayNightHead'),mesh=new FlowerHeadMesh(spec.content);mesh.publish(4,0,0,0);const sprite=node.addComponent(meshSprite());sprite.configure(mesh,spec.size,spec.content);sprite.spriteFrame=this.assets.frame(SHEET,this.scope);sprite.sizeMode=Sprite.SizeMode.CUSTOM;if(!material)material=this.receiver(sprite,spec,true);else sprite.customMaterial=material;return {node,mesh,sprite};});
        return {pose,stemRoot,headRoot,graphics,leaves,joints,heads,material};
    }
    private draw(step:number,snap:boolean){this.syncTransform();this.syncClock();const model=this.bouquet.model;
        for(const f of model.flowers){let r=this.stems.get(f.id);if(!r){r=this.build(f);this.stems.set(f.id,r);}r.pose.pose(model.phaseFor(f),this.bouquet.visualTime,step,this.daylight,[this.sun[0],this.sun[1]-ROOT[1]],snap);const pose=r.pose,g=r.graphics;g.clear();
            for(const style of [[3.8,.2,.22,.075],[1.8,.42,.48,.13]]){g.lineWidth=style[0];g.strokeColor=new Color(style[1]*255,style[2]*255,style[3]*255,255);pose.points.forEach((p,i)=>i?g.lineTo(p[0],-p[1]):g.moveTo(p[0],-p[1]));g.stroke();}
            const segment=f.height*model.phaseFor(f).growth/5;r.joints.forEach((joint,i)=>{joint.setPosition(i?0:f.root_x,i?segment:0);joint.angle=-pose.angles[i]*180/Math.PI;});
            r.leaves.forEach((leaf,i)=>{const p=pose.leaves[i];leaf.root.setPosition(p.at[0],-p.at[1]);leaf.root.angle=-p.angle*180/Math.PI;leaf.root.setScale(p.mirror?-p.scale:p.scale,p.scale,1);leaf.root.active=p.visible;});
            const head=pose.head;r.heads.forEach((h,i)=>{h.node.setPosition(head.at[0],-head.at[1]);h.node.setScale(head.scale,head.scale,1);h.node.angle=-head.angle*180/Math.PI;h.mesh.publish(i?head.nextFrame:head.frame,head.yaw,head.pitch,pose.sleep);h.sprite.color=new Color(255,255,255,(i?head.blend:1-head.blend)*255);h.sprite.geometryChanged();});
            const normal=flowerNormal(head.yaw,head.pitch,head.angle-this.root.angle*Math.PI/180);r.material.setProperty('plantNormal',new Vec4(normal[0],normal[1],normal[2],0));
        }
        for(const [id,r] of this.stems)if(!model.flowers.some(f=>f.id===id)){r.stemRoot.destroy();r.headRoot.destroy();this.stems.delete(id);}
        this.updateMark(step);
    }
    private clearMark(){this.markAge=-1;this.mark?.clear();}
    private updateMark(delta:number){if(this.markAge>=0){this.markAge+=delta;if(this.markAge>=.82)this.markAge=-1;}if(this.daylight||!this.bouquet.active){this.clearMark();this.sleepTime=0;return;}this.sleepTime+=Math.max(0,delta);
        if(this.sleepTime>=4.8&&this.markAge<0){const eligible=Array.from(this.stems.values()).filter(r=>r.pose.sleep>.96);if(eligible.length){const r=eligible[this.markSerial%eligible.length];this.markOwner=r.pose.record.id;this.markScale=clamp(r.pose.record.head_size/42,.74,.9);this.markAge=0;this.markSerial++;this.sleepTime=0;}}
        const g=this.mark;g.clear();if(this.markAge<0)return;const r=this.stems.get(this.markOwner);if(!r)return;const tip=r.pose.points[5],at=[tip[0]+ROOT[0]+23,tip[1]+ROOT[1]-25],t=clamp(this.markAge/.82,0,1),scale=this.markScale;
        g.lineWidth=2.1*scale;g.strokeColor=new Color(.79*255,.71*255,.48*255,.6*(1-smooth(.12,1,t))*255);for(const glyph of [[[-8,-8],[0,-8],[-8,0],[0,0]],[[7,-15],[15,-15],[7,-7],[15,-7]]]){glyph.forEach((p,i)=>{const x=at[0]+(p[0]+3*t)*scale,y=at[1]+(p[1]-9*t)*scale;i?g.lineTo(x,-y):g.moveTo(x,-y);});g.stroke();}
    }
    setActive(value:boolean){if(!value)this.clearMark();this.bouquet.setActive(value);}
    syncActiveElapsed(total:number){this.syncTransform();this.bouquet.syncActiveElapsed(total);}
    private headBounds(frame:number){let rect=this.frameBounds.get(frame);if(!rect){const x=frame%4*256,y=Math.floor(frame/4)*256,raw=this.assets.alphaBounds(SHEET,[x,y,256,256]);rect=[raw[0]-x,raw[1]-y,raw[2],raw[3]];this.frameBounds.set(frame,rect);}return rect;}
    visualBoundsInTable(){let points:number[][]=[];const corners=(r:number[])=>[[r[0],r[1]],[r[0]+r[2],r[1]],[r[0]+r[2],r[1]+r[3]],[r[0],r[1]+r[3]]];
        for(const p of corners([25,82,270,252]))points.push(this.canonical(this.vase.root,p,this.table));
        for(const r of this.stems.values()){let local=r.pose.points.map(p=>p.slice());let x=Math.min(...local.map(p=>p[0]))-2,y=Math.min(...local.map(p=>p[1]))-2,w=Math.max(...local.map(p=>p[0]))+2-x,h=Math.max(...local.map(p=>p[1]))+2-y;points.push(...corners([x,y,w,h]).map(p=>this.canonical(r.stemRoot,p,this.table)));
            for(const leaf of r.leaves)if(leaf.root.active){const rect=leaf.spec.opaque;points.push(...corners([rect[0]-226,rect[1]-113,rect[2],rect[3]]).map(p=>this.canonical(leaf.root,p,this.table)));}
            r.heads.forEach((head,i)=>{const p=r.pose.head;if((i?p.blend:1-p.blend)<=.005)return;const rect=this.headBounds(i?p.nextFrame:p.frame);points.push(...corners(rect).concat([[rect[0]+rect[2]/2,rect[1]+rect[3]/2]]).map(q=>this.canonical(head.node,projectFlowerHead(q,p.yaw,p.pitch,r.pose.sleep),this.table)));});
        }const x=Math.min(...points.map(p=>p[0])),y=Math.min(...points.map(p=>p[1]));return [x,y,Math.max(...points.map(p=>p[0]))-x,Math.max(...points.map(p=>p[1]))-y];
    }
    snapshot(){return {model:this.bouquet.model.snapshot(),stemCount:this.stems.size,boneCount:this.stems.size*5,active:this.bouquet.active,saveFailed:this.bouquet.persistenceFailed,daylight:this.daylight,dayProgress:this.dayProgress,virtualSunLocal:this.sun,root:ROOT,visualTime:this.bouquet.visualTime,updatesPerSecondLimit:30,markSerial:this.markSerial,poses:Array.from(this.stems.values()).map(r=>r.pose.snapshot())};}
}
