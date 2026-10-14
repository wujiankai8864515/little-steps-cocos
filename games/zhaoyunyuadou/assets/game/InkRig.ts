import * as cc from 'cc';
import { ArtStore } from './ArtStore';
import { attachmentAt, boneMatrices, duration, meshVertices, regionVertices, setupOffset, slotRGBA } from './InkRigMath';

export class InkRig {
    private slots: {node:cc.Node;sprite:any;attachment:string|null;mesh:any}[]=[];
    private skin:any; private skinName='1';private boneNames=new Map<string,number>(); private animation:any; private length=1; time=0;playbackRate=1;
    private MeshSprite:any; private loop=true;private completed=false;private onComplete:(()=>void)|undefined; name:string;
    constructor(public root:cc.Node,public art:ArtStore,public source:string,public data:any,name:string,referenceOrigin=false) {
        this.MeshSprite=(globalThis as any).LittleStepsCore.registerCocos(cc);
        this.skin={};for(const key of Object.keys(data.skins.default||{}))this.skin[key]={...data.skins.default[key],...(data.skins['1']?.[key]||{})};
        for(const key of Object.keys(data.skins['1']||{}))if(!this.skin[key])this.skin[key]=data.skins['1'][key];
        data.bones.forEach((b:any,i:number)=>this.boneNames.set(b.name,i));
        const offset=referenceOrigin?setupOffset(data):[0,0];
        for(const slot of data.slots){const node=new cc.Node(slot.name);node.layer=root.layer;root.addChild(node);node.setPosition(offset[0],-offset[1]);node.addComponent(cc.UITransform).setContentSize(1,1);const sprite=node.addComponent(this.MeshSprite);this.slots.push({node,sprite,attachment:null,mesh:null});}
        this.play(name);this.pose(0);
    }
    play(name:string,loop=true,onComplete?:()=>void){this.name=name;this.animation=this.data.animations[name]||this.data.animations[Object.keys(this.data.animations)[0]];this.length=duration(this.animation);this.time=0;this.loop=loop;this.completed=false;this.onComplete=onComplete;}
    useSkin(name:string){this.skinName=name;const base=this.data.skins.default||{},selected=this.data.skins[name]||{};this.skin={};for(const key of Array.from(new Set(Object.keys(base).concat(Object.keys(selected)))))this.skin[key]={...(base[key]||{}),...(selected[key]||{})};for(const slot of this.slots)slot.attachment=null;this.pose(this.time);}
    advance(dt:number){
        if(this.completed)return;
        const next=this.time+dt*this.playbackRate;
        if(this.loop){this.time=next%this.length;this.pose(this.time);return;}
        this.time=Math.min(next,this.length);this.pose(this.time);
        if(next>=this.length){this.completed=true;const callback=this.onComplete;this.onComplete=undefined;callback?.();}
    }
    pose(t:number){
        if(!cc.isValid(this.root,true))return;const matrices=boneMatrices(this.data,this.animation,t);
        for(let i=0;i<this.slots.length;i++){
            const reference=this.data.slots[i],slot=this.slots[i];let name=attachmentAt(reference,this.animation,t),attachment=name?this.skin[reference.name]?.[name]:null;
            if(!attachment){slot.node.active=false;continue;}slot.node.active=true;
            const color=slotRGBA(reference,this.animation,t);slot.sprite.color=new cc.Color(color[0],color[1],color[2],color[3]);
            const region=attachment.path||attachment.name||name,frame=this.art.actorFrame(this.source,region);if(!frame){slot.node.active=false;continue;}
            const mesh=attachment.type==='mesh',bone=this.boneNames.get(reference.bone)!;
            if(slot.attachment!==name){
                slot.attachment=name;const uv=mesh?attachment.uvs:[0,1,1,1,0,0,1,0],mapped=new Float32Array(uv.length),f=frame.uv;
                // The source atlas packs 90 degrees counterclockwise; Cocos'
                // rotated-frame convention is clockwise. Preserve original UVs.
                const rotated=this.art.art.actors[this.source].regions[region]?.rotate==='true';
                for(let j=0;j<uv.length;j+=2){const x=rotated?1-uv[j]:uv[j],y=rotated?1-uv[j+1]:uv[j+1];mapped[j]=(f[4]+(f[6]-f[4])*x)*(1-y)+(f[0]+(f[2]-f[0])*x)*y;mapped[j+1]=(f[5]+(f[7]-f[5])*x)*(1-y)+(f[1]+(f[3]-f[1])*x)*y;}
                slot.mesh={source:new Float32Array(uv),vertices:new Float32Array(uv.length),indices:new Uint16Array(mesh?attachment.triangles:[0,1,2,1,3,2]),vertexUV:mapped};
                slot.sprite.spriteFrame=frame;slot.sprite.configure(slot.mesh,[1,1]);
            }
            const deform=this.animation.deform?.[this.skinName]?.[reference.name]?.[name]||this.animation.deform?.default?.[reference.name]?.[name];
            slot.mesh.vertices.set(mesh?meshVertices(attachment,matrices,bone,deform,t):regionVertices(attachment,matrices[bone]));
            slot.sprite.geometryChanged();
        }
    }
    dispose(){this.root.destroy();this.slots=[];}
}
