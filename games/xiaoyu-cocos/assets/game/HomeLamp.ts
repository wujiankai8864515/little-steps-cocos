import { Node } from 'cc';
import { HomeClock } from './HomeClock';
import { ResponsiveLamp } from './DarkroomVisualRules';
import { homeLighting } from './LightingSnapshot';
import { Scope, sharedUI } from './Engine';
import { nodeAt, picture } from './Visual';

// Original room_props_controller: independent manual override, .72 energy,
// .22-second fade and .34-second feedback around the visible fixture's pivot.
export class HomeLamp {
    readonly hitRect:number[];readonly response=new ResponsiveLamp();
    onToggle=()=>{};private manual=false;private on=false;private count=0;
    private rest:number[];private scale:number[];private pivot:number[];private input:any;
    constructor(private clock:HomeClock,private fixture:ReturnType<typeof picture>,properties:any){
        const uv=properties['metadata/visible_uv']||[0,0,1,1],size=fixture.spec.size,r=[uv[0]*size[0],uv[1]*size[1],uv[2]*size[0],uv[3]*size[1]];
        this.rest=[fixture.root.position.x,-fixture.root.position.y];this.scale=[fixture.root.scale.x,fixture.root.scale.y];this.pivot=[r[0]+r[2]/2,r[1]+r[3]/2];
        this.hitRect=[this.rest[0]+r[0]*this.scale[0]-12,this.rest[1]+r[1]*this.scale[1]-12,r[2]*this.scale[0]+24,r[3]*this.scale[1]+24];this.advance(0);
    }
    get energy(){return this.response.value;}
    toggle(){this.on=this.manual?!this.on:this.energy<=.01;this.manual=true;this.count++;this.response.tap(this.on?.72:0);this.feedback();this.onToggle();return this.on;}
    bindInput(parent:Node,scope:Scope,enabled:()=>boolean){
        const hit=nodeAt(parent,'HomeLampHitArea',...this.hitRect as [number,number,number,number]);
        this.input=sharedUI().action(hit,()=>this.toggle(),()=>scope.active&&enabled());scope.own(()=>{this.input.dispose();hit.destroy();});
    }
    cancel(){this.input?.cancel();}
    advance(delta:number){this.response.advance(delta,homeLighting(this.clock.hour(),this.clock.lampWeight()).lampEnergy);this.feedback();}
    private feedback(){const s=this.response.scale();this.fixture.root.setScale(this.scale[0]*s[0],this.scale[1]*s[1],1);this.fixture.root.setPosition(this.rest[0]+this.scale[0]*this.pivot[0]*(1-s[0]),-this.rest[1]-this.scale[1]*this.pivot[1]*(1-s[1]));}
    snapshot(){return {manualOverride:this.manual,on:this.on,energy:this.energy,toggleCount:this.count,hitRect:this.hitRect.slice()};}
}
