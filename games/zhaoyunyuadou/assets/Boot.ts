import { _decorator, Component, profiler, ResolutionPolicy, UITransform, view } from 'cc';
import { GameApp } from './game/GameApp';
const { ccclass } = _decorator;

@ccclass('Boot')
export class Boot extends Component {
    private application: GameApp;
    private resize = () => this.application?.resize(this.node.getComponent(UITransform)!.height);
    start() {
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_WIDTH);
        profiler.hideStats();
        this.application = new GameApp(this.node);
        this.node.on(NodeSizeChanged, this.resize);
        void this.application.start();
    }
    update(deltaTime: number) { this.application?.advance(deltaTime); }
    onDestroy() { this.node.off(NodeSizeChanged, this.resize); this.application?.dispose(); }
}
const NodeSizeChanged = 'size-changed';

