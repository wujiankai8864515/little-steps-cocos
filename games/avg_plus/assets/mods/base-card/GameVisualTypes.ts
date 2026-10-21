export interface UndoVisual {
    readonly kind: 'board' | 'stock' | 'addBackup' | 'wild';
    readonly slotId?: string;
    readonly cardName?: string;
    readonly usedWild?: boolean;
}

export type CardSound = 'deal' | 'play' | 'draw' | 'undo';

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
    readonly launchTime: number;
}

export interface MissedMoveSwayKeyframe {
    readonly angleOffset: number;
    readonly duration: number;
}

/**
 * 场上牌共用累计时间轴，按牌数压缩错峰间隔；包含翻面在内不超过 1.5 秒。
 */
export const OPENING_DEAL_TIMING = {
    boardDuration: 1.1,
    cardDuration: 0.24,
    maximumLaunchInterval: 0.12,
    currentDrawDelay: 0.2,
    currentDrawDuration: 0.18,
    flipHalfDuration: 0.07,
} as const;

/** 从整段动画的累计时间计算已到期的发牌数，第一张在时间零发出。 */
export function openingBoardLaunchInterval(total: number): number {
    if (total <= 1) return 0;
    return Math.min(OPENING_DEAL_TIMING.maximumLaunchInterval,
        (OPENING_DEAL_TIMING.boardDuration - OPENING_DEAL_TIMING.cardDuration
            - OPENING_DEAL_TIMING.flipHalfDuration * 2) / (total - 1));
}

export function dueOpeningLaunchCount(elapsed: number, total: number): number {
    const count = Math.max(0, Math.floor(total));
    if (!Number.isFinite(elapsed) || elapsed < 0 || count === 0) return 0;
    const interval = openingBoardLaunchInterval(count);
    if (!interval) return count;
    return Math.min(count, Math.floor((elapsed + 1e-9) / interval) + 1);
}

/** 场上牌直接落位，不越过终点，不回弹。 */
export const OPENING_DEAL_POSITION_EASING = 'linear' as const;

/** 每条轨迹依次为视频帧、相对最终位置 X/Y（像素）、顺时针转角。 */
export type OpeningStockSample = readonly [number, number, number, number];
export interface OpeningStockMotion {
    readonly schemaVersion: 1;
    readonly referenceFps: number;
    readonly referenceCardWidth: number;
    readonly referenceCardHeight: number;
    readonly referenceBottomGap: number;
    readonly duration: number;
    readonly tracks: readonly (readonly OpeningStockSample[])[];
}

export function parseOpeningStockMotion(value: any): OpeningStockMotion {
    const positive = (number: unknown): number is number => typeof number === 'number' && Number.isFinite(number) && number > 0;
    if (!value || value.schemaVersion !== 1 ||
        !['referenceFps','referenceCardWidth','referenceCardHeight','referenceBottomGap','duration'].every(key => positive(value[key])) ||
        !Array.isArray(value.tracks) || value.tracks.length < 2 || value.tracks.length > 64) throw new Error('备用牌开场轨迹配置无效');
    const lastFrame = value.duration * value.referenceFps;
    for (const track of value.tracks) {
        if (!Array.isArray(track) || track.length < 2 || track.length > 600) throw new Error('备用牌轨迹采样数量无效');
        let previous = -1;
        for (const sample of track) {
            if (!Array.isArray(sample) || sample.length !== 4 || !sample.every((number: unknown) => typeof number === 'number' && Number.isFinite(number)) ||
                sample[0] <= previous || sample[0] > lastFrame || sample[2] < 0 || sample[3] < 0 || sample[3] > 90) throw new Error('备用牌轨迹采样无效');
            previous = sample[0];
        }
        const first = track[0], last = track[track.length - 1];
        if (first[0] !== 0 || first[3] !== 90 || last[0] !== lastFrame || last.slice(1).some((number: number) => number !== 0)) throw new Error('备用牌轨迹起止状态无效');
    }
    return value as OpeningStockMotion;
}

export function sampleOpeningStockMotion(motion: OpeningStockMotion, elapsed: number, index: number, count: number): {
    readonly x: number; readonly y: number; readonly angle: number;
} {
    const frame = Math.max(0, Math.min(motion.duration, elapsed)) * motion.referenceFps;
    const sample = (track: readonly OpeningStockSample[]) => {
        const next = track.findIndex(point => point[0] >= frame);
        if (next <= 0) return track[next < 0 ? track.length - 1 : 0].slice(1);
        const left = track[next - 1], right = track[next];
        const progress = (frame - left[0]) / (right[0] - left[0]);
        return [1, 2, 3].map(axis => left[axis] + (right[axis] - left[axis]) * progress);
    };
    const at = count <= 1 ? 0 : Math.max(0, Math.min(1, index / (count - 1))) * (motion.tracks.length - 1);
    const left = Math.floor(at), right = Math.ceil(at), progress = at - left;
    const a = sample(motion.tracks[left]), b = sample(motion.tracks[right]);
    return { x: a[0] + (b[0] - a[0]) * progress, y: a[1] + (b[1] - a[1]) * progress, angle: a[2] + (b[2] - a[2]) * progress };
}

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
    anchor: 'left' | 'right' = 'left',
): readonly number[] {
    const count = Math.max(0, Math.floor(visibleCount));
    if (count === 0 || originalOffsets.length === 0) return [];
    const spacing = originalOffsets.length > 1
        ? originalOffsets[1] - originalOffsets[0]
        : 27;
    const capacity = Math.max(count, originalOffsets.length);
    const start = anchor === 'right' ? capacity - count : 0;
    return Array.from({ length: count }, (_, index) => originalOffsets[start + index]
        ?? originalOffsets[0] + spacing * (start + index));
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
                launchTime: 0,
            }));
        });
    }
    const interval = openingBoardLaunchInterval(result.length);
    return result.map((step, index) => ({ ...step, launchTime: index * interval }));
}
