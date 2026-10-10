import { EventKeyboard, input, Input, KeyCode, Node, sys } from 'cc';
import { GameAssets } from './Assets';
import { HomeMusic } from './AudioBehavior';
import { Scope, sharedUI } from './Engine';
import { HomeHeaderTag } from './HomeHeaderTag';
import { HomeEntryIntent } from './HomeEntryIntent';
import { MusicCreditsView } from './MusicCreditsView';
import { nodeAt } from './Visual';

export class HomeHUD {
    readonly root:Node;
    readonly settings:HomeHeaderTag;
    readonly merit:HomeHeaderTag;
    readonly credits:MusicCreditsView;
    private entry=new HomeEntryIntent();
    private binding:any;
    private active=false;
    onOpen=()=>{};
    constructor(parent:Node,assets:GameAssets,scope:Scope,height:number,music:()=>HomeMusic) {
        this.root=nodeAt(parent,'HomeHUD',0,-(height-1280)/2,720,height);
        const s=sys.getSafeAreaRect(false),safe=[Math.max(0,s.x),Math.max(0,height-s.y-s.height),Math.min(720,s.width),Math.min(height,s.height)];
        this.settings=new HomeHeaderTag(this.root,assets,scope,[safe[0]+16,safe[1]+8,72,92]);
        this.merit=new HomeHeaderTag(this.root,assets,scope,[safe[0]+safe[2]-202,safe[1]+8,186,82],false);
        this.credits=new MusicCreditsView(this.root,assets,scope,height,safe,music);
        this.binding=sharedUI().pointer(this.settings.root,{down:(p:number[])=>{if(this.entry.down(p))this.settings.swing.press();},move:(p:number[])=>this.entry.move(p),up:(p:number[])=>{this.settings.swing.release();this.entry.up(p);},cancel:()=>{this.settings.swing.release();this.entry.cancel();}},()=>this.active&&!this.credits.visible&&!this.entry.busy);
        const key=(e:EventKeyboard)=>{if(e.keyCode===KeyCode.ESCAPE){this.entry.cancel();this.binding.cancel();}};input.on(Input.EventType.KEY_DOWN,key);
        scope.own(()=>{this.active=false;this.entry.cancel();this.binding.dispose();input.off(Input.EventType.KEY_DOWN,key);this.root.destroy();});
    }
    get blocked(){return !this.active||this.credits.visible||this.entry.busy;}
    setActive(active:boolean){this.active=active;if(!active){this.entry.cancel();this.binding.cancel();this.credits.dismiss();}}
    advance(delta:number){this.settings.advance(delta);this.merit.advance(delta);this.credits.advance(delta);if(this.active&&this.entry.advance(delta)){this.onOpen();this.credits.open();}}
}
