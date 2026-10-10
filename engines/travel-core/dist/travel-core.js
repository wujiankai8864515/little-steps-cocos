/* Creator 3.8.8 plugin; generated from engines/travel-core/src. */
(function(root) {
'use strict';
const api = Object.create(null);
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

Object.assign(api, {Math2D, BoneRig, sampleTrack, createGrid, weightedSkin, sourcePixelAt});

// Every page/request owns a scope. Late continuations cannot revive disposed pages.
class Lifetime {
    constructor(parent) {
        this.active = true;
        this.disposers = [];
        if (parent) parent.own(() => this.dispose());
    }
    own(dispose) {
        if (!this.active) dispose();
        else this.disposers.push(dispose);
        return dispose;
    }
    async guard(promise, lateDispose) {
        const value = await promise;
        if (!this.active) {
            if (lateDispose) lateDispose(value);
            throw new CancelledError();
        }
        return value;
    }
    dispose() {
        if (!this.active) return;
        this.active = false;
        const errors = [];
        for (const dispose of this.disposers.splice(0).reverse()) {
            try { dispose(); } catch (e) { errors.push(e); }
        }
        if (errors.length) throw new Error(`Lifetime cleanup failed: ${errors.map(e => e.message).join('; ')}`);
    }
}
class CancelledError extends Error { constructor() { super('Request cancelled'); this.name = 'CancelledError'; } }
Object.assign(api, {Lifetime, CancelledError});

class ResourceGate {
    constructor({maxSpecs = 80, maxEntries = 128, maxBytes = 256 * 1024 * 1024} = {}) {
        this.maxSpecs = maxSpecs; this.maxEntries = maxEntries; this.maxBytes = maxBytes;
        this.entries = new Map(); this.reservedBytes = 0;
    }
    async acquire(specs, load, unload, scope) {
        if (!scope.active) throw new CancelledError();
        const unique = new Map();
        for (const spec of specs) {
            if (!spec.key || !Number.isFinite(spec.bytes) || spec.bytes < 0) throw new Error('Resource requires a finite admission estimate');
            const existing = unique.get(spec.key) || this.entries.get(spec.key);
            if (existing && existing.bytes !== spec.bytes) throw new Error('Conflicting resource estimates');
            unique.set(spec.key, spec);
        }
        if (unique.size > this.maxSpecs) throw new Error('Resource batch exceeds 80-spec limit');
        const newSpecs = [...unique.values()].filter(s => !this.entries.has(s.key));
        if (this.entries.size + newSpecs.length > this.maxEntries || this.reservedBytes + newSpecs.reduce((sum, s) => sum + s.bytes, 0) > this.maxBytes) throw new Error('Resource admission budget exceeded');
        const owned = [];
        for (const spec of unique.values()) {
            let entry = this.entries.get(spec.key);
            if (!entry) {
                entry = {key: spec.key, bytes: spec.bytes, refs: 0, settled: false, value: null, unload};
                this.entries.set(spec.key, entry); this.reservedBytes += spec.bytes;
                entry.promise = Promise.resolve().then(() => load(spec)).then(value => {
                    entry.value = value; entry.settled = true; this.trim(entry); return value;
                }, error => { entry.settled = true; this.trim(entry); throw error; });
            }
            ++entry.refs; owned.push(entry);
        }
        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            for (const entry of owned) { --entry.refs; this.trim(entry); }
        };
        scope.own(release);
        try {
            await Promise.all(owned.map(entry => entry.promise));
            if (!scope.active || released) throw new CancelledError();
            return {get: key => { if (released) throw new CancelledError(); const entry = owned.find(e => e.key === key); if (!entry) throw new Error('Resource not leased'); return entry.value; }, release};
        } catch (error) { release(); throw error; }
    }
    trim(entry) {
        if (entry.refs || !entry.settled || this.entries.get(entry.key) !== entry) return;
        this.entries.delete(entry.key); this.reservedBytes -= entry.bytes;
        if (entry.value != null) entry.unload(entry.value);
    }
    snapshot() { return {entries: this.entries.size, reservedBytes: this.reservedBytes, pending: [...this.entries.values()].filter(e => !e.settled).length}; }
}
Object.assign(api, {ResourceGate});

// Isolate Creator 3.8.8's UI assembler hooks here. Public cc is passed by Boot.
// No DOM, browser globals, Spine, MeshRenderer or 3D module is required.
let registeredMeshSprite = null;
function registerCocos(cc) {
    if (registeredMeshSprite) return registeredMeshSprite;
    const assembler = {
        createData(sprite) {
            if (!sprite.mesh) return null;
            const rd = sprite.requestRenderData();
            rd.dataLength = sprite.mesh.source.length / 2;
            rd.resize(rd.dataLength, sprite.mesh.indices.length);
            rd.chunk.setIndexBuffer(sprite.mesh.indices);
            return rd;
        },
        updateRenderData(sprite) {
            const rd = sprite.renderData, frame = sprite.spriteFrame;
            if (!rd || !frame || !sprite.mesh) return;
            const data = rd.data, points = sprite.mesh.vertices;
            for (let i = 0; i < data.length; ++i) { data[i].x = points[i * 2]; data[i].y = -points[i * 2 + 1]; }
            this.updateUVs(sprite);
            this.updateColor(sprite);
            rd.updateRenderData(sprite, frame);
        },
        updateUVs(sprite) {
            const rd = sprite.renderData, frame = sprite.spriteFrame;
            if (!rd || !frame || !sprite.mesh) return;
            const uv = frame.uv, vb = rd.chunk.vb, points = sprite.mesh.source;
            const rect = sprite.sourceRect;
            for (let i = 0; i < rd.dataLength; ++i) {
                const x = (points[i * 2] - rect[0]) / rect[2], y = (points[i * 2 + 1] - rect[1]) / rect[3], offset = i * rd.floatStride;
                // Bilinear frame UVs also preserve vertical texture conventions.
                vb[offset + 3] = (uv[4] + (uv[6] - uv[4]) * x) * (1 - y) + (uv[0] + (uv[2] - uv[0]) * x) * y;
                vb[offset + 4] = (uv[5] + (uv[7] - uv[5]) * x) * (1 - y) + (uv[1] + (uv[3] - uv[1]) * x) * y;
            }
        },
        updateColor(sprite) {
            const rd = sprite.renderData;
            if (!rd) return;
            const vb = rd.chunk.vb, c = sprite.color;
            for (let i = 0; i < rd.dataLength; ++i) {
                const offset = i * rd.floatStride + 5;
                vb[offset] = c.r / 255; vb[offset + 1] = c.g / 255; vb[offset + 2] = c.b / 255; vb[offset + 3] = c.a / 255;
            }
        },
        fillBuffers(sprite) {
            const rd = sprite.renderData;
            if (!rd || !sprite.mesh) return;
            const chunk = rd.chunk, vb = chunk.vb, m = sprite.node.worldMatrix, points = sprite.mesh.vertices;
            for (let i = 0; i < rd.dataLength; ++i) {
                const x = points[i * 2], y = -points[i * 2 + 1], o = i * rd.floatStride;
                const w = m.m03 * x + m.m07 * y + m.m15, rhw = w ? 1 / w : 1;
                vb[o] = (m.m00 * x + m.m04 * y + m.m12) * rhw;
                vb[o + 1] = (m.m01 * x + m.m05 * y + m.m13) * rhw;
                vb[o + 2] = (m.m02 * x + m.m06 * y + m.m14) * rhw;
            }
            rd.vertDirty = false;
            const buffer = chunk.meshBuffer, indices = sprite.mesh.indices;
            let offset = buffer.indexOffset;
            for (let i = 0; i < indices.length; ++i) buffer.iData[offset++] = chunk.vertexOffset + indices[i];
            buffer.indexOffset += indices.length;
        },
    };
    class TravelMeshSprite extends cc.Sprite {
        constructor(...args) { super(...args); this.mesh = null; this.sourceRect = [0, 0, 1, 1]; }
        configure(mesh, sourceSize, contentRect = [0, 0, sourceSize[0], sourceSize[1]]) {
            if (!(mesh.vertices instanceof Float32Array) || mesh.vertices.length !== mesh.source.length) throw new Error('Invalid UI mesh');
            if (sourceSize.some(x => !(x > 0))) throw new Error('Invalid source dimensions');
            this.destroyRenderData();
            this.mesh = mesh; this.sourceRect = [...contentRect];
            this._flushAssembler();
        }
        geometryChanged() {
            if (this.renderData) this.renderData.vertDirty = true;
            this.markForUpdateRenderData();
        }
        _flushAssembler() {
            if (this._assembler !== assembler) { this.destroyRenderData(); this._assembler = assembler; }
            if (!this._renderData && this.mesh) {
                this._renderData = assembler.createData(this);
                this._renderData.material = this.getRenderMaterial(0);
                this.markForUpdateRenderData();
                if (this.spriteFrame) assembler.updateUVs(this);
                assembler.updateColor(this);
            }
        }
    }
    registeredMeshSprite = cc._decorator.ccclass('TravelMeshSprite')(TravelMeshSprite);
    return registeredMeshSprite;
}
Object.assign(api, {registerCocos});

Object.defineProperty(root, 'LittleStepsCore', {value: Object.freeze(api), writable: false, configurable: false});
})(globalThis);
