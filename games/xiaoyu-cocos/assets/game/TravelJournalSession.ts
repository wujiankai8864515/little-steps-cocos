import { TravelService } from './TravelService';

// UI intent only. Durable review/training remains an exactly-once TravelService transaction.
export class TravelJournalSession {
    readonly tripId:string;
    index=0;
    choice='';
    private entryUid='';
    busy=false;
    constructor(readonly service:TravelService,readonly archive=false,tripId='') {
        const journals=service.model.data.journals;
        this.tripId=tripId||(archive?journals.filter((j:any)=>j.archived).slice(-1)[0]?.trip_id:service.model.pending_journals()[0]?.trip_id)||'';
        const journal=this.journal;
        if(journal&&!archive){const index=journal.entries.findIndex((e:any)=>!e.reviewed);this.index=Math.max(0,index);}
        this.sync();
    }
    get journal(){return this.service.model.data.journals.find((j:any)=>j.trip_id===this.tripId);}
    get entry(){return this.journal?.entries[this.index];}
    get readonly(){return this.archive||!this.entry||!!this.entry.reviewed;}
    get options(){const e=this.entry;return e?[...e.options.filter((o:any)=>o.id===e.choice),...e.options.filter((o:any)=>o.id!==e.choice)]:[];}
    sync(){
        this.index=Math.max(0,Math.min(this.index,(this.journal?.entries.length||1)-1));
        const uid=this.entry?.uid||'';
        if(uid!==this.entryUid||this.readonly){this.choice='';this.entryUid=uid;}
        if(this.choice&&!this.options.some((o:any)=>o.id===this.choice))this.choice='';
    }
    select(uid:string,choice:string){this.sync();if(this.busy||this.readonly||uid!==this.entryUid||!this.options.some((o:any)=>o.id===choice))return false;this.choice=choice;return true;}
    move(direction:number){if(this.busy||!this.journal)return false;const next=this.index+direction;if(!Number.isInteger(next)||next<0||next>=this.journal.entries.length)return false;this.index=next;this.sync();return true;}
    submit(uid:string):'ignored'|'failed'|'next'|'archived'{
        this.sync();if(this.busy||this.readonly||uid!==this.entryUid||!this.choice)return 'ignored';
        this.busy=true;
        try{
            if(!this.service.review(this.tripId,uid,this.choice)){this.sync();return 'failed';}
            this.choice='';if(this.journal?.archived)return 'archived';
            const next=this.journal?.entries.findIndex((e:any)=>!e.reviewed)??-1;
            if(next>=0)this.index=next;this.sync();return 'next';
        }finally{this.busy=false;}
    }
}
