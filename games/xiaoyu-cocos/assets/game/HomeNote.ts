import { Node } from 'cc';
import { GameAssets } from './Assets';
import { core, Scope, sharedUI } from './Engine';

// Game wording and route decisions use the common measured paper component.
export class HomeNote {
    private bubble:any=null;private kind='';private readonly ui=sharedUI();private infoPointer=new core.BubblePointer();
    onDecision=(kind:string,accepted:boolean)=>{};
    constructor(private room:Node,private assets:GameAssets,scope:Scope,private anchor:()=>number[]){scope.own(()=>this.dismiss());}
    ask(kind:string){this.dismiss();this.kind=kind;this.bubble=this.ui.confirmationBubble(this.room,this.assets.font('res://assets/bootstrap_ui.ttf'),kind==='travel'?'背包好啦，要去旅行吗？':'要一起进暗室吗？',this.anchor(),[24,135,672,1025],{fontSize:24,minWidth:320,maxWidth:430,aboveOnly:true,fontMetrics:this.assets.catalog.assets['res://assets/bootstrap_ui.ttf'].fontMetrics,acceptText:'好呀',cancelText:'再等等',cancelLighten:.13,onDecision:(accepted:boolean)=>this.onDecision(kind,accepted)});this.bubble.root.name='HomeRouteNote';this.front();}
    routeWaiting(){this.routeConfirmation('darkroom_wait','暗室加载中...',{acceptText:'',cancelText:'取消',cancelOnly:true});}
    routeError(){this.routeConfirmation('darkroom_retry','暗室加载失败，再试一次？',{acceptText:'重试',cancelText:'取消'});}
    private routeConfirmation(kind:string,text:string,options:any){this.dismiss();this.kind=kind;this.bubble=this.ui.confirmationBubble(this.room,this.assets.font('res://assets/bootstrap_ui.ttf'),text,this.anchor(),[24,135,672,1025],{fontSize:24,minWidth:320,maxWidth:430,aboveOnly:true,fontMetrics:this.assets.catalog.assets['res://assets/bootstrap_ui.ttf'].fontMetrics,...options,onDecision:(accepted:boolean)=>this.onDecision(kind,accepted)});this.front();}
    updateWaiting(text:string){if(this.kind==='darkroom_wait'&&this.bubble)this.bubble.text.string=text;}
    info(text:string,font='res://assets/bootstrap_ui.ttf'){this.dismiss();this.kind='';this.bubble=this.ui.infoBubble(this.room,this.assets.font(font),text,this.anchor(),[24,135,672,1025],{fontSize:24,minWidth:320,maxWidth:430,aboveOnly:true,fontMetrics:this.assets.catalog.assets[font].fontMetrics});this.front();}
    private front(){this.bubble.root.setSiblingIndex(this.room.children.length-1);console.info('[LittleSteps] Home note '+JSON.stringify(this.snapshot()));}
    get visible(){return !!this.bubble&&this.bubble.root.active&&this.bubble.snapshot().phase!=='hidden';}
    get ownsInput(){return !!this.bubble&&!!this.kind&&this.bubble.root.active&&this.bubble.snapshot().phase!=='hidden';}
    down(id:number,at:number[]){if(this.ownsInput)return this.bubble.down(id,at);if(!this.bubble||!this.bubble.root.active)return false;const s=this.bubble.snapshot();return this.infoPointer.inside(at,s.card)?this.infoPointer.down(id,at,s.card,{info:s.card},s.phase):false;}
    move(id:number,at:number[]){return this.ownsInput?this.bubble.move(id,at):this.bubble?this.infoPointer.move(id,at,this.bubble.snapshot().card):false;}
    up(id:number,at:number[]){if(this.ownsInput)return this.bubble.up(id,at);if(!this.bubble)return false;const s=this.bubble.snapshot(),target=this.infoPointer.up(id,at,s.card,{info:s.card},s.phase);if(target==='info')this.bubble.close();return target!==null;}
    cancelPointer(){this.infoPointer.cancel();if(this.bubble?.cancelPointer)this.bubble.cancelPointer();}
    cancel(){if(!this.ownsInput||this.bubble.snapshot().phase==='closing')return false;const kind=this.kind;this.bubble.cancelPointer();this.bubble.close();this.onDecision(kind,false);return true;}
    dismiss(immediate=true){if(!this.bubble)return;this.cancelPointer();if(!immediate){this.bubble.close();return;}this.bubble.root.destroy();this.bubble=null;this.kind='';}
    advance(delta:number){if(!this.bubble)return;this.bubble.setAnchor(this.anchor());this.bubble.advance(delta);if(this.bubble.snapshot().phase==='hidden')this.dismiss();}
    snapshot(){return {kind:this.kind,ownsInput:this.ownsInput,...(this.bubble?this.bubble.snapshot():{phase:'hidden'})};}
}
