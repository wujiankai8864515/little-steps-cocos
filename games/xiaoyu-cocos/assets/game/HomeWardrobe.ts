import { UITransform, Vec3 } from 'cc';
import { GameAssets } from './Assets';
import { HomePage } from './HomePage';
import { HomeEntryIntent } from './HomeEntryIntent';
// Original Home entry checks the visible wardrobe region behind live props and
// the actor. The cabinet stays fixed: only the fabric inside reacts on its page.
export class HomeWardrobe {
    onOpen=()=>{};readonly busy=false;private intent=new HomeEntryIntent();private owner:number|null=null;private node:any;private size:number[];private visible:number[];
    constructor(private home:HomePage,assets:GameAssets){const spec=assets.art('res://assets/wardrobe_neutral.png'),p=assets.scene('res://home/home_world.tscn').sections.find(s=>s.kind==='node'&&s.name==='Wardrobe').properties;this.node=home.roomRoot.getChildByName('Wardrobe');this.size=spec.size;this.visible=p['metadata/visible_uv']||[0,0,1,1];}
    down(id:number,at:number[]){if(this.owner!==null)return false;const w=this.home.roomRoot.getComponent(UITransform).convertToWorldSpaceAR(new Vec3(at[0],-at[1]));if(this.home.rig.hitAt([w.x,w.y]))return false;const p=this.node.getComponent(UITransform).convertToNodeSpaceAR(w),r=this.visible,s=this.size;if(p.x<r[0]*s[0]||p.x>=(r[0]+r[2])*s[0]||-p.y<r[1]*s[1]||-p.y>=(r[1]+r[3])*s[1])return false;if(!this.intent.down(at))return false;this.owner=id;return true;}
    move(id:number,at:number[]){if(id!==this.owner)return false;this.intent.move(at);return true;}
    up(id:number,at:number[]){if(id!==this.owner)return;this.owner=null;const accepted=this.intent.up(at);this.intent.cancel();if(accepted)this.onOpen();}
    cancelPointer(){this.owner=null;this.intent.cancel();}
}
