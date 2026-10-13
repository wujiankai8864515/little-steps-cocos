import {
    _decorator,
    BlockInputEvents,
    Button,
    Color,
    director,
    Director,
    Graphics,
    HorizontalTextAlignment,
    instantiate,
    Label,
    Node,
    ParticleSystem2D,
    resources,
    Sprite,
    SpriteFrame,
    tween,
    type TweenEasing,
    UIOpacity,
    UITransform,
    VerticalTextAlignment,
    Vec2,
    Vec3,
    Widget,
} from 'cc';
import { CardLevelRepository } from './CardLevelRepository';
import type { CardLevelDefinition } from './CardLevelTypes';
import { CardSpriteLoader } from './CardSpriteLoader';
import {
    HighLowSolitaireCore,
    type MoveResult,
    type SolitaireCoreSnapshot,
    type SolitaireGameState,
} from './HighLowSolitaireCore';
import {
    GameSessionStore,
    HITS_PER_REWARD,
    PaidGameAction,
    ProgressCellState,
    type GameSessionSnapshot,
} from './GameSessionStore';
import {
    GAME_UI_COMPONENT_SPECS,
    GameUiActionType,
    GameUiNodeId,
    buildGamePageViewState,
    visibleBackupCardCount,
    type BoardCardViewState,
    type GamePageViewState,
    type GameUiAction,
} from './GameUIContract';

import { PresentationComponent } from '../shared/PresentationComponent';
import {
    CARD_SHADOW_MAX_HEIGHT,
    CARD_SHADOW_REST_OPACITY,
    CARD_SHADOW_SUFFIX,
    CardShadowFollower,
} from './CardShadowFollower';
import {
    boardFlightAngle,
    buildMissedMoveSwayKeyframes,
    buildOpeningDealSchedule,
    buildOpeningStockSchedule,
    stableVisibleBackupCardOffsets,
    OPENING_DEAL_POSITION_EASING,
    OPENING_DEAL_TIMING,
    type UndoVisual,
} from './GameVisualTypes';

const { ccclass } = _decorator;
const FLY_DURATION = 0.36;
// 参考录屏逐帧测得：第 143 帧起飞、第 188 帧落下，共 45 帧（60fps）。
const BOARD_CARD_FLY_DURATION = 0.75;
const BOARD_CARD_ARC_HEIGHT = CARD_SHADOW_MAX_HEIGHT;
const BOARD_CARD_FULL_TURN = 360;
const PAID_ACTION_ENTRY_DURATION = 0.82;
const PAID_ACTION_ENTRY_STAGGER = 0.075;
const PAID_EFFECT_CYCLE_DURATION = 1;

interface BoardFlightGeometry {
    readonly start: Vec3;
    readonly destination: Vec3;
    readonly startScale: Vec3;
    readonly targetScale: Vec3;
    readonly startAngle: number;
    readonly rotation: number;
    readonly apexY: number;
    readonly apexTime: number;
    readonly curve: number;
}

/** Base-card layout, renderers and default animations. Never mutates game state. */
@ccclass('GamePresentation')
export class GamePresentation extends PresentationComponent {
    protected _level: CardLevelDefinition | null = null;
    protected _renderVersion = 0;
    private readonly _backupCardBasePositions = new WeakMap<Node, Vec3>();
    private paidActionsVisible = false;
    private readonly paidActionPositions = new Map<GameUiNodeId, Vec3>();
    private paidBackupPilePosition: Vec3 | null = null;
    private paidEffectRoot: Node | null = null;
    private paidEffectParticleRoot: Node | null = null;
    private paidEffectCardGlow: Node | null = null;
    private paidEffectButtonGlow: Node | null = null;
    private paidEffectParticles: ParticleSystem2D | null = null;
    private paidEffectElapsed = 0;
    protected dispatch(_action: GameUiAction): Promise<void> { throw new Error('GamePageUI must supply dispatch'); }
    /** Prefab 挂到场景的同一帧就执行，禁止默认牌面在异步关卡加载前闪现。 */
    protected prepareOpeningVisualState(): void {
        const current = this.findNode(GameUiNodeId.CurrentCard);
        const backup = this.findNode(GameUiNodeId.StockPile);
        if (current) current.active = false;
        if (backup) backup.active = false;
        const content = this.findNode(GameUiNodeId.Board);
        content?.children.forEach((child) => { child.active = false; });
    }

    protected renderBoard(view: Readonly<GamePageViewState>, version: number, concealed = false): void {
        const content = this.findNode(GameUiNodeId.Board);
        if (!content || !this._level) return;

        // 关卡 JSON 已经使用 Figma 的设计坐标系，牌尺寸也已归一化为真实卡牌尺寸。
        // content 只负责提供坐标原点，不能再按 prefab 的历史尺寸二次缩放整副牌阵。
        content.getComponent(UITransform)?.setContentSize(
            this._level.designSize.width,
            this._level.designSize.height,
        );
        const oldCards = [...content.children];
        content.removeAllChildren();
        oldCards.forEach((card) => card.destroy());

        for (const slot of view.boardCards) {
            const node = this.createBoardCard(slot);
            content.addChild(node);
            const shadow = this.ensureCardShadow(node);
            // SpriteFrame 是异步加载的。开场阶段连阴影也必须先隐藏，否则会在
            // animateOpeningDeal 把节点移到屏外之前，以最终位置穿帮一帧。
            node.active = !concealed;
            shadow.setVisible(!concealed);
            void this.applyCardSprite(node, concealed ? 'poker_back_01' : slot.cardName, version);
        }
    }

    protected createBoardCard(slot: Readonly<BoardCardViewState>): Node {
        const node = new Node(slot.slotId);
        node.layer = this.node.layer;
        node.setPosition(slot.x, slot.y, 0);
        node.angle = slot.rotation;

        const definition = this._level?.slots.find((item) => item.id === slot.slotId);
        const width = definition?.width ?? this._level?.cardSize.width ?? 162;
        const height = definition?.height ?? this._level?.cardSize.height ?? 243;
        node.addComponent(UITransform).setContentSize(width, height);
        node.addComponent(Sprite).sizeMode = Sprite.SizeMode.CUSTOM;

        const button = node.addComponent(Button);
        button.interactable = slot.interactable;
        this.configureButtonFeedback(button, 1.035);
        node.on(Button.EventType.CLICK, () => void this.dispatch({
            type: GameUiActionType.PlayBoardCard,
            slotId: slot.slotId,
        }), this);
        return node;
    }

    protected configureButtonFeedback(button: Button, zoomScale: number): void {
        const restingScale = button.node.scale.clone();
        button.transition = Button.Transition.SCALE;
        button.duration = 0.08;
        button.zoomScale = zoomScale;
        // Cocos emits CLICK before it clears the pressed state and starts zooming back.
        // Presentation transactions begin synchronously from that event, so without this
        // reset their transform snapshot captures `restingScale * zoomScale`. Restoring
        // that snapshot also teaches Button the enlarged value as its next original scale,
        // causing repeated clicks to grow the target exponentially.
        button.node.on(Button.EventType.CLICK, () => button.node.setScale(restingScale), this);
    }

    protected renderCurrent(view: Readonly<GamePageViewState>, version: number, concealed = false): void {
        const current = this.findNode(GameUiNodeId.CurrentCard);
        if (!current) return;
        const shadow = this.ensureCardShadow(current);
        // The opening current card is represented by the flying duplicate from the stock.
        // Keep the prefab anchor hidden so its previous/default face cannot flash while the
        // card-back texture is loading asynchronously.
        current.active = !concealed;
        shadow.setVisible(!concealed);
        void this.applyCardSprite(current, concealed ? 'poker_back_01' : view.currentCardName, version);
    }

    protected renderBackup(view: Readonly<GamePageViewState>, concealed = false): void {
        const backup = this.findNode(GameUiNodeId.StockPile);
        if (!backup) return;
        backup.active = !concealed;
        // 开场时备用牌会先隐藏。移动端首次布局发生在隐藏期间时，ON_WINDOW_RESIZE
        // Widget 会让它停在 prefab 保存的旧 Y；当前牌却已按新视口对齐。两者属于
        // 同一底部操作行，显示牌堆时统一复用当前牌的纵向基线，横向仍由各自 Widget 管理。
        if (!concealed) {
            const current = this.findNode(GameUiNodeId.CurrentCard);
            current?.getComponent(Widget)?.updateAlignment();
            backup.getComponent(Widget)?.updateAlignment();
            if (current && current.parent === backup.parent) {
                backup.setPosition(backup.position.x, current.position.y, backup.position.z);
            }
            // 付费牌堆动画只能缓存完成响应式对齐后的坐标。开场隐藏阶段的
            // prefab 原始坐标不属于当前设备视口，不能作为后续恢复目标。
            if (!this.paidActionsVisible) this.paidBackupPilePosition = backup.position.clone();
        }

        // 牌堆用尽后仍显示 5 张牌背，作为付费补牌按钮的内容预览。
        const visibleCount = visibleBackupCardCount(view);
        const cards = this.ensureBackupCardCapacity(backup, visibleCount);
        const basePositions = cards.map((child) => {
            const cached = this._backupCardBasePositions.get(child);
            if (cached) return cached;
            const position = child.position.clone();
            this._backupCardBasePositions.set(child, position);
            return position;
        });
        // 每张备用牌绑定固定槽位。抽走顶牌后只减少末尾可见节点，不能把
        // 剩余节点重新居中，否则动画交接帧会表现为整叠牌横向位移。
        const stableOffsets = stableVisibleBackupCardOffsets(
            basePositions.map((position) => position.x),
            visibleCount,
        );
        cards.forEach((child, index) => {
            child.active = index < visibleCount;
            if (index < visibleCount) {
                const shadow = this.ensureCardShadow(child);
                shadow.setVisible(!concealed);
                const base = basePositions[index];
                child.setPosition(stableOffsets[index], base.y, base.z);
                shadow.syncNow();
            } else {
                this.cardShadowFor(child)?.setVisible(false);
            }
        });
        this.stackBackupCardsLeftToRight(backup);
    }

