import { Color, Graphics, Node } from 'cc';
import { GameAssets } from './Assets';
import { core, Scope, sharedUI } from './Engine';
import { loadingPose } from './LoadingMotion';
import { label, nodeAt, panel, picture } from './Visual';

export class LoadingPage {
    readonly root: Node;
    private clock = 0;
    private actors: ReturnType<typeof picture>[];
    private ticks: Graphics;
    private progress: Graphics;
    private status: ReturnType<typeof label>;
    private retry: Node;
    private action: any;
    onRetry = () => {};
    constructor(parent: Node, assets: GameAssets, scope: Scope, height: number) {
        this.root=nodeAt(parent,'LoadingPage',0,0,720,height);
        picture(this.root,assets,scope,'res://entry/assets/backgrounds/loading_clean_bleed_720x1600.png','BleedBackground',{position:[0,(height-1600)/2],centered:false});
        const composition=nodeAt(this.root,'Composition',0,(height-1280)/2,720,1280);
        picture(composition,assets,scope,'res://entry/assets/loading/ground_shadows.png','GroundShadows',{centered:false});
        const doll=picture(composition,assets,scope,'res://entry/assets/loading/native/doll_rig.png','Doll',{centered:false});
        const body=picture(composition,assets,scope,'res://entry/assets/loading/native/actor_body.png','Body',{centered:false});
        const prop=picture(composition,assets,scope,'res://entry/assets/loading/native/actor_fin_mallet.png','FinMallet',{centered:false});
        this.actors=[body,prop,doll]; this.ticks=nodeAt(composition,'ImpactTicks').addComponent(Graphics);
        panel(composition,'ProgressFrame',[182,933,356,28],[1,.97647,.89804,.96078],14,[.80784,.63137,.34118,.4902]);
        panel(composition,'ProgressTrack',[187,938,346,18],[.8549,.75294,.56471,.39216],9);
        this.progress=nodeAt(composition,'DeterminateProgress',187,938,346,18).addComponent(Graphics);
        [185,358,531].forEach(x=>panel(composition,'TravelMark',[x,972,4,4],[.6902,.49804,.23529,.35294],2));
        this.status=label(composition,assets,'Status','正在准备资源…',[120,992],[480,44],22,[.56,.37,.18]);
        this.retry=panel(composition,'Retry',[286,1054,148,48],[.94,.82,.59,.9],16);
        label(this.retry,assets,'RetryText','重试',[0,0],[148,48],24,[.42,.27,.12]);this.retry.active=false;
        this.action=sharedUI().action(this.retry,()=>{this.retry.active=false;this.onRetry();},()=>this.retry.activeInHierarchy);
        scope.own(()=>{this.action.dispose();this.root.active=false;this.root.destroy();});this.advance(0);
    }
    setStage(message: string, fraction = 0) {
        this.status.string=message; const amount=core.Math2D.clamp(fraction,0,.99),g=this.progress;
        g.clear(); if(amount<=0)return;
        g.fillColor=new Color(221,166,64);g.roundRect(0,-18,346*amount,18,Math.min(9,346*amount/2));g.fill();
        const highlight=Math.max(0,346*amount-3);if(highlight>0){g.fillColor=new Color(255,223,132,230);g.roundRect(2,-6,highlight,4,Math.min(3,highlight/2));g.fill();}
    }
    failure() {this.setStage('资源准备失败，请重试。');this.retry.active=true;}
    advance(delta: number) {
        this.clock=(this.clock+Math.max(delta,0))%2.2;const pose=loadingPose(Math.floor(this.clock*30));
        [pose.body,pose.prop,pose.doll].forEach((transform,i)=>{
            const crop=[[100,56],[425,120],[77,69]][i],m=core.Math2D.multiply(transform,core.Math2D.trs(crop)),n=this.actors[i].root;
            n.setPosition(m[4],-m[5]);n.angle=-Math.atan2(m[1],m[0])*180/Math.PI;n.setScale(Math.hypot(m[0],m[1]),Math.hypot(m[2],m[3]),1);
        });
        const g=this.ticks;g.clear();const e=pose.impact;if(e<0)return;
        g.lineWidth=3;g.strokeColor=new Color(223,158,43,[.72,.65,.4,.15][e]*255);
        const starts=[[7,-12],[19,-2],[-3,-22]],ends=[[15,-23],[32,-7],[-2,-32]];
        starts.forEach((p,i)=>{g.moveTo(pose.contact[0]+p[0]+e*2,-(pose.contact[1]+p[1]-e));g.lineTo(pose.contact[0]+ends[i][0]+e*3,-(pose.contact[1]+ends[i][1]-e*2));g.stroke();});
    }
}
