import { Node, UITransform, Vec3 } from 'cc';
import { GameAssets } from './Assets';
import { Scope } from './Engine';
import { HomeFlowers } from './HomeFlowers';
import { HomeIncense } from './HomeIncense';
import { HomeShadows } from './HomeShadows';
import { XiaoyuRig } from './XiaoyuRig';
import { PropId } from './HomePropInteraction';
import { drinkBowl } from './DrinkMotion';
import { ActionMarks } from './ActionMarks';

export type RoomProp={node:Node;resource:string;p:any;spec:any;anchor:number[];footprint:number[]};
type VisualProp={item:RoomProp;home:number[];offset:number[];position:number[];scale:number[];angle:number;depth:number;restDepth:number;ground:number;lift:number;carried:boolean;frame:Node;settle:{angle:number;scale:number[]}};
const near=(a:number[],b:number[])=>Math.hypot(a[0]-b[0],a[1]-b[1])<.00001;
const corners=(r:number[])=>[[r[0],r[1]],[r[0]+r[2],r[1]],[r[0]+r[2],r[1]+r[3]],[r[0],r[1]+r[3]]];
const bounds=(points:number[][])=>{const x=Math.min(...points.map(p=>p[0])),y=Math.min(...points.map(p=>p[1]));return [x,y,Math.max(...points.map(p=>p[0]))-x,Math.max(...points.map(p=>p[1]))-y];};
const groundDepth=(y:number)=>Math.round(y<951?5+7*(y-862)/89:y<1012?12+3*(y-951)/61:15+5*(y-1012)/207);

