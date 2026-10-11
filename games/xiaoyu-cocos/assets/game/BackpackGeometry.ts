// Original spring_mesh_part.gd / articulated_backpack.gd, in source y-down.
// UVs and topology stay fixed while three successive joints deform each part.
export type BackpackMesh={source:Float32Array;vertices:Float32Array;indices:Uint16Array};
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const smooth=(t:number)=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const add=(a:number[],b:number[])=>[a[0]+b[0],a[1]+b[1]];
const sub=(a:number[],b:number[])=>[a[0]-b[0],a[1]-b[1]];
const mul=(p:number[],s:number)=>[p[0]*s,p[1]*s];
const mix=(a:number[],b:number[],t:number)=>a.map((v,i)=>lerp(v,b[i],t));
const cross=(a:number[],b:number[])=>a[0]*b[1]-a[1]*b[0];
const normalized=(v:number[])=>{const n=Math.hypot(...v);return n?mul(v,1/n):[0,0];};
const rotate=(p:number[],a:number)=>[p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a)];
export const BACKPACK_KEYS=['front_shell','side_shell','near_strap','far_strap','top_loop'];

// Strict hit testing uses the actually drawn triangles, not a source rectangle.
// Forward attachment lookup keeps the original 1e-5 seam tolerance.
export function backpackSample(from:Float32Array,to:Float32Array,indices:Uint16Array,point:number[],strict=false):number[] {
    for(let i=0;i<indices.length;i+=3){const a=indices[i]*2,b=indices[i+1]*2,c=indices[i+2]*2,ab=[from[b]-from[a],from[b+1]-from[a+1]],ac=[from[c]-from[a],from[c+1]-from[a+1]],area=cross(ab,ac);
        if(Math.abs(area)<1e-5)continue;const at=[point[0]-from[a],point[1]-from[a+1]],u=cross(at,ac)/area,v=cross(ab,at)/area,epsilon=strict?0:1e-5;
        if(u>=-epsilon&&v>=-epsilon&&u+v<=1+epsilon)return [0,1].map(k=>to[a+k]*(1-u-v)+to[b+k]*u+to[c+k]*v);
    }return null;
}
export class BackpackPart {
    readonly mesh:BackpackMesh;readonly base:Float32Array;readonly pivot:number[];readonly tip:number[];readonly span:number;
    readonly ribbon:number[][];readonly centers:number[]=[];readonly halfWidths:number[]=[];
    angles=[0,0,0];velocities=[0,0,0];drive=0;lastSubsteps=0;revision=0;
    position=[0,0];scale=[1,1];rotation=0;visible=true;opacity=1;depth=-10;
    curve:number[][]=[];ribbonWidth=1;perspective=[1,1,1];endPinEnabled=false;endPin=[0,0];
    readonly frontInterval=[100/387,292/387];readonly frontIndices:Uint16Array;readonly backIndices:Uint16Array;
    constructor(readonly key:string,readonly definition:any,private stiffnessScale=1){
        this.pivot=definition.pivot.slice();this.tip=definition.tip_anchor.slice();const rect=definition.rect;this.span=Math.max(1,rect[3]-this.pivot[1]);this.ribbon=definition.ribbon_profile||[];
        if(this.ribbon.length>48)throw new Error('背带超过原版 48 行预算');
        const source:number[]=[],base:number[]=[],indices:number[]=[];
        if(this.ribbon.length){for(const row of this.ribbon)for(let c=1;c<4;c++){const x=Math.fround(row[c]),y=Math.fround(row[0]);source.push(rect[0]+x,rect[1]+y);base.push(x-this.pivot[0],y-this.pivot[1]);this.centers.push(Math.fround(row[2]));this.halfWidths.push(Math.fround(Math.max(row[2]-row[1],row[3]-row[2])));}
            for(let r=0;r<this.ribbon.length-1;r++)for(let c=0;c<2;c++){const i=r*3+c;indices.push(i,i+1,i+4,i,i+4,i+3);}}
        else {for(let r=0;r<9;r++)for(const x of [0,rect[2]]){const y=rect[3]*r/8;source.push(rect[0]+x,rect[1]+y);base.push(x-this.pivot[0],y-this.pivot[1]);}for(let r=0;r<8;r++){const i=r*2;indices.push(i,i+1,i+3,i,i+3,i+2);}}
        this.base=new Float32Array(base);this.mesh={source:new Float32Array(source),vertices:new Float32Array(base),indices:new Uint16Array(indices)};
        const front:number[]=[],back:number[]=[];for(let i=0;i<indices.length;i+=3){const tri=indices.slice(i,i+3),y=tri.reduce((sum,j)=>sum+this.mesh.source[j*2+1],0)/3-rect[1],t=(y-this.pivot[1])/Math.max(this.tip[1]-this.pivot[1],1);(t>this.frontInterval[0]&&t<this.frontInterval[1]?front:back).push(...tri);}
        this.frontIndices=new Uint16Array(front);this.backIndices=new Uint16Array(back);
    }
    curveSample(t:number){const count=Math.max(1,Math.floor((this.curve.length-1)/3)),segment=Math.min(Math.floor(t*count),count-1),u=clamp(t*count-segment,0,1),v=1-u,i=segment*3,[a,b,c,d]=this.curve.slice(i,i+4);
        return [0,1].map(axis=>[a[axis]*v*v*v+b[axis]*3*v*v*u+c[axis]*3*v*u*u+d[axis]*u*u*u,((b[axis]-a[axis])*3*v*v+(c[axis]-b[axis])*6*v*u+(d[axis]-c[axis])*3*u*u)*count,((c[axis]-2*b[axis]+a[axis])*6*v+(d[axis]-2*c[axis]+b[axis])*6*u)*count*count]).reduce((out,row,axis)=>{row.forEach((value,j)=>out[j][axis]=value);return out;},[[],[],[]] as number[][]);
    }
    private profile(y:number,width=false){
        const at=(row:number[])=>width?Math.max(row[2]-row[1],row[3]-row[2]):row[2];
        if(!this.ribbon.length)return width?this.definition.rect[2]*.5:lerp(this.pivot[0],this.tip[0],clamp((y-this.pivot[1])/Math.max(this.tip[1]-this.pivot[1],1),0,1));
        for(let i=0;i<this.ribbon.length-1;i++){const a=this.ribbon[i],b=this.ribbon[i+1];if(y<=b[0])return lerp(at(a),at(b),clamp((y-a[0])/Math.max(b[0]-a[0],.001),0,1));}return at(this.ribbon[this.ribbon.length-1]);
    }
    private bones(point:number[]){const length=this.span/3,segment=clamp(Math.floor(Math.max(point[1],0)/length),0,2);let origin=[0,0],angle=0;
        for(let i=0;i<=segment;i++){if(i)origin=add(origin,rotate([0,length],angle));angle+=this.angles[i];}return add(origin,rotate([point[0],point[1]-segment*length],angle));
    }
    skin(point:number[],index=-1):number[] {
        if(this.curve.length>=4){const raw=point[1]/Math.max(this.tip[1]-this.pivot[1],1),t=clamp(raw,0,1),[center0,derivative,second]=this.curveSample(t),tangent=normalized(derivative),center=add(center0,mul(derivative,raw-t)),side=[tangent[1],-tangent[0]],sourceCenter=(index>=0?this.centers[index]:this.profile(point[1]+this.pivot[1]))-this.pivot[0];
            let flex=(this.angles[0]*Math.sin(t*Math.PI)+this.angles[1]*Math.sin(t*Math.PI*2)+this.angles[2]*Math.sin(t*Math.PI*3))*this.span*.11;
            const perspective=t<.5?lerp(this.perspective[0],this.perspective[1],t*2):lerp(this.perspective[1],this.perspective[2],(t-.5)*2),curvature=Math.abs(cross(derivative,second))/Math.max(Math.pow(Math.hypot(...derivative),3),.001),radiusLimit=.18/Math.max(curvature,1e-5),halfWidth=index>=0?this.halfWidths[index]:this.profile(point[1]+this.pivot[1],true),width=Math.min(this.ribbonWidth*perspective,radiusLimit/Math.max(halfWidth,1));
            flex=clamp(flex,-radiusLimit*.015,radiusLimit*.015);return add(center,mul(side,(point[0]-sourceCenter)*width+flex));
        }
        let result=this.bones(point);if(this.endPinEnabled){const end=sub(this.tip,this.pivot),skinned=this.bones(end);result=add(result,mul(sub(this.endPin,skinned),clamp(point[1]/Math.max(end[1],1),0,1)));}return result;
    }
    publish(){const vertices=this.mesh.vertices,before=vertices.slice();for(let i=0;i<this.base.length;i+=2){const p=this.skin([this.base[i],this.base[i+1]],i/2);vertices[i]=p[0];vertices[i+1]=p[1];}
        if(this.ribbon.length)for(let pass=0;pass<8;pass++){const rows=new Set<number>(),p=(i:number)=>[vertices[i*2],vertices[i*2+1]],tri=this.mesh.indices;
            for(let i=0;i<tri.length;i+=3){const a=p(tri[i]),b=p(tri[i+1]),c=p(tri[i+2]);if(cross(sub(b,a),sub(c,a))<=1e-6)for(let j=0;j<3;j++)rows.add(Math.floor(tri[i+j]/3));}
            if(!rows.size)break;for(const row of rows){const first=row*3,center=p(first+1),prev=p(Math.max(0,row-1)*3+1),next=p(Math.min(this.ribbon.length-1,row+1)*3+1),tangent=normalized(add(normalized(sub(center,prev)),normalized(sub(next,center)))),side=[tangent[1],-tangent[0]],left=sub(center,mul(side,Math.hypot(...sub(center,p(first)))*.5)),right=add(center,mul(side,Math.hypot(...sub(center,p(first+2)))*.5));vertices[first*2]=left[0];vertices[first*2+1]=left[1];vertices[(first+2)*2]=right[0];vertices[(first+2)*2+1]=right[1];}}
        if(vertices.some((v,i)=>v!==before[i]))this.revision++;
    }
    advance(delta:number,target:number){if(!Number.isFinite(delta)||!Number.isFinite(target))return;const dt=clamp(delta,0,4/120);this.lastSubsteps=Math.min(4,Math.ceil(dt*120));
        if(this.lastSubsteps){this.drive=clamp(target,-.12,.12);const step=dt/this.lastSubsteps,stiffness=[46,34,27],damping=[10.5,8.3,7.1];for(let n=0;n<this.lastSubsteps;n++)for(let i=0;i<3;i++){const follow=i?-this.velocities[i-1]*.035:0,goal=this.drive*(.45+.26*i)+follow;this.velocities[i]=Math.fround(this.velocities[i]+((goal-this.angles[i])*stiffness[i]*this.stiffnessScale-this.velocities[i]*damping[i])*step);this.angles[i]=Math.fround(clamp(this.angles[i]+this.velocities[i]*step,-.12,.12));this.velocities[i]=Math.fround(clamp(this.velocities[i],-.8,.8));if(Math.abs(goal)<.00001&&Math.abs(this.angles[i])<.00012&&Math.abs(this.velocities[i])<.0008){this.angles[i]=0;this.velocities[i]=0;}}}this.publish();
    }
    reset(){this.angles=[0,0,0];this.velocities=[0,0,0];this.drive=0;this.publish();}
    attachment(source:number[]){return this.skin(sub(source,this.pivot));}
    renderedAttachment(source:number[]){const r=this.definition.rect;return backpackSample(this.mesh.source,this.mesh.vertices,this.mesh.indices,[r[0]+source[0],r[1]+source[1]]);}
    transform(point:number[]){return add(this.position,rotate([point[0]*this.scale[0],point[1]*this.scale[1]],this.rotation));}
    inverse(point:number[]){const p=rotate(sub(point,this.position),-this.rotation);return [p[0]/this.scale[0],p[1]/this.scale[1]];}
    inverted(){let count=0;const v=this.mesh.vertices,t=this.mesh.indices;for(let i=0;i<t.length;i+=3){const a=t[i]*2,b=t[i+1]*2,c=t[i+2]*2;if((v[b]-v[a])*(v[c+1]-v[a+1])-(v[b+1]-v[a+1])*(v[c]-v[a])<=1e-6)count++;}return count;}
    hit(point:number[],alpha:(x:number,y:number)=>boolean,indices=this.mesh.indices){const uv=backpackSample(this.mesh.vertices,this.mesh.source,indices,this.inverse(point),true);return !!uv&&alpha(Math.floor(uv[0]),Math.floor(uv[1]));}
    snapshot(){return {key:this.key,position:this.position,scale:this.scale,rotation:this.rotation,angles:this.angles,velocities:this.velocities,vertices:this.mesh.vertices.length/2,triangles:this.mesh.indices.length/3,tip:this.transform(this.attachment(this.tip)),renderedTip:this.renderedAttachment(this.tip),substeps:this.lastSubsteps,inverted:this.inverted(),depth:this.depth,visible:this.visible,opacity:this.opacity};}
}

