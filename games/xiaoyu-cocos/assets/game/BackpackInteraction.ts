// Bag branch of the original HomeInteractionController. Rendering, alpha
// picking, presentation and the shared note belong to the supplied game port.
export interface BackpackInputPort {
    hit(point:number[]):boolean;visibleRect():number[];anchor():number[];home():number[];
    bounds():number[];setAnchor(at:number[],lift:number,depth:number):void;
    validDrop(at:number[]):boolean;fishGround():number[];
    present(active:boolean):void;interruptReturn():void;restoreWall():void;captureSettle():void;settleTransform(amount:number):void;
    suspend():void;resume():void;wear():void;restoreWorn(immediate:boolean):void;
    offer():void;dismissOffer(immediate:boolean):void;pulse(at:number[],accepted?:boolean):void;hold(at:number[],fraction:number):void;clear():void;
}
const finite=(p:number[])=>p.length===2&&p.every(Number.isFinite);
const sub=(a:number[],b:number[])=>a.map((v,i)=>v-b[i]);
const near=(a:number[],b:number[])=>Math.hypot(...sub(a,b))<.00001;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(v,b));
export class BackpackInteraction {
    state:'IDLE'|'PRESSED'|'DRAGGING'|'SETTLING'='IDLE';captured:number=null;offered=false;dropEvaluations=0;
    anchor:number[];lift=0;private press:number[];private pointer:number[];private pressAnchor:number[];private held=0;
    private settleTime=0;private settleFrom:number[];private settleTo:number[];private dropOffer=false;private suspended=false;
    constructor(private port:BackpackInputPort){this.anchor=port.anchor().slice();}
    down(id:number,at:number[]){
        const r=this.port.visibleRect();if(this.captured!==null||this.state==='SETTLING'||this.offered||!finite(at)||at[0]<r[0]||at[1]<r[1]||at[0]>=r[0]+r[2]||at[1]>=r[1]+r[3]||!this.port.hit(at))return false;
        this.port.interruptReturn();this.anchor=this.port.anchor().slice();this.pressAnchor=this.anchor.slice();this.press=at.slice();this.pointer=at.slice();this.held=0;this.captured=id;this.state='PRESSED';return true;
    }
    move(id:number,at:number[]){
        if(id!==this.captured||!finite(at))return false;this.pointer=at.slice();
        if(this.state==='PRESSED'&&Math.hypot(...sub(at,this.press))>9)this.startDrag();
        if(this.state==='DRAGGING')this.setAnchor(this.constrain(this.pressAnchor.map((v,i)=>v+at[i]-this.press[i])),5);
        return true;
    }
    up(id:number,at:number[]){
        if(id!==this.captured)return false;if(!finite(at))return this.cancelPointer(id);this.move(id,at);this.captured=null;this.port.hold(at,0);
        if(this.state==='DRAGGING'){
            const fish=this.port.fishGround();this.dropOffer=at[0]>=fish[0]-190&&at[0]<fish[0]+190&&at[1]>=fish[1]-270&&at[1]<fish[1]+20;
            this.beginSettle(this.port.validDrop(this.anchor)&&!this.dropOffer);
        }else{this.state='IDLE';if(Math.hypot(...sub(at,this.press))<=9)this.port.pulse(at);}
        return true;
    }
    cancelPointer(id:number){if(id!==this.captured)return false;this.cancel(false);return true;}
    cancel(immediate=true){
        this.captured=null;this.port.hold(this.pointer||[0,0],0);this.resolveOffer(true);this.dropOffer=false;
        if(!immediate&&(this.state==='DRAGGING'||this.state==='SETTLING')){this.beginSettle(false);return;}
        if(this.state==='DRAGGING'||this.state==='SETTLING'){this.port.present(false);this.state='IDLE';this.setAnchor(this.port.home(),0);this.port.restoreWall();}
        this.state='IDLE';this.lift=0;if(immediate)this.port.clear();
    }
    resolveOffer(immediate=false){if(!this.offered)return false;this.offered=false;this.port.dismissOffer(immediate);this.port.restoreWorn(immediate);this.anchor=this.port.home().slice();if(this.suspended){this.port.resume();this.suspended=false;}return true;}
    commitOffer(){if(!this.offered)return false;this.offered=false;this.captured=null;this.state='IDLE';this.dropOffer=false;this.port.dismissOffer(false);this.port.clear();this.port.present(false);return true;}
    advance(delta:number){
        if(!Number.isFinite(delta))return;const dt=clamp(delta,0,.1);
        if(this.state==='PRESSED'){this.held+=dt;this.port.hold(this.pointer,Math.min(this.held/.34,1)*.98);if(this.held>=.34)this.startDrag();}
        else if(this.state==='DRAGGING')this.setAnchor(this.constrain(this.anchor),5);
        else if(this.state==='SETTLING'){
            this.settleTime+=dt;const t=Math.min(1,this.settleTime/.36),e=t*t*(3-2*t);this.setAnchor(this.settleFrom.map((v,i)=>v+(this.settleTo[i]-v)*e),5*(1-e));if(!this.dropOffer)this.port.settleTransform(e);
            if(t>=1){this.port.present(false);this.state='IDLE';this.setAnchor(this.settleTo,0);if(!this.dropOffer)this.port.restoreWall();this.dropEvaluations++;const offered=this.dropOffer;this.dropOffer=false;this.anchor=this.port.home().slice();if(offered){this.offered=true;this.port.suspend();this.suspended=true;this.port.wear();this.port.offer();}}
        }
    }
    private startDrag(){this.state='DRAGGING';this.port.present(true);this.port.hold(this.pointer,0);this.port.pulse(this.pointer);this.setAnchor(this.anchor,5);}
    private setAnchor(at:number[],lift:number){this.anchor=at.slice();this.lift=lift;const y=at[1],floorDepth=Math.round(y<951?5+7*(y-862)/89:y<1012?12+3*(y-951)/61:15+5*(y-1012)/207),depth=this.state==='DRAGGING'||this.state==='SETTLING'?180:near(at,this.port.home())?-10:y>=750?floorDepth:-10;this.port.setAnchor(this.anchor,lift,depth);}
    private constrain(at:number[]){
        const safe=this.port.visibleRect(),bounds=this.port.bounds();return at.map((v,i)=>{const offset=bounds[i]-this.anchor[i]+(i===1?this.lift-5:0),low=safe[i]+18-offset,high=safe[i]+safe[i+2]-18-offset-bounds[i+2];return low<=high?clamp(v,low,high):(low+high)/2;});
    }
    private beginSettle(valid:boolean){this.settleFrom=this.anchor.slice();this.settleTo=this.dropOffer?this.port.fishGround().map((v,i)=>v+[-122,-83][i]):this.port.home().slice();this.port.captureSettle();this.settleTime=0;this.state='SETTLING';this.port.pulse(this.pointer,valid||this.dropOffer);}
    snapshot(){return {state:this.state,capturedPointer:this.captured,anchor:this.anchor,lift:this.lift,heldSeconds:this.held,dropOffer:this.dropOffer,offered:this.offered,ambientSuspended:this.suspended,dropEvaluations:this.dropEvaluations,settleTime:this.settleTime};}
}
