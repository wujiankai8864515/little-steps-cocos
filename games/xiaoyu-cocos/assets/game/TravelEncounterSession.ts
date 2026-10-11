import { TravelService } from './TravelService';

// travel_page.gd's panel ownership and result lifetime. Persisted route/merit
// mutations remain in TravelService, including failed writes and CAS recovery.
export class TravelEncounterSession {
    eventUid='';choiceToken='';busy=false;elapsed=0;feedback='';private feedbackUntil=0;private tripId='';
    constructor(readonly service:TravelService){this.sync();}
    get event(){return this.eventUid?this.service.model.event_by_uid(this.eventUid):null;}
    ownsChoice(){const s=this.service.route_snapshot();return !!this.choiceToken&&s.clock_mode==='CHOICE_PAUSED'&&s.active_event_uid===this.eventUid&&s.choice_token===this.choiceToken;}
    private clearPanel(){this.eventUid='';this.choiceToken='';this.busy=false;}
    sync(){
        const tripId=this.service.model.trip().id||'';if(this.tripId!==tripId){this.tripId=tripId;this.feedback='';this.feedbackUntil=0;this.clearPanel();}
        if(!this.eventUid)return false;const e=this.event,valid=e&&((e.state==='manual'&&this.ownsChoice())||(e.state==='decided'&&!!this.service.model.chosen_option(e)?.id));
        if(valid)return false;this.clearPanel();return true;
    }
    enter(uid:string){
        this.sync();if(this.busy||this.eventUid)return false;const e=this.service.model.event_by_uid(uid);if(!e?.uid)return false;
        if(e.state!=='decided'&&!this.service.enter(uid)){this.sync();return false;}
        this.eventUid=uid;this.choiceToken=this.service.model.trip().choice_token||'';this.sync();return this.eventUid===uid;
    }
    releaseChoice(){
        if(this.event?.state==='manual'&&this.ownsChoice()){
            if(!this.service.cancel_event(this.eventUid,this.choiceToken)&&this.ownsChoice())return false;
        }
        this.clearPanel();return true;
    }
    choose(index:number,expectedUid=this.eventUid,expectedToken=this.choiceToken):'ignored'|'failed'|'chosen'{
        if(this.busy||!this.eventUid||this.eventUid!==expectedUid||this.choiceToken!==expectedToken)return 'ignored';
        if(this.sync()||!this.ownsChoice()||!Number.isInteger(index)||index<0||index>=this.event.options.length)return 'ignored';
        this.busy=true;const uid=this.eventUid;
        try{
            if(!this.service.choose(uid,index,this.choiceToken)){this.sync();return 'failed';}
            this.feedback=this.service.model.chosen_option(this.service.model.event_by_uid(uid)).result||'';this.feedbackUntil=this.elapsed+4;this.clearPanel();return 'chosen';
        }finally{this.busy=false;}
    }
    advance(delta:number){if(Number.isFinite(delta))this.elapsed+=Math.max(0,delta);const changed=this.sync();if(this.feedback&&this.elapsed>=this.feedbackUntil){this.feedback='';return true;}return changed;}
    back():'close'|'panel'|'failed'{if(this.eventUid)return this.releaseChoice()?'panel':'failed';return 'close';}
    suspend(){return this.releaseChoice();}
    snapshot(){return {tripId:this.tripId,eventUid:this.eventUid,choiceToken:this.choiceToken,feedback:this.feedback,elapsed:this.elapsed,busy:this.busy};}
}
