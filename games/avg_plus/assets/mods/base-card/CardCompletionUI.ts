import {
    _decorator, BlockInputEvents, Button, Color, Graphics, HorizontalTextAlignment,
    instantiate, Label, Node, UITransform, UIOpacity, Vec3, VerticalTextAlignment, Widget,
} from 'cc';
import { PresentationComponent } from '../shared/PresentationComponent';

const { ccclass } = _decorator;

/** Completion is a separate owned screen; navigation waits for the player's Continue. */
@ccclass('CardCompletionUI')
export class CardCompletionUI extends PresentationComponent {
    private finished = false;
    private message: Label | null = null;

    public open(wallet: Node | null, onContinue: () => void): void {
        this.node.addComponent(UITransform).setContentSize(1181, 2556);
        this.node.addComponent(BlockInputEvents);
        const background = this.node.addComponent(Graphics);
        background.fillColor = new Color(27, 15, 51, 238);
        background.rect(-590.5, -1278, 1181, 2556); background.fill();
        // The purple light and pill controls follow the non-story completion frame at 152.5s.
        for (let radius = 1000; radius >= 90; radius -= 45) {
            background.fillColor = new Color(108, 21, 209, 7);
            background.circle(0, 480, radius); background.fill();
        }
        const title = this.label('Great!', 116, 1040, 200);
        title.node.setPosition(0, 650);
        title.isBold = true;
        title.node.setScale(0.72, 0.72);
        this.visualTween(title.node).to(0.42, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();

        if (wallet) {
            const copy = instantiate(wallet);
            copy.name = 'completionWallet';
            const alignment = copy.getComponent(Widget);
            if (alignment) { alignment.enabled = false; alignment.destroy(); }
            copy.getChildByName('img_main_btn_add')?.destroy();
            this.node.addChild(copy);
            copy.setPosition(0, 1070);
            const icon = wallet.getChildByName('coin_icon');
            if (icon) for (let index = 0; index < 8; index++) {
                const coin = instantiate(icon);
                coin.name = `completionCoin_${index}`;
                this.node.addChild(coin);
                coin.setPosition((index % 4 - 1.5) * 90, 430 - Math.floor(index / 4) * 65);
                coin.setScale(0.68, 0.68);
                const alpha = coin.getComponent(UIOpacity) ?? coin.addComponent(UIOpacity);
                this.visualTween(coin).delay(index * 0.08).to(0.85, {
                    position: new Vec3(-82, 1070, 0), scale: new Vec3(0.35, 0.35, 1),
                }, { easing: 'quadIn' }).start();
                this.visualTween(alpha).delay(index * 0.08 + 0.68).to(0.17, { opacity: 0 }).start();
            }
        }

        this.message = this.label('', 32, 1000, 120);
        this.message.node.setPosition(0, -710);
        this.button('2x coins', -255, new Color(0, 147, 221), () => {
            // An unavailable rewarded-ad service must not fabricate a completed ad or a reward.
            if (this.message) this.message.string = '视频暂不可用，请稍后再试';
        }, true);
        this.button('Continue', 255, new Color(90, 0, 237), () => {
            if (this.finished) return;
            this.finished = true;
            onContinue();
        });
        const opacity = this.node.addComponent(UIOpacity);
        opacity.opacity = 0;
        this.visualTween(opacity).to(0.3, { opacity: 255 }).start();
    }

    private label(text: string, size: number, width: number, height: number, parent = this.node): Label {
        const node = new Node('label'); node.layer = parent.layer;
        node.addComponent(UITransform).setContentSize(width, height); parent.addChild(node);
        const label = node.addComponent(Label);
        label.string = text; label.fontSize = size; label.lineHeight = Math.round(size * 1.2);
        label.color = Color.WHITE;
        label.horizontalAlign = HorizontalTextAlignment.CENTER;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        return label;
    }

    private button(text: string, x: number, color: Color, action: () => void, playIcon = false): void {
        const node = new Node(text); node.layer = this.node.layer;
        node.addComponent(UITransform).setContentSize(450, 120);
        node.setPosition(x, -920); this.node.addChild(node);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = color; graphics.roundRect(-225, -60, 450, 120, 60); graphics.fill();
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE; button.zoomScale = 1.04;
        node.on(Button.EventType.CLICK, action, this);
        const label = this.label(text, 40, 410, 90, node); label.isBold = true;
        if (playIcon) {
            label.node.setPosition(30, 0);
            graphics.fillColor = Color.WHITE; graphics.circle(-142, 0, 28); graphics.fill();
            graphics.fillColor = color;
            graphics.moveTo(-149, -15); graphics.lineTo(-128, 0); graphics.lineTo(-149, 15);
            graphics.close(); graphics.fill();
        }
    }
}
