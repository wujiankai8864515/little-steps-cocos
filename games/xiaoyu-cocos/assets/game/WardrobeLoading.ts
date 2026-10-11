import { EventKeyboard, input, Input, KeyCode, Node } from 'cc';
import { GameAssets } from './Assets';
import { Scope, sharedUI } from './Engine';
import { nodeAt } from './Visual';
const FONT='res://assets/bootstrap_ui.ttf';
// The original wardrobe has a speech loading/cancel flow, distinct from the
// travel progress paper. Keep its wording, choices and anchor.
export class WardrobeLoading {
    readonly root:Node;onCancel=()=>{};onRetry=()=>{};private bubble:any;private binding:any;private age=0;private failed=false;private height=1280;
    constructor(parent:Node,private assets:GameAssets,scope:Scope,private enabled:()=>boolean){this.root=nodeAt(parent,'WardrobeLoadingSpeech');this.binding=sharedUI().pointer(this.root,{down:(at:number[],id:number)=>{this.bubble.down(id,at);return true;},move:(at:number[],id:number)=>this.bubble.move(id,at),up:(at:number[],id:number)=>this.bubble.up(id,at),cancel:()=>this.bubble?.cancelPointer()},()=>!!this.bubble&&this.enabled());const key=(e:EventKeyboard)=>{if(e.keyCode===KeyCode.ESCAPE&&this.bubble&&this.enabled())this.onCancel();};input.on(Input.EventType.KEY_DOWN,key);scope.own(()=>{this.hide();this.binding.dispose();input.off(Input.EventType.KEY_DOWN,key);this.root.destroy();});}
    resize(height:number){this.height=height;this.root.setPosition(0,(height-1280)/2);this.binding.cancel();}
    private present(text:string,failed:boolean){this.hide();this.failed=failed;this.age=0;this.root.setSiblingIndex(this.root.parent.children.length-1);this.bubble=sharedUI().confirmationBubble(this.root,this.assets.font(FONT),text,[360,710],[0,0,720,this.height],{fontSize:24,fontMetrics:this.assets.catalog.assets[FONT].fontMetrics,acceptText:failed?'再试一次':'',cancelText:'返回小屋',cancelOnly:!failed,onDecision:(accepted:boolean)=>failed&&accepted?this.onRetry():this.onCancel()});}
    show(_message?:string){this.present('衣柜加载中...',false);}failure(_message?:string){this.present('衣柜暂时没能打开。',true);}
    hide(){this.binding?.cancel();this.bubble?.root.destroy();this.bubble=null;}
    advance(delta:number){if(!this.bubble)return;this.age+=delta;if(!this.failed)this.bubble.text.string='衣柜加载中'+'.'.repeat(1+Math.floor(this.age/.52)%3);this.bubble.advance(delta);}
}
