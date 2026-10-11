import { Color, Graphics, Node } from 'cc';
import { Scope, sharedUI } from './Engine';
import { drinkSmooth } from './DrinkMotion';
import { nodeAt } from './Visual';
// Original action_marks.gd drink glyph, face-safe relocation and lifetime.
export class DrinkMarks {
    readonly root:Node;private graphics:Graphics;private mark:{at:number[];age:number}=null;private cooldown=0;private serial=0;
    constructor(parent:Node,scope:Scope,private face:()=>number[]){this.root=nodeAt(parent,'DrinkActionMarks');this.graphics=this.root.addComponent(Graphics);scope.own(()=>this.clear());}
    private intersects(at:number[],face:number[]){return at[0]-15<=face[0]+face[2]&&at[0]+17>=face[0]&&at[1]-21<=face[1]+face[3]&&at[1]+24>=face[1];}
    emit(at:number[]){if(!at.every(Number.isFinite)||this.mark||this.cooldown>0)return false;const r=this.face(),f=[r[0]-8,r[1]-8,r[2]+16,r[3]+16];let place=at.slice();if(this.intersects(place,f)){const choices=[[f[0]-17-1,at[1]],[f[0]+f[2]+15+1,at[1]],[at[0],f[1]-24-1],[at[0],f[1]+f[3]+21+1]];place=choices.reduce((a,b)=>Math.hypot(a[0]-at[0],a[1]-at[1])<=Math.hypot(b[0]-at[0],b[1]-at[1])?a:b);if(Math.hypot(place[0]-at[0],place[1]-at[1])>72)return false;}this.mark={at:place,age:0};this.cooldown=.5;this.serial++;return true;}
    advance(delta:number){if(Number.isFinite(delta)&&delta>0){this.cooldown=Math.max(0,this.cooldown-delta);if(this.mark){this.mark.age+=delta;if(this.mark.age>=.42)this.mark=null;}}const g=this.graphics;g.clear();if(!this.mark)return;const r=this.face(),face=[r[0]-8,r[1]-8,r[2]+16,r[3]+16];if(this.intersects(this.mark.at,face))return;const t=Math.max(0,Math.min(1,this.mark.age/.42)),origin=[this.mark.at[0]-2*t,this.mark.at[1]+9*t],alpha=.75*(1-drinkSmooth(.12,1,t));for(const polygon of [[[-6,-9],[-10,-2],[-9,1],[-6,3],[-3,1],[-2,-2]],[[7,-15],[4,-10],[5,-7],[7,-6],[9,-7],[10,-10]]])sharedUI().polygon(g,polygon.map(p=>[p[0]+origin[0],p[1]+origin[1]]),[.49,.78,.85,alpha]);}
    clear(){this.mark=null;this.cooldown=0;this.graphics.clear();}
    snapshot(){return {serial:this.serial,active:!!this.mark,mark:this.mark,cooldown:this.cooldown,life:.42};}
}
