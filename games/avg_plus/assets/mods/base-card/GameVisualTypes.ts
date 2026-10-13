export interface UndoVisual {
    readonly kind: 'board' | 'stock' | 'addBackup';
    readonly slotId?: string;
    readonly cardName?: string;
}

export interface OpeningDealSlot {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly covers: readonly string[];
}

export interface OpeningDealStep {
    readonly slotId: string;
    readonly layer: number;
    readonly row: number;
    readonly launchFrame: number;
}

export interface OpeningStockStep {
    readonly index: number;
    readonly launchFrame: number;
}

export interface MissedMoveSwayKeyframe {
    readonly angleOffset: number;
    readonly duration: number;
}

/**
 * 参考视频按约 60fps 逐帧发射：每个渲染帧只启动一张牌，单张飞行互相
 * 重叠，但绝不在同一个 tick 批量起飞。全部落位后再统一翻面。
 */
export const OPENING_DEAL_TIMING = {
    cardDuration: 0.32,
    backupCardDuration: 0.32,
    launchFrameGap: 4,
    referenceFps: 60,
    currentDrawDuration: 0.36,
    flipHalfDuration: 0.07,
} as const;

/** 仅位移使用越过落点再回弹的曲线，其余属性保持线性。 */
export const OPENING_DEAL_POSITION_EASING = 'backOut' as const;

/**
 * Figma 牌阵坐标中的同一视觉行允许有轻微高低错位（例如扇形牌阵）。
 * 110px 能把同排的倾斜牌归在一起，同时不会把上下两排误合并。
 */
export const OPENING_DEAL_ROW_TOLERANCE = 110;

export const MISSED_MOVE_HINT_DURATION = 1;
export const MISSED_MOVE_HINT_SWAY_COUNT = 4;

const ROTATION_BEZIER = {
    x1: 0,
    y1: 0.0865303805,
    x2: 0.334931675,
    y2: 0.906073701,
} as const;

/** 求三次贝塞尔在指定时间轴进度上的输出值。 */
function cubicBezierProgress(progress: number): number {
    const t = Math.max(0, Math.min(1, progress));
    if (t === 0 || t === 1) return t;
    let low = 0;
    let high = 1;
    // 时间轴 x 单调，二分反解参数比 Newton 法在 x1=0 时更稳定。
    for (let index = 0; index < 14; index++) {
        const parameter = (low + high) * 0.5;
        const inverse = 1 - parameter;
        const x = 3 * inverse * inverse * parameter * ROTATION_BEZIER.x1
            + 3 * inverse * parameter * parameter * ROTATION_BEZIER.x2
            + parameter * parameter * parameter;
        if (x < t) low = parameter;
        else high = parameter;
    }
    const parameter = (low + high) * 0.5;
    const inverse = 1 - parameter;
    return 3 * inverse * inverse * parameter * ROTATION_BEZIER.y1
        + 3 * inverse * parameter * parameter * ROTATION_BEZIER.y2
        + parameter * parameter * parameter;
}

/** 使用参考录屏拟合曲线，在下坠末段自然回正并吸收源牌原有倾角。 */
export function boardFlightAngle(
    startAngle: number,
    fullTurnAngle: number,
    progress: number,
): number {
    const eased = cubicBezierProgress(progress);
    return startAngle + (fullTurnAngle - startAngle) * eased;
}

/**
 * 备用牌以第一个 Prefab 槽位为固定左边界，不足的槽位按原间距向右动态扩展。
 *
 * 抽走顶牌时只减少末尾槽位，不按剩余张数重新居中；因此牌堆左端始终不动。
 */
export function stableVisibleBackupCardOffsets(
    originalOffsets: readonly number[],
    visibleCount: number,
): readonly number[] {
    const count = Math.max(0, Math.floor(visibleCount));
    if (count === 0 || originalOffsets.length === 0) return [];
    const spacing = originalOffsets.length > 1
        ? originalOffsets[1] - originalOffsets[0]
        : 27;
    return Array.from({ length: count }, (_, index) => originalOffsets[index]
        ?? originalOffsets[0] + spacing * index);
}

