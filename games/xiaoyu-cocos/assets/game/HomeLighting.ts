import { Color, Graphics, Material, Node, Sprite, Vec4 } from 'cc';
import { GameAssets, ArtSpec } from './Assets';
import { Scope } from './Engine';
import { HomeClock } from './HomeClock';
import { homeLighting, dustGate } from './LightingSnapshot';
import { nodeAt } from './Visual';

export const HOME_EFFECTS=['home-receiver','home-bleed','home-bed','home-shafts','home-face','home-shadow','home-part-shadow','home-merit','home-incense','home-smoke','home-table-shadow','home-flower','home-flower-line','home-part'];
type Receiver={material:Material;kind:string;surface:number};
export class HomeLighting {
    private receivers:Receiver[]=[];
    private dust:Graphics;
    constructor(private root:Node,private assets:GameAssets,private scope:Scope,private clock:HomeClock) {}
    receiver(sprite:Sprite|Graphics,spec:ArtSpec,surface:number,visibleUV:number[],kind='receiver',eye=0,offset=[0,0]) {
        const material=this.material('home-'+kind,sprite instanceof Graphics),crop=spec.content,size=spec.size;
        material.setProperty('sourceUV',new Vec4(crop[0]/size[0],crop[1]/size[1],crop[2]/size[0],crop[3]/size[1]));
        material.setProperty('visibleUV',new Vec4(...visibleUV as [number,number,number,number]));
        material.setProperty('shared_outdoor_paint',this.assets.texture('res://assets/home_neutral.png'));
        if(kind==='bleed')material.setProperty('neutral_center',this.assets.texture('res://assets/round2/home_neutral_no_plants.png'));
        if(kind==='bed') {
            const mask=this.assets.art('res://assets/bed_occlusion_mask.png'),c=mask.content,s=mask.size;
            material.setProperty('maskRect',new Vec4(c[0]/s[0],c[1]/s[1],c[2]/s[0],c[3]/s[1]));
            material.setProperty('occlusion_alpha',this.assets.texture('res://assets/bed_occlusion_mask.png'));
        }
        if(kind==='face') {
            material.setProperty('textureSize',new Vec4(size[0],size[1],0,0));
            material.setProperty('bodyState',new Vec4(0,eye,0,0));
            material.setProperty('faceOffset',new Vec4(offset[0],offset[1],0,0));
        }
        sprite.customMaterial=material;const bound=sprite instanceof Graphics?sprite.getMaterialInstance(0):material;this.receivers.push({material:bound,kind,surface});
        return bound;
    }
    shafts() {
        const node=nodeAt(this.root,'WindowLightShafts2D',0,0,720,1280),sprite=node.addComponent(Sprite);
        // Geometry uses a source full-frame SpriteFrame; this shader emits light only.
        sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=this.assets.frame('res://assets/home_neutral.png',this.scope);
        const material=this.material('home-shafts');sprite.customMaterial=material;
        this.receivers.push({material,kind:'shafts',surface:0});
        return node;
    }
    dustNode() {const node=nodeAt(this.root,'SunlitDust');this.dust=node.addComponent(Graphics);return node;}
    private material(name:string,local=false) {const material=new Material();material.initialize({effectAsset:this.assets.effect(name),defines:{USE_TEXTURE:true,USE_LOCAL:local}});this.scope.own(()=>material.destroy());return material;}
    update() {
        const state=homeLighting(this.clock.hour(),this.clock.lampWeight()),origin=this.root.worldPosition,scale=this.root.worldScale;
        for(const receiver of this.receivers) {
            const material=receiver.material,shaft=receiver.kind==='shafts';
            material.setProperty('roomOrigin',new Vec4(origin.x,origin.y,scale.x,scale.y));
            material.setProperty('ambientState',new Vec4(...state.receiverAmbient as [number,number,number],shaft?state.shaftSun:state.receiverSun));
            material.setProperty('sunState',new Vec4(...state.sunColor as [number,number,number],shaft?state.shaftMoon:state.receiverMoon));
            material.setProperty('sunVectorState',new Vec4(...state.sunVector as [number,number,number],state.cot));
            material.setProperty('castState',new Vec4(state.cast[0],state.cast[1],state.moonCast[0],state.moonCast[1]));
            material.setProperty('timeState',new Vec4(state.hour,state.day,state.noon,state.afterglow));
            material.setProperty('weightsState',new Vec4(state.morning,state.sunset,state.lampEnergy,receiver.surface));
            material.setProperty('celestialState',new Vec4(state.sunPosition[0],state.sunPosition[1],state.moonPosition[0],state.moonPosition[1]));
        }
        if(this.dust) {
            const g=this.dust,t=state.hour/24*Math.PI*2;g.clear();
            for(let i=0;i<54;i++) {
                const rawA=Math.sin(i*12.9898+2.13)*43758.5453,rawB=Math.sin(i*78.233+5.6)*23421.631;
                const a=rawA-Math.floor(rawA),b=rawB-Math.floor(rawB);
                const p=[65+a*580+Math.sin(t+i*.37)*10,245+b*695+Math.cos(t+i*.71)*18];
                const alpha=dustGate(p,state.cast,state.cot)*state.sunEnergy/.52*(.67+.33*Math.sin(t*2+i))*.39;
                if(alpha<.025)continue;
                const r=.75+a*.8;
                g.fillColor=new Color(255,.91*255,.66*255,alpha*.1*255);g.circle(p[0],-p[1],r*2.5);g.fill();
                g.fillColor=new Color(255,.94*255,.74*255,alpha*255);g.circle(p[0],-p[1],r);g.fill();
            }
        }
    }
    snapshot() {return {hour:this.clock.hour(),receivers:this.receivers.length,state:homeLighting(this.clock.hour(),this.clock.lampWeight()),resources:this.assets.snapshot(),limits:'grounded shadows, plants, prop/face variants and original GPU acceptance pending'};}
}
