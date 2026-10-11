// Remaining original prop branches; rendering and physical geometry are ports.
export type PropId='doll'|'bowl'|'low_table';
export interface HomePropPort {
    hit(at:number[]):PropId;visibleRect():number[];home(id:PropId):number[];bounds(id:PropId):number[];
    setAnchor(id:PropId,at:number[],lift:number,depth:number):void;validDrop(id:PropId,at:number[]):boolean;fishGround():number[];
    present(id:PropId,active:boolean):void;captureSettle(id:PropId):void;settleTransform(id:PropId,amount:number):void;restore(id:PropId):void;
    actorAvailable?():boolean;
    suspend():void;resume():void;resetFish():void;drinkStart():void;drinkAdvance(age:number,delta:number):void;drinkStop(preserveFish:boolean):void;
    offer(id:PropId):void;dismissOffer(immediate:boolean):void;prepareDoll():void;
    pulse(at:number[],accepted?:boolean):void;hold(at:number[],fraction:number):void;clear():void;
}
const finite=(at:number[])=>at&&at.length===2&&at.every(Number.isFinite);
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const near=(a:number[],b:number[])=>Math.hypot(a[0]-b[0],a[1]-b[1])<.00001;
type Anchor={home:number[];position:number[];generation:number;ownership:number;content:number;owner:'world'|'player'};
export class HomePropInteraction {
    state:'IDLE'|'PRESSED'|'DRAGGING'|'SETTLING'='IDLE';captured:number=null;selected:PropId=null;offered:PropId=null;dropEvaluations=0;drinkCount=0;lastContextStop='';
    private anchors=new Map<PropId,Anchor>();private press:number[];private pointer:number[];private pressAnchor:number[];private held=0;private lift=0;
    private settleFrom:number[];private settleTo:number[];private settleAge=0;private dropOffer:PropId=null;private suspended=false;
    private drink:{age:number;generation:number;ownership:number;content:number}=null;
    constructor(private port:HomePropPort){for(const id of ['doll','bowl','low_table'] as PropId[]){const at=port.home(id).slice();this.anchors.set(id,{home:at,position:at.slice(),generation:1,ownership:0,content:0,owner:'world'});}}
    anchor(id:PropId){return this.anchors.get(id).position.slice();}
    down(pointer:number,at:number[]){
        const r=this.port.visibleRect();if(this.captured!==null||this.state==='SETTLING'||this.offered||!finite(at)||at[0]<r[0]||at[1]<r[1]||at[0]>=r[0]+r[2]||at[1]>=r[1]+r[3])return false;
        const id=this.port.hit(at);if(!id)return false;if(this.drink&&id==='bowl')this.cancelDrink('target_grabbed');
        this.selected=id;this.captured=pointer;this.press=at.slice();this.pointer=at.slice();this.pressAnchor=this.anchor(id);this.held=0;this.state='PRESSED';if(id==='doll')this.port.prepareDoll();return true;
    }
    move(pointer:number,at:number[]){if(pointer!==this.captured||!finite(at))return false;this.pointer=at.slice();if(this.state==='PRESSED'&&Math.hypot(at[0]-this.press[0],at[1]-this.press[1])>9)this.startDrag();if(this.state==='DRAGGING')this.setAnchor(this.constrain(this.pressAnchor.map((v,i)=>v+at[i]-this.press[i])),5);return true;}
    up(pointer:number,at:number[]){if(pointer!==this.captured)return false;if(!finite(at))return this.cancelPointer(pointer);this.move(pointer,at);this.captured=null;this.port.hold(at,0);
        if(this.state==='DRAGGING'){const fish=this.port.fishGround();this.dropOffer=this.port.actorAvailable?.()!==false&&this.selected!=='low_table'&&at[0]>=fish[0]-190&&at[0]<fish[0]+190&&at[1]>=fish[1]-270&&at[1]<fish[1]+20?this.selected:null;this.beginSettle(this.port.validDrop(this.selected,this.anchor(this.selected))&&!this.dropOffer);}
        else{const id=this.selected,tapped=Math.hypot(at[0]-this.press[0],at[1]-this.press[1])<=9;this.state='IDLE';this.selected=null;if(tapped){this.port.pulse(at);if(id==='bowl')this.requestDrink();}}
        return true;
    }
    cancelPointer(pointer:number){if(pointer!==this.captured)return false;if(this.state==='PRESSED'&&!this.suspended){this.captured=null;this.selected=null;this.state='IDLE';this.port.hold(this.pointer,0);return true;}this.cancel('pointer_cancelled',false);return true;}
    cancel(reason='page_exit',immediate=true){this.captured=null;this.port.hold(this.pointer||[0,0],0);this.resolveOffer(true);this.dropOffer=null;this.cancelDrink(reason);if(!immediate&&(this.state==='DRAGGING'||this.state==='SETTLING')){this.beginSettle(false);return;}if(this.selected){const id=this.selected;this.port.present(id,false);this.state='IDLE';this.setAnchor(this.port.home(id),0);this.release(id);this.port.restore(id);}this.selected=null;this.state='IDLE';this.lift=0;if(immediate)this.port.clear();this.resume();}
    resolveOffer(immediate=false){if(!this.offered)return false;const id=this.offered;this.offered=null;this.port.dismissOffer(immediate);this.port.restore(id);this.resume();return true;}
    requestDrink(){if(this.state!=='IDLE'||this.port.actorAvailable?.()===false)return false;this.cancelDrink('new_drink');const a=this.anchors.get('bowl');if(a.owner!=='world')return false;this.suspend();this.port.resetFish();this.port.drinkStart();this.drink={age:0,generation:a.generation,ownership:a.ownership,content:a.content};return true;}
    cancelDrink(reason:string,preserveFish=false){if(!this.drink)return false;this.drink=null;this.lastContextStop=reason;this.port.drinkStop(preserveFish);if(preserveFish)this.suspended=false;else this.resume();return true;}
    invalidateContent(id:PropId){this.anchors.get(id).content++;if(id==='bowl'&&this.drink)this.cancelDrink('target_content');}
    get drinking(){return !!this.drink;}
    advance(delta:number){if(!Number.isFinite(delta))return;const dt=clamp(delta,0,.1);
        if(this.state==='PRESSED'){this.held+=dt;this.port.hold(this.pointer,Math.min(this.held/.34,1)*.98);if(this.held>=.34)this.startDrag();}
        else if(this.state==='DRAGGING')this.setAnchor(this.constrain(this.anchor(this.selected)),5);
        else if(this.state==='SETTLING'){this.settleAge+=dt;const t=Math.min(1,this.settleAge/.36),e=t*t*(3-2*t);this.setAnchor(this.settleFrom.map((v,i)=>v+(this.settleTo[i]-v)*e),5*(1-e));if(!this.dropOffer)this.port.settleTransform(this.selected,e);if(t>=1){const id=this.selected,offer=this.dropOffer;this.port.present(id,false);this.state='IDLE';this.setAnchor(this.settleTo,0);this.release(id);this.selected=null;this.dropOffer=null;this.dropEvaluations++;if(offer==='bowl')this.requestDrink();else if(offer==='doll'){this.offered=id;this.suspend();this.port.offer(id);}else this.resume();}}
        if(this.drink){const token=this.drink,a=this.anchors.get('bowl');if(a.owner!=='world'||a.generation!==token.generation||a.ownership!==token.ownership||a.content!==token.content){this.cancelDrink('stale_target');return;}token.age+=dt;this.port.drinkAdvance(token.age,dt);if(token.age>=2.8){this.drinkCount++;this.cancelDrink('completed');}}
    }
    private suspend(){if(this.suspended)return;this.suspended=true;this.port.suspend();}
    private resume(){if(!this.suspended)return;this.suspended=false;this.port.resume();}
    private startDrag(){const a=this.anchors.get(this.selected);if(a.owner!=='world')return;a.owner='player';a.ownership++;this.state='DRAGGING';this.port.present(this.selected,true);this.port.hold(this.pointer,0);this.port.pulse(this.pointer);this.setAnchor(a.position,5);}
    private release(id:PropId){const a=this.anchors.get(id);a.position=a.home.slice();if(a.owner==='player'){a.owner='world';a.ownership++;}}
    private setAnchor(at:number[],lift:number){const a=this.anchors.get(this.selected);a.position=at.slice();this.lift=lift;const y=at[1],z=this.state==='DRAGGING'||this.state==='SETTLING'?180:near(at,a.home)?({doll:5,bowl:15,low_table:20}[this.selected]):Math.round(y<951?5+7*(y-862)/89:y<1012?12+3*(y-951)/61:15+5*(y-1012)/207);this.port.setAnchor(this.selected,at,lift,z);}
    private constrain(at:number[]){const safe=this.port.visibleRect(),bounds=this.port.bounds(this.selected),a=this.anchor(this.selected);return at.map((v,i)=>{const offset=bounds[i]-a[i]+(i===1?this.lift-5:0),lo=safe[i]+12-offset,hi=safe[i]+safe[i+2]-12-offset-bounds[i+2];return lo<=hi?clamp(v,lo,hi):(lo+hi)/2;});}
    private beginSettle(valid:boolean){this.settleFrom=this.anchor(this.selected);this.settleTo=this.dropOffer==='bowl'?this.port.fishGround().map((v,i)=>v+[19,44][i]):this.port.home(this.selected).slice();this.port.captureSettle(this.selected);this.settleAge=0;this.state='SETTLING';this.port.pulse(this.pointer,valid||!!this.dropOffer);}
    snapshot(){return {state:this.state,selectedId:this.selected||'',capturedPointer:this.captured,heldSeconds:this.held,lift:this.lift,offeredId:this.offered||'',dropOffer:this.dropOffer||'',dropEvaluations:this.dropEvaluations,drinkCount:this.drinkCount,context:this.drink?{...this.drink,phase:this.drink.age===0?'drink':this.drink.age/2.8<.24?'lift':this.drink.age/2.8<=.76?'sip':'lower',targetId:'bowl'}:null,lastContextStop:this.lastContextStop,ambientSuspended:this.suspended,anchors:Array.from(this.anchors.entries()).map(([id,a])=>({id,...a}))};}
}
