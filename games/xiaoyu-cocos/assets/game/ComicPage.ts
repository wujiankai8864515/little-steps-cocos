import { Color, input, Input, KeyCode, Label, Node, UIOpacity } from 'cc';
import { GameAssets } from './Assets';
import { audioTransport, core, meshSprite, Scope, sharedUI } from './Engine';
import { ComicAudio } from './AudioBehavior';
import { OpeningClock } from './OpeningClock';
import { label, nodeAt, panel } from './Visual';

export class ComicPage {
    readonly root: Node;
    readonly clock = new OpeningClock();
    active = false;
    onEnter = () => {};
    onRetry = () => {};
    onCancel = () => {};
    private panels: Array<{polygon: number[][]; mesh: any; sprite: any; bubble: any; amount: number}> = [];
    private prompt: Label;
    private status: Label;
    private enterHit: Node;
    private retryHit: Node;
    private actions: any[] = [];
    private dots: Node[] = [];
    private caption: Node;
    private audio: ComicAudio;
    constructor(parent: Node, assets: GameAssets, scope: Scope, height: number, gestureSeen=false) {
        this.root=nodeAt(parent,'ComicPage',0,0,720,height);
        panel(this.root,'Background',[0,0,720,height],[.89,.85,.77,1]);
        const margin=Math.min(24,720*.035),header=Math.min(114,height*.13),frameH=height-header-margin;
        const actionH=Math.min(78,height*.1),paperH=frameH-32-actionH-16,paperW=720-margin*2;
        const factor=Math.min(paperW/1024,paperH/1536),origin=[margin+(paperW-1024*factor)/2,header+(paperH-1536*factor)/2];
        panel(this.root,'PaperShadow',[origin[0]+4,origin[1]+6,1024*factor,1536*factor],[.16,.12,.07,.12],5);
        const paper=nodeAt(this.root,'Paper',origin[0],origin[1],1024,1536);paper.setScale(factor,factor,1);
        panel(paper,'PaperColor',[0,0,1024,1536],[251/255,245/255,229/255,1]);
        const story:any=assets.json('res://config/opening_story.json');
        if(story.status!=='approved' || story.panels.length!==4 || story.presentation.mode!=='single_paper_sequential_reveal')throw new Error('开场正式内容不完整');
        const transport=audioTransport(),sounds:Record<string,any>={};
        Object.keys(story.sound_effects).forEach(key=>sounds[key]=assets.audio(story.sound_effects[key]));
        this.audio=new ComicAudio([0,1].map(i=>transport.player(this.root,scope,'ComicOneShot'+i,(event:string,state:any)=>console.info('[LittleSteps] comic audio '+event+' '+JSON.stringify(state)))),sounds,gestureSeen);
        scope.own(()=>this.audio.dispose());
        const slots=[[88,228,280,104],[679,69,280,104],[72,678,326,142],[54,1140,352,144]],anchors=[[280,358],[766,199],[354,846],[350,1310]];
        const Mesh=meshSprite(),ui=sharedUI();
        story.panels.forEach((p:any,i:number)=>{
            const art=assets.art(p.image),node=nodeAt(paper,'Panel'+i,0,0,1024,1536),sprite=node.addComponent(Mesh);
            const mesh={source:new Float32Array(8),vertices:new Float32Array(8),indices:new Uint16Array([0,1,2,0,2,3])};
            sprite.spriteFrame=assets.frame(p.image,scope);sprite.configure(mesh,art.size,art.content);node.active=false;
            this.panels.push({polygon:p.paper_polygon,mesh,sprite,bubble:null,amount:-1});
        });
        // All bubble content is above all paper polygons; typography never changes paper layout.
        this.panels.forEach((p,i)=>{p.bubble=ui.fixedBubble(paper,assets.font(story.font),story.panels[i].text,slots[i],anchors[i],{fontSize:43,minimumFontSize:35,persistent:true,fontMetrics:assets.catalog.assets[story.font].fontMetrics});p.bubble.advance(1);p.bubble.advance(1);p.bubble.root.active=false;});
        const statusY=header+paperH+8,actionY=statusY+32+8;
        this.status=label(this.root,assets,'Status','',[margin,statusY],[paperW,32],24,[.25,.17,.11]);
        this.enterHit=nodeAt(this.root,'Advance',(720-200)/2,actionY,200,actionH);
        const breath=nodeAt(this.enterHit,'BreathingEnterText',100,actionH/2,200,actionH);
        this.prompt=label(breath,assets,'EnterPrompt','点击进入',[-100,-actionH/2],[200,actionH],28,[.25,.17,.11]);
        this.caption=nodeAt(this.enterHit,'WaitingCaption',0,0,200,actionH);this.caption.active=false;
        // One fixed geometry for all dot counts, equivalent to Godot AFTER_SHAPING.
        const glyphs=Array.from('正在准备小屋...'),font=assets.font('res://assets/bootstrap_ui.ttf'),widths:number[]=[];
        glyphs.forEach((text,i)=>{
            const l=label(this.caption,assets,'WaitingGlyph'+i,text,[0,0],[1,actionH],28,[.25,.17,.11]);
            l.enableWrapText=false;l.overflow=Label.Overflow.NONE;l.updateRenderData(true);
            const w=l.node.getComponent('cc.UITransform') as any;widths.push(w.width);this.dots.push(l.node);
        });
        const total=widths.reduce((a,b)=>a+b,0);let x=(200-total)/2;
        this.dots.forEach((n,i)=>{n.setPosition(x,0);const t=n.getComponent('cc.UITransform') as any;t.setContentSize(widths[i],actionH);n.getComponent(Label).overflow=Label.Overflow.CLAMP;x+=widths[i];});
        this.actions.push(ui.action(this.enterHit,()=>this.clock.enter(this.active),()=>this.active&&this.clock.state==='playing'&&this.clock.enterAvailable));
        this.retryHit=panel(this.root,'Retry',( [285,actionY,150,56] ),[.94,.82,.59,.9],16);
        label(this.retryHit,assets,'RetryCaption','重试',[0,0],[150,56],24,[.25,.17,.11]);
        this.actions.push(ui.action(this.retryHit,()=>this.clock.retry(this.active),()=>this.active&&!!this.clock.error));
        const key=(event:any)=>{if(!this.active)return;if(event.keyCode===KeyCode.SPACE||event.keyCode===KeyCode.ENTER)this.clock.enter(true);else if(event.keyCode===KeyCode.ESCAPE&&this.clock.cancel())this.onCancel();};input.on(Input.EventType.KEY_DOWN,key);
        this.clock.onPanel=i=>{this.audio.reveal(i);console.info('[LittleSteps] comic panel '+i+' revealed '+JSON.stringify(this.audio.snapshot()));};
        this.clock.onFinished=()=>this.onEnter();this.clock.onRetry=()=>this.onRetry();
        console.info('[LittleSteps] comic typography '+JSON.stringify(this.panels.map(p=>p.bubble.snapshot())));
        scope.own(()=>{input.off(Input.EventType.KEY_DOWN,key);this.actions.forEach(a=>a.dispose());this.root.active=false;this.root.destroy();});this.refresh();
    }
    start() {this.active=true;this.audio.setActive(true);this.clock.start();this.refresh();}
    pause() {this.active=false;this.audio.setActive(false);this.actions.forEach(a=>a.cancel());}
    resume() {this.active=true;this.audio.setActive(true);}
    fail(reason: string) {this.clock.fail(reason);this.refresh();}
    advance(delta:number) {this.clock.tick(delta,this.active);this.refresh();}
    private refresh() {
        this.panels.forEach((p,i)=>{
            const amount=this.clock.amounts[i];if(amount===p.amount)return;p.amount=amount;
            p.bubble.root.active=amount>=.98;p.sprite.node.active=amount>0;if(amount<=0)return;
            const ys=p.polygon.map(point=>point[1]),top=Math.min(...ys),edge=top+(Math.max(...ys)-top)*amount,points:number[][]=core.clipPolygonBelow(p.polygon,edge);
            // A convex quadrilateral clipped by one horizontal edge can have 3–5 points.
            p.mesh.source=new Float32Array([].concat(...points));p.mesh.vertices=new Float32Array(p.mesh.source);
            const indices=[];for(let j=1;j<points.length-1;j++)indices.push(0,j,j+1);p.mesh.indices=new Uint16Array(indices);
            const art=p.sprite.sourceRect; // configure owns capacity changes; cropped UV origin stays fixed.
            p.sprite.configure(p.mesh,[1024,1536],art);
        });
        const waiting=this.clock.state==='waiting'&&!this.clock.error;
        this.enterHit.active=(this.clock.state==='playing'&&this.clock.enterAvailable)||waiting;
        this.retryHit.active=!!this.clock.error;
        this.status.string=this.clock.error?'准备小屋失败，请重试。':'';
        this.prompt.node.parent.active=!waiting;this.caption.active=waiting;
        const amount=this.clock.state==='playing'&&this.clock.enterAvailable?.5-.5*Math.cos(Math.PI*2*this.clock.promptElapsed/2.8):0;
        this.prompt.node.parent.setScale(1+.025*amount,1+.025*amount,1);
        let opacity=this.prompt.node.getComponent(UIOpacity)||this.prompt.node.addComponent(UIOpacity);opacity.opacity=(.86+.14*amount)*255;
        const count=1+Math.floor(this.clock.waitingElapsed/.45)%3;
        this.dots.forEach((n,i)=>n.active=i<6+count);
    }
}
