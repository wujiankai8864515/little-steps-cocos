import { loadingMath } from './LoadingMath';
const KEYS = [[0,-12,-26],[7,-27,-32],[10,-27,-32],[14,9,-27],[15,9,-27],[18,-19,-31],[24,-22,-32],[28,9,-27],[29,9,-27],[32,-20,-31],[36,-24,-32],[40,9,-27],[41,9,-27],[44,-19,-30],[51,-15,-28],[58,-12,-26],[65,-12,-26]];
const HITS = [14,28,40];
const RESPONSE = [[0,0],[1,.72],[2,1],[3,.76],[4,.38],[5,.08],[6,-.15],[8,-.14],[10,.055],[12,0]];
export function loadingPose(frame: number) {
    frame = ((frame % 66) + 66) % 66;
    const m = loadingMath, T = (p: number[]) => m.trs(p), S = (s: number[]) => m.trs([0,0],0,s), R = (d: number) => m.trs([0,0],d*Math.PI/180);
    const chain = (...matrices: number[][]) => matrices.reduce((a,b) => m.multiply(a,b),m.identity());
    let motion = [-12,-26], spring = 0, weight = 0;
    for (let i=0;i<KEYS.length-1;i++) {
        const a=KEYS[i],b=KEYS[i+1];
        if(frame>=a[0] && frame<=b[0]) {
            let u=(frame-a[0])/(b[0]-a[0]);u=HITS.indexOf(b[0])>=0?u*u:u*u*(3-2*u);
            motion=[a[1]+(b[1]-a[1])*u,a[2]+(b[2]-a[2])*u]; break;
        }
    }
    HITS.forEach(hit => {
        const e=frame-hit;
        for(let i=0;i<RESPONSE.length-1;i++) {
            const a=RESPONSE[i],b=RESPONSE[i+1];
            if(e>=a[0] && e<=b[0]) {const u=(e-a[0])/(b[0]-a[0]);spring+=a[1]+(b[1]-a[1])*u*u*(3-2*u);break;}
        }
        if(e>=-4 && e<0)weight=Math.max(weight,Math.pow((e+4)/4,2));
        else if(e>=0 && e<=1)weight=1;
        else if(e>1 && e<4){const u=(e-1)/3;weight=Math.max(weight,1-u*u*(3-2*u));}
    });
    const positive=Math.max(0,spring), body=chain(T([-2+positive*.8,780-336*.9]),S([.9,.9]));
    const propAt = (p: number[]) => chain(body,T([470+9*Math.max(0,(p[0]+5)/47),253+p[1]]),R(p[0]),T([-470,-253]));
    const doll=chain(T([452,534]),S([1.5,1.5]),T([80,163]),R(4*positive+2*Math.min(0,spring)),S([1+.045*spring,1-.07*spring]),T([-80,-163]),S([.25,.25]));
    const contact=m.transform(doll,174,243), reference=m.transform(propAt([9,-27]),570,174);
    const prop=chain(T([(contact[0]-reference[0])*weight,(contact[1]-reference[1])*weight]),propAt(motion));
    return {body,prop,doll,contact,mallet:m.transform(prop,570,174),support:m.transform(doll,320,652),spring,impact:HITS.reduce((found,hit)=>frame>=hit&&frame<=hit+3?frame-hit:found,-1)};
}