function cubic(p:number[][],t:number,derivative=false){const u=1-t;return [0,1].map(k=>derivative?(p[1][k]-p[0][k])*3*u*u+(p[2][k]-p[1][k])*6*u*t+(p[3][k]-p[2][k])*3*t*t:p[0][k]*u*u*u+p[1][k]*3*u*u*t+p[2][k]*3*u*t*t+p[3][k]*t*t*t);}
function splitCubic(p:number[][]){const out:number[][]=[];for(let i=0;i<4;i++){const a=i/4,b=(i+1)/4,pa=cubic(p,a),pb=cubic(p,b);if(!i)out.push(pa);out.push(add(pa,mul(cubic(p,a,true),1/12)),sub(pb,mul(cubic(p,b,true),1/12)),pb);}return out;}
function joinedCurve(knots:number[][]){const out=[knots[0]];for(let i=0;i<knots.length-1;i++){let a=mul(sub(knots[i+1],knots[Math.max(0,i-1)]),.5),b=mul(sub(knots[Math.min(knots.length-1,i+2)],knots[i]),.5),hem=[-Math.max(Math.abs(knots[4][0]-knots[3][0])*.7,20),0];if(i===3)a=hem;if(i===2)b=hem;out.push(add(knots[i],mul(a,1/3)),sub(knots[i+1],mul(b,1/3)),knots[i+1]);}return out;}

