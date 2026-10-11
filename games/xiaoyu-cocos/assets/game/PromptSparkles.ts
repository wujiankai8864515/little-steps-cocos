import { Color, Label, Node, UITransform, Vec3 } from 'cc';
import { GameAssets } from './Assets';
import { Scope } from './Engine';
import { TRAVEL_GLINT } from './TravelHomeRules';
import { nodeAt, picture } from './Visual';
// Original prompt_sparkles.gd: six painted cues, measured once per caption.
export class PromptSparkles {
    private age=0;private ink=-1;private glints:Array<ReturnType<typeof picture>>=[];
    constructor(private target:Node,assets:GameAssets,scope:Scope,private canvas:Node,private safe:()=>number[],text?:Label){
        if(text){const probe=nodeAt(target,'MeasurePrompt'),m=probe.addComponent(Label);m.font=text.font;m.fontSize=text.fontSize;m.overflow=Label.Overflow.NONE;this.ink=0;
            for(const line of text.string.split('\n')){m.string=line;m.updateRenderData(true);this.ink=Math.max(this.ink,probe.getComponent(UITransform).width);}probe.destroy();}
        for(let i=0;i<12;i++)this.glints.push(picture(target,assets,scope,TRAVEL_GLINT,'PromptGlint'+i));
    }
    advance(delta:number){
        if(!this.target.activeInHierarchy)return;this.age+=Math.min(Math.max(delta,0),.1);
        const ui=this.target.getComponent(UITransform),canvas=this.canvas.getComponent(UITransform),w=ui.width,h=ui.height,left=this.ink<0?0:Math.max(0,(w-Math.min(w,this.ink))/2),right=w-left,safe=this.safe(),offsets=[[-17,-9],[-27,10],[-9,17],[15,-12],[27,6],[10,18]],sizes=[16,10,7,20,11,8];
        for(let i=0;i<6;i++){const phase=this.age*(1.75+i*.13)+i*1.61,pulse=((Math.sin(phase)+1)*.5)**1.7,size=sizes[i]*(.76+.32*pulse),p=new Vec3((i<3?left:right)+offsets[i][0],-h/2-offsets[i][1]-Math.sin(phase*.56)*1.6,0),screen=canvas.convertToNodeSpaceAR(ui.convertToWorldSpaceAR(p)),scale=this.target.worldScale,pad=size*Math.max(Math.abs(scale.x),Math.abs(scale.y))*.75+3;
            screen.x=Math.max(safe[0]+pad,Math.min(safe[0]+safe[2]-pad,screen.x));screen.y=-Math.max(safe[1]+pad,Math.min(safe[1]+safe[3]-pad,-screen.y));const local=ui.convertToNodeSpaceAR(canvas.convertToWorldSpaceAR(screen));
            for(let halo=0;halo<2;halo++){const g=this.glints[i*2+halo],s=size*(halo?1:1.4)/128;g.root.setPosition(local.x,local.y);g.root.setScale(s,s,1);g.sprite.color=new Color(255,halo?255:224.4,halo?255:158.1,(.24+.74*pulse)*(halo?1:.16)*255);}
        }
    }
}
