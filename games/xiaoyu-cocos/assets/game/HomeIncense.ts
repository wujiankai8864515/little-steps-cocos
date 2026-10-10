import { Color, game, Graphics, Label, Material, Node, Sprite, SpriteFrame, sys, Texture2D, UITransform, UIOpacity, Vec2, Vec3, Vec4 } from 'cc';
import { ArtSpec, GameAssets } from './Assets';
import { core, meshSprite, Scope, sharedUI } from './Engine';
import { HomeEntryIntent } from './HomeEntryIntent';
import { HomeLighting } from './HomeLighting';
import { HomeShadows } from './HomeShadows';
import { IncenseState, IncenseStore } from './IncenseState';
import { INCENSE_RATIO, IncenseSmoke, incenseFlame, STICK_BASE } from './IncenseSmoke';
import { nodeAt, picture } from './Visual';
const ART='res://assets/round2/incense_ceramic.png',GLINT='res://home/feedback/assets/returned_bag_diamond.png',HINT_FONT='res://travel/assets/travel_ui.ttf';
export function makeIncenseGradient(){
    const texture=new Texture2D(),bytes=new Uint8Array(32*512*4);
    for(let y=0;y<512;y++)for(let x=0;x<32;x++){const t=x/31,alpha=t<.1?0:t<.22?(t-.1)/.12:t<=.78?1:t<.9?(.9-t)/.12:0,i=(y*32+x)*4;bytes[i]=bytes[i+1]=bytes[i+2]=255;bytes[i+3]=Math.round(alpha*255);}
    texture.reset({width:32,height:512,format:Texture2D.PixelFormat.RGBA8888});texture.uploadData(bytes);texture.setFilters(Texture2D.Filter.LINEAR,Texture2D.Filter.LINEAR);texture.setMipFilter(Texture2D.Filter.NONE);texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE,Texture2D.WrapMode.CLAMP_TO_EDGE);return texture;
}
export class HomeIncense {
    readonly root:Node;readonly visual:Node;readonly hint:Node;readonly state:IncenseState;readonly smoke=new IncenseSmoke();
    private burner:ReturnType<typeof picture>;private stick:Node;private stickMaterial:Material;private smokeSprite:any;private fire:Graphics;private hintLabel:Label;private hintOpacity:UIOpacity;private glints:Array<ReturnType<typeof picture>>=[];
    private entry=new HomeEntryIntent();private pointer:number=null;private press:number[];private bounce=-1;private tip:any=null;private tipPointer:number=null;private tipValid=false;private redrawAge=0;private glintAge=0;private active=false;private pendingWarning=false;private hintInk=0;
    constructor(private room:Node,private table:Node,private assets:GameAssets,private scope:Scope,lighting:HomeLighting,shadows:HomeShadows,gradient:Texture2D,private anchor:()=>number[],private visible:()=>number[]) {
        this.root=nodeAt(room,'IndependentIncense');this.visual=nodeAt(room,'IncenseSmokeAndEmber');this.hint=nodeAt(room,'UnlitIncenseGentleHint',0,0,240,52);
        this.burner=picture(this.root,assets,scope,ART,'CeramicIncenseBurner',{centered:false,position:[-256*INCENSE_RATIO,-443*INCENSE_RATIO],scale:[INCENSE_RATIO,INCENSE_RATIO]});
        lighting.receiver(this.burner.sprite,this.burner.spec,1,[48/512,137/512,417/512,313/512]);
        const frame=()=>{const f=new SpriteFrame();f.texture=gradient;f.packable=false;scope.own(()=>f.destroy());return f;};
        this.stick=nodeAt(this.root,'IncenseStick');const rod=this.stick.addComponent(Sprite);rod.sizeMode=Sprite.SizeMode.CUSTOM;rod.spriteFrame=frame();
        const spec:ArtSpec={kind:'texture',bundle:'transient',path:'IncenseRodGradient',size:[32,512],content:[0,0,32,512],opaque:[0,0,32,512],decodedBytes:65536};this.stickMaterial=lighting.receiver(rod,spec,1,[0,0,1,1],'incense');
        const properties={'metadata/floor':true,'metadata/shadow_z':21,'metadata/thickness':0,'metadata/table':table};
        shadows.add(this.burner.root,ART,{...properties,'metadata/height_factor':.48,'metadata/spans':[[106,156],[223,284],[377,414]],'metadata/ground':()=>this.canonical(this.root,[0,0])[1]});
        shadows.add(this.stick,'',{...properties,'metadata/height_factor':1,'metadata/ground':()=>this.canonical(this.root,STICK_BASE)[1]},false,{spec,frame});
        const smokeNode=nodeAt(this.visual,'OriginalSmokeRibbon'),sprite=smokeNode.addComponent(meshSprite());sprite.configure(this.smoke.mesh,[1,1]);sprite.spriteFrame=assets.frame(ART,scope);sprite.sizeMode=Sprite.SizeMode.CUSTOM;
        const material=new Material();material.initialize({effectAsset:assets.effect('home-smoke')});sprite.customMaterial=material;scope.own(()=>material.destroy());this.smokeSprite=sprite;this.fire=nodeAt(this.visual,'IgnitionAndEmber').addComponent(Graphics);
        this.hintLabel=this.hint.addComponent(Label);this.hintLabel.font=assets.font(HINT_FONT);this.hintLabel.string='点击燃香';this.hintLabel.fontSize=21;this.hintLabel.lineHeight=21*1.184;this.hintLabel.overflow=Label.Overflow.CLAMP;this.hintLabel.horizontalAlign=Label.HorizontalAlign.CENTER;this.hintLabel.verticalAlign=Label.VerticalAlign.CENTER;this.hintLabel.color=new Color(255,237,199);
        this.hintLabel.enableOutline=true;this.hintLabel.outlineColor=new Color(81,50,31);this.hintLabel.outlineWidth=1;this.hintLabel.enableShadow=true;this.hintLabel.shadowColor=new Color(51,29.325,17.85,89.25);this.hintLabel.shadowOffset=new Vec2(0,-1);this.hintOpacity=this.hint.addComponent(UIOpacity);
        const probe=nodeAt(room,'WayfindingMeasurement'),measure=probe.addComponent(Label);measure.font=this.hintLabel.font;measure.string=this.hintLabel.string;measure.fontSize=21;measure.overflow=Label.Overflow.NONE;measure.updateRenderData(true);this.hintInk=probe.getComponent(UITransform).width;probe.destroy();
        for(let i=0;i<12;i++)this.glints.push(picture(this.hint,assets,scope,GLINT,'PromptGlint'+i));
        const checkpoint=new core.CheckpointStore({getItem:(key:string)=>sys.localStorage.getItem(key),setItem:(key:string,value:string)=>sys.localStorage.setItem(key,value)},4096),store=new IncenseStore(checkpoint);
        this.state=new IncenseState(store,()=>Date.now()/1000,()=>game.totalTime);this.pendingWarning=this.state.persistenceFailed;
        this.state.onWarning=reason=>{this.pendingWarning=true;console.warn('[LittleSteps] incense persistence '+reason);};
        this.state.onStarted=()=>{this.dismiss();this.smoke.ignite(this.state.stickLength,this.state.burnCount);console.info('[LittleSteps] incense started '+JSON.stringify(this.snapshot()));};
        this.state.onFinished=()=>console.info('[LittleSteps] incense finished '+JSON.stringify(this.snapshot()));
        this.state.onAdvance=(delta,previous)=>this.smoke.advance(delta,previous,this.state.duration,this.state.visualTime,this.state.burnCount);
        this.syncTransform();this.draw();this.updateHint(0);console.info('[LittleSteps] incense ready '+JSON.stringify(this.snapshot()));scope.own(()=>{this.cancel();this.state.advanceClock();this.state.flush();this.dismiss();});
    }
    private canonical(node:Node,at:number[]){const world=node.getComponent(UITransform).convertToWorldSpaceAR(new Vec3(at[0],-at[1])),p=this.room.getComponent(UITransform).convertToNodeSpaceAR(world);return [p.x,-p.y];}
    private local(at:number[]){const world=this.room.getComponent(UITransform).convertToWorldSpaceAR(new Vec3(at[0],-at[1])),p=this.root.getComponent(UITransform).convertToNodeSpaceAR(world);return [p.x,-p.y];}
    private syncTransform(){const at=this.canonical(this.table,[329,215]),s=this.table.scale;let factor=1;if(this.bounce>=0){const t=Math.min(1,this.bounce/.28);factor=1-.075*Math.sin(t*Math.PI*2)*(1-t);}
        const pivot=[(.5*(48+465)-256)*INCENSE_RATIO,(.5*(137+450)-443)*INCENSE_RATIO],angle=-this.table.angle*Math.PI/180,shift=[pivot[0]*s.x*(1-factor),pivot[1]*s.y*(1-factor)];this.root.setPosition(at[0]+Math.cos(angle)*shift[0]-Math.sin(angle)*shift[1],-at[1]-Math.sin(angle)*shift[0]-Math.cos(angle)*shift[1]);this.root.setScale(s.x*factor,s.y*factor,1);this.root.angle=this.table.angle;
        this.visual.setPosition(this.root.position);this.visual.setScale(this.root.scale);this.visual.angle=this.root.angle;
    }
    hit(at:number[]){const p=this.local(at),x=p[0]/INCENSE_RATIO+256,y=p[1]/INCENSE_RATIO+443,scale=Math.max(Math.hypot(this.root.worldScale.x,this.root.worldScale.y)/Math.sqrt(2)*INCENSE_RATIO,.001),padding=10/scale;
        return x>=48-padding&&x<465+padding&&y>=137-padding&&y<450+padding||(this.state.burning&&p[0]>=STICK_BASE[0]-3.5-12&&p[0]<STICK_BASE[0]+3.5+12&&p[1]>=STICK_BASE[1]-this.state.stickLength-12&&p[1]<STICK_BASE[1]+12);
    }
    private inTip(at:number[]){const r=this.tip?.snapshot().card;return r&&at[0]>=r[0]&&at[0]<r[0]+r[2]&&at[1]>=r[1]&&at[1]<r[1]+r[3];}
    down(id:number,at:number[]){if(this.tip?.root.active){this.tipPointer=id;this.tipValid=this.tip.snapshot().phase==='hold'&&this.inTip(at);return true;}if(this.entry.busy)return true;if(this.pointer!==null||!at.every(Number.isFinite)||!this.hit(at))return false;this.pointer=id;this.press=at.slice();return this.entry.down(at);}
    move(id:number,at:number[]){if(id===this.tipPointer&&!this.inTip(at))this.tipValid=false;if(id===this.pointer)this.entry.move(at);}
    up(id:number,at:number[]){if(id===this.tipPointer){if(this.tipValid&&this.inTip(at)&&this.tip.snapshot().phase==='hold')this.tip.close();this.tipPointer=null;this.tipValid=false;return;}if(id!==this.pointer)return;this.pointer=null;if(this.entry.up(at))this.bounce=0;}
    cancel(){this.pointer=null;this.tipPointer=null;this.tipValid=false;this.entry.cancel();this.bounce=-1;this.syncTransform();}
    setActive(active:boolean){this.active=active;this.state.advanceClock();if(!active){this.cancel();this.dismiss();this.state.flush();}this.draw();}
    dismiss(){if(this.tip){this.tip.root.destroy();this.tip=null;}}
    private message(text:string){this.dismiss();this.tip=sharedUI().infoBubble(this.room,this.assets.font('res://assets/bootstrap_ui.ttf'),text,this.anchor(),[24,135,672,1025],{fontSize:24,minWidth:320,maxWidth:430,aboveOnly:true,holdSeconds:2.2,fontMetrics:this.assets.catalog.assets['res://assets/bootstrap_ui.ttf'].fontMetrics});this.tip.root.setSiblingIndex(this.room.children.length-1);console.info('[LittleSteps] incense tip '+JSON.stringify({text,anchor:this.anchor(),...this.tip.snapshot()}));}
    advance(delta:number){this.state.advanceClock();if(this.bounce>=0){this.bounce+=Math.max(0,delta);this.syncTransform();if(this.entry.advance(delta)){this.bounce=-1;this.syncTransform();if(this.active){this.state.advanceClock();if(this.state.burning)this.message('还没燃尽');else this.state.ignite();}}}else this.syncTransform();
        if(this.tip){this.tip.setAnchor(this.anchor());this.tip.advance(delta);if(!this.tip.root.active)this.dismiss();}
        if(this.active&&this.pendingWarning&&!this.tip){this.message('保存暂时不可用，刷新后可能无法恢复燃香。');this.pendingWarning=false;}
        this.redrawAge+=Math.max(0,delta);if(this.redrawAge>=1/30){this.redrawAge=0;this.draw();}this.updateHint(delta);
    }
    private draw(){const length=this.state.stickLength;this.stick.active=this.state.burning;this.stick.setPosition(STICK_BASE[0]-3.5,-STICK_BASE[1]+length);this.stick.getComponent(UITransform).setContentSize(32,512);this.stick.setScale(7/32,Math.max(length,.001)/512,1);this.stickMaterial.setProperty('incenseState',new Vec4(length,.83+.17*Math.sin(this.state.visualTime*6.3),0,0));
        this.smoke.paint(this.state.burning,length,this.state.visualTime,this.state.burnCount);this.smokeSprite.geometryChanged();const g=this.fire;g.clear();if(!this.state.burning)return;const tip=[STICK_BASE[0],STICK_BASE[1]-length],pulse=.9+.1*Math.sin(this.state.visualTime*6.3);
        const circle=(at:number[],r:number,c:number[])=>{g.fillColor=new Color(c[0]*255,c[1]*255,c[2]*255,c[3]*255);g.circle(at[0],-at[1],r);g.fill();};for(let ring=4;ring>0;ring--)circle(tip,ring*1.5,[1,.25,.035,.055*pulse]);circle(tip,1.8,[1,.27,.045,pulse]);circle([tip[0]-.3,tip[1]-.45],.8,[1,.76,.31,.94]);
        for(const inner of [false,true]){const points=incenseFlame(this.state.ignition,tip,this.state.visualTime,inner);if(points.length)sharedUI().polygon(g,points,inner?[1,.84,.37,Math.min(this.state.ignition*5,.96)]:[1,.34,.055,Math.min(this.state.ignition*4,.72)]);}
    }
    private updateHint(delta:number){const scale=Math.max(Math.abs(this.root.scale.x),.001),at=this.canonical(this.root,[-120,this.state.hintY]);this.hint.setPosition(at[0],-at[1]);this.hint.getComponent(UITransform).setContentSize(240*scale,52*scale);this.hintOpacity.opacity=this.state.hintAlpha*255;this.hint.active=this.state.hintAlpha>.0001;if(this.hint.activeInHierarchy)this.glintAge+=Math.min(Math.max(delta,0),.1);
        this.hintLabel.updateRenderData(true);const width=this.hint.getComponent(UITransform).width,ink=Math.min(width,this.hintInk),left=Math.max(0,(width-ink)/2),right=width-left,height=52*scale,offsets=[[-17,-9],[-27,10],[-9,17],[15,-12],[27,6],[10,18]],sizes=[16,10,7,20,11,8],visible=this.visible();
        for(let i=0;i<6;i++){const phase=this.glintAge*(1.75+i*.13)+i*1.61,pulse=Math.pow((Math.sin(phase)+1)*.5,1.7),size=sizes[i]*(.76+.32*pulse);let point=[(i<3?left:right)+offsets[i][0],height/2+offsets[i][1]+Math.sin(phase*.56)*1.6];const pad=size*.75+3;point=[Math.max(visible[0]+pad-at[0],Math.min(visible[0]+visible[2]-pad-at[0],point[0])),Math.max(visible[1]+pad-at[1],Math.min(visible[1]+visible[3]-pad-at[1],point[1]))];
            for(let halo=0;halo<2;halo++){const glint=this.glints[i*2+halo],s=size*(halo?1:1.4)/128;glint.root.setPosition(point[0],-point[1]);glint.root.setScale(s,s,1);glint.sprite.color=new Color(255,halo?255:224.4,halo?255:158.1,(.24+.74*pulse)*(halo?1:.16)*255);}}
    }
    snapshot(){return {...this.state.snapshot(),smokePoints:this.smoke.points.length,meshCapacity:this.smoke.capacity,entryBusy:this.entry.busy,tip:this.tip?.snapshot(),hintEmbolden:'Original 0.9px FontVariation fill still requires raster parity; common font/fill/outline/shadow retained'};}
}
