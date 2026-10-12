import { Node, Sprite } from 'cc';
import { GameAssets } from './Assets';
import { meshSprite, Scope } from './Engine';
import { nodeAt } from './Visual';
import { pageLayout } from './Viewport';

// Reuse the admitted original texture. Reflect a narrow border into the vertical
// bleed, joining the same edge pixels without cropping the width or stretching
// the central illustration. There are no extra textures or bitmap downloads.
export class PageBackground {
    readonly root:Node;readonly sprite:any;
    constructor(parent:Node,private assets:GameAssets,scope:Scope,private resource:string,name:string,private region?:number[],private artTop=0,private artHeight=1280,private pinnedTop=0){
        this.root=nodeAt(parent,name);this.sprite=this.root.addComponent(meshSprite());this.sprite.spriteFrame=assets.frame(resource,scope);this.sprite.sizeMode=Sprite.SizeMode.CUSTOM;this.resize(1280);
    }
    resize(height:number,layout=pageLayout(height),headerInset=0){
        const spec=this.assets.art(this.resource),r=this.region||[0,0,...spec.size],left=-layout.x/layout.scale,width=720/layout.scale,top=layout.top,bottom=layout.bottom,end=this.artTop+this.artHeight,edge=Math.min(48,r[3]/4),vertices:number[]=[],source:number[]=[],indices:number[]=[];
        const band=(a:number,b:number,sa:number,sb:number)=>{if(b<=a)return;const i=vertices.length/2;vertices.push(left,a,left+width,a,left+width,b,left,b);source.push(r[0],sa,r[0]+r[2],sa,r[0]+r[2],sb,r[0],sb);indices.push(i,i+1,i+2,i,i+2,i+3);};
        if(this.pinnedTop>0){
            const split=r[1]+this.pinnedTop/this.artHeight*r[3],headerTop=top+headerInset/layout.scale,gapTop=headerTop+this.pinnedTop,gapBottom=this.artTop+this.pinnedTop,middle=(gapTop+gapBottom)/2;
            // Draw a safe-area header over the otherwise unchanged illustration
            // when the short screen has no room for a spacer below it.
            if(gapTop>gapBottom)band(gapBottom,end,split,r[1]+r[3]);
            band(top,headerTop,r[1]+edge,r[1]);band(headerTop,gapTop,r[1],split);
            band(gapTop,middle,split,split+edge);band(middle,gapBottom,split+edge,split);
            if(gapTop<=gapBottom)band(gapBottom,end,split,r[1]+r[3]);
        }else{band(top,this.artTop,r[1]+edge,r[1]);band(this.artTop,end,r[1],r[1]+r[3]);}
        band(end,bottom,r[1]+r[3],r[1]+r[3]-edge);
        this.sprite.configure({vertices:new Float32Array(vertices),source:new Float32Array(source),indices:new Uint16Array(indices)},spec.size,spec.content);
    }
}
