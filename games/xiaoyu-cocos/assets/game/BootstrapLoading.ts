import { Color, Graphics, Node } from 'cc';
import { nodeAt } from './Visual';

// Survives the handoff from native first-screen to the first admitted page.
// No texture, font, resource manifest or optional-page bundle is required.
export class BootstrapLoading {
    readonly root:Node;
    constructor(parent:Node,height:number){
        this.root=nodeAt(parent,'ImmediateLoading',0,0,720,height);
        const g=this.root.addComponent(Graphics);
        for(let i=0;i<40;i++){
            const glow=Math.max(0,1-Math.abs((i+.5)/40-.5)*2);
            g.fillColor=new Color(249+glow*5,223+glow*18,179+glow*28);
            g.rect(0,-(i+1)*height/40,720,height/40+.5);g.fill();
        }
        g.fillColor=new Color(218,191,143);g.roundRect(182,-height*.744,356,height*.016,9);g.fill();
        g.fillColor=new Color(221,166,64);g.roundRect(182,-height*.744,36,height*.016,9);g.fill();
        console.info('[LittleSteps] COCOS_LOADING_FIRST_DRAW');
    }
    dispose(){this.root.active=false;this.root.destroy();}
}
