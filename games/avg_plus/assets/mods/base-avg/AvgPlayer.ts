import { _decorator, AssetManager, assetManager, JsonAsset, SpriteFrame, UIOpacity, tween } from 'cc';
import { Runtime } from '../../foundation/Runtime';
import { TaskScope } from '../../foundation/Tasks';
import type { CommittedContext, Snapshot } from '../../foundation/Contracts';
import { AvgPresentation } from './AvgPresentation';
import type { AvgPage } from './AvgTypes';
import { parsePage } from './AvgContent';
import { AvgState, createAvgMod } from './AvgMod';
import { loadProfile, extensionsFor, loadChapter } from '../Registry';
const { ccclass } = _decorator;
@ccclass('AvgPlayer')
export class AvgPlayer extends AvgPresentation {
    private runtime: Runtime | null = null;
    private readonly lifetime = new TaskScope();
    private pages: AvgPage[] = [];
    private onExit: (() => void) | null = null;
    private onCheckpoint: ((snapshot: Snapshot, state: Readonly<AvgState>, pageCount: number, choice: boolean) => Promise<void>) | null = null;
    private chapter = { id: 'first-chapter', title: '霸总的假未婚妻', bundle: 'drama_fake_fiancee', path: 'chapters/第一章' };
    public async open(onExit?: () => void, chapterId = 'first-chapter', options?: {
        snapshot: Snapshot | null;
        checkpoint: (snapshot: Snapshot, state: Readonly<AvgState>, pageCount: number, choice: boolean) => Promise<void>;
    }): Promise<void> {
        this.onExit = onExit ?? null; this.createView(); this.setLoading(true, '正在加载剧情…');
        this.onCheckpoint = options?.checkpoint ?? null;
        try {
            const [profile, chapter] = await this.lifetime.run(() => Promise.all([loadProfile(), loadChapter(chapterId)]));
            this.chapter = chapter; this.title = chapter.title;
            const bundle = await this.lifetime.run(() => this.loadBundle());
            this.pages = await this.lifetime.run(() => this.loadPages(bundle)); this.pageCount = this.pages.length;
            await this.lifetime.run(() => this.preloadSprites(bundle, this.pages));
            this.lifetime.check();
            if (!profile.modules.some(item => item.id === 'base-avg' && item.enabled)) throw new Error('当前组合未启用 base-avg');
            const base = createAvgMod(this.pages, ctx => [{ id: 'base-avg.render', timeoutMs: 5000, run: scope => {
                let cleaned = false;
                const cleanup = () => { if (cleaned) return; cleaned = true; this.cancelVisuals(); };
                const release = scope.own(cleanup);
                return this.present(ctx).finally(() => { cleanup(); release(); });
            } }], () => { if (this.node.isValid) this.setInputBlocked(false); });
            const extras = extensionsFor(profile, 'avg', { root: this.node, find: name => this.findNode(name), pages: this.pages,
                context: () => { const state = this.runtime!.read<AvgState>('base-avg'); const page = this.pages[state.pageIndex]; return `${page.chapter}/${page.page}`; },
                afterInsert: () => { const blocker = this.findNode('loadingOverlay'); if (blocker?.active) blocker.setSiblingIndex(this.node.children.length - 1); },
            });
            this.runtime = new Runtime([base, ...extras], { profile, chapter, pages: this.pages }, { diagnostic: entry => console.warn('[Mods]', entry) });
            await this.runtime.open(); this.lifetime.check();
            if (options?.snapshot) this.runtime.restoreSnapshot(options.snapshot);
            this.setLoading(false); await this.send('avg.open');
        } catch (error) { if (this.node.isValid) this.setLoading(true, '剧情加载失败，请查看控制台'); throw error; }
    }
    private async send(type: string, payload?: unknown): Promise<void> {
        if (!this.runtime || this.runtime.isBusy || this.lifetime.cancelled) return;
        this.setInputBlocked(true);
        try {
            const result = await this.runtime.dispatch({ type, ...(payload === undefined ? {} : { payload }) });
            if (this.lifetime.cancelled || !this.node.isValid) return;
            if (result.status === 'failed' || result.status === 'rejected') console.warn('[AvgPlayer]', result.reason);
            if (result.status === 'committed' && this.onCheckpoint) {
                await this.onCheckpoint(this.runtime.exportSnapshot(), this.runtime.read<AvgState>('base-avg'), this.pages.length, type === 'avg.choose');
                this.lifetime.check();
            }
            if (type === 'avg.exit' && result.status === 'committed') { const callback = this.onExit; this.onExit = null; this.scheduleOnce(() => callback?.(), 0); }
        } finally { if (this.node.isValid) this.setInputBlocked(false); }
    }
    protected advance(): Promise<void> { return this.send('avg.next'); }
    protected choose(index: number): Promise<void> { return this.send('avg.choose', { index }); }
    protected restart(): Promise<void> { return this.send('avg.restart'); }
    protected exit(): void { void this.send('avg.exit'); }
    protected showSettings(): void {
        if (this.runtime?.isBusy) return;
        const node = this.findNode('settingsOverlay'); if (node) { node.active = true; node.setSiblingIndex(this.node.children.length - 1); }
    }
    protected hideSettings(): void { const node = this.findNode('settingsOverlay'); if (node) node.active = false; }
    private async present(ctx: CommittedContext): Promise<void> {
        if (!this.node.isValid || ctx.result.kind === 'exit') return;
        const state = ctx.state['base-avg'] as AvgState;
        const page = this.pages[state.pageIndex];
        const end = this.findNode('endOverlay');
        if (end) end.active = state.finished;
        if (state.finished && end) {
            end.setSiblingIndex(this.node.children.length - 1);
            const opacity = end.getComponent(UIOpacity) ?? end.addComponent(UIOpacity); opacity.opacity = 0;
            await this.waitForVisual(done => { this.visualTween(opacity).to(0.28, { opacity: 255 }).call(done).start(); }); return;
        }
        this.renderProgress(page); this.renderBackground(page);
        const roles = this.renderRoles(page); this.renderDialogue(page); this.renderChoices(page);
        const opacity = this.findNode('dialoguePanel')?.getComponent(UIOpacity);
        if (opacity && ctx.result.kind !== 'open') {
            opacity.opacity = 0;
            try { await this.waitForVisual(done => { this.visualTween(opacity).to(0.18, { opacity: 255 }).call(done).start(); }); }
            finally { if (opacity.isValid) opacity.opacity = 255; }
        }
        await roles;
    }
    protected onDestroy(): void {
        this.lifetime.dispose(); void this.runtime?.dispose(); this.onExit = null; this.onCheckpoint = null; super.onDestroy();
        this._sprites.forEach(frame => frame.decRef()); this._sprites.clear();
    }
    private loadBundle(): Promise<AssetManager.Bundle> {
        const cached = assetManager.getBundle(this.chapter.bundle);
        if (cached) return Promise.resolve(cached);

        return new Promise((resolve, reject) => {
            assetManager.loadBundle(this.chapter.bundle, (error, bundle) => {
                if (error || !bundle) {
                    reject(error ?? new Error(`Asset Bundle 不存在：${this.chapter.bundle}`));
                    return;
                }
                resolve(bundle);
            });
        });
    }

