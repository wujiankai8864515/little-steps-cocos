// Latest source eye_geometry.gd: convex eroded domains for the enlarged pupils.
export const EYE_CENTERS=[[300.553125,190.35],[421.7,155.33125]];
export const PUPIL_SOURCES=[[322.5,176],[435.5,143.8]];
export const PUPIL_REGIONS=[[309,164,28,24],[423,134,26,23]];
const TRAVEL=[[12,5],[7,3]];
export const EYE_DOMAINS=[
    [[296.111888,191.2908],[297.052687,190.938],[303.844088,188.9094],[305.608088,188.439],[305.637488,188.439],[304.784888,188.9976],[303.755887,189.5856],[302.197688,190.2912],[301.962488,190.3794],[300.933488,190.7616],[300.845288,190.791],[298.052288,191.3496],[297.640688,191.379],[297.434888,191.379],[296.758688,191.3496],[296.229488,191.3202]],
    [[420.6808,155.5346],[421.2688,155.319],[423.5228,154.731],[422.8956,155.0446],[421.5432,155.4758],[421.4256,155.4954],[421.2884,155.515],[420.9748,155.5346]],
];
export function clampEyeOffset(eye:number,requested:number[]) {
    if(!requested.every(Number.isFinite)||requested[0]===0&&requested[1]===0)return [0,0];
    const index=eye-1,origin=EYE_CENTERS[index],travel=TRAVEL[index],polygon=EYE_DOMAINS[index];
    let normalized=[requested[0]/travel[0],requested[1]/travel[1]];
    const largest=Math.max(Math.abs(normalized[0]),Math.abs(normalized[1]));
    if(largest>1){normalized=normalized.map(v=>v/largest);const length=Math.hypot(...normalized);normalized=normalized.map(v=>v/length);}
    else {const length=Math.hypot(...normalized);if(length>1)normalized=normalized.map(v=>v/length);}
    const bounded=normalized.map((v,i)=>v*travel[i]);let fraction=1;
    for(let i=0;i<polygon.length;i++) {
        const start=polygon[i],end=polygon[(i+1)%polygon.length],edge=[end[0]-start[0],end[1]-start[1]];
        const outward=-(edge[0]*bounded[1]-edge[1]*bounded[0]);
        if(outward>0){const clearance=Math.max(0,edge[0]*(origin[1]-start[1])-edge[1]*(origin[0]-start[0])-Math.hypot(...edge)*.0001);fraction=Math.min(fraction,clearance/outward);}
    }
    return bounded.map(v=>v*fraction);
}
