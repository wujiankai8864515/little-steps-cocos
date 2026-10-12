import { EventKeyboard, Graphics, input, Input, KeyCode, Mask, Node, Sprite, UITransform, Vec4 } from 'cc';
import { GameAssets } from './Assets';
import { lifetime, Scope, sharedUI } from './Engine';
import { WardrobeStore } from './WardrobeStore';
import { applyOutfit } from './OutfitBinding';
import { HomeClock } from './HomeClock';
import { lightingSnapshot } from './LightingSnapshot';
import { PhotoCollection } from './PhotoCollection';
import { anchor, grid, mix, PhotoPointer, PhotoVineGeometry, photoLight, PHOTO_SELECTORS, rotate, VINE_SITES } from './PhotoGeometry';
import { PHOTO_ATLAS, PHOTO_LAYOUT, PHOTO_PLATE, PHOTO_REWARDS, PhotoLighting } from './PhotoLighting';
import { drawLine, drawPolygon, inkRGB, PhotoActor, PhotoInk, PhotoPaperView, photoMesh } from './PhotoVisuals';
import { PromptSparkles } from './PromptSparkles';
import { TravelAtlasSprite } from './TravelAtlasSprite';
import { TRAVEL_FONT, TRAVEL_GLINT } from './TravelHomeRules';
import { box, pageLayout, pinTop, repaintPanel, safeViewport } from './Viewport';
import { nodeAt, panel } from './Visual';
import { PageBackground } from './PageBackground';
export const PHOTO_RESOURCES=[PHOTO_ATLAS,PHOTO_LAYOUT,PHOTO_PLATE,PHOTO_REWARDS,TRAVEL_FONT,TRAVEL_GLINT];
export interface PhotoRetained {batch:number;elapsed:number;vines:PhotoVineGeometry[];actor?:{clock:number;blinkElapsed:number;blinkIndex:number};}
export class PhotoPage {
    readonly root:Node;readonly canvas:Node;onBack=()=>{};
    private background:PageBackground;private volume:any;private header:Node;
    private active=false;private elapsed=0;private batch=0;private clip:Node;private paperLayer:Node;private decor:Node;private front:Node;private actor:PhotoActor;
    private lighting:PhotoLighting;private furniture:Graphics;private paperScope:Scope;private papers:PhotoPaperView[]=[];private clips:Array<{view:TravelAtlasSprite;shadow:TravelAtlasSprite;material:any}>=[];private stack:any;
    private vines:Array<{geometry:PhotoVineGeometry;view:any;visible:boolean}>=[];private inks:PhotoInk[]=[];private counter:PhotoInk;private batchInk:PhotoInk;private batchArt:TravelAtlasSprite;private selectors:Node[]=[];private returnTag:any;private sparkles:PromptSparkles[]=[];
    private binding:any;private pointer=new PhotoPointer();private pointerPosition:number[]=null;private bubble:any;private bubbleOwner:number|null=null;private refreshNeeded=false;private dirtyWarnings:string[]=[];
    constructor(parent:Node,private assets:GameAssets,private scope:Scope,private height:number,readonly collection:PhotoCollection,private clock:HomeClock,retained?:PhotoRetained,skins?:WardrobeStore){
        this.elapsed=retained?.elapsed||0;this.batch=retained?.batch||0;this.root=nodeAt(parent,'PhotoPage',0,0,720,height);this.root.active=false;panel(this.root,'PhotoLetterbox',[0,0,720,height],inkRGB('443422'));
        this.clip=nodeAt(this.root,'PhotoContentViewport',0,0,720,height);this.clip.addComponent(Mask);this.canvas=nodeAt(this.clip,'OriginalPhotoCanvas',0,0,720,1280);this.lighting=new PhotoLighting(this.canvas,assets);
        this.background=new PageBackground(this.canvas,assets,scope,PHOTO_PLATE,'NeutralPhotoPlate');for(const sprite of this.background.sprites)this.lighting.bind(sprite,'receiver',scope);
        const layout=assets.json(PHOTO_LAYOUT);
        VINE_SITES.forEach((site,i)=>{const geometry=retained?.vines?.[i]||new PhotoVineGeometry(i,layout['vine_'+i%3]);geometry.advance(0,this.elapsed);const view=photoMesh(this.canvas,assets,scope,geometry.mesh,'JointedPhotoVine_'+i);view.root.setPosition(site[0],-site[1]);view.root.angle=-site[4]*180/Math.PI;this.lighting.bind(view.sprite,'receiver',scope);const corners=[[-site[2]/2,-8],[site[2]/2,-8],[site[2]/2,site[3]+8],[-site[2]/2,site[3]+8]].map(p=>rotate(p,site[4]).map((v,j)=>v+site[j])),xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]),visible=Math.max(...xs)+48>0&&Math.min(...xs)-48<720&&Math.max(...ys)+48>0&&Math.min(...ys)-48<1280;view.root.active=visible;this.vines.push({geometry,view,visible});});
        this.furniture=nodeAt(this.canvas,'RopesAndPaperStack').addComponent(Graphics);this.lighting.bind(this.furniture,'line',scope);
        this.paperLayer=nodeAt(this.canvas,'WallPhotographs');this.decor=nodeAt(this.canvas,'PhotoControls');this.header=nodeAt(this.root,'PhotoHeader',0,0,720,175);
        this.artLabel('title','照片墙',[231,60,258,79],44);
        this.counter=this.artLabel('counter','',[541,80,159,49],25,true);
        const instruction=this.artLabel('hint','拖动夹子，选给小屋',[161,1044,402,66],26);this.addSparkles(instruction.root);
        this.batchArt=this.piece(this.decor,'batch',[488,969,213,103],scope);this.batchInk=this.ink(this.decor,'batch','',[488,969,213,103],24);const tag=this.batchInk.root,ui=tag.getComponent(UITransform),pivot=nodeAt(this.decor,'BatchInkPivot',tag.position.x+ui.width/2,-tag.position.y+ui.height/2);tag.setParent(pivot);tag.setPosition(-ui.width/2,ui.height/2);pivot.angle=.065*180/Math.PI;this.addSparkles(tag);
        for(let i=0;i<2;i++){const root=nodeAt(this.decor,'HomePhotoSelector_'+(i+1),...PHOTO_SELECTORS[i] as [number,number]);this.selectors.push(root);this.piece(root,'clip',[-72,-40,144,80],scope);this.piece(root,'tag',[-45,20,150,101],scope);this.ink(root,'tag',i?'小屋②':'小屋①',[-45,20,150,101],25);}
        this.returnTag=sharedUI().hangingReturn(this.header,assets.font(TRAVEL_FONT),[25,25,77,139],()=>this.onBack(),()=>this.active&&this.scope.active&&this.pointer.owner===null);
        const volume=this.volume=photoMesh(this.canvas,assets,scope,{vertices:new Float32Array([0,0,720,0,720,1280,0,1280]),source:new Float32Array([0,0,1,0,1,1,0,1]),indices:new Uint16Array([0,1,2,0,2,3])},'SharedPhotoSoftVolume',PHOTO_ATLAS,true);this.lighting.bind(volume.sprite,'volume',scope);
        this.actor=new PhotoActor(this.canvas,assets,scope,this.lighting);if(skins){applyOutfit(this.actor.rig,assets,skins.worn);scope.own(skins.subscribe(()=>applyOutfit(this.actor.rig,assets,skins.worn)));}if(retained?.actor)this.actor.restore(retained.actor);this.front=nodeAt(this.canvas,'HeldSelectorAndSpeech');
        this.binding=sharedUI().pointer(this.canvas,{down:(at:number[],id:number)=>{if(this.bubble){const r=this.bubble.snapshot().card;if(at[0]>=r[0]&&at[1]>=r[1]&&at[0]<r[0]+r[2]&&at[1]<r[1]+r[3]){this.bubbleOwner=id;return true;}}const accepted=this.pointer.down(id,at,collection.count>6);if(accepted&&this.pointer.held>=0){this.pointerPosition=null;this.selectors[this.pointer.held].setParent(this.front);}return accepted;},move:(at:number[],id:number)=>{if(id===this.pointer.owner&&this.pointer.held>=0){this.pointerPosition=[at[0],at[1]-22];this.selectors[this.pointer.held].setPosition(at[0],-at[1]+22);}},up:(at:number[],id:number)=>{if(this.bubbleOwner===id){this.bubble?.close();this.bubbleOwner=null;return;}const result=this.pointer.up(id,at,this.papers.map(p=>p.geometry));this.restoreSelectors();if(result?.photo)collection.bind(result.slot,result.photo);else if(result?.batch)this.nextBatch();},cancel:()=>this.cancelPointer()},()=>this.active&&scope.active);
        const key=(event:EventKeyboard)=>{if(!this.active||event.keyCode!==KeyCode.ESCAPE)return;if(this.pointer.held>=0)this.cancelPointer();else this.onBack();};input.on(Input.EventType.KEY_DOWN,key);
        scope.own(collection.subscribe(()=>this.refreshNeeded=true));scope.own(collection.onFailure(reason=>this.dirtyWarnings.push(reason)));
        scope.own(()=>{this.pause();this.binding.dispose();this.returnTag.dispose();input.off(Input.EventType.KEY_DOWN,key);this.root.destroy();});this.refresh();this.resize(height);this.render(0);
    }
    private piece(parent:Node,key:string,r:number[],scope:Scope){const region=this.assets.json(PHOTO_LAYOUT)[key],view=new TravelAtlasSprite(parent,this.assets,scope,PHOTO_ATLAS,region,'Painted_'+key);view.place(r);this.lighting.bind(view.sprite,'receiver',scope);return view;}
    private ink(parent:Node,key:string,value:string,r:number[],points:number,counter=false){const layout=this.assets.json(PHOTO_LAYOUT),region=layout[key],safe=layout.ui_text_rects[key],sx=r[2]/region[2],sy=r[3]/region[3],text=new PhotoInk(parent,this.assets,this.scope,[r[0]+safe[0]*sx,r[1]+safe[1]*sy,safe[2]*sx,safe[3]*sy],points,counter);text.setText(value);this.inks.push(text);return text;}
    private artLabel(key:string,value:string,r:number[],points:number,counter=false){const parent=key==='title'||key==='counter'?this.header:this.decor;this.piece(parent,key,r,this.scope);return this.ink(parent,key,value,r,points,counter);}
    private addSparkles(node:Node){this.sparkles.push(new PromptSparkles(node,this.assets,this.scope,this.canvas,()=>[0,0,720,1280]));}
    private refresh(){
        this.refreshNeeded=false;this.paperScope?.dispose();const scope=lifetime(this.scope),content=nodeAt(this.paperLayer,'CurrentPhotoBatch');this.paperScope=scope;scope.own(()=>content.destroy());this.papers=[];this.clips=[];this.stack=null;
        this.batch=((this.batch%this.collection.batchCount)+this.collection.batchCount)%this.collection.batchCount;const entries=this.collection.batch(this.batch),hasBatch=this.collection.count>6;
        if(hasBatch){const mesh=grid(1,1),points=[[432,952],[610,939],[654,990],[471,1009]];mesh.vertices.set(([] as number[]).concat(...points.map(p=>[p[0],p[1]-this.collection.stackLayers(this.batch)*1.5])));mesh.source.set([0,0,1,0,1,1,0,1]);mesh.indices.set([0,1,2,0,2,3]);this.stack=photoMesh(content,this.assets,scope,mesh,'NextBatchTopPhoto',PHOTO_ATLAS,true);this.lighting.paper(this.stack.sprite,this.collection.batch(this.batch+1)[0],scope);}
        for(let i=0;i<6;i++){
            if(i<entries.length)this.papers.push(new PhotoPaperView(content,this.assets,scope,this.lighting,entries[i],i));
            const view=this.piece(content,'clip',[0,0,288,216],scope),shadow=new TravelAtlasSprite(view.root,this.assets,scope,PHOTO_ATLAS,this.assets.json(PHOTO_LAYOUT).clip,'ClipContactShadow');shadow.place([-144,-108,288,216]);shadow.root.setSiblingIndex(0);const material=this.lighting.bind(shadow.sprite,'shadow',scope);view.root.setScale(.19,.19,1);if(i>=entries.length){view.sprite.color.a=171;shadow.sprite.color.a=171;}this.clips.push({view,shadow,material});
        }
        this.counter.setText(this.collection.count+' / 30');this.batchArt.root.active=hasBatch;this.batchInk.root.parent.active=hasBatch;this.batchInk.setText('换一批\n'+(this.batch+1)+' / '+this.collection.batchCount);
    }
    private nextBatch(){if(this.collection.count<=6||this.pointer.held>=0)return;this.batch=(this.batch+1)%this.collection.batchCount;this.refresh();}
    private restoreSelectors(){this.selectors.forEach((n,i)=>{n.setParent(this.decor);n.setPosition(...[PHOTO_SELECTORS[i][0],-PHOTO_SELECTORS[i][1]] as [number,number]);});this.returnTag.root.setSiblingIndex(this.header.children.length-1);this.pointerPosition=null;}
    private cancelPointer(){this.pointer.cancel();this.bubbleOwner=null;this.restoreSelectors();}
    private warning(text:string){this.bubble?.root.destroy();this.bubble=sharedUI().infoBubble(this.front,this.assets.font(TRAVEL_FONT),text,[350,1065],[0,0,720,1280],{fontSize:24,fontMetrics:this.assets.catalog.assets[TRAVEL_FONT].fontMetrics});}
    private render(delta:number){const light=photoLight(lightingSnapshot(this.clock.hour()),pageLayout(this.height).top);this.vines.forEach(v=>{if(v.visible){v.geometry.advance(delta,this.elapsed);v.view.sprite.geometryChanged();}});this.inks.forEach(i=>i.setNight(light.night));const bindings=this.collection.bindings();this.papers.forEach(p=>p.update(this.elapsed,light,bindings));
        this.clips.forEach(({view,shadow,material},i)=>{const swing=Math.sin(this.elapsed*(.67+i*.019)+i*1.71)*.024,angle=Math.PI*2/3+swing,at=anchor(i,this.elapsed),d=rotate([0,-14],swing),cast=rotate(light.cast,-angle),distance=mix(2,4.2,1-light.elevation)/.19;view.root.angle=-angle*180/Math.PI;view.root.setPosition(at[0]+d[0],-at[1]-d[1]);shadow.root.setPosition(cast[0]*distance,-cast[1]*distance);const size=this.assets.art(PHOTO_ATLAS).content;material.setProperty('shadowState',new Vec4(mix(1.1,2.4,1-light.elevation),mix(.20,.14,light.night),1/size[2],1/size[3]));});
        this.selectors.forEach((n,i)=>{n.angle=i===this.pointer.held?0:-(Math.sin(this.elapsed*(.81+i*.09)+i*2.37)*.019+Math.sin(this.elapsed*.37+i)*.006)*180/Math.PI;});
        const g=this.furniture;g.clear();for(let row=0;row<2;row++){const pins=[[-15,row?462:214],...[0,1,2].map(i=>anchor(i+row*3,this.elapsed)),[737,row?462:214]],points:number[][]=[];for(let span=0;span<pins.length-1;span++)for(let segment=0;segment<=12;segment++){const t=segment/12;points.push([mix(pins[span][0],pins[span+1][0],t),mix(pins[span][1],pins[span+1][1],t)+Math.sin(t*Math.PI)*(3.2+Math.sin(this.elapsed*.73+row*1.8+span*.83)*1.8)]);}const shadow=points.map(p=>p.map((v,i)=>v+light.cast[i]*mix(3,6,1-light.elevation)));drawLine(g,shadow,11,[.12,.09,.06,.05]);drawLine(g,shadow,7,[.12,.09,.06,.10]);drawLine(g,points,7,inkRGB('6e3e19'));drawLine(g,points,3.8,inkRGB('b98747'));for(let i=1;i<points.length-1;i++)drawLine(g,[[points[i][0]-2,points[i][1]-2],[points[i][0]+1,points[i][1]+3]],1,inkRGB('dfb974'));}
        if(this.collection.count>6)for(let layer=0;layer<this.collection.stackLayers(this.batch);layer++)drawPolygon(g,[[432,952],[610,939],[654,990],[471,1009]].map(p=>[p[0]+layer%3*1.6,p[1]-layer*1.5]),[...inkRGB('f8ead2'),1],[...inkRGB('b29172'),1],.9);
        this.lighting.update(light,pageLayout(this.height));this.actor.advance(delta,light);this.returnTag.advance(delta);this.sparkles.forEach(s=>s.advance(delta));
    }
    retain():PhotoRetained{return {batch:this.batch,elapsed:this.elapsed,vines:this.vines.map(v=>v.geometry),actor:this.actor.retain()};}
    resize(height:number,_physicalWidth?:number){this.height=height;this.binding?.cancel();this.cancelPointer();this.returnTag.cancel();box(this.root,0,0,720,height);repaintPanel(this.root.getChildByName('PhotoLetterbox'),720,height);const layout=pageLayout(height),{scale,x,offset,top,bottom}=layout,safe=safeViewport(height);box(this.clip,0,0,720,height);this.canvas.setPosition(x,-offset);this.canvas.setScale(scale,scale,1);this.background.resize(height,layout);pinTop(this.header,this.root,0,safe[1]);this.vines.forEach((v,i)=>{const site=VINE_SITES[i],y=site[1]+(i<4?top:i>=8?bottom-1280:0);v.view.root.setPosition(site[0],-y);});this.volume.sprite.mesh.vertices.set([-x/scale,top,(720-x)/scale,top,(720-x)/scale,bottom,-x/scale,bottom]);this.volume.sprite.geometryChanged();this.render(0);}
    advance(delta:number){if(!this.active)return;const dt=Number.isFinite(delta)?Math.max(0,Math.min(delta,.1)):0;this.elapsed+=dt;if(this.refreshNeeded)this.refresh();if(this.dirtyWarnings.length){this.dirtyWarnings=[];this.warning('这次还没保存好，再试一次吧。');}this.render(dt);if(this.bubble){this.bubble.advance(dt);if(this.bubble.snapshot().phase==='hidden'){this.bubble.root.destroy();this.bubble=null;}}}
    resume(allowInput=true){this.active=allowInput;this.root.active=true;if(this.collection.error)this.warning('照片保存暂时不可用。');this.render(0);}
    pause(){this.active=false;this.binding?.cancel();this.cancelPointer();this.returnTag.cancel();this.bubble?.root.destroy();this.bubble=null;}
    snapshot(){return {active:this.active,hour:this.clock.hour(),actor:this.actor.retain(),count:this.collection.count,revision:this.collection.revision,bindings:this.collection.bindings(),batch:this.batch,batches:this.collection.batchCount,photos:this.papers.map(p=>({id:p.geometry.id,anchor:p.geometry.position,angle:p.geometry.rotation})),held:this.pointer.held,pointer:this.pointer.owner,elapsed:this.elapsed,error:this.collection.error};}
}
