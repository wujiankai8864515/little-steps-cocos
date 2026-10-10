// Original incense_burn_store.gd + independent_incense.gd state rules.
// Engine storage, drawing and real clocks are injected; no frame-time expiry.
export type BurnState={schema:number;revision:number;duration:number;remaining:number;burn_count:number;started_unix:number;deadline_unix:number;saved_unix:number};
const keys=['schema','revision','duration','remaining','burn_count','started_unix','deadline_unix','saved_unix'];
const number=(v:any,a:number,b:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
export function validBurn(v:any):v is BurnState {
    if(!v||typeof v!=='object'||Object.keys(v).length!==8||keys.some(k=>!Object.prototype.hasOwnProperty.call(v,k))||v.schema!==1)return false;
    if(!['revision','burn_count'].every(k=>number(v[k],0,1e12)&&Number.isInteger(v[k]))||!number(v.duration,.001,86400)||!number(v.remaining,0,v.duration)||!['started_unix','deadline_unix','saved_unix'].every(k=>number(v[k],0,1e12)))return false;
    return v.remaining===0||(v.burn_count>0&&v.started_unix>0&&Math.abs(v.deadline_unix-v.started_unix-v.duration)<=.001&&v.saved_unix+.01>=v.started_unix&&v.remaining<=Math.max(0,v.deadline_unix-v.saved_unix)+.05);
}
export function newerBurn(a:BurnState,b:BurnState){if(!a)return false;if(!b)return true;for(const k of ['revision','started_unix','burn_count','saved_unix'])if(a[k]!==b[k])return a[k]>b[k];return a.remaining<b.remaining;}
export function burnAtTime(v:BurnState,now:number):BurnState {return v?{...v,remaining:now+1<v.saved_unix?0:Math.min(v.remaining,Math.max(0,v.deadline_unix-now))}:null;}
const runtime=new Map<string,BurnState>();
export class IncenseStore {
    lastError='';lastSource='';lastCommittedRevision=-1;private unsupported=false;
    constructor(private checkpoint:any){}
    private validSlot(slot:string){return /^[a-z0-9_-]{1,48}$/.test(slot);}
    private remember(slot:string,data:BurnState){if(!newerBurn(data,runtime.get(slot)))return;if(!runtime.has(slot)&&runtime.size>=64)runtime.delete(runtime.keys().next().value);runtime.set(slot,{...data});}
    private latest(slot:string){let best:BurnState=null;this.unsupported=false;this.lastSource='';const records=this.checkpoint.read('travel_woodfish:home_incense:'+slot);this.lastError=this.checkpoint.lastError;
        for(const item of records){if(number(item.data.schema,2,1e12))this.unsupported=true;if(validBurn(item.data)&&newerBurn(item.data,best)){best=item.data;this.lastSource=item.source;}}
        if(this.unsupported)this.lastError='unsupported_saved_schema';else if(!best&&records.length&&!this.lastError)this.lastError='no_valid_saved_generation';return best;
    }
    load(slot:string,now:number){this.lastError='';if(!this.validSlot(slot)||!Number.isFinite(now)){this.lastError='invalid_save_slot_or_clock';return null;}const best=this.latest(slot);if(best)this.remember(slot,best);if(best&&now+1<best.saved_unix)this.lastError='clock_rollback_expired_incense';return burnAtTime(best,now);}
    shared(slot:string,now:number){return burnAtTime(runtime.get(slot),now);}
    save(slot:string,data:BurnState){this.lastError='';this.lastCommittedRevision=-1;if(!this.validSlot(slot)||!validBurn(data)){this.lastError='invalid_save_state_or_slot';return false;}let current=this.latest(slot);if(this.unsupported)return false;const shared=runtime.get(slot);if(newerBurn(shared,current))current=shared;if(current&&data.revision<=current.revision){this.lastError='stale_save_revision';return false;}
        const saved=this.checkpoint.write('travel_woodfish:home_incense:'+slot,data);this.lastError=this.checkpoint.lastError;if(this.checkpoint.committed){this.lastCommittedRevision=data.revision;this.remember(slot,data);}return saved;
    }
}
export class IncenseState {
    remaining=0;duration=30;burnCount=0;revision=0;started=0;deadline=0;visualTime=0;smokeTail=0;hintRest=0;hintAlpha=0;hintExitAge=0;hintExitAlpha=0;private hintBurning=false;private saveAge=0;private tick=0;private restored=false;
    persistenceFailed=false;onStarted=()=>{};onFinished=()=>{};onWarning=(reason:string)=>{};onAdvance=(delta:number,previousRemaining:number)=>{};
    constructor(private store:IncenseStore,private wall:()=>number,private monotonic:()=>number,private slot='incense_v1',private configuredDuration=30){if(!number(configuredDuration,.001,86400))this.configuredDuration=30;this.duration=this.configuredDuration;this.restore();this.tick=this.monotonic();}
    get burning(){return this.remaining>0;}get fraction(){return Math.max(0,Math.min(1,this.remaining/this.duration));}get stickLength(){return 224*this.fraction;}get ignition(){return this.burning?Math.max(0,Math.min(1,1-(this.duration-this.remaining)/.85)):0;}
    private warn(reason:string){if(reason){if(!this.persistenceFailed)this.onWarning(reason);this.persistenceFailed=true;}}
    private adopt(data:BurnState){const same=this.started>0&&this.started===data.started_unix&&this.burnCount===data.burn_count;this.remaining=same?Math.min(this.remaining,data.remaining):data.remaining;this.revision=data.revision;this.burnCount=data.burn_count;this.started=data.started_unix;this.deadline=data.deadline_unix;if(this.burning){this.duration=data.duration;this.restored=true;}this.smokeTail=this.burning?5.6:0;}
    private restore(){let data=this.store.load(this.slot,this.wall()),shared=this.store.shared(this.slot,this.wall());if(newerBurn(shared,data))data=shared;if(data)this.adopt(data);this.warn(this.store.lastError);}
    private sync(){const data=this.store.shared(this.slot,this.wall());if(data&&data.revision>this.revision){this.adopt(data);this.tick=this.monotonic();}}
    ignite(){this.restore();this.sync();if(this.burning)return false;if(this.restored){this.duration=this.configuredDuration;this.restored=false;}this.remaining=this.duration;this.burnCount++;this.smokeTail=5.6;this.tick=this.monotonic();this.started=this.wall();this.deadline=this.started+this.duration;this.hintRest=0;this.flush();this.onStarted();return true;}
    advanceClock(){this.sync();const now=this.monotonic();if(!Number.isFinite(now))return;let delta=Math.max(0,(now-this.tick)/1000);this.tick=now;if(this.burning&&this.deadline>0)delta=Math.max(delta,this.remaining-Math.max(0,this.deadline-this.wall()));this.advance(delta);}
    advance(delta:number){if(!Number.isFinite(delta)||delta<=0)return;const burning=this.burning,previous=this.remaining;if(burning){this.remaining=Math.max(0,this.remaining-delta);this.smokeTail=Math.max(0,5.6-Math.max(0,delta-previous));if(!this.burning){this.hintRest=0;this.flush();this.onFinished();}}else this.smokeTail=Math.max(0,this.smokeTail-delta);
        this.onAdvance(delta,previous);this.visualTime=(this.visualTime+delta)%600;this.updateHint(burning&&!this.burning?Math.max(0,delta-previous):delta);this.saveAge+=delta;if(this.burning&&this.saveAge>=1)this.flush();
    }
    updateHint(delta:number){if(this.burning){this.hintRest=0;if(!this.hintBurning){this.hintExitAge=0;this.hintExitAlpha=this.hintAlpha;}this.hintExitAge=Math.min(.18,this.hintExitAge+delta);this.hintAlpha=this.hintExitAlpha*(1-smooth(0,.18,this.hintExitAge));}else{if(this.hintBurning)this.hintRest=0;this.hintRest=Math.min(2.05,this.hintRest+delta);this.hintAlpha=smooth(0,.18,Math.max(0,this.hintRest-1.2));}this.hintBurning=this.burning;}
    get hintAge(){return Math.max(0,this.hintRest-1.2);}get hintY(){return -168+21*(.85-this.hintAge)+Math.sin(this.hintAge*1.45)*2.2;}
    merit(){this.advanceClock();return this.burning?2:1;}
    flush(){const data:BurnState={schema:1,revision:this.revision+1,duration:this.duration,remaining:this.remaining,burn_count:this.burnCount,started_unix:this.started,deadline_unix:this.deadline,saved_unix:this.wall()},saved=this.store.save(this.slot,data);this.saveAge=0;this.revision=Math.max(this.revision,this.store.lastCommittedRevision);if(!saved){if(this.store.lastError==='stale_save_revision'){this.restore();this.sync();}else this.warn(this.store.lastError);}else this.persistenceFailed=false;return saved;}
    snapshot(){return {remaining:this.remaining,duration:this.duration,burnCount:this.burnCount,revision:this.revision,burning:this.burning,merit:this.burning?2:1,visualTime:this.visualTime,smokeTail:this.smokeTail,hintAlpha:this.hintAlpha,hintAge:this.hintAge,persistenceFailed:this.persistenceFailed};}
}
export function smooth(a:number,b:number,v:number){const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);}
