import { Graphics, Node, sys, UITransform, Widget } from 'cc';
export function box(node:Node,x:number,y:number,w:number,h:number){node.setPosition(x,-y);node.getComponent(UITransform).setContentSize(w,h);}
export function repaintPanel(node:Node,w:number,h:number,radius=0,stroke=false){const g=node.getComponent(Graphics);node.getComponent(UITransform).setContentSize(w,h);g.clear();g.roundRect(0,-h,w,h,radius);g.fill();if(stroke)g.stroke();}
export function safeViewport(height:number){const s=sys.getSafeAreaRect(false);if(!(s.width>0&&s.height>0))return [0,0,720,height];const x=Math.max(0,s.x),y=Math.max(0,height-s.y-s.height);return [x,y,Math.max(0,Math.min(720-x,s.width)),Math.max(0,Math.min(height-y,s.height))];}
// Artwork stays width-complete. Only interactive content shrinks on short screens.
export function pageLayout(height:number){if(!Number.isFinite(height)||height<=0)throw new Error('Invalid page height');const scale=Math.min(1,height/1280);return {scale,x:(720-720*scale)/2,offset:(height-1280*scale)/2,top:-(height-1280*scale)/2/scale,bottom:1280+(height-1280*scale)/2/scale};}
// The target must be an ancestor. Widgets share the actual screen/safe-area origin,
// independently of the centred illustration and its offscreen render camera.
export function pinTop(node:Node,target:Node,left:number,top:number){const w=node.getComponent(Widget)||node.addComponent(Widget);w.target=target;w.alignMode=Widget.AlignMode.ON_WINDOW_RESIZE;w.isAlignTop=true;w.isAlignLeft=true;w.isAlignBottom=false;w.isAlignRight=false;w.isAbsoluteTop=true;w.isAbsoluteLeft=true;w.top=top;w.left=left;w.updateAlignment();return w;}
