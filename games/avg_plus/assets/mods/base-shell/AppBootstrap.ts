import {
    _decorator,
    Button,
    Color,
    Component,
    Graphics,
    HorizontalTextAlignment,
    instantiate,
    JsonAsset,
    Label,
    Layout,
    Node,
    Prefab,
    profiler,
    resources,
    UITransform,
    VerticalTextAlignment,
} from 'cc';
import { GamePageUI } from '../base-card/GamePageUI';
import { AvgPlayer } from '../base-avg/AvgPlayer';

import { TaskScope } from '../../foundation/Tasks';
import { Runtime } from '../../foundation/Runtime';
import { manifest } from './ModManifest';

const { ccclass, executionOrder } = _decorator;
const PACKAGED_CONTENT_LOAD_TIMEOUT_MS = 30000;

/**
 * 最小启动入口：卡牌关卡和剧情阅读共用一个简单目录。
 */
@ccclass('AppBootstrap')
@executionOrder(-10000)
export class AppBootstrap extends Component {
    private readonly lifetime = new TaskScope();
    private shell: Runtime | null = null;
    private _screen: Node | null = null;
    private _loading = false;

    protected onLoad(): void {
        profiler.hideStats();
    }

    protected start(): void {
        this.shell = new Runtime([{
            manifest, initialState: {}, actions: ['shell.open'], validate: () => {},
            execute: ctx => { ctx.result = { screen: 'catalog' }; },
            render: () => [{ id: 'shell.catalog', timeoutMs: 10000, run: () => this.showLevelList() }],
        }]);
        void this.shell.open().then(() => this.shell!.dispatch({ type: 'shell.open' })).catch(error => {
            console.error('[Shell]', error); this.setMessage('启动失败，请检查模块配置');
        });
    }

    protected onDestroy(): void { this.lifetime.dispose(); void this.shell?.dispose(); }

    public async showLevelList(): Promise<void> {
        if (this._loading || this.lifetime.cancelled) return;
        this._loading = true;
        this.replaceScreen(this.createLevelListShell());

        try {
            const assets = await this.lifetime.run(
                () => this.loadLevels(),
                PACKAGED_CONTENT_LOAD_TIMEOUT_MS,
            );
            this.lifetime.check();
            const levelIds = assets
                .map((asset) => {
                    const json = asset.json as { levelId?: unknown } | null;
                    return typeof json?.levelId === 'string' ? json.levelId : '';
                })
                .filter((levelId) => levelId.length > 0)
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

            this.renderLevelButtons(levelIds);
        } catch (error) {
            if (this.lifetime.cancelled) return;
            console.error('[AppBootstrap] 读取关卡列表失败。', error);
            this.setMessage('读取关卡失败\n请检查 config/card-levels');
        } finally {
            this._loading = false;
        }
    }

