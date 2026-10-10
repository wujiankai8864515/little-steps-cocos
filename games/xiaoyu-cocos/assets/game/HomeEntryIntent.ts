// home_world.gd: fixed entry hit, nine-pixel cancellation and delayed bounce.
export class HomeEntryIntent {
    private origin:number[]=null;
    private valid=false;
    private remaining=-1;
    down(point:number[]) {if(this.remaining>=0||this.origin)return false;this.origin=point.slice();this.valid=true;return true;}
    move(point:number[]) {if(this.origin&&Math.hypot(point[0]-this.origin[0],point[1]-this.origin[1])>9)this.valid=false;}
    up(point:number[]) {if(!this.origin)return false;this.move(point);const accepted=this.valid;this.origin=null;this.valid=false;if(accepted)this.remaining=.28;return accepted;}
    cancel() {this.origin=null;this.valid=false;this.remaining=-1;}
    advance(delta:number) {if(this.remaining<0||!Number.isFinite(delta)||delta<=0)return false;this.remaining-=delta;if(this.remaining>0)return false;this.remaining=-1;return true;}
    get busy(){return this.remaining>=0;}
}
