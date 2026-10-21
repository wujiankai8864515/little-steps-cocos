import {
    _decorator, BlockInputEvents, Button, Color, Graphics, HorizontalTextAlignment,
    Label, Node, Sprite, SpriteFrame, UITransform, UIOpacity, Vec3, VerticalTextAlignment,
} from 'cc';
import { TaskScope } from '../../foundation/Tasks';
import { PresentationComponent } from '../shared/PresentationComponent';
import { CardSpriteLoader } from './CardSpriteLoader';
import { imageSize } from '../shared/ImageLayout';

const { ccclass } = _decorator;
export interface CompletionView {
    readonly coins: number;
    readonly gems: number;
    /** Already committed by the winning move; this screen only presents its collection. */
    readonly rewardCoins: number;
}
const money = (value: number): string => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

@ccclass('CardCompletionUI')
export class CardCompletionUI extends PresentationComponent {
    private readonly lifetime = new TaskScope();
    private finished = false;
    private continued = false;
    private message: Label | null = null;
    private coinLabel: Label | null = null;
    private medal: Node | null = null;
    private rewardLabel: Label | null = null;
    private coinFrame: SpriteFrame | null = null;
    private controls: Button[] = [];
    private initialCoins = 0;
    private displayedCoins = 0;
    private additionalCoins = 0;

