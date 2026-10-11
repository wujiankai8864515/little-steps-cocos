import { TRAVEL_SCENE } from './TravelSceneData';

export type Point=number[];
const TAU=Math.PI*2;
export const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
export const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export const mod=(x:number,n:number)=>((x%n)+n)%n;
const add=(a:Point,b:Point)=>[a[0]+b[0],a[1]+b[1]],sub=(a:Point,b:Point)=>[a[0]-b[0],a[1]-b[1]],mul=(a:Point,n:number)=>[a[0]*n,a[1]*n];
const rotate=(a:Point,t:number)=>[a[0]*Math.cos(t)-a[1]*Math.sin(t),a[0]*Math.sin(t)+a[1]*Math.cos(t)];
const normalize=(a:Point)=>{const n=Math.hypot(...a);return n?mul(a,1/n):[0,0];};
export function bezier(points:Point[],fraction:number){const work=points.map(p=>p.slice()),t=clamp(fraction);for(let count=work.length-1;count>0;count--)for(let i=0;i<count;i++)work[i]=work[i].map((v,j)=>lerp(v,work[i+1][j],t));return work[0];}
export function routeSegment(stage:number,fraction:number,config=TRAVEL_SCENE):Point{
    const nodes=config.route.nodes,p0=nodes[stage].at,p1=nodes[stage+1].at,previous=nodes[Math.max(0,stage-1)].at,following=nodes[Math.min(nodes.length-1,stage+2)].at;
    return bezier([p0,add(p0,mul(sub(p1,previous),1/6)),sub(p1,mul(sub(following,p0),1/6)),p1],fraction);
}
export function routePosition(fraction:number,config=TRAVEL_SCENE):Point{const phase=clamp(fraction)*config.route.segments.length,stage=Math.min(Math.trunc(phase),config.route.segments.length-1);return routeSegment(stage,phase-stage,config);}
export function narrativeMapping(trip:any,stage:number,config=TRAVEL_SCENE){const s=clamp(Math.trunc(stage),0,10),node=config.route.nodes[s],cells=trip.cells||[];return {scene_id:config.id,node_id:node.id,node_name:node.name,story_place:cells.length?cells[clamp(s-1,0,cells.length-1)].place?.name||'':'',stage:s};}

export function travelLight(hour:number,config=TRAVEL_SCENE){
    const daylight=smooth(4,6,hour)*(1-smooth(18,20,hour)),solar=clamp((hour-4)/16),l=config.light;
    const sun=l.sun_left.map((v:number,i:number)=>lerp(v,l.sun_right[i],solar));sun[1]=l.sun_left[1]-Math.sin(solar*Math.PI)*(l.sun_left[1]-l.sun_top[1]);
    let tint=l.night_color.map((v:number,i:number)=>lerp(v,l.day_color[i],daylight));const warmth=1-Math.abs(solar*2-1);
    if(daylight>.01)tint=tint.map((v:number,i:number)=>lerp(v,l.dawn_color[i],(1-warmth)*.28*daylight));
    const sunDirection=normalize([Math.sin((solar-.70)*Math.PI)*.95,-.92]),nightElapsed=mod(hour-20,24),moonPhase=clamp(nightElapsed/8),moonWeight=smooth(0,1,nightElapsed)*(1-smooth(7,8,nightElapsed));
    const moon=[lerp(config.canvas[0]-l.moon[0],l.moon[0],moonPhase),l.moon[1]+(1-Math.sin(moonPhase*Math.PI))*(l.moon_arc_height??24)],moonDirection=normalize([Math.sin((moonPhase-.70)*Math.PI)*.95,-.92]);
    const night=hour>=20||hour<4,direction=night?moonDirection:sunDirection,shadowWeight=night?moonWeight:smooth(4,4.5,hour)*(1-smooth(19.5,20,hour));
    return {hour,daylight,solar,sun,moon,moon_phase:moonPhase,moon_weight:moonWeight,moon_direction:moonDirection,tint,direction,shadow_weight:shadowWeight,actor_shadow_offset:[-direction[0]*15*shadowWeight,4],actor_shadow_rotation:Math.atan2(-direction[1],-direction[0])*.16*shadowWeight};
}

