import { SecondaryMotion } from './AmbientBehavior';
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const limit=(v:number[],amount:number)=>{const n=Math.hypot(...v);return n>amount?v.map(x=>x/n*amount):v.slice();};
export class LiftMotion {
    elapsed=0;amount=0;lag=[0,0];
    reset(){this.elapsed=0;this.amount=0;this.lag=[0,0];}
    advance(amount:number,delta:number,motionLag:number[],secondary:SecondaryMotion) {
        if(!Number.isFinite(amount)||!Number.isFinite(delta)||!motionLag.every(Number.isFinite))return null;
        const step=clamp(delta,0,.1);this.elapsed+=step;this.amount=clamp(amount,0,1);
        const struggle=Math.sin(this.elapsed*6.8),delayed=Math.sin(this.elapsed*6.8-.85),target=limit([motionLag[0]*.35,motionLag[1]],7),blend=1-Math.exp(-14*step);
        this.lag=this.lag.map((v,i)=>v+(target[i]-v)*blend);
        return {step,offsets:secondary.advance(step,[0,(.042*delayed-.012)*this.amount,.014*struggle*this.amount,-.027*delayed*this.amount]),shoulder:[.55*delayed*this.amount,2.2*struggle*this.amount],tail:[-.35*struggle*this.amount,1.2*delayed*this.amount],hand:[.55*Math.sin(this.elapsed*7.2),3.8*Math.cos(this.elapsed*6.8)],mouth:(-.6+2.1*struggle)*this.amount,gaze:[2*Math.sin(this.elapsed*2.8)*this.amount,(1.3+.6*Math.cos(this.elapsed*2.1))*this.amount],closed:this.amount>.3&&(this.elapsed+.37)%2.7<.13};
    }
}
export class LandingSpring {
    active=false;age=0;position=0;velocity=0;substeps=0;
    reset(){this.active=false;this.age=0;this.position=0;this.velocity=0;this.substeps=0;}
    begin(impact:number,secondary:SecondaryMotion){if(!Number.isFinite(impact))return;this.reset();this.active=true;impact=clamp(impact,.3,1);this.velocity=255*impact;secondary.impulse([.17,-.7,.19,-.35].map(v=>v*impact));}
    advance(delta:number){
        if(!this.active||!Number.isFinite(delta))return this.active;const bounded=clamp(delta,0,1/30);this.substeps=Math.min(Math.ceil(bounded*120),4);if(!this.substeps)return this.active;this.age+=bounded;
        const step=bounded/this.substeps;for(let i=0;i<this.substeps;i++){this.velocity+=(-180*this.position-17*this.velocity)*step;this.position=clamp(this.position+this.velocity*step,-4,12);}
        if(this.age>=1.1||Math.abs(this.position)<.015&&Math.abs(this.velocity)<.1){this.active=false;this.position=0;this.velocity=0;}return this.active;
    }
}
