import { Color, Graphics, Node } from 'cc';
import { GameAssets } from './Assets';
import { DarkroomRound } from './DarkroomRound';
import { label, nodeAt } from './Visual';

export class DarkroomHUD {
    readonly root:Node;private graphics:Graphics;private feedback:Graphics;private rim:Graphics;private ends:Graphics;private hint:any;
    constructor(parent:Node,assets:GameAssets,private round:DarkroomRound,private barY:number){
        this.root=nodeAt(parent,'MisfortuneMeter',0,0,720,1280);
        this.feedback=nodeAt(this.root,'WorldFeedback',0,0,720,1280).addComponent(Graphics);
        this.rim=nodeAt(this.root,'MeterRim',0,0,720,1280).addComponent(Graphics);
        this.graphics=nodeAt(this.root,'MeterFill',0,0,720,1280).addComponent(Graphics);
        this.ends=nodeAt(this.root,'MeterSpirals',0,0,720,1280).addComponent(Graphics);
        // Creator 3.8.8's web alphabetic baseline for a centered, one-line Label
        // of height 2*fontSize is (1-.26/2+.5)*fontSize = 1.37*fontSize.
        const text=(name:string,word:string,x:number,y:number,px:number,color:number[])=>label(this.root,assets,name,word,[x-180,y-px*1.37],[360,px*2],px,color);
        text('MisfortuneLabel','晦气',360,barY-24,30,[1,.94117647,.77647058]);text('NeedleLabel','绣花针',175,1094,28,[.38823529,.23137255,.14117647]);text('SlipperLabel','拖鞋',548,1094,28,[.38823529,.23137255,.14117647]);this.hint=text('DollHint','轻点布偶',360,888,21,[.98,.88,.69]);this.hint.color=new Color(.98*255,.88*255,.69*255,.85*255);this.advance();
    }
    private box(g:Graphics,rect:number[],radius:number,fill:number[]){g.fillColor=new Color(fill[0]*255,fill[1]*255,fill[2]*255,(fill[3]??1)*255);g.roundRect(rect[0],-rect[1]-rect[3],rect[2],rect[3],radius);g.fill();}
    private line(g:Graphics,a:number[],b:number[],color:number[],width:number){g.strokeColor=new Color(color[0]*255,color[1]*255,color[2]*255,(color[3]??1)*255);g.lineWidth=width;g.moveTo(a[0],-a[1]);g.lineTo(b[0],-b[1]);g.stroke();}
    advance(){const g=this.graphics,r=this.round,y=this.barY;g.clear();this.feedback.clear();
        const rim=this.rim,ends=this.ends;rim.clear();ends.clear();
        // Match the native per-frame redraw and keep StyleBoxFlat's authored
        // two-pixel border entirely inside the 405x29 outer rectangle.
        this.box(rim,[170,y,405,29],15,[.11,.085,.075,.88]);
        rim.strokeColor=new Color(.85490196*255,.71764706*255,.4745098*255);rim.lineWidth=2;rim.roundRect(171,-y-28,403,27,14);rim.stroke();
        ends.strokeColor=new Color(.78*255,.6*255,.35*255,.82*255);ends.lineWidth=1.6;
        for(const sign of [-1,1]){for(let i=0;i<33;i++){const t=i/32,radius=13*(1-t*.65),x=372.5+sign*217+Math.cos(t*Math.PI*2*1.23)*radius*sign,yy=y+14+Math.sin(t*Math.PI*2*1.23)*radius;if(i)ends.lineTo(x,-yy);else ends.moveTo(x,-yy);}ends.stroke();}
        const amount=Math.max(0,Math.min(1,r.displayedMisfortune/100));
        if(amount>.001){this.box(g,[174,y+4,397*amount,21],11,[.9372549,.7372549,.345098]);this.line(g,[183,y+7],[Math.max(183,174+387*amount),y+7],[1,.91,.65,.5],2);if(r.recoilTime<.2)this.box(g,[174,y+4,397*amount,21],11,[1,.96,.73,(1-r.recoilTime/.2)*.45]);}
        if(r.recoilTime<.34){const heavy=r.attackTool==='slipper',opacity=(1-r.recoilTime/.34)*.9;for(let i=0;i<(heavy?4:2);i++){const a=-1.2+i*.48,p=[r.attackTarget[0]+Math.cos(a)*23,r.attackTarget[1]+Math.sin(a)*23];this.line(this.feedback,p,[p[0]+Math.cos(a)*(heavy?15:8),p[1]+Math.sin(a)*(heavy?15:8)],[1,.81,.39,opacity],heavy?2.5:1.8);}}
        this.hint.node.active=r.acceptsInput()&&r.contacts===0;
    }
}
