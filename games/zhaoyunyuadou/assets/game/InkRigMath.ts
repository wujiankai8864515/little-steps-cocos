/** Evaluates reference bone curves/weights. No Spine runtime or code dependency. */
export type Affine = [number,number,number,number,number,number];
const rad = Math.PI / 180;
export function multiply(a: Affine,b: Affine): Affine {
    return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
export function point(m: Affine,x: number,y: number) { return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]; }
function bezier(t: number,curve: number[]) {
    const f = (q: number,a: number,b: number) => 3*(1-q)*(1-q)*q*a+3*(1-q)*q*q*b+q*q*q;
    let lo=0,hi=1;
    for(let i=0;i<13;i++){const q=(lo+hi)/2;if(f(q,curve[0],curve[2])<t)lo=q;else hi=q;}
    return f((lo+hi)/2,curve[1],curve[3]);
}
export function sample(frames: any[] | undefined,t: number,keys: string[],defaults: number[],rotation=false): number[] {
    if(!frames?.length || t < (frames[0].time || 0)) return defaults;
    let i=0;while(i+1<frames.length&&(frames[i+1].time||0)<=t)i++;
    const a=frames[i],b=frames[i+1];if(!b)return keys.map((k,j)=>a[k]===undefined?defaults[j]:a[k]);
    let u=(t-(a.time||0))/((b.time||0)-(a.time||0));
    if(a.curve==='stepped')u=0;else if(Array.isArray(a.curve))u=bezier(u,a.curve);
    return keys.map((k,j)=>{const va=a[k]===undefined?defaults[j]:a[k],vb=b[k]===undefined?defaults[j]:b[k];let d=vb-va;if(rotation)d=((d+540)%360)-180;return va+d*u;});
}
export function boneMatrices(data: any,animation: any,t: number): Affine[] {
    const names=new Map<string,number>();const out:Affine[]=[];
    for(let i=0;i<data.bones.length;i++){
        const b=data.bones[i],curve=animation.bones?.[b.name]||{};
        const translation=sample(curve.translate,t,['x','y'],[0,0]),rotation=sample(curve.rotate,t,['angle'],[0],true)[0];
        const scale=sample(curve.scale,t,['x','y'],[1,1]),shear=sample(curve.shear,t,['x','y'],[0,0]);
        const a=((b.rotation||0)+rotation+(b.shearX||0)+shear[0])*rad,c=((b.rotation||0)+rotation+90+(b.shearY||0)+shear[1])*rad;
        const sx=(b.scaleX===undefined?1:b.scaleX)*scale[0],sy=(b.scaleY===undefined?1:b.scaleY)*scale[1];
        const local:Affine=[Math.cos(a)*sx,Math.sin(a)*sx,Math.cos(c)*sy,Math.sin(c)*sy,(b.x||0)+translation[0],(b.y||0)+translation[1]];
        const parent=b.parent===undefined?undefined:names.get(b.parent);out.push(parent===undefined?local:multiply(out[parent],local));names.set(b.name,i);
    }
    return out;
}
export function attachmentAt(slot: any,animation: any,t: number): string | null {
    const curve=animation.slots?.[slot.name]?.attachment;let name=slot.attachment||null;
    for(const k of curve||[])if((k.time||0)<=t)name=k.name||null;return name;
}
export function duration(animation: any) {
    let end=0;const visit=(value:any)=>{if(Array.isArray(value)){for(const v of value)visit(v);}else if(value&&typeof value==='object'){if(typeof value.time==='number')end=Math.max(end,value.time);for(const k of Object.keys(value))if(k!=='curve')visit(value[k]);}};visit(animation);return end||1;
}
function deformation(curve:any[],t:number,count:number) {
    const out=new Float32Array(count);if(!curve?.length)return out;
    let i=0;while(i+1<curve.length&&(curve[i+1].time||0)<=t)i++;
    const a=curve[i],b=curve[i+1];if(t<(a.time||0))return out;
    let u=b?(t-(a.time||0))/((b.time||0)-(a.time||0)):0;if(a.curve==='stepped')u=0;else if(Array.isArray(a.curve))u=bezier(u,a.curve);
    for(let j=0;j<count;j++){const va=a.vertices?.[j-(a.offset||0)]||0,vb=b?.vertices?.[j-(b.offset||0)]||0;out[j]=b?va+(vb-va)*u:va;}return out;
}
export function meshVertices(attachment: any,matrices: Affine[],slotBone: number,curve:any[]|undefined,t:number): Float32Array {
    const input=attachment.vertices,points=attachment.uvs.length/2,result=new Float32Array(points*2);
    if(input.length===points*2){const d=deformation(curve||[],t,input.length);for(let i=0;i<points;i++){const p=point(matrices[slotBone],input[i*2]+d[i*2],input[i*2+1]+d[i*2+1]);result[i*2]=p[0];result[i*2+1]=-p[1];}return result;}
    let influences=0;for(let i=0;i<input.length;){const count=input[i++];influences+=count;i+=count*4;}
    const d=deformation(curve||[],t,influences*2);let cursor=0,deform=0;
    for(let i=0;i<points;i++){
        const count=input[cursor++];let x=0,y=0;
        for(let j=0;j<count;j++){const bone=input[cursor++],px=input[cursor++]+d[deform++],py=input[cursor++]+d[deform++],weight=input[cursor++];const p=point(matrices[bone],px,py);x+=p[0]*weight;y+=p[1]*weight;}
        result[i*2]=x;result[i*2+1]=-y;
    }
    return result;
}
export function regionVertices(a:any,m:Affine): Float32Array {
    const angle=(a.rotation||0)*rad,sx=a.scaleX===undefined?1:a.scaleX,sy=a.scaleY===undefined?1:a.scaleY;
    const local:Affine=[Math.cos(angle)*sx,Math.sin(angle)*sx,-Math.sin(angle)*sy,Math.cos(angle)*sy,a.x||0,a.y||0];const world=multiply(m,local),w=a.width/2,h=a.height/2;
    const out=new Float32Array(8);[[-w,-h],[w,-h],[-w,h],[w,h]].forEach((v,i)=>{const p=point(world,v[0],v[1]);out[i*2]=p[0];out[i*2+1]=-p[1];});return out;
}
/** Reference renderer's setup-pose bounds, read from inert attachments. */
export function setupOffset(data:any): [number,number] {
    const matrices=boneMatrices(data,{},0),bones=new Map<string,number>(data.bones.map((b:any,i:number)=>[b.name,i]));
    let maxX=-Infinity,maxY=-Infinity;
    for(const skin of Object.values(data.skins) as any[])for(const slot of data.slots){
        if(!slot.attachment)continue;const a=skin[slot.name]?.[slot.attachment]||data.skins.default?.[slot.name]?.[slot.attachment];if(!a)continue;
        const v=a.type==='mesh'?meshVertices(a,matrices,bones.get(slot.bone)!,undefined,0):regionVertices(a,matrices[bones.get(slot.bone)!]);
        for(let i=0;i<v.length;i+=2){maxX=Math.max(maxX,v[i]);maxY=Math.max(maxY,-v[i+1]);}
    }
    return Number.isFinite(maxX)?[maxX,maxY]:[0,0];
}
export function slotRGBA(slot:any,animation:any,t:number): number[] {
    const parse=(color:string)=>[0,2,4,6].map(offset=>parseInt(color.slice(offset,offset+2),16)||0);
    const defaults=parse(slot.color||'ffffffff');
    const curve=animation.slots?.[slot.name]?.color;
    if(!curve)return defaults;
    return sample(curve.map((f:any)=>{const c=parse(f.color);return {...f,r:c[0],g:c[1],b:c[2],a:c[3]};}),t,['r','g','b','a'],defaults);
}
