import { Color, EventKeyboard, Graphics, input, Input, KeyCode, Label, LabelOutline, Mask, Node, Sprite, UITransform } from 'cc';
import { box, repaintPanel } from './Viewport';
import { GameAssets } from './Assets';
import { core, lifetime, meshSprite, Scope, sharedUI } from './Engine';
import { Stroke2D } from './Stroke2D';
import { TravelAtlasSprite } from './TravelAtlasSprite';
import { TRAVEL_FONT, TRAVEL_GLINT } from './TravelHomeRules';
import { TravelJournalSession } from './TravelJournalSession';
import { TravelService } from './TravelService';
import { label, nodeAt, panel } from './Visual';

const ART='res://travel/assets/',PAPER=ART+'travel_diary_plate_v5.png',REFERENCE=ART+'travel_diary_reference_v5.png';
// Native page_resource_sets.gd journal subset, never the whole travel_visual bundle.
export const JOURNAL_RESOURCES=['travel_brush.ttf','travel_paper_v1.png','travel_diary_plate_v5.png','travel_diary_reference_v5.png','travel_scenery_v1.png','travel_people_v5.png','travel_map_actor_v5.png'].map(n=>ART+n);
const INK=[96/255,56/255,20/255];
const NPC_REGIONS:Record<string,number[]>={vampire:[70,0,552,663],rain:[668,0,485,680],postcard:[25,660,604,651],osmanthus:[637,668,548,646]};

