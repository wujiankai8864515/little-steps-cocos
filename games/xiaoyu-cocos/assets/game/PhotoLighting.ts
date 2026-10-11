import { Graphics, Material, Node, Sprite, Vec4 } from 'cc';
import { GameAssets } from './Assets';
import { Scope } from './Engine';
import { PhotoLight } from './PhotoGeometry';
import { WallPhoto } from './PhotoCollection';
export const PHOTO_ATLAS='res://photo/assets/photo_wall_material_atlas_v3.png',PHOTO_PLATE='res://photo/assets/photo_wall_neutral_plate_v1.png',PHOTO_LAYOUT='res://photo/assets/atlas_regions.json',PHOTO_REWARDS='res://travel/assets/travel_rewards_v1.png';
export const PHOTO_EFFECTS=['photo-receiver','photo-paper','photo-volume','photo-face','photo-shadow','photo-line'];
export class PhotoLighting {
    private receivers=new Set<{material:Material;kind:string}>();
    constructor(private canvas:Node,private assets:GameAssets){}
    bind(renderer:Sprite|Graphics,kind:string,scope:Scope){
        const material=new Material();material.initialize({effectAsset:this.assets.effect('photo-'+kind),defines:{USE_TEXTURE:true,USE_LOCAL:renderer instanceof Graphics}});renderer.customMaterial=material;
        const bound=renderer instanceof Graphics?renderer.getMaterialInstance(0):material,entry={material:bound,kind};this.receivers.add(entry);scope.own(()=>{this.receivers.delete(entry);material.destroy();});return bound;
    }
    paper(renderer:Sprite,photo:WallPhoto,scope:Scope){
        const m=this.bind(renderer,'paper',scope),layout=this.assets.json(PHOTO_LAYOUT),legacy=photo.kind==='legacy',resource=legacy?PHOTO_ATLAS:PHOTO_REWARDS;
        const r=layout['hd_legacy_'+(Math.trunc(photo.art)+1)],corners=legacy?[[r[0]+.5,r[1]+.5],[r[0]+r[2]-.5,r[1]+.5],[r[0]+r[2]-.5,r[1]+r[3]-.5],[r[0]+.5,r[1]+r[3]-.5]].map(p=>p.map(v=>v/1280)):[[93,718],[557,642],[626,1047],[147,1116]].map(p=>p.map(v=>v/1254));
        const crop=(key:string)=>{const s=this.assets.art(key),c=s.content;return new Vec4(c[0]/s.size[0],c[1]/s.size[1],c[2]/s.size[0],c[3]/s.size[1]);};
        m.setProperty('frame_tex',this.assets.texture(PHOTO_ATLAS));m.setProperty('photo_tex',this.assets.texture(resource));m.setProperty('frameCrop',crop(PHOTO_ATLAS));m.setProperty('photoCrop',crop(resource));m.setProperty('photoTop',new Vec4(...[...corners[0],...corners[1]] as [number,number,number,number]));m.setProperty('photoBottom',new Vec4(...[...corners[2],...corners[3]] as [number,number,number,number]));return m;
    }
    face(renderer:Sprite,resource:string,eye:number,offset:number[],scope:Scope,closed=false){const m=this.bind(renderer,'face',scope),s=this.assets.art(resource),c=s.content;m.setProperty('sourceUV',new Vec4(c[0]/s.size[0],c[1]/s.size[1],c[2]/s.size[0],c[3]/s.size[1]));m.setProperty('textureSize',new Vec4(...s.size as [number,number],0,0));m.setProperty('bodyState',new Vec4(0,eye,0,closed?1:0));m.setProperty('faceOffset',new Vec4(...offset as [number,number],0,0));return m;}
    update(light:PhotoLight){const p=this.canvas.worldPosition,s=this.canvas.worldScale,origin=new Vec4(p.x,p.y,s.x,s.y);for(const {material:m,kind} of this.receivers){
        if(kind==='shadow')continue;
        if(kind==='face'){
            const raw=[-light.cast[0],-light.cast[1],.25+light.elevation],d=Math.hypot(...raw),dir=raw.map(v=>v/d);
            m.setProperty('roomOrigin',origin);m.setProperty('ambientState',new Vec4(...light.ambient as [number,number,number],.25*(1-light.night)));m.setProperty('sunState',new Vec4(...light.color as [number,number,number],.3*light.night));m.setProperty('sunVectorState',new Vec4(...dir as [number,number,number],1));m.setProperty('weightsState',new Vec4(0,0,0,1));
        }else {m.setProperty('pageOrigin',origin);m.setProperty('lightState',new Vec4(...light.origin as [number,number],light.energy,light.night));m.setProperty('lightAmbient',new Vec4(...light.ambient as [number,number,number],0));m.setProperty('lightTint',new Vec4(...light.color as [number,number,number],0));}
    }}
}
