import { Graphics, Node, sys, UITransform } from 'cc';
export function box(node:Node,x:number,y:number,w:number,h:number){node.setPosition(x,-y);node.getComponent(UITransform).setContentSize(w,h);}
export function repaintPanel(node:Node,w:number,h:number,radius=0,stroke=false){const g=node.getComponent(Graphics);node.getComponent(UITransform).setContentSize(w,h);g.clear();g.roundRect(0,-h,w,h,radius);g.fill();if(stroke)g.stroke();}
export function safeViewport(height:number){const s=sys.getSafeAreaRect(false);return [Math.max(0,s.x),Math.max(0,height-s.y-s.height),Math.min(720,s.width),Math.min(height,s.height)];}
