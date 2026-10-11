import { Material, Node, Sprite, SpriteFrame, UITransform, Vec4 } from 'cc';
import { GameAssets } from './Assets';
import { core, meshSprite, Scope } from './Engine';
import { DarkroomRound, darkToolPose, DarkTool } from './DarkroomRound';
import { DarkroomLighting, darkMaterial } from './DarkroomLighting';
import { fitTray, smooth } from './DarkroomVisualRules';
import { nodeAt, picture } from './Visual';

export const TOOL_RESOURCES={needle:'res://darkroom/assets/needle.png',slipper:'res://darkroom/assets/slipper.png'};
export class DarkroomTools {
    readonly trays:Array<{tool:DarkTool;root:Node;sprite:Sprite;fit:ReturnType<typeof fitTray>;geometry:any;resource:string;material:Material}>;
    readonly active:ReturnType<typeof picture>;readonly receiver:Node;
    private receiverSprite:any;private receiverMaterial:Material;private revision=-1;private activeTool:DarkTool='needle';
    private toolFrames:Record<DarkTool,SpriteFrame>;
    constructor(private room:Node,private assets:GameAssets,private scope:Scope,readonly round:DarkroomRound,private lighting:DarkroomLighting){
        const geometry=assets.json('res://darkroom/assets/round2/doll_alpha_geometry.json');
        this.trays=(['needle','slipper'] as DarkTool[]).map(tool=>{const resource=TOOL_RESOURCES[tool],fit=fitTray(tool,geometry.tools[tool]),item=picture(room,assets,scope,resource,tool+'Tray',{position:fit.position,scale:[fit.scale,fit.scale],rotation:fit.rotation,centered:false});item.child.setPosition(item.spec.content[0]-fit.pivot[0],-item.spec.content[1]+fit.pivot[1]);
            const material=darkMaterial(assets,scope,'selection',item.spec);item.sprite.customMaterial=material;return {tool,root:item.root,sprite:item.sprite,resource,fit,geometry:geometry.tools[tool],material};});
        this.active=picture(room,assets,scope,TOOL_RESOURCES.needle,'ContactTool',{centered:false,visible:false});
        this.toolFrames={needle:this.active.sprite.spriteFrame,slipper:assets.frame(TOOL_RESOURCES.slipper,scope)};
        this.receiver=nodeAt(room,'ContactToolAlphaReceiver');const rig=nodeAt(this.receiver,'ActualDollSkinReceiver');rig.setScale(round.rig.contract.uniform_display_scale,round.rig.contract.uniform_display_scale,1);
        const resource='res://assets/doll_idle.png',spec=assets.art(resource);this.receiverSprite=rig.addComponent(meshSprite());this.receiverSprite.configure(round.rig.mesh,spec.size,spec.content);this.receiverSprite.sizeMode=Sprite.SizeMode.CUSTOM;this.receiverSprite.spriteFrame=assets.frame(resource,scope);
        this.receiverMaterial=darkMaterial(assets,scope,'tool-receiver',spec);this.receiverMaterial.setProperty('sourceDisplayMask',assets.texture('res://darkroom/assets/round3/doll_source_display_mask.res'));this.receiverSprite.customMaterial=this.receiverMaterial;this.sync();
    }
    sync(){
        const r=this.round;for(const t of this.trays){t.sprite.color=this.lighting.color();t.material.setProperty('darkState',new Vec4(r.acceptsInput()&&r.selected===t.tool?1:0,3/t.fit.scale,0,0));}
        const shown=r.attackTime>=0&&r.clearTime<0&&r.dollVisible;this.active.root.active=shown;this.receiver.active=shown;
        if(!shown)return;
        if(this.activeTool!==r.attackTool){this.activeTool=r.attackTool;const resource=TOOL_RESOURCES[r.attackTool],spec=this.assets.art(resource);this.active.sprite.spriteFrame=this.toolFrames[r.attackTool];this.active.child.getComponent(UITransform).setContentSize(spec.content[2],spec.content[3]);}
        const pose=darkToolPose(r.attackTool,r.attackTime,r.attackTarget),spec=this.assets.art(TOOL_RESOURCES[r.attackTool]);this.active.root.setPosition(pose.position[0],-pose.position[1]);this.active.root.setScale(pose.scale,pose.scale,1);this.active.root.angle=-pose.rotation*180/Math.PI;this.active.child.setPosition(spec.content[0]-pose.pivot[0],-spec.content[1]+pose.pivot[1]);this.active.sprite.color=this.lighting.color(this.lighting.tint,pose.alpha);
        this.receiver.setPosition(r.rig.root[0],-r.rig.root[1]);this.receiver.angle=-r.rig.rootRotation*180/Math.PI;
        if(this.revision!==r.rig.revision){this.receiverSprite.geometryChanged();this.revision=r.rig.revision;}
        const math=core.Math2D,matrix=math.trs(pose.position,pose.rotation,[pose.scale,pose.scale]),inverse=math.inverse(matrix),origin=this.room.worldPosition,z=this.room.worldScale,c=spec.content,s=spec.size;
        this.receiverMaterial.setProperty('roomOrigin',new Vec4(origin.x,origin.y,z.x,z.y));
        this.receiverMaterial.setProperty('tool_texture',this.assets.texture(TOOL_RESOURCES[r.attackTool]));
        // Original full-source texture coordinates reconstructed from the tool's pivot.
        this.receiverMaterial.setProperty('toolInverseX',new Vec4(inverse[0],inverse[1],0,0));this.receiverMaterial.setProperty('toolInverseY',new Vec4(inverse[2],inverse[3],0,0));this.receiverMaterial.setProperty('toolInverseOrigin',new Vec4(inverse[4]+pose.pivot[0],inverse[5]+pose.pivot[1],0,0));
        this.receiverMaterial.setProperty('toolRect',new Vec4(c[0],c[1],c[2],c[3]));this.receiverMaterial.setProperty('toolUVRect',new Vec4(0,0,1,1));
        const near=1-smooth(15,75,Math.hypot(pose.position[0]-r.attackTarget[0],pose.position[1]-r.attackTarget[1])),part=r.rig.contract.parts[r.contactPart]?.id??-1;
        this.receiverMaterial.setProperty('darkState',new Vec4(near*.19*pose.alpha,part,0,0));
    }
    snapshot(){const fit:any={};this.trays.forEach(v=>fit[v.tool]={...v.fit});return {tray_fit:fit,attack_visible:this.active.root.active,receiver_visible:this.receiver.active};}
}
