import { Node } from 'cc';
import { GameAssets } from './Assets';
import { Scope, sharedUI } from './Engine';
import { clamp, LAMP_RECT } from './DarkroomVisualRules';

const grow=(r:number[],v:number)=>[r[0]-v,r[1]-v,r[2]+2*v,r[3]+2*v];
const intersects=(a:number[],b:number[])=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];
export class DarkroomBubble {
    private bubble:any=null;
    constructor(private root:Node,private assets:GameAssets,scope:Scope,private safe:number[],private anchor:()=>number[]){scope.own(()=>this.dismiss());}
    setSafe(safe:number[]){this.safe=safe;this.layout();}
    show(text:string,seconds:number){this.dismiss();this.bubble=sharedUI().infoBubble(this.root,this.assets.font('res://assets/bootstrap_ui.ttf'),text,this.anchor(),this.safe,{fontSize:28,minWidth:220,maxWidth:330,minimumFontSize:20,holdSeconds:seconds,fontMetrics:this.assets.catalog.assets['res://assets/bootstrap_ui.ttf'].fontMetrics});this.bubble.root.name='CreamResultBubble';this.layout();}
    private layout(){
        if(!this.bubble)return;const at=this.anchor(),protectedRect=grow(LAMP_RECT,12),full=this.safe;
        const blocked=(r:number[])=>{const above=r[1]>at[1],baseY=above?r[1]:r[1]+r[3],tip=[clamp(at[0],r[0]+22,r[0]+r[2]-22),clamp(at[1],baseY-26,baseY+26)],baseX=clamp(tip[0],r[0]+58,r[0]+r[2]-58),tail=[Math.min(baseX,tip[0]),Math.min(baseY,tip[1]),Math.abs(baseX-tip[0]),Math.abs(baseY-tip[1])];return intersects(grow(r,9),protectedRect)||intersects(grow(tail,9),protectedRect);};
        let best=full,score=Infinity;const card=this.bubble.layoutFor(at,full);
        if(blocked(card)){
            const x=protectedRect[0],y=protectedRect[1],right=x+protectedRect[2],bottom=y+protectedRect[3],candidates=[[full[0],full[1],full[2],Math.max(0,y-full[1]-10)],[full[0],bottom+10,full[2],Math.max(0,full[1]+full[3]-bottom-10)],[right+10,full[1],Math.max(0,full[0]+full[2]-right-10),full[3]],[full[0],full[1],Math.max(0,x-full[0]-10),full[3]]];
            for(const safe of candidates){if(safe[2]<200||safe[3]<120)continue;const r=this.bubble.layoutFor(at,safe);if(blocked(r))continue;const distance=Math.hypot(r[0]+r[2]/2-at[0],r[1]+r[3]/2-(at[1]-r[3]/2-20));if(distance<score){score=distance;best=safe;}}
        }
        this.bubble.setSafe(best);this.bubble.setAnchor(at);
    }
    advance(delta:number){if(!this.bubble)return;this.layout();this.bubble.advance(delta);if(this.bubble.snapshot().phase==='hidden')this.dismiss();}
    dismiss(){if(this.bubble)this.bubble.root.destroy();this.bubble=null;}
    snapshot(){return this.bubble?this.bubble.snapshot():{phase:'hidden'};}
}
