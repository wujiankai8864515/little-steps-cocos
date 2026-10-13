import { _decorator, Component, Node, UIOpacity, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

export const CARD_SHADOW_SUFFIX = '__cardShadow';
export const CARD_SHADOW_MAX_HEIGHT = 550;
export const CARD_SHADOW_REST_OPACITY = 118;
const CARD_SHADOW_AIR_OPACITY = 72;
const LANDED_SHADOW_OFFSET = new Vec3(8, -10, 0);
const AIRBORNE_SHADOW_OFFSET = new Vec3(42, -58, 0);

/**
 * 单卡牌阴影属性。
 *
 * 阴影在 lateUpdate 中始终读取卡牌自身的位移、旋转、缩放和显隐。
 * 动画只需修改 simulatedHeight，不能再直接操纵影子节点。
 */
@ccclass('CardShadowFollower')
export class CardShadowFollower extends Component {
    @property({
        min: 0,
        max: CARD_SHADOW_MAX_HEIGHT,
        step: 1,
        tooltip: '卡牌相对桌面的模拟高度；0 为落地，550 为参考视频弧顶。',
    })
    public simulatedHeight = 0;
    private shadow: Node | null = null;

    public bind(shadow: Node): void {
        this.shadow = shadow;
        this.syncNow();
    }

    public isBound(): boolean {
        return Boolean(this.shadow?.isValid);
    }

    public setSimulatedHeight(height: number): void {
        this.simulatedHeight = Math.max(0, Math.min(CARD_SHADOW_MAX_HEIGHT, height));
        this.syncNow();
    }

    public setVisible(visible: boolean): void {
        if (this.shadow?.isValid) this.shadow.active = visible;
    }

    /**
     * 把阴影与卡牌作为一个绘制单元排序。备用牌从左到右调用时，左牌在底层，
     * 后一张牌连同自己的阴影一起压在前一张牌上。
     */
    public setSiblingPairIndex(pairIndex: number): void {
        const shadow = this.shadow;
        const parent = this.node.parent;
        if (!shadow?.isValid || !parent?.isValid) return;
        if (shadow.parent !== parent) parent.addChild(shadow);
        const shadowIndex = Math.max(0, Math.min(pairIndex * 2, parent.children.length - 1));
        shadow.setSiblingIndex(shadowIndex);
        this.node.setSiblingIndex(Math.min(shadowIndex + 1, parent.children.length - 1));
    }

    public syncNow(): void {
        const shadow = this.shadow;
        const parent = this.node.parent;
        if (!shadow?.isValid || !parent?.isValid) return;
        if (shadow.parent !== parent) parent.addChild(shadow);

        const cardIndex = this.node.getSiblingIndex();
        const shadowIndex = Math.max(0, cardIndex - 1);
        if (shadow.getSiblingIndex() !== shadowIndex) shadow.setSiblingIndex(shadowIndex);

        const heightRatio = Math.max(0, Math.min(1, this.simulatedHeight / CARD_SHADOW_MAX_HEIGHT));
        const offsetX = LANDED_SHADOW_OFFSET.x
            + (AIRBORNE_SHADOW_OFFSET.x - LANDED_SHADOW_OFFSET.x) * heightRatio;
        const offsetY = LANDED_SHADOW_OFFSET.y
            + (AIRBORNE_SHADOW_OFFSET.y - LANDED_SHADOW_OFFSET.y) * heightRatio;
        shadow.setPosition(
            this.node.position.x + offsetX,
            this.node.position.y + offsetY,
            this.node.position.z,
        );
        shadow.setScale(
            this.node.scale.x * (1 + heightRatio * 0.12),
            this.node.scale.y * (1 - heightRatio * 0.08),
            this.node.scale.z,
        );
        // 旋转必须严格继承卡牌；削弱角度会让整圈旋转时的影子明显脱节。
        shadow.angle = this.node.angle;
        shadow.active = this.node.active;
        const opacity = shadow.getComponent(UIOpacity);
        if (opacity) {
            opacity.opacity = Math.round(
                CARD_SHADOW_REST_OPACITY
                + (CARD_SHADOW_AIR_OPACITY - CARD_SHADOW_REST_OPACITY) * heightRatio,
            );
        }
    }

    protected lateUpdate(): void {
        this.syncNow();
    }

    protected onDestroy(): void {
        if (this.shadow?.isValid) this.shadow.destroy();
        this.shadow = null;
    }
}