// Real source sprites and table attachments, with canonical coordinates retained
// when the renderer moves the held artwork out of the room RenderTexture.
export class HomeProps {
    readonly marks:ActionMarks;
    layerRevision=0;
    private visuals=new Map<PropId,VisualProp>();
    private members:Array<{node:Node;index:number}>=[];
    private presented:PropId=null;
    private pickup:number[];
    private sipMarkSent=false;
    private drinkState:any=null;
    constructor(private room:Node,private assets:GameAssets,scope:Scope,private items:RoomProp[],private layers:Array<{z:number;order:number;node:Node}>,private shadows:HomeShadows,private rig:XiaoyuRig,private incense:HomeIncense,private flowers:HomeFlowers,private fishGround:()=>number[],private presentation:(id:PropId,active:boolean)=>Node,actorFrame:()=>Node=()=>room){
        for(const [name,id] of [['Doll','doll'],['Bowl','bowl'],['Altar','low_table']] as [string,PropId][]){
            const item=items.find(p=>p.node.name===name),home=item.anchor.slice(),node=item.node;
            const visual:VisualProp={item,home,offset:[home[0]-node.position.x,home[1]+node.position.y],position:[node.position.x,-node.position.y],scale:[node.scale.x,node.scale.y],angle:node.angle,depth:item.p.z_index,restDepth:item.p.z_index,ground:home[1],lift:0,carried:false,frame:room,settle:null};
            this.visuals.set(id,visual);
            shadows.bindRigid(node,{frame:()=>visual.frame,ground:()=>visual.ground,lift:()=>visual.lift,carried:()=>visual.carried,depth:()=>near(item.anchor,home)?item.p['metadata/shadow_z']:visual.restDepth-1});
        }
        shadows.bindTableFrame(this.visuals.get('low_table').item.node,()=>this.visuals.get('low_table').frame);
        this.marks=new ActionMarks(room,assets,scope,()=>rig.faceBounds(actorFrame()));
    }
    home(id:PropId){return this.visuals.get(id).home.slice();}
    private canonical(node:Node,p:number[],frame:Node){const w=node.getComponent(UITransform).convertToWorldSpaceAR(new Vec3(p[0],-p[1])),q=frame.getComponent(UITransform).convertToNodeSpaceAR(w);return [q.x,-q.y];}
    private world(at:number[]){const q=this.room.getComponent(UITransform).convertToWorldSpaceAR(new Vec3(at[0],-at[1]));return [q.x,q.y];}
    occludesFish(world:number[]){return Array.from(this.visuals.values()).some(v=>v.depth>12&&this.alphaHit(v,world));}
    private alphaHit(v:VisualProp,world:number[]){if(!v.item.node.activeInHierarchy)return false;const p=v.item.node.getComponent(UITransform).convertToNodeSpaceAR(new Vec3(world[0],world[1]));return this.assets.contains(v.item.resource,p.x,-p.y);}
    hit(at:number[]):PropId {const w=this.world(at);for(const [id,v] of Array.from(this.visuals.entries()).sort((a,b)=>b[1].depth-a[1].depth))if(this.alphaHit(v,w)&&!this.rig.coversBackpack(w,v.depth))return id;return null;}
    visualBounds(id:PropId){const v=this.visuals.get(id),uv=v.item.p['metadata/visible_uv']||[0,0,1,1],size=v.item.spec.size;let points=corners([uv[0]*size[0],uv[1]*size[1],uv[2]*size[0],uv[3]*size[1]]);
        if(id==='low_table')points=corners(bounds(points.concat(corners(this.incense.visualBoundsInTable()),corners(this.flowers.visualBoundsInTable()))));
        return bounds(points.map(p=>this.canonical(v.item.node,p,v.frame)));
    }
    focusCenter(id:PropId){const v=this.visuals.get(id),uv=v.item.p['metadata/visible_uv']||[0,0,1,1],size=v.item.spec.size;return this.canonical(v.item.node,[(uv[0]+uv[2]/2)*size[0],(uv[1]+uv[3]/2)*size[1]],v.frame);}
    setAnchor(id:PropId,at:number[],lift:number,depth:number){const v=this.visuals.get(id);v.item.anchor=at.slice();v.item.node.setPosition(at[0]-v.offset[0],-at[1]+v.offset[1]+lift);v.ground=Math.max(v.home[1],at[1]);v.lift=Math.max(0,v.ground-at[1]+lift);v.restDepth=near(at,v.home)?v.item.p.z_index:groundDepth(at[1]);if(depth!==180&&lift===0&&near(at,v.home)){v.item.node.angle=v.angle;v.item.node.setScale(v.scale[0],v.scale[1],1);}this.setDepth(v,depth);if(id==='low_table')this.syncTable();}
    private setDepth(v:VisualProp,depth:number){if(v.depth===depth)return;v.depth=depth;this.layers.find(p=>p.node===v.item.node).z=depth;this.layerRevision++;}
    validDrop(id:PropId,at:number[]){const v=this.visuals.get(id);if(near(at,v.home))return true;if(id==='low_table'?(at[1]<1050||at[1]>1232):(at[1]<815||at[1]>1140))return false;
        const occupied=[{anchor:this.fishGround(),footprint:[145,30]},...this.items.filter(p=>p!==v.item&&p.p['metadata/floor'])];
        if(occupied.some(p=>{const x=(at[0]-p.anchor[0])/(v.item.footprint[0]+p.footprint[0]+8),y=(at[1]-p.anchor[1])/(v.item.footprint[1]+p.footprint[1]+8);return x*x+y*y<1;}))return false;
        return !(at[1]<875&&at[0]>420&&at[0]<610);
    }
    private tableNodes(){return [this.incense.root,this.incense.visual,this.incense.hint,...this.flowers.layers.map(p=>p.node)];}
    private syncTable(){const v=this.visuals.get('low_table');this.incense.setPresentationFrame(v.frame===this.room?null:v.frame);this.flowers.setPresentationFrame(v.frame===this.room?null:v.frame);}
    present(id:PropId,active:boolean){const v=this.visuals.get(id);if(active){if(this.presented)return;this.presented=id;const frame=this.presentation(id,true),nodes=[v.item.node,...(id==='low_table'?this.tableNodes():[])];if(id==='low_table'){this.incense.cancel();this.incense.dismiss();}this.members=nodes.map(node=>({node,index:node.getSiblingIndex()})).sort((a,b)=>a.index-b.index);this.members.forEach(p=>p.node.setParent(frame));v.frame=frame;if(id==='low_table')this.syncTable();}
        else if(this.presented===id){this.members.forEach(p=>{p.node.setParent(this.room);p.node.setSiblingIndex(p.index);});v.frame=this.room;if(id==='low_table')this.syncTable();this.members=[];this.presented=null;this.presentation(id,false);this.layerRevision++;}}
    captureSettle(id:PropId){const v=this.visuals.get(id),n=v.item.node;v.settle={angle:n.angle,scale:[n.scale.x,n.scale.y]};}
    settleTransform(id:PropId,e:number){const v=this.visuals.get(id),s=v.settle;if(!s)return;v.item.node.angle=s.angle+(v.angle-s.angle)*e;v.item.node.setScale(s.scale[0]+(v.scale[0]-s.scale[0])*e,s.scale[1]+(v.scale[1]-s.scale[1])*e,1);if(id==='low_table')this.syncTable();}
    restore(id:PropId){const v=this.visuals.get(id);this.present(id,false);v.item.node.angle=v.angle;v.item.node.setScale(v.scale[0],v.scale[1],1);v.carried=false;this.setAnchor(id,v.home,0,v.item.p.z_index);}
    resetFish(){this.rig.root.setPosition(this.fishGround()[0]-335,-this.fishGround()[1]+336);this.rig.liftHeight=0;this.rig.resetSecondary();}
    drinkStart(){const v=this.visuals.get('bowl'),bowl=v.item.node;v.item.anchor=v.home.slice();this.pickup=[bowl.position.x,-bowl.position.y];this.sipMarkSent=false;this.drinkState={age:0,phase:'lift'};}
    drinkAdvance(age:number,delta:number){const v=this.visuals.get('bowl'),b=v.item.node,pose=drinkBowl(age);this.rig.applyDrinkPose(pose.progress,delta);b.angle=-pose.rotation*180/Math.PI;
        const mouth=this.rig.mouthContact(this.room),c=Math.cos(pose.rotation),s=Math.sin(pose.rotation),rim=[254*b.scale.x,83*b.scale.y],sip=[mouth[0]-c*rim[0]+s*rim[1],mouth[1]-s*rim[0]-c*rim[1]],rest=[v.home[0]-v.offset[0],v.home[1]-v.offset[1]];
        const at=pose.lower>0?sip.map((value,i)=>value+(rest[i]-value)*pose.lower):this.pickup.map((value,i)=>value+(sip[i]-value)*pose.pickup);
        b.setPosition(at[0],-at[1]);v.carried=true;this.setDepth(v,32);const water=b.getComponent(UITransform).convertToWorldSpaceAR(new Vec3(262,-174));this.rig.trackDrinkBowl([water.x,water.y],delta);
        if(pose.emitMark&&!this.sipMarkSent){this.sipMarkSent=true;this.marks.emit('drink',[mouth[0]+44,mouth[1]+40]);}
        const contact=this.canonical(b,[254,83],this.room);this.drinkState={age,progress:pose.progress,phase:pose.phase,mouth,rim:contact,rimGap:Math.hypot(mouth[0]-contact[0],mouth[1]-contact[1]),bowlPosition:at,rotation:pose.rotation,carried:true,sipMarkSent:this.sipMarkSent};
    }
    drinkStop(preserveFish:boolean){this.drinkState=null;this.restore('bowl');if(!preserveFish)this.resetFish();}
    clear(){this.marks.clear();}
    snapshot(){return {presented:this.presented||'',drink:this.drinkState,marks:this.marks.snapshot(),props:Array.from(this.visuals.entries()).map(([id,v])=>({id,anchor:v.item.anchor.slice(),position:[v.item.node.position.x,-v.item.node.position.y],angle:-v.item.node.angle*Math.PI/180,depth:v.depth,ground:v.ground,lift:v.lift,carried:v.carried,parent:v.item.node.parent.name,bounds:this.visualBounds(id)}))};}
}