    public async open(view: CompletionView, onContinue: () => void, coinFrame: SpriteFrame): Promise<void> {
        this.initialCoins = view.coins;
        this.displayedCoins = view.coins - view.rewardCoins;
        const medalFrame = await this.lifetime.run(() => CardSpriteLoader.loadSpriteFrame('poker_wild'), 15000);
        this.lifetime.check(); this.coinFrame = coinFrame;
        this.node.addComponent(UITransform).setContentSize(1181, 2556);
        this.node.addComponent(BlockInputEvents);
        const background = this.node.addComponent(Graphics);
        background.fillColor = new Color(27, 15, 51, 185);
        background.rect(-590.5, -1278, 1181, 2556); background.fill();
        for (let radius = 1100; radius >= 90; radius -= 32) {
            background.fillColor = new Color(136, 26, 228, 8);
            background.circle(0, 270, radius); background.fill();
        }
        const title = this.label('Great!', 116, 1040, 200);
        title.node.setPosition(0, 600); title.isBold = true;
        title.node.setScale(0.72, 0.72);
        this.visualTween(title.node).to(0.42, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();

        this.coinLabel = this.wallet(-145, 330, view.coins - view.rewardCoins, coinFrame, 'coin');
        this.wallet(245, 245, view.gems, null, 'gem');
        this.medal = this.child(this.node, 'rewardMedal', 350, 350, 0, 70);
        const glow = this.medal.addComponent(Graphics);
        for (let radius = 250; radius >= 170; radius -= 8) {
            glow.fillColor = new Color(255, 161, 66, 9);
            glow.circle(0, 0, radius); glow.fill();
        }
        this.image(this.medal, 'projectWildCard', medalFrame, 300, 400, 0, 0, 'card');
        const glowAlpha = this.medal.addComponent(UIOpacity);
        this.visualTween(glowAlpha).to(0.48, { opacity: 210 }).to(0.48, { opacity: 255 }).union().repeatForever().start();
        for (let index = 0; index < 12; index++) {
            const angle = index * Math.PI / 6, distance = 190 + (index % 3) * 18;
            const star = this.child(this.medal, 'rewardSparkle', 20, 20, Math.cos(angle) * distance, Math.sin(angle) * distance);
            const g = star.addComponent(Graphics); g.fillColor = new Color(255, 231, 165);
            const radius = 3 + index % 3;
            g.moveTo(0, radius * 2); g.lineTo(radius / 2, radius / 2); g.lineTo(radius * 2, 0);
            g.lineTo(radius / 2, -radius / 2); g.lineTo(0, -radius * 2);
            g.lineTo(-radius / 2, -radius / 2); g.lineTo(-radius * 2, 0); g.lineTo(-radius / 2, radius / 2); g.close(); g.fill();
            const alpha = star.addComponent(UIOpacity);
            this.visualTween(alpha).delay(index * 0.07).to(0.34, { opacity: 30 }).to(0.34, { opacity: 255 }).union().repeatForever().start();
        }
        this.rewardLabel = this.label(money(view.rewardCoins), 62, 800, 110);
        this.rewardLabel.node.setPosition(0, -215); this.rewardLabel.isBold = true;
        this.message = this.label('', 32, 1000, 120); this.message.node.setPosition(0, -655);
        this.controls = [
            this.button('2x coins', -255, new Color(0, 147, 221), () => {
                if (this.message) this.message.string = '视频暂不可用，请稍后再试';
            }, true),
            this.button('Continue', 255, new Color(90, 0, 237), () => {
                if (this.finished) return;
                this.finished = true; this.controls.forEach(button => { button.interactable = false; });
                void this.collect(view).then(() => {
                    this.lifetime.check(); this.deliver(onContinue);
                }).catch(error => {
                    if (this.lifetime.cancelled || !this.node.isValid) return;
                    // The payout remains committed even if the collection presentation failed.
                    console.error('[Completion presentation]', error);
                    this.displayedCoins = view.coins; this.refreshWallet();
                    this.deliver(onContinue);
                });
            }),
        ];
        const opacity = this.node.addComponent(UIOpacity); opacity.opacity = 0;
        this.visualTween(opacity).to(0.3, { opacity: 255 }).start();
    }

    public updateCoins(coins: number): void {
        this.additionalCoins = coins - this.initialCoins;
        this.refreshWallet();
    }
    private refreshWallet(): void {
        if (this.coinLabel) this.coinLabel.string = money(this.displayedCoins + this.additionalCoins);
    }

    private deliver(onContinue: () => void): void {
        if (this.continued) return;
        this.continued = true; onContinue();
    }

    private async collect(view: CompletionView): Promise<void> {
        const check = this.visualCheckpoint();
        if (this.medal) this.medal.active = false;
        if (this.rewardLabel) this.rewardLabel.node.active = false;
        await this.waitForVisual(done => {
            for (let index = 0; index < 10; index++) {
                const angle = index * 2.399963, distance = 45 + index * 15;
                const coin = this.image(this.node, 'collectedCoin', this.coinFrame!, 76, 76,
                    Math.cos(angle) * distance, 70 + Math.sin(angle) * distance, 'coin');
                const alpha = coin.addComponent(UIOpacity);
                this.visualTween(coin).delay(index * 0.055).to(0.82, {
                    position: new Vec3(-267, 1070, 0), scale: new Vec3(0.6, 0.6, 1),
                }, { easing: 'quadIn' }).call(() => { if (coin.isValid) coin.destroy(); }).start();
                this.visualTween(alpha).delay(index * 0.055 + 0.65).to(0.17, { opacity: 0 }).start();
            }
            this.visualTween({ elapsed: 0 }).delay(1.34).call(done).start();
        });
        check(); this.lifetime.check();
        this.displayedCoins = view.coins; this.refreshWallet();
        await this.waitForVisual(done => this.visualTween(this.node.getComponent(UIOpacity)!)
            .delay(0.2).to(0.3, { opacity: 0 }).call(done).start());
        check(); this.lifetime.check();
    }

    private wallet(x: number, width: number, amount: number, frame: SpriteFrame | null, kind: 'coin' | 'gem'): Label {
        const pill = this.child(this.node, 'completionWallet', width, 95, x, 1070);
        const g = pill.addComponent(Graphics); g.fillColor = new Color(25, 14, 44, 205);
        g.roundRect(-width / 2, -47.5, width, 95, 47.5); g.fill();
        if (frame) this.image(pill, 'walletIcon', frame, 76, 76, -width / 2 + 44, 0, kind);
        else {
            const gem=this.child(pill,'gemIcon',76,76,-width/2+44,0),paint=gem.addComponent(Graphics);
            paint.fillColor=new Color(39,210,242);paint.moveTo(-34,9);paint.lineTo(-19,30);
            paint.lineTo(19,30);paint.lineTo(34,9);paint.lineTo(0,-32);paint.close();paint.fill();
            paint.strokeColor=new Color(140,244,255);paint.lineWidth=3;paint.moveTo(-34,9);paint.lineTo(34,9);
            paint.moveTo(-19,30);paint.lineTo(0,-32);paint.lineTo(19,30);paint.stroke();
        }
        const label = this.label(money(amount), 42, width - 92, 85, pill); label.isBold = true; label.node.setPosition(35, 0);
        return label;
    }
    private child(parent: Node, name: string, width: number, height: number, x = 0, y = 0): Node {
        const node = new Node(name); node.layer = parent.layer;
        node.addComponent(UITransform).setContentSize(width, height); node.setPosition(x, y); parent.addChild(node); return node;
    }
    private image(parent: Node, name: string, frame: SpriteFrame, width: number, height: number, x: number, y: number, _shape: 'coin' | 'gem' | 'card'): Node {
        const size=imageSize(frame.originalSize.width,frame.originalSize.height,width,height);
        const node=this.child(parent,name,size.width,size.height,x,y),sprite=node.addComponent(Sprite);
        sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.trim=false;sprite.spriteFrame=frame;return node;
    }
    private label(text: string, size: number, width: number, height: number, parent = this.node): Label {
        const node = this.child(parent, 'label', width, height), label = node.addComponent(Label);
        label.string = text; label.fontSize = size; label.lineHeight = Math.round(size * 1.2); label.color = Color.WHITE;
        label.horizontalAlign = HorizontalTextAlignment.CENTER; label.verticalAlign = VerticalTextAlignment.CENTER; return label;
    }
    private button(text: string, x: number, color: Color, action: () => void, playIcon = false): Button {
        const node = this.child(this.node, text, 450, 120, x, -850), g = node.addComponent(Graphics);
        g.fillColor = color; g.roundRect(-225, -60, 450, 120, 60); g.fill();
        const button = node.addComponent(Button); button.transition = Button.Transition.SCALE; button.zoomScale = 1.04;
        node.on(Button.EventType.CLICK, action, this);
        const label = this.label(text, 40, 410, 90, node); label.isBold = true;
        if (playIcon) {
            label.node.setPosition(30, 0); g.fillColor = Color.WHITE; g.circle(-142, 0, 28); g.fill();
            g.fillColor = color; g.moveTo(-149, -15); g.lineTo(-128, 0); g.lineTo(-149, 15); g.close(); g.fill();
        }
        return button;
    }
    protected onDestroy(): void { this.lifetime.dispose(); super.onDestroy(); }
}
