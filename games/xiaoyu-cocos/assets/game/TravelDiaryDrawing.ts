import { core } from './Engine';

export const DIARY_INK = [119 / 255, 83 / 255, 53 / 255, 1];
export const DIARY_PALE_INK = [173 / 255, 128 / 255, 81 / 255, 1];
export const DIARY_ROUTE = [[345, 327], [370, 313], [394, 324], [422, 316], [456, 326], [478, 314]];

export function diaryPencil(at: number[], length: number) {
    return core.featherPolyline(Array.from({length: 24}, (_, i) => {
        const x = length * i / 23;
        return [at[0] + x, at[1] + 1.3 * Math.sin(i * 1.83) - .018 * x];
    }), 1.7);
}

// Godot 4.5.2 CanvasItem::draw_dashed_line, aligned=true. The sixth
// argument in the original is alignment, NOT antialiasing. These are solid quads.
// Algorithm source and MIT notice are recorded in M07-diary-shader-source.json.
export function diaryDashes(from: number[], to: number[], dash = 4) {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (!Number.isFinite(length) || !Number.isFinite(dash) || dash <= 0) throw new Error('Invalid diary dash');
    if (!length) return [];
    if (length < dash) return [[from.slice(), to.slice()]];
    const unit = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
    let steps = Math.ceil(length / dash); if (steps % 2 === 0) steps--;
    const padding = (length - steps * dash) / 2, segments: number[][][] = [];
    for (let i = 0; i < steps; i += 2) {
        const point = (distance: number) => [from[0] + unit[0] * distance, from[1] + unit[1] * distance];
        segments.push([i === 0 ? from.slice() : point(padding + i * dash), i === steps - 1 ? to.slice() : point(padding + (i + 1) * dash)]);
    }
    return segments;
}
function solidMesh(points: number[][], triangles: number[]) {
    return {vertices: new Float32Array(([] as number[]).concat(...points)), source: new Float32Array(points.length * 2), vertexData: new Float32Array(([] as number[]).concat(...points.map(() => [1, 0, 0]))), indices: new Uint16Array(triangles)};
}
export function diaryRouteDrawing() {
    const parts: any[] = [];
    for (let i = 0; i < DIARY_ROUTE.length - 1; i++) {
        for (const [a, b] of diaryDashes(DIARY_ROUTE[i], DIARY_ROUTE[i + 1])) {
            const length = Math.hypot(b[0] - a[0], b[1] - a[1]), x = -(b[1] - a[1]) / length * .75, y = (b[0] - a[0]) / length * .75;
            parts.push(solidMesh([[a[0] + x, a[1] + y], [a[0] - x, a[1] - y], [b[0] - x, b[1] - y], [b[0] + x, b[1] + y]], [0, 1, 2, 0, 2, 3]));
        }
    }
    return core.mergeDrawingMeshes(parts);
}
export function diaryStartDot() {
    const points = Array.from({length: 64}, (_, i) => [345 + Math.cos(i * Math.PI * 2 / 64) * 3, 327 + Math.sin(i * Math.PI * 2 / 64) * 3]);
    const triangles: number[] = []; for (let i = 1; i < 63; i++) triangles.push(0, i, i + 1);
    return solidMesh(points, triangles);
}
export function diaryEndRing() {
    // draw_arc(point_count=20) has 19 segments, including both endpoints.
    return core.featherPolyline(Array.from({length: 20}, (_, i) => [478 + Math.cos(i * Math.PI * 2 / 19) * 4, 314 + Math.sin(i * Math.PI * 2 / 19) * 4]), 1.5);
}
