import { Node, Sprite, UITransform, Vec3, Vec4 } from 'cc';
import { GameAssets } from './Assets';
import { core, meshSprite, Scope } from './Engine';
import { nodeAt } from './Visual';
import { deformPart, SoftPose } from './SoftGeometry';
import { clampEyeOffset, EYE_CENTERS, PUPIL_REGIONS, PUPIL_SOURCES } from './EyeGeometry';
import { CharacterBehavior } from './AmbientBehavior';

// Authored Skeleton2D hierarchy and all seven curves are transferred verbatim.
// Source math stays in downward coordinates; only the Cocos submission flips y.
export class XiaoyuRig {
    readonly root: Node;
    readonly receivers:Array<{resource:string;node:Node;sprite:Sprite;spec:any;eye?:number}>=[];
    private pupils:Array<{node:Node;sprite:Sprite;region:number[];offset:number[]}>=[];
    private nodes = new Map<string, Node>();
    private meshes: Array<{resource: string; node: Node; mesh: any; sprite: any}> = [];
    private animation: any;
    readonly behavior=new CharacterBehavior();
    private neutralBones:Array<{node:Node;position:Vec3;scale:Vec3;angle:number}>=[];
    private jelly=[0,0];
    onContact: () => void = () => {};
    constructor(parent: Node, private assets: GameAssets, private scope: Scope, position = [15, 615]) {
        this.root = nodeAt(parent, 'XiaoyuRig', position[0], position[1], 670, 402);
        this.nodes.set('.', this.root);
        const scene = assets.scene('res://xiaoyu_rig.tscn');
        const resources = new Map(scene.sections.filter(s => s.kind === 'ext_resource').map(s => [s.id, s.path]));
        const sections = scene.sections.filter(s => s.kind === 'node');
        for (const section of sections.slice(1)) {
            if (section.type === 'AnimationPlayer') continue;
            const properties = section.properties, parentNode = this.nodes.get(section.parent);
            if (!parentNode) throw new Error(`骨骼父节点缺失：${section.parent}`);
            const path = section.parent === '.' ? section.name : `${section.parent}/${section.name}`;
            const position = properties.position || [0, 0];
            const node = nodeAt(parentNode, section.name, position[0], position[1]);
            node.active = properties.visible !== false;
            this.nodes.set(path, node);
            if (section.type !== 'Sprite2D') continue;
            const resource = resources.get(properties.texture.value) as string;
            if (properties.region_enabled) {
                const region = properties.region_rect;
                // Eye regions are independent source rectangles, not a full closed-eye overlay.
                const frame = assets.frame(resource, scope), spec = assets.art(resource);
                const rect = frame.rect.clone(); rect.x = region[0] - spec.content[0]; rect.y = region[1] - spec.content[1]; rect.width = region[2]; rect.height = region[3]; frame.rect = rect;
                node.getComponent(UITransform).setContentSize(region[2], region[3]);
                const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = frame;
                this.receivers.push({resource,node,sprite,spec});
            } else {
                const spec = assets.art(resource), bounds = spec.opaque;
                const rect = [Math.max(0, bounds[0] - 3), Math.max(0, bounds[1] - 3), Math.min(spec.size[0], bounds[2] + 3), Math.min(spec.size[1], bounds[3] + 3)];
                const mesh = core.createGrid([rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]], section.name === 'OriginalFinAndRigidMallet' ? 7 : 14);
                node.getComponent(UITransform).setContentSize(spec.size[0], spec.size[1]);
                const sprite = node.addComponent(meshSprite()); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                sprite.configure(mesh, spec.size, spec.content); sprite.spriteFrame = assets.frame(resource, scope);
                this.meshes.push({resource, node, mesh, sprite});
                this.receivers.push({resource,node,sprite,spec});
            }
        }
        // Godot Tail has z_index -1 even though the authored body comes afterward.
        this.nodes.get('Skeleton2D/Ground/Body/Tail').setSiblingIndex(0);
        this.animation = scene.sections.find(s => s.kind === 'sub_resource' && s.type === 'Animation').properties;
        const body=this.nodes.get('Skeleton2D/Ground/Body/OriginalBody'),resource='res://assets/body.png',spec=assets.art(resource);
        PUPIL_REGIONS.forEach((region,index)=>{
            const offset=EYE_CENTERS[index].map((v,i)=>v-PUPIL_SOURCES[index][i]);
            const node=nodeAt(body,index===0?'IndependentLeftEyePupil':'IndependentRightEyePupil',region[0]+offset[0],region[1]+offset[1],region[2],region[3]);
            const frame=assets.frame(resource,scope),rect=frame.rect.clone();rect.x=region[0]-spec.content[0];rect.y=region[1]-spec.content[1];rect.width=region[2];rect.height=region[3];frame.rect=rect;
            const sprite=node.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=frame;
            this.pupils.push({node,sprite,region,offset});this.receivers.push({resource,node,sprite,spec,eye:index+1});
        });
        this.poseAt(0);
        for(const path of ['Skeleton2D/Ground/Body','Skeleton2D/Ground/Body/Tail','Skeleton2D/Ground/Shoulder','Skeleton2D/Ground/Shoulder/GripMallet']){
            const node=this.nodes.get(path);this.neutralBones.push({node,position:node.position.clone(),scale:node.scale.clone(),angle:node.angle});
        }
        console.info('[LittleSteps] original rig constructed', {bones: sections.filter(s => s.type === 'Bone2D').length, tracks: 7, vertices: this.meshes.map(m => m.mesh.source.length / 2)});
    }
    poseAt(time: number) {
        this.neutralBones.forEach(pose=>{pose.node.setPosition(pose.position);pose.node.setScale(pose.scale);pose.node.angle=pose.angle;});
        for (let i = 0; i < 7; ++i) {
            const [path, property] = this.animation[`tracks/${i}/path`].value.split(':');
            const keys = this.animation[`tracks/${i}/keys`];
            const value = core.sampleTrack({...keys, interpolation: this.animation[`tracks/${i}/interp`]}, time);
            const node = this.nodes.get(path);
            if (property === 'scale') node.setScale(value[0], value[1], 1);
            else if (property === 'position') node.setPosition(value[0], -value[1]);
            else if (property === 'rotation') node.angle = -value * 180 / Math.PI;
            else if (property === 'visible') node.active = value;
        }
        // HomeWorld restores its baseline body scale/position after clip seek.
        // Secondary motion and source mesh deformation supply the soft motion.
        const body=this.nodes.get('Skeleton2D/Ground/Body');body.setScale(1,1,1);body.setPosition(0,0);
        this.nodes.get('Skeleton2D/Ground/Body/Expression').setPosition(0,0);
        this.pupils.forEach(pupil=>pupil.node.active=!this.nodes.get('Skeleton2D/Ground/Body/Expression').active);
    }
    advance(delta: number,night=false) {
        const frame=this.behavior.advance(delta,night);if(!frame)return;
        this.poseAt(frame.poseTime);
        const body=this.nodes.get('Skeleton2D/Ground/Body/OriginalBody'),fin=this.nodes.get('Skeleton2D/Ground/Shoulder/GripMallet/OriginalFinAndRigidMallet'),grip=this.nodes.get('Skeleton2D/Ground/Shoulder/GripMallet');
        const doze=this.behavior.director.state==='doze';
        // In the source, the anticipation adjustment precedes gaze sampling,
        // while the doze lowering follows the secondary bone offsets.
        if(!doze)grip.angle-=frame.gripRotation*180/Math.PI;
        let gaze=frame.gaze;
        if(frame.gazeTarget==='strike'||frame.gazeTarget==='mallet'){
            const source=frame.gazeTarget==='strike'?body:fin,pixel=frame.gazeTarget==='strike'?[500,181]:[529,165];
            const point=source.getComponent(UITransform).convertToWorldSpaceAR(new Vec3(pixel[0],-pixel[1]));
            const local=body.getComponent(UITransform).convertToNodeSpaceAR(point),direction=[local.x-365-this.jelly[0],-local.y-177-this.jelly[1]],length=Math.hypot(...direction),gain=length>0?Math.min(length/22,2.6)/length:0;
            gaze=direction.map(v=>v*gain);
        }
        ['Skeleton2D/Ground/Body','Skeleton2D/Ground/Body/Tail','Skeleton2D/Ground/Shoulder','Skeleton2D/Ground/Shoulder/GripMallet'].forEach((path,index)=>this.nodes.get(path).angle-=frame.offsets[index]*180/Math.PI);
        if(doze)grip.angle-=frame.gripRotation*180/Math.PI;
        this.jelly=frame.jelly;
        const expression=this.nodes.get('Skeleton2D/Ground/Body/Expression');expression.setPosition(this.jelly[0],-this.jelly[1]);expression.active=frame.closed;this.pupils.forEach(p=>p.node.active=!frame.closed);
        this.deform({amount:0,grab:[335,150],lag:[0,0],phase:0,jelly:this.jelly,landing:0,clearance:0});
        this.setMouthOpen(frame.mouth);this.setEyeOffsets(this.behavior.faceGaze(gaze,frame.step,frame.closed));
        if(frame.transition)console.info('[LittleSteps] original ambient transition '+JSON.stringify(this.behavior.snapshot()));
        if(frame.contact){console.info('[LittleSteps] original rig contact '+JSON.stringify({poseTime:frame.poseTime,...this.behavior.snapshot()}));this.onContact();}
    }
    hitAt(worldPoint: number[]) {
        for (const part of [...this.meshes].reverse()) {
            const local = part.node.getComponent(UITransform).convertToNodeSpaceAR(new Vec3(worldPoint[0], worldPoint[1]));
            const source = core.sourcePixelAt(part.mesh, [local.x, -local.y]);
            if (source && this.assets.contains(part.resource, source[0], source[1])) return {source, part: part.node.name};
        }
        return null;
    }
    snapshot() {return this.behavior.snapshot();}
    focusLost(){this.behavior.focusLost();}
    setEyeOffsets(left:number[],right=left) {
        this.pupils.forEach((pupil,index)=>{
            const safe=clampEyeOffset(index+1,index===0?left:right);
            pupil.offset=EYE_CENTERS[index].map((v,i)=>v-PUPIL_SOURCES[index][i]+safe[i]);
            pupil.node.setPosition(pupil.region[0]+pupil.offset[0]+this.jelly[0],-pupil.region[1]-pupil.offset[1]-this.jelly[1]);
            if(pupil.sprite.customMaterial)pupil.sprite.customMaterial.setProperty('faceOffset',new Vec4(pupil.offset[0],pupil.offset[1],0,0));
        });
    }
    setMouthOpen(value:number) {
        const body=this.receivers.find(r=>r.node.name==='OriginalBody'),material=body.sprite.customMaterial;
        if(!material)return;
        const state=material.getProperty('bodyState') as Vec4;
        material.setProperty('bodyState',new Vec4(Number.isFinite(value)?Math.max(-2.8,Math.min(2.8,value)):0,state.y,state.z,state.w));
    }
    pupilOffsets() {return this.pupils.map(p=>p.offset);}
    deform(pose: SoftPose) {
        const body = this.nodes.get('Skeleton2D/Ground/Body/OriginalBody');
        const affine = (node: Node) => {
            const m = node.worldMatrix;
            return [m.m00, -m.m01, -m.m04, m.m05, m.m12, -m.m13];
        };
        const inverseBody = core.Math2D.inverse(affine(body));
        for (const part of this.meshes) {
            const toBody = core.Math2D.multiply(inverseBody, affine(part.node));
            if (deformPart(part.mesh, part.node.name, pose, toBody)) part.sprite.geometryChanged();
        }
    }
}
