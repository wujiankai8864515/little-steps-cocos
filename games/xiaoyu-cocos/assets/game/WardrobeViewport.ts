import { Node } from 'cc';
import { GameAssets } from './Assets';
import { renderSurfaces, Scope } from './Engine';
import { nodeAt, panel } from './Visual';
import { box, pageLayout, repaintPanel } from './Viewport';
let serial=0;
// Keep one admitted target at design-width density. Height follows the screen;
// the original illustration and its matching pointer frame stay independent.
export class WardrobeViewport {
    readonly root:Node;readonly canvas:Node;readonly input:Node;readonly surface:any;
    private rect:number[]=[0,0,720,1280];
    static async create(parent:Node,assets:GameAssets,scope:Scope,height:number){
        const renderer=renderSurfaces(),name='WardrobeRoom-'+(++serial);
        const target=await assets.acquireResizableTarget(name,720,Math.ceil(height),renderer,scope);
        return new WardrobeViewport(parent,scope,height,target);
    }
    private constructor(parent:Node,scope:Scope,height:number,private target:any){
        this.root=nodeAt(parent,'WardrobePage',0,0,720,height);this.root.active=false;
        scope.own(()=>{this.root.active=false;this.root.destroy();});
        panel(this.root,'WardrobeLetterbox',[0,0,720,height],[129/255,83/255,52/255]);
        this.surface=renderSurfaces().create({host:parent.scene,displayParent:this.root,logicalSize:[720,height],displayRect:[0,0,720,height],target:target.texture,name:'WardrobeRoom'},scope);
        this.canvas=nodeAt(this.surface.content,'OriginalWardrobeCanvas',0,0,720,1280);
        this.input=nodeAt(this.root,'WardrobeInputFrame',0,0,720,1280);this.resize(height);
    }
    resize(height:number){
        if(!Number.isFinite(height)||height<=0)throw new Error('Invalid wardrobe viewport height');
        const {scale,x,offset}=pageLayout(height),previous=this.surface.snapshot();
        const oldRect=this.rect.slice(),changed=this.target.texture.width!==720||this.target.texture.height!==Math.ceil(height);
        if(changed)this.surface.layout(previous.logicalSize,oldRect,null);
        try{this.target.resize(720,Math.ceil(height));}catch(error){this.surface.layout(previous.logicalSize,oldRect,this.target.texture);this.surface.setActive(previous.active);throw error;}
        this.rect=[0,0,720,height];
        box(this.root,0,0,720,height);repaintPanel(this.root.getChildByName('WardrobeLetterbox'),720,height);
        this.surface.layout([720,height],this.rect,this.target.texture);this.canvas.setPosition(x,-offset);this.canvas.setScale(scale,scale,1);
        if(changed)this.surface.setActive(previous.active);
        box(this.input,x,offset,720,1280);this.input.setScale(scale,scale,1);
    }
    get ready(){return this.surface.ready as Promise<void>;}
    setActive(active:boolean){this.surface.setActive(active);}
    snapshot(){return {...this.surface.snapshot(),displayRect:this.rect.slice(),inputScale:this.input.scale.x};}
}
