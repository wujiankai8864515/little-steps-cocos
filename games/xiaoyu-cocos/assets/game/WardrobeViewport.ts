import { Node } from 'cc';
import { GameAssets } from './Assets';
import { renderSurfaces, Scope } from './Engine';
import { nodeAt, panel } from './Visual';
import { box, repaintPanel } from './Viewport';
let serial=0;
// Original wardrobe_page.gd uses a fixed SubViewport, independent of physical
// device pixels. Only its presentation and matching input frame are fitted.
export class WardrobeViewport {
    readonly root:Node;readonly canvas:Node;readonly input:Node;readonly surface:any;
    private rect:number[]=[0,0,720,1280];
    static async create(parent:Node,assets:GameAssets,scope:Scope,height:number){
        const renderer=renderSurfaces(),name='WardrobeRoom-'+(++serial);
        const target=await assets.acquireTransient(name,renderer.estimateTarget(720,1280),()=>renderer.createTarget(720,1280,name),v=>v.destroy(),scope);
        return new WardrobeViewport(parent,scope,height,target);
    }
    private constructor(parent:Node,scope:Scope,height:number,private target:any){
        this.root=nodeAt(parent,'WardrobePage',0,0,720,height);this.root.active=false;
        scope.own(()=>{this.root.active=false;this.root.destroy();});
        panel(this.root,'WardrobeLetterbox',[0,0,720,height],[129/255,83/255,52/255]);
        this.surface=renderSurfaces().create({host:parent.scene,displayParent:this.root,logicalSize:[720,1280],displayRect:this.rect,target,name:'WardrobeRoom'},scope);
        this.canvas=nodeAt(this.surface.content,'OriginalWardrobeCanvas',0,0,720,1280);
        this.input=nodeAt(this.root,'WardrobeInputFrame',0,0,720,1280);this.resize(height);
    }
    resize(height:number){
        if(!Number.isFinite(height)||height<=0)throw new Error('Invalid wardrobe viewport height');
        const scale=Math.min(1,height/1280);this.rect=[(720-720*scale)/2,(height-1280*scale)/2,720*scale,1280*scale];
        box(this.root,0,0,720,height);repaintPanel(this.root.getChildByName('WardrobeLetterbox'),720,height);
        this.surface.layout([720,1280],this.rect,this.target);
        box(this.input,this.rect[0],this.rect[1],720,1280);this.input.setScale(scale,scale,1);
    }
    get ready(){return this.surface.ready as Promise<void>;}
    setActive(active:boolean){this.surface.setActive(active);}
    snapshot(){return {...this.surface.snapshot(),displayRect:this.rect.slice(),inputScale:this.input.scale.x};}
}
