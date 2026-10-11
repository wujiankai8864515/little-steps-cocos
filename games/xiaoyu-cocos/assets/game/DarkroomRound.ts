import { DollSkin } from './DollSkin';

// Original darkroom_world.gd's manual round/attack clock and pointer ownership.
export type DarkTool='needle'|'slipper';
export type DarkPhase='active'|'clear_out'|'gap_1s'|'spawn_in'|'ready_full';
export const DARKROOM_READY='布偶已安置妥当，随时为你解忧。';
export const DARKROOM_RESULT='晦气消除、乳腺通畅';
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
const lerp=(a:number[],b:number[],t:number)=>a.map((v,i)=>v+(b[i]-v)*t);
const distance=(a:number[],b:number[])=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function darkToolPose(tool:DarkTool,time:number,target:number[]){
    const duration=tool==='needle'?.64:.82;let position:number[],rotation:number;
    if(tool==='needle'){
        const rest=[target[0]+139,target[1]-77],windup=[target[0]+166,target[1]-94];
        if(time<.1)position=lerp(rest,windup,smooth(0,.1,time));
        else if(time<.25)position=lerp(windup,target,clamp((time-.1)/.15,0,1)**2);
        else if(time<.31)position=[target[0]-2*Math.sin((time-.25)/.06*Math.PI),target[1]+Math.sin((time-.25)/.06*Math.PI)];
        else position=lerp(target,rest,smooth(.31,duration,time));rotation=-.1;
    }else{
        const rest=[target[0]+141,target[1]-121],windup=[target[0]+177,target[1]-166];let u:number;
        if(time<.17){u=smooth(0,.17,time);position=lerp(rest,windup,u);rotation=-.23+(-.72+.23)*u;}
        else if(time<.34){u=clamp((time-.17)/.17,0,1)**2;position=lerp(windup,target,u);rotation=-.72+(.16+.72)*u;}
        else{u=smooth(.37,duration,time);position=lerp(target,rest,u);position[1]-=Math.sin(u*Math.PI)*17;rotation=.16+(-.23-.16)*u;}
    }
    return {position,rotation,alpha:smooth(0,.065,time)*(1-smooth(duration-.16,duration,time)),scale:tool==='needle'?.185:.15,pivot:tool==='needle'?[349,813]:[1030,445]};
}
export class DarkroomRound {
    phase:DarkPhase='active';misfortune=100;displayedMisfortune=100;selected:DarkTool='needle';
    clearProgress=0;spawnProgress=1;gapRemaining=0;completedRounds=0;roundSerial=1;
    inputEnabled=false;active=true;dollVisible=true;attackTime=-1;attackTool:DarkTool='needle';
    attackTarget=[398,638];pendingTarget=[398,638];contactPart='torso';contactSent=false;queuedAttack=false;contacts=0;
    clearTime=-1;resultVisible=false;recoilTime=10;idleTime=0;dissolve=0;spawnAlpha=1;
    pointer:number|null=null;pointerDragged=false;pointerOrigin=[0,0];pointerLast=[0,0];dragOffset=[0,0];dragTarget=[0,0];
    rootRest=[363,809];rootVelocity=[0,0];dragBounds=[12,12,696,1256];
    readonly events:Array<{kind:string;[key:string]:any}>=[];
    constructor(readonly rig:DollSkin){}
    acceptsInput(){return this.phase==='active'||this.phase==='ready_full';}
    select(tool:DarkTool){if(!this.inputEnabled||!this.acceptsInput())return false;this.selected=tool;this.events.push({kind:'selection',tool});return true;}
    strike(){
        if(!this.inputEnabled||!this.acceptsInput()||this.pointerDragged)return false;
        if(this.attackTime>=0){this.queuedAttack=true;return true;}
        if(this.phase==='ready_full')this.setPhase('active');this.attackTool=this.selected;this.attackTarget=this.pendingTarget.slice();
        if(!this.rig.partAt(this.attackTarget))this.attackTarget=this.rig.worldPoint(this.rig.contract.parts.torso.source_pivot);
        this.contactPart=this.rig.partAt(this.attackTarget);this.attackTime=0;this.contactSent=false;return true;
    }
    beginPointer(id:number,at:number[]){
        if(!this.inputEnabled||this.pointer!==null||!at.every(Number.isFinite))return false;
        if(this.acceptsInput()&&this.dollVisible&&this.rig.partAt(at)){
            this.pointer=id;this.pointerDragged=false;this.pointerOrigin=at.slice();this.pointerLast=at.slice();this.dragOffset=this.rig.root.map((v,i)=>v-at[i]);return true;
        }
        return false;
    }
    movePointer(id:number,at:number[]){
        if(this.pointer!==id||!at.every(Number.isFinite))return false;this.pointerLast=at.slice();
        if(!this.pointerDragged&&distance(at,this.pointerOrigin)>=9){this.pointerDragged=true;this.queuedAttack=false;this.attackTime=-1;this.rig.setDragging(true);}
        if(this.pointerDragged)this.dragTarget=at.map((v,i)=>v+this.dragOffset[i]);return true;
    }
    endPointer(id:number,at:number[],canceled=false){
        if(this.pointer!==id)return false;const dragged=this.pointerDragged||distance(at,this.pointerOrigin)>=9;
        this.pointer=null;this.pointerDragged=false;this.rig.setDragging(false);this.rootRest=this.rig.root.slice();this.rig.groundY=this.rig.footSupportY();this.rootVelocity=[0,0];
        if(!canceled&&!dragged&&this.rig.partAt(at)){this.pendingTarget=at.slice();this.strike();}return true;
    }
    cancel(){if(this.pointer!==null)this.endPointer(this.pointer,this.pointerLast,true);this.queuedAttack=false;this.attackTime=-1;}
    advance(delta:number){
        if(!this.active||!Number.isFinite(delta))return;
        const duration=Math.max(delta,0),count=clamp(Math.ceil(duration*60),1,4);
        for(let i=0;i<count;i++)this.step(duration/count);
        this.poseDoll(duration);
    }
    private step(delta:number){
        this.idleTime+=delta;this.recoilTime+=delta;
        this.displayedMisfortune+=clamp(this.misfortune-this.displayedMisfortune,-delta*90,delta*90);
        if(this.attackTime>=0){
            const before=this.attackTime;this.attackTime+=delta;const impact=this.attackTool==='needle'?.25:.34;
            if(!this.contactSent&&before<impact&&this.attackTime>=impact)this.onContact();
            if(this.attackTime>=(this.attackTool==='needle'?.64:.82)){this.attackTime=-1;if(this.queuedAttack&&this.acceptsInput()){this.queuedAttack=false;this.strike();}}
        }
        const before=this.phase,animationDelta=Math.min(delta,1/15);
        if(this.phase==='clear_out'){
            this.clearProgress=Math.min(1,this.clearProgress+animationDelta/2.85);
            if(this.clearProgress>=1){this.dissolve=1;this.dollVisible=false;this.attackTime=-1;this.queuedAttack=false;this.gapRemaining=1;this.completedRounds++;this.setPhase('gap_1s');this.events.push({kind:'finished',text:DARKROOM_RESULT,contacts:this.contacts,misfortune:0,reward:0,round_serial:this.roundSerial});}
        }else if(this.phase==='spawn_in'){
            this.spawnProgress=Math.min(1,this.spawnProgress+animationDelta/1.55);
            if(this.spawnProgress>=1){this.spawnAlpha=1;this.setPhase('ready_full');this.events.push({kind:'ready',text:DARKROOM_READY});}
        }
        if(this.phase==='clear_out'){
            this.clearTime=this.clearProgress*2.85;this.dissolve=smooth(.1,1,this.clearProgress);
            if(this.clearProgress>=.36&&this.displayedMisfortune<=.01&&!this.resultVisible){this.resultVisible=true;this.events.push({kind:'result',text:DARKROOM_RESULT});}
        }else if(this.phase==='gap_1s'&&before==='gap_1s'){
            this.gapRemaining=Math.max(0,this.gapRemaining-delta);if(this.gapRemaining<=0)this.beginSpawn();
        }else if(this.phase==='spawn_in')this.spawnAlpha=smooth(0,1,this.spawnProgress);
    }
    private onContact(){
        if(this.contactSent||!this.acceptsInput())return;this.contactSent=true;this.contacts++;this.recoilTime=0;
        const removed=Math.min(this.misfortune,this.attackTool==='needle'?10:20);this.misfortune=Math.max(0,this.misfortune-removed);
        this.rig.applyContact(this.attackTool,this.attackTarget);this.events.push({kind:'contact',tool:this.attackTool,removed,at:this.attackTarget.slice()});
        if(this.misfortune<=0){this.setPhase('clear_out');this.queuedAttack=false;this.clearProgress=0;this.clearTime=0;this.rig.setExpression('relief');this.events.push({kind:'release',at:[this.rig.root[0],this.rig.root[1]-48]});}
    }
    private poseDoll(delta:number){
        const duration=clamp(delta,0,1/30),previous=this.rootVelocity.slice(),root=this.rig.root;
        if(this.pointerDragged){
            const error=root.map((v,i)=>v-this.dragTarget[i]),helper=this.rootVelocity.map((v,i)=>v+error[i]*24),decay=Math.exp(-24*duration);
            this.rig.root=this.dragTarget.map((v,i)=>v+(error[i]+helper[i]*duration)*decay);
            this.rootVelocity=this.rootVelocity.map((v,i)=>(v-helper[i]*24*duration)*decay);
        }else{this.rootVelocity=this.rootVelocity.map(v=>v*Math.exp(-14*duration));this.rig.root=lerp(root,this.rootRest,1-Math.exp(-22*duration));}
        const recoil=Math.exp(-this.recoilTime*8.4),power=this.attackTool==='slipper'?1:.35,twitch=Math.sin(this.recoilTime*49)*recoil*power;
        this.rig.rootRotation=twitch*.1+clamp(-this.rootVelocity[0]*.00016,-.16,.16);
        this.rig.advance(duration,this.rootVelocity.map((v,i)=>(v-previous[i])/Math.max(duration,.001)));
        if(!this.pointerDragged){const error=this.rig.groundY-this.rig.footSupportY();this.rig.root[1]+=error<0?error:error*(1-Math.exp(-16*duration));}
        const bounds=this.rig.bounds(),allowed=this.dragBounds,shift=[0,0];
        for(let i=0;i<2;i++)if(bounds[i]<allowed[i])shift[i]=allowed[i]-bounds[i];else if(bounds[i]+bounds[i+2]>allowed[i]+allowed[i+2])shift[i]=allowed[i]+allowed[i+2]-bounds[i]-bounds[i+2];
        this.rig.root=this.rig.root.map((v,i)=>v+shift[i]);if(!this.pointerDragged)this.rig.groundY+=shift[1];
        shift.forEach((v,i)=>{if(Math.abs(v)>.01)this.rootVelocity[i]=0;});if(!this.pointerDragged)this.rootRest=this.rig.root.slice();
        const feet=this.rig.footSupportY();if(this.pointerDragged&&feet>this.rig.groundY)this.rig.groundY=feet;
        this.rig.supportLift=this.pointerDragged?Math.max(0,this.rig.groundY-feet):0;
    }
    private setPhase(phase:DarkPhase){this.phase=phase;this.events.push({kind:'phase',phase});}
    private resetDoll(){this.rootRest=[363,809];this.rig.root=this.rootRest.slice();this.rig.rootRotation=0;this.rootVelocity=[0,0];this.rig.reset();this.rig.groundY=this.rig.footSupportY();this.contacts=0;this.contactSent=false;this.clearTime=-1;this.clearProgress=0;this.resultVisible=false;this.recoilTime=10;this.dissolve=0;this.dollVisible=true;this.misfortune=100;this.displayedMisfortune=100;}
    private beginSpawn(){
        if(this.phase!=='gap_1s')return;this.cancel();this.roundSerial++;this.resetDoll();this.spawnProgress=0;this.spawnAlpha=0;this.setPhase('spawn_in');this.events.push({kind:'spawn',at:[this.rig.root[0],this.rig.root[1]-120],seconds:1.55});
    }
    restart(){this.cancel();this.resetDoll();this.phase='active';this.gapRemaining=0;this.spawnProgress=1;this.spawnAlpha=1;this.selected='needle';this.events.push({kind:'restart'});}
    drainEvents(){return this.events.splice(0);}
    snapshot(){return {state:this.phase,misfortune:this.misfortune,displayed_misfortune:this.displayedMisfortune,selected_tool:this.selected,attack_time:this.attackTime,contacts:this.contacts,round_serial:this.roundSerial,completed_rounds:this.completedRounds,gap_remaining:this.gapRemaining,clear_progress:this.clearProgress,spawn_progress:this.spawnProgress,doll_visible:this.dollVisible,clear_time:this.clearTime,pointer_pressed:this.pointer!==null,dragging:this.pointerDragged,result_text:DARKROOM_RESULT,economy_mutations:0,rig:this.rig.snapshot()};}
}
