// Shared product time, not wall time. Same 30s day / 30s night and 04:00 dawn.
const mod=(v:number,n:number)=>((v%n)+n)%n;
const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
export class HomeClock {
    daySeconds=30;nightSeconds=30;lampOnFraction=.5;lampFadeSeconds=2;lampOffBeforeDawn=5;
    position=0;totalActive=0;
    constructor() {this.seekHour(7);}
    advance(delta:number,active=true) {if(active&&Number.isFinite(delta)&&delta>0){this.totalActive+=delta;this.position=mod(this.position+delta,this.daySeconds+this.nightSeconds);}return this.hour();}
    seekHour(value:number) {if(!Number.isFinite(value))return;const since=mod(value-4,24);this.position=since<16?since/16*this.daySeconds:this.daySeconds+(since-16)/8*this.nightSeconds;}
    hour() {return this.position<this.daySeconds?4+16*this.position/this.daySeconds:mod(20+8*(this.position-this.daySeconds)/this.nightSeconds,24);}
    nightProgress() {return this.position<this.daySeconds?-1:(this.position-this.daySeconds)/this.nightSeconds;}
    nightMix() {const since=mod(this.hour()-20,24);return since>=8?0:smooth(0,1,since)*(1-smooth(7,8,since));}
    lampWeight() {const p=this.nightProgress();if(p<0)return 0;const t=p*this.nightSeconds,on=this.nightSeconds*this.lampOnFraction,off=this.nightSeconds-this.lampOffBeforeDawn;return off<=on+this.lampFadeSeconds?0:smooth(on,on+this.lampFadeSeconds,t)*(1-smooth(off-this.lampFadeSeconds,off,t));}
}