    private loadLevels(): Promise<JsonAsset[]> {
        return new Promise((resolve, reject) => {
            resources.loadDir('config/card-levels', JsonAsset, (error, assets) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(assets);
            });
        });
    }

    private createLevelListShell(): Node {
        const root = new Node('LevelListRoot');
        root.layer = this.node.layer;
        root.addComponent(UITransform).setContentSize(1181, 2556);

        const title = this.createLabel('选择内容', 58, new Color(255, 255, 255, 255));
        title.name = 'title';
        title.setPosition(0, 760);
        root.addChild(title);

        const message = this.createLabel('正在读取内容…', 34, new Color(225, 225, 225, 255));
        message.name = 'message';
        message.setPosition(0, 630);
        root.addChild(message);

        const list = new Node('levelLayout');
        list.layer = root.layer;
        list.addComponent(UITransform).setContentSize(860, 1200);
        const layout = list.addComponent(Layout);
        layout.type = Layout.Type.VERTICAL;
        layout.resizeMode = Layout.ResizeMode.CONTAINER;
        layout.spacingY = 36;
        list.setPosition(0, 250);
        root.addChild(list);

        return root;
    }

    private renderLevelButtons(levelIds: string[]): void {
        const root = this._screen;
        const list = root?.getChildByName('levelLayout') ?? null;
        if (!root || !list) return;

        list.removeAllChildren();
        this.setMessage('');

        const dramaButton = this.createLevelButton(
            '剧情：霸总的假未婚妻',
            new Color(143, 58, 149, 250),
        );
        dramaButton.on(Button.EventType.CLICK, () => void this.openAvg(), this);
        list.addChild(dramaButton);

        for (const levelId of levelIds) {
            const button = this.createLevelButton(levelId);
            button.on(Button.EventType.CLICK, () => void this.openGame(levelId), this);
            list.addChild(button);
        }

        list.getComponent(Layout)?.updateLayout(true);
    }

    private createLevelButton(levelId: string, color = new Color(38, 73, 112, 245)): Node {
        const node = new Node(levelId);
        node.layer = this.node.layer;
        node.addComponent(UITransform).setContentSize(820, 128);

        const background = node.addComponent(Graphics);
        background.fillColor = color;
        background.roundRect(-410, -64, 820, 128, 22);
        background.fill();

        node.addComponent(Button);

        const labelNode = this.createLabel(levelId, 38, new Color(255, 255, 255, 255));
        node.addChild(labelNode);
        return node;
    }

    private async openAvg(): Promise<void> {
        if (this._loading || this.lifetime.cancelled) return;
        this._loading = true;
        this.setMessage('正在进入第一章…');

        try {
            const avgNode = new Node('AvgPlayerRoot');
            avgNode.layer = this.node.layer;
            avgNode.addComponent(UITransform).setContentSize(1181, 2556);
            const player = avgNode.addComponent(AvgPlayer);
            this.replaceScreen(avgNode);
            await this.lifetime.run(
                () => player.open(() => void this.showLevelList()),
                PACKAGED_CONTENT_LOAD_TIMEOUT_MS,
            );
        } catch (error) {
            if (this.lifetime.cancelled) return;
            console.error('[AppBootstrap] 进入第一章失败。', error);
            this._loading = false;
            await this.showLevelList();
            this.setMessage('进入第一章失败');
        } finally {
            this._loading = false;
        }
    }

    private createLabel(text: string, fontSize: number, color: Color): Node {
        const node = new Node('label');
        node.layer = this.node.layer;
        node.addComponent(UITransform).setContentSize(900, 120);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = Math.round(fontSize * 1.25);
        label.color = color;
        label.horizontalAlign = HorizontalTextAlignment.CENTER;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        return node;
    }

    private setMessage(message: string): void {
        const label = this._screen?.getChildByName('message')?.getComponent(Label) ?? null;
        if (label) {
            label.string = message;
            label.node.active = message.length > 0;
        }
    }

    private async openGame(levelId: string): Promise<void> {
        if (this._loading || this.lifetime.cancelled) return;
        this._loading = true;
        this.setMessage('正在进入关卡…');

        try {
            // 打包环境首次解包 prefab 可能超过 TaskScope 的默认 8 秒。
            const prefab = await this.lifetime.run(
                () => this.loadGamePrefab(),
                PACKAGED_CONTENT_LOAD_TIMEOUT_MS,
            );
            this.lifetime.check();
            const gameNode = instantiate(prefab);
            const gamePage = gameNode.getComponent(GamePageUI);
            if (!gamePage) {
                gameNode.destroy();
                throw new Error('gamePage.prefab 根节点没有 GamePageUI。');
            }

            this.replaceScreen(gameNode);
            await this.lifetime.run(
                () => gamePage.open(levelId, () => void this.showLevelList()),
                PACKAGED_CONTENT_LOAD_TIMEOUT_MS,
            );
        } catch (error) {
            if (this.lifetime.cancelled) return;
            console.error(`[AppBootstrap] 进入关卡失败：${levelId}`, error);
            this._loading = false;
            await this.showLevelList();
            this.setMessage(`进入关卡失败：${levelId}`);
        } finally {
            this._loading = false;
        }
    }

    private loadGamePrefab(): Promise<Prefab> {
        return new Promise((resolve, reject) => {
            resources.load('prefabs/gamePage', Prefab, (error, prefab) => {
                if (error || !prefab) {
                    reject(error ?? new Error('gamePage.prefab 加载结果为空。'));
                    return;
                }
                resolve(prefab);
            });
        });
    }

    private replaceScreen(next: Node): void {
        if (this._screen?.isValid) {
            this._screen.destroy();
        }
        this._screen = next;
        next.layer = this.node.layer;
        this.node.addChild(next);
        next.setPosition(0, 0, 0);
    }
}
