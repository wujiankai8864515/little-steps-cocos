import { Material, Node, Sprite, Vec4 } from 'cc';
import { GameAssets } from './Assets';
import { DOLL_PARTS, DollSkin } from './DollSkin';
import { meshSprite, Scope } from './Engine';
import { nodeAt } from './Visual';

// Seven source ownership passes retain the native layer order while submitting
// the same 1089 deformed vertices and UVs. Invisible rigid proxy art is omitted.
const LAYERS=[0,-1,-1,2,3,3,5];
export class DarkroomDoll {
    readonly root:Node;readonly passes:Array<{id:string;sprite:any;material:Material}>=[];
    private revision=-1;
    constructor(private room:Node,assets:GameAssets,scope:Scope,readonly skin:DollSkin){
        this.root=nodeAt(room,'DollMotion');scope.own(()=>this.root.destroy());
        const rig=nodeAt(this.root,'ArticulatedDoll');rig.setScale(skin.contract.uniform_display_scale,skin.contract.uniform_display_scale,1);
        const texture='res://assets/doll_idle.png',spec=assets.art(texture),size=spec.size,crop=spec.content;
        DOLL_PARTS.forEach((id,i)=>{
            const node=nodeAt(rig,id+'ContinuousSourceSkin'),sprite=node.addComponent(meshSprite());
            sprite.configure(skin.mesh,size,crop);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=assets.frame(texture,scope);
            const material=new Material();material.initialize({effectAsset:assets.effect('darkroom-doll'),defines:{USE_TEXTURE:true}});
            material.setProperty('sourceUV',new Vec4(crop[0]/size[0],crop[1]/size[1],crop[2]/size[0],crop[3]/size[1]));
            material.setProperty('sourceDisplayMask',assets.texture('res://darkroom/assets/round3/doll_source_display_mask.res'));
            sprite.customMaterial=material;scope.own(()=>material.destroy());this.passes.push({id,sprite,material});
        });
        this.passes.slice().sort((a,b)=>LAYERS[DOLL_PARTS.indexOf(a.id)]-LAYERS[DOLL_PARTS.indexOf(b.id)]).forEach((p,i)=>p.sprite.node.setSiblingIndex(i));
    }
    sync(tint:number[],spawnAlpha=1,dissolve=0,visible=true){
        this.root.active=visible;this.root.setPosition(this.skin.root[0],-this.skin.root[1]);this.root.angle=-this.skin.rootRotation*180/Math.PI;
        const origin=this.room.worldPosition,scale=this.room.worldScale,bounds=this.skin.bounds();
        for(const p of this.passes){
            if(this.revision!==this.skin.revision)p.sprite.geometryChanged();
            p.material.setProperty('roomOrigin',new Vec4(origin.x,origin.y,scale.x,scale.y));
            p.material.setProperty('dollState',new Vec4(this.skin.contract.parts[p.id].id,p.id==='head'?this.skin.faceReaction():0,spawnAlpha,dissolve));
            p.material.setProperty('lightTint',new Vec4(tint[0],tint[1],tint[2],1));
            p.material.setProperty('releaseBounds',new Vec4(bounds[1],bounds[1]+bounds[3],0,0));
        }
        this.revision=this.skin.revision;
    }
    snapshot(){return {passes:this.passes.map(p=>p.id),sameContinuousMesh:this.passes.every(p=>p.sprite.mesh===this.skin.mesh),rig:this.skin.snapshot()};}
}
