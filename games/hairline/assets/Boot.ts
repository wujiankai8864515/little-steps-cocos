import { _decorator, Component, profiler, ResolutionPolicy, UITransform, view } from 'cc';
import { HairlineGame } from './game/HairlineGame';
const {ccclass}=_decorator;
@ccclass('Boot')
export class Boot extends Component {
 private app:HairlineGame;
 start(){view.setDesignResolutionSize(720,1280,ResolutionPolicy.SHOW_ALL);profiler.hideStats();this.app=new HairlineGame(this.node);void this.app.start();}
 update(dt:number){this.app?.update(dt);}
 onDestroy(){this.app?.dispose();}
}
