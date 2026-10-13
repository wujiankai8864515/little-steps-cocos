import { Animation, Asset, AssetManager, assetManager, instantiate, JsonAsset, Node, Prefab, resources, Sprite, SpriteFrame, tween, UITransform, UIOpacity, Vec3 } from 'cc';
import { EffectConfig, EffectDefinition, EffectDomain, EMPTY_EFFECT_CONFIG, effectsFor, parseEffectConfig } from './EffectConfig';

/** Owns only temporary visuals. No access to rules, wallet, history or progression. */
export class EffectPlayer {
    private config: EffectConfig = EMPTY_EFFECT_CONFIG;
    private generation = 0;
    private disposed = false;
    private readonly pending = new Set<() => void>();
    private readonly assets = new Set<Asset>();
    private readonly spawned = new Set<Node>();
    constructor(private readonly root: Node, private readonly resolveTarget: (name: string) => Node | null, private readonly afterInsert?: () => void) {}

    public async load(domain: EffectDomain): Promise<void> {
        try {
            const asset = await this.bounded(new Promise<JsonAsset>((resolve, reject) => {
                resources.load(`effects/${domain}`, JsonAsset, (error, result) => error || !result ? reject(error ?? new Error('配置为空')) : resolve(result));
            }));
            if (!this.disposed) this.config = parseEffectConfig(asset.json, domain);
        } catch (error) {
            this.config = EMPTY_EFFECT_CONFIG;
            if (!this.disposed) console.warn(`[EffectPlayer] ${domain} 特效配置不可用，保留基础表现。`, error);
        }
    }

    public async play(event: string, context = '', overrides: Readonly<Record<string, Node | null>> = {}): Promise<void> {
        const generation = this.generation;
        // Ordered execution avoids two entries racing over one node's transform/opacity.
        for (const fx of effectsFor(this.config, event, context)) {
            if (!this.alive(generation)) return;
            const target = overrides[fx.target] ?? (fx.target === 'root' ? this.root : this.resolveTarget(fx.target));
            if (!target?.isValid || !target.activeInHierarchy) {
                console.warn(`[EffectPlayer] ${fx.id} 找不到可见挂点 ${fx.target}`);
                continue;
            }
            try { await this.run(fx, target, generation); }
            catch (error) { if (this.alive(generation)) console.warn(`[EffectPlayer] 跳过 ${fx.id}`, error); }
        }
    }

    public clear(): void {
        this.generation++;
        for (const cancel of Array.from(this.pending)) cancel();
        for (const node of this.spawned) if (node.isValid) node.destroy();
        this.spawned.clear();
    }
    public dispose(): void {
        this.disposed = true;
        this.clear();
        for (const asset of this.assets) asset.decRef();
        this.assets.clear();
    }
    private alive(generation: number): boolean { return !this.disposed && this.root.isValid && generation === this.generation; }

