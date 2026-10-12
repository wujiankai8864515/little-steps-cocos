import { Color, EventTouch, Graphics, Label, Node, Sprite, UITransform } from 'cc';
import { LoadingAssets } from './LoadingAssets';
import { loadingMath as m } from './LoadingMath';
import { loadingPose } from './LoadingMotion';

function nodeAt(parent:Node,name:string,x=0,y=0,w=1,h=1){const node=new Node(name);parent.addChild(node);node.setPosition(x,-y);const ui=node.addComponent(UITransform);ui.setAnchorPoint(0,1);ui.setContentSize(w,h);return node;}
function panel(parent:Node,name:string,r:number[],fill:number[],radius:number,stroke?:number[]){const node=nodeAt(parent,name,...r as [number,number,number,number]),g=node.addComponent(Graphics);g.fillColor=new Color(fill[0]*255,fill[1]*255,fill[2]*255,(fill[3]??1)*255);g.roundRect(0,-r[3],r[2],r[3],radius);g.fill();if(stroke){g.strokeColor=new Color(stroke[0]*255,stroke[1]*255,stroke[2]*255,stroke[3]*255);g.stroke();}return node;}
export class LoadingView {
    readonly root:Node;
    private composition:Node;
    private background:Node;
    private paperArt:Node;
    private actors:Node[]=[];
    private clock=0;
    private ticks:Graphics;
    private progress:Graphics;
    private status:Label;
    private retry:Node;
    private press:{id:number;x:number;y:number}=null;
    onRetry=()=>{};
    constructor(canvas:Node,private assets:LoadingAssets,height:number){
        const size=canvas.getComponent(UITransform).contentSize;
        this.root=nodeAt(canvas,'IsolatedLoading',-size.width/2,-size.height/2,720,height);
        this.background=nodeAt(this.root,'BleedBackground',0,0,720,height);const bg=this.background.addComponent(Sprite);bg.sizeMode=Sprite.SizeMode.CUSTOM;bg.spriteFrame=assets.frame(assets.paper());
        this.paperArt=nodeAt(this.root,'OriginalPaper',0,(height-1280)/2-160,720,1600);const paper=this.paperArt.addComponent(Sprite);paper.sizeMode=Sprite.SizeMode.CUSTOM;paper.spriteFrame=bg.spriteFrame;
        this.composition=nodeAt(this.root,'Composition',0,(height-1280)/2,720,1280);
        assets.manifest.images.forEach((spec:any,i:number)=>{const root=nodeAt(this.composition,spec.name,0,0,spec.size[0],spec.size[1]),child=nodeAt(root,'ApprovedPixels',spec.content[0],spec.content[1],spec.content[2],spec.content[3]),sprite=child.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=assets.frame(assets.textures[i]);if(i)this.actors.push(root);});
        this.actors[2].setSiblingIndex(1); // Authored order: shadow, doll, body, mallet.
        this.ticks=nodeAt(this.composition,'ImpactTicks').addComponent(Graphics);
        panel(this.composition,'ProgressFrame',[182,933,356,28],[1,.97647,.89804,.96078],14,[.80784,.63137,.34118,.4902]);
        panel(this.composition,'ProgressTrack',[187,938,346,18],[.8549,.75294,.56471,.39216],9);
        this.progress=nodeAt(this.composition,'DeterminateProgress',187,938,346,18).addComponent(Graphics);
        [185,358,531].forEach(x=>panel(this.composition,'TravelMark',[x,972,4,4],[.6902,.49804,.23529,.35294],2));
        this.status=this.label(this.composition,'Status','正在准备资源…',[120,992,480,44],22,[.56,.37,.18]);
        this.retry=panel(this.composition,'Retry',[286,1054,148,48],[.94,.82,.59,.9],16);this.label(this.retry,'RetryText','重试',[0,0,148,48],24,[.42,.27,.12]);this.retry.active=false;
        this.retry.on(Node.EventType.TOUCH_START,(e:EventTouch)=>{const p=e.getUILocation();this.press={id:e.getID(),x:p.x,y:p.y};});
        this.retry.on(Node.EventType.TOUCH_MOVE,(e:EventTouch)=>{const p=e.getUILocation();if(this.press&&Math.hypot(p.x-this.press.x,p.y-this.press.y)>9)this.press=null;});
        this.retry.on(Node.EventType.TOUCH_CANCEL,()=>this.cancel());
        this.retry.on(Node.EventType.TOUCH_END,(e:EventTouch)=>{if(this.press?.id!==e.getID())return;this.cancel();this.retry.active=false;this.onRetry();});
        this.advance(0);
    }
    private label(parent:Node,name:string,text:string,r:number[],size:number,color:number[]){const node=nodeAt(parent,name,...r as [number,number,number,number]),label=node.addComponent(Label);label.font=this.assets.font;label.string=text;label.fontSize=size;label.lineHeight=size*1.2;label.overflow=Label.Overflow.CLAMP;label.horizontalAlign=Label.HorizontalAlign.CENTER;label.verticalAlign=Label.VerticalAlign.CENTER;label.color=new Color(color[0]*255,color[1]*255,color[2]*255);node.getComponent(UITransform).setContentSize(r[2],r[3]);return label;}
    cancel(){this.press=null;}
    resize(height:number){const canvas=this.root.parent,size=canvas.getComponent(UITransform).contentSize;this.root.setPosition(-size.width/2,size.height/2);this.root.getComponent(UITransform).setContentSize(720,height);this.background.getComponent(UITransform).setContentSize(720,height);this.paperArt.setPosition(0,-((height-1280)/2-160));this.composition.setPosition(0,-(height-1280)/2);this.cancel();}
    setStage(text:string,fraction=0){this.retry.active=false;this.status.string=text;const amount=Math.min(.99,Math.max(0,fraction)),g=this.progress;g.clear();if(amount<=0)return;g.fillColor=new Color(221,166,64);g.roundRect(0,-18,346*amount,18,Math.min(9,346*amount/2));g.fill();const highlight=Math.max(0,346*amount-3);if(highlight>0){g.fillColor=new Color(255,223,132,230);g.roundRect(2,-6,highlight,4,Math.min(3,highlight/2));g.fill();}}
    failure(){this.setStage('资源准备失败，请重试。');this.retry.active=true;}
    advance(delta:number){this.clock=(this.clock+Math.max(delta,0))%2.2;const pose=loadingPose(Math.floor(this.clock*30));[pose.body,pose.prop,pose.doll].forEach((t,i)=>{const matrix=m.multiply(t,m.trs([[100,56],[425,120],[77,69]][i])),n=this.actors[i];n.setPosition(matrix[4],-matrix[5]);n.angle=-Math.atan2(matrix[1],matrix[0])*180/Math.PI;n.setScale(Math.hypot(matrix[0],matrix[1]),Math.hypot(matrix[2],matrix[3]),1);});const g=this.ticks;g.clear();const e=pose.impact;if(e<0)return;g.lineWidth=3;g.strokeColor=new Color(223,158,43,[.72,.65,.4,.15][e]*255);const starts=[[7,-12],[19,-2],[-3,-22]],ends=[[15,-23],[32,-7],[-2,-32]];starts.forEach((p,i)=>{g.moveTo(pose.contact[0]+p[0]+e*2,-(pose.contact[1]+p[1]-e));g.lineTo(pose.contact[0]+ends[i][0]+e*3,-(pose.contact[1]+ends[i][1]-e*2));g.stroke();});}
    dispose(){this.cancel();this.root.active=false;this.root.destroy();}
}
