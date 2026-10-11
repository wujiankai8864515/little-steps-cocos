import { Color, Label, Node, UITransform, Vec2 } from 'cc';
import { GameAssets } from './Assets';
import { Scope } from './Engine';
import { TRAVEL_FONT, TRAVEL_GLINT } from './TravelHomeRules';
import { label, nodeAt, picture } from './Visual';
// Shared original Home cue styling and bounded four-point texture glints.
export class WayfindingHint {
    readonly root:Node;private text:Label;private ink=0;private age=0;private glints:Array<ReturnType<typeof picture>>=[];
    constructor(parent:Node,assets:GameAssets,scope:Scope,text:string,private size:number[],private visibleRect:()=>number[]){
        this.root=nodeAt(parent,'WayfindingHint',0,0,size[0],size[1]);
        this.text=label(this.root,assets,'SharedWayfindingText',text,[0,0],size,21,[1,237/255,199/255],TRAVEL_FONT);this.text.lineHeight=21*1.184;
        this.text.enableOutline=true;this.text.outlineColor=new Color(81,50,31);this.text.outlineWidth=1;this.text.enableShadow=true;this.text.shadowColor=new Color(51,29.325,17.85,89.25);this.text.shadowOffset=new Vec2(0,-1);
        const probe=nodeAt(this.root,'Measure'),m=probe.addComponent(Label);m.font=this.text.font;m.fontSize=21;m.overflow=Label.Overflow.NONE;
        for(const line of text.split('\n')){m.string=line;m.updateRenderData(true);this.ink=Math.max(this.ink,probe.getComponent(UITransform).width);}probe.destroy();
        for(let i=0;i<12;i++)this.glints.push(picture(this.root,assets,scope,TRAVEL_GLINT,'PromptGlint'+i));
        this.root.active=false;
    }
    advance(delta:number,at:number[],visible:boolean){
        this.root.active=visible;if(!visible)return;this.root.setPosition(at[0],-at[1]);if(this.root.activeInHierarchy)this.age+=Math.min(Math.max(delta,0),.1);
        const [width,height]=this.size,left=Math.max(0,(width-Math.min(width,this.ink))/2),right=width-left,offsets=[[-17,-9],[-27,10],[-9,17],[15,-12],[27,6],[10,18]],sizes=[16,10,7,20,11,8],safe=this.visibleRect();
        for(let i=0;i<6;i++){const phase=this.age*(1.75+i*.13)+i*1.61,pulse=((Math.sin(phase)+1)*.5)**1.7,size=sizes[i]*(.76+.32*pulse),pad=size*.75+3;
            const p=[Math.max(safe[0]+pad-at[0],Math.min(safe[0]+safe[2]-pad-at[0],(i<3?left:right)+offsets[i][0])),Math.max(safe[1]+pad-at[1],Math.min(safe[1]+safe[3]-pad-at[1],height/2+offsets[i][1]+Math.sin(phase*.56)*1.6))];
            for(let halo=0;halo<2;halo++){const g=this.glints[i*2+halo],s=size*(halo?1:1.4)/128;g.root.setPosition(p[0],-p[1]);g.root.setScale(s,s,1);g.sprite.color=new Color(255,halo?255:224.4,halo?255:158.1,(.24+.74*pulse)*(halo?1:.16)*255);}
        }
    }
}
