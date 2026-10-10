// Product behavior from ambient_director.gd, rig_secondary_motion.gd and
// home_world.gd. Clip seconds are never rescaled to shorten the wind-up.
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
const limited=(v:number[],length:number)=>{const n=Math.hypot(...v);return n>length?v.map(x=>x/n*length):v.slice();};
export type Action='self_tap'|'rest'|'doze';
export class AmbientDirector {
    state:Action='self_tap';stateElapsed=0;fatigue=.2;dozeCooldown=0;restRemaining=0;
    tapSpeed=1.08;tapIdleSeconds=.28;minTapBout=10;minDoze=5;maxDoze=8;resumeDelay=.8;
    reason='default_tapping';transitions=0;completedTaps=0;nightContext=false;
    strength(){return [1,.975,1.035,.985,1.015][this.completedTaps%5];}
    speed(){return clamp(this.tapSpeed*[1,1.065,.965,1.035,.985][this.completedTaps%5],.75,1.35);}
    scores(night:boolean){return night?{self_tap:.08,doze:2+this.fatigue}:{self_tap:1.18-this.fatigue,doze:this.fatigue+.12+Math.min(this.stateElapsed/90,.15)};}
    private transition(state:Action,reason:string){this.state=state;this.stateElapsed=0;this.reason=reason;this.transitions++;}
    advance(delta:number,night:boolean,boundary:boolean){
        if(!Number.isFinite(delta)||delta<0)return;
        this.nightContext=night;this.stateElapsed+=delta;this.dozeCooldown=Math.max(0,this.dozeCooldown-delta);
        if(this.state==='rest'){
            this.restRemaining=Math.max(0,this.restRemaining-delta);
            if(this.restRemaining<=0){this.transition(night?'doze':'self_tap',night?'night_resume':'day_resume');if(night)this.fatigue=Math.max(this.fatigue,.45);}
        }else if(this.state==='doze'){
            if(night)this.fatigue=Math.max(.45,this.fatigue-delta*.04);
            else if(['nightfall','night_resume'].indexOf(this.reason)>=0){this.restRemaining=.65;this.transition('rest','dawn_waking');}
            else {this.fatigue=Math.max(0,this.fatigue-delta*.105);if(this.stateElapsed>=this.minDoze&&(this.fatigue<=.12||this.stateElapsed>=this.maxDoze)){this.dozeCooldown=8;this.transition('self_tap','day_microdoze_rested');}}
        }else{
            this.fatigue=Math.min(1,this.fatigue+delta*.028);
            if(night&&boundary){this.fatigue=Math.max(this.fatigue,.45);this.transition('doze','nightfall');}
            else if(!night&&boundary&&this.stateElapsed>=this.minTapBout&&this.dozeCooldown<=0){const utility=this.scores(false);if(utility.doze>utility.self_tap)this.transition('doze','day_microdoze');}
        }
    }
    request(action:Action){if(['rest','self_tap','doze'].indexOf(action)<0)return false;if(action==='rest')this.restRemaining=this.resumeDelay;if(action==='self_tap')this.dozeCooldown=Math.max(this.dozeCooldown,3);this.transition(action,'explicit_request');return true;}
    resumeAfterPlayer(){this.restRemaining=this.resumeDelay;this.dozeCooldown=Math.max(this.dozeCooldown,3);this.transition('rest','player_priority');}
    snapshot(){return {state:this.state,stateElapsed:this.stateElapsed,fatigue:this.fatigue,dozeCooldown:this.dozeCooldown,restRemaining:this.restRemaining,reason:this.reason,transitions:this.transitions,nightContext:this.nightContext,completedTaps:this.completedTaps,currentTapSpeed:this.speed(),tapStrength:this.strength(),tapIdleSeconds:this.tapIdleSeconds};}
}
export class SecondaryMotion {
    offset=[0,0,0,0];velocity=[0,0,0,0];lastSubsteps=0;blinkElapsed=0;blinkIndex=0;
    private limits=[.045,.14,.045,.07];private speedLimits=[.75,1.8,.8,1.1];
    reset(){this.offset=[0,0,0,0];this.velocity=[0,0,0,0];this.lastSubsteps=0;}
    private limit(){for(let i=0;i<4;i++){this.offset[i]=clamp(this.offset[i],-this.limits[i],this.limits[i]);this.velocity[i]=clamp(this.velocity[i],-this.speedLimits[i],this.speedLimits[i]);if(Math.abs(this.offset[i])>=this.limits[i]&&this.offset[i]*this.velocity[i]>0)this.velocity[i]=0;}}
    impulse(amount:number[]){if(!amount.every(Number.isFinite))return;this.velocity=this.velocity.map((v,i)=>v+amount[i]);this.limit();}
    advance(delta:number,target:number[]){
        if(!Number.isFinite(delta)||!target.every(Number.isFinite)){this.lastSubsteps=0;return this.offset.slice();}
        const bounded=clamp(delta,0,4/120);this.lastSubsteps=Math.min(Math.ceil(bounded*120),4);if(this.lastSubsteps===0)return this.offset.slice();
        const step=bounded/this.lastSubsteps,stiffness=[112,59,94,126],damping=[13.5,8,12,14],safe=target.map((v,i)=>clamp(v,-this.limits[i],this.limits[i]));
        for(let n=0;n<this.lastSubsteps;n++){for(let i=0;i<4;i++){this.velocity[i]+=((safe[i]-this.offset[i])*stiffness[i]-this.velocity[i]*damping[i])*step;this.offset[i]+=this.velocity[i]*step;}this.limit();}
        return this.offset.slice();
    }
    blink(delta:number){if(!Number.isFinite(delta))return false;this.blinkElapsed+=clamp(delta,0,.1);const interval=[4.1,5.4,3.7,6,4.8][this.blinkIndex%5];if(this.blinkElapsed>=interval+.13){this.blinkElapsed=0;this.blinkIndex++;return false;}return this.blinkElapsed>=interval;}
}
export type BehaviorFrame={poseTime:number;contact:boolean;offsets:number[];jelly:number[];mouth:number;gaze:number[];gazeTarget:string;gripRotation:number;closed:boolean;dozeMark:boolean;transition:boolean;step:number};
export class CharacterBehavior {
    readonly director=new AmbientDirector();readonly secondary=new SecondaryMotion();
    tapTime=0;contactSent=false;playerTapActive=false;playerSerial=0;playerHits=0;contacts=0;
    actionNumber=0;elapsed=0;hitReactionAge=-1;gaze=[0,0];nextDozeMarkTime=.45;
    resetPose(){this.playerTapActive=false;this.contactSent=false;this.secondary.reset();this.tapTime=0;this.hitReactionAge=-1;this.gaze=[0,0];}
    requestPlayerTap(){this.resetPose();this.director.request('self_tap');this.playerTapActive=true;this.playerSerial++;}
    focusLost(){this.playerTapActive=false;this.contactSent=false;this.tapTime=0;this.hitReactionAge=-1;}
    advance(delta:number,night:boolean):BehaviorFrame|null {
        if(!Number.isFinite(delta))return null;
        const step=clamp(delta,0,.1);this.elapsed+=delta;
        if(this.hitReactionAge>=0){this.hitReactionAge+=step;if(this.hitReactionAge>=.15)this.hitReactionAge=-1;}
        const before=this.director.state;let boundary=false,contact=false;
        if(before==='self_tap'){
            const previous=this.tapTime;this.tapTime+=step*this.director.speed();
            contact=!this.contactSent&&previous<1.29&&this.tapTime>=1.29;
            if(contact){this.contactSent=true;this.hitReactionAge=0;this.secondary.impulse([-.26,.8,-.18,.34].map(v=>v*this.director.strength()));}
            const cycle=this.playerTapActive?3.2:2.15+this.director.tapIdleSeconds*this.director.speed();boundary=this.tapTime>=cycle;
            if(boundary){this.tapTime%=cycle;this.contactSent=false;this.actionNumber++;this.director.completedTaps++;}
        }
        if(this.playerTapActive&&boundary){this.playerTapActive=false;this.director.resumeAfterPlayer();}
        else if(!this.playerTapActive)this.director.advance(step,night,boundary);
        const state=this.director.state,transition=before!==state;
        if(transition){this.tapTime=0;this.contactSent=false;this.nextDozeMarkTime=.45;}
        const poseTime=state==='self_tap'?(contact?1.29:this.tapTime):0;
        let target=[0,0,0,0],mouth=0,gaze=[-.45,.35],gazeTarget='player',gripRotation=0,dozeMark=false;
        if(state==='self_tap'){
            const anticipate=smooth(.38,1.08,poseTime)*(1-smooth(1.08,1.3,poseTime));
            const rebound=poseTime>=1.29?Math.sin(clamp((poseTime-1.29)/.7,0,1)*Math.PI*2)*(1-smooth(1.29,2.05,poseTime)):0;
            target=[-.022*anticipate+.013*rebound,-.075*anticipate-.06*rebound,-.014*anticipate,.03*rebound];gripRotation=(this.director.strength()-1)*.42*anticipate;
            mouth=-anticipate+2.6*Math.max(rebound,0)-.8*Math.min(rebound,0);
            if(this.hitReactionAge>=0){const t=smooth(.035,.14,this.hitReactionAge);mouth=-1.15+1.5*t;}
            if(!(this.actionNumber%3===2&&poseTime>2.1&&poseTime<2.85))gazeTarget=poseTime>1.22&&poseTime<1.72?'strike':'mallet';
        }else if(state==='doze'){
            if(this.director.stateElapsed>=this.nextDozeMarkTime){dozeMark=true;this.nextDozeMarkTime+=3.4;}
            const settle=smooth(0,.8,this.director.stateElapsed),wake=1-smooth(.08,.2,this.director.fatigue),sleepy=settle*(1-wake),breath=Math.sin(this.director.stateElapsed*1.7);
            target=[(.033+.009*breath)*sleepy,(-.058+.022*Math.sin(this.director.stateElapsed*1.7-.65))*sleepy,.017*sleepy,.033*sleepy];
            const yawn=Math.sin(clamp(this.director.stateElapsed/1.6,0,1)*Math.PI);mouth=(.6+2.1*yawn+.35*breath)*sleepy;gaze=[0,.8*sleepy];gazeTarget='doze';gripRotation=-.16*settle;
        }else target=[.003*Math.sin(this.elapsed*1.8),.018*Math.sin(this.elapsed*1.5),0,0];
        const offsets=this.secondary.advance(step,target);let jelly=limited([-offsets[0]*95,offsets[2]*55],5);
        if(state==='doze')jelly[1]=clamp(jelly[1]+3*smooth(0,.8,this.director.stateElapsed)+Math.sin(this.director.stateElapsed*1.7)*.65,-5,5);
        const blink=this.secondary.blink(step),impact=state==='self_tap'&&this.hitReactionAge>=0&&this.hitReactionAge<.05;
        const closed=state==='doze'?this.director.stateElapsed>.22&&this.director.fatigue>.11:blink||impact;
        if(contact){this.contacts++;if(this.playerTapActive)this.playerHits++;}
        return {poseTime,contact,offsets,jelly,mouth:clamp(mouth,-2.8,2.8),gaze,gazeTarget,gripRotation,closed,dozeMark,transition,step};
    }
    faceGaze(target:number[],step:number,closed:boolean){const t=1-Math.exp(-13*step);this.gaze=this.gaze.map((v,i)=>v+(target[i]-v)*t);return closed?[0,0]:limited(this.gaze,2.6);}
    snapshot(){return {tapTime:this.tapTime,elapsed:this.elapsed,contacts:this.contacts,playerTapActive:this.playerTapActive,playerSerial:this.playerSerial,playerHits:this.playerHits,hitReactionAge:this.hitReactionAge,gaze:this.gaze,secondaryOffsets:this.secondary.offset,springSubsteps:this.secondary.lastSubsteps,director:this.director.snapshot()};}
}
