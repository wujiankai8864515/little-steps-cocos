/**
 * Shared nine-slice border helpers.
 *
 * The importer applies the same inset to the persisted SpriteFrame meta and to
 * the runtime frame. Keeping the clamp here prevents first-import/reload drift.
 */

export interface Slice9BorderLike {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

function clampAxis(firstValue: number, secondValue: number, size: number): [number, number] {
    let first = Math.max(0, Math.round(Number(firstValue) || 0));
    let second = Math.max(0, Math.round(Number(secondValue) || 0));
    const dimension = Math.round(Number(size) || 0);
    if (dimension > 0 && first + second >= dimension) {
        const available = Math.max(0, dimension - 1);
        const total = first + second;
        first = total > 0 ? Math.floor(first * available / total) : 0;
        second = Math.max(0, available - first);
    }
    return [first, second];
}

/**
 * Clamp each pair of insets while preserving the requested ratio and leaving
 * at least one pixel for the center patch when the source dimensions are known.
 */
export function clampSlice9Border(
    border: Slice9BorderLike,
    width: number,
    height: number,
): Slice9BorderLike {
    const [left, right] = clampAxis(border.left, border.right, width);
    const [top, bottom] = clampAxis(border.top, border.bottom, height);
    return { left, right, top, bottom };
}
