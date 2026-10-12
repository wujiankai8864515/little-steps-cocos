// Exact SharedLighting.sample() and Home room_props_controller accents.
// Downward illustration coordinates stay independent of Cocos transforms.
const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
const mod=(x:number,n:number)=>((x%n)+n)%n;
const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const colorMix=(a:number[],b:number[],t:number)=>a.map((v,i)=>mix(v,b[i],t));
const normalized=(v:number[])=>{const n=Math.hypot(...v);return v.map(x=>x/n);};
export function lightingSnapshot(hour:number) {
    if(!Number.isFinite(hour))throw new Error('光照时间必须有限');
    const h=mod(hour,24),sinceDay=mod(h-4,24),nightScheduled=sinceDay>=16,nightElapsed=mod(h-20,24);
    const night=nightScheduled?smooth(0,1,nightElapsed)*(1-smooth(7,8,nightElapsed)):0,day=1-night;
    const solarPhase=clamp(sinceDay/16),up=nightScheduled?0:Math.pow(Math.max(Math.sin(solarPhase*Math.PI),0),2);
    const elevation=70*Math.PI/180*up,azimuth=51*Math.sin((solarPhase-.5)*Math.PI);
    const cast=normalized([-Math.sin(azimuth*Math.PI/180),.65]);
    const cot=Math.min(1/Math.tan(Math.max(elevation,7*Math.PI/180)),5);
    const morning=h<12?(1-smooth(8.5,11,h))*day:0,noon=Math.exp(-Math.pow((h-12)/2.2,2))*day;
    const sunset=h>12?smooth(13.5,16,h)*day:0,afterglow=h>12?smooth(16,18.5,h)*(1-smooth(20,21,h))*.25:0;
    const peak=mix(mix(.43,.69,noon),.75,sunset),sunEnergy=smooth(0,.12,up)*peak;
    const dayAmbient=colorMix(colorMix([.55,.59,.63],[.43,.46,.48],noon),[.4,.43,.5],sunset);
    const ambient=colorMix([.115,.17,.29],dayAmbient,day);
    const sunColor=colorMix(colorMix([1,.91,.76],[1,.985,.9],noon),[1,.46,.16],sunset);
    const moonPhase=clamp(nightElapsed/8),moonAzimuth=51*Math.sin((moonPhase-.5)*Math.PI);
    const moonCast=normalized([-Math.sin(moonAzimuth*Math.PI/180),.95]);
    const screenPhase=clamp((h-4)/16);
    return {hour:h,day,night,nightScheduled,solarPhase,moonPhase,elevation,azimuth,cast,moonCast,cot,sunEnergy,moonEnergy:night*.7,morning,noon,sunset,afterglow,ambient,sunColor,
        sunVector:normalized([-cast[0]*Math.cos(elevation),-cast[1]*Math.cos(elevation),Math.sin(elevation)]),
        sunPosition:[mix(128,232,screenPhase),108-Math.sin(screenPhase*Math.PI)*80],
        moonPosition:[mix(132,228,moonPhase),95-Math.sin(moonPhase*Math.PI)*66]};
}
export function homeLighting(hour:number,lampWeight:number,lampEnergy?:number) {
    const s=lightingSnapshot(hour);
    return {...s,receiverAmbient:s.ambient.map(v=>v*mix(1,.94,s.night)),receiverSun:Math.min(s.sunEnergy*1.12,.84),receiverMoon:Math.min(s.moonEnergy*1.28,.9),
        shaftSun:Math.min(s.sunEnergy,.96),shaftMoon:Math.min(s.moonEnergy,.98),lampEnergy:Number.isFinite(lampEnergy)?clamp(lampEnergy,0,.78):s.night*.78*clamp(lampWeight)};
}
// Dust uses the source CPU gate without the fragment-only leaf breakup.
export function dustGate(p:number[],cast:number[],cot:number) {
    const depth=Math.max(p[1]-145,0),floorDepth=Math.max(p[1]-740,0),width=119+depth*.46;
    const u=(p[0]-156-cast[0]*(depth*.43+floorDepth*.22))/width;
    return (1-smooth(.84,1.05,Math.abs(u)))*smooth(130,205,p[1])*(1-smooth(1060+cot*90,1200+cot*90,p[1]))*(.61+.39*smooth(.02,.075,Math.abs(u+.23)));
}
