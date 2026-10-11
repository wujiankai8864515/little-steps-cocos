import { Color, director, Director, EventKeyboard, input, Input, KeyCode, Label, Node, Sprite, UIOpacity, Vec2 } from 'cc';
import { GameAssets } from './Assets';
import { lifetime, meshSprite, Scope, sharedUI } from './Engine';
import { PromptSparkles } from './PromptSparkles';
import { TravelAtlasSprite } from './TravelAtlasSprite';
import { TravelCollectionSession } from './TravelCollectionSession';
import { TravelJournalPage, JOURNAL_RESOURCES } from './TravelJournalPage';
import { TravelLoadingPanel } from './TravelLoadingPanel';
import { REWARD_REGIONS, TRAVEL_FONT, TRAVEL_GLINT, TRAVEL_REWARDS } from './TravelHomeRules';
import { TravelService } from './TravelService';
import { box, repaintPanel } from './Viewport';
import { label, nodeAt, panel } from './Visual';
const PAPER='res://travel/assets/travel_paper_v1.png',DIARY='res://travel/assets/travel_diary_plate_v5.png',BRUSH='res://travel/assets/travel_brush.ttf';
export const COLLECTION_RESOURCES=[PAPER,DIARY,BRUSH,TRAVEL_FONT,TRAVEL_REWARDS,TRAVEL_GLINT];
const rgb=(hex:string)=>[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255);
const contains=(p:number[],shape:number[][])=>{let inside=false;for(let i=0,j=shape.length-1;i<shape.length;j=i++){const a=shape[i],b=shape[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
const TAG=[[11,9],[51,9],[59,18],[59,124],[52,133],[8,133],[1,126],[1,20]],BOOK=[[6,72],[215,2],[235,218],[67,257],[20,182]];
export class TravelCollectionPage {
    readonly root:Node;readonly session=new TravelCollectionSession();onBack=()=>{};
    private canvas:Node;private content:Node;private detail:Node;private owner:Scope;private detailOwner:Scope;private bindings:any[]=[];private controls:Record<string,Node>={};
    private returnTag:any;private sparkles:PromptSparkles[]=[];private edges:TravelAtlasSprite[]=[];private error='';
    private active=false;private age=0;private refreshAge=0;private dirty=true;private hero:Node;private heroOpacity:UIOpacity;private fade=1;private objects:Array<{view:TravelAtlasSprite;shadow:TravelAtlasSprite;rect:number[];phase:number;index:number}>=[];
    private loading:TravelLoadingPanel;private pending:Scope;private archive:{page:TravelJournalPage;scope:Scope};private archiveWanted='';
    constructor(parent:Node,private assets:GameAssets,private scope:Scope,private height:number,private service:TravelService){
        this.root=nodeAt(parent,'TravelCollectionPage',0,0,720,height);this.root.active=false;panel(this.root,'PaperBackdrop',[0,0,720,height],rgb('d5b77c'));
        this.canvas=nodeAt(this.root,'OriginalCollectionCanvas',0,Math.max(0,(height-1280)/2),720,1280);
        this.texture(this.canvas,PAPER,[0,0,720,1280],scope,false);
        const size=assets.art(PAPER).size;this.edges=[this.texture(this.canvas,PAPER,[0,0,720,1],scope,false,[0,0,size[0],48],'UpperPaperEdge'),this.texture(this.canvas,PAPER,[0,1280,720,1],scope,false,[0,size[1]-48,size[0],48],'LowerPaperEdge')];this.layoutEdges();
        this.loading=new TravelLoadingPanel(this.canvas,assets,scope,height,()=>this.active);this.loading.onCancel=()=>this.cancelArchive();this.loading.onRetry=()=>{const id=this.archiveWanted;this.cancelArchive();this.openArchive(id);};
        scope.own(service.subscribe(()=>this.dirty=true));
        const key=(e:EventKeyboard)=>{if(!this.active||this.archive||this.pending)return;if(e.keyCode===KeyCode.ESCAPE){this.onBack();return;}if(!this.session.items.length)return;let index=this.session.index;if(e.keyCode===KeyCode.ARROW_LEFT)index=(index+this.session.items.length-1)%this.session.items.length;else if(e.keyCode===KeyCode.ARROW_RIGHT)index=(index+1)%this.session.items.length;else if(e.keyCode===KeyCode.HOME)index=0;else if(e.keyCode===KeyCode.END)index=this.session.items.length-1;else return;this.select(index);};input.on(Input.EventType.KEY_DOWN,key);
        scope.own(()=>{this.pause();this.bindings.forEach(b=>b.dispose());input.off(Input.EventType.KEY_DOWN,key);this.root.active=false;this.root.destroy();});this.sync();
    }
    private texture(parent:Node,path:string,rect:number[],scope:Scope,contain=true,region?:number[],name='OriginalPixels'){
        const r=region||[0,0,...this.assets.art(path).size],s=contain?Math.min(rect[2]/r[2],rect[3]/r[3]):1,w=contain?r[2]*s:rect[2],h=contain?r[3]*s:rect[3],v=new TravelAtlasSprite(parent,this.assets,scope,path,r,name);v.place([rect[0]+(rect[2]-w)/2,rect[1]+(rect[3]-h)/2,w,h]);return v;
    }
    private polygon(parent:Node,points:number[][],source:number[][],scope:Scope,alpha=1){const n=nodeAt(parent,'ApprovedPaperCut'),s:any=n.addComponent(meshSprite()),spec=this.assets.art(DIARY),indices=[];for(let i=1;i<points.length-1;i++)indices.push(0,i,i+1);s.configure({vertices:new Float32Array(([] as number[]).concat(...points)),source:new Float32Array(([] as number[]).concat(...source)),indices:new Uint16Array(indices)},spec.size,spec.content);s.spriteFrame=this.assets.frame(DIARY,scope);s.sizeMode=Sprite.SizeMode.CUSTOM;s.color=new Color(255,255,255,255*alpha);return n;}
    private text(parent:Node,name:string,value:string,r:number[],size:number,ink='68472e',brush=true){const f=brush?BRUSH:TRAVEL_FONT,l=label(parent,this.assets,name,value,r.slice(0,2),r.slice(2),size,rgb(ink),f);l.enableWrapText=true;l.lineHeight=size*this.assets.catalog.assets[f].fontMetrics.height;return l;}
    private action(name:string,r:number[],callback:()=>void,enabled=true,hit?:(p:number[])=>boolean){const n=nodeAt(this.content,name,r[0],r[1],r[2],r[3]);this.controls[name]=n;this.bindings.push(sharedUI().action(n,callback,()=>this.active&&this.scope.active&&!this.archive&&!this.pending&&enabled,hit));return n;}
    private sync(){const changed=this.session.sync(this.service.model.data.inventory,this.service.model.data.journals.filter((j:any)=>j.archived).length);this.dirty=false;if(changed||!this.content||this.error!==this.service.last_error){this.error=this.service.last_error;this.build();}}
    private build(){
        this.bindings.forEach(b=>b.dispose());this.bindings=[];this.detailOwner?.dispose();this.owner?.dispose();this.owner=lifetime(this.scope);this.controls={};this.objects=[];this.sparkles=[];this.content=nodeAt(this.canvas,'CollectionContents');const content=this.content;this.owner.own(()=>content.destroy());
        this.text(content,'Title','百宝箱里的旅途',[175,122,377,66],38,'492412');
        this.returnTag=sharedUI().hangingReturn(content,this.assets.font(TRAVEL_FONT),[26,24,78,128],()=>this.onBack(),()=>this.active&&this.scope.active&&!this.archive&&!this.pending);this.bindings.push(this.returnTag);this.controls.back=this.returnTag.root.getChildByName('FixedReturnHitArea');
        this.detail=nodeAt(content,'StableDetailHost');this.updateDetail();
        const visible=this.session.visible,count=visible.length;
        visible.forEach(({item,index},slot)=>{const width=count<4?211:165,left=count===1?247:count===2?128+slot*263:58+slot*(count<4?201:158),top=816+[24,-5,13,0][slot],region=REWARD_REGIONS[Math.max(0,Math.min(3,Math.trunc(item.art||0)))],fit=Math.min(width/region[2],174/region[3]),w=region[2]*fit,h=region[3]*fit,r=[left+(width-w)/2,top+182-h,w,h];
            const shadow=this.texture(content,TRAVEL_REWARDS,[r[0]+1,r[1]+4,w,h],this.owner,false,region,'ObjectShadow'),view=this.texture(content,TRAVEL_REWARDS,r,this.owner,false,region,'CollectionObject_'+index);shadow.sprite.color=new Color(56,23,5,61);this.objects.push({view,shadow,rect:r,phase:slot*1.7,index});
            this.action('item_'+index,[left,top,width,182],()=>this.select(index),true,p=>{const x=p[0]-(r[0]-left),y=p[1]-(r[1]-top);return x>=0&&y>=0&&x<w&&y<h&&this.assets.alpha(TRAVEL_REWARDS,region[0]+x/w*region[2],region[1]+y/h*region[3])>=41/255;});
        });
        const plaque=this.text(content,'Count',(count?'收好了 '+this.session.items.length+' 件':'还没有收藏')+'\n'+(this.session.items.length<2?'等下一段旅途':'点点小物，翻翻故事'),[117,1040,260,96],23,'fff0cb');plaque.node.angle=-.105*180/Math.PI;plaque.enableOutline=true;plaque.outlineColor=new Color(68,35,17,255);plaque.outlineWidth=5;this.lightShadow(plaque);if(this.session.items.length>=2)this.addSparkles(plaque.node,plaque);
        if(this.session.pageCount>1){for(const d of [-1,1]){const x=d<0?45:385,shape=TAG.map(p=>[d>0?60-p[0]:p[0],p[1]]),enabled=d<0?this.session.page>0:this.session.page<this.session.pageCount-1;this.polygon(content,shape.map(p=>[x+p[0],1096+p[1]]),TAG.map(p=>[48+p[0]/60*112,68+p[1]/134*214]),this.owner,enabled?1:.42);const button=this.action(d<0?'previous_page':'next_page',[x,1096,60,134],()=>{if(this.session.movePage(d))this.build();},enabled,p=>contains(p,shape));if(enabled)this.addSparkles(button);const l=this.text(content,'PageCaption',d<0?'上\n一\n页':'下\n一\n页',[x+12,1138,36,79],21,'663c21');if(!enabled)l.color=new Color(102,60,33,115);}this.text(content,'PageCount',`${this.session.page+1} / ${this.session.pageCount}`,[151,1158,190,40],23,'f5dfb7');}
        const archive=this.action('archive',[474,990,238,270],()=>this.openArchive(),this.session.archives>0,p=>contains(p,BOOK));if(this.session.archives)this.addSparkles(archive);
        const titlePivot=nodeAt(content,'ArchiveTagPivot',520.5,1131);titlePivot.angle=.29*180/Math.PI;this.text(titlePivot,'ArchiveTag','旅\n行\n日\n记',[-26.5,-59,53,118],24,'593315');
        const caption=this.text(content,'ArchiveCount',this.session.archives?this.session.archives+' 本已收好':'暂无收好的日记',[487,1204,211,38],19,'fff0cb',false);caption.enableOutline=true;caption.outlineColor=new Color(68,35,17,255);caption.outlineWidth=5;this.lightShadow(caption);
        if(this.service.last_error){const failure=this.text(content,'SaveFailure','保存暂时不可用，这一步还没有完成。',[74,1135,572,58],23,'fff4da');failure.enableOutline=true;failure.outlineColor=new Color(112,63,34,255);failure.outlineWidth=4;}
        this.loading.root.setSiblingIndex(this.canvas.children.length-1);this.animate(0);
    }
    private lightShadow(text:Label){text.enableShadow=true;text.shadowColor=new Color(33.15,12.75,2.55,216.75);text.shadowOffset=new Vec2(0,-2);}
    private addSparkles(target:Node,text?:Label){this.sparkles.push(new PromptSparkles(target,this.assets,this.owner,this.canvas,()=>[0,-Math.max(0,(this.height-1280)/2),720,this.height],text));}
    private layoutEdges(){const extra=Math.max(0,(this.height-1280)/2);this.edges.forEach((v,i)=>{v.root.active=extra>0;v.place([0,i?1280:-extra,720,Math.max(1,extra)]);});}
    private updateDetail(){
        this.detailOwner?.dispose();this.detailOwner=lifetime(this.owner);const content=nodeAt(this.detail,'CurrentStory'),scope=this.detailOwner;scope.own(()=>content.destroy());this.hero=null;
        const shape=[[0,.05],[.03,0],[.95,.01],[1,.04],[.99,.90],[.98,.96],[.94,1],[.04,.98],[0,.94]],source=[[146,448],[168,430],[740,366],[771,377],[936,1260],[932,1305],[902,1327],[213,1366],[192,1348]];this.polygon(content,shape.map(p=>[100+p[0]*520,244+p[1]*538]),source,scope);
        const item=this.session.item;if(!item){this.text(content,'EmptyTitle','箱里还空着',[128,420,464,72],34,'593c27');this.text(content,'EmptyStory','这趟旅行带回的小东西，\n会在这里留下自己的故事。',[138,514,444,105],25);return;}
        this.hero=nodeAt(content,'HeroPivot',269,390);this.heroOpacity=this.hero.addComponent(UIOpacity);this.texture(this.hero,TRAVEL_REWARDS,[-137,-112,274,224],scope,true,REWARD_REGIONS[Math.max(0,Math.min(3,Math.trunc(item.art||0)))]);
        this.text(content,'DetailItemName',item.name||'旅途小物',[408,323,181,62],31,'593c27');this.text(content,'Place',item.place||'旅途中',[410,394,178,43],23,'876749');const story=this.text(content,'Story',item.description||'这件小物，记着旅途里的一天。',[136,531,448,130],25);story.lineHeight+=6;
        this.texture(content,TRAVEL_REWARDS,[276,699,39,34],scope,true,REWARD_REGIONS[0]);this.text(content,'Category',item.category||'旅途收藏',[321,699,130,36],22,'86633e');
    }
    private select(index:number){if(!this.session.select(index))return;this.updateDetail();this.fade=0;this.animate(0);}
    private animate(delta:number){this.returnTag?.advance(delta);this.sparkles.forEach(s=>s.advance(delta));this.age+=delta;this.fade=Math.min(1,this.fade+delta/.22);if(this.hero){this.hero.setPosition(269,-390-Math.sin(this.age*1.15)*2);this.hero.angle=-Math.sin(this.age*.83)*.008*180/Math.PI;this.heroOpacity.opacity=255*(.35+.65*this.fade);}for(const v of this.objects){const r=v.rect,dy=Math.sin(this.age*1.3+v.phase)*.6;v.view.place([r[0],r[1]+dy,r[2],r[3]]);v.shadow.place([r[0]+1,r[1]+4+dy,r[2],r[3]]);}}
    private async openArchive(tripId=''){
        if(!this.active||this.pending||this.archive)return;const journals=this.service.model.data.journals.filter((j:any)=>j.archived),id=tripId||journals[journals.length-1]?.trip_id;if(!id)return;
        const owner=lifetime(this.scope);this.pending=owner;this.archiveWanted=id;this.bindings.forEach(b=>b.cancel());this.loading.show('日记加载中...');
        try{await this.assets.acquireResources(JOURNAL_RESOURCES,owner);if(this.pending!==owner||!owner.active||!this.active)return;const page=new TravelJournalPage(this.root,this.assets,owner,this.height,this.service,true,id);page.onBack=()=>{if(this.archive?.page===page){this.archive=null;owner.dispose();this.canvas.active=true;this.sync();}};
            this.archive={page,scope:owner};page.resume();await owner.guard(new Promise<void>(resolve=>director.once(Director.EVENT_AFTER_DRAW,resolve)));if(this.pending!==owner||!this.active)return;this.pending=null;this.canvas.active=false;this.loading.hide();
        }catch(error){owner.dispose();if(this.archive?.scope===owner)this.archive=null;if(this.pending!==owner||!this.scope.active)return;this.canvas.active=true;this.loading.failure('日记加载失败，再试一次？');console.error('[LittleSteps] collection archive preparation failed',error);}
    }
    private cancelArchive(){const owner=this.pending;this.pending=null;if(owner){if(this.archive?.scope===owner)this.archive=null;owner.dispose();}this.loading.hide();this.canvas.active=!this.archive;}
    resize(height:number,_physicalWidth?:number){this.height=height;this.bindings.forEach(b=>b.cancel());box(this.root,0,0,720,height);repaintPanel(this.root.getChildByName('PaperBackdrop'),720,height);this.canvas.setPosition(0,-Math.max(0,(height-1280)/2));this.layoutEdges();this.loading.resize(height);this.archive?.page.resize(height);}
    advance(delta:number){if(!this.active)return;this.loading.advance(delta);if(this.archive){this.archive.page.advance(delta);return;}this.refreshAge+=delta;if(this.dirty||this.refreshAge>=.25){this.refreshAge=0;this.sync();}this.animate(Math.max(0,Number.isFinite(delta)?delta:0));}
    resume(allowInput=true){this.active=allowInput;this.root.active=true;this.archive?.page.resume(allowInput);if(this.dirty)this.sync();}
    pause(){this.active=false;this.bindings.forEach(b=>b.cancel());this.cancelArchive();this.archive?.page.pause();}
    snapshot(){return {active:this.active,selectedIndex:this.session.index,selectedUid:this.session.item?.uid||'',page:this.session.page,pageCount:this.session.pageCount,itemCount:this.session.items.length,archives:this.session.archives,controls:Object.keys(this.controls),archive:this.archive?.page.snapshot()||null,loading:!!this.pending};}
}
