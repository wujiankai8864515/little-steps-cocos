import { Material, Node, Sprite } from 'cc';
import { GameAssets } from './Assets';
import { meshSprite, Scope } from './Engine';
import { TRAVEL_GLINT } from './TravelHomeRules';
import { bezier, encounterStar } from './TravelSceneState';
import { nodeAt } from './Visual';
// Fixed capacity: 48 stars × (two trails, halo, core) plus the destination.
// One retained mesh/material preserves original draw order and float alpha.
export class TravelGlints {
    readonly root:Node;readonly sprite:any;private material:Material;private vertices:Float32Array;private data:Float32Array;private sourceRect:number[];private extent:number[];
    constructor(parent:Node,assets:GameAssets,scope:Scope){
        this.root=nodeAt(parent,'EncounterConvergenceField');this.sprite=this.root.addComponent(meshSprite());const spec=assets.art(TRAVEL_GLINT),c=spec.content;this.sourceRect=c;this.extent=spec.size;
        const count=193,source=new Float32Array(count*8),indices=new Uint16Array(count*6);this.vertices=new Float32Array(count*8);this.data=new Float32Array(count*12);
        for(let i=0;i<count;i++){source.set([c[0],c[1],c[0]+c[2],c[1],c[0]+c[2],c[1]+c[3],c[0],c[1]+c[3]],i*8);indices.set([i*4,i*4+1,i*4+2,i*4,i*4+2,i*4+3],i*6);}
        this.sprite.configure({source,vertices:this.vertices,vertexData:this.data,indices},spec.size,spec.content);this.sprite.spriteFrame=assets.frame(TRAVEL_GLINT,scope);this.sprite.sizeMode=Sprite.SizeMode.CUSTOM;
        this.material=new Material();this.material.initialize({effectAsset:assets.effect('travel-glint')});this.sprite.customMaterial=this.material;scope.own(()=>{this.sprite.customMaterial=null;this.material.destroy();});
    }
    private quad(index:number,at:number[],size:number,type:number,alpha:number,angle=0){
        const c=this.sourceRect,w=this.extent[0],h=this.extent[1],cos=Math.cos(angle),sin=Math.sin(angle),corners=[[c[0],c[1]],[c[0]+c[2],c[1]],[c[0]+c[2],c[1]+c[3]],[c[0],c[1]+c[3]]];
        for(let i=0;i<4;i++){const x=(corners[i][0]/w-.5)*size,y=(corners[i][1]/h-.5)*size,o=index*8+i*2;this.vertices[o]=at[0]+x*cos-y*sin;this.vertices[o+1]=at[1]+x*sin+y*cos;this.data.set([type,alpha,0],index*12+i*3);}
    }
    render(age:number,target:number[],height:number){
        this.root.active=!!target;if(!target)return;let q=0;
        for(let depth=0;depth<3;depth++)for(let i=depth;i<48;i+=3){const p=encounterStar(i,age,target,[720,height]);if(!p.visible){for(let n=0;n<4;n++)this.quad(q++,[0,0],0,2,0);continue;}
            for(let trail=2;trail>=1;trail--)this.quad(q++,bezier([p.source,p.p1,p.p2,p.target],Math.max(0,p.u-.022*trail)),p.extent*(.75-.15*trail),0,p.alpha*(.52-.14*trail));
            this.quad(q++,p.at,p.extent*2.1,1,p.alpha*.22,p.rotation);this.quad(q++,p.at,p.extent,2,p.alpha,p.rotation);
        }
        const b=.5+.5*Math.sin(age*Math.PI*2/3.8);this.quad(q,target,90+18*b,3,.15+.08*b);this.sprite.geometryChanged();
    }
}
