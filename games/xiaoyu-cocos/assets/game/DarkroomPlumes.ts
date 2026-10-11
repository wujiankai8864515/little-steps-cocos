import { Color, Graphics, Node, Sprite, SpriteFrame, UITransform, Vec4 } from 'cc';
import { GameAssets } from './Assets';
import { Scope } from './Engine';
import { darkMaterial } from './DarkroomLighting';
import { smooth } from './DarkroomVisualRules';
import { nodeAt } from './Visual';

type Plume={root:Node;sprite:Sprite;material:any;origin:number[];age:number;life:number;factor:number;gold:boolean;fade:number};
const DARK='res://darkroom/assets/smoke.png',GOLD='res://darkroom/assets/release.png';
export class DarkroomPlumes {
    readonly root:Node;private active:Plume[]=[];private idle:Plume[]=[];private created=0;private releaseTime=-1;private releaseOrigin=[360,704];private sparkles:Graphics;private frames:SpriteFrame[];
    constructor(room:Node,private assets:GameAssets,private scope:Scope){this.root=nodeAt(room,'FlowingSmoke');this.frames=[assets.frame(DARK,scope),assets.frame(GOLD,scope)];this.sparkles=nodeAt(this.root,'ReleaseSparkles').addComponent(Graphics);}
    dark(at:number[]){this.emit([at[0]+66,at[1]-104],2.3,.22,false);}
    release(at:number[]){this.releaseTime=0;this.releaseOrigin=[at[0],at[1]-57];this.emit([at[0],at[1]-85],2.85,.32,true);this.emit([at[0]-38,at[1]-52],2.85,.25,true);this.active.forEach(p=>{if(!p.gold)p.fade=0;});}
    spawn(at:number[],seconds:number){this.clear();this.emit([at[0]+58,at[1]-30],seconds,.3,false);this.emit([at[0]-48,at[1]+20],seconds,.25,false);}
    private recycle(p:Plume){p.root.active=false;p.material.setProperty('darkState',new Vec4(0,0,.018,0));this.idle.push(p);}
    private emit(at:number[],life:number,factor:number,gold:boolean){
        if(this.active.length>=6)this.recycle(this.active.shift());let p=this.idle.pop();
        if(!p){const root=nodeAt(this.root,'PooledPlume'+(++this.created)),sprite=root.addComponent(Sprite),material=darkMaterial(this.assets,this.scope,'plume');sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.customMaterial=material;p={root,sprite,material,origin:at,age:0,life,factor,gold,fade:-1};}
        Object.assign(p,{origin:at.slice(),age:0,life,factor,gold,fade:-1});const spec=this.assets.art(gold?GOLD:DARK),c=spec.content,s=spec.size;p.sprite.spriteFrame=this.frames[gold?1:0];p.root.getComponent(UITransform).setContentSize(c[2],c[3]);p.root.getComponent(UITransform).setAnchorPoint((s[0]/2-c[0])/c[2],1-(s[1]/2-c[1])/c[3]);p.material.setProperty('sourceUV',new Vec4(c[0]/s[0],c[1]/s[1],c[2]/s[0],c[3]/s[1]));p.material.setProperty('textureSize',new Vec4(s[0],s[1],0,0));p.material.setProperty('darkState',new Vec4(0,0,.018,0));p.root.active=true;p.root.setSiblingIndex(this.root.children.length-1);this.active.push(p);this.pose(p,.62,0);this.sparkles.node.setSiblingIndex(this.root.children.length-1);
    }
    private pose(p:Plume,growth:number,alpha:number){const s=this.assets.art(p.gold?GOLD:DARK).size,source=p.gold?[1672,941]:[1181,1331];p.root.setScale(source[0]/s[0]*p.factor*growth,source[1]/s[1]*p.factor*growth,1);p.root.setPosition(p.origin[0]+Math.sin(p.age*1.4)*13,-p.origin[1]+p.age*(p.gold?23:38));p.root.angle=-Math.sin(p.age*1.35)*.07*180/Math.PI;p.material.setProperty('darkState',new Vec4(p.age,alpha,.018,0));}
    advance(delta:number){
        if(this.releaseTime>=0)this.releaseTime+=delta;
        for(let i=this.active.length-1;i>=0;i--){const p=this.active[i];p.age+=delta;if(p.fade>=0)p.fade+=delta;const t=p.age/p.life;
            if(t>=1||p.fade>.85){this.recycle(p);this.active.splice(i,1);continue;}
            let opacity=smooth(0,.17,t)*(1-smooth(p.gold?.72:.5,1,t));if(p.fade>=0)opacity*=1-smooth(0,.85,p.fade);this.pose(p,.65+.52*(1-(1-t)**2),opacity*.94);
        }
        const g=this.sparkles;g.clear();const t=this.releaseTime;if(t<0||t>2.85)return;const opacity=smooth(.05,.45,t)*(1-smooth(1.95,2.85,t));if(opacity<=.005)return;
        for(let i=0;i<13;i++){const angle=Math.PI*2*i/13+.15,distance=56+t*48+Math.sin(i*2.7)*22,x=this.releaseOrigin[0]+Math.cos(angle)*distance,y=this.releaseOrigin[1]+Math.sin(angle)*distance*.7-t*26,r=(3+i%3*2)*opacity;if(r<.1)continue;
            const points=[[0,-r*1.7],[r*.42,-r*.3],[r,0],[r*.28,r*.3],[0,r*1.7],[-r*.34,r*.27],[-r,0],[-r*.33,-r*.28]];g.fillColor=new Color(255,.8*255,.34*255,opacity*255);points.forEach((p,j)=>{if(j)g.lineTo(x+p[0],-y-p[1]);else g.moveTo(x+p[0],-y-p[1]);});g.close();g.fill();
        }
    }
    clear(){this.active.forEach(p=>this.recycle(p));this.active=[];this.releaseTime=-1;this.sparkles.clear();}
    snapshot(){return {capacity:6,created:this.created,active:this.active.length,idle:this.idle.length,release_time:this.releaseTime};}
}
