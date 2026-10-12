// Native responsive_lamp.gd, tool_tray_fit.gd and authored Darkroom recipes.
import { DarkTool } from './DarkroomRound';
export const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
export const mix=(a:number[],b:number[],t:number)=>a.map((v,i)=>v+(b[i]-v)*t);
export const LAMP_RECT=[20,443,124,232];
export const NEEDLE_RECT=[24,928,324,166],SLIPPER_RECT=[373,928,324,166];
export const inside=(at:number[],r:number[])=>at[0]>=r[0]&&at[0]<r[0]+r[2]&&at[1]>=r[1]&&at[1]<r[1]+r[3];
export class ResponsiveLamp {
    value=0;target=0;private from=0;private age=.22;private feedbackAge=.34;override=-1;
    reset(current:number){this.value=clamp(current,0,1);this.target=this.value;this.from=this.value;this.age=.22;}
    tap(next:number){this.override=clamp(next,0,1);this.from=this.value;this.target=this.override;this.age=0;this.feedbackAge=0;}
    toggle(){const on=this.override>=0?this.override===1:this.value>=.5;this.tap(on?0:1);return this.override===1;}
    advance(delta:number,automatic:number){
        if(!Number.isFinite(delta))return;
        if(this.override<0){this.reset(automatic);return;}
        const dt=Math.max(delta,0);this.age=Math.min(this.age+dt,.22);this.feedbackAge=Math.min(this.feedbackAge+dt,.34);this.value=this.from+(this.target-this.from)*smooth(0,.22,this.age);
    }
    scale(){const p=this.feedbackAge>=.34?0:.048*Math.exp(-this.feedbackAge*12)*Math.cos(this.feedbackAge*29);return [1+p,1-p];}
}
export const RECESSES={needle:[[82,941],[322,941],[318,1040],[40,1040]],slipper:[[401,941],[633,941],[686,1040],[405,1040]]};
export function inPolygon(at:number[],polygon:number[][]){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[j],b=polygon[i],cross=(at[0]-a[0])*(b[1]-a[1])-(at[1]-a[1])*(b[0]-a[0]);
    if(Math.abs(cross)<1e-7&&at[0]>=Math.min(a[0],b[0])&&at[0]<=Math.max(a[0],b[0])&&at[1]>=Math.min(a[1],b[1])&&at[1]<=Math.max(a[1],b[1]))return true;
    if((a[1]>at[1])!==(b[1]>at[1])&&at[0]<(b[0]-a[0])*(at[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
}return inside;}
export function fitTray(tool:DarkTool,geometry:any){
    const angle=tool==='needle'?.43:.32,cs=Math.cos(angle),sn=Math.sin(angle),rot=(p:number[])=>[cs*p[0]-sn*p[1],sn*p[0]+cs*p[1]];
    const points=geometry.contour.map(rot),lo=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))],hi=[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
    const mid=lo.map((v,i)=>(v+hi[i])/2),pivot=[cs*mid[0]+sn*mid[1],-sn*mid[0]+cs*mid[1]],position=tool==='needle'?[187,990]:[542,990];let low=.01,high=.28;
    const transformed=(p:number[],scale:number)=>{const q=rot(p.map((v,i)=>v-pivot[i]));return q.map((v,i)=>position[i]+v*scale);};
    for(let i=0;i<16;i++){const factor=(low+high)/2;if(geometry.contour.every((p:number[])=>inPolygon(transformed(p,factor),RECESSES[tool])))low=factor;else high=factor;}
    return {position,pivot,rotation:angle,scale:low*.86,inside:geometry.contour.every((p:number[])=>inPolygon(transformed(p,low*.86),RECESSES[tool]))};
}
const f=720/941,p=(x:number,y:number)=>[x*f,y*f];
export const DARK_PLANT_PARTS:any[]=[
    ['HerbLeftTie','top_tie',p(224,0),.22,0],['HerbLeftBody','herb_0',[0,0],.66,.025,0],
    ['HerbUpperBody','herb_1',p(296,-14),.7,-.018],['HerbUpperTip','herb_tip',[0,0],.26,.1,2],
    ['ShelfHerbTie','top_tie',p(155,268),.13,0],['ShelfHerbBody','herb_2',[0,0],.67,-.03,4],['ShelfHerbLooseLeaf','dry_leaf',[0,0],.21,.27,5,[76,184]],
    ['HerbRightTie','top_tie',p(883,0),.18,0],['HerbRightBody','herb_3',[0,0],.74,.01,7],['HerbRightTip','herb_tip',[0,0],.5,-.02,8],
    ['RightIvyA','ivy_0',p(939,67),.82,.012],['RightIvyB','ivy_3',[0,0],.7,-.02,10],['RightIvyTip','ivy_1',[0,0],.48,.02,11],
    ['UpperPotLeaves','cluster_1',p(915,594),.51,2.8],['MiddlePotLeaves','cluster_3',p(916,784),.54,2.92],['MiddlePotLeaf','green_leaf',[0,0],.26,.55,14,[105,94]],
    ['LeftUpperLeaves','cluster_2',p(-4,27),.56,-.42],['LeftEdgeIvy','ivy_2',p(-2,692),.72,-.3],['LeftEdgeLeaf','green_leaf',[0,0],.25,.7,17,[72,95]],
    ['BottomLeftLeaves','cluster_0',p(48,1675),.91,2.89],['BottomRightLeaves','cluster_3',p(897,1678),.83,3.48],
];
