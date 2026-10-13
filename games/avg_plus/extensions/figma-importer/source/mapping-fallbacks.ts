export interface Rgba255 {
    r: number;
    g: number;
    b: number;
    a: number;
}

/** Convert two Figma 0..1 endpoint colors into the current single-color gradient fallback. */
export function averageFigmaColor(a: any, b: any): Rgba255 {
    const channel = (left: any, right: any, fallback: number): number => {
        const leftValue = typeof left === 'number' ? left : fallback;
        const rightValue = typeof right === 'number' ? right : fallback;
        return Math.round(Math.max(0, Math.min(1, (leftValue + rightValue) * 0.5)) * 255);
    };
    return {
        r: channel(a && a.r, b && b.r, 1),
        g: channel(a && a.g, b && b.g, 1),
        b: channel(a && a.b, b && b.b, 1),
        a: channel(a && a.a, b && b.a, 1),
    };
}
