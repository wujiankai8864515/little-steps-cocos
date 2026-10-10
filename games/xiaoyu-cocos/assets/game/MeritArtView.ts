import { Material, Node, Rect, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import { GameAssets } from './Assets';
import { Scope } from './Engine';
import { meritLayout, MERIT_DIGITS, MERIT_ONE, MERIT_PLUS, MERIT_TITLE, SessionMerit } from './MeritFeedback';
import { nodeAt } from './Visual';

export class MeritArtView {
    readonly root:Node;
    private opacity:UIOpacity;
    private frames=new Map<string,{frame:SpriteFrame;region:number[];clip:number[]}>();
    private slots:Sprite[]=[];
    private amount=-1;
    constructor(parent:Node,assets:GameAssets,scope:Scope) {
        this.root=nodeAt(parent,'MeritReward');this.opacity=this.root.addComponent(UIOpacity);
        const material=new Material();material.initialize({effectAsset:assets.effect('home-merit'),defines:{USE_TEXTURE:true}});scope.own(()=>material.destroy());
        const original='res://assets/merit_reward_14.png',digits='res://home/feedback/assets/merit_digits_thin_gold.png';
        const glyphs=[{glyph:'功德',resource:original,region:MERIT_TITLE},{glyph:'+1',resource:original,region:MERIT_ONE},{glyph:'+',resource:original,region:MERIT_PLUS},...MERIT_DIGITS.map((region,i)=>({glyph:String(i),resource:digits,region}))];
        glyphs.forEach(g=>{const crop=assets.art(g.resource).content,r=g.region,left=Math.max(r[0],crop[0]),top=Math.max(r[1],crop[1]),right=Math.min(r[0]+r[2],crop[0]+crop[2]),bottom=Math.min(r[1]+r[3],crop[1]+crop[3]),frame=assets.frame(g.resource,scope);frame.rect=new Rect(left-crop[0],top-crop[1],right-left,bottom-top);this.frames.set(g.glyph,{frame,region:r,clip:[left,top,right-left,bottom-top]});});
        // Safe integer amounts need at most 16 digits, a plus, and a title.
        for(let i=0;i<18;i++){const n=nodeAt(this.root,'Glyph'+i),s=n.addComponent(Sprite);s.sizeMode=Sprite.SizeMode.CUSTOM;s.customMaterial=material;this.slots.push(s);}
        scope.own(()=>{this.root.active=false;this.root.destroy();});this.root.active=false;
    }
    update(state:ReturnType<SessionMerit['snapshot']>) {
        this.root.active=state.visible;if(!state.visible)return;
        this.root.setPosition(state.position[0],-state.position[1]);this.opacity.opacity=state.alpha*255;
        if(this.amount===state.amount)return;this.amount=state.amount;
        const draws=meritLayout(state.amount).draws;
        this.slots.forEach((sprite,i)=>{const draw=draws[i];sprite.node.active=!!draw;if(!draw)return;const entry=this.frames.get(draw.glyph),r=entry.region,c=entry.clip,d=draw.rect;sprite.spriteFrame=entry.frame;sprite.node.setPosition(d[0]+(c[0]-r[0])/r[2]*d[2],-(d[1]+(c[1]-r[1])/r[3]*d[3]));sprite.node.getComponent(UITransform).setContentSize(c[2]/r[2]*d[2],c[3]/r[3]*d[3]);});
    }
}
