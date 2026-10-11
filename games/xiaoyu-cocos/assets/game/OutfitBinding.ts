import { Vec4 } from 'cc';
import { GameAssets } from './Assets';
import { XiaoyuRig } from './XiaoyuRig';
import { hasSkin, OUTFIT_TEXTURE, SKINS } from './WardrobeStore';
// The same original body mesh, source UV, bones and face shader remain active.
// Explicit crop conversion restores full source coordinates of imported pixels.
export function applyOutfit(rig:XiaoyuRig,assets:GameAssets,id:string){
    if(!hasSkin(id))return false;const body=rig.receivers.find(r=>r.node.name==='OriginalBody'),material=body?.sprite.customMaterial;if(!material)return false;
    if(id!=='original'){const texture=assets.texture(OUTFIT_TEXTURE),spec=assets.art(OUTFIT_TEXTURE),c=spec.content,s=spec.size;material.setProperty('outfit_texture',texture);material.setProperty('outfitCrop',new Vec4(c[0]/s[0],c[1]/s[1],c[2]/s[0],c[3]/s[1]));}
    else material.setProperty('outfit_texture',assets.texture('res://assets/body.png'));
    const before=material.getProperty('bodyState') as Vec4,definition=SKINS[id];material.setProperty('bodyState',new Vec4(before.x,before.y,id==='original'?0:1,before.w));material.setProperty('outfitBand',new Vec4(...definition.band as [number,number,number,number]));material.setProperty('outfitCrown',new Vec4(...definition.crown as [number,number,number,number]));return true;
}
