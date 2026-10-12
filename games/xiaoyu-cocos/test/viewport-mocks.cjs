// Exercise the same ancestor/safe-area contract as Cocos Widget. GPU drawing is
// still covered by browser evidence; this adapter only resolves UI transforms.
exports.installViewportMocks=cc=>{
 cc.sys??={getSafeAreaRect:()=>({x:0,y:0,width:0,height:0})};
 cc.Widget=class Widget{
  static AlignMode={ON_WINDOW_RESIZE:1};
  updateAlignment(){const n=this.node,t=this.target;if(!t)return;const p=n.parent?.worldPosition||{x:0,y:0},s=n.parent?.worldScale||{x:1,y:1},o=t.worldPosition||{x:0,y:0};n.setPosition((o.x+this.left-p.x)/s.x,(o.y-this.top-p.y)/s.y);}
 };
 return cc;
};
