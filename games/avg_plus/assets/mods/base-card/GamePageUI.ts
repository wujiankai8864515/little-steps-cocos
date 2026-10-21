import { _decorator, AudioClip, AudioSource, BlockInputEvents, Color, Graphics, HorizontalTextAlignment, JsonAsset, Label, Node, Button, resources, Sprite, SpriteFrame, UIOpacity, UITransform, VerticalTextAlignment, Widget, view } from 'cc';
import { TaskScope } from '../../foundation/Tasks';
import { Runtime } from '../../foundation/Runtime';
import type { CommittedContext } from '../../foundation/Contracts';
import { GamePresentation } from './GamePresentation';
import { CardLevelRepository } from './CardLevelRepository';
import { HighLowSolitaireCore } from './HighLowSolitaireCore';
import { GameSessionStore } from './GameSessionStore';
import { CardCompletionUI } from './CardCompletionUI';
import { CardSpriteLoader } from './CardSpriteLoader';
import { GameUiAction, GameUiActionType, GameUiNodeId, buildGamePageViewState, type GamePageViewState } from './GameUIContract';
import { CardState, createCardMod } from './CardMod';
import { parseOpeningStockMotion, type CardSound } from './GameVisualTypes';
import { loadProfile, extensionsFor } from '../Registry';
import type { CardBackgroundConfig, EconomyConfig } from '../base-shell/CatalogConfig';
const { ccclass } = _decorator;
const PACKAGED_CONTENT_LOAD_TIMEOUT_MS = 30000;
@ccclass('GamePageUI')
export class GamePageUI extends GamePresentation {
    private readonly lifetime = new TaskScope();
    private runtime: Runtime | null = null;
    private onExit: (() => void) | null = null;
    private onComplete: (() => void) | null = null;
    private bound = false;
    private exiting = false;
    private economy: EconomyConfig | undefined;
    private onCheckpoint: ((state: Readonly<CardState>, action: string) => Promise<void>) | null = null;
    private backgroundFrame: SpriteFrame | null = null;
    private initialStockCount = 10;
    private gems = 0;
    private completionRewardCoins = 0;
    private completionUI: CardCompletionUI | null = null;
    private pauseOverlay: Node | null = null;
    private checkpointSaved = false;
    private cardSounds: Partial<Record<CardSound, AudioSource[]>> = {};
    private readonly cardSoundClips = new Set<AudioClip>();
    private dealSoundVoice = 0;
    private lastDealSoundAt = -Infinity;
    protected onLoad(): void { this.prepareOpeningVisualState(); }
    public async open(levelId: string, onExit?: () => void, onComplete?: () => void, options?: {
        initialCoins: number; initialGems?: number; headerTitle?: string; economy: EconomyConfig; background?: CardBackgroundConfig;
        soundEnabled?: boolean;
        checkpoint: (state: Readonly<CardState>, action: string) => Promise<void>;
    }): Promise<void> {
        const entryOpacity=this.node.getComponent(UIOpacity)??this.node.addComponent(UIOpacity);
        entryOpacity.opacity=0;
        this.prepareOpeningVisualState();
        this.onExit = onExit ?? null;
        this.onComplete = onComplete ?? null;
        this.economy = options?.economy; this.onCheckpoint = options?.checkpoint ?? null;
        this.gems = options?.initialGems ?? 0;
        if (options?.background) await this.applyBackground(options.background);
        else this.fitBackground();
        this.bind(); this.setStatus('正在加载关卡…');
        // 打包环境首次读取资源 Bundle 会明显慢于编辑器；关卡和 profile 并行加载，
        // 并使用与外层页面进入流程一致的 30 秒边界，避免先被默认 8 秒取消。
        const [level, profile, stockMotion] = await this.lifetime.run(
            () => Promise.all([
                new CardLevelRepository().loadLevel(levelId),
                loadProfile(),
                new Promise<JsonAsset>((resolve, reject) => resources.load('config/card-opening-motion', JsonAsset,
                    (error, asset) => error || !asset ? reject(error ?? new Error('备用牌开场轨迹缺失')) : resolve(asset))),
                this.loadCardSounds(options?.soundEnabled ?? true),
            ]),
            PACKAGED_CONTENT_LOAD_TIMEOUT_MS,
        );
        this.lifetime.check();
        if (!this.node.isValid) return;
        this._level = level;
        this._openingStockMotion = parseOpeningStockMotion(stockMotion.json);
        if (!this.validateUiContract()) throw new Error('卡牌 prefab 节点合约不完整');
        const entry = profile.modules.find(item => item.id === 'base-card' && item.enabled);
        if (!entry) throw new Error('当前组合未启用 base-card');
        const configuredTestMode = entry.config.singleBackupCardTest;
        if (configuredTestMode !== undefined && typeof configuredTestMode !== 'boolean') {
            throw new Error('base-card.singleBackupCardTest 必须为 boolean');
        }
        // 测试开关默认关闭；仅在配置中显式开启时使用单张备用牌与强制不命中牌面。
        const singleBackupCardTest = configuredTestMode ?? false;
        this.initialStockCount = singleBackupCardTest ? 1 : level.initialStockCount ?? 10;
        if (level.portraitLayout) {
            const current = this.findNode(GameUiNodeId.CurrentCard);
            const alignment = current?.getComponent(Widget);
            if (alignment) {
                alignment.isAlignHorizontalCenter = true;
                alignment.horizontalCenter = level.portraitLayout.currentCardX;
                alignment.updateAlignment();
            }
        }
        const faces=Array.from(new Set([...(level.currentCard?[level.currentCard.sourceName]:[]),
            ...level.slots.filter(slot=>slot.initialFaceUp).map(slot=>slot.sourceName!)]));
        const [backFrame,wildFrame] = await this.lifetime.run(() => Promise.all([
            CardSpriteLoader.loadSpriteFrame('poker_back_01'),CardSpriteLoader.loadSpriteFrame('poker_wild'),
            ...faces.map(name=>CardSpriteLoader.loadSpriteFrame(name)),
        ]),PACKAGED_CONTENT_LOAD_TIMEOUT_MS);
        this.lifetime.check();
        this.findNode(GameUiNodeId.StockPile)?.children.forEach(child => {
            const sprite = child.getComponent(Sprite);
            if (sprite) { sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = backFrame; }
        });
        const wild = this.findNode(GameUiNodeId.Wild)?.getChildByName('icon')?.getComponent(Sprite);
        if (wild) {
            wild.sizeMode = Sprite.SizeMode.CUSTOM;
            wild.spriteFrame = wildFrame;
            const height = level.cardSize.width * wildFrame.originalSize.height / wildFrame.originalSize.width;
            wild.node.getComponent(UITransform)?.setContentSize(level.cardSize.width, height);
            wild.node.setPosition(0, (level.cardSize.height - height) / 2);
        }
        const base = createCardMod(level, entry.config.seed ?? 20260917, {
            render: ctx => [{ id: 'base-card.render', timeoutMs: 10000, run: async scope => {
                const restore = this.preserveVisualTransforms();
                let cleaned = false;
                const cleanup = () => { if (cleaned) return; cleaned = true; this.cancelVisuals(); restore(); this.cleanupTransientVisuals(); };
                const release = scope.own(cleanup);
                try { await this.present(ctx, scope); } finally { cleanup(); release(); }
            } }],
            afterRender: () => { if (this.node.isValid) {
                this.cleanupTransientVisuals();
                if (this.completionUI?.isValid) this.completionUI.updateCoins(this.model().session.coins);
                else this.refresh(false);
                const opacity = this.node.getComponent(UIOpacity); if (opacity) opacity.opacity = 255;
            } },
        }, {
            initialStockCount: this.initialStockCount,
            // 测试模式要能稳定观察免费牌耗尽后的付费入场效果。
            forceUnmatchedOpeningCards: singleBackupCardTest,
            initialCoins: options?.initialCoins,
            economy: options?.economy,
            retryCost: options?.economy.entryCost,
        });
        const extras = extensionsFor(profile, 'card', { root: this.node, find: name => this.findNode(name), context: () => levelId, afterInsert: () => this.bringInputBlockerToFront() });
        this.runtime = new Runtime([base, ...extras], { profile, level }, {
            diagnostic: entry => console.warn(`[Mods] ${entry.stage}: ${entry.message}`),
        });
        await this.runtime.open();
        this.lifetime.check();
        await this.send('card.open');
    }
    private async loadCardSounds(enabled: boolean): Promise<void> {
        const kinds: CardSound[] = ['deal', 'play', 'draw', 'undo'];
        let loaded: (AudioClip | null)[];
        try {
            loaded = await this.lifetime.run(() => Promise.all(kinds.map(kind =>
                new Promise<AudioClip | null>(resolve => resources.load(`audio/cards/card-${kind}`, AudioClip,
                    (error, asset) => {
                        if (error || !asset) console.warn(`[Card audio] ${kind} 加载失败`, error);
                        resolve(error ? null : asset ?? null);
                    })))), PACKAGED_CONTENT_LOAD_TIMEOUT_MS);
        } catch (error) {
            this.lifetime.check();
            console.warn('[Card audio] 加载失败，保留正常牌局操作', error);
            return;
        }
        this.lifetime.check();
        if (!this.node.isValid) return;
        this.lifetime.own(() => this.disposeCardSounds());
        loaded.forEach((clip, index) => {
            if (!clip) return;
            clip.addRef(); this.cardSoundClips.add(clip);
            const kind = kinds[index], voices: AudioSource[] = [];
            for (let voice = 0; voice < (kind === 'deal' ? 3 : 1); voice++) {
                const node = new Node(`cardSound_${kind}_${voice}`);
                this.node.addChild(node);
                const source = node.addComponent(AudioSource);
                source.playOnAwake = false; source.loop = false;
                source.volume = enabled ? 1 : 0;
                source.clip = clip;
                voices.push(source);
            }
            this.cardSounds[kind] = voices;
        });
    }
    protected playCardSound(kind: CardSound): void {
        if (this.lifetime.cancelled || !this.node.isValid) return;
        const voices = this.cardSounds[kind];
        if (!voices?.length || !voices[0].isValid || voices[0].volume === 0) return;
        if (kind === 'deal') {
            const now = this.openingTime();
            // 大牌阵按真实时间合并同一拍，避免低帧率追帧时几十张牌的声音同时叠加。
            if (now - this.lastDealSoundAt < 0.045) return;
            this.lastDealSoundAt = now;
        }
        const source = voices[kind === 'deal' ? this.dealSoundVoice++ % voices.length : 0];
        try { source.play(); }
        catch (error) { console.warn('[Card audio] 播放失败，保留正常牌局操作', error); }
    }
    private disposeCardSounds(): void {
        for (const voices of Object.values(this.cardSounds)) for (const source of voices ?? []) {
            if (!source.isValid) continue;
            source.stop(); source.clip = null;
            if (source.node.isValid) source.node.destroy();
        }
        this.cardSounds = {};
        for (const clip of this.cardSoundClips) clip.decRef();
        this.cardSoundClips.clear();
    }
    private bind(): void {
        if (this.bound) return; this.bound = true;
        const pairs: [GameUiNodeId, GameUiActionType][] = [
            [GameUiNodeId.StockPile, GameUiActionType.DrawStock], [GameUiNodeId.Retry, GameUiActionType.Retry],
            [GameUiNodeId.End, GameUiActionType.Exit], [GameUiNodeId.Rollback, GameUiActionType.Rollback],
            [GameUiNodeId.Wild, GameUiActionType.ToggleWild], [GameUiNodeId.AddBackup, GameUiActionType.AddBackup], [GameUiNodeId.Pause, GameUiActionType.TogglePause],
        ];
        pairs.forEach(([name, type]) => this.bindAction(name, type));
        this.ensureRewardProgressBackdrop(); this.ensureStatusLabel(); this.ensureInputBlocker();
    }
    private async applyBackground(config: CardBackgroundConfig): Promise<void> {
        const frame = await this.lifetime.run(() => new Promise<SpriteFrame>((resolve,reject) =>
            resources.load(config.spritePath+'/spriteFrame',SpriteFrame,(error,value)=>error||!value?reject(error??new Error('卡牌背景不存在')):resolve(value))),PACKAGED_CONTENT_LOAD_TIMEOUT_MS);
        this.lifetime.check();
        const bg=this.findNode('bg'),sprite=bg?.getComponent(Sprite),transform=bg?.getComponent(UITransform);
        if(!bg||!sprite||!transform)throw new Error('卡牌背景挂点缺失');
        frame.addRef();this.backgroundFrame=frame;
        sprite.spriteFrame=frame;
        this.fitBackground(config.focalX,config.focalY);
    }
    private fitBackground(focalX=.5,focalY=.5): void {
        const bg=this.findNode('bg'),sprite=bg?.getComponent(Sprite),transform=bg?.getComponent(UITransform),frame=sprite?.spriteFrame;
        if(!bg||!sprite||!transform||!frame)throw new Error('卡牌背景挂点缺失');
        const widget=bg.getComponent(Widget);if(widget)widget.enabled=false;
        const viewport=view.getVisibleSize(),root=this.node.getComponent(UITransform)!;
        const factor=Math.max(Math.max(root.width,viewport.width)/frame.originalSize.width,Math.max(root.height,viewport.height)/frame.originalSize.height);
        const width=frame.originalSize.width*factor,height=frame.originalSize.height*factor;
        transform.setContentSize(width,height);transform.setAnchorPoint(.5,.5);
        sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.trim=false;
        bg.setPosition((.5-focalX)*width,(.5-focalY)*height);
    }
    private bindAction(name: GameUiNodeId, type: GameUiActionType): void {
        const node = this.findNode(name); if (!node) return;
        // Click handlers are installed by this module; the view supplies only stable anchors.
        const button = node.getComponent(Button) ?? node.addComponent(Button);
        if (button) {
            // backup 是整叠备用牌的父节点；缩放它会让所有牌背同时弹一下。
            // 抽牌只播放顶牌飞行动画，不给整叠牌添加按压缩放。
            if (name === GameUiNodeId.StockPile) button.transition = Button.Transition.NONE;
            else this.configureButtonFeedback(button, 1.06);
        }
        node.on('click', () => void this.dispatch({ type } as GameUiAction), this);
    }
    protected async dispatch(action: GameUiAction): Promise<void> {
        const mapping: Record<GameUiActionType, string> = {
            playBoardCard: 'card.play', drawStock: 'card.draw', retry: 'card.restart', exit: 'card.exit',
            rollback: 'card.rollback', toggleWild: 'card.wild', addBackup: 'card.addBackup', togglePause: 'card.pause',
        };
        await this.send(mapping[action.type], action.type === GameUiActionType.PlayBoardCard ? { slotId: action.slotId } : undefined);
    }
    public get canGrantCoins(): boolean {
        return Boolean(this.runtime && !this.runtime.isBusy && !this.lifetime.cancelled && this.node.isValid &&
            (!this.exiting || this.completionUI?.isValid));
    }
    public async grantCoins(): Promise<void> {
        if (!this.canGrantCoins) throw new Error('牌局暂未就绪');
        await this.send('card.grantCoins');
    }
    private async send(type: string, payload?: unknown): Promise<void> {
        const runtime = this.runtime;
        const walletOnly = type === 'card.grantCoins';
        if (!runtime || runtime.isBusy || (this.exiting && !walletOnly)) return;
        this.checkpointSaved = false;
        if (!walletOnly) this.lock(true);
        try {
            const result = await runtime.dispatch({ type, ...(payload === undefined ? {} : { payload }) });
            if (!this.node.isValid) return;
            if (result.status === 'rejected' || result.status === 'failed') this.showToast(result.reason ?? '操作未完成');
            if (result.status === 'committed' && this.onCheckpoint && !this.checkpointSaved) {
                try { await this.onCheckpoint(runtime.read<CardState>('base-card'), type); this.checkpointSaved = true; }
                catch (error) { if (this.node.isValid) { console.error('[Card save]', error); this.showToast('进度保存未完成，请稍后重试'); } return; }
                if (!this.node.isValid) return;
            }
            if (type === 'card.exit' && result.status === 'committed') {
                this.exiting = true; const callback = this.onExit; this.onExit = null;
                this.scheduleOnce(() => callback?.(), 0);
            } else if (!walletOnly && result.status === 'committed' &&
                this.model().core.isComplete && this.onComplete) {
                this.exiting = true;
                const coinFrame=this.findNode(GameUiNodeId.CoinWallet)?.getChildByName('coin_icon')?.getComponent(Sprite)?.spriteFrame;
                if(!coinFrame)throw new Error('原有金币组件资源缺失');
                for (const child of this.node.children) {
                    // Completion keeps only the background; remaining stock/HUD must not show through.
                    if (child.name !== 'bg') child.active = false;
                }
                const completion = new Node('CardCompletion');
                completion.layer = this.node.layer; this.node.addChild(completion);
                this.completionUI = completion.addComponent(CardCompletionUI);
                await this.lifetime.run(() => this.completionUI!.open({
                    coins: this.model().session.coins, gems: this.gems, rewardCoins: this.completionRewardCoins,
                }, () => {
                    const callback = this.onComplete; this.onComplete = null; this.onExit = null;
                    // Keep the completed board stable until Continue; hand off after the button event.
                    this.scheduleOnce(() => callback?.(), 0);
                }, coinFrame), PACKAGED_CONTENT_LOAD_TIMEOUT_MS);
            }
        } finally { if (this.node.isValid) {
            if (this.completionUI?.isValid) this.completionUI.updateCoins(this.model().session.coins);
            else if (!this.exiting) this.refresh(false);
            if (!this.exiting && !walletOnly) this.lock(false);
        } }
    }
    private model() {
        const state = this.runtime!.read<CardState>('base-card');
        const core = new HighLowSolitaireCore(this._level!); core.restoreSnapshot(state.core);
        const session = new GameSessionStore(this.economy,undefined,this.initialStockCount); session.restoreCheckpoint(state.session);
        return { state, core, session };
    }
    private refresh(locked: boolean, concealed = false): GamePageViewState | null {
        if (!this.runtime || !this.node.isValid) return null;
        const { state, core, session } = this.model();
        const view = buildGamePageViewState({ core: core.getState(), session: session.getViewState(), paused: state.paused, inputLocked: locked, canRollback: this.runtime.canUndo });
        const version = ++this._renderVersion;
        this.renderBoard(view, version, concealed); this.renderCurrent(view, version, concealed); this.renderBackup(view, concealed);
        this.renderProgress(view); this.renderEconomy(view); this.renderStatus(view); this.renderActionState(view);
        this.renderPause(state.paused);
        return view;
    }
    private renderPause(paused: boolean): void {
        if (!paused) { if (this.pauseOverlay?.isValid) this.pauseOverlay.active = false; return; }
        if (!this.pauseOverlay?.isValid) {
            const overlay = this.pauseOverlay = new Node('PausedGame'); overlay.layer = this.node.layer;
            const size = view.getVisibleSize();
            overlay.addComponent(UITransform).setContentSize(size.width, size.height);
            overlay.addComponent(BlockInputEvents); this.node.addChild(overlay);
            const dim = overlay.addComponent(Graphics); dim.fillColor = new Color(20, 12, 39, 210);
            dim.rect(-size.width / 2, -size.height / 2, size.width, size.height); dim.fill();
            const panel = new Node('pausePanel'); panel.layer = overlay.layer; overlay.addChild(panel);
            panel.addComponent(UITransform).setContentSize(830, 700);
            const paint = panel.addComponent(Graphics); paint.fillColor = new Color(48, 27, 70);
            paint.roundRect(-415, -350, 830, 700, 46); paint.fill();
            paint.strokeColor = new Color(189, 135, 207, 170); paint.lineWidth = 2;
            paint.roundRect(-415, -350, 830, 700, 46); paint.stroke();
            const text = (name: string, value: string, y: number, parent = panel) => {
                const node = new Node(name); node.layer = panel.layer; parent.addChild(node); node.setPosition(0, y);
                node.addComponent(UITransform).setContentSize(690, 100); const label = node.addComponent(Label);
                label.string = value; label.fontSize = name === 'title' ? 64 : 38; label.lineHeight = 78;
                label.horizontalAlign = HorizontalTextAlignment.CENTER; label.verticalAlign = VerticalTextAlignment.CENTER;
                label.color = Color.WHITE; return node;
            };
            text('title', '已暂停', 225);
            const button = (name: string, value: string, y: number, color: Color, type: string) => {
                const node = new Node(name); node.layer = panel.layer; panel.addChild(node); node.setPosition(0, y);
                node.addComponent(UITransform).setContentSize(670, 108);
                const g = node.addComponent(Graphics); g.fillColor = color; g.roundRect(-335, -54, 670, 108, 54); g.fill();
                text(name+'Label', value, 0, node); const b = node.addComponent(Button); this.configureButtonFeedback(b, 1.025);
                node.on(Button.EventType.CLICK, () => void this.send(type), this);
            };
            button('resume', '继续游戏', 65, new Color(192, 47, 151), 'card.pause');
            button('restart', `重新开始 · ${this.economy?.entryCost ?? 0} 金币`, -80, new Color(88, 57, 116), 'card.restart');
            button('exit', '返回剧情', -225, new Color(88, 57, 116), 'card.exit');
        }
        this.pauseOverlay.active = true;
        this.pauseOverlay.setSiblingIndex(this.node.children.length - 1);
        this.bringInputBlockerToFront();
    }
    private async present(ctx: CommittedContext, scope: TaskScope): Promise<void> {
        if (!this.node.isValid || !this.runtime) return;
        // Persist the committed wallet and completion before its animation can be interrupted.
        if (this.onCheckpoint) {
            await this.onCheckpoint(ctx.state['base-card'] as CardState, ctx.action.type);
            this.lifetime.check(); scope.check(); this.checkpointSaved = true;
        }
        const result = ctx.result;
        const { core, session } = this.model();
        if (result.kind === 'open') {
            this.cleanupTransientVisuals();
            const reducedMotion = this.prefersReducedMotion();
            if (!reducedMotion) this.prepareOpeningVisualState();
            const view = this.refresh(true, !reducedMotion);
            if (view && !reducedMotion) {
                try {
                    await this.animateOpeningDeal(view);
                } catch (error) {
                    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
                    throw new Error(`入场动画失败：${detail}`);
                }
                scope.check();
            }
            return;
        }
        if (result.kind === 'play') {
            this.completionRewardCoins = result.completionRewardCoins ?? 0;
            const source = this.findNode(GameUiNodeId.Board)?.getChildByName(result.slotId) ?? null;
            const progress = this.findNode(GameUiNodeId.RewardProgress)?.getChildByName(GameUiNodeId.ProgressItems);
            if (progress) this.renderProgressItems(progress, result.progressCells, result.progressSuits);
            await this.animateBoardSuccess(source, result.move, core.getState());
            scope.check();
            if (result.rewardCoins) { this.showToast(`连击奖励 +${result.rewardCoins}`); await this.animateCoinReward(); scope.check(); await this.animateProgressReset(session.getViewState().progressCells); }
        } else if (result.kind === 'draw') {
            const hintScope = scope.child();
            try {
                // 提示只伴随本次抽牌；不等待摇摆结束，也不延长输入锁定。
                this.showMissedMoveHint(result.missedSlotIds ?? [], hintScope);
                await this.animateBackupToCurrent(this.getTopBackupNode(core.stockRemainingCount + 1), result.cardName);
                scope.check();
            } finally { hintScope.dispose(); }
        } else if (result.kind === 'wild.prepare') await this.animateWildToCurrent();
        else if (result.kind === 'wild.cancel') await this.animateRollback({ kind: 'wild' }, core.getState(), core.currentCard!.cardName);
        // 付费备用牌已在按钮后方完整展示；领取时只让 afterRender 刷新并隐藏按钮，
        // 不再播放“从按钮新增卡牌”的飞牌动画。
        else if (result.kind === 'addBackup') { this.playCardSound('deal'); /* afterRender 负责隐藏按钮并开放牌堆。 */ }
        else if (result.kind === 'rollback' && result.visual) {
            await Promise.all([this.animateRollback(result.visual, core.getState(), session.wildReady ? 'poker_wild' : core.currentCard!.cardName), this.animateProgressRestore(result.previousProgress, session.getViewState().progressCells)]);
        }
    }
    private lock(value: boolean): void { this.ensureInputBlocker().active = value; if (value) this.bringInputBlockerToFront(); }
    protected onDestroy(): void { this.lifetime.dispose(); void this.runtime?.dispose(); this.onExit = null; this.onComplete = null; this.onCheckpoint = null; this.backgroundFrame?.decRef(); this.backgroundFrame=null; super.onDestroy(); }
}
