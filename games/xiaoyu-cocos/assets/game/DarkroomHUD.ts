import { Color, Node, view } from 'cc';
import { GameAssets } from './Assets';
import { DarkroomRound } from './DarkroomRound';
import { core, Scope } from './Engine';
import { Stroke2D } from './Stroke2D';
import { label, nodeAt } from './Visual';

export class DarkroomHUD {
    readonly root:Node;private fill:Stroke2D;private flash:Stroke2D;private feedback:Stroke2D;private rim:Stroke2D;private ends:Stroke2D;private shine:Stroke2D;private hint:any;private scale=0;private amount=-1;
    constructor(parent:Node,assets:GameAssets,scope:Scope,private round:DarkroomRound,private barY:number){
        this.root=nodeAt(parent,'MisfortuneMeter',0,0,720,1280);
        this.feedback=new Stroke2D(this.root,assets,scope,'WorldFeedback');
        this.rim=new Stroke2D(this.root,assets,scope,'MeterRim');
        this.fill=new Stroke2D(this.root,assets,scope,'MeterFill');
        this.shine=new Stroke2D(this.root,assets,scope,'MeterShine');
        this.flash=new Stroke2D(this.root,assets,scope,'MeterRecoilFlash');
        this.ends=new Stroke2D(this.root,assets,scope,'MeterSpirals');
        const paths=[];for(const sign of [-1,1]){const points=[];for(let i=0;i<33;i++){const t=i/32,radius=13*(1-t*.65);points.push([372.5+sign*217+Math.cos(t*Math.PI*2*1.23)*radius*sign,barY+14+Math.sin(t*Math.PI*2*1.23)*radius]);}paths.push(core.featherPolyline(points,1.6));}this.ends.draw(core.mergeDrawingMeshes(paths),[.78,.6,.35,.82]);
        // Creator 3.8.8's web alphabetic baseline for a centered, one-line Label
        // of height 2*fontSize is (1-.26/2+.5)*fontSize = 1.37*fontSize.
        const text=(name:string,word:string,x:number,y:number,px:number,color:number[])=>label(this.root,assets,name,word,[x-180,y-px*1.37],[360,px*2],px,color);
        text('MisfortuneLabel','晦气',360,barY-24,30,[1,.94117647,.77647058]);text('NeedleLabel','绣花针',175,1094,28,[.38823529,.23137255,.14117647]);text('SlipperLabel','拖鞋',548,1094,28,[.38823529,.23137255,.14117647]);this.hint=text('DollHint','轻点布偶',360,888,21,[.98,.88,.69]);this.hint.color=new Color(.98*255,.88*255,.69*255,.85*255);this.advance();
    }
    advance(){const r=this.round,y=this.barY;this.feedback.clear();
        // Native StyleBoxFlat adjusts its one-pixel AA size by the root's
        // stretch scale, even when the world itself uses an offscreen target.
        const scale=Math.min(view.getScaleX(),view.getScaleY()),changed=scale!==this.scale,aaSize=1/Math.max(.001,scale);
        if(changed){this.scale=scale;this.rim.draw(core.roundedStyleBox([170,y,405,29],{radius:15,borderWidth:2,fill:[.11,.085,.075,.88],border:[.85490196,.71764706,.4745098,1],aaSize}),[1,1,1,1]);}
        const amount=Math.max(0,Math.min(1,r.displayedMisfortune/100));
        if(amount>.001){if(changed||amount!==this.amount){this.fill.draw(core.roundedStyleBox([174,y+4,397*amount,21],{radius:11,fill:[.9372549,.7372549,.345098,1],aaSize}),[1,1,1,1]);this.shine.line([183,y+7],[Math.max(183,174+387*amount),y+7],2,[1,.91,.65,.5]);}if(r.recoilTime<.2)this.flash.draw(core.roundedStyleBox([174,y+4,397*amount,21],{radius:11,fill:[1,.96,.73,(1-r.recoilTime/.2)*.45],aaSize}),[1,1,1,1]);else this.flash.clear();}
        else{this.fill.clear();this.shine.clear();this.flash.clear();}this.amount=amount;
        if(r.recoilTime<.34){const heavy=r.attackTool==='slipper',opacity=(1-r.recoilTime/.34)*.9,lines=[];for(let i=0;i<(heavy?4:2);i++){const a=-1.2+i*.48,p=[r.attackTarget[0]+Math.cos(a)*23,r.attackTarget[1]+Math.sin(a)*23];lines.push(core.featherLine(p,[p[0]+Math.cos(a)*(heavy?15:8),p[1]+Math.sin(a)*(heavy?15:8)],heavy?2.5:1.8));}this.feedback.draw(core.mergeDrawingMeshes(lines),[1,.81,.39,opacity]);}
        this.hint.node.active=r.acceptsInput()&&r.contacts===0;
    }
    snapshot(){return {geometrySource:'Godot4.5.2 StyleBoxFlat',rootStretch:this.scale,aaSize:1/Math.max(.001,this.scale),cornerDetail:8,displayedAmount:this.amount,rimRect:[170,this.barY,405,29],fillRect:[174,this.barY+4,397*this.amount,21],flashAboveShine:true};}
}
