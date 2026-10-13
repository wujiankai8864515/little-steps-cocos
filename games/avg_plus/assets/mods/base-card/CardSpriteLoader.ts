import { JsonAsset, Rect, resources, Size, SpriteFrame, Vec2 } from 'cc';
import { TaskScope } from '../../foundation/Tasks';

interface CardCatalogAsset {
    readonly resourcePath: string;
    readonly region?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

interface CardCatalog {
    readonly assets: Readonly<Record<string, CardCatalogAsset>>;
}

const CARD_CATALOG_PATH = 'assets/poker/card-catalog';

export class CardSpriteLoader {
    private static _catalogTask: Promise<CardCatalog> | null = null;
    private static readonly _spriteTasks = new Map<string, Promise<SpriteFrame>>();

    public static async loadSpriteFrame(cardName: string): Promise<SpriteFrame> {
        const catalog = await this.loadCatalog();
        const asset = catalog.assets[cardName];

        if (!asset) {
            throw new Error(`[CardSpriteLoader] card-catalog 中不存在卡牌资源：${cardName}`);
        }

        const cachedTask = this._spriteTasks.get(cardName);

        if (cachedTask) {
            const cached = await cachedTask;
            if (cached.isValid) return cached;
            this._spriteTasks.delete(cardName);
        }

        const scope = new TaskScope();
        const task = scope.run(() => new Promise<SpriteFrame>((resolve, reject) => {
            resources.load(asset.resourcePath, SpriteFrame, (error, spriteFrame) => {
                if (error || !spriteFrame) {
                    reject(error ?? new Error(`[CardSpriteLoader] SpriteFrame 加载失败：${asset.resourcePath}`));
                    return;
                }

                try {
                    if (!asset.region) { resolve(spriteFrame); return; }
                    const region = asset.region;
                    if (region.x + region.width > spriteFrame.texture.width || region.y + region.height > spriteFrame.texture.height) {
                        throw new Error(`[CardSpriteLoader] 牌面裁切超出原图：${cardName}`);
                    }
                    // The original video frame stays intact. Each card owns a separate UV region.
                    const cropped = spriteFrame.clone();
                    cropped.packable = false;
                    cropped.rect = new Rect(region.x, region.y, region.width, region.height);
                    cropped.originalSize = new Size(region.width, region.height);
                    cropped.offset = new Vec2(0, 0);
                    spriteFrame.addRef(); // Source texture lives as long as the catalog cache.
                    cropped.addRef();
                    resolve(cropped);
                } catch (error) { reject(error); }
            });
        }), 5000).finally(() => scope.dispose());

        this._spriteTasks.set(cardName, task);
        try {
            return await task;
        } catch (error) {
            // 不缓存失败 Promise；资源热更新或瞬时加载失败后允许下一次重试。
            if (this._spriteTasks.get(cardName) === task) this._spriteTasks.delete(cardName);
            throw error;
        }
    }

    private static loadCatalog(): Promise<CardCatalog> {
        if (!this._catalogTask) {
            const scope = new TaskScope();
            const task = scope.run(() => new Promise<CardCatalog>((resolve, reject) => {
                resources.load(CARD_CATALOG_PATH, JsonAsset, (error, jsonAsset) => {
                    if (error || !jsonAsset) {
                        reject(error ?? new Error(`[CardSpriteLoader] card-catalog 加载失败：${CARD_CATALOG_PATH}`));
                        return;
                    }

                    try { resolve(this.parseCatalog(jsonAsset.json)); } catch (parseError) { reject(parseError); }
                });
            }), 5000).finally(() => scope.dispose());
            const recoverableTask = task.catch((error) => {
                // 与牌面缓存相同，目录加载失败不能永久毒化后续请求。
                if (this._catalogTask === recoverableTask) this._catalogTask = null;
                throw error;
            });
            this._catalogTask = recoverableTask;
        }

        return this._catalogTask;
    }

    private static parseCatalog(value: unknown): CardCatalog {
        if (!this.isRecord(value) || !this.isRecord(value.assets)) {
            throw new Error('[CardSpriteLoader] card-catalog 格式非法：缺少 assets。');
        }

        const assets: Record<string, CardCatalogAsset> = {};

        for (const name in value.assets) {
            if (!Object.prototype.hasOwnProperty.call(value.assets, name)) {
                continue;
            }

            const rawAsset = value.assets[name];

            if (!this.isRecord(rawAsset) || typeof rawAsset.resourcePath !== 'string' || rawAsset.resourcePath.length === 0) {
                throw new Error(`[CardSpriteLoader] card-catalog 资源项非法：${name}`);
            }

            let region: CardCatalogAsset['region'];
            if (rawAsset.region !== undefined) {
                const r = rawAsset.region;
                if (!this.isRecord(r) || ![r.x,r.y,r.width,r.height].every(Number.isSafeInteger) ||
                    (r.x as number) < 0 || (r.y as number) < 0 || (r.width as number) < 1 || (r.height as number) < 1) {
                    throw new Error(`[CardSpriteLoader] 牌面裁切配置非法：${name}`);
                }
                region = { x:r.x as number,y:r.y as number,width:r.width as number,height:r.height as number };
            }
            assets[name] = { resourcePath: rawAsset.resourcePath, ...(region ? {region} : {}) };
        }

        return { assets };
    }

    private static isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
}
