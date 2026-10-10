import { Director, director, EffectAsset, Node, resources, UITransform } from 'cc';
import { GameAssets } from './Assets';
import { lifetime, Scope } from './Engine';
import { HomePage } from './HomePage';
import { LoginPage } from './LoginPage';
import { nodeAt } from './Visual';

export class Application {
    readonly assets = new GameAssets();
    private scope = lifetime();
    private pageScope: Scope;
    private page: {advance(delta: number): void};
    private root: Node;
    private height: number;
    constructor(canvas: Node) {
        const size = canvas.getComponent(UITransform).contentSize;
        this.height = size.height;
        this.root = nodeAt(canvas, 'LittleSteps', -size.width / 2, -size.height / 2, size.width, size.height);
        // nodeAt flips downward y, placing this root at the Canvas top left.
        this.scope.own(() => { this.root.active = false; this.root.destroy(); });
    }
    async start(route: 'login' | 'home' = 'login') {
        await this.assets.initialize(this.scope);
        if (route === 'home') return this.home();
        this.pageScope = lifetime(this.scope);
        await this.assets.acquireGroups(['shared_boot_ui', 'login'], this.pageScope);
        const effect = await this.pageScope.guard(new Promise<EffectAsset>((resolve, reject) => resources.load('effects/login-peek', EffectAsset, (e, value) => e ? reject(e) : resolve(value))));
        const page = new LoginPage(this.root, this.assets, this.pageScope, effect, this.height);
        page.onEnter = () => { console.info('[LittleSteps] comic entry requested; opening sequence integration pending'); };
        this.page = page;
        console.info('[LittleSteps] login first frame pending draw');
        director.once(Director.EVENT_AFTER_DRAW, () => { if (this.pageScope.active) console.info('[LittleSteps] login first draw'); });
    }
    private async home() {
        this.pageScope = lifetime(this.scope);
        await this.assets.acquireGroups(['shared_boot_ui', 'home'], this.pageScope);
        this.page = new HomePage(this.root, this.assets, this.pageScope, this.height);
        director.once(Director.EVENT_AFTER_DRAW, () => { if (this.pageScope.active) console.info('[LittleSteps] Home first draw'); });
    }
    advance(delta: number) { if (this.scope.active && this.page) this.page.advance(delta); }
    dispose() { this.scope.dispose(); }
}
