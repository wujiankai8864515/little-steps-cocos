import { core } from './Engine';
import { TravelStorage, travelRuntimeStorage } from './TravelStore';
export type SkinId='original'|'peach';
export const OUTFIT_TEXTURE='res://wardrobe/assets/peach_material.png';
export const SKINS={original:{label:'原皮',texture:'',band:[150,385,190,78],crown:[0,0,0,0]},peach:{label:'桃花',texture:OUTFIT_TEXTURE,band:[150,385,190,78],crown:[335,225,12,210]}};
export const hasSkin=(id:any):id is SkinId=>id==='original'||id==='peach';
export const WARDROBE_SAVE_PREFIX='travel_woodfish:wardrobe:',WARDROBE_MAX_BYTES=65536;
export type UnlockPolicy='temporary_local'|'verified_reward';
export const unlockPolicy=(value:string='temporary_local'):UnlockPolicy=>value==='temporary_local'?'temporary_local':'verified_reward';
export interface WardrobeState {schema:1;revision:number;worn:SkinId;unlocked:SkinId[];}
const fresh=():WardrobeState=>({schema:1,revision:0,worn:'original',unlocked:['original']});
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
export function validWardrobe(v:any):v is WardrobeState{return !!v&&v.schema===1&&Number.isSafeInteger(v.revision)&&v.revision>=0&&hasSkin(v.worn)&&Array.isArray(v.unlocked)&&v.unlocked.length>=1&&v.unlocked.length<=2&&v.unlocked.every(hasSkin)&&new Set(v.unlocked).size===v.unlocked.length&&v.unlocked.indexOf('original')>=0&&v.unlocked.indexOf(v.worn)>=0;}
// Preview never enters this durable model. Both unlock and equip adopt state only
// after a checked write; a failed read is never treated as an empty save.
export class WardrobeStore {
    private data=fresh();private slot='main';private enabled=true;private listeners=new Set<()=>void>();error='';
    constructor(readonly storage:TravelStorage=travelRuntimeStorage()){}
    get worn(){return this.data.worn;}get unlocked(){return this.data.unlocked.slice();}get revision(){return this.data.revision;}
    snapshot(){return clone(this.data);}
    subscribe(fn:()=>void){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
    configure(slot='main',enabled=true){this.data=fresh();this.slot=slot;this.enabled=enabled;this.error='';
        if(!/^[a-z][a-z0-9_-]{0,63}$/.test(slot)){this.error='invalid_slot';return false;}
        if(!enabled)return true;const loaded=this.read();if(this.error)return false;if(loaded)this.data=loaded;return true;
    }
    private read():WardrobeState|null {let raw:any;try{raw=this.storage.getItem(WARDROBE_SAVE_PREFIX+this.slot);if(raw===undefined)throw Error('unavailable');}catch(_){this.error='web_read_failed';return null;}
        if(raw===null)return null;const value=typeof raw==='string'?new core.CheckpointStore(null,WARDROBE_MAX_BYTES).decode(raw):null;
        if(value&&typeof value.schema==='number'&&value.schema>1){this.error='unsupported_saved_schema';return null;}
        if(!validWardrobe(value)){this.error='invalid_saved_data';return null;}return clone(value);
    }
    private commit(next:WardrobeState){if(['web_read_failed','invalid_saved_data','unsupported_saved_schema','invalid_slot'].indexOf(this.error)>=0)return false;
        this.error='';if(!validWardrobe(next)){this.error='invalid_state';return false;}next.revision=this.data.revision+1;
        if(this.enabled){const current=this.read();if(this.error)return false;if((current?.revision||0)!==this.data.revision){this.error='stale_revision';return false;}
            const encoded=new core.CheckpointStore(null,WARDROBE_MAX_BYTES).envelope(next);if(core.checkpointUTF8Length(encoded)>WARDROBE_MAX_BYTES){this.error='save_capacity';return false;}
            try{const latest=this.read();if(this.error)return false;if((latest?.revision||0)!==this.data.revision){this.error='stale_revision';return false;}const key=WARDROBE_SAVE_PREFIX+this.slot;this.storage.setItem(key,encoded);if(this.storage.getItem(key)!==encoded)throw Error('verify failed');}catch(_){this.error='web_write_failed';return false;}
        }
        this.data=next;this.listeners.forEach(fn=>fn());return true;
    }
    equip(id:string){if(!hasSkin(id)||this.data.unlocked.indexOf(id)<0)return false;if(this.worn===id)return !this.error;const next=this.snapshot();next.worn=id;return this.commit(next);}
    private unlock(id:string){if(!hasSkin(id))return false;if(this.data.unlocked.indexOf(id)>=0)return !this.error;const next=this.snapshot();next.unlocked.push(id);return this.commit(next);}
    unlockTemporaryLocal(id:string){return this.unlock(id);}
    acceptVerifiedReward(id:string,completed:boolean){return completed===true&&this.unlock(id);}
}
