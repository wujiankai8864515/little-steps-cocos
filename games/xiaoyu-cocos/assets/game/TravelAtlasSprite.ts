import { Node, Sprite } from 'cc';
import { GameAssets } from './Assets';
import { meshSprite, Scope } from './Engine';
import { nodeAt } from './Visual';
// One owned atlas frame, original source UVs and clipped transparent margins.
// Geometry carries Godot's diary skew, rather than rotating the whole book.
export class TravelAtlasSprite {
    readonly root:Node;readonly sprite:any;region:number[];private base:Float32Array;private skew=0;
    constructor(parent:Node,private assets:GameAssets,scope:Scope,readonly resource:string,region:number[],name:string){
        this.root=nodeAt(parent,name);const child=nodeAt(this.root,'AtlasPixels');this.sprite=child.addComponent(meshSprite());this.setRegion(region);this.sprite.spriteFrame=assets.frame(resource,scope);this.sprite.sizeMode=Sprite.SizeMode.CUSTOM;
    }
    setRegion(r:number[]){
        if(this.region&&this.region.every((v,i)=>v===r[i]))return;this.region=r.slice();const spec=this.assets.art(this.resource),c=spec.content,l=Math.max(r[0],c[0]),t=Math.max(r[1],c[1]),rr=Math.min(r[0]+r[2],c[0]+c[2]),b=Math.min(r[1]+r[3],c[1]+c[3]),source=new Float32Array([l,t,rr,t,rr,b,l,b]);
        this.base=new Float32Array(Array.from(source).map((v,i)=>v-r[i%2]-r[i%2+2]/2));
        this.sprite.configure({source,vertices:this.base.slice(),indices:new Uint16Array([0,1,2,0,2,3])},spec.size,spec.content);this.setSkew(this.skew);
    }
    setSkew(value:number){this.skew=value;const v=this.sprite.mesh.vertices;for(let i=0;i<this.base.length;i+=2){v[i]=this.base[i]-Math.sin(value)*this.base[i+1];v[i+1]=Math.cos(value)*this.base[i+1];}this.sprite.geometryChanged();}
    place(rect:number[]){this.root.setPosition(rect[0]+rect[2]/2,-rect[1]-rect[3]/2);this.root.setScale(rect[2]/this.region[2],rect[3]/this.region[3],1);}
    dispose(){this.sprite.spriteFrame=null;this.root.destroy();}
}
