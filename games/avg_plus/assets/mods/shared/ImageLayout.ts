/** Uniform image sizing; transparent source margins remain part of the original canvas. */
export function imageSize(sourceWidth: number, sourceHeight: number, width: number, height: number,
    mode: 'contain' | 'cover' = 'contain'): { width: number; height: number } {
    if (![sourceWidth, sourceHeight, width, height].every(n => Number.isFinite(n) && n > 0)) {
        throw new Error('图片尺寸无效');
    }
    const scale = mode === 'cover' ? Math.max(width / sourceWidth, height / sourceHeight)
        : Math.min(width / sourceWidth, height / sourceHeight);
    return { width: sourceWidth * scale, height: sourceHeight * scale };
}
