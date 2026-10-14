import {
    _decorator, BlockInputEvents, Button, Color, director, Director, Graphics,
    HorizontalTextAlignment, Label, Node, Sprite, UIOpacity, UITransform,
    VerticalTextAlignment,
} from 'cc';
import { TaskScope } from '../../foundation/Tasks';
import { CardSpriteLoader } from '../base-card/CardSpriteLoader';
import { PresentationComponent } from '../shared/PresentationComponent';
import { imageSize } from '../shared/ImageLayout';

const { ccclass } = _decorator;
const WIDTH = 1181, HEIGHT = 2556;
const PINK = new Color(255, 163, 204);

/** First game frame: bounded card motion, real preparation stages, then a home crossfade. */
@ccclass('StartupPresentation')
export class StartupPresentation extends PresentationComponent {
    private readonly lifetime = new TaskScope();
    private readonly cards: Node[] = [];
    private status: Label | null = null;
    private fill: Node | null = null;
    private shimmer: Node | null = null;
    private elapsed = 0;
    private progress = 0;
    private targetProgress = 0.08;
    private failed = false;
    private retrying = false;

    public open(): void {
        this.node.addComponent(UITransform).setContentSize(WIDTH, HEIGHT);
        this.node.addComponent(BlockInputEvents);
        this.node.addComponent(UIOpacity);
        const background = this.node.addComponent(Graphics);
        background.fillColor = new Color(24, 14, 45);
        background.rect(-WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT); background.fill();
        for (const [radius, alpha] of [[590, 10], [430, 12], [290, 16]] as const) {
            background.fillColor = new Color(176, 64, 197, alpha);
            background.circle(0, 250, radius); background.fill();
        }
        const title = this.text('Solitaire', 110, 0, 735, 1000, 160);
        title.isBold = true; title.isItalic = true; title.color = PINK;
        const subtitle = this.text('ROMANCE', 29, 0, 638, 800, 65);
        subtitle.color = new Color(234, 205, 244);
        const sprites: Sprite[] = [];
        for (let index = 0; index < 3; index++) {
            const card = this.child('LoadingCard' + index, 194, 272, (index - 1) * 142, 190);
            card.angle = (1 - index) * 14;
            const shadow = this.child('LoadingCardShadow' + index, 194, 272, card.position.x + 12, 166);
            shadow.angle = card.angle; shadow.setSiblingIndex(card.getSiblingIndex());
            const shade = shadow.addComponent(Graphics); shade.fillColor = new Color(5, 3, 15, 95);
            shade.roundRect(-97, -136, 194, 272, 20); shade.fill();
            const paper = card.addComponent(Graphics); paper.fillColor = new Color(216, 251, 239);
            paper.roundRect(-97, -136, 194, 272, 20); paper.fill();
            paper.strokeColor = new Color(144, 205, 181); paper.lineWidth = 6;
            paper.roundRect(-86, -125, 172, 250, 15); paper.stroke();
            const art = new Node('OriginalCardBack'); art.layer = this.node.layer; card.addChild(art);
            art.addComponent(UITransform).setContentSize(194, 272);
            const sprite = art.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprites.push(sprite); this.cards.push(card);
        }
        this.status = this.text('正在准备资源…', 33, 0, -250, 1000, 170);
        this.status.color = new Color(234, 219, 245);
        const track = this.child('ProgressTrack', 540, 10, 0, -365);
        const trackShape = track.addComponent(Graphics); trackShape.fillColor = new Color(97, 74, 119);
        trackShape.roundRect(-270, -5, 540, 10, 5); trackShape.fill();
        this.fill = this.child('ProgressFill', 540, 10, -270, -365);
        const fillShape = this.fill.addComponent(Graphics); fillShape.fillColor = PINK;
        fillShape.roundRect(0, -5, 540, 10, 5); fillShape.fill();
        this.fill.setScale(0, 1, 1);
        this.shimmer = this.child('ProgressShimmer', 30, 30, -270, -365);
        const spark = this.shimmer.addComponent(Graphics); spark.fillColor = new Color(255, 240, 250, 200);
        spark.circle(0, 0, 8); spark.fill();
        this.text('你的下一段故事，即将开始', 26, 0, -470, 980, 80).color = new Color(175, 149, 194);
        // Wait for a drawn game frame before requesting the existing card texture.
        void this.lifetime.run(async scope => {
            await this.firstDraw(); scope.check();
            const back = await CardSpriteLoader.loadSpriteFrame('poker_back_01'); scope.check();
            const size = imageSize(back.originalSize.width, back.originalSize.height, 194, 272);
            sprites.forEach(sprite => {
                if (!sprite.isValid) return;
                sprite.node.getComponent(UITransform)?.setContentSize(size.width, size.height);
                sprite.trim = false;
                sprite.spriteFrame = back;
            });
        }, 15000).catch(error => { if (!this.lifetime.cancelled) console.warn('[Startup cards]', error); });
    }

