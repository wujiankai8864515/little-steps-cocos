// Native home_departure_visual.gd: one fixed-foot farewell per confirmed trip.
export const DEPARTURE_SWAP_AT=.76,DEPARTURE_FINISH_AT=4.8;
export const DEPARTURE_FOOT_PIXEL=[950,825],DEPARTURE_ACTOR_SCALE=.35,DEPARTURE_CLOUD_RATE=1.5;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
export class DepartureMotion {
    age=0;private cloudAge=0;private tint=[1,1,1];
    readonly origin:number[];
    constructor(foot:number[]){if(foot.length!==2||!foot.every(Number.isFinite))throw new Error('Invalid departure foot');this.origin=foot.slice();}
    advance(value:number){if(!Number.isFinite(value))return 0;this.age=Math.max(this.age,Math.max(0,value));const delta=(this.age-this.cloudAge)*DEPARTURE_CLOUD_RATE;this.cloudAge=this.age;return delta;}
    setLighting(night:number,lamp:number){if(!Number.isFinite(night)||!Number.isFinite(lamp))return;const t=clamp(lamp/.78),n=clamp(night),a=[.38,.46,.63],b=[.80,.67,.50];this.tint=a.map((v,i)=>1+(v+(b[i]-v)*t-1)*n);}
    nativeVisible(){return this.age<DEPARTURE_SWAP_AT;}
    nativeAlpha(){return 1-smooth(.34,DEPARTURE_SWAP_AT,this.age);}
    actorAlpha(){return smooth(.90,1.50,this.age)*(1-smooth(3.3,4.55,this.age));}
    snapshot(){const alpha=this.actorAlpha();return {age:this.age,origin:this.origin.slice(),actorPosition:DEPARTURE_FOOT_PIXEL.map(v=>-v*DEPARTURE_ACTOR_SCALE),actorScale:[DEPARTURE_ACTOR_SCALE,DEPARTURE_ACTOR_SCALE],nativeVisible:this.nativeVisible(),nativeAlpha:this.nativeAlpha(),actorVisible:!this.nativeVisible()&&alpha>0,actorAlpha:alpha,cloudAge:this.cloudAge,cloudElapsed:this.cloudAge*DEPARTURE_CLOUD_RATE,tint:this.tint.slice(),finished:this.age>=DEPARTURE_FINISH_AT};}
}
