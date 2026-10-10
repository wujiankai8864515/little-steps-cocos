// home_page.gd:set_viewport_size. Keep world sampling independent from HUD.
export function homeRenderPlan(height:number,physicalWidth:number) {
    if(!Number.isFinite(height)||height<=0||!Number.isFinite(physicalWidth)||physicalWidth<=0)throw new Error('Invalid Home viewport');
    const scale=Math.max(1,Math.min(2,physicalWidth/720));
    return {logical:[720,height],pixels:[Math.round(720*scale),Math.round(height*scale)],scale,offset:(height-1280)/2};
}
