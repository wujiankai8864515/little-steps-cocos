// Shared UI geometry and pointer ownership. No game text or asset paths here.
function clipPolygonBelow(points, edge) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        const insideA = a[1] <= edge, insideB = b[1] <= edge;
        if (insideA) out.push([...a]);
        if (insideA !== insideB) {
            const u = (edge - a[1]) / (b[1] - a[1]);
            out.push([a[0] + (b[0] - a[0]) * u, edge]);
        }
    }
    return out;
}
function paperBubbleContour(card, tip, above) {
    const [x, y, w, h] = card, points = [[x + 29, y + 6]];
    let cursor = [29, 6];
    const lerp = (a, b, t) => a + (b - a) * t;
    const curve = (a, b, end) => {
        const start = cursor;
        for (let i = 1; i <= 8; i++) {
            const t = i / 8, u = 1 - t;
            points.push([x + u*u*u*start[0]+3*u*u*t*a[0]+3*u*t*t*b[0]+t*t*t*end[0], y + u*u*u*start[1]+3*u*u*t*a[1]+3*u*t*t*b[1]+t*t*t*end[1]]);
        }
        cursor = end;
    };
    const tailX = Math2D.clamp(tip[0] - x, 58, w - 58), relative = [tip[0] - x, tip[1] - y];
    if (above && tip[1] < y - 2) {
        curve([lerp(cursor[0], tailX-10,.3),1],[lerp(cursor[0],tailX-10,.75),3],[tailX-10,3]);
        curve([tailX-8,-4],[relative[0]-4,relative[1]+6],relative);
        curve([relative[0]+7,relative[1]+3],[tailX+12,-5],[tailX+14,3]);
        curve([lerp(cursor[0],w-38,.3),1],[lerp(cursor[0],w-38,.75),3],[w-38,5]);
    } else curve([w*.24,-1],[w*.62,1],[w-38,5]);
    curve([w-10,6],[w+2,h*.23],[w-1,h*.52]);
    curve([w-2,h*.78],[w-12,h-4],[w-37,h-2]);
    if (!above && tip[1] > y+h+2) {
        curve([lerp(cursor[0],tailX+13,.45),h+1],[tailX+24,h-3],[tailX+13,h-2]);
        curve([tailX+12,h+9],[relative[0]+7,relative[1]-2],relative);
        curve([relative[0]-3,relative[1]-7],[tailX-4,h+3],[tailX-9,h-2]);
    }
    curve([lerp(cursor[0],27,.3),h-1],[lerp(cursor[0],27,.75),h+3],[27,h-4]);
    curve([5,h-8],[-2,h*.7],[0,h*.46]);
    curve([1,h*.19],[10,9],[29,6]);
    return points;
}
class SwingFeedback {
    constructor() {this.angle=-.026;this.velocity=0;this.clock=0;this.pressTime=1;this.scale=1;}
    press() {this.pressTime=0;this.velocity+=.12;this.scale=.955;}
    release() {this.pressTime=Math.max(this.pressTime,.075);}
    advance(delta) {
        if(!Number.isFinite(delta))return;
        this.pressTime=Math.min(1,this.pressTime+Math.max(delta,0));
        const phase=this.pressTime/.32;
        this.scale=this.pressTime<.32?1-.045*Math.cos(phase*Math.PI*1.4)*Math.exp(-phase*4):1;
        let remaining=Math2D.clamp(delta,0,.1);
        while(remaining>0){const step=Math.min(remaining,.016);this.clock+=step;const breeze=Math.sin(this.clock*.8)*.009;this.velocity+=(-18*(this.angle-breeze)-4.5*this.velocity)*step;this.angle=Math2D.clamp(this.angle+this.velocity*step,-.045,.045);remaining-=step;}
    }
}
// Captures one modal target. Leaving it cancels permanently, including an
// outside press crossing the paper and returning outside before release.
class BubblePointer {
    constructor(){this.cancel();}
    cancel(){this.owner=null;this.target='';this.valid=false;this.rect=[];}
    down(id,at,card,choices,phase){if(this.owner!==null)return true;this.owner=id;this.target=this.targetAt(at,card,choices);if(phase==='closing'||phase!=='hold'&&this.target!=='outside'&&this.target!=='no')this.target='';this.valid=!!this.target;this.rect=(choices[this.target]||[]).slice();return true;}
    move(id,at,card){if(id!==this.owner)return false;const stays=this.target==='outside'?!this.inside(at,card):this.inside(at,this.rect);if(!stays)this.valid=false;return true;}
    up(id,at,card,choices,phase){if(id!==this.owner)return null;this.move(id,at,card);const accepted=this.valid&&phase!=='closing'&&(phase==='hold'||this.target==='outside'||this.target==='no')&&this.targetAt(at,card,choices)===this.target,target=accepted?this.target:'';this.cancel();return target;}
    inside(at,r){return at.length===2&&at.every(Number.isFinite)&&r.length===4&&at[0]>=r[0]&&at[1]>=r[1]&&at[0]<r[0]+r[2]&&at[1]<r[1]+r[3];}
    targetAt(at,card,choices){if(!at.every(Number.isFinite))return '';if(!this.inside(at,card))return 'outside';for(const name of Object.keys(choices))if(this.inside(at,choices[name]))return name;return '';}
}
function infoBubbleLayout(anchor,safe,naturalWidth,measuredHeight,options={}) {
    const r=safe.slice(),point=options.fontSize||24;
    if(options.aboveOnly){r[3]=Math.min(r[1]+r[3],anchor[1]+6)-r[1];if(r[3]<(options.confirmation?180:130))return [anchor[0],anchor[1],0,0];}
    const available=[r[0]+6,r[1]+6,r[2]-12,r[3]-12],max=Math.min(options.maxWidth||430,available[2]),min=Math.min(options.minWidth||270,max),w=Math2D.clamp(naturalWidth+56,min,max);
    let h=Math.min(Math.max(Math.max(measuredHeight,point*1.5)+44+(options.confirmation?62:0),options.confirmation?130:79),available[3]-24);
    const above=Math2D.clamp(anchor[1]-available[1]-20,0,available[3]-24),below=Math2D.clamp(available[1]+available[3]-anchor[1]-20,0,available[3]-24),under=above<h&&below>above;
    h=Math.min(h,Math.max(under?below:above,80));
    return [Math2D.clamp(anchor[0]-w/2,available[0],available[0]+available[2]-w),Math2D.clamp(under?anchor[1]+20:anchor[1]-h-20,available[1],available[1]+available[3]-h),w,h];
}
function registerUI(cc) {
    const node = (parent, name, rect) => {
        const n = new cc.Node(name); parent.addChild(n); n.setPosition(rect[0],-rect[1]);
        const ui = n.addComponent(cc.UITransform); ui.setAnchorPoint(0,1); ui.setContentSize(rect[2],rect[3]);
        return n;
    };
    const color = (values) => new cc.Color(...values.map(v => v*255));
    const polygon = (g, points, fill, stroke, width = 1.5) => {
        g.moveTo(points[0][0],-points[0][1]);
        points.slice(1).forEach(p => g.lineTo(p[0],-p[1])); g.close();
        g.fillColor = color(fill); g.fill();
        if (stroke) { g.strokeColor = color(stroke); g.lineWidth = width; g.stroke(); }
    };
    function pointer(target, callbacks, enabled = () => true) {
        let captured=-1;
        const point=event=>{const p=event.getUILocation(),local=target.getComponent(cc.UITransform).convertToNodeSpaceAR(new cc.Vec3(p.x,p.y,0));return [local.x,-local.y];};
        const cancel=()=>{if(captured===-1)return;captured=-1;if(callbacks.cancel)callbacks.cancel();};
        const start=event=>{
            if(captured!==-1||!enabled())return;
            const at=point(event),ui=target.getComponent(cc.UITransform);
            if(at[0]<0||at[1]<0||at[0]>=ui.width||at[1]>=ui.height)return;
            captured=event.getID();if(callbacks.down&&callbacks.down(at,captured)===false){captured=-1;return;}event.propagationStopped=true;
        };
        const move=event=>{if(event.getID()!==captured)return;event.propagationStopped=true;if(!enabled()){cancel();return;}if(callbacks.move)callbacks.move(point(event),captured);};
        const end=event=>{if(event.getID()!==captured)return;event.propagationStopped=true;if(!enabled()){cancel();return;}const id=captured;captured=-1;if(callbacks.up)callbacks.up(point(event),id);};
        const cancelled=event=>{if(event.getID()!==captured)return;event.propagationStopped=true;cancel();};
        target.on(cc.Node.EventType.TOUCH_START,start);target.on(cc.Node.EventType.TOUCH_MOVE,move);target.on(cc.Node.EventType.TOUCH_END,end);target.on(cc.Node.EventType.TOUCH_CANCEL,cancelled);
        return {cancel,dispose(){cancel();target.off(cc.Node.EventType.TOUCH_START,start);target.off(cc.Node.EventType.TOUCH_MOVE,move);target.off(cc.Node.EventType.TOUCH_END,end);target.off(cc.Node.EventType.TOUCH_CANCEL,cancelled);}};
    }
    function action(target, callback, enabled = () => true) {
        let pointer = -1, armed = false, generation = 0;
        const inside = (event) => {
            const p = event.getUILocation(), ui = target.getComponent(cc.UITransform);
            const local = ui.convertToNodeSpaceAR(new cc.Vec3(p.x,p.y,0));
            return local.x >= 0 && local.y <= 0 && local.x < ui.width && local.y > -ui.height;
        };
        const cancel = () => { generation++; pointer = -1; armed = false; };
        const start = event => {
            if (pointer !== -1 || !enabled() || !inside(event)) return;
            pointer = event.getID(); armed = true; event.propagationStopped = true;
        };
        const move = event => {
            if (event.getID() !== pointer) return;
            if (!enabled() || !inside(event)) armed = false;
            event.propagationStopped = true;
        };
        const end = event => {
            if (event.getID() !== pointer) return;
            const accepted = armed && enabled() && inside(event), intent = generation;
            pointer = -1; armed = false; event.propagationStopped = true;
            if (accepted) cc.director.once(cc.Director.EVENT_AFTER_UPDATE, () => {
                if (intent === generation && target.isValid && target.activeInHierarchy && enabled()) callback();
            });
        };
        const cancelled=event=>{if(event.getID()!==pointer)return;event.propagationStopped=true;cancel();};
        target.on(cc.Node.EventType.TOUCH_START,start); target.on(cc.Node.EventType.TOUCH_MOVE,move);
        target.on(cc.Node.EventType.TOUCH_END,end); target.on(cc.Node.EventType.TOUCH_CANCEL,cancelled);
        return {cancel, dispose() { cancel(); target.off(cc.Node.EventType.TOUCH_START,start); target.off(cc.Node.EventType.TOUCH_MOVE,move); target.off(cc.Node.EventType.TOUCH_END,end); target.off(cc.Node.EventType.TOUCH_CANCEL,cancelled); }};
    }
    function fixedBubble(parent, font, message, card, anchor, options = {}) {
        const root = node(parent, 'SpeechBubble', [0,0,1,1]), shape = node(root,'PaperShape',[0,0,1,1]);
        const graphics = shape.addComponent(cc.Graphics);
        const content = node(root,'Content',[card[0]+28,card[1]+20,card[2]-56,card[3]-40]);
        const text = content.addComponent(cc.Label); text.overflow = cc.Label.Overflow.RESIZE_HEIGHT; text.font = font; text.string = message;
        text.horizontalAlign = cc.Label.HorizontalAlign.CENTER; text.verticalAlign = cc.Label.VerticalAlign.CENTER;
        text.color = color([.376470588,.231372549,.133333333,1]);
        text.enableWrapText = true; text.overflow = cc.Label.Overflow.RESIZE_HEIGHT;
        let size = options.fontSize || 24, minimum = options.minimumFontSize || Math.max(15,size-8), measured = [];
        const bounds = content.getComponent(cc.UITransform), allowedHeight = card[3]-40-(options.confirmation?62:0);
        while (true) {
            text.fontSize = size; text.lineHeight = size*(options.fontMetrics ? options.fontMetrics.height : 1.2);
            bounds.setContentSize(card[2]-56,allowedHeight);text.updateRenderData(true);
            measured.push({size,width:bounds.width,height:bounds.height,lineHeight:text.lineHeight});
            // Creator 3.8 adds 0.26 line of canvas padding; it is not text height.
            if (bounds.height - .26*text.lineHeight <= allowedHeight || size <= minimum) break;
            size--;
        }
        text.overflow = cc.Label.Overflow.CLAMP; bounds.setContentSize(card[2]-56,allowedHeight);
        if (options.fontMetrics) content.setPosition(card[0]+28,-(card[1]+20+(options.fontMetrics.ascent-options.fontMetrics.descent-.74)*size/2));
        const shapeOpacity = shape.addComponent(cc.UIOpacity), contentOpacity = content.addComponent(cc.UIOpacity);
        let phase = 'pop', time = 0, hold = 0, contentAlpha = 0;
        const paint = scale => {
            const center=[card[0]+card[2]/2,card[1]+card[3]/2];
            graphics.clear();
            const base = card[1] > anchor[1] ? card[1] : card[1]+card[3];
            const tip = [Math2D.clamp(anchor[0],card[0]+22,card[0]+card[2]-22),Math2D.clamp(anchor[1],base-26,base+26)];
            const contour = paperBubbleContour(card,tip,anchor[1]<card[1]).map(p => [center[0]+(p[0]-center[0])*scale,center[1]+(p[1]-center[1])*scale]);
            polygon(graphics,contour.map(p=>[p[0],p[1]+4]),[.23,.12,.055,.12]);
            polygon(graphics,contour,[1,.945098039,.839215686,1],[.788235294,.654901961,.443137255,.58]);
        };
        const api = {root, text, layout(next,at) {card.splice(0,4,...next);anchor.splice(0,2,...at);bounds.setContentSize(Math.max(1,card[2]-56),Math.max(1,card[3]-40-(options.confirmation?62:0)));content.setPosition(card[0]+28,-(card[1]+20+(options.fontMetrics?(options.fontMetrics.ascent-options.fontMetrics.descent-.74)*size/2:0)));}, close() {if(phase==='closing'||phase==='hidden')return;phase='closing';time=0;}, advance(delta) {
            time += Math.max(0,delta);
            let scale = 1, alpha = 1, textAlpha = 1;
            if (phase === 'pop') {
                const t = Math2D.clamp(time/.25,0,1), ease = 1-Math.pow(1-t,3);
                scale = .91+.09*ease+Math.sin(Math.PI*t)*.045; alpha=Math.min(t*4,1);textAlpha=0;
                if (t>=1) {phase='reveal';time=0;scale=1;}
            } else if (phase==='reveal') {
                const t = Math2D.clamp(time/.2,0,1); textAlpha=Math2D.smoothstep(0,1,t);
                if(t>=1) {phase='hold';time=0;}
            } else if (phase==='hold') {
                hold += Math.max(0,delta);
                if (!options.persistent && hold >= (options.holdSeconds || Math.max(2.2,1.55+message.length*.1))) api.close();
            } else if (phase==='closing') {
                const t=Math2D.clamp(time/.19,0,1);scale=1-.07*t*t;alpha=1-t;textAlpha=Math.max(1-1.6*t,0);
                if(t>=1) {phase='hidden';root.active=false;}
            }
            paint(scale);shapeOpacity.opacity=255*alpha;contentAlpha=alpha*textAlpha;contentOpacity.opacity=255*contentAlpha;
        }, snapshot: () => ({phase,fontSize:size,card:[...card],measured,contentAlpha})};
        api.advance(0); return api;
    }
    function infoBubble(parent,font,message,anchor,safe,options={}) {
        const probe=node(parent,'BubbleMeasurement',[0,0,1,1]),label=probe.addComponent(cc.Label),bounds=probe.getComponent(cc.UITransform),point=options.fontSize||24;
        label.font=font;label.string=message;label.fontSize=point;label.lineHeight=point*(options.fontMetrics?options.fontMetrics.height:1.2);label.enableWrapText=false;label.overflow=cc.Label.Overflow.NONE;label.updateRenderData(true);
        const natural=bounds.width,measurements=new Map();
        const initial=infoBubbleLayout(anchor,safe,natural,point*1.5,Object.assign({},options,{aboveOnly:false}));label.enableWrapText=true;label.overflow=cc.Label.Overflow.RESIZE_HEIGHT;bounds.setContentSize(Math.max(1,initial[2]-56),1);label.updateRenderData(true);const measured=Math.max(0,bounds.height-.26*label.lineHeight);measurements.set(Math.max(1,initial[2]-56),measured);probe.destroy();
        const card=infoBubbleLayout(anchor,safe,natural,measured,options),fallback=infoBubbleLayout(anchor,safe,natural,measured,Object.assign({},options,{aboveOnly:false})),api=fixedBubble(parent,font,message,card[2]>0?card:fallback,anchor.slice(),options),advance=api.advance,snapshot=api.snapshot;
        let blocked=false,currentSafe=safe.slice(),lastAnchor=anchor.slice();
        api.layoutFor=(at,nextSafe)=>{
            const initial=infoBubbleLayout(at,nextSafe,natural,point*1.5,Object.assign({},options,{aboveOnly:false})),width=Math.max(1,initial[2]-56);
            if(!measurements.has(width)){
                const probe=node(parent,'BubbleMeasurement',[0,0,width,1]),label=probe.addComponent(cc.Label),bounds=probe.getComponent(cc.UITransform);
                label.font=font;label.string=message;label.fontSize=point;label.lineHeight=point*(options.fontMetrics?options.fontMetrics.height:1.2);label.enableWrapText=true;label.overflow=cc.Label.Overflow.RESIZE_HEIGHT;label.updateRenderData(true);
                measurements.set(width,Math.max(0,bounds.height-.26*label.lineHeight));probe.destroy();
            }
            return infoBubbleLayout(at,nextSafe,natural,measurements.get(width),options);
        };
        api.setSafe=nextSafe=>{if(nextSafe.length!==4||!nextSafe.every(Number.isFinite)||nextSafe[2]<=0||nextSafe[3]<=0)throw new Error('Invalid bubble safe rect');currentSafe=nextSafe.slice();api.setAnchor(lastAnchor);};
        api.setAnchor=at=>{lastAnchor=at.slice();const rect=api.layoutFor(at,currentSafe);blocked=rect[2]===0;api.layout(rect,at);api.root.children.forEach(child=>{child.active=!blocked;});};
        api.advance=delta=>{if(!blocked)advance(delta);};api.snapshot=()=>Object.assign(snapshot(),{speakerClearanceBlocked:blocked});api.setAnchor(anchor);return api;
    }
    function confirmationBubble(parent,font,message,anchor,safe,options={}) {
        const settings=Object.assign({},options,{confirmation:true,persistent:true}),api=infoBubble(parent,font,message,anchor,safe,settings),choices=node(api.root,'Choices',[0,0,1,1]),opacity=choices.addComponent(cc.UIOpacity),owner=new BubblePointer(),buttons={},divider=node(choices,'Divider',[0,0,1,1]).addComponent(cc.Graphics);
        let rects={},decided=false;
        ['yes','no'].forEach((key,index)=>{if(options.cancelOnly&&key==='yes')return;const root=node(choices,key,[0,0,1,1]),text=root.addComponent(cc.Label);text.font=font;text.string=index?(options.cancelText===undefined?'Cancel':options.cancelText):(options.acceptText===undefined?'OK':options.acceptText);text.fontSize=options.fontSize||24;text.lineHeight=text.fontSize*(options.fontMetrics?options.fontMetrics.height:1.2);text.horizontalAlign=cc.Label.HorizontalAlign.CENTER;text.verticalAlign=cc.Label.VerticalAlign.CENTER;const ink=[.376470588,.231372549,.133333333],light=index?(options.cancelLighten||0):0;text.color=color([...ink.map(v=>v+(1-v)*light),1]);text.overflow=cc.Label.Overflow.CLAMP;buttons[key]=root;});
        const setAnchor=api.setAnchor,advance=api.advance,snapshot=api.snapshot;
        api.setAnchor=at=>{setAnchor(at);const state=snapshot(),r=state.card,w=Math.max(1,(r[2]-48)/2);rects=options.cancelOnly?{no:[r[0]+(r[2]-w)/2,r[1]+r[3]-54,w,44]}:{yes:[r[0]+18,r[1]+r[3]-54,w,44],no:[r[0]+30+w,r[1]+r[3]-54,w,44]};Object.keys(buttons).forEach(key=>{const node=buttons[key],r=rects[key];node.setPosition(r[0],-(r[1]+(options.fontMetrics?(options.fontMetrics.ascent-options.fontMetrics.descent-.74)*(options.fontSize||24)/2:0)));node.getComponent(cc.UITransform).setContentSize(r[2],r[3]);});divider.clear();divider.strokeColor=color([.376470588,.231372549,.133333333,.11]);divider.lineWidth=1;divider.moveTo(r[0]+29,-(r[1]+r[3]-60));divider.lineTo(r[0]+r[2]-29,-(r[1]+r[3]-60));divider.stroke();choices.active=!state.speakerClearanceBlocked;};
        api.advance=delta=>{advance(delta);opacity.opacity=255*snapshot().contentAlpha;};
        api.down=(id,at)=>owner.down(id,at,snapshot().card,choices.active?rects:{},snapshot().phase);
        api.move=(id,at)=>owner.move(id,at,snapshot().card);
        api.up=(id,at)=>{const target=owner.up(id,at,snapshot().card,choices.active?rects:{},snapshot().phase);if(target&&!decided){decided=true;api.close();if(options.onDecision)options.onDecision(target==='yes');}return target!==null;};
        api.cancelPointer=()=>owner.cancel();
        api.snapshot=()=>Object.assign(snapshot(),{choices:rects,decided,capturedPointer:owner.owner});api.setAnchor(anchor);return api;
    }
    function hangingReturn(parent, font, rect, callback, enabled = () => true, swing = new SwingFeedback()) {
        const root = node(parent,'HangingReturn',rect), sx=rect[2]/78,sy=rect[3]/128;
        const visual = node(root,'Swing',[39*sx,4*sy,1,1]); visual.setScale(sx,sy,1);
        const g = visual.addComponent(cc.Graphics);
        const outline=[[-25,29],[-30,34],[-29,113],[-24,120],[24,120],[29,115],[30,35],[25,29],[8,27],[-12,28]];
        polygon(g,outline.map(p=>[p[0]+1.5,p[1]+2.5]),[.18,.08,.025,.24]);
        polygon(g,outline,[.596078431,.376470588,.215686275,1]);
        polygon(g,outline.map(p=>[p[0]*.91,(p[1]-74)*.95+74]),[.972549020,.874509804,.674509804,1],[.843137255,.650980392,.396078431,1],1.2);
        const line=(a,b,c,width)=>{g.strokeColor=color(c);g.lineWidth=width;g.moveTo(a[0],-a[1]);g.lineTo(b[0],-b[1]);g.stroke();};
        line([0,0],[-4,31],[.411764706,.262745098,.152941176,1],3);
        line([-2,0],[-2,30],[.701960784,.525490196,.298039216,1],1);
        line([-24,40],[-23,105],[.62,.35,.16,.17],1);line([23,47],[22,112],[.62,.35,.16,.16],1);
        g.strokeColor=color([.518588235,.327529412,.187686275,1]);g.lineWidth=1.5;g.circle(-4,-32,3.5);g.stroke();
        line([-4,27],[-4,34],[.474509804,.313725490,.172549020,1],2);
        line([6,49],[-7,49],[.4,.235294118,.129411765,1],2.8);
        line([-7,49],[-1,43],[.4,.235294118,.129411765,1],2.8);line([-7,49],[0,55],[.4,.235294118,.129411765,1],2.8);
        ['返','回'].forEach((letter,i)=>{
            const n=node(visual,'ReturnLetter'+i,[-20,57+i*26,40,29]),l=n.addComponent(cc.Label);
            l.overflow=cc.Label.Overflow.CLAMP;l.font=font;l.string=letter;l.fontSize=24;l.lineHeight=29;l.horizontalAlign=cc.Label.HorizontalAlign.CENTER;
            l.verticalAlign=cc.Label.VerticalAlign.CENTER;l.color=color([.4,.235294118,.129411765,1]);
        });
        g.fillColor=color([.548392157,.346352941,.198431373,1]);g.circle(0,-119,2.3);g.fill();
        const pin=node(root,'Pin',[39*sx,4*sy,1,1]).addComponent(cc.Graphics);
        pin.fillColor=color([.488784314,.308705882,.176862745,1]);pin.circle(0,0,2.6);pin.fill();
        const hit=node(root,'FixedReturnHitArea',[rect[2]*.09,rect[3]*.23,rect[2]*.82,rect[3]*.76]);
        const binding=action(hit,callback,enabled);
        const press=()=>{if(enabled())swing.press();},release=()=>swing.release();
        hit.on(cc.Node.EventType.TOUCH_START,press);hit.on(cc.Node.EventType.TOUCH_END,release);hit.on(cc.Node.EventType.TOUCH_CANCEL,release);
        return {root,motion:swing,cancel:binding.cancel,dispose(){binding.dispose();hit.off(cc.Node.EventType.TOUCH_START,press);hit.off(cc.Node.EventType.TOUCH_END,release);hit.off(cc.Node.EventType.TOUCH_CANCEL,release);},advance(delta){swing.advance(delta);visual.angle=-swing.angle*180/Math.PI;visual.setScale(sx*swing.scale,sy*swing.scale,1);}};
    }
    return Object.freeze({node, color, polygon, pointer, action, fixedBubble, infoBubble, confirmationBubble, hangingReturn, choiceBubble:(...args)=>createChoiceBubble(cc,{node,color,polygon},...args)});
}
Object.assign(api, {clipPolygonBelow, paperBubbleContour, registerUI, SwingFeedback,infoBubbleLayout,BubblePointer});
