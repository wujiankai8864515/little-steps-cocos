// Engine-neutral, Godot-compatible affine coordinates: x right, y down, radians.
const Math2D = (() => {
    const identity = () => [1, 0, 0, 1, 0, 0];
    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    const smoothstep = (a, b, x) => {
        const t = clamp((x - a) / (b - a), 0, 1);
        return t * t * (3 - 2 * t);
    };
    const transform = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    const basis = (m, x, y) => [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
    const multiply = (a, b) => [
        a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
    ];
    const inverse = (m) => {
        const d = m[0] * m[3] - m[1] * m[2];
        if (!Number.isFinite(d) || Math.abs(d) < 1e-12) throw new Error('Singular 2D transform');
        const a = m[3] / d, b = -m[1] / d, c = -m[2] / d, e = m[0] / d;
        return [a, b, c, e, -a * m[4] - c * m[5], -b * m[4] - e * m[5]];
    };
    const trs = (position = [0, 0], rotation = 0, scale = [1, 1]) => {
        const c = Math.cos(rotation), s = Math.sin(rotation);
        return [c * scale[0], s * scale[0], -s * scale[1], c * scale[1], position[0], position[1]];
    };
    return Object.freeze({identity, clamp, smoothstep, transform, basis, multiply, inverse, trs});
})();

class BoneRig {
    constructor(bones) {
        this.bones = bones.map((bone, i) => {
            if (bone.parent >= i || bone.parent < -1) throw new Error('Bones must be parent-first');
            return Object.assign({}, bone, {
                position: [...(bone.position || [0, 0])], rotation: bone.rotation || 0, scale: [...(bone.scale || [1, 1])],
                restPosition: [...(bone.position || [0, 0])], restRotation: bone.rotation || 0, restScale: [...(bone.scale || [1, 1])],
            });
        });
        this.byName = new Map(this.bones.map((b, i) => [b.name, i]));
        this.world = [];
        this.update();
        this.rest = this.world.map(m => [...m]);
        this.inverseRest = this.rest.map(Math2D.inverse);
    }
    reset() {
        for (const b of this.bones) {
            b.position = [...(b.restPosition || [0, 0])];
            b.scale = [...(b.restScale || [1, 1])];
            b.rotation = b.restRotation || 0;
        }
        this.update();
    }
    update() {
        for (let i = 0; i < this.bones.length; ++i) {
            const b = this.bones[i];
            const local = Math2D.trs(b.position, b.rotation, b.scale);
            this.world[i] = b.parent < 0 ? local : Math2D.multiply(this.world[b.parent], local);
        }
        return this.world;
    }
    skinMatrices() { return this.world.map((m, i) => Math2D.multiply(m, this.inverseRest[i])); }
}

function sampleTrack(track, time) {
    const n = track.times.length;
    if (!n || n !== track.values.length) throw new Error('Invalid animation track');
    if (time <= track.times[0]) return track.values[0];
    if (time >= track.times[n - 1]) return track.values[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (track.times[mid] <= time) lo = mid; else hi = mid; }
    const a = track.values[lo], b = track.values[hi];
    if (track.update === 1 || typeof a === 'boolean' || track.interpolation === 0) return a;
    const f = (time - track.times[lo]) / (track.times[hi] - track.times[lo]);
    return Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * f) : a + (b - a) * f;
}

function createGrid(rect, cell) {
    if (!(cell > 0) || rect[2] <= 0 || rect[3] <= 0) throw new Error('Invalid grid bounds');
    const columns = Math.max(2, Math.ceil(rect[2] / cell));
    const rows = Math.max(2, Math.ceil(rect[3] / cell));
    const count = (columns + 1) * (rows + 1);
    if (count > 65535) throw new Error('Grid exceeds 16-bit UI renderer capacity');
    const source = new Float32Array(count * 2), indices = new Uint16Array(columns * rows * 6);
    let p = 0, t = 0;
    for (let y = 0; y <= rows; ++y) for (let x = 0; x <= columns; ++x) {
        source[p++] = rect[0] + rect[2] * x / columns;
        source[p++] = rect[1] + rect[3] * y / rows;
    }
    for (let y = 0; y < rows; ++y) for (let x = 0; x < columns; ++x) {
        const i = y * (columns + 1) + x;
        indices[t++] = i; indices[t++] = i + 1; indices[t++] = i + columns + 2;
        indices[t++] = i; indices[t++] = i + columns + 2; indices[t++] = i + columns + 1;
    }
    return {rect: [...rect], columns, rows, source, vertices: new Float32Array(source), indices};
}

function weightedSkin(source, weights, matrices, output = new Float32Array(source.length)) {
    if (weights.length !== source.length / 2 * matrices.length) throw new Error('Skin weight count mismatch');
    for (let i = 0; i < source.length / 2; ++i) {
        let x = 0, y = 0, sum = 0;
        for (let b = 0; b < matrices.length; ++b) {
            const w = weights[i * matrices.length + b];
            if (!Number.isFinite(w) || w < 0) throw new Error('Invalid skin weight');
            if (!w) continue;
            const m = matrices[b];
            x += (m[0] * source[i * 2] + m[2] * source[i * 2 + 1] + m[4]) * w;
            y += (m[1] * source[i * 2] + m[3] * source[i * 2 + 1] + m[5]) * w;
            sum += w;
        }
        if (Math.abs(sum - 1) > 1e-4) throw new Error('Skin weights must sum to one');
        output[i * 2] = x; output[i * 2 + 1] = y;
    }
    return output;
}

function sourcePixelAt(mesh, point) {
    const vertices = mesh.vertices, source = mesh.source, triangles = mesh.indices;
    for (let i = 0; i < triangles.length; i += 3) {
        const a = triangles[i] * 2, b = triangles[i + 1] * 2, c = triangles[i + 2] * 2;
        const abx = vertices[b] - vertices[a], aby = vertices[b + 1] - vertices[a + 1];
        const acx = vertices[c] - vertices[a], acy = vertices[c + 1] - vertices[a + 1];
        const d = abx * acy - aby * acx;
        if (Math.abs(d) < 1e-6) continue;
        const px = point[0] - vertices[a], py = point[1] - vertices[a + 1];
        const u = (px * acy - py * acx) / d, v = (abx * py - aby * px) / d;
        if (u >= -1e-5 && v >= -1e-5 && u + v <= 1.00001) return [
            source[a] * (1 - u - v) + source[b] * u + source[c] * v,
            source[a + 1] * (1 - u - v) + source[b + 1] * u + source[c + 1] * v,
        ];
    }
    return null;
}

// Forward sampling of the same two-triangle grid, used by anchors and casts.
function renderedPointAt(mesh, point) {
    const fx=(point[0]-mesh.rect[0])/mesh.rect[2]*mesh.columns,fy=(point[1]-mesh.rect[1])/mesh.rect[3]*mesh.rows;
    const x=Math2D.clamp(Math.floor(fx),0,mesh.columns-1),y=Math2D.clamp(Math.floor(fy),0,mesh.rows-1),u=fx-x,v=fy-y,i=y*(mesh.columns+1)+x;
    const indices=v<=u?[i,i+1,i+mesh.columns+2]:[i,i+mesh.columns+2,i+mesh.columns+1],weights=v<=u?[1-u,u-v,v]:[1-v,u,v-u];
    return [0,1].map(axis=>indices.reduce((sum,index,j)=>sum+mesh.vertices[index*2+axis]*weights[j],0));
}

Object.assign(api, {Math2D, BoneRig, sampleTrack, createGrid, weightedSkin, sourcePixelAt, renderedPointAt});
