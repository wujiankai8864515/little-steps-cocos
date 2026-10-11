import { TravelModel, TRAVEL_CELL_SECONDS, TRAVEL_TOTAL_SECONDS } from './TravelModel';
import { TravelStore } from './TravelStore';

const copy=(value:any)=>JSON.parse(JSON.stringify(value));
const empty=(value:any)=>Object.keys(value).length===0;

// Durable product transactions and wall time are independent of page lifetime.
export class TravelService {
    model=new TravelModel(); store=new TravelStore();
    wall_clock:()=>number=()=>Date.now()/1000;
    loaded=false; blocked=false; last_error='';
    private lastAttemptAt=-Infinity;
    private recoveryPending=false;
    private recoveryTripId='';
    private recoveryChoiceToken='';
    private pendingRelease:any={};
    private changed=new Set<()=>void>();
    private failed=new Set<(reason:string)=>void>();
    subscribe(changed:()=>void,failed?:(reason:string)=>void){
        this.changed.add(changed);if(failed)this.failed.add(failed);
        return ()=>{this.changed.delete(changed);if(failed)this.failed.delete(failed);};
    }
    configure(slot='main',memoryOnly=false){
        this.store.slot=slot;this.store.memory_only=memoryOnly;
        const saved=this.store.load_state();this.model.data=empty(saved)?TravelModel.fresh():saved;
        this.blocked=!!this.store.error;this.loaded=true;this.pendingRelease={};this.lastAttemptAt=-Infinity;
        if(this.blocked){this.last_error=this.store.error;this.failed.forEach(handler=>handler(this.last_error));return;}
        const t=this.model.trip();this.recoveryPending=this.store.needs_migration||(!empty(t)&&t.clock_mode==='CHOICE_PAUSED');
        this.recoveryTripId=t.id||'';this.recoveryChoiceToken=t.choice_token||'';this.reconcile();
    }
    now(){return this.wall_clock();}
    route_snapshot(){
        const at=this.now(),t=this.model.trip();let elapsed=this.model.elapsed_at(at);
        if(!empty(this.pendingRelease)&&this.pendingRelease.token===(t.choice_token||''))elapsed=Math.max(0,Math.min(TRAVEL_TOTAL_SECONDS,t.route_elapsed_seconds+Math.max(0,at-this.pendingRelease.at)));
        return {route_elapsed_seconds:elapsed,route_progress:elapsed/TRAVEL_TOTAL_SECONDS,clock_mode:!empty(this.pendingRelease)?'RUNNING':t.clock_mode||'RUNNING',active_event_uid:t.active_event_uid||'',choice_token:t.choice_token||'',persistence_pending:this.recoveryPending||!empty(this.pendingRelease)||!!this.last_error};
    }
    snapshot(){const projection=this.route_snapshot(),trip=copy(this.model.trip());Object.assign(trip,{route_elapsed_seconds:projection.route_elapsed_seconds,route_progress:projection.route_progress,clock_mode:projection.clock_mode});return Object.assign({trip,data:copy(this.model.data)},projection);}
    private commit(before:any,mutated:boolean){
        if(!mutated)return false;
        if(!this.store.commit(this.model.data,Math.trunc(before.revision))){
            this.last_error=this.store.error;this.model.data=before;
            if(this.last_error==='stale_revision'){const newer=this.store.load_state();if(!empty(newer))this.model.data=newer;}
            this.failed.forEach(handler=>handler(this.last_error));this.changed.forEach(handler=>handler());return false;
        }
        this.last_error='';this.changed.forEach(handler=>handler());return true;
    }
    private available(){return this.loaded&&!this.blocked;}
    private applyRelease(){return !empty(this.pendingRelease)&&this.model.cancel_event(this.pendingRelease.uid,this.pendingRelease.at,this.pendingRelease.token);}
    reconcile(){
        if(!this.available())return false;const at=this.now();if(!Number.isFinite(at))return false;
        const t=this.model.trip(),stageDue=!empty(t)&&Math.floor(this.model.elapsed_at(at)/TRAVEL_CELL_SECONDS)>Math.trunc(t.revealed);
        if(at>=this.lastAttemptAt&&at-this.lastAttemptAt<1&&!stageDue&&empty(this.pendingRelease)&&!this.recoveryPending)return false;
        this.lastAttemptAt=at;const before=copy(this.model.data);let mutated=this.applyRelease();
        if(this.recoveryPending){
            const current=this.model.trip(),owns=this.recoveryChoiceToken!==''&&(current.id||'')===this.recoveryTripId&&(current.choice_token||'')===this.recoveryChoiceToken;
            mutated=(owns?this.model.recover_session(at):this.model.reconcile(at))||mutated||this.store.needs_migration;
        }else mutated=this.model.reconcile(at)||mutated;
        if(!mutated){this.pendingRelease={};this.recoveryPending=false;return false;}
        if(!this.commit(before,true))return false;this.pendingRelease={};this.recoveryPending=false;return true;
    }
    private prepareAction(){if(!this.available())return false;if(this.recoveryPending||!empty(this.pendingRelease)){this.reconcile();if(this.recoveryPending||!empty(this.pendingRelease))return false;}return true;}
    depart(merit:number,fatigue=.25,seed=-1){if(!this.prepareAction())return false;const before=copy(this.model.data),chosen=seed>=0?seed:1+Math.floor(Math.random()*2147483646);return this.commit(before,this.model.begin(this.now(),chosen,merit,fatigue));}
    enter(uid:string){
        if(!this.prepareAction())return false;const at=this.now(),before=copy(this.model.data),progressed=this.model.reconcile(at),t=this.model.trip(),already=t.active_event_uid===uid&&t.clock_mode==='CHOICE_PAUSED',acquired=this.model.enter_event(uid,at);
        if((progressed||(acquired&&!already))&&!this.commit(before,true))return false;return acquired;
    }
    choose(uid:string,index:number,token=''){if(!this.prepareAction())return false;const before=copy(this.model.data);return this.commit(before,this.model.choose(uid,index,this.now(),token));}
    cancel_event(uid='',token=''){
        if(!this.available())return false;if(!empty(this.pendingRelease))return this.reconcile();const t=this.model.trip(),target=uid||t.active_event_uid||'';if(!target||!this.model.owns_choice(target,token))return false;
        const at=this.now(),before=copy(this.model.data),captured=t.choice_token;
        if(this.commit(before,this.model.cancel_event(target,at,captured)))return true;this.pendingRelease={uid:target,token:captured,at};return false;
    }
    suspend(){return this.cancel_event();}
    private action(change:()=>boolean){if(!this.prepareAction())return false;const before=copy(this.model.data);return this.commit(before,change());}
    open_rewards(){return this.action(()=>this.model.open_rewards());}
    claim(){return this.open_rewards();}
    start_reward_flight(uid:string){return this.action(()=>this.model.start_reward_flight(uid,this.now()));}
    complete_reward_flight(uid:string){return this.action(()=>this.model.complete_reward_flight(uid,this.now()));}
    review(tripId:string,uid:string,choice:string){return this.action(()=>this.model.review(tripId,uid,choice));}
    page(index:number){return this.action(()=>this.model.set_page(index));}
    capture_merit(amount:number){if(!this.prepareAction()||empty(this.model.trip())||Math.trunc(this.model.data.merit)===amount)return;const before=copy(this.model.data);this.model.data.merit=Math.max(0,Math.trunc(amount));this.commit(before,true);}
}
