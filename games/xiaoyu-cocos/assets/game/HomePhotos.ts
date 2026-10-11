import { Node, Sprite, UITransform, Vec3, Vec4 } from 'cc';
import { GameAssets } from './Assets';
import { lifetime, Scope } from './Engine';
import { HomeEntryIntent } from './HomeEntryIntent';
import { HomePage } from './HomePage';
import { PhotoCollection } from './PhotoCollection';
import { PHOTO_REWARDS } from './PhotoLighting';
// Home consumes committed bindings; page browse/failed drops never mutate art.
export class HomePhotos {
    onOpen=()=>{};private intent=new HomeEntryIntent();private owner:number|null=null;private selected=-1;private bounce=-1;
    private items:Array<{node:Node;sprite:Sprite;centered:boolean;worldSize:number[];size:number[];id:string;scope?:Scope}>=[];private rest:{position:Vec3;scale:Vec3;pivot:number[]}=null;
    constructor(private home:HomePage,private assets:GameAssets,private scope:Scope,readonly collection:PhotoCollection){
        const scene=assets.scene('res://home/home_world.tscn');for(const name of ['Photo1','Photo2']){const node=home.roomRoot.getChildByName(name),sprite=node.getChildByName('ApprovedPixels').getComponent(Sprite),section=scene.sections.find(s=>s.kind==='node'&&s.name===name),ui=node.getComponent(UITransform),size=[ui.width,ui.height];this.items.push({node,sprite,centered:section.properties.centered!==false,worldSize:[size[0]*node.scale.x,size[1]*node.scale.y],size,id:''});}
        scope.own(collection.subscribe(()=>this.sync()));scope.own(()=>this.cancelPointer());this.sync();
    }
    private sync(){const binding=this.collection.bindings();for(let i=0;i<2;i++){const item=this.items[i],id=binding[i?'photo2':'photo1'];if(item.id===id)continue;const photo=this.collection.photo(id);if(!photo)continue;this.cancelPointer();const resource=photo.kind==='legacy'?`res://assets/photo_frame_0${Math.trunc(photo.art)+1}_travel.png`:PHOTO_REWARDS,spec=this.assets.art(resource),region=photo.kind==='legacy'?[0,0,...spec.size]:[52,600,625,601],c=spec.content,x=Math.max(c[0],region[0]),y=Math.max(c[1],region[1]),right=Math.min(c[0]+c[2],region[0]+region[2]),bottom=Math.min(c[1]+c[3],region[1]+region[3]),owner=lifetime(this.scope),frame=this.assets.frame(resource,owner),r=frame.rect.clone();r.x=x-c[0];r.y=y-c[1];r.width=right-x;r.height=bottom-y;frame.rect=r;const prior=item.scope;item.sprite.spriteFrame=frame;item.scope=owner;item.id=id;item.size=region.slice(2);const child=item.sprite.node;child.setPosition(x-region[0]-(item.centered?region[2]/2:0),-y+region[1]+(item.centered?region[3]/2:0));child.getComponent(UITransform).setContentSize(right-x,bottom-y);item.node.getComponent(UITransform).setContentSize(region[2],region[3]);item.node.setScale(item.worldSize[0]/region[2],item.worldSize[1]/region[3],1);
            const material=item.sprite.customMaterial;if(material){material.setProperty('sourceUV',new Vec4(c[0]/spec.size[0],c[1]/spec.size[1],c[2]/spec.size[0],c[3]/spec.size[1]));material.setProperty('visibleUV',new Vec4(region[0]/spec.size[0],region[1]/spec.size[1],region[2]/spec.size[0],region[3]/spec.size[1]));}this.home.shadows.replaceRegion(item.node,resource,region,owner);prior?.dispose();
        }}
    get busy(){return this.bounce>=0;}
    down(id:number,at:number[]){if(this.busy)return true;if(this.owner!==null)return false;const world=this.home.roomRoot.getComponent(UITransform).convertToWorldSpaceAR(new Vec3(at[0],-at[1],0));this.selected=this.items.findIndex(v=>{const p=v.node.getComponent(UITransform).convertToNodeSpaceAR(world),x=p.x+(v.centered?v.size[0]/2:0),y=-p.y+(v.centered?v.size[1]/2:0);return v.node.activeInHierarchy&&x>=0&&y>=0&&x<v.size[0]&&y<v.size[1];});if(this.selected<0)return false;if(!this.intent.down(at))return false;this.owner=id;return true;}
    move(id:number,at:number[]){if(id!==this.owner)return false;this.intent.move(at);return true;}
    up(id:number,at:number[]){if(id!==this.owner)return;this.owner=null;if(this.intent.up(at)){const item=this.items[this.selected];this.bounce=0;this.rest={position:item.node.position.clone(),scale:item.node.scale.clone(),pivot:item.centered?[0,0]:item.size.map(v=>v/2)};}else this.selected=-1;}
    advance(delta:number){if(this.bounce<0)return;this.bounce+=Math.max(0,delta);const u=Math.min(1,this.bounce/.28),f=1-.075*Math.sin(u*Math.PI*2)*(1-u),item=this.items[this.selected],r=this.rest,angle=item.node.angle*Math.PI/180,px=r.pivot[0]*r.scale.x,py=-r.pivot[1]*r.scale.y,dx=(px*Math.cos(angle)-py*Math.sin(angle))*(1-f),dy=(px*Math.sin(angle)+py*Math.cos(angle))*(1-f);item.node.setScale(r.scale.x*f,r.scale.y*f,1);item.node.setPosition(r.position.x+dx,r.position.y+dy);if(u>=1){this.cancelPointer();this.onOpen();}}
    cancelPointer(){if(this.rest&&this.selected>=0){const n=this.items[this.selected].node;n.setPosition(this.rest.position);n.setScale(this.rest.scale);}this.rest=null;this.bounce=-1;this.owner=null;this.selected=-1;this.intent.cancel();}
    snapshot(){return {bindings:this.collection.bindings(),revision:this.collection.revision,busy:this.busy};}
}
