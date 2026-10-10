// Original AlphaGrounding measured spans, alpha threshold and 2px scan spacing.
export const SUPPORT_SPANS:Record<string,number[][]>={
    OriginalBody:[[180,466]],Doll:[[98,180],[222,316]],Bowl:[[146,366]],
    Altar:[[40,104],[300,364],[420,466]],Wardrobe:[[151,167],[184,206],[334,347]],Treasure:[[60,341],[341,447]],
};
export type ShadowGeometry={source:Float32Array;vertices:Float32Array;indices:Uint16Array;vertexData:Float32Array;support:Float32Array;profile:number[][];contacts:number[][][]};
const transform=(m:number[],x:number,y:number)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
// Shader's original RG encoding rounds contact support to 1/16 illustration px.
const quantize=(value:number)=>Math.min(65535,Math.max(0,Math.round((value+2048)*16)))/16-2048;
export function contactProfile(name:string,size:number[],alpha:(x:number,y:number)=>number) {
    const contacts:number[][][]=[];
    for(const span of SUPPORT_SPANS[name]||[]) {
        const line:number[][]=[];
        for(let x=span[0];x<=span[1];x+=2) {
            for(let y=size[1]-1;y>=0;y--)if(alpha(x,y)>=.5){line.push([x+.5,y+.5]);break;}
        }
        if(line.length)contacts.push(line);
    }
    const profile:number[][]=[];contacts.forEach(line=>line.forEach(point=>profile.push(point)));
    if(profile.length<2)throw new Error('缺少原图接触轮廓：'+name);
    return {contacts,profile};
}
export function supportAt(profile:number[][],x:number) {
    if(x<=profile[0][0])return profile[0][1];
    for(let i=1;i<profile.length;i++)if(x<=profile[i][0]){const a=profile[i-1],b=profile[i];return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);}
    return profile[profile.length-1][1];
}
export function shadowGeometry(size:number[],contacts:number[][][]=[]) :ShadowGeometry {
    const profile:number[][]=[];contacts.forEach(line=>line.forEach(point=>profile.push(point)));
    const columns=profile.length?[0,...profile.filter(p=>p[0]>0&&p[0]<size[0]).map(p=>p[0]),size[0]]:[0,size[0]];
    const points:number[]=[],support:number[]=[],indices:number[]=[];
    columns.forEach(x=>{const bottom=profile.length?Math.min(size[1],supportAt(profile,x)):size[1];for(const y of [0,bottom]){points.push(x,y);support.push(profile.length?supportAt(profile,x):size[1]);}});
    for(let c=0;c<columns.length-1;c++){const i=c*2;indices.push(i,i+1,i+2,i+1,i+3,i+2);}
    return {source:new Float32Array(points),vertices:new Float32Array(points),indices:new Uint16Array(indices),vertexData:new Float32Array(points.length/2*3),support:new Float32Array(support),profile,contacts};
}
export function projectShadow(mesh:ShadowGeometry,matrix:number[],direction:number[],ground:number,grounded:boolean,floor:boolean,lift=0,thicknessOffset=[0,0]) {
    for(let i=0;i<mesh.source.length;i+=2) {
        const point=transform(matrix,mesh.source[i],mesh.source[i+1]);
        const support=grounded?transform(matrix,mesh.source[i],quantize(mesh.support[i/2])):[point[0],ground];
        support[1]+=grounded?lift:0;
        const height=Math.max(support[1]-point[1],0),geometryHeight=grounded?height:ground-point[1];
        mesh.vertices[i]=floor?point[0]+direction[0]*geometryHeight:point[0]+thicknessOffset[0];
        mesh.vertices[i+1]=floor?support[1]+direction[1]*geometryHeight:point[1]+thicknessOffset[1];
        mesh.vertexData[i/2*3]=point[0];mesh.vertexData[i/2*3+1]=point[1];mesh.vertexData[i/2*3+2]=height;
    }
}
export function projectedContacts(mesh:ShadowGeometry,matrix:number[],lift=0) {return mesh.contacts.map(line=>line.map(p=>{const point=transform(matrix,p[0],p[1]);point[1]+=lift;return point;}));}
