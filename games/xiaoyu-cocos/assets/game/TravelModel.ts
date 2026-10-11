import { core } from './Engine';

// Product state ported from current travel/travel_model.gd, schema2.
// No page visibility, rendering or storage policy owns this clock.
export const TRAVEL_CELL_SECONDS=10, TRAVEL_TOTAL_CELLS=10, TRAVEL_TOTAL_SECONDS=100, TRAVEL_SCHEMA=2;
const copy=(value:any)=>JSON.parse(JSON.stringify(value));
const dict=(value:any)=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const empty=(value:any)=>Object.keys(value).length===0;
const number=(value:any,minimum=0)=>typeof value==='number'&&Number.isFinite(value)&&value>=minimum;
const clamp=(value:number,minimum:number,maximum:number)=>Math.max(minimum,Math.min(maximum,value));
const own=(value:any,key:string)=>Object.prototype.hasOwnProperty.call(value,key);
const has=(values:any[],value:any)=>values.indexOf(value)>=0;
const amount=(values:any,key:string)=>own(values,key)?values[key]:0;
const bump=(values:any,key:string,delta:number)=>Object.defineProperty(values,key,{value:amount(values,key)+delta,writable:true,enumerable:true,configurable:true});

export class TravelModel {
    content:any={};
    data:any=TravelModel.fresh();
    static fresh(){return {schema:TRAVEL_SCHEMA,revision:0,sequence:0,observed_wall:0,merit:0,active:{},manual_tags:{},review_tags:{},manual_count:0,review_count:0,auto_count:0,journals:[],inventory:[],history:[],recent_events:[],recent_places:[]};}
    trip(){return this.data.active;}
    can_depart(){const t=this.trip();return empty(t)||(t.status==='returned'&&t.claimed);}
    load_content(){return ['events','places','items','departure'].every(key=>Array.isArray(this.content[key])&&this.content[key].length>0);}
    begin(now:number,seed:number,merit:number,fatigue=.25){
        if(!this.can_depart()||!Number.isFinite(now)||now<0||!this.load_content()||!Number.isSafeInteger(seed)||seed<0)return false;
        const previous=this.trip();
        if(!empty(previous)){this.data.history.push({id:previous.id,seed:previous.seed,returned_at:previous.returned_at,claimed:true});if(this.data.history.length>24)this.data.history.shift();}
        const rng=new core.PCG32(seed),pick=(values:any[])=>values[rng.range(0,values.length-1)];
        this.data.sequence=Math.trunc(this.data.sequence)+1;this.data.merit=Math.max(0,Math.trunc(merit));
        const start=Math.max(now,this.data.observed_wall);this.data.observed_wall=start;
        const id=`trip_${this.data.sequence}_${seed}`,count=rng.range(2,3),positions:number[]=[];
        while(positions.length<count){const at=rng.range(1,8);if(!has(positions,at))positions.push(at);}positions.sort((a,b)=>a-b);
        const pool=copy(this.content.events),chosen=[pool.shift()];
        while(chosen.length<count){const fresh=pool.filter((event:any)=>!has(this.data.recent_events,event.id));const event=pick(fresh.length?fresh:pool);chosen.push(event);pool.splice(pool.indexOf(event),1);}
        const cells:any[]=[],events:any[]=[];let last='';
        for(let index=0;index<TRAVEL_TOTAL_CELLS;index++){
            const eventIndex=positions.indexOf(index),definition=eventIndex>=0?chosen[eventIndex]:{};
            const places=this.content.places.filter((place:any)=>empty(definition)||definition.requires.some((tag:string)=>has(place.tags,tag)));
            let unused=places.filter((place:any)=>place.id!==last&&!has(this.data.recent_places,place.id));if(!unused.length)unused=places.filter((place:any)=>place.id!==last);
            const place=copy(pick(unused.length?unused:places));last=place.id;
            const cell={index,place,kind:empty(definition)?'scenery':'event',event_id:'',caption:place.caption};
            if(!empty(definition)){
                const event=Object.assign(copy(definition),{uid:id+':'+index,cell:index,place,appears_at:start+(index+1)*TRAVEL_CELL_SECONDS,reached_seconds:(index+1)*TRAVEL_CELL_SECONDS,state:'hidden',source:'',choice:'',settled:false,settled_at:0,merit_spent:0,state_before:{},reason:'',reviewed:false,review_choice:''});
                cell.event_id=event.uid;events.push(event);
            }cells.push(cell);
        }
        let items=copy(this.content.items.filter((item:any)=>item.id==='doll'||cells.some(cell=>cell.place.name===item.place)));
        const rewards:any[]=[],rewardCount=rng.range(2,Math.min(4,items.length));
        for(let index=0;index<rewardCount;index++){const item=copy(pick(items));items=items.filter((entry:any)=>entry.id!==item.id);Object.assign(item,{uid:id+':reward:'+index,state:'FLOATING',flight_started_at:0,collected_at:0});rewards.push(item);}
        this.data.active={id,seed,started_at:start,last_wall:start,revealed:0,page:0,status:'traveling',route_elapsed_seconds:0,clock_mode:'RUNNING',active_event_uid:'',choice_token:'',choice_sequence:0,rewards_opened:false,terminal_committed:false,terminal_uid:id+':terminal',cells,events,energy:clamp(1-fatigue,0,1),mood:.55,rewards,claimed:false,returned_at:0,journal_created:false,settlement_order:[],departure_text:pick(this.content.departure)};
        this.data.recent_events=chosen.map(event=>event.id);this.data.recent_places=cells.slice(7,10).map(cell=>cell.place.id);return true;
    }
    event_by_uid(uid:string){return (this.trip().events||[]).find((event:any)=>event.uid===uid)||{};}
    elapsed_at(at:number){const t=this.trip();if(empty(t))return 0;if(t.status==='returned')return TRAVEL_TOTAL_SECONDS;return clamp(t.route_elapsed_seconds+(t.clock_mode==='RUNNING'&&Number.isFinite(at)?Math.max(0,at-t.last_wall):0),0,TRAVEL_TOTAL_SECONDS);}
    elapsed_at_unclamped(at:number){const t=this.trip();return t.route_elapsed_seconds+(t.clock_mode==='RUNNING'?Math.max(0,at-t.last_wall):0);}
    private safe_now(at:number){return Math.max(at,this.data.observed_wall,this.trip().last_wall);}
    reconcile(at:number){
        const t=this.trip();if(empty(t)||t.status!=='traveling'||!Number.isFinite(at))return false;
        const now=this.safe_now(at),uncapped=this.elapsed_at_unclamped(now),elapsed=clamp(uncapped,0,TRAVEL_TOTAL_SECONDS);
        let changed=elapsed!==t.route_elapsed_seconds||now!==t.last_wall;t.route_elapsed_seconds=elapsed;t.last_wall=now;this.data.observed_wall=now;t.revealed=Math.min(TRAVEL_TOTAL_CELLS,Math.floor(elapsed/TRAVEL_CELL_SECONDS));
        for(const event of t.events)if(event.state==='hidden'&&event.reached_seconds<=elapsed){event.state='waiting';changed=true;}
        if(elapsed>=TRAVEL_TOTAL_SECONDS&&t.clock_mode==='RUNNING'){
            const pending=t.events.slice().sort((a:any,b:any)=>a.cell!==b.cell?a.cell-b.cell:a.uid<b.uid?-1:a.uid>b.uid?1:0),terminal=now-Math.max(0,uncapped-TRAVEL_TOTAL_SECONDS);
            for(const event of pending)if(!event.settled){const decision=this.score_options(event);this.settle(event,decision.index,'auto',terminal,decision.reason);}
            t.status='returned';t.returned_at=terminal;t.terminal_committed=true;this.make_journal();changed=true;
        }return changed;
    }
    recover_session(at:number){
        const t=this.trip();if(empty(t))return false;const released=t.active_event_uid!=='';
        if(released){const event=this.event_by_uid(t.active_event_uid);if(!empty(event)&&!event.settled)event.state='waiting';t.active_event_uid='';t.choice_token='';t.clock_mode='RUNNING';}
        return this.reconcile(at)||released;
    }
    enter_event(uid:string,at:number){
        if(!Number.isFinite(at))return false;this.reconcile(at);const t=this.trip();if(empty(t)||t.status!=='traveling')return false;
        const event=this.event_by_uid(uid);if(empty(event))return false;if(t.clock_mode==='CHOICE_PAUSED')return t.active_event_uid===uid&&event.state==='manual';
        if(event.state!=='waiting'||t.route_elapsed_seconds>=TRAVEL_TOTAL_SECONDS)return false;
        t.choice_sequence=Math.trunc(t.choice_sequence)+1;t.choice_token=t.id+':choice:'+t.choice_sequence;t.active_event_uid=uid;t.clock_mode='CHOICE_PAUSED';event.state='manual';event.entered_at=this.safe_now(at);return true;
    }
    owns_choice(uid:string,token=''){const t=this.trip();return !empty(t)&&t.status==='traveling'&&t.clock_mode==='CHOICE_PAUSED'&&t.active_event_uid===uid&&(!token||token===t.choice_token);}
    cancel_event(uid:string,at:number,token=''){
        const t=this.trip();if(empty(t)||!Number.isFinite(at))return false;const target=uid||t.active_event_uid;if(!target||!this.owns_choice(target,token))return false;
        this.reconcile(at);const event=this.event_by_uid(target);if(!empty(event)&&!event.settled)event.state='waiting';t.active_event_uid='';t.choice_token='';t.clock_mode='RUNNING';return true;
    }
    choose(uid:string,index:number,at:number,token=''){
        if(!Number.isFinite(at)||!this.owns_choice(uid,token))return false;const event=this.event_by_uid(uid);if(empty(event)||event.state!=='manual'||!Number.isInteger(index)||index<0||index>=event.options.length)return false;
        this.reconcile(at);this.settle(event,index,'manual',this.safe_now(at),'玩家亲自选择');this.cancel_event(uid,at,token);return true;
    }
    score_options(event:any){
        const scores:number[]=[],personality={help:.45,gentle:.32,curious:.3,rest:.18,steady:.25,brave:.1,company:.28,generous:.22,practical:.2,plan:.15};let best=-Infinity,index=0;
        for(let i=0;i<event.options.length;i++){const option=event.options[i];let score=0;for(const tag of option.tags){score+=amount(personality,tag);score+=Math.min(2,amount(this.data.manual_tags,tag)*.13);score+=clamp(amount(this.data.review_tags,tag)*.18,-1,2);}score+=option.energy*(1-this.trip().energy)*3;score+=option.mood*(1-this.trip().mood)*2;if(option.cost>0&&this.data.merit<option.cost)score-=.35;scores.push(score);if(score>best){best=score;index=i;}}
        return {index,scores,reason:event.options[index].reason};
    }
    private settle(event:any,index:number,source:string,at:number,reason:string){
        if(event.settled)return;const option=event.options[index],t=this.trip();event.state_before={energy:t.energy,mood:t.mood,merit:this.data.merit,manual_count:this.data.manual_count,review_count:this.data.review_count};event.choice=option.id;event.source=source;event.reason=reason;event.merit_spent=Math.min(Math.trunc(this.data.merit),Math.trunc(option.cost));this.data.merit=Math.max(0,this.data.merit-event.merit_spent);t.energy=clamp(t.energy+option.energy,0,1);t.mood=clamp(t.mood+option.mood,0,1);event.settled=true;event.settled_at=at;event.state='decided';t.settlement_order.push(event.uid);
        if(source==='manual'){for(const tag of option.tags)bump(this.data.manual_tags,tag,1);this.data.manual_count++;}else this.data.auto_count++;
    }
    chosen_option(event:any){return event.options.find((option:any)=>option.id===event.choice)||{};}
    private make_journal(){
        const t=this.trip();if(t.journal_created)return;t.journal_created=true;const entries=t.events.filter((event:any)=>event.source==='auto').map((event:any)=>Object.assign(copy(event),{diary_text:this.chosen_option(event).diary,emotion:event.state_before.energy<.4?'那会儿有点累，想慢慢来。':'那会儿精神还好，心里有一点期待。'}));
        if(entries.length)this.data.journals.push({trip_id:t.id,returned_at:t.returned_at,entries,archived:false,page:0});
    }
    claim_rewards(){return this.open_rewards();}
    open_rewards(){const t=this.trip();if(empty(t)||t.status!=='returned'||t.claimed||t.rewards_opened)return false;t.rewards_opened=true;return true;}
    reward_by_uid(uid:string){return (this.trip().rewards||[]).find((item:any)=>item.uid===uid)||{};}
    start_reward_flight(uid:string,at:number){const t=this.trip();if(empty(t)||t.status!=='returned'||!t.rewards_opened||!Number.isFinite(at))return false;const item=this.reward_by_uid(uid);if(empty(item)||item.state!=='FLOATING')return false;item.state='FLYING';item.flight_started_at=Math.max(at,t.returned_at);return true;}
    complete_reward_flight(uid:string,at:number){const t=this.trip();if(empty(t)||t.status!=='returned'||!Number.isFinite(at))return false;const item=this.reward_by_uid(uid);if(empty(item)||item.state!=='FLYING')return false;item.state='COLLECTED';item.collected_at=Math.max(at,item.flight_started_at);if(!this.data.inventory.some((old:any)=>old.uid===uid))this.data.inventory.push(copy(item));t.claimed=t.rewards.every((reward:any)=>reward.state==='COLLECTED');return true;}
    review(tripId:string,uid:string,preferred:string){
        for(const journal of this.data.journals){if(journal.trip_id!==tripId||journal.archived)continue;for(const event of journal.entries){if(event.uid!==uid||event.reviewed)continue;const option=event.options.find((candidate:any)=>candidate.id===preferred);if(!option)return false;event.reviewed=true;event.review_choice=preferred;event.feedback_uid='feedback:'+event.uid;for(const tag of option.tags)bump(this.data.review_tags,tag,1);if(preferred!==event.choice)for(const tag of this.chosen_option(event).tags)bump(this.data.review_tags,tag,-.35);this.data.review_count++;journal.archived=journal.entries.every((entry:any)=>entry.reviewed);return true;}}return false;
    }
    set_page(page:number){const t=this.trip();if(empty(t))return false;const next=clamp(Math.trunc(page),0,4);if(next===t.page)return false;t.page=next;return true;}
    pending_journals(){return this.data.journals.filter((journal:any)=>!journal.archived);}
    static migrate(saved:any){
        if(!dict(saved)||!number(saved.schema))return {};if(saved.schema===TRAVEL_SCHEMA)return TravelModel.valid(saved)?copy(saved):{};if(saved.schema!==1||!TravelModel.valid_common(saved))return {};
        const next=copy(saved),t=next.active;if(!empty(t)){
            if(!TravelModel.valid_trip_base(t))return {};
            Object.assign(t,{route_elapsed_seconds:t.status==='returned'?TRAVEL_TOTAL_SECONDS:clamp(Math.max(t.revealed*TRAVEL_CELL_SECONDS,t.last_wall-t.started_at),0,TRAVEL_TOTAL_SECONDS),clock_mode:'RUNNING',active_event_uid:'',choice_token:'',choice_sequence:0,rewards_opened:t.claimed,terminal_committed:t.status==='returned',terminal_uid:t.id+':terminal',migrated_from_schema:1});
            for(const event of t.events){delete event.deadline;event.reached_seconds=Math.min(90,(event.cell+1)*TRAVEL_CELL_SECONDS);if(!event.settled)event.state=t.route_elapsed_seconds>=event.reached_seconds?'waiting':'hidden';delete event.entered_at;}
            for(const item of t.rewards){const owned=next.inventory.some((old:any)=>old.uid===item.uid);item.state=t.claimed||owned?'COLLECTED':'FLOATING';item.flight_started_at=0;item.collected_at=item.state==='COLLECTED'?t.returned_at:0;if(item.state==='COLLECTED'&&!owned)next.inventory.push(copy(item));}
            t.claimed=t.rewards.every((item:any)=>item.state==='COLLECTED');if(t.claimed)t.rewards_opened=true;
        }for(const journal of next.journals)for(const event of journal.entries)delete event.deadline;next.schema=TRAVEL_SCHEMA;return TravelModel.valid(next)?next:{};
    }
    private static valid_item(item:any){return dict(item)&&['uid','id','name','category','place','description'].every(key=>typeof item[key]==='string'&&item[key]!=='')&&number(item.art)&&Math.trunc(item.art)<=3;}
    private static valid_place(place:any){return dict(place)&&['id','name','caption'].every(key=>typeof place[key]==='string')&&number(place.art)&&Array.isArray(place.tags);}
    private static valid_options(event:any){
        if(!Array.isArray(event.options)||event.options.length<2)return false;const ids=new Set();
        for(const option of event.options){if(!dict(option)||!['id','text','reason','diary','result'].every(key=>typeof option[key]==='string')||!option.id||ids.has(option.id)||!Array.isArray(option.tags)||!option.tags.every((tag:any)=>typeof tag==='string')||!number(option.cost)||!number(option.energy,-1)||!number(option.mood,-1))return false;ids.add(option.id);}return true;
    }
    private static valid_event(event:any){
        if(!dict(event)||!['uid','state','source','choice','reason','review_choice','text','title'].every(key=>typeof event[key]==='string')||!event.uid||typeof event.settled!=='boolean'||typeof event.reviewed!=='boolean'||!dict(event.state_before)||!TravelModel.valid_place(event.place)||!TravelModel.valid_options(event)||!['cell','appears_at','settled_at','merit_spent'].every(key=>number(event[key]))||Math.trunc(event.cell)>9||!has(['hidden','waiting','manual','decided'],event.state))return false;
        if(event.settled){if(event.state!=='decided'||!has(['manual','auto'],event.source)||!event.options.some((option:any)=>option.id===event.choice)||!number(event.state_before.energy)||!number(event.state_before.mood))return false;}else if(event.state==='decided'||event.choice!=='')return false;
        return !event.reviewed||event.options.some((option:any)=>option.id===event.review_choice);
    }
    private static valid_common(saved:any){
        if(!dict(saved)||!['revision','sequence','observed_wall','merit','manual_count','review_count','auto_count'].every(key=>number(saved[key]))||!['active','manual_tags','review_tags'].every(key=>dict(saved[key]))||!['journals','inventory','history','recent_events','recent_places'].every(key=>Array.isArray(saved[key])))return false;
        for(const tags of [saved.manual_tags,saved.review_tags])if(!Object.keys(tags).every(key=>number(tags[key],-Infinity)))return false;
        const inventoryIds=new Set(),journalIds=new Set();for(const item of saved.inventory){if(!TravelModel.valid_item(item)||inventoryIds.has(item.uid))return false;inventoryIds.add(item.uid);}
        for(const journal of saved.journals){if(!dict(journal)||typeof journal.trip_id!=='string'||journalIds.has(journal.trip_id)||typeof journal.archived!=='boolean'||!Array.isArray(journal.entries)||!number(journal.returned_at))return false;journalIds.add(journal.trip_id);const entryIds=new Set();for(const event of journal.entries){if(!TravelModel.valid_event(event)||entryIds.has(event.uid)||event.source!=='auto'||!event.settled||typeof event.diary_text!=='string'||typeof event.emotion!=='string')return false;entryIds.add(event.uid);}if(journal.archived!==journal.entries.every((event:any)=>event.reviewed))return false;}return true;
    }
    private static valid_trip_base(t:any){
        if(!['id','status','departure_text'].every(key=>typeof t[key]==='string')||!['seed','started_at','last_wall','revealed','page','returned_at','energy','mood'].every(key=>number(t[key]))||!['claimed','journal_created'].every(key=>typeof t[key]==='boolean')||!Array.isArray(t.cells)||t.cells.length!==TRAVEL_TOTAL_CELLS||!Array.isArray(t.events)||!has([2,3],t.events.length)||!Array.isArray(t.rewards)||!t.rewards.length||!Array.isArray(t.settlement_order)||!has(['traveling','returned'],t.status)||Math.trunc(t.revealed)>10||Math.trunc(t.page)>4||t.last_wall<t.started_at)return false;
        const ids=new Map(),cells=new Set();for(const event of t.events){if(!TravelModel.valid_event(event)||ids.has(event.uid)||cells.has(Math.trunc(event.cell)))return false;ids.set(event.uid,Math.trunc(event.cell));cells.add(Math.trunc(event.cell));}
        for(let index=0;index<TRAVEL_TOTAL_CELLS;index++){const cell=t.cells[index];if(!dict(cell)||!number(cell.index)||Math.trunc(cell.index)!==index||!TravelModel.valid_place(cell.place)||typeof cell.caption!=='string'||!has(['scenery','event'],cell.kind)||typeof cell.event_id!=='string'||(cell.kind==='event'&&(!ids.has(cell.event_id)||ids.get(cell.event_id)!==index)))return false;}
        const rewards=new Set();for(const item of t.rewards){if(!TravelModel.valid_item(item)||rewards.has(item.uid))return false;rewards.add(item.uid);}return true;
    }
    static valid(saved:any){
        if(!dict(saved)||saved.schema!==TRAVEL_SCHEMA||!TravelModel.valid_common(saved))return false;const t=saved.active;if(empty(t))return true;if(!TravelModel.valid_trip_base(t)||!['route_elapsed_seconds','choice_sequence'].every(key=>number(t[key]))||t.route_elapsed_seconds>TRAVEL_TOTAL_SECONDS||Math.trunc(t.revealed)!==Math.floor(t.route_elapsed_seconds/TRAVEL_CELL_SECONDS)||!['rewards_opened','terminal_committed'].every(key=>typeof t[key]==='boolean')||!has(['RUNNING','CHOICE_PAUSED'],t.clock_mode)||!['active_event_uid','choice_token','terminal_uid'].every(key=>typeof t[key]==='string'))return false;
        const manual:string[]=[],settled:string[]=[];for(const event of t.events){if(!number(event.reached_seconds)||event.reached_seconds>90||own(event,'deadline'))return false;if(event.state==='manual')manual.push(event.uid);if(event.settled)settled.push(event.uid);}
        if(t.clock_mode==='CHOICE_PAUSED'){if(t.status!=='traveling'||manual.length!==1||manual[0]!==t.active_event_uid||!t.choice_token)return false;}else if(manual.length||t.active_event_uid||t.choice_token)return false;
        const order=new Set();for(const uid of t.settlement_order){if(!has(settled,uid)||order.has(uid))return false;order.add(uid);}if(order.size!==settled.length)return false;
        if(t.status==='returned'&&(!t.terminal_committed||settled.length!==t.events.length||!t.journal_created||t.route_elapsed_seconds!==TRAVEL_TOTAL_SECONDS))return false;
        for(const item of t.rewards){if(!has(['FLOATING','FLYING','COLLECTED'],item.state)||!number(item.flight_started_at)||!number(item.collected_at))return false;const owned=saved.inventory.some((old:any)=>old.uid===item.uid);if((item.state==='COLLECTED')!==owned||(item.state!=='FLOATING'&&!t.rewards_opened))return false;}return t.claimed===t.rewards.every((item:any)=>item.state==='COLLECTED');
    }
}