/** 从中位开始，完成四次完整左右摆动，并在 1 秒时准确回到原角度。 */
export function buildMissedMoveSwayKeyframes(amplitude = 8): readonly MissedMoveSwayKeyframe[] {
    const edgeDuration = MISSED_MOVE_HINT_DURATION / (MISSED_MOVE_HINT_SWAY_COUNT * 4);
    const frames: MissedMoveSwayKeyframe[] = [];
    for (let index = 0; index < MISSED_MOVE_HINT_SWAY_COUNT * 2; index++) {
        frames.push({
            angleOffset: index % 2 === 0 ? -amplitude : amplitude,
            duration: index === 0 ? edgeDuration : edgeDuration * 2,
        });
    }
    frames.push({ angleOffset: 0, duration: edgeDuration });
    return frames;
}

/**
 * 先按 covers 计算最终遮挡层级，保证底层先发、高层后发；每个层级内部再
 * 按画面位置模拟荷官扫桌：最上方一排从左到右发完，再进入下一排。
 */
export function buildOpeningDealSchedule(slots: readonly OpeningDealSlot[]): readonly OpeningDealStep[] {
    const byId = new Map(slots.map((slot) => [slot.id, slot]));
    const layers = new Map<string, number>();
    const visiting = new Set<string>();
    const layerOf = (slot: OpeningDealSlot): number => {
        const cached = layers.get(slot.id);
        if (cached !== undefined) return cached;
        if (visiting.has(slot.id)) throw new Error(`牌阵遮挡关系存在循环：${slot.id}`);
        visiting.add(slot.id);
        const coveredLayers = slot.covers
            .map((id) => byId.get(id))
            .filter((candidate): candidate is OpeningDealSlot => Boolean(candidate))
            .map(layerOf);
        visiting.delete(slot.id);
        const layer = coveredLayers.length === 0 ? 0 : Math.max(...coveredLayers) + 1;
        layers.set(slot.id, layer);
        return layer;
    };

    const slotsByLayer = new Map<number, OpeningDealSlot[]>();
    for (const slot of slots) {
        const layer = layerOf(slot);
        const layerSlots = slotsByLayer.get(layer) ?? [];
        layerSlots.push(slot);
        slotsByLayer.set(layer, layerSlots);
    }

    const result: OpeningDealStep[] = [];
    const orderedLayers = Array.from(slotsByLayer.keys()).sort((left, right) => left - right);
    for (const layer of orderedLayers) {
        const topToBottom = slotsByLayer.get(layer)!.sort((left, right) =>
            right.y - left.y || left.x - right.x || left.id.localeCompare(right.id));
        const rows: OpeningDealSlot[][] = [];
        let rowAnchorY = Number.POSITIVE_INFINITY;
        for (const slot of topToBottom) {
            if (rows.length === 0 || rowAnchorY - slot.y > OPENING_DEAL_ROW_TOLERANCE) {
                rows.push([]);
                rowAnchorY = slot.y;
            }
            rows[rows.length - 1].push(slot);
        }

        rows.forEach((rowSlots, row) => {
            rowSlots.sort((left, right) => left.x - right.x || left.id.localeCompare(right.id));
            rowSlots.forEach((slot) => result.push({
                slotId: slot.id,
                layer,
                row,
                launchFrame: result.length * OPENING_DEAL_TIMING.launchFrameGap,
            }));
        });
    }
    return result;
}

/** 备用牌从左到右逐张落位，后来的牌自然盖住前一张形成牌叠。 */
export function buildOpeningStockSchedule(visibleCount: number): readonly OpeningStockStep[] {
    const count = Math.max(0, Math.floor(visibleCount));
    return Array.from({ length: count }, (_, index) => ({
        index,
        launchFrame: index * OPENING_DEAL_TIMING.launchFrameGap,
    }));
}
