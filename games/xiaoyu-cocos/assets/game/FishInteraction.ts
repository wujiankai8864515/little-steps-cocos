// The fish branch of home_interaction_controller.gd. Prop ownership and offers
// use separate adapters; no engine or pointer-emulation dependencies here.
export interface FishPort {
    hit(point:number[]):boolean;position():number[];bounds():number[];visibleRect():number[];validDrop(point:number[]):boolean;
    suspend():void;resume():void;tap():void;beginLift(point:number[]):number[];lift(amount:number,delta:number,lag:number[]):void;grip():number[];
    setAnchor(ground:number[],lift:number):void;present(active:boolean):void;land(impact:number):void;
    pulse(point:number[],accepted?:boolean):void;hold(point:number[],fraction:number):void;clear():void;
}
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const add=(a:number[],b:number[])=>a.map((v,i)=>v+b[i]),sub=(a:number[],b:number[])=>a.map((v,i)=>v-b[i]);
const distance=(a:number[],b:number[])=>Math.hypot(...sub(a,b));
export class FishInteraction {
    state:'IDLE'|'PRESSED'|'DRAGGING'|'SETTLING'='IDLE';captured:number=null;ground=[350,951];height=0;dropEvaluations=0;
    private press=[0,0];private pointer=[0,0];private pressAnchor=[350,951];private requested=[350,951];private held=0;private eligible=true;private elapsed=0;private lastPointerTime=0;
    private grab=[0,0];private amount=0;private lag=[0,0];private maxLift=0;private settleTime=0;private settleFrom=[350,951];private settleHeight=0;private suspended=false;
    constructor(private port:FishPort){}
    down(id:number,at:number[]){
        const r=this.port.visibleRect();if(this.captured!==null||this.state==='SETTLING'||!at.every(Number.isFinite)||at[0]<r[0]||at[1]<r[1]||at[0]>=r[0]+r[2]||at[1]>=r[1]+r[3]||!this.port.hit(at))return false;
        this.captured=id;this.press=at.slice();this.pointer=at.slice();this.pressAnchor=this.ground.slice();this.requested=this.ground.slice();this.held=0;this.eligible=true;this.lastPointerTime=this.elapsed;this.port.suspend();this.suspended=true;this.state='PRESSED';return true;
    }
    move(id:number,at:number[]){
        if(id!==this.captured||!at.every(Number.isFinite))return false;const delta=sub(at,this.pointer);this.pointer=at.slice();
        if(this.state==='PRESSED'&&distance(at,this.press)>9)this.eligible=false;
        if(this.state==='DRAGGING'){const dt=clamp(this.elapsed-this.lastPointerTime,1/120,.1),length=Math.hypot(...delta);if(length*length>.0001){const lag=delta.map(v=>-v/dt*.035),n=Math.hypot(...lag);this.lag=n>10?lag.map(v=>v/n*10):lag;}this.lastPointerTime=this.elapsed;this.moveGrip();}return true;
    }
    up(id:number,at:number[]){
        if(id!==this.captured)return false;if(!at.every(Number.isFinite))return this.cancelPointer(id);this.move(id,at);this.captured=null;this.port.hold(at,0);
        if(this.state==='DRAGGING')this.settle(this.port.validDrop(this.requested));
        else{const tapped=distance(at,this.press)<=9;this.state='IDLE';this.resume();if(tapped){this.port.pulse(at);this.port.tap();}}return true;
    }
    cancelPointer(id:number){if(id!==this.captured)return false;this.cancel(false);return true;}
    cancel(immediate=true){
        this.captured=null;this.port.hold(this.pointer,0);
        if(!immediate&&(this.state==='DRAGGING'||this.state==='SETTLING')){this.settle(false);return;}
        this.port.present(false);this.state='IDLE';this.setAnchor([350,951],0);this.resume();this.amount=0;this.lag=[0,0];this.maxLift=0;this.port.clear();
    }
    advance(delta:number){
        if(!Number.isFinite(delta))return;const dt=clamp(delta,0,.1);this.elapsed+=dt;
        if(this.state==='PRESSED'){this.held+=dt;if(this.eligible){this.port.hold(this.pointer,Math.min(this.held/.34,1)*.98);if(this.held>=.34){this.state='DRAGGING';this.port.present(true);this.port.hold(this.pointer,0);this.port.pulse(this.pointer);this.amount=0;this.lag=[0,0];this.maxLift=0;this.grab=this.port.beginLift(this.pointer);this.moveGrip();}}}
        else if(this.state==='DRAGGING'){this.amount=Math.min(1,this.amount+dt*4);this.applyLift(this.amount,dt);this.moveGrip();this.lag=this.lag.map(v=>v*Math.exp(-dt*5));}
        else if(this.state==='SETTLING'){this.settleTime+=dt;const t=Math.min(1,this.settleTime/.36),eased=t*t*(3-2*t);this.setAnchor(this.settleFrom.map((v,i)=>v+([350,951][i]-v)*eased),this.settleHeight*(1-eased));this.applyLift((1-eased)*this.amount,dt);if(t>=1){this.port.present(false);this.state='IDLE';this.setAnchor([350,951],0);this.dropEvaluations++;this.resume();if(this.maxLift>.5)this.port.land(clamp(this.maxLift/100,.3,1));}}
    }
    private resume(){if(this.suspended){this.port.resume();this.suspended=false;}}
    private setAnchor(point:number[],lift:number){this.ground=point.slice();this.height=lift;this.port.setAnchor(this.ground,lift);}
    private applyLift(amount:number,dt:number){const t=clamp(this.height/40,0,1);this.port.lift(amount*t*t*(3-2*t),dt,this.lag);}
    private clampRoot(proposed:number[]){const bounds=this.port.bounds(),root=this.port.position(),r=this.port.visibleRect();return proposed.map((v,i)=>{const low=r[i]+12-(bounds[i]-root[i]),high=r[i]+r[i+2]-12-(bounds[i]+bounds[i+2]-root[i]);return low<=high?clamp(v,low,high):(low+high)/2;});}
    private moveGrip(){
        const desired=sub(this.pointer,this.grab),root=this.clampRoot(desired),safe=add(this.pointer,sub(root,desired));
        const locate=(at:number[])=>{const foot=add(at,[335,336]),height=Math.max(0,this.pressAnchor[1]-foot[1]);this.setAnchor(add(foot,[0,height]),height);};locate(root);
        const correction=sub(safe,this.port.grip());if(correction.reduce((s,v)=>s+v*v,0)>1e-8)locate(this.clampRoot(add(this.port.position(),correction)));
        this.requested=this.ground.slice();this.maxLift=Math.max(this.maxLift,this.height);
    }
    private settle(accepted:boolean){this.settleFrom=this.ground.slice();this.settleHeight=this.height;this.settleTime=0;this.state='SETTLING';this.port.pulse(this.pointer,accepted);}
    snapshot(){return {state:this.state,capturedPointer:this.captured,ground:this.ground,height:this.height,heldSeconds:this.held,longPressEligible:this.eligible,grabAmount:this.amount,maxLift:this.maxLift,lag:this.lag,dropEvaluations:this.dropEvaluations};}
}