// The approved reference supplies the brush lettering, seal, divider, pen and
// leaf. Only source-defined polygons and live event prose cover it.
export class TravelJournalPage {
    readonly root:Node;
    readonly session:TravelJournalSession;
    onBack=()=>{};
    private canvas:Node;
    private contentScope:Scope;
    private bindings:any[]=[];
    private active=false;
    private revision=-1;
    private error='';
    private dirty=true;
    private cue:(delta:number)=>void=()=>{};
    private controls:Record<string,Node>={};
    constructor(parent:Node,private assets:GameAssets,private scope:Scope,height:number,private service:TravelService,archive=false,tripId=''){
        this.session=new TravelJournalSession(service,archive,tripId);
        this.root=nodeAt(parent,'TravelJournalPage',0,0,720,height);this.root.active=false;
        panel(this.root,'PaperBackdrop',[0,0,720,height],[236/255,217/255,179/255]);
        this.canvas=nodeAt(this.root,'ApprovedDiaryCanvas',0,Math.max(0,(height-1280)/2),720,1280);
        this.texture(this.canvas,REFERENCE,[0,0,720,1280],scope,false);
        scope.own(service.subscribe(()=>{this.dirty=true;}));
        const key=(e:EventKeyboard)=>{if(this.active&&e.keyCode===KeyCode.ESCAPE)this.onBack();};input.on(Input.EventType.KEY_DOWN,key);
        scope.own(()=>{this.pause();this.bindings.forEach(b=>b.dispose());this.bindings=[];input.off(Input.EventType.KEY_DOWN,key);this.root.active=false;this.root.destroy();});
        this.refresh();
    }
    resize(height:number,_physicalWidth?:number){this.bindings.forEach(b=>b.cancel());box(this.root,0,0,720,height);repaintPanel(this.root.getChildByName('PaperBackdrop'),720,height);this.canvas.setPosition(0,-Math.max(0,(height-1280)/2));}
    private texture(parent:Node,path:string,rect:number[],scope:Scope,contain=true,region?:number[],angle=0){
        const spec=this.assets.art(path),r=region||[0,0,...spec.size],pivot=nodeAt(parent,'OriginalImage',rect[0],rect[1],rect[2],rect[3]);pivot.angle=-angle*180/Math.PI;
        const sprite=new TravelAtlasSprite(pivot,this.assets,scope,path,r,'OriginalPixels');
        if(contain){const scale=Math.min(rect[2]/r[2],rect[3]/r[3]),w=r[2]*scale,h=r[3]*scale;sprite.place([(rect[2]-w)/2,(rect[3]-h)/2,w,h]);}else sprite.place([0,0,rect[2],rect[3]]);
        return {pivot,sprite};
    }
    private patch(parent:Node,points:number[][],scope:Scope,path=PAPER,alpha=1){
        const spec=this.assets.art(path),n=nodeAt(parent,'OriginalPaperPatch'),s:any=n.addComponent(meshSprite());
        const source=new Float32Array(([] as number[]).concat(...points)),vertices=source.map((v,i)=>v*(i%2?1280/1672:720/941));
        s.configure({source,vertices,indices:new Uint16Array([0,1,2,0,2,3])},spec.size,spec.content);s.spriteFrame=this.assets.frame(path,scope);s.sizeMode=Sprite.SizeMode.CUSTOM;s.color=new Color(255,255,255,alpha*255);
    }
    private text(parent:Node,name:string,value:string,rect:number[],size:number,center=true,angle=0){
        const l=label(parent,this.assets,name,value,rect.slice(0,2),rect.slice(2),size,INK,TRAVEL_FONT),m=this.assets.catalog.assets[TRAVEL_FONT].fontMetrics;
        l.verticalAlign=Label.VerticalAlign.TOP;l.horizontalAlign=center?Label.HorizontalAlign.CENTER:Label.HorizontalAlign.LEFT;l.lineHeight=size*m.height;l.node.angle=-angle*180/Math.PI;
        return l;
    }
    private button(parent:Node,name:string,value:string,rect:number[],fn:()=>void,enabled=true,painted=false,angle=0){
        const n=nodeAt(parent,name,rect[0],rect[1],rect[2],rect[3]);n.angle=-angle*180/Math.PI;
        if(!painted){const l=this.text(n,'Caption',value,[0,0,rect[2],rect[3]],23);if(!enabled)l.color=new Color(167,139,101,255);}
        // Keep the original painted caption as the only visible ink.
        this.controls[name]=n;this.bindings.push(sharedUI().action(n,fn,()=>this.active&&this.scope.active&&enabled));return n;
    }
    private refresh(){
        this.bindings.forEach(b=>b.dispose());this.bindings=[];this.contentScope?.dispose();this.contentScope=lifetime(this.scope);const owner=this.contentScope;
        this.session.sync();this.controls={};this.cue=()=>{};
        const content=nodeAt(this.canvas,'CurrentEntry');owner.own(()=>{content.active=false;content.destroy();});
        this.button(content,'back','返回',[27,44,93,174],()=>this.onBack(),true,true);
        const j=this.session.journal,e=this.session.entry;
        if(!j||!e)this.text(content,'EmptyDiary','日记已经收好了。',[160,740,475,90],27);
        else{
            const uid=e.uid,readonly=this.session.readonly;
            this.patch(content,[[209,900],[838,838],[860,1038],[226,1103]],owner);
            if(e.id!=='offer'){
                this.patch(content,[[182,552],[764,494],[820,821],[206,885]],owner);
                const clipped=nodeAt(content,'SceneryClip',145,419,472,258);clipped.angle=.09*180/Math.PI;clipped.addComponent(Mask);
                const index=Math.trunc(e.place.art),region=[(index%3)*512,Math.floor(index/3)*512,512,512];
                this.texture(clipped,ART+'travel_scenery_v1.png',[0,-107,472,472],owner,false,region);
                this.texture(content,ART+'travel_map_actor_v5.png',[162,532,220,151],owner);
                this.texture(content,ART+'travel_people_v5.png',[403,434,180,208],owner,true,NPC_REGIONS[e.id]||NPC_REGIONS.vampire,-.06);
            }
            if(readonly){this.patch(content,[[329,1080],[733,1039],[751,1269],[326,1310]],owner);this.patch(content,[[293,1289],[670,1258],[680,1327],[296,1370]],owner);}
            const prose=this.text(content,'DiaryProse',e.diary_text+'\n'+e.emotion,[172,690,465,145],22,true,-.065),ui=prose.node.getComponent(UITransform);
            prose.overflow=Label.Overflow.RESIZE_HEIGHT;
            for(let size=22;size>=19;size--){prose.fontSize=size;prose.lineHeight=size*this.assets.catalog.assets[TRAVEL_FONT].fontMetrics.height;ui.setContentSize(465,145);prose.updateRenderData(true);if(ui.height<=145||size===19)break;}
            prose.overflow=Label.Overflow.CLAMP;ui.setContentSize(465,145);
            if(readonly){
                const preferred=e.options.find((o:any)=>o.id===e.review_choice);
                this.text(content,'ReviewResult',preferred?'你的批阅：'+preferred.text:'这页已经收好，翻看不会再次学习。',[222,864,398,82],24);
                this.text(content,'Reviewed','小余代选 · 已批阅',[226,1000,300,42],22,true,-.075);
            }else{
                this.session.options.forEach((option:any,i:number)=>{
                    this.button(content,'review_'+i,option.id===e.choice?'我也会这样选':'下次选另一种',[266,839+i*52,336,49],()=>{if(this.session.select(uid,option.id))this.refresh();},true,true,-.075);
                    if(this.session.choice===option.id){const at=(i===0?[385.5,1117]:[389.5,1182.5]).map((v,k)=>v*(k?1280/1672:720/941)),g=nodeAt(content,'ChosenOption',at[0],at[1]).addComponent(Graphics);g.fillColor=new Color(96,56,20,255);g.moveTo(8.5,0);for(let k=1;k<32;k++)g.lineTo(Math.cos(k*Math.PI/16)*8.5,-Math.sin(k*Math.PI/16)*8.5);g.close();g.fill();}
                });
                const enabled=!!this.session.choice&&!this.session.busy;
                this.button(content,'review_submit','记下我的批阅',[330,939,251,53],()=>{const result=this.session.submit(uid);if(result==='archived')this.onBack();else this.refresh();},enabled,true,-.08);
                if(!enabled){const region=[[433,1226],[725,1195],[734,1246],[436,1285]];this.patch(content,region,owner);this.patch(content,region,owner,REFERENCE,.42);}
                this.reviewCue(content,owner,!enabled);
            }
            this.button(content,'journal_close','先合上 ›',[603,964,101,44],()=>this.onBack(),true,true);
            if(j.entries.length>1){
                this.button(content,'journal_previous','‹',[479,988,32,38],()=>{if(this.session.move(-1))this.refresh();},this.session.index>0);
                this.button(content,'journal_next','›',[565,984,32,38],()=>{if(this.session.move(1))this.refresh();},this.session.index<j.entries.length-1);
                this.text(content,'EntryNumber',`${this.session.index+1} / ${j.entries.length}`,[513,991,52,28],18);
            }
        }
        if(this.service.last_error){const failure=this.text(content,'SaveFailure','保存暂时不可用，这一步还没有完成。',[74,1135,572,58],23);failure.color=new Color(255,244,218,255);const outline=failure.node.addComponent(LabelOutline);outline.color=new Color(112,63,34,255);outline.width=4;}
        this.revision=this.service.model.data.revision;this.error=this.service.last_error;this.dirty=false;this.cue(0);
    }
    private reviewCue(parent:Node,scope:Scope,selection:boolean){
        const glints=Array.from({length:selection?2:3},(_,i)=>this.texture(parent,TRAVEL_GLINT,[0,0,1,1],scope,false).sprite);
        const glint=(index:number,at:number[],size:number,alpha:number)=>{const g=glints[index];g.place([at[0]-size/2,at[1]-size/2,size,size]);g.sprite.color=new Color(255,222,153,Math.max(0,Math.min(1,alpha))*255);};
        let phase=0;
        if(selection){this.cue=delta=>{phase+=delta;const breath=.5+.5*Math.sin(phase*2.2);glint(0,[276,857],10+2*breath,.32+.18*breath);glint(1,[279,907],8+2*(1-breath),.20+.13*(1-breath));};return;}
        const under=[[337,970],[390,966],[443,962],[490,959],[529,955]],pen=[[534,949],[542,938],[553,920]],strokes=Array.from({length:6},(_,i)=>new Stroke2D(parent,this.assets,scope,'ReviewInk'+i));
        glints.forEach(g=>g.root.parent.setSiblingIndex(parent.children.length-1));
        this.cue=delta=>{phase+=delta;const b=Math.pow(.5+.5*Math.cos(phase*Math.PI*2/2.8),1.4);
            const widths=[12,7+1.5*b,3.6+.8*b,1.7,7,2],colors=[[1,.66,.15,.12+.14*b],[1,.67,.16,.24+.22*b],[.8,.43,.08,.60+.28*b],[1,.94,.64,.60+.32*b],[1,.72,.22,.28+.24*b],[1,.94,.65,.70+.26*b]];
            strokes.forEach((s,i)=>s.draw(core.featherPolyline(i<4?under:pen,widths[i]),colors[i]));
            glint(0,[533,951],29+14*b,.72+.28*b);glint(1,[337,970],20+10*b,.50+.42*b);const sweep=phase/2.8%1;glint(2,[350+168*sweep,969-13*sweep],16+5*b,.60*Math.sin(sweep*Math.PI));
        };
    }
    advance(delta:number){if(!this.active)return;if(this.dirty||this.revision!==this.service.model.data.revision||this.error!==this.service.last_error)this.refresh();this.cue(Number.isFinite(delta)?Math.max(0,delta):0);}
    resume(allowInput=true){this.active=allowInput;this.root.active=true;if(this.dirty)this.refresh();}
    pause(){this.active=false;this.bindings.forEach(b=>b.cancel());}
    snapshot(){return {active:this.active,tripId:this.session.tripId,index:this.session.index,uid:this.session.entry?.uid||'',choice:this.session.choice,readonly:this.session.readonly,error:this.service.last_error,controls:Object.keys(this.controls)};}
}