    private bounded<T>(task: Promise<T>, timeout = 5000): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            let settled = false;
            const finish = (error?: Error, result?: T) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.pending.delete(cancel);
                error ? reject(error) : resolve(result!);
            };
            const cancel = () => finish(new Error('特效已取消'));
            const timer = setTimeout(() => finish(new Error('特效资源加载超时')), timeout);
            this.pending.add(cancel);
            task.then(value => finish(undefined, value), error => finish(error instanceof Error ? error : new Error(String(error))));
        });
    }

    private animate(target: Node, seconds: number, start: (done: () => void) => (() => void), restore: () => void = () => {}): Promise<void> {
        return new Promise<void>((resolve) => {
            let finished = false;
            let stop = () => {};
            const finish = () => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                clearInterval(watch);
                this.pending.delete(finish);
                stop();
                if (target.isValid) restore();
                resolve();
            };
            const timer = setTimeout(finish, seconds * 1000 + 250);
            const watch = setInterval(() => { if (!target.isValid || !this.root.isValid) finish(); }, 100);
            this.pending.add(finish);
            try { stop = start(finish); } catch (error) { finish(); throw error; }
        });
    }

    private async loadAsset(fx: EffectDefinition): Promise<Prefab | SpriteFrame> {
        let bundle: AssetManager.Bundle = resources;
        if (fx.bundle && fx.bundle !== 'resources') {
            bundle = assetManager.getBundle(fx.bundle) ?? await this.bounded(new Promise<AssetManager.Bundle>((resolve, reject) => {
                assetManager.loadBundle(fx.bundle!, (error, result) => error || !result ? reject(error ?? new Error('Bundle 为空')) : resolve(result));
            }));
        }
        const asset = await this.bounded(new Promise<Prefab | SpriteFrame>((resolve, reject) => {
            const callback = (error: Error | null, result: Prefab | SpriteFrame) => error || !result ? reject(error ?? new Error('特效资源为空')) : resolve(result);
            if (fx.kind === 'prefab') bundle.load(fx.asset!, Prefab, callback);
            else bundle.load(fx.asset!, SpriteFrame, callback);
        }));
        if (!this.disposed && !this.assets.has(asset)) { asset.addRef(); this.assets.add(asset); }
        return asset;
    }

    private async run(fx: EffectDefinition, target: Node, generation: number): Promise<void> {
        const duration = fx.duration ?? 0.3;
        const delay = fx.delay ?? 0;
        if (fx.kind === 'prefab' || fx.kind === 'sprite') {
            const asset = await this.loadAsset(fx);
            if (!this.alive(generation) || !target.isValid) return;
            const node = fx.kind === 'prefab' ? instantiate(asset as Prefab) : new Node(`effect_${fx.id}`);
            if (fx.kind === 'sprite') {
                const frame = asset as SpriteFrame;
                node.addComponent(UITransform).setContentSize(frame.originalSize.width, frame.originalSize.height);
                node.addComponent(Sprite).spriteFrame = frame;
            }
            const assignLayer = (item: Node) => { item.layer = target.layer; item.children.forEach(assignLayer); };
            assignLayer(node);
            node.active = false;
            node.setPosition(fx.x ?? 0, fx.y ?? 0, 0);
            const scale = fx.scale ?? 1;
            node.setScale(scale, scale, scale);
            target.addChild(node);
            this.spawned.add(node);
            this.afterInsert?.();
            try {
                await this.animate(node, delay + duration, done => {
                    const sequence = tween(node).delay(delay).call(() => {
                        node.active = true;
                        const animation = node.getComponent(Animation);
                        if (animation && (fx.clip || animation.defaultClip)) animation.play(fx.clip);
                    }).delay(duration).call(done).start();
                    return () => sequence.stop();
                });
            } finally { this.spawned.delete(node); if (node.isValid) node.destroy(); }
            return;
        }
        const position = target.position.clone();
        const scale = target.scale.clone();
        const opacity = target.getComponent(UIOpacity) ?? target.addComponent(UIOpacity);
        const originalOpacity = opacity.opacity;
        await this.animate(target, delay + duration, done => {
            if (fx.kind === 'fadeIn') {
                const sequence = tween(opacity).delay(delay).call(() => { opacity.opacity = 0; })
                    .to(duration, { opacity: originalOpacity }, { easing: 'quadOut' }).call(done).start();
                return () => sequence.stop();
            }
            let sequence = tween(target).delay(delay);
            if (fx.kind === 'pulse') {
                const amount = fx.scale ?? 1.08;
                sequence = sequence.to(duration * 0.4, { scale: new Vec3(scale.x * amount, scale.y * amount, scale.z) }, { easing: 'quadOut' })
                    .to(duration * 0.6, { scale }, { easing: 'sineOut' });
            } else if (fx.kind === 'moveIn') {
                sequence = sequence.call(() => target.setPosition(position.x + (fx.x ?? 60), position.y + (fx.y ?? 0), position.z))
                    .to(duration, { position }, { easing: 'quadOut' });
            } else {
                const amount = fx.amount ?? 12;
                sequence = sequence.to(duration / 4, { position: new Vec3(position.x - amount, position.y, position.z) })
                    .to(duration / 4, { position: new Vec3(position.x + amount, position.y, position.z) })
                    .to(duration / 4, { position: new Vec3(position.x - amount / 2, position.y, position.z) })
                    .to(duration / 4, { position });
            }
            sequence.call(done).start();
            return () => sequence.stop();
        }, () => { target.setPosition(position); target.setScale(scale); if (opacity.isValid) opacity.opacity = originalOpacity; });
    }
}
