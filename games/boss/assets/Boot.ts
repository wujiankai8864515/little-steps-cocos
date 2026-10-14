import { _decorator, Component, view, ResolutionPolicy, profiler } from 'cc';
import { BossApp } from './runtime/BossApp';
const { ccclass } = _decorator;

@ccclass('Boo')
export class Boo extends Component {
    private app: BossApp | null = null;
    start() {
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.SHOW_ALL);
        profiler.hideStats();
        this.app = new BossApp(this.node);
        this.app.boot();
    }

    update(deltaTime: number) {
        this.app?.update(deltaTime);
    }
    onDestroy() { this.app?.destroy(); this.app = null; }
}

