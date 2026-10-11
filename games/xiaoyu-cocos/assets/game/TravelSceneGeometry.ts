import { core } from './Engine';
import { TravelSceneState, routePosition } from './TravelSceneState';

export type TravelInkMesh={vertices:Float32Array;source:Float32Array;vertexUV:Float32Array;vertexData:Float32Array;indices:Uint16Array};
// RGB and coverage alpha use independent float channels. Creator owns the
// vertex's fourth color channel for parent opacity; no packed/quantized ink.
export function inkMesh(mesh:any,colors:number[]|number[][]):TravelInkMesh{
    const count=mesh.vertices.length/2,uv=new Float32Array(count*2),data=new Float32Array(count*3),perVertex=Array.isArray(colors[0]);
    for(let i=0;i<count;i++){const c=(perVertex?colors[i]:colors) as number[];uv.set(c.slice(0,2),i*2);data.set([c[2],(c[3]??1)*(mesh.vertexData?mesh.vertexData[i*3]:1),0],i*3);}
    return {vertices:mesh.vertices,source:mesh.source,indices:mesh.indices,vertexUV:uv,vertexData:data};
}
export function mergeInk(meshes:TravelInkMesh[]):TravelInkMesh{
    const count=meshes.reduce((n,m)=>n+m.vertices.length/2,0),indices=meshes.reduce((n,m)=>n+m.indices.length,0);
    if(count>4096||indices>16384)throw new Error('Travel drawing exceeds Creator default UI buffer capacity');
    const out={vertices:new Float32Array(count*2),source:new Float32Array(count*2),vertexUV:new Float32Array(count*2),vertexData:new Float32Array(count*3),indices:new Uint16Array(indices)};let vertex=0,index=0;
    for(const m of meshes){out.vertices.set(m.vertices,vertex*2);out.source.set(m.source,vertex*2);out.vertexUV.set(m.vertexUV,vertex*2);out.vertexData.set(m.vertexData,vertex*3);for(const i of m.indices)out.indices[index++]=i+vertex;vertex+=m.vertices.length/2;}return out;
}
export function polygonInk(points:number[][],colors:number[]|number[][]){
    const vertices=new Float32Array(([] as number[]).concat(...points)),indices:number[]=[];for(let i=2;i<points.length;i++)indices.push(0,i-1,i);
    return inkMesh({vertices,source:new Float32Array(vertices.length),indices:new Uint16Array(indices)},colors);
}
export function circleInk(radius:number,color:number[]){return inkMesh(core.filledCircle([0,0],radius),color);}
// CanvasItem.draw_set_transform uses scale_basis: T * S * R, unlike Node2D T * R * S.
export function transformInk(mesh:TravelInkMesh,at:number[],angle=0,scale=[1,1]){
    const c=Math.cos(angle),s=Math.sin(angle),v=mesh.vertices;for(let i=0;i<v.length;i+=2){const x=v[i],y=v[i+1];v[i]=at[0]+(x*c-y*s)*scale[0];v[i+1]=at[1]+(x*s+y*c)*scale[1];}return mesh;
}

export class TravelRouteInk {
    readonly batches:TravelInkMesh[]=[];
    private strokes:Array<Array<{start:number;end:number;coverage:Float32Array;fiber:number;strength:number}>>=[];
    private passed=-1;
    updates=0;
    constructor(private state:TravelSceneState){
        // One mesh for each of the ten stations: 3456 vertices per batch fits
        // Creator 3.8.8's default 4096 limit without changing global settings.
        for(let stage=0;stage<state.routeSamples.length;stage++){
            const meshes:TravelInkMesh[]=[],ranges=[];let vertex=0;
            for(let sample=0;sample<32;sample++){
                const from=state.routeSamples[stage][sample],to=state.routeSamples[stage][sample+1],fiber=.5+.5*Math.sin((stage*32+sample)*2.399);
                for(const [kind,width,strength] of [[0,5.2+fiber,.13],[1,1.4+fiber*1.2,1],[2,.55,.20]]){
                    const line=core.featherLine(kind===2?[from[0],from[1]+.65]:from,to,width),mesh=inkMesh(line,kind===2?[.97,.87,.64,strength]:[0,0,0,0]),end=vertex+mesh.vertices.length/2;
                    if(kind!==2)ranges.push({start:vertex,end,coverage:Float32Array.from({length:end-vertex},(_,i)=>line.vertexData[i*3]),fiber,strength});
                    meshes.push(mesh);vertex=end;
                }
            }
            this.batches.push(mergeInk(meshes));this.strokes.push(ranges);
        }this.update();
    }
    update(){
        const phase=this.state.routeProgress*this.batches.length,passed=Math.floor(phase*32);if(passed===this.passed)return [];
        const changed:number[]=[];
        this.batches.forEach((mesh,stage)=>{
            if(this.passed>=0&&Math.floor(this.passed/32)!==stage&&Math.floor(passed/32)!==stage&&!(stage*32>Math.min(this.passed,passed)&&stage*32<Math.max(this.passed,passed)))return;
            this.strokes[stage].forEach((range,i)=>{const sample=Math.floor(i/2),ink=this.state.config.route[phase>=stage+(sample+1)/32?'walked':'unwalked'],alpha=ink[3]*(.62+range.fiber*.30)*range.strength;
                for(let v=range.start;v<range.end;v++){mesh.vertexUV[v*2]=ink[0];mesh.vertexUV[v*2+1]=ink[1];mesh.vertexData[v*3]=ink[2];mesh.vertexData[v*3+1]=alpha*range.coverage[v-range.start];}
            });changed.push(stage);
        });this.passed=passed;this.updates++;return changed;
    }
}
export function travelLandmarks(state:TravelSceneState){
    const meshes:TravelInkMesh[]=[];
    for(const mark of state.config.route.landmarks){if(mark.baked)continue;const [x,y,w,h]=mark.rect,points=[[x+2,y+3],[x+w-3,y],[x+w,y+h-3],[x+4,y+h]];
        meshes.push(polygonInk(points,[.96,.84,.61,.91]),inkMesh(core.featherPolyline([...points,points[0]],1.1),[.45,.28,.12,.83]),inkMesh(core.featherLine([x+8,y+h-4],[x+w-9,y+h-5],.8),[.53,.37,.20,.25]));
    }return mergeInk(meshes);
}
export function travelShadows(state:TravelSceneState,light:any){
    const meshes:TravelInkMesh[]=[];
    for(const shadow of state.config.light.shadows){const at=shadow.at,reach=shadow.height*(1.7-.7*Math.sin(light.solar*Math.PI)),end=[at[0]-light.direction[0]*reach,at[1]+Math.abs(light.direction[1])*reach*.33],w=shadow.width/2;
        meshes.push(polygonInk([[at[0]-w,at[1]],[at[0]+w,at[1]],[end[0]+w*.65,end[1]],[end[0]-w*.65,end[1]]],[[.12,.17,.20,.13*light.daylight],[.12,.17,.20,.13*light.daylight],[.12,.17,.20,0],[.12,.17,.20,0]]));
    }
    const at=routePosition(state.routeProgress,state.config).map((v,i)=>v+light.actor_shadow_offset[i]);meshes.push(transformInk(circleInk(23,[.10,.13,.14,.12+.09*light.daylight]),at,light.actor_shadow_rotation,[1,.30]));return mergeInk(meshes);
}
export function footprintHighlight(highlight:number,angle=0){return transformInk(mergeInk([3,2,1].map(layer=>circleInk(8+layer*2.5,[1,.77,.32,highlight*.055]))),[0,0],angle,[1,.66]);}
