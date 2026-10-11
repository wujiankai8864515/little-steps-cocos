import { Color, Material, Node, Sprite, UITransform, Vec3, Vec4 } from 'cc';
import { GameAssets } from './Assets';
import { core, lifetime, meshSprite, Scope } from './Engine';
import { HomePage } from './HomePage';
import { HomeClock } from './HomeClock';
import { homeLighting } from './LightingSnapshot';
import { darkMaterial } from './DarkroomLighting';
import { TravelService } from './TravelService';
import { TravelDiaryArtwork } from './TravelDiaryArtwork';
import { TravelAtlasSprite } from './TravelAtlasSprite';
import { TravelRewardMotion } from './TravelRewardMotion';
import { WayfindingHint } from './WayfindingHint';
import { nodeAt, picture } from './Visual';
import { BAG_RECT, MAP_RECT, OPEN_BAG_RECT, PROP_REGIONS, REWARD_REGIONS, REHANG_SECONDS, TENT_CONTACT_UV, TENT_POINTS, TENT_TRIANGLES, TENT_UV, TRAVEL_GLINT, TRAVEL_PROPS, TRAVEL_REWARDS, TravelPropPointer, entryPose, harvestCloud, mix, rehangPoint, rotate, smooth, tentProjection } from './TravelHomeRules';

