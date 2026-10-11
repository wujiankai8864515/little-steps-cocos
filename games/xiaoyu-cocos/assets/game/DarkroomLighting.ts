import { Color, Material, Node, Sprite, Vec4 } from 'cc';
import { ArtSpec, GameAssets } from './Assets';
import { Scope } from './Engine';
import { HomeClock } from './HomeClock';
import { lightingSnapshot } from './LightingSnapshot';
import { mix, ResponsiveLamp, smooth } from './DarkroomVisualRules';

export const DARKROOM_EFFECTS=['darkroom-doll','darkroom-room','darkroom-sky','darkroom-beams','darkroom-selection','darkroom-shadow','darkroom-tool-receiver','darkroom-plume','home-part-shadow','original-stroke'];
export function darkMaterial(assets:GameAssets,scope:Scope,name:string,spec?:ArtSpec){
    const material=new Material();material.initialize({effectAsset:assets.effect('darkroom-'+name),defines:{USE_TEXTURE:true}});scope.own(()=>material.destroy());
    if(spec){const c=spec.content,s=spec.size;material.setProperty('sourceUV',new Vec4(c[0]/s[0],c[1]/s[1],c[2]/s[0],c[3]/s[1]));material.setProperty('textureSize',new Vec4(s[0],s[1],0,0));}
    return material;
}
export class DarkroomLighting {
    readonly lamp=new ResponsiveLamp();state:ReturnType<typeof lightingSnapshot>;tint=[1,1,1];
    private materials:Material[]=[];
    constructor(private room:Node,private assets:GameAssets,private scope:Scope,readonly clock:HomeClock){this.update(0,-1);}
    bind(sprite:Sprite,spec:ArtSpec,kind='room'){
        const material=darkMaterial(this.assets,this.scope,kind,spec);sprite.customMaterial=material;
        if(kind==='sky')material.setProperty('shared_outdoor_paint',this.assets.texture('res://assets/home_neutral.png'));
        this.materials.push(material);return material;
    }
    update(delta:number,clearTime:number){
        this.state=lightingSnapshot(this.clock.hour());this.lamp.advance(delta,this.clock.lampWeight());
        this.tint=mix(mix([.61,.63,.77],[1,.97,.91],this.state.day),[1,.88,.67],this.lamp.value*.56);
        const s=this.state,o=this.room.worldPosition,z=this.room.worldScale,glow=clearTime>=0?smooth(.1,.55,clearTime)*(1-smooth(1.5,2.8,clearTime)):0;
        for(const m of this.materials){
            m.setProperty('roomOrigin',new Vec4(o.x,o.y,z.x,z.y));m.setProperty('ambientState',new Vec4(...s.ambient as [number,number,number],s.sunEnergy));
            m.setProperty('sunState',new Vec4(...s.sunColor as [number,number,number],s.moonEnergy));m.setProperty('sunVectorState',new Vec4(...s.sunVector as [number,number,number],s.cot));
            m.setProperty('castState',new Vec4(s.cast[0],s.cast[1],s.moonCast[0],s.moonCast[1]));m.setProperty('timeState',new Vec4(s.hour,s.day,s.noon,s.afterglow));
            m.setProperty('weightsState',new Vec4(s.morning,s.sunset,0,1));m.setProperty('celestialState',new Vec4(s.sunPosition[0],s.sunPosition[1],s.moonPosition[0],s.moonPosition[1]));
            m.setProperty('darkState',new Vec4(this.lamp.value,glow,0,0));
        }
    }
    color(tint=this.tint,alpha=1){return new Color(tint[0]*255,tint[1]*255,tint[2]*255,alpha*255);}
    lanternTint(){return mix([.48,.49,.58],[1,.98,.83],Math.max(this.state.day*.58,this.lamp.value));}
    shadow(){const s=this.state,sun=s.sunEnergy>.001,direction=sun?s.cast:s.moonCast,extent=sun?Math.max(.12,Math.min(.6,s.cot*.12)):.24,natural=s.sunEnergy+s.moonEnergy*.34,lampMix=this.lamp.value*.78/(natural+this.lamp.value*.78+1e-5);
        return {cast:mix([direction[0]*extent,direction[1]*extent*.72],[.29,.12],lampMix),strength:natural*.34+this.lamp.value*.2,contact:.08+s.day*.03+this.lamp.value*.015};}
    snapshot(){return {clock_hour:this.clock.hour(),lamp_override:this.lamp.override,lamp_weight:this.lamp.value,lighting:this.state,receivers:this.materials.length};}
}
