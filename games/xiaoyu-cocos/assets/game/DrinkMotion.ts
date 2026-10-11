// Original HomeWorld.apply_drink_pose and HomeInteractionController._advance_drink.
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export const drinkSmooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
export function drinkPose(progress:number){
    const p=clamp(progress,0,1),envelope=drinkSmooth(0,.24,p)*(1-drinkSmooth(.76,1,p));
    const window=drinkSmooth(.24,.3,p)*(1-drinkSmooth(.68,.76,p));
    const sip=Math.sin(clamp((p-.26)/.46,0,1)*Math.PI*6)*window;
    return {progress:p,envelope,window,sip,target:[(.031+.009*sip)*envelope,(-.1-.026*sip)*envelope,.023*envelope,-.05*envelope],shoulder:[-5*envelope,8*envelope],closed:p>.43&&p<.48||p>.66&&p<.7,mouth:(1.7+.9*sip)*envelope,gaze:[.05*envelope,2.15*envelope]};
}
export function drinkBowl(age:number){const p=clamp(age/2.8,0,1),pose=drinkPose(p);return {progress:p,rotation:(-.16+Math.sin(age*14)*.025*pose.window)*pose.envelope,pickup:drinkSmooth(0,.24,p),lower:p>.76?drinkSmooth(.76,1,p):0,phase:p<.24?'lift':p<=.76?'sip':'lower',emitMark:p>=.3&&p<=.76,complete:age>=2.8};}
