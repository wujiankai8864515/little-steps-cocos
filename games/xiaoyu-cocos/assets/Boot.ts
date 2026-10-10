import { _decorator, Component, ResolutionPolicy, view } from 'cc';
import { Application } from './game/Application';
const { ccclass } = _decorator;

@ccclass('Boot')
export class Boot extends Component {
    private application: Application;
    start() {
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_WIDTH);
        this.application = new Application(this.node);
        this.application.start().catch(error => console.error('[LittleSteps] startup failed', error));
    }

    update(deltaTime: number) {
        this.application?.advance(deltaTime);
    }
    onDestroy() { this.application?.dispose(); }
}

