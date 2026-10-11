import { core } from './Engine';

// Original darkroom/helpers/articulated_doll.gd. Source-space ownership and
// weights stay authored data; all seven passes share ONE continuous mesh.
export const DOLL_PARTS=['torso','left_arm','right_arm','head','left_leg','right_leg','bow'];
const LIMITS=[[-.1,.1],[-.14,.11],[-.11,.14],[-.065,.065],[-.085,.07],[-.07,.085],[-.035,.035]];
const f=Math.fround,clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const vector=(x:number,y:number)=>[f(x),f(y)];
export class DollSkin {
    readonly mesh:{source:Float32Array;vertices:Float32Array;indices:Uint16Array};
    readonly angles=DOLL_PARTS.map(()=>0);readonly velocities=DOLL_PARTS.map(()=>0);
    readonly joints:number[][]=[];readonly matrices:number[][]=[];
    readonly cells:number[][]=[];readonly contour:number[][];
    root=[363,809];rootRotation=0;groundY=809;supportLift=0;
    dragging=false;expression='idle';expressionTime=0;elapsed=0;
    substeps=0;hitSerial=0;lastHitPart='torso';revision=0;
    private lastAngles:number[]=[];
    constructor(readonly contract:any,readonly geometry:any,private mask:(part:string,x:number,y:number)=>boolean){
        if(contract.size[0]!==512||contract.size[1]!==512||geometry.skin_weights.length!==1089||geometry.skin_visible_cells.length!==1024)throw new Error('Invalid authored doll mesh');
        for(const row of geometry.skin_weights)if(row.length!==7||row.some((w:number)=>!Number.isFinite(w)||w<0)||Math.abs(row.reduce((s:number,w:number)=>s+w,0)-1)>1e-4)throw new Error('Invalid authored doll weights');
        const source=new Float32Array(1089*2),indices:number[]=[];
        for(let y=0;y<33;y++)for(let x=0;x<33;x++){const at=(y*33+x)*2;source[at]=x*16;source[at+1]=y*16;}
        for(let y=0;y<32;y++)for(let x=0;x<32;x++)if(geometry.skin_visible_cells[y*32+x]){const a=y*33+x;indices.push(a,a+1,a+33,a+1,a+34,a+33);}
        this.mesh={source,vertices:new Float32Array(source.length),indices:new Uint16Array(indices)};
        this.contour=geometry.source_contour;this.update(true);this.groundY=this.footSupportY();
    }
    worldMatrix(){return core.Math2D.trs(this.root,this.rootRotation,[this.contract.uniform_display_scale,this.contract.uniform_display_scale]);}
    setExpression(next:string,seconds=0){this.expression=next;this.expressionTime=seconds;}
    faceReaction(){return ({blink:.55,needle:.32,slipper:-.16,relief:.12} as any)[this.expression]||0;}
    setDragging(value:boolean){this.dragging=value;if(value)this.setExpression('slipper',.18);}
    applyContact(tool:string,at:number[]){
        let part=this.partAt(at)||'torso';if(part==='bow')part='torso';const index=DOLL_PARTS.indexOf(part);
        this.hitSerial++;this.lastHitPart=part;
        const world=core.Math2D.multiply(this.worldMatrix(),this.joints[index]),local=core.Math2D.transform(core.Math2D.inverse(world),...at);
        const side=local[0]<0?-1:1,power=tool==='needle'?1.3:3.1;
        this.velocities[index]=clamp(this.velocities[index]+side*power,-6,6);
        this.velocities[0]=clamp(this.velocities[0]+side*power*.2,-3,3);
        this.velocities[6]=clamp(this.velocities[6]-side*power*.8,-6,6);
        if(tool==='slipper'){this.velocities[3]=side*1.7;this.velocities[1]=-1.9;this.velocities[2]=1.7;}
        this.setExpression(tool,tool==='needle'?.23:.38);
    }
    advance(delta:number,acceleration=[0,0]){
        if(!Number.isFinite(delta)||!acceleration.every(Number.isFinite))return;
        const duration=clamp(delta,0,1/30);this.substeps=clamp(Math.ceil(duration*120),1,4);
        const length=Math.hypot(...acceleration),factor=(length>2400?2400/length:1)/this.contract.uniform_display_scale;
        const inertial=vector(acceleration[0]*factor,acceleration[1]*factor);
        for(let i=0;i<this.substeps;i++)this.step(duration/this.substeps,inertial);
        this.elapsed+=Math.max(delta,0);
        if(this.expressionTime>0){this.expressionTime=Math.max(0,this.expressionTime-delta);if(this.expressionTime<=0)this.setExpression('idle');}
        else if(this.expression==='idle'&&this.elapsed%4.6<duration)this.setExpression('blink',.11);
        this.update();
    }
    private step(delta:number,acceleration:number[]){
        for(let i=0;i<7;i++){
            const id=DOLL_PARTS[i],limb=i===1||i===2||i===4||i===5;
            let stiffness=limb?30:i===6?82:45,damping=limb?8.5:i===6?9:9.5;
            const spec=this.contract.parts[id],centroid=this.geometry.parts[id].centroid,com=vector(centroid[0]-spec.source_pivot[0],centroid[1]-spec.source_pivot[1]);
            let torque=clamp((com[1]*acceleration[0]-com[0]*acceleration[1])/Math.max(com[0]**2+com[1]**2,1200),-42,42);
            if(this.dragging&&limb){const restDown=Math.atan2(com[0],com[1])-this.rootRotation-this.angles[0];torque+=Math.sin(restDown-this.angles[i])*62;stiffness=7;damping=7.2;}
            if(id==='head')torque*=.34;if(id==='bow')torque*=1.25;
            let omega=clamp(this.velocities[i]+(-this.angles[i]*stiffness-this.velocities[i]*damping+torque)*delta,-6,6);
            const angle=this.angles[i]+omega*delta,bounded=clamp(angle,LIMITS[i][0],LIMITS[i][1]);
            if(bounded!==angle)omega=-omega*.08;
            this.angles[i]=f(bounded);this.velocities[i]=omega;
        }
    }
    update(force=false){
        if(!force&&this.lastAngles.length===7&&this.angles.every((v,i)=>v===this.lastAngles[i]))return false;
        this.lastAngles=this.angles.slice();const math=core.Math2D,origin=this.contract.root_source_origin;
        for(let i=0;i<7;i++){
            const spec=this.contract.parts[DOLL_PARTS[i]],pivot=spec.source_pivot,parent=i?this.contract.parts[spec.parent].source_pivot:origin;
            const local=math.trs([pivot[0]-parent[0],pivot[1]-parent[1]],this.angles[i]);
            this.joints[i]=(i?math.multiply(this.joints[DOLL_PARTS.indexOf(spec.parent)],local):local).map(f);
            const m=this.joints[i].slice(),basis=math.basis(m,...pivot);m[4]=f(m[4]-basis[0]);m[5]=f(m[5]-basis[1]);this.matrices[i]=m;
        }
        const out=this.mesh.vertices;
        for(let v=0;v<1089;v++){
            const x=this.mesh.source[v*2],y=this.mesh.source[v*2+1],row=this.geometry.skin_weights[v];let px=0,py=0;
            for(let i=0;i<7;i++){const m=this.matrices[i],w=row[i];px=f(px+f(f(m[0]*x+m[2]*y+m[4])*w));py=f(py+f(f(m[1]*x+m[3]*y+m[5])*w));}
            out[v*2]=px;out[v*2+1]=py;
        }
        this.cells.length=0;
        for(let y=0;y<32;y++)for(let x=0;x<32;x++){
            const a=y*33+x,ids=[a,a+1,a+33,a+34],xs=ids.map(i=>out[i*2]),ys=ids.map(i=>out[i*2+1]);
            this.cells.push([Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]);
        }
        this.revision++;return true;
    }
    sourcePoint(pixel:number[]){
        const column=clamp(Math.floor(pixel[0]/16),0,31),row=clamp(Math.floor(pixel[1]/16),0,31),x=(pixel[0]-column*16)/16,y=(pixel[1]-row*16)/16,a=row*33+column,p=this.mesh.vertices;
        const ids=x+y<=1?[a,a+1,a+33]:[a+34,a+1,a+33],weights=x+y<=1?[1-x-y,x,y]:[x+y-1,1-y,1-x];
        return [0,1].map(axis=>ids.reduce((sum,index,i)=>sum+p[index*2+axis]*weights[i],0));
    }
    worldPoint(pixel:number[]){return core.Math2D.transform(this.worldMatrix(),...this.sourcePoint(pixel));}
    partAt(worldPoint:number[]){
        if(!worldPoint.every(Number.isFinite))return '';
        const point=core.Math2D.transform(core.Math2D.inverse(this.worldMatrix()),...worldPoint),p=this.mesh.vertices;
        for(let cell=0;cell<this.cells.length;cell++){
            const b=this.cells[cell];if(point[0]<b[0]-.01||point[1]<b[1]-.01||point[0]>=b[2]+.01||point[1]>=b[3]+.01)continue;
            const a=Math.floor(cell/32)*33+cell%32;
            for(const ids of [[a,a+1,a+33],[a+1,a+34,a+33]]){
                const ox=p[ids[0]*2],oy=p[ids[0]*2+1],dx=p[ids[1]*2]-ox,dy=p[ids[1]*2+1]-oy,ex=p[ids[2]*2]-ox,ey=p[ids[2]*2+1]-oy,d=dx*ey-dy*ex;
                if(Math.abs(d)<1e-5)continue;const px=point[0]-ox,py=point[1]-oy,u=(px*ey-py*ex)/d,v=(dx*py-dy*px)/d;
                if(u<0||v<0||u+v>1)continue;
                const sx=Math.floor(this.mesh.source[ids[0]*2]+(this.mesh.source[ids[1]*2]-this.mesh.source[ids[0]*2])*u+(this.mesh.source[ids[2]*2]-this.mesh.source[ids[0]*2])*v);
                const sy=Math.floor(this.mesh.source[ids[0]*2+1]+(this.mesh.source[ids[1]*2+1]-this.mesh.source[ids[0]*2+1])*u+(this.mesh.source[ids[2]*2+1]-this.mesh.source[ids[0]*2+1])*v);
                if(sx<0||sy<0||sx>=512||sy>=512)continue;
                for(const id of DOLL_PARTS)if(this.mask(id,sx,sy))return id;
            }
        }
        return '';
    }
    bounds(){const points=this.contour.map(p=>this.worldPoint(p)),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),left=Math.min(...xs),top=Math.min(...ys);return [left,top,Math.max(...xs)-left,Math.max(...ys)-top];}
    partBottomY(id:string){const part=this.geometry.parts[id],rect=part.rect;return Math.max(...part.profile.map((p:number[])=>this.worldPoint([p[0]+rect[0],p[1]+rect[1]])[1]));}
    footSupportY(){return Math.max(this.partBottomY('left_leg'),this.partBottomY('right_leg'));}
    reset(){this.dragging=false;this.supportLift=0;this.angles.fill(0);this.velocities.fill(0);this.setExpression('idle');this.update(true);}
    snapshot(){const angles:any={};DOLL_PARTS.forEach((id,i)=>angles[id]=this.angles[i]);return {parts:7,face_nodes:3,joint_angles:angles,velocities:this.velocities.slice(),dragging:this.dragging,expression:this.expression,substeps:this.substeps,hit_serial:this.hitSerial,last_hit_part:this.lastHitPart,continuous_skin_vertices:1089,continuous_skin_triangles:this.mesh.indices.length/3,neutral_source_scale:this.contract.uniform_display_scale,source_sha256:this.contract.source_sha256,runtime_readbacks:0,head:this.worldPoint([278,35]),bounds:this.bounds(),feet:this.footSupportY(),ground_y:this.groundY,support_lift:this.supportLift};}
}
