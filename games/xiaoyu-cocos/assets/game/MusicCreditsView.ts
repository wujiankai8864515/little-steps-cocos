import { Color, EventKeyboard, Graphics, input, Input, KeyCode, Label, Mask, Node, ScrollView, UITransform, Vec2 } from 'cc';
import { GameAssets } from './Assets';
import { HomeMusic } from './AudioBehavior';
import { Scope, sharedUI } from './Engine';
import { box, repaintPanel } from './Viewport';
import { HOME_CREDITS_TEXT } from './HomeCreditsText';
import { label, nodeAt, panel } from './Visual';

export class MusicCreditsView {
    readonly root:Node;
    onDismiss=()=>{};
    private close:any;
    private toggle:any;
    private text:Label;
    private scroller:ScrollView;
    private content:UITransform;
    private bodyHeight:number;
    private track:Graphics;
    private thumb:Graphics;
    private toggleGraphics:Graphics;
    private pressed=false;
    private hover=false;
    private disposed=false;
    private scrollbarBinding:any;
    private thumbStart=0;
    private scrollStart=0;private buttonWidth=0;
    constructor(parent:Node,assets:GameAssets,scope:Scope,height:number,safe:number[],private music:()=>HomeMusic) {
        const ui=sharedUI(),w=Math.min(620,Math.max(safe[2]-40,200)),h=Math.min(900,Math.max(safe[3]-64,340)),x=safe[0]+(safe[2]-w)/2,y=safe[1]+(safe[3]-h)/2;
        this.root=nodeAt(parent,'MusicCredits',0,0,720,height);panel(this.root,'Backdrop',[0,0,720,height],[.13,.1,.07,.58]);
        const sheet=panel(this.root,'CreditsPanel',[x,y,w,h],[.98,.94,.84],20,[.51,.35,.21],2);
        const metrics=assets.catalog.assets['res://assets/bootstrap_ui.ttf'].fontMetrics;
        const title=label(sheet,assets,'Title','音乐与署名',[24,22],[w-48,34],28,[.24,.16,.1]);title.lineHeight=28*metrics.height;
        title.node.setPosition(24,-(22+(metrics.ascent-metrics.descent-.74)*28/2));
        this.bodyHeight=h-44-34-28-52;
        const body=nodeAt(sheet,'Body',24,70,w-48,this.bodyHeight),view=nodeAt(body,'Viewport',0,0,w-48-8,this.bodyHeight);view.addComponent(Mask).type=Mask.Type.GRAPHICS_RECT;
        const content=nodeAt(view,'Content',0,0,w-48-8,this.bodyHeight);this.content=content.getComponent(UITransform);
        const bodyText=label(content,assets,'Credits',HOME_CREDITS_TEXT,[0,0],[w-48-8,this.bodyHeight],21,[.24,.16,.1]);
        // FreeType's hinted ascent/descent are separate pixel metrics. The
        // published 21px RichText uses 20+6px, rather than fractional hhea 24.864.
        bodyText.enableWrapText=true;bodyText.horizontalAlign=Label.HorizontalAlign.LEFT;bodyText.verticalAlign=Label.VerticalAlign.TOP;bodyText.lineHeight=Math.ceil(21*metrics.ascent)+Math.ceil(21*metrics.descent);bodyText.overflow=Label.Overflow.RESIZE_HEIGHT;bodyText.updateRenderData(true);
        const measured=bodyText.node.getComponent(UITransform).height-.26*bodyText.lineHeight;this.content.setContentSize(w-48-8,Math.max(this.bodyHeight,measured));
        this.scroller=body.addComponent(ScrollView);this.scroller.content=content;this.scroller.horizontal=false;this.scroller.vertical=true;this.scroller.elastic=false;this.scroller.inertia=false;this.scroller.cancelInnerEvents=true;
        const track=nodeAt(body,'Scrollbar',w-48-8,0,8,this.bodyHeight);this.track=track.addComponent(Graphics);this.track.fillColor=ui.color([.1,.1,.1,.6]);this.track.roundRect(0,-this.bodyHeight,8,this.bodyHeight,4);this.track.fill();
        this.thumb=nodeAt(track,'Grabber',0,0,8,this.bodyHeight).addComponent(Graphics);
        const scrollTo=(value:number)=>this.scroller.scrollToOffset(new Vec2(0,Math.max(0,Math.min(this.content.height-this.bodyHeight,value))),0);
        this.scrollbarBinding=ui.pointer(track,{down:(p:number[])=>{this.thumbStart=p[1];this.scrollStart=this.scroller.getScrollOffset().y;this.paintScrollbar(true);},move:(p:number[])=>scrollTo(this.scrollStart+(p[1]-this.thumbStart)*this.content.height/this.bodyHeight),up:()=>this.paintScrollbar(false),cancel:()=>this.paintScrollbar(false)},()=>this.visible);
        body.on(ScrollView.EventType.SCROLLING,()=>this.paintScrollbar(false));
        const button=nodeAt(sheet,'MusicToggle',24,h-74,w-48,52);this.toggleGraphics=button.addComponent(Graphics);
        this.text=label(button,assets,'ToggleText','音乐：开',[0,0],[w-48,52],23,[.875,.875,.875]);this.text.lineHeight=23*metrics.height;
        this.text.node.setPosition(0,-((metrics.ascent-metrics.descent-.74)*23/2));
        this.toggle=ui.action(button,()=>{const music=this.music();if(!music)return;music.setEnabled(!music.isEnabled());this.refresh();console.info('[LittleSteps] music credits toggle '+JSON.stringify(music.snapshot()));},()=>this.visible);
        this.buttonWidth=w-48;const down=()=>{if(this.visible){this.pressed=true;this.paintButton(this.buttonWidth);}},up=()=>{this.pressed=false;this.paintButton(this.buttonWidth);},enter=()=>{this.hover=true;this.paintButton(this.buttonWidth);},leave=()=>{this.hover=false;this.paintButton(this.buttonWidth);};
        button.on(Node.EventType.TOUCH_START,down);button.on(Node.EventType.TOUCH_END,up);button.on(Node.EventType.TOUCH_CANCEL,up);button.on(Node.EventType.MOUSE_ENTER,enter);button.on(Node.EventType.MOUSE_LEAVE,leave);
        this.close=ui.hangingReturn(this.root,assets.font('res://assets/bootstrap_ui.ttf'),[safe[0]+12,safe[1]+4,72,118],()=>this.dismiss(),()=>this.visible);
        const block=(e:any)=>{if(this.visible)e.propagationStopped=true;};[Node.EventType.TOUCH_START,Node.EventType.TOUCH_MOVE,Node.EventType.TOUCH_END,Node.EventType.TOUCH_CANCEL].forEach(event=>this.root.on(event,block));
        const key=(event:EventKeyboard)=>{if(this.visible&&event.keyCode===KeyCode.ESCAPE)this.dismiss();};input.on(Input.EventType.KEY_DOWN,key);
        scope.own(()=>{this.disposed=true;input.off(Input.EventType.KEY_DOWN,key);this.close.dispose();this.toggle.dispose();this.scrollbarBinding.dispose();this.root.active=false;this.root.destroy();});
        this.paintButton(this.buttonWidth);this.paintScrollbar(false);this.root.active=false;
    }
    resize(height:number,safe:number[]){
        const w=Math.min(620,Math.max(safe[2]-40,200)),h=Math.min(900,Math.max(safe[3]-64,340));
        const oldOffset=this.scroller.getScrollOffset().y;this.scroller.stopAutoScroll();this.toggle.cancel();this.scrollbarBinding.cancel();this.close.cancel();
        box(this.root,0,0,720,height);repaintPanel(this.root.getChildByName('Backdrop'),720,height);
        const sheet=this.root.getChildByName('CreditsPanel');box(sheet,safe[0]+(safe[2]-w)/2,safe[1]+(safe[3]-h)/2,w,h);repaintPanel(sheet,w,h,20,true);
        sheet.getChildByName('Title').getComponent(UITransform).setContentSize(w-48,34);
        this.bodyHeight=h-44-34-28-52;const body=sheet.getChildByName('Body'),viewport=body.getChildByName('Viewport');
        box(body,24,70,w-48,this.bodyHeight);box(viewport,0,0,w-56,this.bodyHeight);
        const text=this.content.node.getChildByName('Credits').getComponent(Label);text.node.getComponent(UITransform).setContentSize(w-56,this.bodyHeight);text.updateRenderData(true);
        this.content.setContentSize(w-56,Math.max(this.bodyHeight,text.node.getComponent(UITransform).height-.26*text.lineHeight));
        const track=this.track.node;box(track,w-56,0,8,this.bodyHeight);this.track.clear();this.track.roundRect(0,-this.bodyHeight,8,this.bodyHeight,4);this.track.fill();
        box(this.thumb.node,0,0,8,this.bodyHeight);const button=sheet.getChildByName('MusicToggle');box(button,24,h-74,w-48,52);this.text.node.getComponent(UITransform).setContentSize(w-48,52);this.buttonWidth=w-48;
        this.close.root.setPosition(safe[0]+12,-safe[1]-4);this.scroller.scrollToOffset(new Vec2(0,Math.min(oldOffset,Math.max(0,this.content.height-this.bodyHeight))),0);this.paintButton(this.buttonWidth);this.paintScrollbar(false);
    }
    private paintButton(width:number) {const value=this.pressed?0:this.hover?.225:.1;this.toggleGraphics.clear();this.toggleGraphics.fillColor=new Color(value*255,value*255,value*255,.6*255);this.toggleGraphics.roundRect(0,-52,width,52,3);this.toggleGraphics.fill();const v=this.pressed?1:this.hover?.95:.875;this.text.color=new Color(v*255,v*255,v*255,255);}
    private paintScrollbar(pressed:boolean) {const maximum=Math.max(0,this.content.height-this.bodyHeight),size=Math.max(8,this.bodyHeight*this.bodyHeight/this.content.height),offset=Math.max(0,Math.min(maximum,this.scroller.getScrollOffset().y)),y=maximum?(this.bodyHeight-size)*offset/maximum:0;this.thumb.clear();this.thumb.fillColor=sharedUI().color(pressed?[.75,.75,.75,.75]:[1,1,1,.4]);this.thumb.roundRect(0,-y-size,8,size,4);this.thumb.fill();}
    private refresh(){this.text.string=this.music()&&this.music().isEnabled()?'音乐：开':'音乐：关';}
    get visible(){return !this.disposed&&this.root.active;}
    open(){if(this.disposed)return;this.refresh();this.scroller.stopAutoScroll();this.scroller.scrollToTop(0);this.root.active=true;this.paintScrollbar(false);console.info('[LittleSteps] music credits opened');}
    dismiss(){if(!this.visible)return;this.root.active=false;this.close.cancel();this.toggle.cancel();this.scrollbarBinding.cancel();this.pressed=false;this.hover=false;this.onDismiss();console.info('[LittleSteps] music credits dismissed');}
    advance(delta:number){if(this.visible)this.close.advance(delta);}
}
