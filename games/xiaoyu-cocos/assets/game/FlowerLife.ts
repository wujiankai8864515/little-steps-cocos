// flower_life.gd: earned time and persisted geometry, independent of rendering.
export type FlowerRecord={id:number;born:number;lifetime:number;height:number;bend:number;root_x:number;phase:number;head_size:number;[key:string]:any};
export const flowerClamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export const flowerSmooth=(a:number,b:number,v:number)=>{const t=flowerClamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
export const flowerMod=(v:number,n:number)=>((v%n)+n)%n;
const numeric=(v:any,a:number,b:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
export class FlowerLife {
    activeSeconds=0;nextBirthSeconds=60;nextId=1;revision=0;lifetimeSeconds=360;maxFlowers=10;flowers:FlowerRecord[]=[];
    configure(lifetime=360,_cap=10){this.lifetimeSeconds=Number.isFinite(lifetime)?flowerClamp(lifetime,120,1800):360;this.maxFlowers=10;}
    initialize(){if(!this.flowers.length&&this.nextId===1&&this.activeSeconds<=0)this.flowers.push(this.record(0,-8));}
    record(id:number,born:number):FlowerRecord {
        const unit=(salt:number)=>flowerMod(Math.sin((id+1)*127.1+salt*311.7)*43758.5453,1),slot=flowerMod(id,10);
        return {id,born,lifetime:this.lifetimeSeconds*(.9+.2*unit(1)),height:[98,79,132,137,108,160,160,123,169,108][slot]-2+4*unit(2),bend:[-.04,-.82,.35,-.40,.73,-.05,.92,-.82,.43,-.55][slot]-.012+.024*unit(3),root_x:[0,-13,13,-8,18,-5,8,-9,4,-5][slot],phase:unit(5)*Math.PI*2,head_size:31+7*unit(6)};
    }
    advance(delta:number){if(!Number.isFinite(delta)||delta<=0||delta>3600)return false;this.activeSeconds=Math.min(this.activeSeconds+delta,1e10);let changed=false;
        while(this.nextBirthSeconds<=this.activeSeconds+1e-6){if(this.flowers.length<this.maxFlowers){this.flowers.push(this.record(this.nextId++,this.nextBirthSeconds));changed=true;}this.nextBirthSeconds+=60;}return changed;
    }
    phaseFor(f:FlowerRecord){const age=Math.max(0,this.activeSeconds-f.born),progress=flowerClamp(age/8,0,1),bloom=flowerSmooth(.28,.96,progress);return {age,progress,stage:'daynight',growth:.045+.955*flowerSmooth(0,.83,progress),head_growth:.08+.92*flowerSmooth(.18,1,progress),bloom,frame:bloom*4,wilt:0,alpha:1};}
    snapshot(){return {schema:3,geometry_version:2,revision:this.revision,active_seconds:this.activeSeconds,next_birth_seconds:this.nextBirthSeconds,next_id:this.nextId,lifetime_seconds:this.lifetimeSeconds,max_flowers:this.maxFlowers,flowers:copy(this.flowers),offline_growth:false};}
    restore(data:any){
        if(!data||typeof data!=='object'||Array.isArray(data))return false;
        const schema=data.schema,geometry=data.geometry_version===undefined?0:data.geometry_version,time=data.active_seconds;
        if(!numeric(schema,1,3)||!Number.isInteger(schema)||!numeric(geometry,0,2)||!Number.isInteger(geometry)||!numeric(time,0,1e10)||!numeric(data.revision,0,1e10)||!numeric(data.next_id,1,1e10)||!numeric(data.next_birth_seconds,time+1e-6,time+60+.001)||!numeric(data.lifetime_seconds,120,1800)||!numeric(data.max_flowers,1,12))return false;
        const list=data.flowers;if(!Array.isArray(list)||list.length>12||list.length>Math.floor(data.max_flowers)||(schema===3&&list.length>10))return false;
        const seen=new Set<number>(),parsed:FlowerRecord[]=[];
        for(const value of list){if(!value||typeof value!=='object'||Array.isArray(value))return false;
            if(!numeric(value.id,0,data.next_id-1)||seen.has(Math.floor(value.id))||!numeric(value.born,-1980,time)||!numeric(value.lifetime,108,1980))return false;
            const specs:any[]=geometry===2?[['height',61,171],['bend',-1.05,1.05],['root_x',-23,23],['phase',0,Math.PI*2],['head_size',31,38]]:schema===1?[['height',104,157],['bend',-.25,.25],['root_x',-12,12],['phase',0,Math.PI*2],['head_size',29,36]]:[['height',61,106],['bend',-.54,.54],['root_x',-23,23],['phase',0,Math.PI*2],['head_size',31,38]];
            if(specs.some(s=>!numeric(value[s[0]],s[1],s[2])))return false;
            seen.add(Math.floor(value.id));const f=copy(value);f.id=Math.floor(f.id);
            if(geometry<2){const compact=this.record(f.id,f.born);for(const key of ['height','bend','root_x','head_size'])f[key]=compact[key];}parsed.push(f);
        }
        // Commit only after all records validate. Never seed/backfill a restore.
        this.activeSeconds=time;this.nextBirthSeconds=data.next_birth_seconds;this.nextId=Math.floor(data.next_id);this.revision=Math.floor(data.revision);this.lifetimeSeconds=data.lifetime_seconds;this.maxFlowers=10;this.flowers=parsed.slice(0,10);return true;
    }
}
// Godot files contain raw JSON. The framework codec keeps that format while
// using Cocos KV temporary/main readback in place of FileAccess atomic rename.
export class FlowerStore {
    lastError='';lastSource='';
    constructor(private checkpoint:any){}
    private key(slot:string){return /^[a-z0-9_-]{1,48}$/.test(slot)?'travel_woodfish:home_flowers:'+slot:'';}
    loadInto(model:FlowerLife,slot='vase_v1'){
        this.lastError='';this.lastSource='';const key=this.key(slot);if(!key){this.lastError='invalid_save_slot';return false;}let best:any=null,revision=-1;
        const records=this.checkpoint.read(key);this.lastError=this.checkpoint.lastError;
        for(const item of records){const probe=new FlowerLife();if(probe.restore(item.data)&&probe.revision>revision){best=item.data;revision=probe.revision;this.lastSource=item.source;}}
        if(revision>=0)return model.restore(best);if(records.length&&!this.lastError)this.lastError='no_valid_saved_generation';return false;
    }
    save(model:FlowerLife,slot='vase_v1'){this.lastError='';const key=this.key(slot);if(!key){this.lastError='invalid_save_slot';return false;}const data=model.snapshot();data.revision=model.revision+1;
        if(!this.checkpoint.write(key,data)){this.lastError=this.checkpoint.lastError;return false;}model.revision=data.revision;return true;
    }
}
// PersistentVase's external shared clock keeps earned time while Home is
// hidden. Application focus controls the shared clock; no wall clock is read.
export class FlowerBouquet {
    readonly model=new FlowerLife();active=false;visualTime=0;accumulator=0;saveAge=0;dirty=false;persistenceFailed=false;
    private elapsedAnchor=-1;
    onVisual=(step:number,snap:boolean)=>{};isVisible=()=>true;onWarning=(reason:string)=>{};
    constructor(private store:FlowerStore,private persistence=true,private slot='vase_v1'){
        this.model.configure();if(!persistence||!store.loadInto(this.model,slot)){this.persistenceFailed=persistence&&!!store.lastError;this.model.initialize();this.dirty=true;}
    }
    setActive(value:boolean){if(this.active===value)return;this.active=value;if(value){this.accumulator=0;this.onVisual(0,true);}else this.flush();}
    syncActiveElapsed(total:number){if(!Number.isFinite(total)||total<0)return;if(this.elapsedAnchor<0||total<this.elapsedAnchor){this.elapsedAnchor=total;return;}const delta=total-this.elapsedAnchor;this.elapsedAnchor=total;this.advanceActive(delta);}
    advanceActive(delta:number){if(!Number.isFinite(delta)||delta<=0||delta>3600)return;const changed=this.model.advance(delta);this.dirty=true;this.saveAge+=delta;this.visualTime+=Math.min(delta,.1);this.accumulator+=delta;
        const ticks=Math.floor((this.accumulator+1e-7)*30);if(this.active&&this.isVisible()&&ticks>0){const consumed=ticks/30;this.accumulator=Math.max(0,this.accumulator-consumed);this.onVisual(Math.min(consumed,.1),false);}if(changed||this.saveAge>=5)this.flush();
    }
    flush(){if(!this.persistence||!this.dirty)return true;if(!this.store.save(this.model,this.slot)){if(!this.persistenceFailed)this.onWarning(this.store.lastError);this.persistenceFailed=true;return false;}this.dirty=false;this.saveAge=0;return true;}
}
