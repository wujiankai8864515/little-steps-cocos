import { Graphics, Label, Node, UITransform } from 'cc';
import { GameAssets } from './Assets';
import { core, Scope, sharedUI } from './Engine';
import { label, nodeAt } from './Visual';

// header_tag.gd's fixed hit rectangle and separately suspended paper face.
export class HomeHeaderTag {
    readonly root:Node;
    readonly swing=new core.SwingFeedback();
    private visual:Node;
    private value:Label;
    private width:number;
    private text='';
    constructor(parent:Node,assets:GameAssets,scope:Scope,rect:number[],private settings=true) {
        const [x,y,w,h]=rect;this.width=w;this.root=nodeAt(parent,settings?'Settings':'MeritCounter',x,y,w,h);
        this.visual=nodeAt(this.root,'SuspendedFace',w*.5,4);
        const g=this.visual.addComponent(Graphics),pin=nodeAt(this.root,'FixedPins',w*.5,4).addComponent(Graphics),ui=sharedUI();
        const paper=[248/255,223/255,172/255,1],edge=[152/255,96/255,55/255,1],ink=[102/255,60/255,33/255,1];
        const dark=(value:number)=>[edge[0]*(1-value),edge[1]*(1-value),edge[2]*(1-value),1];
        const line=(a:number[],b:number[],c:number[],width:number)=>{g.strokeColor=ui.color(c);g.lineWidth=width;g.moveTo(a[0],-a[1]);g.lineTo(b[0],-b[1]);g.stroke();};
        const ties=settings?[0]:[-w*.3,w*.3];
        ties.forEach(tie=>{pin.fillColor=ui.color(dark(.18));pin.circle(tie,0,2.4);pin.fill();line([tie,0],[tie-2,27],[105/255,67/255,39/255,1],2.8);line([tie-1,0],[tie-3,25],[179/255,134/255,76/255,1],1);});
        const left=-w*.5+5,right=w*.5-5,top=24,bottom=h-10,fw=w-10,fh=h-34,cx=(left+right)/2,cy=(top+bottom)/2;
        const outline=[[left+6,top+1],[left,top+7],[left+1,bottom-6],[left+6,bottom],[right-6,bottom-.5],[right-1,bottom-6],[right,top+7],[right-6,top+1],[right*.32,top-.5],[left*.42,top+.5]];
        const inner=outline.map(p=>[cx+(p[0]-cx)*(fw-4.5)/fw,cy+(p[1]-cy)*(fh-4.5)/fh]);
        ui.polygon(g,outline.map(p=>[p[0]+1.5,p[1]+2.5]),[.18,.08,.025,.24]);ui.polygon(g,outline,edge);ui.polygon(g,inner,paper,[215/255,166/255,101/255,1],1.2);
        line([left+5,top+11],[left+6,bottom-11],[.62,.35,.16,.17],1);line([right-5,top+15],[right-6,bottom-8],[.62,.35,.16,.16],1);
        for(let i=0;i<7;i++){const x=left+10+(right-left-20)*i/6,y=top+7+(i%2)*2;line([x,y],[x+2.4,y-.3],[.62,.35,.16,.1],.7);}
        ties.forEach(tie=>{g.strokeColor=ui.color(dark(.13));g.lineWidth=1.3;g.circle(tie-2,-top-3,3);g.stroke();line([tie-2,top-1],[tie-2,top+5],[121/255,80/255,44/255,1],1.8);});
        if(settings){
            const center=[cx,cy+1],contour=[];
            for(let i=0;i<40;i++){const angle=i/40*Math.PI*2-Math.PI*.5,radius=([1,2,3].indexOf(i%5)>=0?14:10.8)+Math.sin(i*2.1)*.32;contour.push([center[0]+Math.cos(angle)*radius,center[1]+Math.sin(angle)*radius]);}
            ui.polygon(g,contour,ink);g.fillColor=ui.color(paper);g.circle(center[0]+.1,-center[1]+.2,6);g.fill();g.strokeColor=ui.color(ink);g.lineWidth=1.8;g.circle(center[0],-center[1],4);g.stroke();
        }else{
            const metrics=assets.catalog.assets['res://assets/bootstrap_ui.ttf'].fontMetrics;
            this.value=label(this.visual,assets,'Value','功德 0',[left+10,top+1+(metrics.ascent-metrics.descent-.74)*23/2],[fw-20,fh-2],23,ink);
            this.value.lineHeight=23*metrics.height;this.setValue(0);
        }
        scope.own(()=>{this.root.active=false;this.root.destroy();});this.advance(0);
    }
    setValue(amount:number) {
        if(!this.value)return;const text='功德 '+amount;if(text===this.text)return;this.text=text;
        const bounds=this.value.node.getComponent(UITransform),width=this.width-30,height=bounds.height;
        this.value.string=text;this.value.enableWrapText=false;this.value.overflow=Label.Overflow.NONE;
        let desired=23;
        for(;desired>12;desired--){this.value.fontSize=desired;this.value.updateRenderData(true);if(bounds.width<=width)break;}
        this.value.fontSize=desired;this.value.lineHeight=desired*1.184;this.value.overflow=Label.Overflow.CLAMP;bounds.setContentSize(width,height);
    }
    advance(delta:number) {if(this.settings)this.swing.advance(delta);else{this.swing.angle=0;this.swing.velocity=0;this.swing.scale=1;}this.visual.angle=-this.swing.angle*180/Math.PI;this.visual.setScale(this.swing.scale,this.swing.scale,1);}
    snapshot(){return {settings:this.settings,value:this.text,angle:this.swing.angle,scale:this.swing.scale};}
}