    public async firstDraw(): Promise<void> {
        await this.lifetime.run(scope => new Promise<void>(resolve => {
            let release = () => {};
            const done = () => { release(); resolve(); };
            release = scope.own(() => director.off(Director.EVENT_AFTER_DRAW, done));
            director.once(Director.EVENT_AFTER_DRAW, done);
        }), 15000);
        this.lifetime.check();
    }

    public setStage(message: string, progress?: number): void {
        if (this.status) this.status.string = message;
        if (progress !== undefined) this.targetProgress = Math.max(this.targetProgress, Math.min(1, progress));
    }

    public async finish(): Promise<void> {
        this.setStage('准备好了', 1);
        await this.firstDraw();
        const check = this.visualCheckpoint();
        await this.waitForVisual(done => this.visualTween(this.node.getComponent(UIOpacity)!)
            .to(0.28, { opacity: 0 }, { easing: 'quadOut' }).call(done).start());
        check(); this.node.destroy();
    }

    public fail(message: string, retry: () => void): void {
        this.failed = true; this.setStage(message);
        const button = this.child('RetryStartup', 310, 100, 0, -660);
        const shape = button.addComponent(Graphics); shape.fillColor = new Color(197, 36, 126);
        shape.roundRect(-155, -50, 310, 100, 50); shape.fill(); button.addComponent(Button);
        const label = this.text('重新尝试', 32, 0, 0, 300, 100, button); label.color = Color.WHITE;
        button.on(Node.EventType.TOUCH_END, () => {
            if (this.retrying) return; this.retrying = true; retry();
        });
    }

    protected update(dt: number): void {
        if (this.failed) return;
        this.elapsed += Math.min(dt, 0.25);
        this.cards.forEach((card, index) => {
            card.setPosition((index - 1) * 142, 190 + Math.sin(this.elapsed * 2 + index * 0.65) * 10);
            card.angle = (1 - index) * 14 + Math.sin(this.elapsed * 1.5 + index) * 1.4;
        });
        this.progress += (this.targetProgress - this.progress) * Math.min(1, dt * 9);
        this.fill?.setScale(this.progress, 1, 1);
        this.shimmer?.setPosition(-270 + 540 * this.progress, -365);
    }

    private child(name: string, width: number, height: number, x: number, y: number): Node {
        const node = new Node(name); node.layer = this.node.layer;
        node.addComponent(UITransform).setContentSize(width, height);
        node.setPosition(x, y); this.node.addChild(node); return node;
    }
    private text(value: string, size: number, x: number, y: number, width: number, height: number, parent = this.node): Label {
        const node = new Node('StartupText'); node.layer = this.node.layer;
        node.addComponent(UITransform).setContentSize(width, height); node.setPosition(x, y); parent.addChild(node);
        const label = node.addComponent(Label); label.string = value; label.fontSize = size; label.lineHeight = size * 1.4;
        label.horizontalAlign = HorizontalTextAlignment.CENTER; label.verticalAlign = VerticalTextAlignment.CENTER;
        return label;
    }
    protected onDestroy(): void { this.lifetime.dispose(); super.onDestroy(); }
}
