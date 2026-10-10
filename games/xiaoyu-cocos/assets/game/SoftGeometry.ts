import { core } from './Engine';

export interface SoftPose {
    amount: number; grab: number[]; lag: number[]; phase: number;
    jelly: number[]; landing: number; clearance: number;
    heldPart?: string; handGrab?: number[]; handMotion?: number[];
}
// Direct source-space transfer of character_geometry.gd / soft_attachment_mesh.gd.
// The finite element topology is the original 14px (body/tail) and 7px (fin) grid.
export function liftOffset(pixel: number[], grab: number[], amount: number, lag: number[]) {
    const smooth = core.Math2D.smoothstep;
    const dx = pixel[0] - grab[0], dy = pixel[1] - grab[1];
    const radial = smooth(0, 0.95, Math.sqrt((dx / 190) ** 2 + (dy / 160) ** 2));
    const weight = Math.max(smooth(0, 150, dy), radial * 0.55) * amount;
    return [(-dx * 0.022 + lag[0]) * weight, (34 + lag[1]) * weight];
}
export function landingOffset(pixel: number[], compression: number) {
    const upper = 1 - core.Math2D.smoothstep(250, 333, pixel[1]);
    const bulge = Math.sin(core.Math2D.clamp((333 - pixel[1]) / 245, 0, 1) * Math.PI);
    return [(pixel[0] - 335) * compression * bulge / 600, compression * upper];
}
export function softOffset(pixel: number[], grab: number[], amount: number, lag: number[], phase: number) {
    if (amount <= 0) return [0, 0];
    const smooth = core.Math2D.smoothstep, dx = pixel[0] - grab[0], dy = pixel[1] - grab[1];
    const weight = smooth(0, 120, Math.hypot(dx, dy)) * amount;
    const shift = liftOffset(pixel, grab, amount, lag);
    shift[0] += Math.sin(phase * 6.8 + dy * 0.011) * 0.65 * weight;
    shift[1] += Math.sin(phase * 6.8 - 0.8 + dx * 0.006) * 2.8 * weight;
    const face = 1 - smooth(0.8, 1.15, Math.hypot((pixel[0] - 366) / 144, (pixel[1] - 174) / 84));
    const faceGrab = Math.hypot((grab[0] - 366) / 144, (grab[1] - 174) / 84) < 1;
    const faceShift = faceGrab ? [0, 0] : liftOffset([365, 177], grab, amount, lag);
    return shift.map((value, i) => value * (1 - face) + faceShift[i] * face);
}
export function bodyPixelVisible(pixel:number[]) {const smooth=core.Math2D.smoothstep;return (1-smooth(150,151,pixel[0]))*smooth(198,199,pixel[1])*(1-smooth(245,246,pixel[1]))<.84;}
export function attachmentOffset(kind:string,pixel:number[],pose:SoftPose,toBody:number[]) {
    const math=core.Math2D,sample=kind==='OriginalFinAndRigidMallet'?[458,257]:pixel,posed=math.transform(toBody,...sample),aligned=posed.slice();
    if(kind==='OriginalTail'){const seam=math.smoothstep(115,155,pixel[0])*math.clamp(pose.amount,0,1);aligned[0]+=(pixel[0]-aligned[0])*seam;aligned[1]+=(pixel[1]-aligned[1])*seam;}
    const shift=softOffset(aligned,pose.grab,pose.amount,pose.lag,pose.phase);
    if(kind==='OriginalBody'){const weight=1-math.smoothstep(230,296,pixel[1]),land=landingOffset(pixel,pose.landing);shift[0]+=pose.jelly[0]*weight+land[0];shift[1]+=pose.jelly[1]*weight+land[1];if(pose.amount>0)shift[1]=Math.min(shift[1],pose.clearance);}
    const offset=math.basis(math.inverse(toBody),shift[0]+aligned[0]-posed[0],shift[1]+aligned[1]-posed[1]);
    if(kind==='OriginalFinAndRigidMallet'&&pose.heldPart===kind){const mask=1-math.smoothstep(.72,1,Math.hypot((pixel[0]-462)/39,(pixel[1]-255)/34)),away=math.smoothstep(0,24,Math.hypot(pixel[0]-pose.handGrab[0],pixel[1]-pose.handGrab[1]));offset[0]+=(pose.handMotion?.[0]||0)*away*mask*pose.amount;offset[1]+=(pose.handMotion?.[1]||0)*away*mask*pose.amount;}
    return offset;
}
export function deformPart(mesh: any, kind: string, pose: SoftPose, toBody: number[]) {
    const math = core.Math2D, points = mesh.source, out = mesh.vertices;
    const fromBody = math.inverse(toBody), held = pose.heldPart === kind;
    const finAnchor = math.transform(toBody, 458, 257);
    const anchorShift = softOffset(finAnchor, pose.grab, pose.amount, pose.lag, pose.phase);
    const finShift = math.basis(fromBody, anchorShift[0], anchorShift[1]);
    let changed = false;
    for (let i = 0; i < points.length; i += 2) {
        const pixel = [points[i], points[i + 1]]; let value = pixel;
        if (kind === 'OriginalBody') {
            const shift = softOffset(pixel, pose.grab, pose.amount, pose.lag, pose.phase);
            const jellyWeight = 1 - math.smoothstep(230, 296, pixel[1]), landing = landingOffset(pixel, pose.landing);
            shift[0] += pose.jelly[0] * jellyWeight + landing[0]; shift[1] += pose.jelly[1] * jellyWeight + landing[1];
            if (pose.amount > 0) shift[1] = Math.min(shift[1], pose.clearance);
            value = [pixel[0] + shift[0], pixel[1] + shift[1]];
        } else if (pose.amount > 0 && kind === 'OriginalFinAndRigidMallet') {
            let handWeight = 0;
            if (held) {
                const grab = pose.handGrab;
                const mask = 1 - math.smoothstep(0.72, 1, Math.hypot((pixel[0] - 462) / 39, (pixel[1] - 255) / 34));
                handWeight = mask * math.smoothstep(0, 24, Math.hypot(pixel[0] - grab[0], pixel[1] - grab[1])) * pose.amount;
            }
            value = [pixel[0] + finShift[0] + (pose.handMotion?.[0] || 0) * handWeight, pixel[1] + finShift[1] + (pose.handMotion?.[1] || 0) * handWeight];
        } else if (pose.amount > 0) {
            const aligned = math.transform(toBody, ...pixel), seam = math.smoothstep(115, 155, pixel[0]) * math.clamp(pose.amount, 0, 1);
            aligned[0] += (pixel[0] - aligned[0]) * seam; aligned[1] += (pixel[1] - aligned[1]) * seam;
            const shift = softOffset(aligned, pose.grab, pose.amount, pose.lag, pose.phase);
            value = math.transform(fromBody, aligned[0] + shift[0], aligned[1] + shift[1]);
        }
        const x = Math.fround(value[0]), y = Math.fround(value[1]);
        if (out[i] !== x || out[i + 1] !== y) changed = true;
        out[i] = x; out[i + 1] = y;
    }
    return changed;
}