    protected prefersReducedMotion(): boolean {
        const matchMedia = (globalThis as typeof globalThis & {
            matchMedia?: (query: string) => { readonly matches: boolean };
        }).matchMedia;
        return Boolean(matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    }

    /** 参考视频：牌阵错峰下落，下方牌组随后升入，全部到位后统一翻牌。 */
    protected async animateOpeningDeal(view: Readonly<GamePageViewState>): Promise<void> {
        const checkVisual = this.visualCheckpoint();
        const content = this.findNode(GameUiNodeId.Board);
        if (!content || !this._level) return;
        const schedule = buildOpeningDealSchedule(this._level.slots)
            .map((step) => ({ ...step, node: content.getChildByName(step.slotId) }))
            .filter((step): step is typeof step & { node: Node } => Boolean(step.node));
        if (schedule.length === 0) return;

        const current = this.findNode(GameUiNodeId.CurrentCard);
        const backup = this.findNode(GameUiNodeId.StockPile);
        // 当前牌是备用牌组装阶段额外发出的临时牌，不占用真实备用牌数量。
        // 否则它飞走后 refresh 会按真实库存重新激活节点，看起来像牌堆补回一张。
        const openingCurrentSource = backup ? this.createOpeningCurrentSource(backup) : null;
        const back = await CardSpriteLoader.loadSpriteFrame('poker_back_01');
        checkVisual();
        const target = new Map<string, { position: Vec3; angle: number; scale: Vec3 }>();
        const rootHeight = this.node.getComponent(UITransform)?.height ?? 2556;
        const contentRootY = this.rootPositionOf(content).y;
        const topMargin = Math.max(8, this._level.cardSize.height * 0.04);
        // 横屏参考的牌从画面上边界外进入。竖屏不能沿用牌阵设计稿自身的
        // 779px 高度，否则起点仍在 2556px 视口内；必须用实际视口上边界换算。
        const startY = rootHeight * 0.5 - contentRootY
            + this._level.cardSize.height * 0.5 + topMargin;

        for (const step of schedule) {
            const node = step.node;
            const sprite = node.getComponent(Sprite);
            if (sprite) sprite.spriteFrame = back;
            target.set(step.slotId, {
                position: node.position.clone(),
                angle: node.angle,
                scale: node.scale.clone(),
            });
            // 参考帧中位置只做纵向发牌，旋转角、横向位置与尺寸都直接继承
            // Figma 槽位；旧实现额外的 -115px、-18°、0.9x 会改变运动观感。
            node.setPosition(node.position.x, startY, node.position.z);
            node.active = true;
            this.ensureCardShadow(node).setSimulatedHeight(BOARD_CARD_ARC_HEIGHT);
        }

        const backupRootY = backup ? this.rootPositionOf(backup).y : 0;
        const backupCards = backup ? this.backupCardNodes(backup)
            .filter((child) => child.active)
            .sort((left, right) => left.position.x - right.position.x)
            .map((node) => ({ node, position: node.position.clone(), angle: node.angle })) : [];
        const backupSourceX = backupCards[0]?.position.x ?? 0;
        for (const entry of backupCards) {
            const transform = entry.node.getComponent(UITransform);
            const halfHeight = (transform?.height ?? this._level.cardSize.height) * 0.5;
            // 备用牌不能作为一个整体上移。每张牌从同一底部牌口出发，再依次
            // 展开到各自 x，后到的牌覆盖前一张，才能形成视频里的牌叠节奏。
            entry.node.setPosition(
                backupSourceX,
                -rootHeight * 0.5 - backupRootY - halfHeight - topMargin,
                entry.position.z,
            );
            entry.node.angle = -6;
            this.ensureCardShadow(entry.node).setSimulatedHeight(BOARD_CARD_ARC_HEIGHT);
        }
        if (backup) backup.active = true;

        // 当前牌不是独立入场元素。真正的锚点在备用牌抽出、飞行并翻面完成前
        // 始终隐藏，避免牌面提前出现在最终位置。
        if (current) this.setCardAndShadowActive(current, false);

        // The page is instantiated immediately before `open`. Starting tweens before its
        // first draw lets the first game tick consume the prefab/asset loading time and
        // makes the whole deal appear to complete instantly in a production build.
        await new Promise<void>((resolve) => director.once(Director.EVENT_AFTER_DRAW, resolve));
        checkVisual();

        // 参考视频不是同一帧批量创建 tween 再附加 delay，而是逐帧发射：
        // 当前帧只启动一张，下一渲染帧再启动下一张。飞行过程仍然重叠，
        // 因此既有快速连续感，又能明确看到后发牌逐张盖到先发牌上。
        const landings: Promise<void>[] = [];
        for (const step of schedule) {
            const destination = target.get(step.slotId)!;
            // 后发牌必须处于先发牌之上，才能形成真实的逐张叠压。
            step.node.setSiblingIndex(content.children.length - 1);
            landings.push(this.animateOpeningLanding(
                step.node,
                destination.position,
                destination.angle,
                destination.scale,
                OPENING_DEAL_TIMING.cardDuration,
            ));
            await this.waitForOpeningLaunchFrames();
            checkVisual();
        }
        for (const step of buildOpeningStockSchedule(backupCards.length)) {
            const entry = backupCards[step.index];
            entry.node.setSiblingIndex((backup?.children.length ?? 1) - 1);
            landings.push(this.animateOpeningLanding(
                entry.node,
                entry.position,
                entry.angle,
                entry.node.scale.clone(),
                OPENING_DEAL_TIMING.backupCardDuration,
            ));
            await this.waitForOpeningLaunchFrames();
            checkVisual();
        }
        await Promise.all(landings);
        checkVisual();

        const faceUp = view.boardCards
            .filter((slot) => slot.faceUp)
            .sort((left, right) => left.x - right.x);
        await Promise.all([
            ...faceUp.map((slot) => {
                const node = content.getChildByName(slot.slotId);
                return node ? this.animateOpeningCardFlip(node, slot.cardName) : Promise.resolve();
            }),
            this.animateBackupToCurrent(
                openingCurrentSource,
                view.currentCardName,
                true,
                OPENING_DEAL_TIMING.currentDrawDuration,
            ),
        ]);
        checkVisual();
    }

    /** 启动单张牌的落位；调用方负责保证每个渲染帧只调用一次。 */
    protected animateOpeningLanding(
        node: Node,
        position: Readonly<Vec3>,
        angle: number,
        scale: Readonly<Vec3>,
        duration: number,
    ): Promise<void> {
        return this.waitForVisual((resolve) => {
            // 回弹只属于落位位移；牌面角度与离地高度保持线性，避免整张牌
            // 连同旋转和阴影一起“橡皮化”。
            this.tweenCardHeight(node, duration, 0, 0, 'linear');
            node.setScale(scale.x, scale.y, scale.z);
            this.visualTween(node)
                .to(duration, { angle }, { easing: 'linear' })
                .start();
            this.visualTween(node)
                .to(duration, { position: new Vec3(position.x, position.y, position.z) }, {
                    easing: OPENING_DEAL_POSITION_EASING,
                })
                .call(() => resolve())
                .start();
        });
    }

    /** 严格跨过配置数量的已绘制帧，保证视觉节拍不受逻辑 tick 影响。 */
    protected async waitForOpeningLaunchFrames(): Promise<void> {
        for (let frame = 0; frame < OPENING_DEAL_TIMING.launchFrameGap; frame++) {
            await new Promise<void>((resolve) => director.once(Director.EVENT_AFTER_DRAW, resolve));
        }
    }

    /** 参考视频四张明牌与当前牌同时翻开，总时长约 0.14s。 */
    protected async animateOpeningCardFlip(node: Node, cardName: string): Promise<void> {
        const checkVisual = this.visualCheckpoint();
        const sprite = node.getComponent(Sprite);
        if (!sprite) return;
        const frame = await CardSpriteLoader.loadSpriteFrame(cardName);
        checkVisual();
        const originalScale = node.scale.clone();
        await this.waitForVisual((resolve) => {
            this.visualTween(node)
                .to(OPENING_DEAL_TIMING.flipHalfDuration, {
                    scale: new Vec3(0.035, originalScale.y, originalScale.z),
                }, { easing: 'quadIn' })
                .call(() => { sprite.spriteFrame = frame; })
                .to(OPENING_DEAL_TIMING.flipHalfDuration, { scale: originalScale }, { easing: 'quadOut' })
                .call(() => resolve())
                .start();
        });
        checkVisual();
    }

    protected renderProgress(view: Readonly<GamePageViewState>): void {
        const progressItems = this.findNode(GameUiNodeId.RewardProgress)
            ?.getChildByName(GameUiNodeId.ProgressItems) ?? null;
        if (progressItems) this.renderProgressItems(progressItems, view.progressCells);
    }

    protected renderStatus(view: Readonly<GamePageViewState>): void {
        this.setStatus(view.statusMessage);
    }

    protected renderActionState(view: Readonly<GamePageViewState>): void {
        this.renderPaidActionState(
            view.controls.retryVisible,
            view.controls.endVisible,
            view.controls.addBackupVisible,
        );
        this.setActionNode(GameUiNodeId.Rollback, view.controls.rollbackVisible);
        this.setActionNode(GameUiNodeId.Wild, view.controls.wildVisible);
        this.setButtonInteractable(GameUiNodeId.StockPile, view.controls.stockEnabled);
        this.setButtonInteractable(GameUiNodeId.Rollback, view.controls.rollbackEnabled);
        this.setButtonInteractable(GameUiNodeId.Wild, view.controls.wildEnabled);
        this.setButtonInteractable(GameUiNodeId.AddBackup, view.controls.addBackupEnabled);
        this.setButtonInteractable(GameUiNodeId.Pause, view.controls.pauseEnabled);
    }

    /** 免费牌耗尽时，待领取牌堆与标签从下方整组进入，其他入口从左侧进入。 */
    private renderPaidActionState(retryVisible: boolean, endVisible: boolean, addBackupVisible: boolean): void {
        const states: readonly [GameUiNodeId, boolean][] = [
            [GameUiNodeId.Retry, retryVisible],
            [GameUiNodeId.End, endVisible],
            [GameUiNodeId.AddBackup, addBackupVisible],
        ];
        const shouldEnter = states.some(([, visible]) => visible);
        const nodes = states
            .map(([name, visible]) => ({ name, visible, node: this.findNode(name) }))
            .filter((entry): entry is { name: GameUiNodeId; visible: boolean; node: Node } => Boolean(entry.node));

        for (const { name, node } of nodes) {
            if (!this.paidActionPositions.has(name)) this.paidActionPositions.set(name, node.position.clone());
        }
        const backup = this.findNode(GameUiNodeId.StockPile);

        if (!shouldEnter) {
            this.paidActionsVisible = false;
            for (const { name, node } of nodes) {
                node.active = false;
                const origin = this.paidActionPositions.get(name);
                if (origin) node.setPosition(origin);
                const opacity = node.getComponent(UIOpacity);
                if (opacity) opacity.opacity = 255;
            }
            if (backup && this.paidBackupPilePosition) {
                backup.setPosition(this.paidBackupPilePosition);
                const opacity = backup.getComponent(UIOpacity);
                if (opacity) opacity.opacity = 255;
            }
            this.setPaidBackupEffectVisible(false);
            return;
        }

        const entering = !this.paidActionsVisible;
        this.paidActionsVisible = true;
        const reduceMotion = this.prefersReducedMotion();
        const rootTransform = this.node.getComponent(UITransform);
        const rootWidth = rootTransform?.width ?? 1181;
        const rootHeight = rootTransform?.height ?? 2556;

        nodes.forEach(({ name, node, visible }, index) => {
            node.active = visible;
            if (!visible) return;
            const origin = this.paidActionPositions.get(name)!;
            const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
            if (!entering || reduceMotion) {
                node.setPosition(origin);
                opacity.opacity = 255;
                return;
            }

            const transform = node.getComponent(UITransform);
            const width = transform?.width ?? 0;
            const height = transform?.height ?? 0;
            const fromBelow = name === GameUiNodeId.AddBackup;
            node.setPosition(
                fromBelow ? origin.x : -rootWidth * 0.5 - width * 0.5 - 80,
                fromBelow ? -rootHeight * 0.5 - height * 0.5 - 80 : origin.y,
                origin.z,
            );
            opacity.opacity = 0;
            const delay = fromBelow ? 0 : index * PAID_ACTION_ENTRY_STAGGER;
            this.visualTween(node)
                .delay(delay)
                .to(PAID_ACTION_ENTRY_DURATION, { position: origin }, { easing: 'backOut' })
                .start();
            this.visualTween(opacity)
                .delay(delay)
                .to(0.28, { opacity: 255 }, { easing: 'quadOut' })
                .start();
        });

        // 牌背预览在 backup 节点，+5 标签在 addBackup 节点；两者必须使用
        // 相同的纵向位移和淡入，否则会看起来像两段无关的入场动画。
        if (backup && addBackupVisible && this.paidBackupPilePosition) {
            const origin = this.paidBackupPilePosition;
            const opacity = backup.getComponent(UIOpacity) ?? backup.addComponent(UIOpacity);
            if (!entering || reduceMotion) {
                backup.setPosition(origin);
                opacity.opacity = 255;
            } else {
                const height = backup.getComponent(UITransform)?.height ?? 0;
                backup.setPosition(origin.x, -rootHeight * 0.5 - height * 0.5 - 80, origin.z);
                opacity.opacity = 0;
                this.visualTween(backup)
                    .to(PAID_ACTION_ENTRY_DURATION, { position: origin }, { easing: 'backOut' })
                    .start();
                this.visualTween(opacity)
                    .to(0.28, { opacity: 255 }, { easing: 'quadOut' })
                    .start();
            }
        }

        this.bringActionsToFront(GameUiNodeId.Retry, GameUiNodeId.End, GameUiNodeId.AddBackup);
        // 先完成按钮排序，再把特效固定到备用牌与 +Cards 后方，避免亮条盖住美术。
        // 减少动态只跳过入场位移，不能隐藏用于表达可领取区域的边缘光与气泡。
        this.setPaidBackupEffectVisible(addBackupVisible);
    }

    private setPaidBackupEffectVisible(visible: boolean): void {
        if (!visible) {
            this.paidEffectParticles?.stopSystem();
            if (this.paidEffectRoot?.isValid) this.paidEffectRoot.active = false;
            if (this.paidEffectParticleRoot?.isValid) this.paidEffectParticleRoot.active = false;
            return;
        }
        const effect = this.ensurePaidBackupEffect();
        this.syncPaidBackupEffectGeometry();
        effect.active = true;
        if (this.paidEffectParticleRoot?.isValid) this.paidEffectParticleRoot.active = true;
        this.paidEffectParticles?.resetSystem();
    }

    /** 两道边缘黄光仍跟随动态轮廓；气泡由 ParticleSystem2D 连续发射。 */
    private ensurePaidBackupEffect(): Node {
        if (this.paidEffectRoot?.isValid) return this.paidEffectRoot;
        const backup = this.findNode(GameUiNodeId.StockPile);
        const addBackup = this.findNode(GameUiNodeId.AddBackup);
        const effectParent = addBackup?.parent;
        if (!backup || !addBackup || !effectParent || backup.parent !== effectParent) {
            throw new Error('缺少备用牌节点或共同父节点');
        }

        const root = new Node('paid_backup_effect');
        root.layer = backup.layer;
        root.addComponent(UITransform).setContentSize(1, 1);
        effectParent.addChild(root);
        root.setSiblingIndex(Math.min(backup.getSiblingIndex(), addBackup.getSiblingIndex()));

        const particleRoot = new Node('paid_backup_particle_effect');
        particleRoot.layer = backup.layer;
        particleRoot.addComponent(UITransform).setContentSize(1, 1);
        effectParent.addChild(particleRoot);
        particleRoot.setSiblingIndex(effectParent.children.length - 1);

        const createGlow = (name: string): Node => {
            const glow = new Node(name);
            glow.layer = root.layer;
            glow.addComponent(UITransform).setContentSize(1, 1);
            const sprite = glow.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.color = new Color(255, 218, 70, 255);
            glow.addComponent(UIOpacity).opacity = 188;
            root.addChild(glow);
            return glow;
        };
        this.paidEffectCardGlow = createGlow('paid_backup_card_right_glow');
        this.paidEffectButtonGlow = createGlow('paid_backup_button_left_glow');

        const particles = particleRoot.addComponent(ParticleSystem2D);
        particles.custom = true;
        particles.emitterMode = ParticleSystem2D.EmitterMode.GRAVITY;
        particles.positionType = ParticleSystem2D.PositionType.GROUPED;
        particles.duration = ParticleSystem2D.DURATION_INFINITY;
        particles.totalParticles = 30;
        particles.emissionRate = 16;
        particles.life = 1.55;
        particles.lifeVar = 0.35;
        particles.angle = 90;
        particles.angleVar = 9;
        particles.speed = 58;
        particles.speedVar = 24;
        particles.gravity = new Vec2(0, 8);
        particles.radialAccel = 0;
        particles.radialAccelVar = 8;
        particles.tangentialAccel = 0;
        particles.tangentialAccelVar = 10;
        // 纹理外围有较宽的柔边，粒子尺寸必须明显大于最终可见的实心圆。
        particles.startSize = 68;
        particles.startSizeVar = 18;
        particles.endSize = 30;
        particles.endSizeVar = 10;
        particles.startSpin = -8;
        particles.startSpinVar = 14;
        particles.endSpin = 8;
        particles.endSpinVar = 18;
        particles.startColor = new Color(255, 205, 36, 255);
        particles.startColorVar = new Color(0, 22, 18, 0);
        particles.endColor = new Color(255, 232, 92, 26);
        particles.endColorVar = new Color(0, 8, 18, 0);
        this.paidEffectParticles = particles;
        resources.load('effects/paid-bubble/spriteFrame', SpriteFrame, (error, spriteFrame) => {
            if (error || !spriteFrame) {
                console.error('[GamePresentation] 付费备用牌气泡纹理加载失败', error);
                return;
            }
            if (!particles.isValid) return;
            particles.spriteFrame = spriteFrame;
            [this.paidEffectCardGlow, this.paidEffectButtonGlow].forEach((glow) => {
                const sprite = glow?.getComponent(Sprite);
                if (sprite) sprite.spriteFrame = spriteFrame;
            });
            if (particleRoot.activeInHierarchy) particles.resetSystem();
        });

        this.paidEffectElapsed = 0;
        this.paidEffectRoot = root;
        this.paidEffectParticleRoot = particleRoot;
        this.syncPaidBackupEffectGeometry();
        return root;
    }

    /** 右光跟随最右牌背，左光跟随 +Cards 按钮，发射器横向覆盖两道光之间。 */
    private syncPaidBackupEffectGeometry(): void {
        const root = this.paidEffectRoot;
        const cardGlow = this.paidEffectCardGlow;
        const buttonGlow = this.paidEffectButtonGlow;
        const particleRoot = this.paidEffectParticleRoot;
        const backup = this.findNode(GameUiNodeId.StockPile);
        const addBackup = this.findNode(GameUiNodeId.AddBackup);
        const rootParent = root?.parent;
        if (!root?.isValid || !rootParent || !particleRoot?.isValid
            || !cardGlow?.isValid || !buttonGlow?.isValid
            || !backup || !addBackup) return;
        const cards = this.backupCardNodes(backup)
            .filter((card) => card.active)
            .sort((left, right) => left.position.x - right.position.x);
        if (cards.length === 0) return;
        const rightmost = cards[cards.length - 1];
        const cardSprite = this.findSpriteNode(rightmost) ?? rightmost;
        const cardTransform = cardSprite.getComponent(UITransform) ?? rightmost.getComponent(UITransform);
        const cardWidth = (cardTransform?.width ?? 162) * Math.abs(rightmost.scale.x);
        const cardHeight = (cardTransform?.height ?? 243) * Math.abs(rightmost.scale.y);
        const cardCenterX = backup.position.x + rightmost.position.x;
        const cardCenterY = backup.position.y + rightmost.position.y;
        const cardRight = cardCenterX + cardWidth * 0.5;

        const label = addBackup?.getChildByName('icon') ?? null;
        const labelTransform = label?.getComponent(UITransform);
        if (!addBackup || !label || !labelTransform || addBackup.parent !== backup.parent
            || rootParent !== addBackup.parent) return;
        const labelCenterX = addBackup.position.x + label.position.x;
        const labelWidth = labelTransform.width * Math.abs(label.scale.x);
        const buttonLeft = labelCenterX - labelWidth * 0.5;

        root.setPosition(0, 0, 0);
        root.getComponent(UITransform)?.setContentSize(1, 1);
        this.sendPaidEffectBehindTargets(root, backup, addBackup);
        this.sendPaidParticlesInFront(particleRoot, backup, addBackup);
        const edgeGlowWidth = Math.max(48, Math.min(72, cardWidth * 0.38));
        this.drawPaidSideGlow(cardGlow, edgeGlowWidth, cardHeight);
        cardGlow.setPosition(cardRight + edgeGlowWidth * 0.12, cardCenterY, 0);
        this.drawPaidSideGlow(buttonGlow, edgeGlowWidth, cardHeight);
        buttonGlow.setPosition(buttonLeft - edgeGlowWidth * 0.12, cardCenterY, 0);

        const particleLeft = Math.min(buttonLeft, cardRight) + 10;
        const particleRight = Math.max(buttonLeft, cardRight) - 10;
        const particles = this.paidEffectParticles;
        if (particles?.isValid) {
            particles.node.setPosition((particleLeft + particleRight) * 0.5, cardCenterY, 0);
            particles.sourcePos = new Vec2(0, 0);
            particles.posVar = new Vec2(
                Math.max(4, (particleRight - particleLeft) * 0.5),
                cardHeight * 0.46,
            );
        }
    }

    private drawPaidSideGlow(node: Node, width: number, height: number): void {
        node.getComponent(UITransform)?.setContentSize(width, height);
    }

    private sendPaidEffectBehindTargets(root: Node, backup: Node, addBackup: Node): void {
        const firstTargetIndex = Math.min(backup.getSiblingIndex(), addBackup.getSiblingIndex());
        if (root.getSiblingIndex() >= firstTargetIndex) root.setSiblingIndex(firstTargetIndex);
    }

    private sendPaidParticlesInFront(root: Node, backup: Node, addBackup: Node): void {
        const lastTargetIndex = Math.max(backup.getSiblingIndex(), addBackup.getSiblingIndex());
        if (root.getSiblingIndex() <= lastTargetIndex) {
            root.setSiblingIndex(Math.min(lastTargetIndex + 1, root.parent!.children.length - 1));
        }
    }

    protected update(deltaTime: number): void {
        const root = this.paidEffectRoot;
        if (!root?.isValid || !root.activeInHierarchy) return;
        // 入场时牌堆与按钮都在移动，两道边缘光必须逐帧跟随。
        this.syncPaidBackupEffectGeometry();
        this.paidEffectElapsed = (this.paidEffectElapsed + deltaTime) % PAID_EFFECT_CYCLE_DURATION;
        const cycle = this.paidEffectElapsed / PAID_EFFECT_CYCLE_DURATION;
        const backup = this.findNode(GameUiNodeId.StockPile);
        const addBackup = this.findNode(GameUiNodeId.AddBackup);
        if (backup && addBackup && root.parent === backup.parent && root.parent === addBackup.parent) {
            this.sendPaidEffectBehindTargets(root, backup, addBackup);
            const particleRoot = this.paidEffectParticleRoot;
            if (particleRoot?.isValid && particleRoot.parent === root.parent) {
                this.sendPaidParticlesInFront(particleRoot, backup, addBackup);
            }
        }

        const glowWave = Math.sin(cycle * Math.PI * 2);
        [this.paidEffectCardGlow, this.paidEffectButtonGlow].forEach((glow) => {
            if (!glow?.isValid) return;
            const glowOpacity = glow.getComponent(UIOpacity);
            if (glowOpacity) glowOpacity.opacity = Math.round(188 + glowWave * 20);
            glow.setScale(1, 1, 1);
        });

    }

    protected animateProgressReset(restored: readonly ProgressCellState[]): Promise<void> {
        const progressItems = this.findNode(GameUiNodeId.RewardProgress)
            ?.getChildByName(GameUiNodeId.ProgressItems) ?? null;
        if (progressItems) this.renderProgressItems(progressItems, restored);
        return Promise.resolve();
    }

    protected animateProgressRestore(
        _previous: readonly ProgressCellState[],
        restored: readonly ProgressCellState[],
    ): Promise<void> {
        const progressItems = this.findNode(GameUiNodeId.RewardProgress)
            ?.getChildByName(GameUiNodeId.ProgressItems) ?? null;
        if (progressItems) this.renderProgressItems(progressItems, restored);
        return Promise.resolve();
    }

    protected async animateBoardSuccess(
        sourceNode: Node | null,
        result: Readonly<MoveResult>,
        state: Readonly<SolitaireGameState>,
    ): Promise<void> {
        const checkVisual = this.visualCheckpoint();
        const content = this.findNode(GameUiNodeId.Board);
        const animations: Promise<void>[] = [this.animateCardToCurrent(sourceNode)];
        if (!content) {
            await Promise.all(animations);
            checkVisual();
            return;
        }

        for (const slotId of result.revealedSlotIds) {
            const node = content.getChildByName(slotId);
            const cardName = state.slots.find((slot) => slot.slotId === slotId)?.card?.cardName;
            if (node && cardName) animations.push(this.animateCardFlip(node, cardName, 0.1));
        }
        for (const slotId of result.stillCoveredSlotIds) {
            const node = content.getChildByName(slotId);
            if (node) animations.push(this.animateRedShaderFlash(node, 0.1));
        }
        await Promise.all(animations);
        checkVisual();
    }

    /** 玩家在仍有可消除牌时点备用牌：只提示合法牌，不改变牌局。 */
    protected async animateMissedMoveHint(slotIds: readonly string[]): Promise<void> {
        const checkVisual = this.visualCheckpoint();
        const content = this.findNode(GameUiNodeId.Board);
        if (!content) return;
        const animations = slotIds.map((slotId) => content.getChildByName(slotId))
            .filter((node): node is Node => Boolean(node))
            .map((node) => this.animateMissedMoveHintCard(node));
        await Promise.all(animations);
        checkVisual();
    }

    private async animateMissedMoveHintCard(node: Node): Promise<void> {
        const checkVisual = this.visualCheckpoint();
        const originalAngle = node.angle;
        try {
            await this.waitForVisual((resolve) => {
                let sequence = this.visualTween(node);
                for (const frame of buildMissedMoveSwayKeyframes()) {
                    sequence = sequence.to(
                        frame.duration,
                        { angle: originalAngle + frame.angleOffset },
                        { easing: 'sineInOut' },
                    );
                }
                sequence.call(resolve).start();
            });
            checkVisual();
        } finally {
            if (node.isValid) node.angle = originalAngle;
        }
    }

    protected async animateCardToCurrent(sourceNode: Node | null): Promise<void> {
        const checkVisual = this.visualCheckpoint();
        const current = this.findNode(GameUiNodeId.CurrentCard);
        if (!sourceNode || !current) return;
        const flying = this.createFlyingVisual(sourceNode, 'boardToCurrent');
        if (!flying) return;
        const arrivedFrame = flying.getComponent(Sprite)?.spriteFrame ?? null;
        this.setCardAndShadowActive(sourceNode, false);
        await this.tweenBoardCardToCurrent(flying, current);
        checkVisual();
        // 飞牌落下的同一帧就替换旧当前牌，之后的统一重绘不会闪回旧牌面。
        const currentSprite = current.getComponent(Sprite);
        if (currentSprite && arrivedFrame) currentSprite.spriteFrame = arrivedFrame;
    }

    /** 消除牌以固定时长沿抛物线落下，并以当前牌中线决定单圈旋转方向。 */
    protected async tweenBoardCardToCurrent(flying: Node, current: Node): Promise<void> {
        const checkVisual = this.visualCheckpoint();
        const start = flying.position.clone();
        const destination = this.rootPositionOf(current);
        const targetScale = this.targetScaleFor(flying, current);
        const startScale = flying.scale.clone();
        const startAngle = flying.angle;
        const geometry = this.createBoardFlightGeometry(
            start,
            destination,
            startScale,
            targetScale,
            startAngle,
        );
        await this.tweenBoardFlight(flying, geometry, 0, 1);
        checkVisual();
        this.destroyFlyingVisual(flying);
    }

    private createBoardFlightGeometry(
        start: Vec3,
        destination: Vec3,
        startScale: Vec3,
        targetScale: Vec3,
        startAngle: number,
    ): BoardFlightGeometry {
        // Cocos 的正角度为逆时针：中线左侧顺时针，右侧逆时针。
        const rotation = start.x < destination.x ? -BOARD_CARD_FULL_TURN : BOARD_CARD_FULL_TURN;
        const apexY = start.y + BOARD_CARD_ARC_HEIGHT;
        const riseFromStart = BOARD_CARD_ARC_HEIGHT;
        const riseFromDestination = apexY - destination.y;
        const startRoot = Math.sqrt(riseFromStart);
        const destinationRoot = Math.sqrt(riseFromDestination);
        const apexTime = startRoot / (startRoot + destinationRoot);
        const curve = -riseFromStart / (apexTime * apexTime);
        return { start, destination, startScale, targetScale, startAngle, rotation, apexY, apexTime, curve };
    }

    private applyBoardFlightPose(flying: Node, geometry: Readonly<BoardFlightGeometry>, t: number): void {
        if (!flying.isValid) return;
        const { start, destination, startScale, targetScale, startAngle, rotation, apexY, apexTime, curve } = geometry;
        const vertexOffset = t - apexTime;
        const position = new Vec3(
            start.x + (destination.x - start.x) * t,
            apexY + curve * vertexOffset * vertexOffset,
            start.z + (destination.z - start.z) * t,
        );
        flying.setPosition(position);
        flying.setScale(
            startScale.x + (targetScale.x - startScale.x) * t,
            startScale.y + (targetScale.y - startScale.y) * t,
            startScale.z + (targetScale.z - startScale.z) * t,
        );
        // 旋转使用参考录屏逐帧拟合的三次贝塞尔；倒放时也会逐帧走回相同角度。
        flying.angle = boardFlightAngle(startAngle, rotation, t);
        const groundY = start.y + (destination.y - start.y) * t;
        this.cardShadowFor(flying)?.setSimulatedHeight(position.y - groundY);
    }

    private async tweenBoardFlight(
        flying: Node,
        geometry: Readonly<BoardFlightGeometry>,
        fromProgress: number,
        toProgress: number,
    ): Promise<void> {
        const progress = { t: fromProgress };
        this.applyBoardFlightPose(flying, geometry, fromProgress);
        await this.waitForVisual((resolve) => {
            this.visualTween(progress)
                .to(BOARD_CARD_FLY_DURATION, { t: toProgress }, {
                    easing: 'linear',
                    onUpdate: () => this.applyBoardFlightPose(flying, geometry, progress.t),
                })
                .call(resolve)
                .start();
        });
    }

    protected async animateBackupToCurrent(
        sourceNode: Node | null,
        cardName: string,
        revealCurrent = false,
        duration = FLY_DURATION,
    ): Promise<void> {
        const checkVisual = this.visualCheckpoint();
        const current = this.findNode(GameUiNodeId.CurrentCard);
        if (!sourceNode || !current || !cardName) return;
        const flying = this.createFlyingVisual(sourceNode, 'backupToCurrent');
        if (!flying) return;
        this.setCardAndShadowActive(sourceNode, false);

        const sprite = flying.getComponent(Sprite)!;
        const face = await CardSpriteLoader.loadSpriteFrame(cardName);
        checkVisual();
        const targetPosition = this.rootPositionOf(current);
        const targetScale = this.targetScaleFor(flying, current);
        const start = flying.position.clone();
        const middle = new Vec3(
            start.x + (targetPosition.x - start.x) * 0.52,
            start.y + (targetPosition.y - start.y) * 0.52 + 45,
            0,
        );

        if (revealCurrent) this.setCardAndShadowActive(current, false);
        await this.waitForVisual((resolve) => {
            this.tweenCardFlightHeight(flying, duration * 0.5, duration * 0.5);
            this.visualTween(flying)
                .to(duration * 0.5, {
                    position: middle,
                    scale: new Vec3(0.05, 1.04, 1),
                    angle: -5,
                }, { easing: 'quadIn' })
                .call(() => { sprite.spriteFrame = face; })
                .to(duration * 0.5, {
                    position: targetPosition,
                    scale: targetScale,
                    angle: 0,
                }, { easing: 'quadOut' })
                    .call(() => resolve())
                .start();
        });
        checkVisual();
        const currentSprite = current.getComponent(Sprite);
        if (currentSprite) currentSprite.spriteFrame = face;
        if (revealCurrent) this.setCardAndShadowActive(current, true);
        this.destroyFlyingVisual(flying);
    }

    /**
     * 开场当前牌先作为备用牌组的最后一张入场，再从牌堆顶抽出。
     * 此节点不属于逻辑库存；抽走后只留下配置数量的真实备用牌，刷新也不会补位。
     */
    protected createOpeningCurrentSource(backup: Node): Node | null {
        const cards = this.backupCardNodes(backup)
            .filter((card) => card.active)
            .sort((left, right) => left.position.x - right.position.x);
        const template = cards[cards.length - 1] ?? this.backupCardNodes(backup)[0];
        if (!template) return null;
        const source = instantiate(template);
        source.name = 'openingCurrentSource';
        source.active = true;
        const last = template.position;
        const previous = cards[cards.length - 2]?.position;
        const spacing = previous ? last.x - previous.x : 27;
        source.setPosition(last.x + spacing, last.y, last.z);
        backup.addChild(source);
        this.ensureCardShadow(source);
        this.stackBackupCardsLeftToRight(backup);
        return source;
    }

    protected async animateInvalidCard(node: Node | null): Promise<void> {
        const checkVisual = this.visualCheckpoint();
        if (!node) return;
        const origin = node.position.clone();
        await this.waitForVisual((resolve) => {
            this.visualTween(node)
                .to(0.055, { position: new Vec3(origin.x - 18, origin.y, origin.z) }, { easing: 'sineOut' })
                .to(0.055, { position: new Vec3(origin.x + 18, origin.y, origin.z) }, { easing: 'sineInOut' })
                .to(0.05, { position: new Vec3(origin.x - 11, origin.y, origin.z) }, { easing: 'sineInOut' })
                .to(0.05, { position: new Vec3(origin.x + 7, origin.y, origin.z) }, { easing: 'sineInOut' })
                .to(0.045, { position: origin }, { easing: 'sineOut' })
                    .call(() => resolve())
                .start();
        });
        checkVisual();
    }

    protected async animateCardFlip(node: Node, cardName: string, delay: number): Promise<void> {
        const checkVisual = this.visualCheckpoint();
        const sprite = node.getComponent(Sprite);
        if (!sprite) return;
        const frame = await CardSpriteLoader.loadSpriteFrame(cardName);
        checkVisual();
        const originalScale = node.scale.clone();
        await this.waitForVisual((resolve) => {
            this.visualTween(node)
                .delay(delay)
                .to(0.14, {
                    scale: new Vec3(0.035, originalScale.y * 1.03, originalScale.z),
                }, { easing: 'quadIn' })
                .call(() => { sprite.spriteFrame = frame; })
                .to(0.18, { scale: originalScale }, { easing: 'backOut' })
                    .call(() => resolve())
                .start();
        });
        checkVisual();
    }

    protected async animateCurrentCardFlip(cardName: string): Promise<void> {
        const checkVisual = this.visualCheckpoint();
        const current = this.findNode(GameUiNodeId.CurrentCard);
        if (!current || !cardName) return;
        await this.animateCardFlip(current, cardName, 0);
        checkVisual();
    }

    protected async animateRedShaderFlash(node: Node, delay: number): Promise<void> {
        const checkVisual = this.visualCheckpoint();
        const sprite = node.getComponent(Sprite);
        if (!sprite) return;
        const original = new Color(sprite.color.r, sprite.color.g, sprite.color.b, sprite.color.a);
        const red = new Color(255, 72, 72, 255);
        await this.waitForVisual((resolve) => {
            this.visualTween(sprite)
                .delay(delay)
                .to(0.09, { color: red }, { easing: 'quadOut' })
                .to(0.12, { color: original }, { easing: 'quadIn' })
                .to(0.09, { color: red }, { easing: 'quadOut' })
                .to(0.14, { color: original }, { easing: 'quadIn' })
                    .call(() => resolve())
                .start();
        });
        checkVisual();
    }

    protected async animateWildToCurrent(): Promise<void> {
        const checkVisual = this.visualCheckpoint();
        const wildIcon = this.findNode(GameUiNodeId.Wild)?.getChildByName('icon')
            ?? this.findNode(GameUiNodeId.Wild);
        const current = this.findNode(GameUiNodeId.CurrentCard);
        if (!wildIcon || !current) return;
        const flying = this.createFlyingVisual(wildIcon, 'wildToCurrent');
        if (!flying) return;
        const arrivedFrame = await CardSpriteLoader.loadSpriteFrame('poker_wild');
        checkVisual();
        const flyingSprite = flying.getComponent(Sprite);
        if (flyingSprite) flyingSprite.spriteFrame = arrivedFrame;
        flying.setScale(0.78, 0.78, 1);
        await this.tweenFlyingNode(flying, current, 0.42, 'backOut', 18);
        checkVisual();
        const currentSprite = current.getComponent(Sprite);
        if (currentSprite) currentSprite.spriteFrame = arrivedFrame;
    }

    protected async animateCoinReward(): Promise<void> {
        const checkVisual = this.visualCheckpoint();
        const progress = this.findNode(GameUiNodeId.RewardProgress);
        const coin = this.findNode(GameUiNodeId.CoinWallet);
        const coinIcon = coin?.getChildByName('coin_icon') ?? null;
        const iconSprite = coinIcon?.getComponent(Sprite) ?? null;
        const iconTransform = coinIcon?.getComponent(UITransform) ?? null;
        if (!progress || !coin || !coinIcon || !iconSprite?.spriteFrame || !iconTransform) return;

        const start = this.rootPositionOf(progress);
        const destination = this.rootPositionOf(coinIcon);
        const flights: Promise<void>[] = [];
        for (let index = 0; index < 6; index++) {
            const flying = new Node(`rewardCoin_${index}`);
            flying.layer = this.node.layer;
            flying.addComponent(UITransform).setContentSize(iconTransform.width, iconTransform.height);
            const sprite = flying.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = iconSprite.spriteFrame;
            this.node.addChild(flying);
            flying.setPosition(start.x + (index - 2.5) * 24, start.y + Math.abs(index - 2.5) * 9, 0);
            flying.setScale(0.62, 0.62, 1);
            this.bringInputBlockerToFront();

            flights.push(this.waitForVisual((resolve) => {
                this.visualTween(flying)
                    .delay(index * 0.045)
                    .to(0.16, {
                        position: new Vec3(
                            flying.position.x + (destination.x - flying.position.x) * 0.34,
                            flying.position.y + 90 + index * 7,
                            0,
                        ),
                        scale: new Vec3(0.9, 0.9, 1),
                        angle: 90,
                    }, { easing: 'quadOut' })
                    .to(0.34, {
                        position: destination,
                        scale: new Vec3(0.38, 0.38, 1),
                        angle: 270,
                    }, { easing: 'cubicIn' })
                    .call(() => {
                        if (flying.isValid) flying.destroy();
                        resolve();
                    })
                    .start();
            }));
        }
        await Promise.all(flights);
        checkVisual();

        const originalScale = coin.scale.clone();
        await this.waitForVisual((resolve) => {
            this.visualTween(coin)
                .to(0.09, {
                    scale: new Vec3(originalScale.x * 1.12, originalScale.y * 1.12, originalScale.z),
                }, { easing: 'quadOut' })
                .to(0.16, { scale: originalScale }, { easing: 'backOut' })
                    .call(() => resolve())
                .start();
        });
        checkVisual();
    }

    protected async animateRollback(
        visual: Readonly<UndoVisual>,
        restored: Readonly<SolitaireGameState>,
        restoredCurrentCardName: string,
    ): Promise<void> {
        const checkVisual = this.visualCheckpoint();
        if (visual.kind === 'board' && visual.slotId) {
            const current = this.findNode(GameUiNodeId.CurrentCard);
            const targetWorld = this.boardSlotWorldPosition(visual.slotId);
            if (!current) return;
            const flying = this.createFlyingVisual(current, 'rollbackBoard');
            // 飞出的副本保留撤销前的牌面；底下的当前牌先换回快照中的牌，避免两张旧牌重叠。
            await this.replaceCurrentCardBeforeRollback(current, restoredCurrentCardName);
            checkVisual();
            if (!flying || !targetWorld) return;
            const definition = this._level?.slots.find((slot) => slot.id === visual.slotId);
            const boardPosition = this.worldToRoot(targetWorld);
            const currentPosition = this.rootPositionOf(current);
            const geometry = this.createBoardFlightGeometry(
                boardPosition,
                currentPosition,
                this.boardSlotScaleFor(flying, visual.slotId),
                this.targetScaleFor(flying, current),
                definition?.rotation ?? 0,
            );
            // 正向是 0 -> 1；回撤严格按同一条轨迹、角度、缩放和阴影 1 -> 0 倒放。
            await this.tweenBoardFlight(flying, geometry, 1, 0);
            checkVisual();
            this.destroyFlyingVisual(flying);
            return;
        }

        if (visual.kind === 'stock') {
            const current = this.findNode(GameUiNodeId.CurrentCard);
            const target = this.getTopBackupNode(restored.stockRemainingCount);
            if (!current) return;
            const flying = this.createFlyingVisual(current, 'rollbackStock');
            // 同样先固定恢复后的当前牌，再让撤销的牌翻成牌背飞回备用牌堆。
            await this.replaceCurrentCardBeforeRollback(current, restoredCurrentCardName);
            checkVisual();
            if (!flying || !target) return;
            const backFrame = await CardSpriteLoader.loadSpriteFrame('poker_back_01');
            checkVisual();
            const sprite = flying.getComponent(Sprite)!;
            const destination = this.rootPositionOf(target);
            const middle = new Vec3(
                flying.position.x + (destination.x - flying.position.x) * 0.5,
                flying.position.y + (destination.y - flying.position.y) * 0.5 + 40,
                0,
            );
            await this.waitForVisual((resolve) => {
                this.tweenCardFlightHeight(flying, 0.18, 0.2);
                this.visualTween(flying)
                    .to(0.18, { position: middle, scale: new Vec3(0.05, 1, 1), angle: 5 }, { easing: 'quadIn' })
                    .call(() => { sprite.spriteFrame = backFrame; })
                    .to(0.2, { position: destination, scale: this.targetScaleFor(flying, target), angle: 0 }, { easing: 'quadOut' })
                    .call(() => resolve())
                    .start();
            });
            checkVisual();
            this.destroyFlyingVisual(flying);
            return;
        }

        const backup = this.findNode(GameUiNodeId.StockPile);
        if (!backup) return;
        const origin = backup.scale.clone();
        await this.waitForVisual((resolve) => {
            this.visualTween(backup)
                .to(0.14, { scale: new Vec3(origin.x * 0.88, origin.y * 0.88, origin.z) }, { easing: 'quadIn' })
                .to(0.22, { scale: origin }, { easing: 'backOut' })
                    .call(() => resolve())
                .start();
        });
        checkVisual();
    }

    protected async replaceCurrentCardBeforeRollback(current: Node, cardName: string): Promise<void> {
        const checkVisual = this.visualCheckpoint();
        const sprite = current.getComponent(Sprite);
        if (!sprite) return;

        try {
            const frame = await CardSpriteLoader.loadSpriteFrame(cardName);
            checkVisual();
            if (current.isValid) sprite.spriteFrame = frame;
        } catch (error) {
            console.error(`[GamePageUI] 回撤时加载当前牌失败：${cardName}`, error);
        }
    }

    protected createFlyingVisual(source: Node, name: string): Node | null {
        const spriteNode = this.findSpriteNode(source);
        const sourceSprite = spriteNode?.getComponent(Sprite) ?? null;
        const transform = spriteNode?.getComponent(UITransform) ?? null;
        if (!spriteNode || !sourceSprite?.spriteFrame || !transform) return null;

        const flying = new Node(name);
        flying.layer = this.node.layer;
        flying.addComponent(UITransform).setContentSize(transform.width, transform.height);
        const sprite = flying.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = sourceSprite.spriteFrame;
        sprite.color = new Color(sourceSprite.color.r, sourceSprite.color.g, sourceSprite.color.b, sourceSprite.color.a);
        this.node.addChild(flying);
        flying.setPosition(this.rootPositionOf(spriteNode));
        flying.angle = spriteNode.angle;
        this.ensureCardShadow(flying);
        this.bringInputBlockerToFront();
        return flying;
    }

    protected createFlyingCard(frame: import('cc').SpriteFrame, source: Node, name: string): Node | null {
        const sourceWorld = this.worldPositionOf(source);
        const flying = new Node(name);
        flying.layer = this.node.layer;
        flying.addComponent(UITransform).setContentSize(162, 243);
        const sprite = flying.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
        this.node.addChild(flying);
        flying.setPosition(this.worldToRoot(sourceWorld));
        this.ensureCardShadow(flying);
        this.bringInputBlockerToFront();
        return flying;
    }

    protected ensureCardShadow(card: Node): CardShadowFollower {
        const existing = card.getComponent(CardShadowFollower);
        if (existing?.isBound()) {
            existing.syncNow();
            return existing;
        }
        const spriteNode = this.findSpriteNode(card) ?? card;
        const transform = spriteNode.getComponent(UITransform) ?? card.getComponent(UITransform);
        const width = transform?.width ?? this._level?.cardSize.width ?? 162;
        const height = transform?.height ?? this._level?.cardSize.height ?? 243;
        const follower = existing ?? card.addComponent(CardShadowFollower);
        const shadow = this.createCardShadow(`${card.name}${CARD_SHADOW_SUFFIX}`, width, height);
        card.parent?.addChild(shadow);
        follower.bind(shadow);
        return follower;
    }

    protected cardShadowFor(card: Node): CardShadowFollower | null {
        return card.getComponent(CardShadowFollower);
    }

    protected backupCardNodes(backup: Node): Node[] {
        return backup.children.filter((child) => child.name !== 'paid_backup_effect'
            && !child.name.endsWith(CARD_SHADOW_SUFFIX));
    }

    /** 左边是底牌，越靠右越后绘制；阴影与所属卡牌保持成对顺序。 */
    protected stackBackupCardsLeftToRight(backup: Node): void {
        this.backupCardNodes(backup)
            .filter((card) => card.active)
            .sort((left, right) => left.position.x - right.position.x)
            .forEach((card, index) => {
                const shadow = this.cardShadowFor(card) ?? this.ensureCardShadow(card);
                shadow.setSiblingPairIndex(index);
            });
    }

    /** Prefab 只提供基准牌槽；运行时按实际备用牌数量向右扩容。 */
    protected ensureBackupCardCapacity(backup: Node, count: number): Node[] {
        const cards = this.backupCardNodes(backup)
            .sort((left, right) => left.position.x - right.position.x);
        const template = cards[0];
        if (!template) return cards;
        const firstX = template.position.x;
        const spacing = cards[1] ? cards[1].position.x - firstX : 27;
        while (cards.length < count) {
            const card = instantiate(template);
            card.name = `poker_back_${String(cards.length + 1).padStart(2, '0')}`;
            card.setPosition(
                firstX + spacing * cards.length,
                template.position.y,
                template.position.z,
            );
            backup.addChild(card);
            cards.push(card);
        }
        return cards;
    }

    /** A layered rounded silhouette keeps the edge soft without introducing another texture asset. */
    protected createCardShadow(name: string, width: number, height: number): Node {
        const shadow = new Node(name);
        shadow.layer = this.node.layer;
        shadow.addComponent(UITransform).setContentSize(width + 28, height + 28);
        const graphics = shadow.addComponent(Graphics);
        const radius = Math.max(10, Math.min(width, height) * 0.085);
        const layers = [
            { spread: 14, alpha: 12 },
            { spread: 8, alpha: 18 },
            { spread: 3, alpha: 28 },
        ];
        for (const layer of layers) {
            graphics.fillColor = new Color(16, 12, 10, layer.alpha);
            graphics.roundRect(
                -width * 0.5 - layer.spread,
                -height * 0.5 - layer.spread,
                width + layer.spread * 2,
                height + layer.spread * 2,
                radius + layer.spread,
            );
            graphics.fill();
        }
        shadow.addComponent(UIOpacity).opacity = CARD_SHADOW_REST_OPACITY;
        return shadow;
    }

    protected setCardAndShadowActive(card: Node, active: boolean): void {
        card.active = active;
        const shadow = this.cardShadowFor(card) ?? this.ensureCardShadow(card);
        shadow.setVisible(active);
    }

    protected tweenCardHeight(
        card: Node,
        duration: number,
        height: number,
        delay = 0,
        easing: TweenEasing | ((k: number) => number) = 'sineInOut',
    ): void {
        const shadow = this.cardShadowFor(card) ?? this.ensureCardShadow(card);
        this.visualTween(shadow)
            .delay(delay)
            .to(duration, { simulatedHeight: height }, {
                easing,
                onUpdate: () => shadow.syncNow(),
            })
            .start();
    }

    protected tweenCardFlightHeight(card: Node, riseDuration: number, fallDuration: number, delay = 0): void {
        const shadow = this.cardShadowFor(card) ?? this.ensureCardShadow(card);
        this.visualTween(shadow)
            .delay(delay)
            .to(riseDuration, { simulatedHeight: BOARD_CARD_ARC_HEIGHT }, {
                easing: 'quadOut',
                onUpdate: () => shadow.syncNow(),
            })
            .to(fallDuration, { simulatedHeight: 0 }, {
                easing: 'quadIn',
                onUpdate: () => shadow.syncNow(),
            })
            .start();
    }

    protected destroyFlyingVisual(flying: Node): void {
        if (flying.isValid) flying.destroy();
    }

    protected async tweenFlyingNode(
        flying: Node,
        target: Node,
        duration: number,
        easing: TweenEasing | ((k: number) => number),
        angle = 0,
        delay = 0,
    ): Promise<void> {
        const checkVisual = this.visualCheckpoint();
        const targetScale = this.targetScaleFor(flying, target);
        await this.tweenFlyingNodeToPosition(
            flying,
            this.rootPositionOf(target),
            duration,
            easing,
            angle,
            delay,
            targetScale,
        );
        checkVisual();
    }

    protected async tweenFlyingNodeToPosition(
        flying: Node,
        position: Vec3,
        duration: number,
        easing: TweenEasing | ((k: number) => number),
        angle = 0,
        delay = 0,
        scale = new Vec3(1, 1, 1),
    ): Promise<void> {
        const checkVisual = this.visualCheckpoint();
        const start = flying.position.clone();
        const middle = new Vec3(
            start.x + (position.x - start.x) * 0.5,
            start.y + (position.y - start.y) * 0.5 + Math.min(90, Math.abs(position.x - start.x) * 0.08 + 28),
            start.z + (position.z - start.z) * 0.5,
        );
        const startScale = flying.scale.clone();
        const middleScale = new Vec3(
            startScale.x + (scale.x - startScale.x) * 0.48,
            startScale.y + (scale.y - startScale.y) * 0.48,
            1,
        );
        const landingScale = new Vec3(scale.x * 1.055, scale.y * 1.055, scale.z);
        await this.waitForVisual((resolve) => {
            this.tweenCardFlightHeight(flying, duration * 0.48, duration * 0.52, delay);
            this.visualTween(flying)
                .delay(delay)
                .to(duration * 0.48, {
                    position: middle,
                    scale: middleScale,
                    angle: angle * 0.45 - 3,
                }, { easing: 'quadOut' })
                .to(duration * 0.4, {
                    position,
                    scale: landingScale,
                    angle,
                }, { easing })
                .to(Math.max(0.055, duration * 0.12), { scale, angle }, { easing: 'sineOut' })
                    .call(() => resolve())
                .start();
        });
        checkVisual();
        this.destroyFlyingVisual(flying);
    }

    protected targetScaleFor(flying: Node, target: Node): Vec3 {
        const from = flying.getComponent(UITransform);
        const toNode = this.findSpriteNode(target) ?? target;
        const to = toNode.getComponent(UITransform);
        if (!from || !to || from.width === 0 || from.height === 0) return new Vec3(1, 1, 1);
        return new Vec3(to.width / from.width, to.height / from.height, 1);
    }

    protected boardSlotWorldPosition(slotId: string): Vec3 | null {
        const content = this.findNode(GameUiNodeId.Board);
        const definition = this._level?.slots.find((slot) => slot.id === slotId);
        const transform = content?.getComponent(UITransform);
        if (!content || !definition || !transform) return null;
        const local = new Vec3(definition.x, definition.y, 0);
        return transform.convertToWorldSpaceAR(local);
    }

    protected boardSlotScaleFor(flying: Node, slotId: string): Vec3 {
        const content = this.findNode(GameUiNodeId.Board);
        const definition = this._level?.slots.find((slot) => slot.id === slotId);
        const from = flying.getComponent(UITransform);
        if (!content || !definition || !from || from.width === 0 || from.height === 0) {
            return new Vec3(1, 1, 1);
        }
        const width = definition.width ?? this._level?.cardSize.width ?? 162;
        const height = definition.height ?? this._level?.cardSize.height ?? 243;
        return new Vec3(width / from.width, height / from.height, 1);
    }

    protected getTopBackupNode(count: number): Node | null {
        const backup = this.findNode(GameUiNodeId.StockPile);
        if (!backup) return null;
        const cards = this.backupCardNodes(backup);
        if (cards.length === 0) return null;
        const index = Math.max(0, Math.min(count, cards.length) - 1);
        return cards[index] ?? null;
    }

    protected findSpriteNode(root: Node): Node | null {
        if (root.getComponent(Sprite)) return root;
        for (const child of root.children) {
            const found = this.findSpriteNode(child);
            if (found) return found;
        }
        return null;
    }

    protected worldPositionOf(node: Node): Vec3 {
        const result = new Vec3();
        node.getWorldPosition(result);
        return result;
    }

    protected rootPositionOf(node: Node): Vec3 {
        return this.worldToRoot(this.worldPositionOf(node));
    }

    protected worldToRoot(world: Vec3): Vec3 {
        const rootTransform = this.node.getComponent(UITransform);
        return rootTransform ? rootTransform.convertToNodeSpaceAR(world) : world.clone();
    }

    protected ensureInputBlocker(): Node {
        const existing = this.node.getChildByName(GameUiNodeId.InputBlocker);
        if (existing) return existing;

        const blocker = new Node(GameUiNodeId.InputBlocker);
        blocker.layer = this.node.layer;
        const rootTransform = this.node.getComponent(UITransform);
        blocker.addComponent(UITransform).setContentSize(
            rootTransform?.width ?? 1181,
            rootTransform?.height ?? 2556,
        );
        blocker.addComponent(BlockInputEvents);
        blocker.active = false;
        this.node.addChild(blocker);
        return blocker;
    }

    protected bringInputBlockerToFront(): void {
        const blocker = this.node.getChildByName(GameUiNodeId.InputBlocker);
        if (blocker?.active) blocker.setSiblingIndex(this.node.children.length - 1);
    }

    protected cleanupTransientVisuals(root: Node = this.node): void {
        const exactNames = new Set([
            'boardToCurrent',
            'backupToCurrent',
            'openingCurrentCard',
            'openingCurrentSource',
            'wildToCurrent',
            'rollbackBoard',
            'rollbackStock',
            'progress_hit_flash',
        ]);
        for (const child of [...root.children]) {
            const transient = exactNames.has(child.name)
                || child.name.startsWith('rewardCoin_');
            if (transient) {
                child.destroy();
            } else {
                this.cleanupTransientVisuals(child);
            }
        }
    }

    protected validateUiContract(): boolean {
        const issues: string[] = [];
        for (const spec of GAME_UI_COMPONENT_SPECS) {
            if (spec.runtimeOwned) continue;
            const matches = this.findNodes(spec.node);
            if (matches.length === 0) issues.push(`缺少 ${spec.id}(${spec.node})`);
            if (matches.length > 1) issues.push(`重复 ${spec.id}(${spec.node}) ×${matches.length}`);
        }
        if (issues.length > 0) {
            console.error(`[GamePageUI] UI 合约错误：${issues.join(', ')}`);
            return false;
        }
        return true;
    }

    protected async applyCardSprite(node: Node, cardName: string, version: number): Promise<void> {
        const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
        try {
            const frame = await CardSpriteLoader.loadSpriteFrame(cardName);
            if (node.isValid && version === this._renderVersion) sprite.spriteFrame = frame;
        } catch (error) {
            console.error(`[GamePageUI] 加载牌面失败：${cardName}`, error);
        }
    }

    protected renderEconomy(view: Readonly<GamePageViewState>): void {
        const coinLabel = this.findNode(GameUiNodeId.CoinWallet)
            ?.getChildByName('coin_num')?.getComponent(Label) ?? null;
        if (coinLabel) coinLabel.string = String(view.coins);

        this.renderActionCost(PaidGameAction.Rollback, view.actionCosts[PaidGameAction.Rollback]);
        this.renderActionCost(PaidGameAction.Wild, view.actionCosts[PaidGameAction.Wild]);
        this.renderActionCost(PaidGameAction.AddBackup, view.actionCosts[PaidGameAction.AddBackup]);
    }

    protected renderActionCost(actionName: PaidGameAction, cost: number): void {
        const action = this.findNode(actionName);
        const consume = action ? this.findNode('consume', action) : null;
        const costLabel = consume ? this.findNode('coin_num', consume)?.getComponent(Label) : null;
        if (costLabel) costLabel.string = String(cost);
    }

    protected showToast(message: string): void {
        this.node.getChildByName(GameUiNodeId.Toast)?.destroy();

        const toast = new Node(GameUiNodeId.Toast);
        toast.layer = this.node.layer;
        toast.addComponent(UITransform).setContentSize(680, 120);
        const background = toast.addComponent(Graphics);
        background.fillColor = new Color(0, 0, 0, 210);
        background.roundRect(-340, -60, 680, 120, 24);
        background.fill();

        const labelNode = new Node('label');
        labelNode.layer = toast.layer;
        labelNode.addComponent(UITransform).setContentSize(640, 100);
        const label = labelNode.addComponent(Label);
        label.string = message;
        label.fontSize = 42;
        label.lineHeight = 52;
        label.color = new Color(255, 255, 255, 255);
        label.horizontalAlign = HorizontalTextAlignment.CENTER;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        toast.addChild(labelNode);

        toast.setPosition(0, -250, 0);
        this.node.addChild(toast);
        toast.setSiblingIndex(this.node.children.length - 1);
        this.scheduleOnce(() => {
            if (toast.isValid) toast.destroy();
        }, 1.5);
    }

    protected setActionNode(name: GameUiNodeId, visible: boolean): void {
        const node = this.findNode(name);
        if (node) node.active = visible;
    }

    protected setButtonInteractable(name: GameUiNodeId, interactable: boolean): void {
        const button = this.findNode(name)?.getComponent(Button) ?? null;
        if (button) button.interactable = interactable;
    }

    protected bringActionsToFront(...names: GameUiNodeId[]): void {
        for (const name of names) {
            const node = this.findNode(name);
            if (node?.parent) node.setSiblingIndex(node.parent.children.length - 1);
        }
    }

    protected renderProgressItems(
        progressItems: Node,
        cells: readonly ProgressCellState[],
    ): void {
        this.ensureProgressItemCount(progressItems);
        progressItems.children.forEach((item, index) => {
            if (index >= HITS_PER_REWARD) {
                item.active = false;
                return;
            }
            item.active = true;
            this.renderProgressColor(item, index, cells[index] ?? ProgressCellState.Empty);
        });
    }

    protected ensureProgressItemCount(progressItems: Node): void {
        const centerTemplate = progressItems.children[1] ?? null;
        if (!centerTemplate) return;

        const first = progressItems.children[0] ?? null;
        const spacing = centerTemplate.position.x - (first?.position.x ?? centerTemplate.position.x - 46.5);
        while (progressItems.children.length < HITS_PER_REWARD) {
            const index = progressItems.children.length;
            const item = instantiate(centerTemplate) as Node;
            item.name = `center_${index}`;
            item.setPosition(
                centerTemplate.position.x + spacing * (index - 1),
                centerTemplate.position.y,
                centerTemplate.position.z,
            );
            progressItems.addChild(item);
        }
    }

    protected renderProgressColor(item: Node, index: number, cellState: ProgressCellState): void {
        const suffix = index === 0 ? '01' : '02';
        const assetName = cellState === ProgressCellState.Red
            ? `img_main_progress_red${suffix}`
            : cellState === ProgressCellState.Black
                ? `img_main_progress_black${suffix}`
                : `img_main_progress_gray${suffix}`;

        item.children.forEach((variant) => {
            variant.active = variant.name === assetName;
        });
    }

    protected ensureRewardProgressBackdrop(): void {
        const progress = this.findNode(GameUiNodeId.RewardProgress);
        if (!progress) return;

        const frame = progress.getChildByName('board');
        const backdrop = progress.getChildByName('reward_backdrop');
        if (backdrop) backdrop.destroy();
        if (frame) {
            frame.active = true;
            const sprite = frame.getComponent(Sprite);
            if (sprite) sprite.enabled = true;
            frame.setSiblingIndex(0);
        }
    }

    protected ensureStatusLabel(): void {
        if (this.node.getChildByName(GameUiNodeId.Status)) return;
        const node = new Node(GameUiNodeId.Status);
        node.layer = this.node.layer;
        node.addComponent(UITransform).setContentSize(900, 180);
        const label = node.addComponent(Label);
        label.fontSize = 42;
        label.lineHeight = 54;
        label.color = new Color(255, 255, 255, 255);
        label.horizontalAlign = HorizontalTextAlignment.CENTER;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        node.setPosition(0, -340, 0);
        this.node.addChild(node);
    }

    protected setStatus(message: string): void {
        this.ensureStatusLabel();
        const node = this.node.getChildByName(GameUiNodeId.Status);
        const label = node?.getComponent(Label) ?? null;
        if (label && node) {
            label.string = message;
            node.active = message.length > 0;
        }
    }

    protected findNode(name: string, root: Node = this.node): Node | null {
        if (root.name === name) return root;
        for (const child of root.children) {
            const found = this.findNode(name, child);
            if (found) return found;
        }
        return null;
    }

    protected findNodes(name: string, root: Node = this.node, result: Node[] = []): Node[] {
        if (root.name === name) result.push(root);
        root.children.forEach((child) => this.findNodes(name, child, result));
        return result;
    }
}