type PropKey='map'|'diary'|'open_diary'|'full_bag';
export type TravelHomeMode='comic'|'journal'|'rewards'|'collection';
export class TravelHomeProps {
    readonly root:Node;readonly shadowRoot:Node;readonly rewards:TravelRewardMotion;
    private sprites={} as Record<PropKey,TravelAtlasSprite>;private receiver={} as Record<PropKey,Material>;
    private tent:Node;private projection:Array<{sprite:any;material:Material}>=[];
    private mapHint:WayfindingHint;private diaryHint:WayfindingHint;
    private mapGlints:Array<ReturnType<typeof picture>>=[];private bagGlints:Array<ReturnType<typeof picture>>=[];private departureGlints:Array<ReturnType<typeof picture>>=[];
    private clouds:Array<{view:ReturnType<typeof picture>;material:Material}>=[];
    private rewardNodes=new Map<string,{view:TravelAtlasSprite;scope:Scope}>();
    private pointer=new TravelPropPointer();private entry:{key:PropKey;age:number;done:()=>void;generation:number}=null;private generation=0;
    private collectionEntry=-1;
    private wasFull=false;private rehang:any=null;private clock=0;private departureAge=-1;private diaryOpen=false;private diaryRect=[503.5,1070,129,134];
    onNavigate=(mode:TravelHomeMode)=>{};
    constructor(private home:HomePage,private assets:GameAssets,private scope:Scope,private service:TravelService,private homeClock:HomeClock){
        this.root=nodeAt(home.roomRoot,'TravelHomeProps');this.shadowRoot=nodeAt(home.roomRoot,'TentAlphaGroundProjection');home.addWorldLayer(this.root,220);home.addWorldLayer(this.shadowRoot,1);
        this.rewards=new TravelRewardMotion(service);
        for(const key of ['map','diary','full_bag','open_diary'] as PropKey[]){
            const v=new TravelAtlasSprite(this.root,assets,scope,TRAVEL_PROPS,PROP_REGIONS[key],key);this.sprites[key]=v;
            const spec=assets.art(TRAVEL_PROPS),r=PROP_REGIONS[key];this.receiver[key]=home.lighting.receiver(v.sprite,spec,1,[r[0]/1536,r[1]/1024,r[2]/1536,r[3]/1024]);v.root.active=false;
        }
        new TravelDiaryArtwork(this.sprites.open_diary,assets,scope,home.lighting);
        this.sprites.map.place(MAP_RECT);this.sprites.diary.place(this.diaryRect);this.sprites.full_bag.place(BAG_RECT);
        this.tent=nodeAt(this.root,'ApprovedTent');
        this.tentMesh('ApprovedContact','res://travel/assets/home_tent_pixels.png',TENT_CONTACT_UV);
        this.tentMesh('RestoredPaper','res://travel/assets/home_tent_hd_v1.png',TENT_UV);
        const spec=assets.art('res://travel/assets/home_tent_hd_v1.png');
        for(let i=0;i<3;i++){
            const node=nodeAt(this.shadowRoot,['NaturalContour','LampContour','AlphaContact'][i]),sprite:any=node.addComponent(meshSprite());sprite.configure(tentProjection([0,0]),spec.size,spec.content);sprite.spriteFrame=assets.frame('res://travel/assets/home_tent_hd_v1.png',scope);sprite.sizeMode=Sprite.SizeMode.CUSTOM;
            const material=new Material();material.initialize({effectAsset:assets.effect('home-shadow'),defines:{USE_TEXTURE:true}});scope.own(()=>material.destroy());sprite.customMaterial=material;
            const c=spec.content,s=spec.size;material.setProperty('sourceUV',new Vec4(c[0]/s[0],c[1]/s[1],c[2]/s[0],c[3]/s[1]));material.setProperty('textureSize',new Vec4(s[0],s[1],0,0));this.projection.push({sprite,material});
        }
        const glints=(count:number,name:string)=>Array.from({length:count},(_,i)=>picture(this.root,assets,scope,TRAVEL_GLINT,name+i));
        this.mapGlints=glints(3,'MapGlint');this.bagGlints=glints(5,'ReturnedBagGlint');this.departureGlints=glints(13,'DepartureGlint');
        const safe=()=>[0,-home.viewportOffset,720,1280+home.viewportOffset*2];
        this.mapHint=new WayfindingHint(this.root,assets,scope,'路上有件小事，\n想问问你',[182,52],safe);this.diaryHint=new WayfindingHint(this.root,assets,scope,'翻翻我的日记',[192,46],safe);
        for(let i=0;i<2;i++){
            const resource='res://darkroom/assets/release.png',v=picture(this.root,assets,scope,resource,'SoftHarvestCloud'+i),material=darkMaterial(assets,scope,'plume'),s=assets.art(resource),c=s.content;v.sprite.customMaterial=material;
            material.setProperty('sourceUV',new Vec4(c[0]/s.size[0],c[1]/s.size[1],c[2]/s.size[0],c[3]/s.size[1]));material.setProperty('textureSize',new Vec4(s.size[0],s.size[1],0,0));this.clouds.push({view:v,material});
        }
        scope.own(()=>{this.suspend();for(const n of this.rewardNodes.values())n.scope.dispose();this.rewardNodes.clear();this.root.destroy();this.shadowRoot.destroy();});this.advance(0);
    }
    private tentMesh(name:string,resource:string,uv:number[][]){const spec=this.assets.art(resource),n=nodeAt(this.tent,name),sprite:any=n.addComponent(meshSprite());sprite.configure({vertices:new Float32Array(([] as number[]).concat(...TENT_POINTS)),source:new Float32Array(([] as number[]).concat(...uv)),indices:new Uint16Array(TENT_TRIANGLES)},spec.size,spec.content);sprite.spriteFrame=this.assets.frame(resource,this.scope);sprite.sizeMode=Sprite.SizeMode.CUSTOM;this.home.lighting.receiver(sprite,spec,1,[0,0,1,1]);}
    private away(){return this.service.model.trip().status==='traveling';}
    private full(){const t=this.service.model.trip();return t.status==='returned'&&!t.claimed;}
    get busy(){return !!this.entry||this.collectionEntry>=0;}
    get rehanging(){return !!this.rehang;}
    beginDeparture(){this.departureAge=0;this.advance(0);}
    finishDeparture(){this.departureAge=-1;this.advance(0);}
    syncRehangState(){
        const full=this.full();
        if(this.wasFull&&!full&&this.service.model.trip().claimed&&!this.rehang){
            const bag=this.sprites.full_bag,region=bag.region,s=bag.root.scale,p=bag.root.position,bounds=[p.x-region[2]*s.x/2,-p.y-region[3]*s.y/2,region[2]*s.x,region[3]*s.y],pose=this.home.backpack.beginTravelRehang(bounds);
            this.rehang={...pose,age:0,sourceOffset:[pose.start[0]-p.x,pose.start[1]+p.y],sourceScale:[s.x,s.y],sourceRotation:-bag.root.angle*Math.PI/180};
        }
        this.wasFull=full;
    }
    private advanceRehang(delta:number){
        const r=this.rehang;if(!r)return;if(this.away()){this.finishRehang();return;}r.age=Math.min(REHANG_SECONDS,r.age+Math.max(0,delta));const t=r.age/REHANG_SECONDS,e=smooth(0,1,t),anchor=rehangPoint(r.start,r.end,t),frame=mix(r.startTransform,r.endTransform,e),sway=Math.sin(t*Math.PI)*-.13;
        const x=rotate(frame.slice(0,2),sway),y=rotate(frame.slice(2,4),sway);frame[0]=x[0];frame[1]=x[1];frame[2]=y[0];frame[3]=y[1];frame[4]=anchor[0]-frame[0]*r.anchorLocal[0]-frame[2]*r.anchorLocal[1];frame[5]=anchor[1]-frame[1]*r.anchorLocal[0]-frame[3]*r.anchorLocal[1];
        const hanging=smooth(.10,.34,t);this.home.backpack.applyTravelRehang(frame,hanging);const bag=this.sprites.full_bag,offset=rotate(r.sourceOffset,sway);bag.root.active=hanging<1;bag.root.setPosition(anchor[0]-offset[0],-anchor[1]+offset[1]);bag.root.setScale(r.sourceScale[0],r.sourceScale[1],1);bag.root.angle=-(r.sourceRotation+sway)*180/Math.PI;bag.sprite.color=new Color(255,255,255,(1-hanging)*255);if(t>=1)this.finishRehang();
    }
    private finishRehang(){if(!this.rehang)return;this.rehang=null;this.home.backpack.finishTravelRehang();this.sprites.full_bag.root.active=false;this.sprites.full_bag.root.angle=0;this.sprites.full_bag.sprite.color=Color.WHITE;}
    private updateProjection(){
        this.shadowRoot.active=this.tent.active;if(!this.tent.active)return;
        const s=homeLighting(this.homeClock.hour(),this.homeClock.lampWeight()),day=s.sunEnergy>0,dir=day?s.cast:s.moonCast,cot=day?s.cot:1.6,energy=day?s.sunEnergy:s.moonEnergy*.34,p=this.home.roomRoot.worldPosition,scale=this.home.roomRoot.worldScale;
        const directions=[[dir[0]*cot*.72,dir[1]*.72*cot*.72],[(359-465)/420*.72,(926-888)*.8/420*.72],[0,-.035]];
        this.projection.forEach(({sprite,material},i)=>{const strength=i===0?energy*.72:i===1?s.lampEnergy*.5:.18;sprite.node.active=strength>.001;if(!sprite.node.active)return;const m=tentProjection(directions[i]);sprite.mesh.vertices.set(m.vertices);sprite.mesh.vertexData.set(m.vertexData);sprite.geometryChanged();material.setProperty('roomOrigin',new Vec4(p.x,p.y,scale.x,scale.y));material.setProperty('castState',new Vec4(dir[0],dir[1],0,0));material.setProperty('shadowState',new Vec4(cot,strength,i===0?1.15:.85,.72));material.setProperty('shadowFlags',new Vec4(1,i===0?1:0,i===1?1:0,1));});
    }
    private setGlint(v:ReturnType<typeof picture>,at:number[],size:number,alpha:number,color=[1,1,1]){v.root.active=alpha>0;v.root.setPosition(at[0],-at[1]);v.root.setScale(size/128,size/128,1);v.sprite.color=new Color(color[0]*255,color[1]*255,color[2]*255,alpha*255);}
    private updateGlints(){
        const positions=[[670,1083],[676,1122],[642,1072]],offsets=[[-73,-93],[-15,-112],[58,-84],[83,-29],[-88,-25]],center=[359,1015];
        this.mapGlints.forEach((v,i)=>{const phase=this.clock*(1.25+.21*i)+i*2.17,pulse=(.5+.5*Math.sin(phase))**1.4;this.setGlint(v,[positions[i][0]+Math.sin(phase*.57)*2,positions[i][1]+Math.cos(phase*.71)*2.5],(i===0?23:16)*(.80+.25*pulse),this.away()?.25+.65*pulse:0);});
        this.bagGlints.forEach((v,i)=>{const phase=this.clock*(1.7+.08*i)+i*1.43,breath=.5+.5*Math.sin(phase);this.setGlint(v,[center[0]+offsets[i][0],center[1]+offsets[i][1]+1.5*Math.sin(phase*.65)],(i%2===0?24:20)*(.90+.18*breath),this.full()?.40+.50*breath:0);});
        this.departureGlints.forEach((v,i)=>{const phase=(this.clock*.25+i*.137)%1;this.setGlint(v,[356+Math.sin(i*2.4)*115,880-this.departureAge*20+Math.cos(i*1.7)*63.25-phase*50],15+12*Math.sin(phase*Math.PI),this.departureAge>=0?Math.sin(Math.min(this.departureAge/5.4,1)*Math.PI)*Math.sin(phase*Math.PI):0,[1,.94,.76]);});
    }
    private advanceRewards(delta:number){
        this.rewards.advance(delta);
        for(const [uid,n] of this.rewardNodes)if(!this.rewards.poses.has(uid)){n.scope.dispose();this.rewardNodes.delete(uid);}
        for(const [uid,p] of this.rewards.poses){let n=this.rewardNodes.get(uid);if(!n){const scope=lifetime(this.scope),view=new TravelAtlasSprite(this.root,this.assets,scope,TRAVEL_REWARDS,REWARD_REGIONS[p.art],'Reward_'+uid);scope.own(()=>view.dispose());n={view,scope};this.rewardNodes.set(uid,n);}const v=n.view,s=68/Math.max(v.region[2],v.region[3])*p.scale;v.root.active=p.visible;v.root.setPosition(p.position[0],-p.position[1]);v.root.setScale(s,s,1);v.sprite.color=new Color(255,255,255,p.alpha*255);v.root.setSiblingIndex(this.root.children.length-1);}
        this.clouds.forEach(({view,material},i)=>{const sample=this.full()&&this.service.model.trip().rewards_opened?harvestCloud(i,this.rewards.ejectionAge):null;view.root.active=!!sample;if(!sample)return;view.root.setPosition(sample.position[0],-sample.position[1]);view.root.setScale(sample.width/view.spec.size[0],sample.width/view.spec.size[0],1);view.root.angle=-sample.rotation*180/Math.PI;material.setProperty('darkState',new Vec4(sample.age,sample.alpha,.018,0));});
    }
    advance(delta:number){
        if(!Number.isFinite(delta)||delta<0)return;this.clock+=delta;if(this.departureAge>=0)this.departureAge+=delta;
        const away=this.away(),full=this.full(),trip=this.service.model.trip();this.syncRehangState();
        this.tent.active=away&&this.departureAge<0;this.sprites.map.root.active=away;this.sprites.full_bag.root.active=full;
        const journal=this.service.model.pending_journals().length>0;this.sprites.diary.root.active=journal&&!this.diaryOpen;this.sprites.open_diary.root.active=this.diaryOpen||this.entry?.key==='diary';
        this.diaryRect=away?[327,1080,129,134]:[503.5,1070,129,134];
        const region=full&&trip.rewards_opened?PROP_REGIONS.open_bag:PROP_REGIONS.full_bag;this.sprites.full_bag.setRegion(region);this.receiver.full_bag.setProperty('visibleUV',new Vec4(region[0]/1536,region[1]/1024,region[2]/1536,region[3]/1024));
        if(!this.entry){this.sprites.diary.place(this.diaryRect);if(!this.rehang)this.sprites.full_bag.place(full&&trip.rewards_opened?OPEN_BAG_RECT:BAG_RECT);}
        this.mapHint.advance(delta,[491,1020+Math.sin(this.clock*1.45)*2.2],away&&trip.events.some(e=>e.state==='waiting'||e.state==='manual'));
        this.diaryHint.advance(delta,[away?296:472,(away?1028:1021)+Math.sin((this.clock+.8)*1.45)*2.2],journal&&!this.diaryOpen);
        this.advanceCollectionEntry(delta);this.advanceEntry(delta);this.advanceRewards(delta);this.advanceRehang(delta);this.updateProjection();this.updateGlints();this.home.syncWorldLayers();
    }
    private advanceCollectionEntry(delta:number){if(this.collectionEntry>=0){this.collectionEntry+=delta;this.home.collectionFeedback(this.collectionEntry);if(this.collectionEntry>=.28){this.collectionEntry=-1;this.home.cancelCollectionFeedback();this.onNavigate('collection');}}}
    private animate(key:PropKey,done:()=>void){if(this.entry)return false;this.entry={key,age:0,done,generation:++this.generation};if(key==='diary'){const c=[this.diaryRect[0]+this.diaryRect[2]/2,this.diaryRect[1]+this.diaryRect[3]/2];this.sprites.open_diary.place([c[0]-94,c[1]-62,188,130]);}return true;}
    private advanceEntry(delta:number){const e=this.entry;if(!e)return;e.age+=delta;const p:any=entryPose(e.key,e.age),v=this.sprites[e.key];if(e.key==='diary'){v.place(this.diaryRect);v.root.setScale(v.root.scale.x*p.closedScale,v.root.scale.y,1);v.setSkew(p.skew);this.diaryOpen=p.opened;v.root.active=!p.opened;const opened=this.sprites.open_diary;opened.root.active=true;opened.root.setScale(188/580*p.openedScale,130/402,1);}
        else{const r=e.key==='map'?MAP_RECT:this.service.model.trip().rewards_opened?OPEN_BAG_RECT:BAG_RECT;v.place(r);v.root.setScale(v.root.scale.x*p.scale,v.root.scale.y*p.scale,1);}
        if(p.finished){v.setSkew(0);this.entry=null;if(e.generation===this.generation)e.done();}
    }
    private opaque(key:PropKey,at:number[]){const v=this.sprites[key];if(!v.root.active)return false;const world=this.home.roomRoot.getComponent(UITransform).convertToWorldSpaceAR(new Vec3(at[0],-at[1])),local=v.root.getComponent(UITransform).convertToNodeSpaceAR(world),r=v.region,x=local.x+r[2]/2,y=-local.y+r[3]/2;if(x<0||y<0||x>=r[2]||y>=r[3])return false;return this.assets.bitmapContains('res://travel/assets/travel_props_hit.res',Math.floor(x+r[0]),Math.floor(y+r[1]));}
    private hit(at:number[]){const reward=this.rewards.hit(at);if(reward)return 'reward:'+reward;if(this.full()&&this.opaque('full_bag',at))return 'rewards';if(this.away()&&this.opaque('map',at))return 'comic';if(this.service.model.pending_journals().length&&this.opaque('diary',at))return 'journal';if(this.home.hitsCollection(at))return 'collection';return '';}
    down(id:number,at:number[]){if(this.busy)return true;return this.pointer.down(id,at,this.hit(at));}
    move(id:number,at:number[]){return this.pointer.move(id,at);}
    up(id:number,at:number[]){const target=this.pointer.up(id,at,this.hit(at));if(!target)return;if(target.startsWith('reward:')){this.rewards.collect(target.slice(7));return;}if(target==='collection'){this.collectionEntry=0;this.home.collectionFeedback(0);return;}const mode=target as TravelHomeMode,key=({comic:'map',journal:'diary',rewards:'full_bag'} as const)[target];this.animate(key,()=>{if(mode==='rewards')this.service.open_rewards();else this.onNavigate(mode);});}
    cancelPointer(){this.pointer.cancel();if(this.collectionEntry>=0){this.collectionEntry=-1;this.home.cancelCollectionFeedback();}}
    suspend(){this.cancelPointer();this.generation++;this.entry=null;this.diaryOpen=false;this.finishRehang();this.sprites.open_diary.root.active=false;this.sprites.map.place(MAP_RECT);this.sprites.diary.setSkew(0);this.sprites.diary.place(this.diaryRect);this.sprites.full_bag.place(this.service.model.trip().rewards_opened?OPEN_BAG_RECT:BAG_RECT);}
    snapshot(){return {away:this.away(),full:this.full(),departureAge:this.departureAge,entry:this.entry?{key:this.entry.key,age:this.entry.age}:null,rehang:this.rehang?{age:this.rehang.age,start:this.rehang.start,end:this.rehang.end}:null,rewards:this.rewards.snapshot(),rewardNodes:this.rewardNodes.size,tentVisible:this.tent.active};}
}
