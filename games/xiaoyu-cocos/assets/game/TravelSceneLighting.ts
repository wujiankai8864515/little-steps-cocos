import { Material, Node, Sprite, Vec4 } from 'cc';
import { GameAssets } from './Assets';
import { Scope } from './Engine';
import { travelLight } from './TravelSceneState';
import { TRAVEL_SCENE } from './TravelSceneData';

export const TRAVEL_SCENE_EFFECTS=['travel-atmosphere'];
export class TravelSceneLighting {
    private materials=new Map<number,Material>();
    light:ReturnType<typeof travelLight>;
    constructor(private root:Node,private assets:GameAssets,private scope:Scope,private config=TRAVEL_SCENE){}
    bind(sprite:any,mode=0){
        let material=this.materials.get(mode);
        if(!material){
            material=new Material();material.initialize({effectAsset:this.assets.effect('travel-atmosphere'),defines:{USE_TEXTURE:true}});this.scope.own(()=>material.destroy());this.materials.set(mode,material);
            const exclusions=this.config.light.beam_exclusions.concat(this.config.route.landmarks.map((m:any)=>[m.rect[0]-3,m.rect[1]-3,m.rect[2]+6,m.rect[3]+6]));
            if(exclusions.length>16||this.config.light.beam_portals.length!==4)throw new Error('Travel atmospheric field exceeds original bounds');
            this.config.light.beam_portals.forEach((p:any,i:number)=>{material.setProperty('portal'+i,new Vec4(p.at[0],p.at[1],p.length,p.strength*1.65));material.setProperty('width'+i,new Vec4(p.start_width,p.end_width,0,0));});
            for(let i=0;i<16;i++)material.setProperty('exclusion'+i,new Vec4(...(exclusions[i]||[0,0,0,0]) as [number,number,number,number]));
            material.setProperty('renderMode',new Vec4(mode,exclusions.length,this.config.light.beams_enabled===false?0:1,0));
        }sprite.customMaterial=material;if(mode===0)this.tint(sprite);
    }
    tint(sprite:any,alpha=1,tinted=true,lightened=0){
        const mesh=sprite.mesh,count=mesh.vertices.length/2;
        if(!mesh.vertexData)mesh.vertexData=new Float32Array(count*3);
        if(mesh.vertexData[0]===Math.fround(alpha)&&mesh.vertexData[1]===Number(tinted)&&mesh.vertexData[2]===Math.fround(lightened))return;
        for(let i=0;i<count;i++)mesh.vertexData.set([alpha,Number(tinted),lightened],i*3);sprite.geometryChanged();
    }
    resize(height:number){const top=-Math.max(0,(height-1280)/2);for(const m of this.materials.values())this.config.light.beam_portals.forEach((p:any,i:number)=>m.setProperty('portal'+i,new Vec4(p.at[0],p.at[1]+top,p.length-top,p.strength*1.65)));}
    update(hour:number){
        this.light=travelLight(hour,this.config);const s=this.light,o=this.root.worldPosition,z=this.root.worldScale;
        const origin=new Vec4(o.x,o.y,z.x,z.y),cast=new Vec4(-s.direction[0],-s.direction[1],s.daylight,s.daylight+.60*s.moon_weight),light=new Vec4(.56+.44*s.daylight,.70+.21*s.daylight,1-.28*s.daylight,s.daylight+s.moon_weight);
        for(const m of this.materials.values()){m.setProperty('sceneOrigin',origin);m.setProperty('castState',cast);m.setProperty('lightState',light);m.setProperty('sceneTint',new Vec4(...s.tint as [number,number,number,number]));}return s;
    }
    snapshot(){return {materials:this.materials.size,light:this.light,portals:this.config.light.beam_portals.length,exclusions:this.config.light.beam_exclusions.length+this.config.route.landmarks.length};}
}
