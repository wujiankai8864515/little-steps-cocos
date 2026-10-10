import { Color, Graphics, Node } from 'cc';
import { Scope } from './Engine';
import { nodeAt } from './Visual';
export class InteractionFeedback {
    readonly root:Node;private graphics:Graphics;
    private ripples:Array<{at:number[];age:number;accepted:boolean}>=[];private at=[0,0];private fraction=0;
    constructor(parent:Node,scope:Scope){this.root=nodeAt(parent,'InteractionFeedback');this.graphics=this.root.addComponent(Graphics);scope.own(()=>{this.clear();this.root.destroy();});}
    pulse(at:number[],accepted=true){if(this.ripples.length>=4)this.ripples.shift();this.ripples.push({at:at.slice(),age:0,accepted});}
    hold(at:number[],fraction:number){this.at=at.slice();this.fraction=fraction;}
    clear(){this.ripples=[];this.fraction=0;this.graphics.clear();}
    advance(delta:number){if(!Number.isFinite(delta))return;this.ripples.forEach(r=>r.age+=Math.max(0,Math.min(delta,.1)));this.ripples=this.ripples.filter(r=>r.age<.42);const g=this.graphics;g.clear();
        const arc=(at:number[],radius:number,start:number,end:number,color:number[],width:number)=>{g.strokeColor=new Color(...color.map(v=>v*255));g.lineWidth=width;for(let i=0;i<36;i++){const angle=start+(end-start)*i/35,x=at[0]+Math.cos(angle)*radius,y=-at[1]-Math.sin(angle)*radius;if(i===0)g.moveTo(x,y);else g.lineTo(x,y);}g.stroke();};
        this.ripples.forEach(r=>{const t=r.age/.42;arc(r.at,5+18*t,0,Math.PI*2,r.accepted?[.91,.75,.42,(1-t)*.52]:[.7,.56,.4,(1-t)*.36],1.2);});if(this.fraction>0)arc(this.at,15,-Math.PI/2,-Math.PI/2+Math.PI*2*this.fraction,[.94,.79,.48,.4],1.3);
    }
}
