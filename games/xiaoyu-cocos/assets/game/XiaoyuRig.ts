import { game, Node, Sprite, UITransform, Vec3, Vec4 } from 'cc';
import { GameAssets } from './Assets';
import { core, meshSprite, Scope } from './Engine';
import { nodeAt } from './Visual';
import { attachmentOffset, bodyPixelVisible, deformPart, landingOffset, softOffset, SoftPose } from './SoftGeometry';
import { clampEyeOffset, EYE_CENTERS, PUPIL_REGIONS, PUPIL_SOURCES } from './EyeGeometry';
import { CharacterBehavior } from './AmbientBehavior';
import { LandingSpring, LiftMotion } from './LiftMotion';
import { DragGaze } from './DragGaze';

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
    private suspended=false;
    readonly dragGaze=new DragGaze();private dragFocusFrame:Node;private gazeBaseline=[0,0];
    private sourceDepth=new Map<Node,{z:number;relative:boolean}>();
    private liftMotion=new LiftMotion();
    readonly landing=new LandingSpring();
    liftHeight=0;
    private grabSource=[335,150];private grabPixel=[0,0];private grabbed:Node=null;
    private heldBones:Array<{node:Node;position:Vec3;scale:Vec3;angle:number}>=[];
    private headProfile:number[][]=null;
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
            this.sourceDepth.set(node,{z:properties.z_index||0,relative:properties.z_as_relative!==false});
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
        if(this.suspended)return;
        const frame=this.behavior.advance(delta,night,game.totalTime/1000);if(!frame)return;
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
        this.landing.advance(delta);const land=landingOffset([365,177],this.landing.position);expression.setPosition(this.jelly[0]+land[0],-this.jelly[1]-land[1]);
        this.deform(this.softPose());
        this.setMouthOpen(frame.mouth);this.gazeBaseline=this.behavior.faceGaze(gaze,frame.step,frame.closed);this.setEyeOffsets(this.gazeBaseline);
        if(frame.transition)console.info('[LittleSteps] original ambient transition '+JSON.stringify(this.behavior.snapshot()));
        if(frame.contact){console.info('[LittleSteps] original rig contact '+JSON.stringify({poseTime:frame.poseTime,...this.behavior.snapshot()}));this.onContact();}
    }
    hitAt(worldPoint: number[]) {
        for (const name of ['OriginalFinAndRigidMallet','OriginalBody','OriginalTail']) {
            const part=this.meshes.find(p=>p.node.name===name);
            if(!part.node.activeInHierarchy||!part.sprite.enabled)continue;
            const local = part.node.getComponent(UITransform).convertToNodeSpaceAR(new Vec3(worldPoint[0], worldPoint[1]));
            const source = core.sourcePixelAt(part.mesh, [local.x, -local.y]);
            if (source && (name!=='OriginalBody'||bodyPixelVisible(source))&&this.assets.contains(part.resource, source[0], source[1])) return {source, part: part.node.name};
        }
        return null;
    }
    snapshot() {return {...this.behavior.snapshot(),suspended:this.suspended,dragGaze:this.dragGaze.snapshot(),pupilOffsets:this.pupilOffsets(),heldPart:this.grabbed?.name,rendering:{parent:this.root.parent?.name,layer:this.root.layer,position:{x:this.root.position.x,y:this.root.position.y,z:this.root.position.z},world:{x:this.root.worldPosition.x,y:this.root.worldPosition.y,z:this.root.worldPosition.z},parts:this.meshes.map(p=>({name:p.node.name,layer:p.node.layer,enabled:p.sprite.enabled,active:p.node.activeInHierarchy,position:{x:p.node.worldPosition.x,y:p.node.worldPosition.y,z:p.node.worldPosition.z}}))},lift:{amount:this.liftMotion.amount,elapsed:this.liftMotion.elapsed,lag:this.liftMotion.lag,height:this.liftHeight,grab:this.grabSource,pixel:this.grabPixel},landing:{active:this.landing.active,position:this.landing.position,velocity:this.landing.velocity,age:this.landing.age}};}
    focusLost(){this.behavior.focusLost();this.dragGaze.setTarget('',[0,0]);}
    setActiveDragFocus(id:string,at:number[],frame:Node){this.dragGaze.setTarget(id,at);if(this.dragGaze.activeId)this.dragFocusFrame=frame;}
    advanceDragGaze(delta:number){
        const body=this.nodes.get('Skeleton2D/Ground/Body/OriginalBody');
        this.dragGaze.advance(delta,at=>{const world=this.dragFocusFrame.getComponent(UITransform).convertToWorldSpaceAR(new Vec3(at[0],-at[1]));const local=body.getComponent(UITransform).convertToNodeSpaceAR(world);return [local.x,-local.y];},this.jelly);
        if(this.dragGaze.weight<=0)return;
        const expression=this.nodes.get('Skeleton2D/Ground/Body/Expression');
        if(this.dragGaze.activeId&&this.suspended){expression.active=this.behavior.secondary.blink(delta);this.pupils.forEach(p=>p.node.active=!expression.active);}
        const offsets=this.dragGaze.offsets(this.gazeBaseline,expression.active);this.setEyeOffsets(offsets[0],offsets[1]);
    }
    setEyeOffsets(left:number[],right=left) {
        this.pupils.forEach((pupil,index)=>{
            const safe=clampEyeOffset(index+1,index===0?left:right);
            pupil.offset=EYE_CENTERS[index].map((v,i)=>v-PUPIL_SOURCES[index][i]+safe[i]);
            const shift=attachmentOffset('OriginalBody',EYE_CENTERS[index],this.softPose(),core.Math2D.identity());
            pupil.node.setPosition(pupil.region[0]+pupil.offset[0]+shift[0],-pupil.region[1]-pupil.offset[1]-shift[1]);
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
    setLightingOrigin(frame:Node){const p=frame.worldPosition,s=frame.worldScale;this.receivers.forEach(r=>{if(r.sprite.customMaterial)r.sprite.customMaterial.setProperty('roomOrigin',new Vec4(p.x,p.y,s.x,s.y));});}
    softPose():SoftPose {return {amount:this.liftMotion.amount,grab:this.grabSource,lag:this.liftMotion.lag,phase:this.liftMotion.elapsed,jelly:this.jelly,landing:this.landing.position,clearance:Math.max(0,this.liftHeight)*.9,heldPart:this.grabbed?.name,handGrab:this.grabPixel,handMotion:[.55*Math.sin(this.liftMotion.elapsed*7.2),3.8*Math.cos(this.liftMotion.elapsed*6.8)]};}
    softMeshes(){return this.meshes;}
    backpackNodes(){return {body:this.nodes.get('Skeleton2D/Ground/Body/OriginalBody'),tail:this.nodes.get('Skeleton2D/Ground/Body/Tail/OriginalTail'),tailBone:this.nodes.get('Skeleton2D/Ground/Body/Tail'),shoulder:this.nodes.get('Skeleton2D/Ground/Shoulder'),grip:this.nodes.get('Skeleton2D/Ground/Shoulder/GripMallet')};}
    coversBackpack(world:number[],depth:number){if(depth>12)return false;for(const part of this.meshes){if(!part.node.activeInHierarchy||!part.sprite.enabled||part.node.name.indexOf('Eye')>=0)continue;let actual=0,node=part.node;while(node!==this.root){const source=this.sourceDepth.get(node);actual+=source?.z||0;if(source?.relative===false)break;node=node.parent;}if(node===this.root)actual+=12;if(actual<depth)continue;const p=part.node.getComponent(UITransform).convertToNodeSpaceAR(new Vec3(world[0],world[1]));if(this.assets.contains(part.resource,p.x,-p.y))return true;}return false;}
    get softActive(){return this.liftMotion.amount>1e-5||this.landing.active;}
    resetSecondary(){this.behavior.resetPose();this.gazeBaseline=[0,0];this.jelly=[0,0];this.liftMotion.reset();this.landing.reset();this.poseAt(0);const expression=this.nodes.get('Skeleton2D/Ground/Body/Expression');expression.active=false;this.pupils.forEach(p=>p.node.active=true);this.setMouthOpen(0);this.setEyeOffsets([0,0]);this.deform(this.softPose());}
    suspend(){if(!this.suspended)this.suspended=true;}
    resume(){if(!this.suspended)return;this.resetSecondary();this.behavior.director.resumeAfterPlayer();this.suspended=false;}
    tap(){if(this.suspended)return;this.resetSecondary();this.behavior.requestPlayerTap(game.totalTime/1000);}
    beginLift(worldPoint:number[]) {
        const picked=this.hitAt(worldPoint),body=this.nodes.get('Skeleton2D/Ground/Body/OriginalBody'),tail=this.nodes.get('Skeleton2D/Ground/Body/Tail');
        this.grabbed=this.meshes.find(p=>p.node.name===(picked?.part||'OriginalBody')).node;
        const local=this.grabbed.getComponent(UITransform).convertToNodeSpaceAR(new Vec3(...worldPoint as [number,number]));this.grabPixel=picked?.source||[local.x,-local.y];
        const inBody=body.getComponent(UITransform).convertToNodeSpaceAR(new Vec3(...worldPoint as [number,number]));const sourceGrab=this.grabbed===body?this.grabPixel.slice():[inBody.x,-inBody.y];
        const tailGlobal=this.affine(tail),held=['Skeleton2D/Ground/Shoulder','Skeleton2D/Ground/Shoulder/GripMallet'].map(path=>{const n=this.nodes.get(path);return {node:n,position:n.position.clone(),scale:n.scale.clone(),angle:n.angle};});
        this.resetSecondary();
        if(this.grabbed.name==='OriginalFinAndRigidMallet')held.forEach(p=>{p.node.setPosition(p.position);p.node.setScale(p.scale);p.node.angle=p.angle;});
        else if(this.grabbed.name==='OriginalTail'){
            const relative=core.Math2D.multiply(core.Math2D.inverse(this.affine(tail.parent)),tailGlobal);tail.setPosition(relative[4],-relative[5]);tail.setScale(Math.hypot(relative[0],relative[1]),Math.hypot(relative[2],relative[3]),1);tail.angle=-Math.atan2(relative[1],relative[0])*180/Math.PI;
        }
        this.heldBones=(this.grabbed.name==='OriginalTail'?[tail]:this.grabbed.name==='OriginalFinAndRigidMallet'?held.map(p=>p.node):[]).map(node=>({node,position:node.position.clone(),scale:node.scale.clone(),angle:node.angle}));
        this.grabSource=sourceGrab;const point=this.grabbed.getComponent(UITransform).convertToWorldSpaceAR(new Vec3(this.grabPixel[0],-this.grabPixel[1]));const grab=this.root.getComponent(UITransform).convertToNodeSpaceAR(point);this.deform(this.softPose());return [grab.x,-grab.y];
    }
    lift(amount:number,delta:number,lag:number[]) {
        if(!this.suspended)return;const frame=this.liftMotion.advance(amount,delta,lag,this.behavior.secondary);if(!frame)return;this.poseAt(0);
        this.heldBones.forEach(p=>{p.node.setPosition(p.position);p.node.setScale(p.scale);p.node.angle=p.angle;});
        ['Skeleton2D/Ground/Body','Skeleton2D/Ground/Body/Tail','Skeleton2D/Ground/Shoulder','Skeleton2D/Ground/Shoulder/GripMallet'].forEach((path,i)=>this.nodes.get(path).angle-=frame.offsets[i]*180/Math.PI);
        this.nodes.get('Skeleton2D/Ground/Body').angle=0;
        [['Skeleton2D/Ground/Shoulder',frame.shoulder],['Skeleton2D/Ground/Body/Tail',frame.tail]].forEach(pair=>{const n=this.nodes.get(pair[0] as string),shift=pair[1] as number[];n.setPosition(n.position.x+shift[0],n.position.y-shift[1]);});
        this.jelly=[0,0];const shift=softOffset([365,177],this.grabSource,this.liftMotion.amount,this.liftMotion.lag,this.liftMotion.elapsed),expression=this.nodes.get('Skeleton2D/Ground/Body/Expression');expression.setPosition(shift[0],-shift[1]);expression.active=frame.closed;this.pupils.forEach(p=>p.node.active=!frame.closed);
        this.deform(this.softPose());this.setMouthOpen(frame.mouth);this.gazeBaseline=frame.closed?[0,0]:frame.gaze;this.setEyeOffsets(this.gazeBaseline);
    }
    gripWorld(){const pixel=this.grabPixel,body=this.nodes.get('Skeleton2D/Ground/Body/OriginalBody'),toBody=core.Math2D.multiply(core.Math2D.inverse(this.affine(body)),this.affine(this.grabbed)),offset=attachmentOffset(this.grabbed.name,pixel,this.softPose(),toBody);const p=this.grabbed.getComponent(UITransform).convertToWorldSpaceAR(new Vec3(pixel[0]+offset[0],-pixel[1]-offset[1]));return [p.x,p.y];}
    noteAnchor(frame:Node){
        if(!this.headProfile){this.headProfile=[];for(let x=160;x<552;x++)for(let y=40;y<250;y++)if(this.assets.bitmapContains('res://home/interaction/alpha_masks/body.res',x,y)){this.headProfile.push([x+.5,y+.5]);break;}}
        const part=this.meshes.find(p=>p.node.name==='OriginalBody'),inverse=core.Math2D.inverse(this.affine(frame)),matrix=core.Math2D.multiply(inverse,this.affine(part.node));let top=Infinity;
        for(const p of this.headProfile){const at=core.renderedPointAt(part.mesh,p);top=Math.min(top,core.Math2D.transform(matrix,...at)[1]);}
        const center=core.Math2D.transform(core.Math2D.multiply(inverse,this.affine(this.root)),335,0);return [center[0],top-10];
    }
    land(impact:number){this.liftMotion.amount=0;this.liftMotion.lag=[0,0];this.landing.begin(impact,this.behavior.secondary);}
    visualBounds(relativeTo:Node){const inverse=core.Math2D.inverse(this.affine(relativeTo)),points:number[][]=[];this.meshes.forEach(part=>{if(!part.node.activeInHierarchy||!part.sprite.enabled)return;const r=this.assets.art(part.resource).opaque,m=core.Math2D.multiply(inverse,this.affine(part.node));[[r[0],r[1]],[r[2],r[1]],[r[0],r[3]],[r[2],r[3]]].forEach(p=>points.push(core.Math2D.transform(m,...p)));});if(!points.length)return [0,0,0,0];const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs)-42,y=Math.min(...ys)-42;return [x,y,Math.max(...xs)+42-x,Math.max(...ys)+42-y];}
    private affine(node:Node){const m=node.worldMatrix;return [m.m00,-m.m01,-m.m04,m.m05,m.m12,-m.m13];}
    deform(pose: SoftPose) {
        const body = this.nodes.get('Skeleton2D/Ground/Body/OriginalBody');
        const inverseBody = core.Math2D.inverse(this.affine(body));
        for (const part of this.meshes) {
            const toBody = core.Math2D.multiply(inverseBody, this.affine(part.node));
            if (deformPart(part.mesh, part.node.name, pose, toBody)) part.sprite.geometryChanged();
        }
    }
}