export class BackpackGeometry {
    readonly parts=new Map<string,BackpackPart>();phase=0;wearAmount=0;wearTarget=0;freeDragTransition=false;mode='hanging';rootVelocity=[0,0];private lastPosition=[0,0];private lastDepth=-10;private lastGround=[350,951];private sampleValid=false;
    constructor(contract:any,ribbon:any){for(const key of BACKPACK_KEYS){const definition={...contract.parts[key]};definition.tip_anchor=definition.anchors[key.indexOf('strap')>=0?'lower_tab':key==='top_loop'?'right_tab':'ground'];if(key.indexOf('strap')>=0)definition.ribbon_profile=ribbon.rows[key];this.parts.set(key,new BackpackPart(key,definition,key.indexOf('strap')>=0?1.25:1));}this.advance(0);}
    private anchor(key:string,name:string){const part=this.parts.get(key);return part.transform(sub(part.definition.anchors[name],part.pivot));}
    private hanging(key:string){return key==='near_strap'?[this.anchor('front_shell','near_strap_top'),[15,365],[0,475],this.anchor('front_shell','near_strap_lower')]:[this.anchor('front_shell','far_strap_top'),[465,350],[475,550],this.anchor('front_shell','far_strap_lower')];}
    layout(ground=[350,951]){const blend=smooth(this.wearAmount),origin=mix([52,112],[-80,-50],blend),extent=mix([447*.9,494*.9],[344*1.28,500*1.34],blend);
        for(const key of ['front_shell','side_shell']){const p=this.parts.get(key);p.scale=[extent[0]/p.definition.rect[2],extent[1]/p.definition.rect[3]];p.position=add(origin,[p.pivot[0]*p.scale[0],p.pivot[1]*p.scale[1]]);p.rotation=blend*.42;}
        for(const key of ['near_strap','far_strap']){const p=this.parts.get(key),near=key==='near_strap',top=this.anchor('side_shell',near?'near_strap_top':'far_strap_top'),lower=this.anchor('side_shell',near?'near_strap_lower':'far_strap_lower'),frameOrigin=add(ground,[-256,-232]),inverse=(q:number[])=>{const v=rotate(sub(q,frameOrigin),.06);return [v[0]/.3,v[1]/.36];},knots=[top,inverse(add(ground,near?[-126,-214]:[-115,-218])),inverse(add(ground,near?[-98,-123]:[-122,-145])),inverse(add(ground,near?[-99,-10]:[-121,-31])),lower],worn=joinedCurve(knots),wall=splitCubic(this.hanging(key)),curve=wall.map((v,i)=>mix(v,worn[i],blend));p.position=curve[0];p.scale=[1,1];p.rotation=0;p.endPinEnabled=false;p.curve=curve.map(v=>sub(v,curve[0]));p.ribbonWidth=lerp(near?.5:.55,.88,blend);p.perspective=mix([1,1,1],near?[.82,.92,.82]:[.42,.52,.42],blend);}
        const loop=this.parts.get('top_loop');loop.position=mix([249,51],sub(this.anchor('side_shell','back_upper'),mul([-50,179],.22)),blend);loop.scale=[lerp(.38,.22,blend),lerp(.38,.22,blend)];loop.rotation=0;
        // Latest approved wear supersedes old side_shell/strap wear art. The old
        // five pieces stay only in the transition, all with the same fade.
        for(const [key,p] of this.parts){p.opacity=1-blend;p.visible=blend<.9999&&key!=='side_shell';}
    }
    setWorn(value:boolean,immediate=false){this.freeDragTransition=false;this.wearTarget=value?1:0;this.mode=value?'worn':'unwearing';this.sampleValid=false;if(immediate)this.wearAmount=this.wearTarget;this.advance(0);}
    resumeFreeDrag(){this.freeDragTransition=true;this.wearTarget=0;this.sampleValid=false;this.advance(0);}
    advance(delta:number,rootPosition=this.lastPosition,depth=this.lastDepth,ground=this.lastGround){if(!Number.isFinite(delta))return;const dt=clamp(delta,0,4/120);this.phase=((this.phase+dt)%12+12)%12;this.wearAmount+=clamp(this.wearTarget-this.wearAmount,-dt/.24,dt/.24);if(this.wearAmount<=0)this.freeDragTransition=false;this.mode=this.freeDragTransition?'dragging':this.wearTarget>.5||this.wearAmount>0?'worn':depth>=80?'dragging':'hanging';this.layout(ground);this.rootVelocity=dt>0&&this.sampleValid?mul(sub(rootPosition,this.lastPosition),1/dt):[0,0];this.lastPosition=rootPosition.slice();this.lastDepth=depth;this.lastGround=ground.slice();this.sampleValid=true;
        const gust=this.phase<1.8?Math.sin(this.phase/1.8*Math.PI)*.011:0,inertia=clamp(-this.rootVelocity[0]*.00025+this.rootVelocity[1]*.00009,-.075,.075);
        for(const [key,p] of this.parts){const target=key==='near_strap'?gust+inertia:key==='far_strap'?-gust*.72+inertia*.81:key==='top_loop'?gust*.3+inertia*.18:0;p.advance(dt,target);p.depth=this.mode==='worn'?(key.indexOf('shell')>=0?10:9):depth-(key.indexOf('shell')>=0?0:1);}
    }
    reset(rootPosition=this.lastPosition,depth=this.lastDepth,ground=this.lastGround){this.wearAmount=this.wearTarget;this.freeDragTransition=false;this.phase=1.8;this.sampleValid=false;this.rootVelocity=[0,0];for(const p of this.parts.values())p.reset();this.advance(0,rootPosition,depth,ground);}
    hangingAnchor(){return this.anchor('top_loop','hang_apex');}
    bounds(){const points:number[][]=[];for(const p of this.parts.values())if(p.visible)for(let i=0;i<p.mesh.vertices.length;i+=2)points.push(p.transform([p.mesh.vertices[i],p.mesh.vertices[i+1]]));if(!points.length)return [0,0,0,0];const x=Math.min(...points.map(p=>p[0])),y=Math.min(...points.map(p=>p[1]));return [x,y,Math.max(...points.map(p=>p[0]))-x,Math.max(...points.map(p=>p[1]))-y];}
    snapshot(){return {mode:this.mode,wearAmount:this.wearAmount,phase:this.phase,rootVelocity:this.rootVelocity,partCount:this.parts.size,bones:this.parts.size*3,vertices:Array.from(this.parts.values()).reduce((sum,p)=>sum+p.mesh.vertices.length/2,0),parts:Array.from(this.parts.values()).map(p=>p.snapshot()),bounds:this.bounds(),hangingAnchor:this.hangingAnchor()};}
}