    private loadPages(bundle: AssetManager.Bundle): Promise<AvgPage[]> {
        return new Promise((resolve, reject) => {
            bundle.loadDir(this.chapter.path, JsonAsset, (error, assets) => {
                if (error) {
                    reject(error);
                    return;
                }

                try {
                    const pages = assets.map((asset) => parsePage(asset.json));
                    pages.sort((a, b) => Number(a.page) - Number(b.page));
                    if (!pages.length) throw new Error('章节没有页面');
                    const ids = new Set<string>();
                    pages.forEach(page => {
                        const id = `${page.chapter}/${page.page}`;
                        if (ids.has(id)) throw new Error(`重复页面 ${id}`);
                        ids.add(id);
                    });
                    resolve(pages);
                } catch (parseError) {
                    reject(parseError);
                }
            });
        });
    }

    private async preloadSprites(bundle: AssetManager.Bundle, pages: readonly AvgPage[]): Promise<void> {
        const paths = new Set<string>([
            'dialogue/img_plot_word_bg',
            'dialogue/img_plot_arrow',
            'dialogue/img_plot_tag_pink_left',
            'dialogue/img_plot_tag_pink_right',
            'dialogue/bp_choice',
            'ui/img_btn_pink_bg01',
            'ui/img_icon_pink_home',
            'ui/img_icon_pink_settings',
        ]);
        pages.forEach((page) => {
            paths.add(`backgrounds/${page.background}`);
            page.roles.forEach((role) => paths.add(`roles/${role.asset}`));
        });
        await Promise.all(Array.from(paths).map(async (path) => {
            const spriteFrame = await this.loadSprite(bundle, path);
            if (this.node.isValid && !this.lifetime.cancelled) { spriteFrame.addRef(); this._sprites.set(path, spriteFrame); }
        }));
    }

    private loadSprite(bundle: AssetManager.Bundle, path: string): Promise<SpriteFrame> {
        return new Promise((resolve, reject) => {
            bundle.load(`${path}/spriteFrame`, SpriteFrame, (error, spriteFrame) => {
                if (error || !spriteFrame) {
                    reject(error ?? new Error(`SpriteFrame 加载失败：${path}`));
                    return;
                }
                resolve(spriteFrame);
            });
        });
    }

}
