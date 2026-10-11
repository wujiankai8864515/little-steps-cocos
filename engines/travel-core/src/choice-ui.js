// Shared modal geometry, typography and owned pointer/scroll state. Game prose,
// portraits, sounds and save decisions stay with the consuming game page.
function ellipseBubbleContour(card,tip,above=false){
    const out=[],[x,y,w,h]=card;
    for(let i=0;i<=64;i++){const a=Math.PI*2*i/64,k=1+.012*Math.sin(a*5)+.007*Math.cos(a*7);out.push([x+w/2+Math.cos(a)*w/2*k,y+h/2+Math.sin(a)*h/2*k]);if(i===(above?43:22)){out.push(tip.slice());const next=Math.PI*2*(i+1)/64;out.push([x+w/2+Math.cos(next)*w*.435,y+h/2+Math.sin(next)*h*.435]);}}
    return out;
}
function choiceBubbleLayout(body,safe,anchor,count,options={}){
    const available=[safe[0]+6,safe[1]+6,safe[2]-12,safe[3]-12],w=Math.min(body[2],available[2]),h=Math.min(body[3],available[3]);
    const card=[Math2D.clamp(body[0],available[0],available[0]+available[2]-w),Math2D.clamp(body[1],available[1],available[1]+available[3]-h),w,h],pad=options.padding||[28,20],content=[card[0]+pad[0],card[1]+pad[1],w-pad[0]*2,h-pad[1]*2];
    const rows=Math.ceil(count/2),height=Math.max(46,options.choiceHeight||58),hint=options.hint?(options.hintHeight||26):0,textHeight=Math.max(1,content[3]-rows*height-Math.max(0,rows-1)*12-(rows?12:0)-hint-(hint?4:0));
    const choices=Array.from({length:count},(_,i)=>{const row=Math.floor(i/2),columns=Math.min(2,count-row*2),width=(content[2]-12*(columns-1))/columns;return [content[0]+i%2*(width+12),content[1]+textHeight+12+row*(height+12),width,height];});
    const above=anchor[1]<card[1],base=above?card[1]:card[1]+h,tip=[Math2D.clamp(Math2D.clamp(anchor[0],available[0],available[0]+available[2]),card[0]+22,card[0]+w-22),Math2D.clamp(Math2D.clamp(anchor[1],available[1],available[1]+available[3]),base-26,base+26)];
    return {card,text:[content[0],content[1],content[2],textHeight],choices,hint:hint?[content[0],content[1]+content[3]-hint,content[2],hint]:null,close:[card[0]+w-41,card[1]-2,46,46],tip,above};
}
class ChoicePointer {
    constructor(){this.cancel();}
    cancel(){this.owner=null;this.target='';this.valid=false;this.last=null;}
    inside(at,r){return !!r&&at.length===2&&at.every(Number.isFinite)&&at[0]>=r[0]&&at[1]>=r[1]&&at[0]<r[0]+r[2]&&at[1]<r[1]+r[3];}
    targetAt(at,layout,interaction,close){if(close&&this.inside(at,layout.close))return 'close';if(!this.inside(at,interaction))return 'outside';if(this.inside(at,layout.text))return 'scroll';const i=layout.choices.findIndex(r=>this.inside(at,r));return i>=0?String(i):'';}
    down(id,at,layout,interaction,phase,supported,close=true){if(this.owner!==null)return;this.owner=id;this.last=at.slice();this.target=this.targetAt(at,layout,interaction,close);if(phase==='closing'||phase==='hidden'||phase!=='hold'&&this.target!=='outside'&&this.target!=='close'||!supported&&/^\d+$/.test(this.target))this.target='';this.valid=!!this.target;}
    move(id,at,layout,interaction,close=true){if(this.owner!==id)return 0;const delta=this.last[1]-at[1];this.last=at.slice();if(this.target==='scroll')return delta;if(this.targetAt(at,layout,interaction,close)!==this.target)this.valid=false;return 0;}
    up(id,at,layout,interaction,phase,supported,close=true){if(id!==this.owner)return null;this.move(id,at,layout,interaction,close);const target=this.valid?this.target:'';this.cancel();return phase==='closing'||phase==='hidden'||target==='scroll'||(/^\d+$/.test(target)&&(phase!=='hold'||!supported))?'':target;}
}
function createChoiceBubble(cc,ui,parent,font,message,captions,anchor,safe,options={}){
    const {node,color,polygon}=ui,root=node(parent,'ChoiceSpeechBubble',[0,0,1,1]),shape=node(root,'EllipsePaper',[0,0,1,1]),g=shape.addComponent(cc.Graphics),shapeOpacity=shape.addComponent(cc.UIOpacity),content=node(root,'Content',[0,0,1,1]),contentOpacity=content.addComponent(cc.UIOpacity),owner=new ChoicePointer();
    let supported=true,phase='pop',time=0,alpha=0,scroll=0,decided=false,layout,lastScale=NaN;
    const checked=value=>{if(!options.hasGlyph||Array.from(value).every(c=>c==='\n'||c==='\r'||c==='\t'||options.hasGlyph(c)))return value;supported=false;const fallback=options.unsupportedText||'';return Array.from(fallback).every(c=>options.hasGlyph(c))?fallback:'';};
    message=checked(message);captions=captions.map(checked);const hint=checked(options.hint||''),ink=options.ink||[.37647,.23137,.13333,1],paper=options.paper||[1,.9451,.8392,1],edge=options.edge||[.7882,.6549,.4431,1];
    const textNode=node(content,'MessageViewport',[0,0,1,1]);textNode.addComponent(cc.Mask);const textRoot=node(textNode,'Message',[0,0,1,1]),text=textRoot.addComponent(cc.Label);
    const labels=captions.map((caption,i)=>{const n=node(content,'Option'+i,[0,0,1,1]);return {node:n,label:n.addComponent(cc.Label),caption};}),hintNode=node(content,'Hint',[0,0,1,1]),hintLabel=hintNode.addComponent(cc.Label),closeNode=node(content,'Close',[0,0,1,1]),closeGraphics=closeNode.addComponent(cc.Graphics);
    const metrics=options.fontMetrics||{height:1.2,ascent:.97,descent:.23};
    function fit(label,value,r,point,minimum,scrollable=false){
        const n=label.node,bounds=n.getComponent(cc.UITransform);label.font=font;label.string=value;label.enableWrapText=true;label.horizontalAlign=cc.Label.HorizontalAlign.CENTER;label.verticalAlign=cc.Label.VerticalAlign.CENTER;label.color=color(ink);label.overflow=cc.Label.Overflow.RESIZE_HEIGHT;
        let measured=0;
        for(;;){label.fontSize=point;label.lineHeight=point*metrics.height;bounds.setContentSize(r[2],r[3]);label.updateRenderData(true);measured=Math.max(0,bounds.height-.26*label.lineHeight);if(measured<=r[3]||point<=minimum)break;point--;}
        const h=scrollable?Math.max(r[3],measured):r[3];label.overflow=cc.Label.Overflow.CLAMP;bounds.setContentSize(r[2],h);n.setPosition(r[0],-(r[1]+(metrics.ascent-metrics.descent-.74)*point/2));return {height:h,point};
    }
    // The game supplies a renderer backed by already-admitted generic drawing
    // resources; contour, alpha and line geometry remain framework-owned.
    const drawing=options.createDrawing;
    const outline=drawing?drawing(shape,'BubbleOutline'):null;
    const closePaper=drawing?drawing(closeNode,'ClosePaper'):null;
    const closeRim=drawing?drawing(closeNode,'CloseRim'):null;
    const closeCross=drawing?drawing(closeNode,'CloseCross'):null;
    const closeOpacity=closeNode.addComponent(cc.UIOpacity);
    // Close paper follows shape alpha; its X follows text alpha independently.
    if(drawing){root.addChild(closeNode);for(const layer of [closePaper,closeRim,closeCross])layer.root.addComponent(cc.UIOpacity);}
    let textSize;
    function positionScroll(){const offset=(metrics.ascent-metrics.descent-.74)*textSize.point/2;textRoot.setPosition(0,scroll-offset);}
    function relayout(nextSafe=safe,nextAnchor=anchor){
        safe=nextSafe.slice();anchor=nextAnchor.slice();owner.cancel();lastScale=NaN;layout=choiceBubbleLayout(options.bodyRect,safe,anchor,captions.length,Object.assign({},options,{hint}));
        const r=layout.text;textNode.setPosition(r[0],-r[1]);textNode.getComponent(cc.UITransform).setContentSize(r[2],r[3]);textSize=fit(text,message,[0,0,r[2],r[3]],options.fontSize||24,options.minimumFontSize||16,true);scroll=Math2D.clamp(scroll,0,textSize.height-r[3]);positionScroll();
        labels.forEach((v,i)=>{const r=layout.choices[i];fit(v.label,v.caption,[r[0]+4,r[1]+3,r[2]-8,r[3]-6],options.choiceFontSize||24,15);});
        hintNode.active=!!layout.hint;if(layout.hint)fit(hintLabel,hint,layout.hint,options.hintFontSize||16,14);
        closeNode.active=options.showClose!==false;closeNode.setPosition(layout.close[0],-layout.close[1]);closeNode.getComponent(cc.UITransform).setContentSize(46,46);paintClose();
    }
    function paintClose(){
        if(drawing){
            closePaper.draw(filledCircle([23,23],20),paper);
            closeRim.draw(featherPolyline(Array.from({length:32},(_,i)=>[23+Math.cos(i*Math.PI*2/31)*20,23+Math.sin(i*Math.PI*2/31)*20]),1.5),edge);
            closeCross.draw(mergeDrawingMeshes([featherLine([17,17],[29,29],2.5),featherLine([29,17],[17,29],2.5)]),ink);
            return;
        }
        const c=closeGraphics;c.clear();c.fillColor=color(paper);c.circle(23,-23,20);c.fill();c.strokeColor=color(edge);c.lineWidth=1.5;c.circle(23,-23,20);c.stroke();c.strokeColor=color(ink);c.lineWidth=2.5;c.moveTo(17,-17);c.lineTo(29,-29);c.moveTo(29,-17);c.lineTo(17,-29);c.stroke();}
    function paint(scale){if(scale===lastScale)return;lastScale=scale;g.clear();const r=layout.card,center=[r[0]+r[2]/2,r[1]+r[3]/2],points=ellipseBubbleContour(r,layout.tip,layout.above).map(p=>p.map((v,i)=>center[i]+(v-center[i])*scale));polygon(g,points.map(p=>[p[0],p[1]+4]),[.23,.12,.055,.12]);polygon(g,points,paper,outline?null:[edge[0],edge[1],edge[2],.58],1.5);if(outline)outline.draw(featherPolyline(points.concat([points[0]]),1.5),[edge[0],edge[1],edge[2],.58]);}
    const api={root,text,layout:relayout,close(){if(phase==='closing'||phase==='hidden')return;owner.cancel();phase='closing';time=0;},scrollBy(delta){if(!Number.isFinite(delta)||phase!=='hold')return;scroll=Math2D.clamp(scroll+delta,0,textSize.height-layout.text[3]);positionScroll();},advance(delta){
        time+=Number.isFinite(delta)?Math.max(0,delta):0;let scale=1,shapeAlpha=1,textAlpha=1;
        if(phase==='pop'){const t=Math2D.clamp(time/.25,0,1);scale=.91+.09*(1-(1-t)**3)+Math.sin(Math.PI*t)*.045;shapeAlpha=Math.min(t*4,1);textAlpha=0;if(t>=1){phase='reveal';time=0;scale=1;}}
        else if(phase==='reveal'){const t=Math2D.clamp(time/.2,0,1);textAlpha=Math2D.smoothstep(0,1,t);if(t>=1){phase='hold';time=0;}}
        else if(phase==='closing'){const t=Math2D.clamp(time/.19,0,1);scale=1-.07*t*t;shapeAlpha=1-t;textAlpha=Math.max(1-1.6*t,0);if(t>=1){phase='hidden';root.active=false;}}
        paint(scale);shapeOpacity.opacity=255*shapeAlpha;alpha=textAlpha;contentOpacity.opacity=255*alpha;if(drawing){closeOpacity.opacity=255;closePaper.root.getComponent(cc.UIOpacity).opacity=255*shapeAlpha;closeRim.root.getComponent(cc.UIOpacity).opacity=255*shapeAlpha;closeCross.root.getComponent(cc.UIOpacity).opacity=255*textAlpha;}
    },down(id,at){owner.down(id,at,layout,options.interactionRect||layout.card,phase,supported,options.showClose!==false);},move(id,at){api.scrollBy(owner.move(id,at,layout,options.interactionRect||layout.card,options.showClose!==false));},up(id,at){const target=owner.up(id,at,layout,options.interactionRect||layout.card,phase,supported,options.showClose!==false);if(target&&!decided){decided=true;api.close();if(target==='close'||target==='outside'){if(options.onCancel)options.onCancel();}else if(options.onChoice)options.onChoice(Number(target));}return target!==null;},cancelPointer(){owner.cancel();},snapshot(){return {phase,card:layout.card.slice(),choices:layout.choices.map(r=>r.slice()),close:layout.close.slice(),textRect:layout.text.slice(),fontSize:textSize.point,textHeight:textSize.height,scroll,contentSupported:supported,contentAlpha:alpha,capturedPointer:owner.owner,decided};}};
    relayout();api.advance(0);return api;
}
Object.assign(api,{ellipseBubbleContour,choiceBubbleLayout,ChoicePointer});
