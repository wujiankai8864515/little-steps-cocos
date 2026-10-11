import { APPROVED_BACKPACK_DATA } from './ApprovedBackpackData';
import { backpackSample } from './BackpackGeometry';

export const APPROVED_BAG='res://travel/assets/home_worn_bag_pixels.png';
export const APPROVED_MASK='res://home/interaction/alpha_masks/backpack_parts.res::0';
const f=Math.fround;
export const APPROVED_BIND=[f(.18),0,0,f(.18),f(181-f(1000*f(.18))),f(254-f(840*f(.18)))];
export const wearBlend=(amount:number)=>{const t=Math.max(0,Math.min(1,amount));return t*t*(3-2*t);};
const at=(m:number[],x:number,y:number)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
export type ApprovedMesh={source:Float32Array;vertices:Float32Array;indices:Uint16Array;vertexData?:Float32Array};
export class ApprovedBackpackGeometry {
    readonly parts=APPROVED_BACKPACK_DATA.map(p=>{const mesh=():ApprovedMesh=>({source:new Float32Array(p.source),vertices:new Float32Array(p.fitted),indices:new Uint16Array(p.indices)});return {key:p.key,fitted:new Float32Array(p.fitted),mesh:mesh(),passes:[mesh(),mesh()]};});
    blend=0;floor=951;floorRebuilds=0;private lastFloor=Infinity;frame=APPROVED_BIND.slice();
    update(frame:number[],amount:number){this.frame=frame.slice();this.blend=wearBlend(amount);for(const p of this.parts)for(let i=0;i<p.fitted.length;i+=2){const point=at(frame,p.fitted[i],p.fitted[i+1]);p.mesh.vertices[i]=point[0];p.mesh.vertices[i+1]=point[1];}}
    project(frame:number[],directions:number[][],floor:number){if(!Number.isFinite(this.lastFloor)||Math.abs(floor-this.lastFloor)>.00001*Math.max(1,Math.abs(floor))){this.floor=Math.min(65535,Math.max(0,Math.round((floor+2048)*16)))/16-2048;this.lastFloor=floor;this.floorRebuilds++;}
        for(const p of this.parts)p.passes.forEach((mesh,index)=>{if(!mesh.vertexData)mesh.vertexData=new Float32Array(p.fitted.length/2*3);for(let i=0;i<p.fitted.length;i+=2){const point=at(frame,p.fitted[i],p.fitted[i+1]),height=Math.max(this.floor-point[1],0);mesh.vertices[i]=point[0]+directions[index][0]*height;mesh.vertices[i+1]=this.floor+directions[index][1]*height;mesh.vertexData[i/2*3]=point[0];mesh.vertexData[i/2*3+1]=point[1];mesh.vertexData[i/2*3+2]=height;}});
    }
    hit(point:number[],alpha:(x:number,y:number)=>boolean,frontOnly=false){if(this.blend<.2)return false;for(const p of this.parts){if(frontOnly&&p.key!=='near_band')continue;const uv=backpackSample(p.mesh.vertices,p.mesh.source,p.mesh.indices,point,true);if(uv&&alpha(Math.floor(uv[0]),Math.floor(uv[1])))return true;}return false;}
    bounds(){const points=this.parts.map(p=>Array.from(p.mesh.vertices));let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;for(const flat of points)for(let i=0;i<flat.length;i+=2){left=Math.min(left,flat[i]);top=Math.min(top,flat[i+1]);right=Math.max(right,flat[i]);bottom=Math.max(bottom,flat[i+1]);}return [left,top,right-left,bottom-top];}
    snapshot(){return {parts:this.parts.length,vertices:this.parts.reduce((n,p)=>n+p.fitted.length/2,0),indices:this.parts.reduce((n,p)=>n+p.mesh.indices.length,0),blend:this.blend,frame:this.frame,floor:this.floor,floorRebuilds:this.floorRebuilds,bounds:this.bounds(),source:APPROVED_BAG,implementation:'native_fitted_uv_contours'};}
}
