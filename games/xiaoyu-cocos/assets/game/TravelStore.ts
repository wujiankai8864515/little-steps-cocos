import { core } from './Engine';
import { TravelModel, TRAVEL_SCHEMA } from './TravelModel';

export interface TravelStorage { getItem(key:string):any; setItem(key:string,value:string):void; }
export const TRAVEL_SAVE_MAX_BYTES=4194304, TRAVEL_SAVE_PREFIX='travel_woodfish:travel_story:';
const copy=(value:any)=>JSON.parse(JSON.stringify(value));
const empty=(value:any)=>Object.keys(value).length===0;

// Use throwing platform calls. Creator's unavailable-storage fallback warns
// and returns undefined, which must never be treated as a successful save.
export function travelRuntimeStorage():TravelStorage {
    return {
        getItem(key:string){
            const root=globalThis as any,wx=root.wx;
            if(wx&&typeof wx.getStorageInfoSync==='function'){
                const info=wx.getStorageInfoSync();
                if(!info||!Array.isArray(info.keys))throw new Error('storage_unavailable');
                return info.keys.indexOf(key)<0?null:wx.getStorageSync(key);
            }
            if(!root.localStorage)throw new Error('storage_unavailable');
            const value=root.localStorage.getItem(key);
            if(value===undefined)throw new Error('storage_unavailable');
            return value;
        },
        setItem(key:string,value:string){
            const root=globalThis as any,wx=root.wx;
            if(wx&&typeof wx.setStorageSync==='function'){wx.setStorageSync(key,value);return;}
            if(!root.localStorage)throw new Error('storage_unavailable');
            root.localStorage.setItem(key,value);
        }
    };
}

// Main-key authority matches the original Web product. Generic framework
// backup/.tmp recovery is deliberately not a travel browser commit policy.
export class TravelStore {
    error=''; slot='main'; memory_only=false; needs_migration=false;
    protected _memory:any={};
    private futureSchema=false;
    private decodedLegacy=false;
    constructor(readonly storage:TravelStorage=travelRuntimeStorage()){}
    private valid_slot(){
        const name=this.slot.replace(/[_-]/g,'');
        return this.slot.length>0&&this.slot.length<65&&this.slot.toLowerCase()===this.slot&&/^[a-z][a-z0-9]*$/.test(name);
    }
    static envelope(data:any){return new core.CheckpointStore(null,TRAVEL_SAVE_MAX_BYTES).envelope(data);}
    private decode(text:string){
        this.decodedLegacy=false;
        const saved=new core.CheckpointStore(null,TRAVEL_SAVE_MAX_BYTES).decode(text);
        if(!saved)return {};
        if(typeof saved.schema==='number'&&saved.schema>TRAVEL_SCHEMA)this.futureSchema=true;
        this.decodedLegacy=saved.schema===1;
        return TravelModel.migrate(saved);
    }
    load_state():any {
        this.error='';this.futureSchema=false;this.needs_migration=false;this.decodedLegacy=false;
        if(this.memory_only){
            this.needs_migration=this._memory.schema===1;
            if(empty(this._memory))return {};
            const restored=TravelModel.migrate(this._memory);
            if(empty(restored))this.error=typeof this._memory.schema==='number'&&this._memory.schema>TRAVEL_SCHEMA?'unsupported_saved_schema':'invalid_saved_data';
            return restored;
        }
        if(!this.valid_slot()){this.error='invalid_slot';return {};}
        let raw:any;
        try{raw=this.storage.getItem(TRAVEL_SAVE_PREFIX+this.slot);if(raw===undefined)throw new Error('storage_unavailable');}
        catch(_){this.error='web_read_failed';return {};}
        const found=raw!==null,best=typeof raw==='string'?this.decode(raw):{};
        this.needs_migration=this.decodedLegacy;
        if(this.futureSchema)this.error='unsupported_saved_schema';
        else if(found&&empty(best))this.error='invalid_saved_data';
        return best;
    }
    commit(data:any,expectedRevision:number){
        this.error='';
        if(!TravelModel.valid(data)){this.error='invalid_state';return false;}
        const current=this.load_state();if(this.error)return false;
        if((!empty(current)&&Math.trunc(current.revision)!==expectedRevision)||(empty(current)&&expectedRevision!==0)){this.error='stale_revision';return false;}
        const next=copy(data);next.revision=expectedRevision+1;
        const encoded=TravelStore.envelope(next);
        if(core.checkpointUTF8Length(encoded)>TRAVEL_SAVE_MAX_BYTES){this.error='save_capacity';return false;}
        if(this.memory_only){this._memory=next;data.revision=next.revision;this.needs_migration=false;return true;}
        const key=TRAVEL_SAVE_PREFIX+this.slot;
        try {
            // Re-read immediately before the one atomic main-key write, as in
            // the original JavaScriptBridge compare-and-set transaction.
            const raw=this.storage.getItem(key);
            if(raw===undefined)throw new Error('storage_unavailable');
            const revision=raw?Number(JSON.parse(JSON.parse(raw).payload).revision):0;
            if(revision!==expectedRevision){this.error='stale_revision';return false;}
            this.storage.setItem(key,encoded);
            if(this.storage.getItem(key)!==encoded)throw new Error('verify_committed_save_failed');
        }catch(_){this.error='web_write_failed';return false;}
        data.revision=next.revision;this.needs_migration=false;return true;
    }
}
