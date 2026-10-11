import { core } from './Engine';
import { TravelStorage, travelRuntimeStorage } from './TravelStore';
export interface WallPhoto { photo_id:string;kind:'legacy'|'reward';art:number;title:string; }
export interface PhotoState { schema:number;revision:number;photos:WallPhoto[];bindings:{photo1:string;photo2:string}; }
export const PHOTO_CAPACITY=30,PHOTO_SAVE_PREFIX='travel_woodfish:photo_wall:',PHOTO_MAX_BYTES=262144;
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const record=(v:any)=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const number=(v:any)=>typeof v==='number'&&Number.isFinite(v);
export function freshPhotos():PhotoState {return {schema:1,revision:0,photos:[
    {photo_id:'home_legacy_1',kind:'legacy',art:0,title:'旅行的第一张照片'},
    {photo_id:'home_legacy_2',kind:'legacy',art:1,title:'旅行的第二张照片'}],bindings:{photo1:'home_legacy_1',photo2:'home_legacy_2'}};}
export function validPhotos(value:any):value is PhotoState {
    if(!record(value)||value.schema!==1||!number(value.revision)||Math.trunc(value.revision)<0||!Array.isArray(value.photos)||value.photos.length>PHOTO_CAPACITY||!record(value.bindings))return false;
    const ids=new Set<string>();
    for(const p of value.photos){
        if(!record(p)||typeof p.photo_id!=='string'||!p.photo_id||Array.from(p.photo_id).length>180||ids.has(p.photo_id)||['legacy','reward'].indexOf(p.kind)<0||!number(p.art)||typeof p.title!=='string'||Array.from(p.title).length>120)return false;
        if(p.kind==='legacy'?[0,1].indexOf(Math.trunc(p.art))<0:Math.trunc(p.art)!==2)return false;ids.add(p.photo_id);
    }
    return Object.keys(value.bindings).length===2&&['photo1','photo2'].every(k=>typeof value.bindings[k]==='string'&&ids.has(value.bindings[k]));
}
export class PhotoStore {
    slot='main';memory_only=false;error='';private memory:PhotoState=null;
    constructor(readonly storage:TravelStorage=travelRuntimeStorage()){}
    static envelope(data:any){return new core.CheckpointStore(null,PHOTO_MAX_BYTES).envelope(data);}
    load():PhotoState|null {
        this.error='';let saved:any=null;
        if(this.memory_only){saved=this.memory;if(saved===null)return null;}
        else {
            if(this.slot.length<1||this.slot.length>64||this.slot.toLowerCase()!==this.slot||!/^[a-z][a-z0-9]*$/.test(this.slot.replace(/[_-]/g,''))){this.error='invalid_slot';return null;}
            let raw:any;try{raw=this.storage.getItem(PHOTO_SAVE_PREFIX+this.slot);if(raw===undefined)throw Error('storage_unavailable');}catch(_){this.error='web_read_failed';return null;}
            if(raw===null)return null;
            saved=typeof raw==='string'?new core.CheckpointStore(null,PHOTO_MAX_BYTES).decode(raw):null;
        }
        if(record(saved)&&number(saved.schema)&&saved.schema>1){this.error='unsupported_saved_schema';return null;}
        if(!validPhotos(saved)){this.error='invalid_saved_data';return null;}return copy(saved);
    }
    commit(data:PhotoState,expected:number){
        this.error='';if(!validPhotos(data)){this.error='invalid_state';return false;}
        const current=this.load();if(this.error)return false;
        if((current?Math.trunc(current.revision):0)!==expected){this.error='stale_revision';return false;}
        const next=copy(data);next.revision=expected+1;const encoded=PhotoStore.envelope(next);
        if(core.checkpointUTF8Length(encoded)>PHOTO_MAX_BYTES){this.error='save_capacity';return false;}
        if(this.memory_only)this.memory=next;
        else {
            const key=PHOTO_SAVE_PREFIX+this.slot;
            try {
                const raw=this.storage.getItem(key);if(raw===undefined)throw Error('storage_unavailable');
                if((raw?Number(JSON.parse(JSON.parse(raw).payload).revision):0)!==expected){this.error='stale_revision';return false;}
                this.storage.setItem(key,encoded);
                if(this.storage.getItem(key)!==encoded)throw Error('verify_committed_save_failed');
            }catch(_){this.error='web_write_failed';return false;}
        }
        data.revision=next.revision;return true;
    }
}
export class PhotoCollection {
    private data:PhotoState=freshPhotos();error='';overflowCount=0;
    private listeners=new Set<()=>void>();private failures=new Set<(reason:string)=>void>();
    constructor(readonly store=new PhotoStore()){}
    subscribe(callback:()=>void){this.listeners.add(callback);return ()=>this.listeners.delete(callback);}
    onFailure(callback:(reason:string)=>void){this.failures.add(callback);return ()=>this.failures.delete(callback);}
    private fail(reason:string){this.error=reason;this.failures.forEach(f=>f(reason));return false;}
    configure(slot='main',memoryOnly=false){this.store.slot=slot;this.store.memory_only=memoryOnly;const saved=this.store.load();if(this.store.error)return this.fail(this.store.error);if(saved){this.data=saved;this.error='';this.listeners.forEach(f=>f());return true;}return this.commit(copy(this.data));}
    private commit(next:PhotoState){if(['unsupported_saved_schema','invalid_saved_data','web_read_failed'].indexOf(this.error)>=0)return this.fail(this.error);if(!this.store.commit(next,Math.trunc(this.data.revision)))return this.fail(this.store.error);this.error='';this.data=next;this.listeners.forEach(f=>f());return true;}
    photos(){return copy(this.data.photos);}
    bindings(){return copy(this.data.bindings);}
    photo(id:string){const p=this.data.photos.find(p=>p.photo_id===id);return p?copy(p):null;}
    get revision(){return this.data.revision;}
    get count(){return this.data.photos.length;}
    bind(slot:string,id:string){if(['photo1','photo2'].indexOf(slot)<0||!this.photo(id))return false;if(this.data.bindings[slot]===id)return true;const next=copy(this.data);next.bindings[slot]=id;return this.commit(next);}
    syncInventory(inventory:any[]){const next=copy(this.data),ids=new Set(next.photos.map(p=>p.photo_id));this.overflowCount=0;
        for(const item of inventory){if(!record(item)||item.id!=='photo'||typeof item.uid!=='string')continue;const id='reward:'+item.uid;if(ids.has(id))continue;if(next.photos.length>=PHOTO_CAPACITY){this.overflowCount++;continue;}next.photos.push({photo_id:id,kind:'reward',art:2,title:String(item.place??'旅途')+'的照片'});ids.add(id);}
        return next.photos.length===this.data.photos.length||this.commit(next);
    }
    get batchCount(){return Math.max(1,Math.ceil(this.count/6));}
    batch(index:number){const start=((Math.trunc(index)%this.batchCount)+this.batchCount)%this.batchCount*6;return this.photos().slice(start,start+6);}
    stackLayers(index=0){return Math.min(20,Math.max(0,this.count-this.batch(index).length));}
}