export type SceneSound={enabled():boolean;gestureSeen():boolean;playing(kind:'bell'|'cue'):boolean;play(kind:'bell'|'cue',db:number):void;stop(kind:'bell'|'cue'):void};
// Deterministic scene state from travel_scene_runtime.gd. Asset ownership,
// actual drawing and audio transport belong to the consuming page/view.
export class TravelSceneState {
    age=0;routeProgress=0;choicePaused=false;visible=true;applicationActive=true;clockActive=true;disposed=false;
    bodyAngle=0;bodySpeed=0;clapperAngle=0;clapperSpeed=0;
    contacts=0;plays=0;cuePlays=0;
    private nextGust:number;private lastContact=-100;private cueLast=-100;
    readonly branches:Array<{angle:number;velocity:number;phase:number}>;
    readonly leaves:Array<{origin:Point;phase:number;depth:number;scale:number}>;
    readonly routeSamples:Point[][];
    private footprintTimes=new Map<number,number>();private routeSeeded=false;private nextStampTime=0;
    onContact:(age:number,impulse:number)=>void=()=>{};
    constructor(readonly config=TRAVEL_SCENE,readonly sound:SceneSound=null){
        this.nextGust=config.bell.start_gust;
        this.branches=config.branches.map((_:any,i:number)=>({angle:0,velocity:0,phase:i*1.71}));
        const area=config.leaves.area;
        this.leaves=Array.from({length:config.leaves.count},(_,i)=>({origin:[mod(i*173.13,area[2]),mod(i*103.7,area[3])],phase:i*2.31,depth:i%3/2,scale:.85+i%4*.10}));
        this.routeSamples=config.route.segments.map((_:any,stage:number)=>Array.from({length:33},(_,i)=>routeSegment(stage,i/32,config)));
    }
    get active(){return !this.disposed&&this.visible&&this.applicationActive&&this.clockActive&&!this.choicePaused;}
    private canSound(){return this.active&&!!this.sound&&this.sound.enabled()&&this.sound.gestureSeen();}
    syncActivity(){if(!this.canSound()&&this.sound){if(this.sound.playing('bell'))this.sound.stop('bell');if(this.sound.playing('cue'))this.sound.stop('cue');}}
    setActive(active:boolean){this.applicationActive=active;this.syncActivity();}
    updateRoute(progress:number,paused:boolean){
        const next=clamp(progress);
        if(!this.routeSeeded||next<this.routeProgress)this.seedRoute(next);
        else {const reached=Math.min(this.config.route.nodes.length-1,Math.floor(next*this.config.route.segments.length+.00001));for(let i=0;i<=reached;i++)if(!this.footprintTimes.has(i)){const at=Math.max(this.age,this.nextStampTime);this.footprintTimes.set(i,at);this.nextStampTime=at+.23;}}
        this.routeProgress=next;this.choicePaused=paused;this.syncActivity();
    }
    seedRoute(progress:number){this.routeProgress=clamp(progress);this.footprintTimes.clear();const reached=Math.min(this.config.route.nodes.length-1,Math.floor(this.routeProgress*this.config.route.segments.length+.00001));for(let i=0;i<=reached;i++)this.footprintTimes.set(i,-100);this.routeSeeded=true;this.nextStampTime=this.age;}
    announceEncounter(){if(!this.canSound()||this.age-this.cueLast<4||this.sound.playing('bell')||this.sound.playing('cue'))return false;this.cueLast=this.age;this.sound.play('cue',-10);this.cuePlays++;return true;}
    wind(at:number){const w=this.config.wind;return w.base*Math.sin(at*w.base_frequency)+w.gust*Math.max(0,Math.sin(at*TAU/w.period))**3+w.ripple_amplitude*Math.sin(at*w.ripple_frequency);}
    advance(delta:number){
        this.syncActivity();if(!this.active||!Number.isFinite(delta))return;
        let remaining=clamp(delta,0,.1);while(remaining>.00001){const step=Math.min(remaining,1/120);this.step(step);remaining-=step;}
    }
    private step(delta:number){
        this.age+=delta;const wind=this.wind(this.age),w=this.config.wind;
        this.branches.forEach((state,i)=>{const target=(this.config.branches[i].amplitude??.04)*(this.wind(this.age-state.phase*.12)+w.branch_flutter*Math.sin(this.age*w.branch_flutter_frequency+state.phase));state.velocity+=((target-state.angle)*w.stiffness-state.velocity*w.damping)*delta;state.angle+=state.velocity*delta;});
        const b=this.config.bell;if(this.age>=this.nextGust){this.bodySpeed+=b.gust_impulse;this.clapperSpeed-=b.gust_impulse*.78;this.nextGust+=b.gust_interval;}
        this.bodySpeed+=(-b.body_stiffness*this.bodyAngle-b.body_damping*this.bodySpeed+wind*b.body_wind)*delta;
        this.clapperSpeed+=(-b.clapper_stiffness*this.clapperAngle-b.clapper_damping*this.clapperSpeed-wind*b.clapper_wind)*delta;
        this.bodyAngle+=this.bodySpeed*delta;this.clapperAngle+=this.clapperSpeed*delta;
        const gap=this.clapperAngle-this.bodyAngle,sign=Math.sign(gap);
        if(Math.abs(gap)>=b.contact_angle&&sign*(this.clapperSpeed-this.bodySpeed)>0){const impulse=Math.abs(this.clapperSpeed-this.bodySpeed);this.clapperAngle=this.bodyAngle+sign*b.contact_angle;this.clapperSpeed=this.bodySpeed-sign*impulse*.32;this.bodySpeed+=sign*impulse*.06;
            if(this.age-this.lastContact>=b.cooldown){this.lastContact=this.age;this.contacts++;this.onContact(this.age,impulse);if(this.canSound()&&!this.sound.playing('bell')&&!this.sound.playing('cue')){this.sound.play('bell',this.config.audio.volume_db);this.plays++;}}
        }
    }
    footprintPose(index:number):any{
        if(!this.footprintTimes.has(index))return {visible:false};const elapsed=this.age-this.footprintTimes.get(index);if(elapsed<0)return {visible:false};
        const drop=smooth(0,.28,elapsed),press=Math.sin(clamp((elapsed-.28)/.30)*Math.PI);
        return {visible:true,drop:(1-drop)*-13,scale:mul([1+press*.13,1-press*.15],1+.35*(1-drop)),alpha:smooth(0,.13,elapsed),highlight:(1-smooth(.40,1.15,elapsed))*drop,elapsed};
    }
    cloudPosition(cloud:any){const width=this.config.canvas[0]+cloud.size[0]*2;return [mod(cloud.at[0]+this.age*cloud.speed+cloud.size[0],width)-cloud.size[0],cloud.at[1]+Math.sin(this.age*.09+(cloud.phase||0))*3];}
    tonguePosition(){const b=this.config.bell;return add(add(b.position,rotate(b.clapper_hinge,this.bodyAngle)),rotate(sub(b.clapper_anchor,b.clapper_hinge),this.clapperAngle));}
    leafPose(index:number,clock=this.age){
        const leaf=this.leaves[index],bounds=this.config.leaves.area,depth=leaf.depth,phase=leaf.phase,speed=this.config.leaves.speed*lerp(.48,1.65,depth),span=bounds[3]+160,progress=mod(clock*speed/span+leaf.origin[1]/bounds[3],1),lane=index%4;
        const startX=bounds[0]+mod(leaf.origin[0]+lane*57,bounds[2]),sign=lane%2===0?1:-1,sweep=lerp(95,215,depth),p0=[startX,bounds[1]-80],p1=add(p0,[sign*sweep,span*(.25+lane*.035)]),p3=[clamp(startX-sign*sweep*.28,35,685),bounds[1]+bounds[3]+80],p2=add(p3,[-sign*sweep*1.12,-span*.32]);
        const at=bezier([p0,p1,p2,p3],progress),envelope=Math.sin(progress*Math.PI);at[0]+=envelope*(Math.sin(clock*.43+phase)*24+Math.sin(clock*.19+phase*1.7)*19)*lerp(.55,1.25,depth);at[1]+=envelope*Math.sin(clock*.71+phase)*lerp(3,12,depth);
        const turn=Math.sin(clock*.73+phase)*.85+Math.sin(clock*.27+phase*1.3)*.42+sign*progress*2.4,flip=Math.cos(clock*lerp(.85,1.35,depth)+phase),extent=mul([lerp(12,59,depth),lerp(10,43,depth)],leaf.scale);extent[0]*=lerp(.18,1,Math.abs(flip));return {at,extent,turn,flip,depth,progress};
    }
    snapshot(hour=12){return {scene_id:this.config.id,age:this.age,disposed:this.disposed,active:this.active,route_progress:this.routeProgress,light:travelLight(hour,this.config),bell_body_angle:this.bodyAngle,bell_clapper_angle:this.clapperAngle,tongue_position:this.tonguePosition(),cloud_positions:this.config.clouds.map((c:any)=>this.cloudPosition(c)),contacts:this.contacts,plays:this.plays,playing:this.sound?.playing('bell')||false,branch_states:this.branches.map(b=>({...b})),leaf_count:this.leaves.length,cloud_count:this.config.clouds.length,cue_plays:this.cuePlays,cue_playing:this.sound?.playing('cue')||false,pcm_bytes:this.disposed?0:Math.ceil(clamp(this.config.audio.duration,.15,3)*clamp(Math.trunc(this.config.audio.sample_rate),8000,24000))*2+Math.ceil(ENCOUNTER_AUDIO.duration*ENCOUNTER_AUDIO.sample_rate)*2,pcm_and_playback_reservation:600000,audio_polyphony:1,queued_callbacks:0};}
    dispose(){if(this.disposed)return;this.disposed=true;this.syncActivity();this.branches.length=0;this.leaves.length=0;this.routeSamples.length=0;this.footprintTimes.clear();this.routeSeeded=false;this.onContact=()=>{};}
}

