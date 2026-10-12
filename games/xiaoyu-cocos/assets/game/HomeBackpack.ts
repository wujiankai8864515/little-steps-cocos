import { Color, Material, Node, Sprite, UIOpacity, UITransform, Vec3, Vec4 } from 'cc';
import { GameAssets } from './Assets';
import { core, meshSprite, Scope } from './Engine';
import { BackpackGeometry, BackpackPart, backpackSample } from './BackpackGeometry';
import { HomeClock } from './HomeClock';
import { HomeLighting } from './HomeLighting';
import { homeLighting } from './LightingSnapshot';
import { nodeAt } from './Visual';
import { APPROVED_BAG, APPROVED_BIND, APPROVED_MASK, ApprovedBackpackGeometry } from './ApprovedBackpackGeometry';
import { BackpackWear, WearBones } from './BackpackWear';
import { XiaoyuRig } from './XiaoyuRig';

const ATLAS='res://assets/round2/backpack_parts_atlas.png',MASK='res://home/interaction/alpha_masks/backpack_parts.res';
type Layer={node:Node;z:number;order:number};
type Part={pose:BackpackPart;node:Node;sprite:any;joints:Node[];layer:Layer;shadows:Array<{node:Node;sprite:any;material:Material;layer:Layer}>;revision:number};
type ApprovedPart={key:string;node:Node;sprite:any;passes:Array<{node:Node;sprite:any;material:Material}>};
export class HomeBackpack {
    readonly geometry:BackpackGeometry;readonly layers:Layer[];readonly approved=new ApprovedBackpackGeometry();readonly wear:BackpackWear;
    travelRehanging=false;
    layerRevision=0;depth=-10;projectionAlpha=1;
    private rendered:Part[]=[];private wornParts:ApprovedPart[]=[];private reported=false;private tailRest:boolean;private alpha=1;private floorPasses=0;
    private presentation:Node=null;private members:Array<{node:Node;index:number}>=[];private settleStart:{scale:number[];angle:number};
    constructor(private room:Node,readonly proxy:Node,private assets:GameAssets,scope:Scope,lighting:HomeLighting,private clock:HomeClock,private rig:XiaoyuRig,private floor=()=>951,private lampEnergy?:()=>number){
        this.geometry=new BackpackGeometry(assets.json('res://assets/round2/backpack_parts_contract.json'),assets.json('res://home/secondary/backpack_ribbon_profile.json'));
        this.wear=new BackpackWear({position:[proxy.position.x,-proxy.position.y],scale:[proxy.scale.x,proxy.scale.y],rotation:-proxy.angle*Math.PI/180});
        this.tailRest=rig.backpackNodes().tail.active;scope.own(()=>{rig.backpackNodes().tail.active=this.tailRest;});
        const spec=assets.art(ATLAS);this.layers=[];
        for(const pose of this.geometry.parts.values()){
            const make=(parent:Node)=>{const sprite=parent.addComponent(meshSprite());sprite.configure(pose.mesh,spec.size,spec.content);sprite.spriteFrame=assets.frame(ATLAS,scope);sprite.sizeMode=Sprite.SizeMode.CUSTOM;return sprite;};
            const frame=nodeAt(room,'BackpackFrame_'+pose.key),node=nodeAt(frame,'Backpack_'+pose.key),sprite=make(node),r=pose.definition.rect;
            lighting.receiver(sprite,spec,1,[r[0]/spec.size[0],r[1]/spec.size[1],r[2]/spec.size[0],r[3]/spec.size[1]],'part');
            let parent=nodeAt(node,'AttachmentSkeleton');const joints:Node[]=[];for(let i=0;i<3;i++){parent=nodeAt(parent,'Joint'+i,0,i?pose.span/3:0);joints.push(parent);}
            const shadows=['Celestial','Lamp'].map((name,index)=>{const frame=nodeAt(room,'BackpackFrame_'+pose.key+name),node=nodeAt(frame,'Backpack_'+pose.key+name),sprite=make(node),material=new Material();material.initialize({effectAsset:assets.effect('home-part-shadow'),defines:{USE_TEXTURE:true}});sprite.customMaterial=material;scope.own(()=>material.destroy());const layer={node:frame,z:-12,order:1900+this.rendered.length*2+index};this.layers.push(layer);return {node,sprite,material,layer};});
            const layer={node:frame,z:pose.key.indexOf('shell')>=0?-10:-11,order:1920+this.rendered.length};this.layers.push(layer);this.rendered.push({pose,node,sprite,joints,shadows,layer,revision:-1});
        }
        const wornSpec=assets.art(APPROVED_BAG);
        if(wornSpec.mipResources?.length){const texture=assets.texture(APPROVED_BAG);texture.mipmaps=[texture.image,...wornSpec.mipResources.map(resource=>assets.image(resource))];}
        this.approved.parts.forEach((part,index)=>{
            const node=nodeAt(room,'ApprovedBackpack_'+part.key),make=(node:Node,mesh:any)=>{const sprite=node.addComponent(meshSprite());sprite.configure(mesh,wornSpec.size,wornSpec.content);sprite.spriteFrame=assets.frame(APPROVED_BAG,scope);sprite.sizeMode=Sprite.SizeMode.CUSTOM;return sprite;},sprite=make(node,part.mesh);
            lighting.receiver(sprite,wornSpec,1,[20/1254,85/1254,1210/1254,1110/1254],'part');this.layers.push({node,z:part.key==='near_band'?13:10,order:1940+index});
            const passes=part.passes.map((mesh,i)=>{
                mesh.vertexData=new Float32Array(mesh.source.length/2*3);const node=nodeAt(room,'ApprovedBackpack_'+part.key+(i?'LampFloor':'NaturalFloor')),sprite=make(node,mesh),material=new Material();material.initialize({effectAsset:assets.effect('home-shadow'),defines:{USE_TEXTURE:true}});sprite.customMaterial=material;scope.own(()=>material.destroy());material.setProperty('sourceUV',new Vec4(wornSpec.content[0]/1254,wornSpec.content[1]/1254,wornSpec.content[2]/1254,wornSpec.content[3]/1254));material.setProperty('textureSize',new Vec4(1254,1254,0,0));this.layers.push({node,z:1,order:1950+index*2+i});return {node,sprite,material};
            });
            this.wornParts.push({key:part.key,node,sprite,passes});
        });
        this.advance(0);this.updateShadows();console.info('[LittleSteps] original backpack ready '+JSON.stringify(this.snapshot()));
    }
    private roomPoint(node:Node,p:number[]){const world=node.getComponent(UITransform).convertToWorldSpaceAR(new Vec3(p[0],-p[1])),at=this.room.getComponent(UITransform).convertToNodeSpaceAR(world);return [at.x,-at.y];}
    private affine(node:Node){const m=node.worldMatrix;return [m.m00,-m.m01,-m.m04,m.m05,m.m12,-m.m13];}
    private bodyFrame(){return core.Math2D.multiply(core.Math2D.multiply(core.Math2D.inverse(this.affine(this.room)),this.affine(this.rig.backpackNodes().body)),APPROVED_BIND);}
    private bones():WearBones{const n=this.rig.backpackNodes();return {grip:-n.grip.angle*Math.PI/180,shoulder:[n.shoulder.position.x,-n.shoulder.position.y],tailScale:[n.tailBone.scale.x,n.tailBone.scale.y]};}
    private applyBones(b:WearBones){const n=this.rig.backpackNodes();n.grip.angle=-b.grip*180/Math.PI;n.shoulder.setPosition(b.shoulder[0],-b.shoulder[1]);n.tailBone.setScale(b.tailScale[0],b.tailScale[1],1);}
    private applyProxy(){const p=this.wear.pose;this.proxy.setPosition(p.position[0],-p.position[1]);this.proxy.setScale(p.scale[0],p.scale[1],1);this.proxy.angle=-p.rotation*180/Math.PI;this.depth=this.wear.depth;}
    setPresentation(parent:Node=null){if(parent===this.presentation)return;if(this.presentation){this.members.forEach(m=>{m.node.setParent(this.room);m.node.setSiblingIndex(m.index);});this.members=[];}this.presentation=parent;if(parent){this.members=[...this.rendered.map(r=>r.node.parent),...this.rendered.reduce((a,r)=>a.concat(r.shadows.map(s=>s.node.parent)),[] as Node[]),...this.wornParts.map(r=>r.node)].map(node=>({node,index:node.getSiblingIndex()}));this.members.forEach(m=>m.node.setParent(parent));}this.advance(0);this.updateShadows();}
    setInteractionAnchor(at:number[],lift:number,depth:number,offset:number[]){this.proxy.setPosition(at[0]-offset[0],-at[1]+offset[1]+lift);this.depth=depth;this.advance(0);this.updateShadows();}
    captureSettle(){this.settleStart={scale:[this.proxy.scale.x,this.proxy.scale.y],angle:this.proxy.angle};}
    settleTransform(amount:number){const start=this.settleStart,wall=this.wear.wall;this.proxy.setScale(start.scale[0]+(wall.scale[0]-start.scale[0])*amount,start.scale[1]+(wall.scale[1]-start.scale[1])*amount,1);const target=-wall.rotation*180/Math.PI,diff=Math.atan2(Math.sin((target-start.angle)*Math.PI/180),Math.cos((target-start.angle)*Math.PI/180));this.proxy.angle=start.angle+diff*180/Math.PI*amount;this.advance(0);}
    restoreWall(){this.wear.finish();this.applyProxy();this.geometry.setWorn(false,true);this.advance(0);this.updateShadows();}
    visualBounds(){const frame=this.presentation||this.room,points:number[][]=[];for(const r of this.rendered){if(!r.node.activeInHierarchy)continue;const matrix=core.Math2D.multiply(core.Math2D.inverse(this.affine(frame)),this.affine(r.node));for(let i=0;i<r.pose.mesh.vertices.length;i+=2)points.push(core.Math2D.transform(matrix,r.pose.mesh.vertices[i],r.pose.mesh.vertices[i+1]));}if(this.approved.blend>.0001){const b=this.approved.bounds();points.push([b[0],b[1]],[b[0]+b[2],b[1]+b[3]]);}if(!points.length)return [0,0,0,0];const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);return [x,y,Math.max(...xs)-x,Math.max(...ys)-y];}
    syncLightingOrigin(){const frame=this.presentation||this.room,p=frame.worldPosition,s=frame.worldScale;this.rendered.forEach(r=>r.sprite.customMaterial.setProperty('roomOrigin',new Vec4(p.x,p.y,s.x,s.y)));this.wornParts.forEach(r=>r.sprite.customMaterial.setProperty('roomOrigin',new Vec4(p.x,p.y,s.x,s.y)));}
    private setFrame(node:Node,part:BackpackPart,shift=[0,0]){const at=this.roomPoint(this.proxy,[0,0]),frame=node.parent;frame.setPosition(at[0]+shift[0],-at[1]-shift[1]);frame.setScale(this.proxy.scale);frame.angle=this.proxy.angle;node.setPosition(part.position[0],-part.position[1]);node.setScale(part.scale[0],part.scale[1],1);node.angle=-part.rotation*180/Math.PI;}
    showWorn(){const ground=[this.rig.root.position.x+335,-this.rig.root.position.y+336];if(this.wear.mode==='returning'){this.wear.finish();this.applyProxy();this.geometry.setWorn(false,true);}if(!this.wear.show(ground,this.bones(),{position:[this.proxy.position.x,-this.proxy.position.y],scale:[this.proxy.scale.x,this.proxy.scale.y],rotation:-this.proxy.angle*Math.PI/180}))return;this.geometry.setWorn(true);this.advance(0);this.updateShadows();}
    restore(immediate=false){const changed=this.wear.restore(immediate);if(!changed)return;this.applyBones(this.wear.bones);this.geometry.setWorn(false,immediate);this.applyProxy();this.advance(0);this.updateShadows();}
    interruptReturn(){if(this.wear.interrupt()){this.geometry.resumeFreeDrag();this.advance(0);this.updateShadows();}}
    setDepartureAlpha(value:number){this.alpha=Number.isFinite(value)?Math.max(0,Math.min(value,1)):1;}
    private opacity(node:Node){return (node.getComponent(UIOpacity)?.opacity??255)/255;}
    private layerDepth(layer:Layer,depth:number){if(layer.z!==depth){layer.z=depth;this.layerRevision++;}}
    advance(delta:number){
        const ground=[this.rig.root.position.x+335,-this.rig.root.position.y+336],animated=this.wear.mode==='worn'||this.wear.mode==='returning';this.wear.advance(delta,ground);if(this.wear.mode==='worn')this.applyBones(this.wear.bones);if(animated)this.applyProxy();
        this.geometry.advance(delta,this.roomPoint(this.proxy,[0,0]),this.depth,ground);
        for(const r of this.rendered){const p=r.pose;this.setFrame(r.node,p);r.node.active=p.visible&&this.proxy.activeInHierarchy;r.sprite.color=new Color(255,255,255,255);r.sprite.customMaterial.setProperty('partOpacityState',new Vec4(p.opacity*this.alpha*this.opacity(this.proxy),0,0,0));this.layerDepth(r.layer,p.depth);r.shadows.forEach(s=>this.layerDepth(s.layer,this.depth-2));r.joints.forEach((joint,i)=>joint.angle=-p.angles[i]*180/Math.PI);if(r.revision!==p.revision){r.sprite.geometryChanged();r.shadows.forEach(s=>s.sprite.geometryChanged());r.revision=p.revision;}}
        this.approved.update(this.bodyFrame(),this.geometry.wearAmount);this.rig.backpackNodes().tail.active=this.tailRest&&this.approved.blend<.5;
        this.wornParts.forEach(r=>{r.node.active=this.approved.blend>.0001&&this.proxy.activeInHierarchy;r.sprite.color=new Color(255,255,255,255);r.sprite.customMaterial.setProperty('partOpacityState',new Vec4(this.approved.blend*this.alpha*this.opacity(this.proxy),0,0,0));r.sprite.geometryChanged();});
        if(this.presentation)this.layers.filter(layer=>layer.node.parent===this.presentation).sort((a,b)=>a.z-b.z||a.order-b.order).forEach((layer,index)=>layer.node.setSiblingIndex(index));
        if(!this.reported&&this.geometry.phase>=1.2){this.reported=true;console.info('[LittleSteps] original backpack motion '+JSON.stringify(this.snapshot()));}
    }
    updateShadows(){
        const state=homeLighting(this.clock.hour(),this.clock.lampWeight(),this.lampEnergy?.()),moon=state.moonEnergy>state.sunEnergy,dir=moon?state.moonCast:state.cast,extent=moon?1.6:state.cot,origin=this.room.worldPosition,scale=this.room.worldScale,wallOrigin=(this.presentation||this.room).worldPosition,wallScale=(this.presentation||this.room).worldScale;
        for(const r of this.rendered){const at=this.roomPoint(r.node,[0,0]),lamp=[at[0]-465,at[1]-468],n=Math.hypot(...lamp),lampDir=n?lamp.map(v=>v/n):[0,0],shifts=[dir.map(v=>v*Math.min(extent,2.4)*16),lampDir.map(v=>v*16*1.1)],strengths=[Math.max(state.sunEnergy,state.moonEnergy)*.28,state.lampEnergy/.78*.24];
            r.shadows.forEach((pass,i)=>{pass.node.active=this.geometry.mode==='hanging'&&r.node.activeInHierarchy&&strengths[i]>.001;this.setFrame(pass.node,r.pose,shifts[i]);pass.sprite.color=new Color(255,255,255,r.pose.opacity*this.alpha*this.opacity(this.proxy)*255);pass.material.setProperty('roomOrigin',new Vec4(wallOrigin.x,wallOrigin.y,wallScale.x,wallScale.y));pass.material.setProperty('castState',new Vec4(dir[0],dir[1],0,0));pass.material.setProperty('sunVectorState',new Vec4(0,0,0,extent));pass.material.setProperty('partShadowState',new Vec4(strengths[i],0,i,0));});
        }
        const naturalDir=state.sunEnergy>0?state.cast:state.moonCast,cot=state.sunEnergy>0?state.cot:1.6,naturalEnergy=state.sunEnergy>0?state.sunEnergy:state.moonEnergy*.34,penumbra=state.sunEnergy>0?1.35+(.7-1.35)*state.noon:1.25;
        const xs:number[]=[];for(const r of this.rendered){if(!r.node.activeInHierarchy)continue;for(let i=0;i<r.pose.mesh.vertices.length;i+=2)xs.push(this.roomPoint(r.node,[r.pose.mesh.vertices[i],r.pose.mesh.vertices[i+1]])[0]);}if(this.approved.blend>.0001){const bounds=this.approved.bounds();xs.push(bounds[0],bounds[0]+bounds[2]);}const center=xs.length?(Math.min(...xs)+Math.max(...xs))/2:0,ground=this.floor();
        const directions=[[naturalDir[0]*cot*.72,naturalDir[1]*.72*cot*.72],[(center-465)/420*.72,(ground-888)*.8/420*.72]];
        const active=!this.presentation&&this.approved.blend>.0001&&this.proxy.activeInHierarchy&&this.rig.root.activeInHierarchy&&this.rig.liftHeight<=.5&&this.rig.root.parent===this.room,opacity=this.approved.blend*Math.min(this.alpha,this.opacity(this.rig.root),this.projectionAlpha);if(active||this.approved.floorRebuilds===0)this.approved.project(this.bodyFrame(),directions,active?ground:951);this.floorPasses=0;
        this.wornParts.forEach(r=>r.passes.forEach((pass,i)=>{const strength=i?state.lampEnergy*.5:naturalEnergy*.72;pass.node.active=active&&strength>.001&&opacity>.0001;if(pass.node.active)this.floorPasses++;pass.sprite.geometryChanged();pass.material.setProperty('roomOrigin',new Vec4(origin.x,origin.y,scale.x,scale.y));pass.material.setProperty('castState',new Vec4(naturalDir[0],naturalDir[1],0,0));pass.material.setProperty('shadowState',new Vec4(cot,strength,i?1:penumbra,.72));pass.material.setProperty('shadowFlags',new Vec4(1,i?0:1,i?1:0,opacity));}));
    }
    hit(world:number[]){if(this.travelRehanging)return false;if(!world.every(Number.isFinite)||!this.proxy.activeInHierarchy)return false;const room=(this.presentation||this.room).getComponent(UITransform).convertToNodeSpaceAR(new Vec3(world[0],world[1])),covered=!this.presentation&&this.geometry.mode==='worn'&&this.rig.coversBackpack(world,10);if(this.approved.hit([room.x,-room.y],(x,y)=>this.assets.bitmapContains(APPROVED_MASK,x,y),covered))return true;for(const r of this.rendered){if(!r.node.activeInHierarchy||!this.presentation&&this.geometry.mode==='worn'&&this.rig.coversBackpack(world,r.layer.z))continue;const p=r.node.getComponent(UITransform).convertToNodeSpaceAR(new Vec3(world[0],world[1])),uv=backpackSample(r.pose.mesh.vertices,r.pose.mesh.source,r.pose.mesh.indices,[p.x,-p.y],true);if(uv&&this.assets.bitmapContains(MASK,Math.floor(uv[0]),Math.floor(uv[1])))return true;}return false;}
    beginTravelRehang(source:number[]){
        this.restore(true);this.restoreWall();this.proxy.active=true;this.advance(0);
        const end=core.Math2D.multiply(core.Math2D.inverse(this.affine(this.room)),this.affine(this.proxy)),anchor=this.geometry.hangingAnchor();
        const points:number[][]=[];
        for(const part of this.geometry.parts.values())if(part.visible)for(let i=0;i<part.mesh.vertices.length;i+=2){const p=part.transform([part.mesh.vertices[i],part.mesh.vertices[i+1]]);points.push(core.Math2D.transform(end,p[0],p[1]));}
        const x=Math.min(...points.map(p=>p[0])),y=Math.min(...points.map(p=>p[1])),w=Math.max(...points.map(p=>p[0]))-x,h=Math.max(...points.map(p=>p[1]))-y;
        const center=core.Math2D.transform(core.Math2D.inverse(end),x+w/2,y+h/2),factor=Math.min(source[2]/Math.max(w,1),source[3]/Math.max(h,1)),start=end.slice();
        for(let i=0;i<4;i++)start[i]*=factor;start[4]=source[0]+source[2]/2-start[0]*center[0]-start[2]*center[1];start[5]=source[1]+source[3]/2-start[1]*center[0]-start[3]*center[1];
        this.travelRehanging=true;this.depth=221;this.applyTravelRehang(start,0);
        return {startTransform:start,endTransform:end,anchorLocal:anchor,start:core.Math2D.transform(start,...anchor),end:core.Math2D.transform(end,...anchor)};
    }
    applyTravelRehang(frame:number[],alpha:number){
        if(!this.travelRehanging)return;this.proxy.setPosition(frame[4],-frame[5]);this.proxy.setScale(Math.hypot(frame[0],frame[1]),Math.hypot(frame[2],frame[3]),1);this.proxy.angle=-Math.atan2(frame[1],frame[0])*180/Math.PI;this.proxy.active=true;this.alpha=Math.max(0,Math.min(1,alpha));this.advance(0);this.updateShadows();
    }
    finishTravelRehang(){if(!this.travelRehanging)return;this.travelRehanging=false;this.alpha=1;this.proxy.active=true;this.restoreWall();}
    reset(){this.geometry.reset(this.roomPoint(this.proxy,[0,0]),this.depth);this.advance(0);this.updateShadows();}
    snapshot(){return {...this.geometry.snapshot(),proxy:this.roomPoint(this.proxy,[0,0]),wear:this.wear.snapshot(),approved:this.approved.snapshot(),tailVisible:this.rig.backpackNodes().tail.active,presentation:this.presentation?'front-canvas':'room',presentedMeshes:this.members.length,visualBounds:this.visualBounds(),shader:'home-part',mipmapLevels:this.assets.texture(APPROVED_BAG).mipmapLevel,shadowPasses:this.rendered.length*2,wornProjection:{meshes:5,passNodes:10,visiblePasses:this.floorPasses,floor:this.approved.floor,rebuilds:this.approved.floorRebuilds},limits:'Original hanging/worn rig and bag drag adapter; other props, departure/travel and device acceptance pending'};}
}
