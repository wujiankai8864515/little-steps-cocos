// Two update ticks and one actual draw precede the sine-out entrance.
function createPageRouter(cc, owner) {
    let request=null, fade=null, generation=0;
    const event = (type, scope) => new Promise((resolve,reject)=>{
        let settled=false;
        const ready=()=>{if(settled)return;settled=true;resolve();};
        cc.director.once(type,ready);
        scope.own(()=>{cc.director.off(type,ready);if(!settled){settled=true;reject(new CancelledError());}});
    });
    const cancel=()=>{generation++;if(request)request.dispose();request=null;fade=null;};owner.own(cancel);
    return {cancel, async show(root,duration,canRun=()=>true) {
        cancel();const intent=generation,scope=new Lifetime(owner);request=scope;
        const opacity=root.getComponent(cc.UIOpacity)||root.addComponent(cc.UIOpacity);
        root.active=true;root.setSiblingIndex(root.parent.children.length-1);opacity.opacity=0;
        let committed=false;
        scope.own(()=>{if(!committed&&root.isValid){opacity.opacity=255;root.active=false;}});
        try {
            await event(cc.Director.EVENT_AFTER_UPDATE,scope);await event(cc.Director.EVENT_AFTER_UPDATE,scope);
            await event(cc.Director.EVENT_AFTER_DRAW,scope);
            while(!canRun())await event(cc.Director.EVENT_AFTER_UPDATE,scope);
            if(duration>0)await new Promise((resolve,reject)=>{
                fade={root,opacity,duration,elapsed:0,resolve};
                scope.own(()=>{if(fade&&fade.root===root)fade=null;reject(new CancelledError());});
            });
            if(!scope.active||generation!==intent)return false;
            opacity.opacity=255;committed=true;request=null;scope.dispose();return true;
        } catch(error) {scope.dispose();if(error.name==='CancelledError')return false;throw error;}
    }, advance(delta,active) {
        if(!fade||!active)return;fade.elapsed+=Math.max(0,delta);const t=Math2D.clamp(fade.elapsed/fade.duration,0,1);
        fade.opacity.opacity=255*Math.sin(t*Math.PI/2);
        if(t>=1){const completed=fade;fade=null;completed.resolve();}
    }};
}
Object.assign(api,{createPageRouter});
