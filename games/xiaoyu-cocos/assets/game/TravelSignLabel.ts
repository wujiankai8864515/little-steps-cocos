import { Color, Node, Sprite, SpriteFrame } from 'cc';
import { GameAssets } from './Assets';
import { core, meshSprite, Scope } from './Engine';
import { TRAVEL_SIGN_FONTS } from './TravelSignFontData';
import { nodeAt } from './Visual';

export const TRAVEL_SIGN_RESOURCES=Object.keys(TRAVEL_SIGN_FONTS.atlases).map(k=>TRAVEL_SIGN_FONTS.atlases[k].resource) as string[];
// Original native glyph coverage and shaped runs. A sign rebuilds only when its
// text or pixel-density tier changes; it never creates a Canvas text texture.
export class TravelSignLabel {
    readonly node:Node;private sprite:any;private value='';private density=1;private table:any;private frames:Record<string,SpriteFrame>={};
    constructor(parent:Node,assets:GameAssets,scope:Scope,name:string,private rect:number[],size:number,physicalWidth:number){
        this.table=TRAVEL_SIGN_FONTS.sizes[String(size)];if(!this.table)throw Error('Missing native sign size');
        this.node=nodeAt(parent,name);this.sprite=this.node.addComponent(meshSprite());this.sprite.color=new Color(96,56,20,255);this.sprite.sizeMode=Sprite.SizeMode.CUSTOM;
        for(const tier of Object.keys(TRAVEL_SIGN_FONTS.atlases))this.frames[tier]=assets.frame(TRAVEL_SIGN_FONTS.atlases[tier].resource,scope);
        this.resize(physicalWidth);scope.own(()=>{this.sprite.spriteFrame=null;});
    }
    get string(){return this.value;}
    set string(value:string){if(value===this.value)return;this.value=value;this.draw();}
    resize(physicalWidth:number){const next=physicalWidth>720?2:1;if(this.density===next)return;this.density=next;this.draw();}
    private draw(){
        this.node.active=!!this.value;if(!this.value)return;
        const run=this.table.runs[this.value];if(!run)throw Error('Native sign run missing: '+this.value);
        const atlas=TRAVEL_SIGN_FONTS.atlases[String(this.density)];
        this.sprite.configure(core.shapedInkLineMesh(this.table,run,this.rect,this.density),atlas.size);
        this.sprite.spriteFrame=this.frames[String(this.density)];
    }
    snapshot(){return {text:this.value,density:this.density,glyphs:this.sprite.mesh?.indices.length/6||0};}
}
