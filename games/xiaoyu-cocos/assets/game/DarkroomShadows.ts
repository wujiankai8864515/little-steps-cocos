import { Color, Graphics, Material, Node, Sprite, Vec4 } from 'cc';
import { GameAssets } from './Assets';
import { core, meshSprite, Scope } from './Engine';
import { DOLL_PARTS } from './DollSkin';
import { DarkroomRound } from './DarkroomRound';
import { DarkroomLighting, darkMaterial } from './DarkroomLighting';
import { DarkroomTools } from './DarkroomTools';
import { clamp, smooth } from './DarkroomVisualRules';
import { nodeAt } from './Visual';

type Caster={name:string;root:Node;sprite:any;material:Material;contact:Graphics;profile:number[][];paths:number[][][];bounds:number[];region:number[];map:(at:number[])=>number[];doll:boolean;foot:boolean;clip:number[];mesh:any};
export class DarkroomShadows {
    readonly layers:Array<{node:Node;z:number}>=[];private casters:Caster[]=[];
    constructor(private room:Node,assets:GameAssets,scope:Scope,private lighting:DarkroomLighting,private round:DarkroomRound,tools:DarkroomTools,lantern:Node,private accumulator=0){
        const data=round.rig.geometry;
        for(const id of DOLL_PARTS){const g=data.parts[id];this.add(assets,scope,id,'res://assets/doll_idle.png',g.profile,g.bounds,g.rect.slice(0,2),at=>round.rig.worldPoint([at[0]+g.rect[0],at[1]+g.rect[1]]),[100,745,520,160],2,true,id.indexOf('leg')>=0);}
        const profile:number[][]=[],bounds=[161,38,190,414],resource='res://darkroom/assets/round2/lantern_cranes.png';
        for(let x=bounds[0];x<bounds[0]+bounds[2];x+=4)for(let y=bounds[1]+bounds[3]-1;y>=bounds[1];y--)if(assets.alpha(resource,x,y)>.52){profile.push([x,y]);break;}
        const mapper=(root:Node,pivot:number[])=>((at:number[])=>{const local=core.Math2D.trs([root.position.x,-root.position.y],-root.angle*Math.PI/180,[root.scale.x,root.scale.y]);return core.Math2D.transform(local,at[0]-pivot[0],at[1]-pivot[1]);});
        this.add(assets,scope,'Lantern',resource,profile,bounds,[0,0],mapper(lantern,[256,455]),[22,637,112,42],1);
        for(const t of tools.trays)this.add(assets,scope,t.tool+'Tray',t.resource,t.geometry.profile,t.geometry.bounds,[0,0],mapper(t.root,t.fit.pivot),t.tool==='needle'?[45,940,280,120]:[397,942,270,117],3);
        this.sync();
    }
    private add(assets:GameAssets,scope:Scope,name:string,resource:string,points:number[][],bounds:number[],region:number[],map:(at:number[])=>number[],clip:number[],z:number,doll=false,foot=false){
        let profile=points.map(p=>p.slice()),paths=[points.map(p=>p.slice())];
        if(name==='Lantern'){
            const threshold=bounds[1]+bounds[3]-bounds[3]*.045,support:number[][]=[];paths=[];let path:number[][]=[];
            for(const p of profile){if(p[1]>=threshold){support.push(p);path.push(p);}else if(path.length){paths.push(path);path=[];}}if(path.length)paths.push(path);
            if(support.length){const y=(x:number)=>{if(x<=support[0][0])return support[0][1];for(let i=1;i<support.length;i++)if(x<=support[i][0]){const a=support[i-1],b=support[i];return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);}return support[support.length-1][1];};profile=profile.map(p=>[p[0],y(p[0])]);}
        }
        if(profile.length<2)throw new Error('原影子轮廓不足：'+name);
        const source:number[]=[],indices:number[]=[];for(const p of profile)source.push(p[0]+region[0],bounds[1]+region[1],p[0]+region[0],p[1]+region[1]);for(let i=0;i<profile.length-1;i++){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
        const mesh={source:new Float32Array(source),vertices:new Float32Array(source.length),indices:new Uint16Array(indices)},root=nodeAt(this.room,name+'AlphaShadow'),sprite=nodeAt(root,'SourceAlphaSupportStrip').addComponent(meshSprite()),spec=assets.art(resource);sprite.configure(mesh,spec.size,spec.content);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=assets.frame(resource,scope);
        const material=darkMaterial(assets,scope,'shadow',spec);sprite.customMaterial=material;
        if(doll){material.setProperty('sourceDisplayMask',assets.texture('res://darkroom/assets/round3/doll_source_display_mask.res'));const g=this.round.rig.geometry.parts[name];material.setProperty('textureBounds',new Vec4(g.rect[0]/512,g.rect[1]/512,(g.rect[0]+g.rect[2])/512,(g.rect[1]+g.rect[3])/512));}
        else {const c=spec.content,s=spec.size;material.setProperty('textureBounds',new Vec4(c[0]/s[0],c[1]/s[1],(c[0]+c[2])/s[0],(c[1]+c[3])/s[1]));}
        const contact=nodeAt(root,'PhysicalContactPaths').addComponent(Graphics);this.casters.push({name,root,sprite,material,contact,profile,paths,bounds,region,map,clip,mesh,doll,foot});this.layers.push({node:root,z});
    }
    retainClock(){return this.accumulator;}
    advance(delta:number){this.accumulator+=delta;if(this.accumulator>=1/24||this.round.pointerDragged){this.accumulator=0;this.sync();}}
    sync(){const light=this.lighting.shadow(),r=this.round,o=this.room.worldPosition,z=this.room.worldScale;
        for(const s of this.casters){const fade=s.doll?(r.clearTime>=0?1-smooth(.2,1,r.clearProgress):1)*r.spawnAlpha*Number(r.dollVisible):1,strength=light.strength*fade,contact=light.contact*fade;
            const direction=light.cast.map(v=>v*(s.name.indexOf('Tray')>=0?.18:1)),ground=s.doll?r.rig.groundY:NaN,lift=s.doll?Math.max(r.rig.supportLift,s.foot?ground-r.rig.partBottomY(s.name):0):0,clip=s.doll?[r.rig.root[0]-250,ground-40,500,180]:s.clip;
            s.root.active=fade>0&&(strength>.001||contact>.001);s.sprite.enabled=strength>.001;
            s.profile.forEach((p,i)=>{let bottom=s.map(p),top=s.map([p[0],s.bounds[1]]),end:number[];
                if(s.doll){end=[top[0]+direction[0]*Math.max(ground-top[1],0),ground+direction[1]*Math.max(ground-top[1],0)];bottom=[bottom[0]+direction[0]*Math.max(ground-bottom[1],0),ground+direction[1]*Math.max(ground-bottom[1],0)];}
                else {bottom[1]+=lift;end=bottom.map((v,j)=>v+direction[j]*Math.max(bottom[1]-top[1],0));}
                for(let j=0;j<2;j++){s.mesh.vertices[i*4+j]=clamp(end[j],clip[j],clip[j]+clip[j+2]);s.mesh.vertices[i*4+2+j]=clamp(bottom[j],clip[j],clip[j]+clip[j+2]);}
            });s.sprite.geometryChanged();s.material.setProperty('roomOrigin',new Vec4(o.x,o.y,z.x,z.y));s.material.setProperty('darkState',new Vec4(strength,s.doll?r.rig.contract.parts[s.name].id:-1,0,0));
            const g=s.contact;g.clear();if((s.foot||!s.doll)&&lift<=12&&contact>.001){g.strokeColor=new Color(.055*255,.035*255,.045*255,contact*255);g.lineWidth=3;for(const path of s.paths){path.forEach((p,i)=>{const q=s.map(p);if(i)g.lineTo(q[0],-q[1]-lift);else g.moveTo(q[0],-q[1]-lift);});g.stroke();}}
        }
    }
    snapshot(){return this.casters.map(s=>({source:s.name,alpha_profile_points:s.profile.length,physical_contact_paths:s.paths.length,passes:1,draw_contact:s.foot||!s.doll,visible:s.root.active}));}
}
