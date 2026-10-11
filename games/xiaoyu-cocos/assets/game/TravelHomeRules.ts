// Geometry and clocks from travel_home_props.gd and travel_art.gd.
export const TRAVEL_PROPS='res://travel/assets/travel_props_v1.png';
export const TRAVEL_REWARDS='res://travel/assets/travel_rewards_v1.png';
export const TRAVEL_FONT='res://travel/assets/travel_ui.ttf';
export const TRAVEL_GLINT='res://home/feedback/assets/returned_bag_diamond.png';
export const PROP_REGIONS={map:[528,50,557,390],diary:[1100,32,420,438],open_diary:[15,538,580,402],full_bag:[600,484,452,475],open_bag:[1059,474,477,491]};
export const REWARD_REGIONS=[[55,96,613,469],[692,164,518,373],[52,600,625,601],[681,627,510,560]];
export const MAP_RECT=[474,1080,216,151],BAG_RECT=[273.5,925,171,180],OPEN_BAG_RECT=[270,925,178,184];
export const REWARD_ORIGIN=[359,978],CHEST_TARGET=[580,718],FLIGHT_SECONDS=.95,REHANG_SECONDS=1.55;
export const TENT_SOURCE=[[758,658],[773,600],[899,582],[928,654],[793,673]];
export const TENT_POINTS=TENT_SOURCE.map(p=>[359+(p[0]-860)*1.38,926+(p[1]-663)*1.38]);
export const TENT_UV=[[43,782],[237,216],[1460,69],[1677,721],[403,905]].map(p=>[p[0]/1693*768,p[1]/929*421]);
export const TENT_CONTACT_UV=TENT_SOURCE.map(p=>[p[0]-756,p[1]-580]);
export const TENT_TRIANGLES=[0,1,4,1,2,3,1,3,4];
export const clamp01=(t:number)=>Math.max(0,Math.min(1,t));
export const smooth=(a:number,b:number,t:number)=>{t=clamp01((t-a)/(b-a));return t*t*(3-2*t);};
export const mix=(a:number[],b:number[],t:number)=>a.map((v,i)=>v+(b[i]-v)*t);
export const rotate=(v:number[],t:number)=>[v[0]*Math.cos(t)-v[1]*Math.sin(t),v[0]*Math.sin(t)+v[1]*Math.cos(t)];
export const cubic=(a:number[],b:number[],c:number[],d:number[],t:number)=>a.map((v,i)=>v*(1-t)**3+3*b[i]*(1-t)**2*t+3*c[i]*(1-t)*t*t+d[i]*t**3);
export function rewardFan(index:number,count:number){
    const row=Math.floor(index/5),slot=index%5,n=Math.min(5,count-row*5),spread=n<=1?0:n===2?64:n===3?120:140,f=n<=1?.5:slot/(n-1),angle=(-90-spread*.5+spread*f)*Math.PI/180,radius=146+row*82;
    return [359+Math.cos(angle)*radius,978+Math.sin(angle)*radius];
}
export function harvestCloud(index:number,age:number){
    const local=age-index*.18,t=local/3.2;if(t<=0||t>=1)return null;
    return {position:[359+(index?-20:14)+Math.sin(local*1.4+index)*9,970-local*26],width:(index?180:215)*(.65+.70*smooth(0,1,t)),rotation:Math.sin(local*1.35+index)*.06,alpha:smooth(0,.18,t)*(1-smooth(.58,1,t))*(index?.40:.66),age:local};
}
export function tentSupport(x:number){const a=x<TENT_POINTS[4][0]?TENT_POINTS[0]:TENT_POINTS[4],b=x<TENT_POINTS[4][0]?TENT_POINTS[4]:TENT_POINTS[3];return a[1]+(b[1]-a[1])*clamp01((x-a[0])/(b[0]-a[0]));}
export function tentProjection(direction:number[]){
    const vertices:number[]=[],payload:number[]=[];
    for(const p of TENT_POINTS){const support=Math.max(0,Math.min(65535,Math.floor((tentSupport(p[0])+2048)*16+.5)))/16-2048,h=Math.max(0,support-p[1]);vertices.push(p[0]+direction[0]*h,support+direction[1]*h);payload.push(p[0],p[1],h);}
    return {vertices:new Float32Array(vertices),vertexData:new Float32Array(payload),source:new Float32Array(([] as number[]).concat(...TENT_UV)),indices:new Uint16Array(TENT_TRIANGLES)};
}
export function rehangPoint(start:number[],end:number[],progress:number){return cubic(start,[start[0]-105,start[1]-205],[end[0]+65,end[1]+105],end,smooth(0,1,progress));}
export function entryPose(key:string,age:number){
    if(key==='diary')return {closedScale:age<.24?1-.96*(1-Math.cos(clamp01(age/.24)*Math.PI/2)):.04,skew:age<.24?-.30*clamp01(age/.24):-.30,openedScale:age<.24?.05+.5*clamp01(age/.24):.55+.45*Math.sin(clamp01((age-.24)/.24)*Math.PI/2),opened:age>=.24,finished:age>=.48};
    const sine=(t:number)=>(1-Math.cos(clamp01(t)*Math.PI))*.5;
    return {scale:age<.065?1-.12*clamp01(age/.065):age<.165?.88+.2*sine((age-.065)/.10):1.08-.08*sine((age-.165)/.105),finished:age>=.27};
}
// Single ownership across drag-out, multi-touch, cancel and delayed entry.
export class TravelPropPointer {
    owner:number=null;target='';private press:number[]=[];private valid=false;
    down(id:number,at:number[],hit:string){if(this.owner!==null)return true;if(!hit||!at.every(Number.isFinite))return false;this.owner=id;this.target=hit;this.press=at.slice();this.valid=true;return true;}
    move(id:number,at:number[]){if(id!==this.owner)return false;if(!at.every(Number.isFinite)||Math.hypot(at[0]-this.press[0],at[1]-this.press[1])>16)this.valid=false;return true;}
    up(id:number,at:number[],hit:string){if(id!==this.owner)return '';this.move(id,at);const result=this.valid&&hit===this.target?hit:'';this.cancel();return result;}
    cancel(){this.owner=null;this.target='';this.valid=false;}
}