export const ENCOUNTER_AUDIO={sample_rate:22050,duration:.78,frequency:784,partials:[[1,.65,.32],[1.5,.19,.23],[2,.10,.18]]};
// Original bounded PCM16 synthesis. The page may consume prebuilt WAV bytes;
// this pure implementation also checks the lossless native export.
export function synthesizeBell(values:any){
    const rate=clamp(Math.trunc(values.sample_rate),8000,24000),duration=clamp(values.duration,.15,3),count=Math.ceil(duration*rate),frequency=clamp(values.frequency,110,1000),partials=values.partials.slice(0,8),samples=new Int16Array(count);
    for(let frame=0;frame<count;frame++){const at=frame/rate;let sample=0;for(const p of partials)sample+=p[1]*Math.sin(TAU*frequency*p[0]*at)*Math.exp(-at/Math.max(.03,p[2]));sample*=smooth(0,.009,at)*(1-smooth(duration-.18,duration,at))*.45;samples[frame]=Math.trunc(clamp(sample,-.95,.95)*32767);}
    return {rate,samples};
}

// The 48 analytic glints retain one page clock and a fixed true button center;
// rebuilding controls never resets their trajectories or moves hit targets.
export function encounterStar(index:number,atTime:number,target:Point,size:Point=[720,1280]):any{
    const depth=index%3/2,lane=index%8,slot=Math.floor(index/8),w=size[0],h=size[1];let source:Point;
    switch(lane){case 0:source=[w*(.10+slot*.17),-30];break;case 1:source=[w+28,h*(.08+slot*.19)];break;case 2:source=[w*(.88-slot*.17),h+28];break;case 3:source=[-28,h*(.90-slot*.18)];break;case 4:source=[w*(.06+slot*.19),h*.12];break;case 5:source=[w*.88,h*(.10+slot*.17)];break;case 6:source=[w*(.89-slot*.18),h*.88];break;default:source=[w*.12,h*(.90-slot*.17)];}
    const age=mod(atTime+index/48*5.6,5.6),life=lerp(5,4,depth);if(age>life)return {visible:false};const phase=age/life,u=phase*phase*(1.45-.45*phase),axis=sub(target,source),lateral=normalize([-axis[1],axis[0]]),bend=(index%2===0?1:-1)*lerp(46,135,depth),p1=add(add(source,mul(axis,.25)),mul(lateral,bend)),p2=add(sub(target,mul(axis,.18)),mul(lateral,bend*.23));
    return {visible:true,at:bezier([source,p1,p2,target],u),depth,extent:lerp(28,76,depth)*(.86+.14*Math.sin(age*1.8+index))*(1-.30*u),alpha:smooth(0,.14,phase)*(1-smooth(.88,1,phase))*lerp(.66,1,depth)*(.78+.22*Math.sin(age*2.1+index*1.73)),rotation:Math.sin(age*.8+index)*.16,source,target,phase,u,p1,p2};
}
