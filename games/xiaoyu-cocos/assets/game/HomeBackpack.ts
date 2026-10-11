import { Color, Material, Node, Sprite, UITransform, Vec3, Vec4 } from 'cc';
import { GameAssets } from './Assets';
import { meshSprite, Scope } from './Engine';
import { BackpackGeometry, BackpackPart, backpackSample } from './BackpackGeometry';
import { HomeClock } from './HomeClock';
import { HomeLighting } from './HomeLighting';
import { homeLighting } from './LightingSnapshot';
import { nodeAt } from './Visual';

const ATLAS='res://assets/round2/backpack_parts_atlas.png',MASK='res://home/interaction/alpha_masks/backpack_parts.res';
type Part={pose:BackpackPart;node:Node;sprite:any;joints:Node[];shadows:Array<{node:Node;sprite:any;material:Material}>;revision:number};
export class HomeBackpack {
    readonly geometry:BackpackGeometry;readonly layers:Array<{node:Node;z:number;order:number}>;
    private rendered:Part[]=[];private reported=false;
    constructor(private room:Node,readonly proxy:Node,private assets:GameAssets,scope:Scope,lighting:HomeLighting,private clock:HomeClock){
        this.geometry=new BackpackGeometry(assets.json('res://assets/round2/backpack_parts_contract.json'),assets.json('res://home/secondary/backpack_ribbon_profile.json'));
        const spec=assets.art(ATLAS);this.layers=[];
        for(const pose of this.geometry.parts.values()){
            const make=(parent:Node)=>{const sprite=parent.addComponent(meshSprite());sprite.configure(pose.mesh,spec.size,spec.content);sprite.spriteFrame=assets.frame(ATLAS,scope);sprite.sizeMode=Sprite.SizeMode.CUSTOM;return sprite;};
            const frame=nodeAt(room,'BackpackFrame_'+pose.key),node=nodeAt(frame,'Backpack_'+pose.key),sprite=make(node),r=pose.definition.rect;
            lighting.receiver(sprite,spec,1,[r[0]/spec.size[0],r[1]/spec.size[1],r[2]/spec.size[0],r[3]/spec.size[1]],'part');
            let parent=nodeAt(node,'AttachmentSkeleton');const joints:Node[]=[];for(let i=0;i<3;i++){parent=nodeAt(parent,'Joint'+i,0,i?pose.span/3:0);joints.push(parent);}
            const shadows=['Celestial','Lamp'].map((name,index)=>{const frame=nodeAt(room,'BackpackFrame_'+pose.key+name),node=nodeAt(frame,'Backpack_'+pose.key+name),sprite=make(node),material=new Material();material.initialize({effectAsset:assets.effect('home-part-shadow'),defines:{USE_TEXTURE:true}});sprite.customMaterial=material;scope.own(()=>material.destroy());this.layers.push({node:frame,z:-12,order:1900+this.rendered.length*2+index});return {node,sprite,material};});
            this.layers.push({node:frame,z:pose.key.indexOf('shell')>=0?-10:-11,order:1920+this.rendered.length});this.rendered.push({pose,node,sprite,joints,shadows,revision:-1});
        }
        this.advance(0);this.updateShadows();console.info('[LittleSteps] original backpack ready '+JSON.stringify(this.snapshot()));
    }
    private roomPoint(node:Node,p:number[]){const world=node.getComponent(UITransform).convertToWorldSpaceAR(new Vec3(p[0],-p[1])),at=this.room.getComponent(UITransform).convertToNodeSpaceAR(world);return [at.x,-at.y];}
    private setFrame(node:Node,part:BackpackPart,shift=[0,0]){const at=this.roomPoint(this.proxy,[0,0]),frame=node.parent;frame.setPosition(at[0]+shift[0],-at[1]-shift[1]);frame.setScale(this.proxy.scale);frame.angle=this.proxy.angle;node.setPosition(part.position[0],-part.position[1]);node.setScale(part.scale[0],part.scale[1],1);node.angle=-part.rotation*180/Math.PI;}
    advance(delta:number){this.geometry.advance(delta,this.roomPoint(this.proxy,[0,0]));for(const r of this.rendered){const p=r.pose;this.setFrame(r.node,p);r.node.active=p.visible&&this.proxy.activeInHierarchy;r.sprite.color=new Color(255,255,255,p.opacity*255);r.joints.forEach((joint,i)=>joint.angle=-p.angles[i]*180/Math.PI);if(r.revision!==p.revision){r.sprite.geometryChanged();r.shadows.forEach(s=>s.sprite.geometryChanged());r.revision=p.revision;}}
        if(!this.reported&&this.geometry.phase>=1.2){this.reported=true;console.info('[LittleSteps] original backpack motion '+JSON.stringify(this.snapshot()));}
    }
    updateShadows(){const state=homeLighting(this.clock.hour(),this.clock.lampWeight()),moon=state.moonEnergy>state.sunEnergy,dir=moon?state.moonCast:state.cast,extent=moon?1.6:state.cot,origin=this.room.worldPosition,scale=this.room.worldScale;
        for(const r of this.rendered){const at=this.roomPoint(r.node,[0,0]),lamp=[at[0]-465,at[1]-468],n=Math.hypot(...lamp),lampDir=n?lamp.map(v=>v/n):[0,0],shifts=[dir.map(v=>v*Math.min(extent,2.4)*16),lampDir.map(v=>v*16*1.1)],strengths=[Math.max(state.sunEnergy,state.moonEnergy)*.28,state.lampEnergy/.78*.24];
            r.shadows.forEach((pass,i)=>{pass.node.active=this.geometry.mode==='hanging'&&r.node.activeInHierarchy&&strengths[i]>.001;this.setFrame(pass.node,r.pose,shifts[i]);pass.sprite.color=new Color(255,255,255,r.pose.opacity*255);pass.material.setProperty('roomOrigin',new Vec4(origin.x,origin.y,scale.x,scale.y));pass.material.setProperty('castState',new Vec4(dir[0],dir[1],0,0));pass.material.setProperty('sunVectorState',new Vec4(0,0,0,extent));pass.material.setProperty('partShadowState',new Vec4(strengths[i],0,i,0));});
        }
    }
    hit(world:number[]){if(!world.every(Number.isFinite))return false;for(const r of this.rendered){if(!r.node.activeInHierarchy)continue;const p=r.node.getComponent(UITransform).convertToNodeSpaceAR(new Vec3(world[0],world[1])),uv=backpackSample(r.pose.mesh.vertices,r.pose.mesh.source,r.pose.mesh.indices,[p.x,-p.y],true);if(uv&&this.assets.bitmapContains(MASK,Math.floor(uv[0]),Math.floor(uv[1])))return true;}return false;}
    reset(){this.geometry.reset(this.roomPoint(this.proxy,[0,0]));this.advance(0);this.updateShadows();}
    snapshot(){return {...this.geometry.snapshot(),proxy:this.roomPoint(this.proxy,[0,0]),shader:'home-part',shadowPasses:this.rendered.length*2,limits:'Hanging runtime and original morph geometry; approved worn raster/floor projections, prop input and travel flows pending'};}
}
