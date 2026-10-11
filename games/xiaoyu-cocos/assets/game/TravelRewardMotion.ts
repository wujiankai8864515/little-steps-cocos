import { TravelService } from './TravelService';
import { CHEST_TARGET, FLIGHT_SECONDS, REWARD_ORIGIN, clamp01, cubic, mix, rewardFan } from './TravelHomeRules';
export type RewardPose={uid:string;art:number;index:number;position:number[];scale:number;alpha:number;visible:boolean;flightAge:number;flightStart:number[];retryAge:number};
// Animation owns no reward grant. Every flight/collection is a durable service
// transaction; a failed final write retries the same uid without duplicating it.
export class TravelRewardMotion {
    readonly poses=new Map<string,RewardPose>();
    openedTrip='';ejectionAge=0;clock=0;
    constructor(private service:TravelService){}
    advance(delta:number){
        if(!Number.isFinite(delta)||delta<0)return;this.clock+=delta;
        const trip=this.service.model.trip(),opened=trip.status==='returned'&&!trip.claimed&&trip.rewards_opened;
        if(!opened){this.poses.clear();this.openedTrip='';return;}
        if(this.openedTrip!==trip.id){this.poses.clear();this.openedTrip=trip.id;this.ejectionAge=0;}
        this.ejectionAge+=delta;
        for(let index=0;index<trip.rewards.length;index++){
            const item=trip.rewards[index],uid=item.uid;
            if(item.state==='COLLECTED'){this.poses.delete(uid);continue;}
            let visual=this.poses.get(uid);
            if(!visual){visual={uid,art:item.art,index,position:REWARD_ORIGIN.slice(),scale:1,alpha:1,visible:false,flightAge:-1,flightStart:[0,0],retryAge:0};this.poses.set(uid,visual);}
            const base=rewardFan(index,trip.rewards.length),appear=clamp01((this.ejectionAge-index*.36)/.55);
            visual.visible=appear>0||item.state==='FLYING';
            if(item.state==='FLYING'){
                if(visual.flightAge<0){visual.flightAge=0;visual.flightStart=(visual.visible&&appear>0?visual.position:base).slice();}
                visual.flightAge+=delta;const t=clamp01(visual.flightAge/FLIGHT_SECONDS),p=visual.flightStart;
                visual.position=cubic(p,[p[0]-90,p[1]-230],[CHEST_TARGET[0]+100,CHEST_TARGET[1]-180],CHEST_TARGET,t);visual.scale=1-.78*t;visual.alpha=1-Math.max(0,(t-.85)/.15);
                if(t>=1){visual.retryAge+=delta;if(visual.retryAge>=.35){visual.retryAge=0;this.service.complete_reward_flight(uid);}}
            }else{
                visual.position=mix(REWARD_ORIGIN,base,1-(1-appear)**3);visual.position[1]+=Math.sin(this.clock*1.8+index*1.9)*3*appear;visual.scale=.45+.55*appear;visual.alpha=appear;
            }
        }
    }
    hit(at:number[]){if(!at.every(Number.isFinite))return '';for(const [uid,p] of this.poses){if(!p.visible||p.flightAge>=0||this.ejectionAge<p.index*.36+.55)continue;if(at[0]>=p.position[0]-37&&at[0]<p.position[0]+37&&at[1]>=p.position[1]-37&&at[1]<p.position[1]+37)return uid;}return '';}
    collect(uid:string){return !!uid&&this.service.start_reward_flight(uid);}
    snapshot(){return {openedTrip:this.openedTrip,ejectionAge:this.ejectionAge,clock:this.clock,poses:Array.from(this.poses.values()).map(p=>({...p,position:p.position.slice()}))};}
}
