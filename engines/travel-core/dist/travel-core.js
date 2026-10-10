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

// Forward sampling of the same two-triangle grid, used by anchors and casts.
function renderedPointAt(mesh, point) {
    const fx=(point[0]-mesh.rect[0])/mesh.rect[2]*mesh.columns,fy=(point[1]-mesh.rect[1])/mesh.rect[3]*mesh.rows;
    const x=Math2D.clamp(Math.floor(fx),0,mesh.columns-1),y=Math2D.clamp(Math.floor(fy),0,mesh.rows-1),u=fx-x,v=fy-y,i=y*(mesh.columns+1)+x;
    const indices=v<=u?[i,i+1,i+mesh.columns+2]:[i,i+mesh.columns+2,i+mesh.columns+1],weights=v<=u?[1-u,u-v,v]:[1-v,u,v-u];
    return [0,1].map(axis=>indices.reduce((sum,index,j)=>sum+mesh.vertices[index*2+axis]*weights[j],0));
}

Object.assign(api, {Math2D, BoneRig, sampleTrack, createGrid, weightedSkin, sourcePixelAt, renderedPointAt});

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
            const payload = sprite.mesh && sprite.mesh.vertexData;
            for (let i = 0; i < rd.dataLength; ++i) {
                const offset = i * rd.floatStride + 5;
                // Optional three-float payload for custom UI shaders. Alpha stays
                // under Creator's normal UIOpacity path (which overwrites alpha).
                // Values need not be colors: do not clamp or premultiply RGB.
                vb[offset] = payload ? payload[i * 3] : c.r / 255;
                vb[offset + 1] = payload ? payload[i * 3 + 1] : c.g / 255;
                vb[offset + 2] = payload ? payload[i * 3 + 2] : c.b / 255;
                vb[offset + 3] = c.a / 255;
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
            if (mesh.vertexData && (!(mesh.vertexData instanceof Float32Array) || mesh.vertexData.length !== mesh.source.length / 2 * 3 || mesh.vertexData.some(x => !Number.isFinite(x)))) throw new Error('Invalid UI vertex payload');
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

// Shared UI geometry and pointer ownership. No game text or asset paths here.
function clipPolygonBelow(points, edge) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        const insideA = a[1] <= edge, insideB = b[1] <= edge;
        if (insideA) out.push([...a]);
        if (insideA !== insideB) {
            const u = (edge - a[1]) / (b[1] - a[1]);
            out.push([a[0] + (b[0] - a[0]) * u, edge]);
        }
    }
    return out;
}
function paperBubbleContour(card, tip, above) {
    const [x, y, w, h] = card, points = [[x + 29, y + 6]];
    let cursor = [29, 6];
    const lerp = (a, b, t) => a + (b - a) * t;
    const curve = (a, b, end) => {
        const start = cursor;
        for (let i = 1; i <= 8; i++) {
            const t = i / 8, u = 1 - t;
            points.push([x + u*u*u*start[0]+3*u*u*t*a[0]+3*u*t*t*b[0]+t*t*t*end[0], y + u*u*u*start[1]+3*u*u*t*a[1]+3*u*t*t*b[1]+t*t*t*end[1]]);
        }
        cursor = end;
    };
    const tailX = Math2D.clamp(tip[0] - x, 58, w - 58), relative = [tip[0] - x, tip[1] - y];
    if (above && tip[1] < y - 2) {
        curve([lerp(cursor[0], tailX-10,.3),1],[lerp(cursor[0],tailX-10,.75),3],[tailX-10,3]);
        curve([tailX-8,-4],[relative[0]-4,relative[1]+6],relative);
        curve([relative[0]+7,relative[1]+3],[tailX+12,-5],[tailX+14,3]);
        curve([lerp(cursor[0],w-38,.3),1],[lerp(cursor[0],w-38,.75),3],[w-38,5]);
    } else curve([w*.24,-1],[w*.62,1],[w-38,5]);
    curve([w-10,6],[w+2,h*.23],[w-1,h*.52]);
    curve([w-2,h*.78],[w-12,h-4],[w-37,h-2]);
    if (!above && tip[1] > y+h+2) {
        curve([lerp(cursor[0],tailX+13,.45),h+1],[tailX+24,h-3],[tailX+13,h-2]);
        curve([tailX+12,h+9],[relative[0]+7,relative[1]-2],relative);
        curve([relative[0]-3,relative[1]-7],[tailX-4,h+3],[tailX-9,h-2]);
    }
    curve([lerp(cursor[0],27,.3),h-1],[lerp(cursor[0],27,.75),h+3],[27,h-4]);
    curve([5,h-8],[-2,h*.7],[0,h*.46]);
    curve([1,h*.19],[10,9],[29,6]);
    return points;
}
class SwingFeedback {
    constructor() {this.angle=-.026;this.velocity=0;this.clock=0;this.pressTime=1;this.scale=1;}
    press() {this.pressTime=0;this.velocity+=.12;this.scale=.955;}
    release() {this.pressTime=Math.max(this.pressTime,.075);}
    advance(delta) {
        if(!Number.isFinite(delta))return;
        this.pressTime=Math.min(1,this.pressTime+Math.max(delta,0));
        const phase=this.pressTime/.32;
        this.scale=this.pressTime<.32?1-.045*Math.cos(phase*Math.PI*1.4)*Math.exp(-phase*4):1;
        let remaining=Math2D.clamp(delta,0,.1);
        while(remaining>0){const step=Math.min(remaining,.016);this.clock+=step;const breeze=Math.sin(this.clock*.8)*.009;this.velocity+=(-18*(this.angle-breeze)-4.5*this.velocity)*step;this.angle=Math2D.clamp(this.angle+this.velocity*step,-.045,.045);remaining-=step;}
    }
}
function registerUI(cc) {
    const node = (parent, name, rect) => {
        const n = new cc.Node(name); parent.addChild(n); n.setPosition(rect[0],-rect[1]);
        const ui = n.addComponent(cc.UITransform); ui.setAnchorPoint(0,1); ui.setContentSize(rect[2],rect[3]);
        return n;
    };
    const color = (values) => new cc.Color(...values.map(v => v*255));
    const polygon = (g, points, fill, stroke, width = 1.5) => {
        g.moveTo(points[0][0],-points[0][1]);
        points.slice(1).forEach(p => g.lineTo(p[0],-p[1])); g.close();
        g.fillColor = color(fill); g.fill();
        if (stroke) { g.strokeColor = color(stroke); g.lineWidth = width; g.stroke(); }
    };
    function pointer(target, callbacks, enabled = () => true) {
        let captured=-1;
        const point=event=>{const p=event.getUILocation(),local=target.getComponent(cc.UITransform).convertToNodeSpaceAR(new cc.Vec3(p.x,p.y,0));return [local.x,-local.y];};
        const cancel=()=>{if(captured===-1)return;captured=-1;if(callbacks.cancel)callbacks.cancel();};
        const start=event=>{
            if(captured!==-1||!enabled())return;
            const at=point(event),ui=target.getComponent(cc.UITransform);
            if(at[0]<0||at[1]<0||at[0]>=ui.width||at[1]>=ui.height)return;
            captured=event.getID();if(callbacks.down&&callbacks.down(at,captured)===false){captured=-1;return;}event.propagationStopped=true;
        };
        const move=event=>{if(event.getID()!==captured)return;event.propagationStopped=true;if(!enabled()){cancel();return;}if(callbacks.move)callbacks.move(point(event),captured);};
        const end=event=>{if(event.getID()!==captured)return;event.propagationStopped=true;if(!enabled()){cancel();return;}const id=captured;captured=-1;if(callbacks.up)callbacks.up(point(event),id);};
        const cancelled=event=>{if(event.getID()!==captured)return;event.propagationStopped=true;cancel();};
        target.on(cc.Node.EventType.TOUCH_START,start);target.on(cc.Node.EventType.TOUCH_MOVE,move);target.on(cc.Node.EventType.TOUCH_END,end);target.on(cc.Node.EventType.TOUCH_CANCEL,cancelled);
        return {cancel,dispose(){cancel();target.off(cc.Node.EventType.TOUCH_START,start);target.off(cc.Node.EventType.TOUCH_MOVE,move);target.off(cc.Node.EventType.TOUCH_END,end);target.off(cc.Node.EventType.TOUCH_CANCEL,cancelled);}};
    }
    function action(target, callback, enabled = () => true) {
        let pointer = -1, armed = false, generation = 0;
        const inside = (event) => {
            const p = event.getUILocation(), ui = target.getComponent(cc.UITransform);
            const local = ui.convertToNodeSpaceAR(new cc.Vec3(p.x,p.y,0));
            return local.x >= 0 && local.y <= 0 && local.x < ui.width && local.y > -ui.height;
        };
        const cancel = () => { generation++; pointer = -1; armed = false; };
        const start = event => {
            if (pointer !== -1 || !enabled() || !inside(event)) return;
            pointer = event.getID(); armed = true; event.propagationStopped = true;
        };
        const move = event => {
            if (event.getID() !== pointer) return;
            if (!enabled() || !inside(event)) armed = false;
            event.propagationStopped = true;
        };
        const end = event => {
            if (event.getID() !== pointer) return;
            const accepted = armed && enabled() && inside(event), intent = generation;
            pointer = -1; armed = false; event.propagationStopped = true;
            if (accepted) cc.director.once(cc.Director.EVENT_AFTER_UPDATE, () => {
                if (intent === generation && target.isValid && target.activeInHierarchy && enabled()) callback();
            });
        };
        const cancelled=event=>{if(event.getID()!==pointer)return;event.propagationStopped=true;cancel();};
        target.on(cc.Node.EventType.TOUCH_START,start); target.on(cc.Node.EventType.TOUCH_MOVE,move);
        target.on(cc.Node.EventType.TOUCH_END,end); target.on(cc.Node.EventType.TOUCH_CANCEL,cancelled);
        return {cancel, dispose() { cancel(); target.off(cc.Node.EventType.TOUCH_START,start); target.off(cc.Node.EventType.TOUCH_MOVE,move); target.off(cc.Node.EventType.TOUCH_END,end); target.off(cc.Node.EventType.TOUCH_CANCEL,cancelled); }};
    }
    function fixedBubble(parent, font, message, card, anchor, options = {}) {
        const root = node(parent, 'SpeechBubble', [0,0,1,1]), shape = node(root,'PaperShape',[0,0,1,1]);
        const graphics = shape.addComponent(cc.Graphics), center = [card[0]+card[2]/2,card[1]+card[3]/2];
        const content = node(root,'Content',[card[0]+28,card[1]+20,card[2]-56,card[3]-40]);
        const text = content.addComponent(cc.Label); text.overflow = cc.Label.Overflow.RESIZE_HEIGHT; text.font = font; text.string = message;
        text.horizontalAlign = cc.Label.HorizontalAlign.CENTER; text.verticalAlign = cc.Label.VerticalAlign.CENTER;
        text.color = color([.376470588,.231372549,.133333333,1]);
        text.enableWrapText = true; text.overflow = cc.Label.Overflow.RESIZE_HEIGHT;
        let size = options.fontSize || 24, minimum = options.minimumFontSize || Math.max(15,size-8), measured = [];
        const bounds = content.getComponent(cc.UITransform), allowedHeight = card[3]-40;
        while (true) {
            text.fontSize = size; text.lineHeight = size*(options.fontMetrics ? options.fontMetrics.height : 1.2);
            bounds.setContentSize(card[2]-56,allowedHeight);text.updateRenderData(true);
            measured.push({size,width:bounds.width,height:bounds.height,lineHeight:text.lineHeight});
            // Creator 3.8 adds 0.26 line of canvas padding; it is not text height.
            if (bounds.height - .26*text.lineHeight <= allowedHeight || size <= minimum) break;
            size--;
        }
        text.overflow = cc.Label.Overflow.CLAMP; bounds.setContentSize(card[2]-56,allowedHeight);
        if (options.fontMetrics) content.setPosition(card[0]+28,-(card[1]+20+(options.fontMetrics.ascent-options.fontMetrics.descent-.74)*size/2));
        const shapeOpacity = shape.addComponent(cc.UIOpacity), contentOpacity = content.addComponent(cc.UIOpacity);
        let phase = 'pop', time = 0, hold = 0;
        const paint = scale => {
            graphics.clear();
            const base = card[1] > anchor[1] ? card[1] : card[1]+card[3];
            const tip = [Math2D.clamp(anchor[0],card[0]+22,card[0]+card[2]-22),Math2D.clamp(anchor[1],base-26,base+26)];
            const contour = paperBubbleContour(card,tip,anchor[1]<card[1]).map(p => [center[0]+(p[0]-center[0])*scale,center[1]+(p[1]-center[1])*scale]);
            polygon(graphics,contour.map(p=>[p[0],p[1]+4]),[.23,.12,.055,.12]);
            polygon(graphics,contour,[1,.945098039,.839215686,1],[.788235294,.654901961,.443137255,.58]);
        };
        const api = {root, text, close() {phase='closing';time=0;}, advance(delta) {
            time += Math.max(0,delta);
            let scale = 1, alpha = 1, textAlpha = 1;
            if (phase === 'pop') {
                const t = Math2D.clamp(time/.25,0,1), ease = 1-Math.pow(1-t,3);
                scale = .91+.09*ease+Math.sin(Math.PI*t)*.045; alpha=Math.min(t*4,1);textAlpha=0;
                if (t>=1) {phase='reveal';time=0;scale=1;}
            } else if (phase==='reveal') {
                const t = Math2D.clamp(time/.2,0,1); textAlpha=Math2D.smoothstep(0,1,t);
                if(t>=1) {phase='hold';time=0;}
            } else if (phase==='hold') {
                hold += Math.max(0,delta);
                if (!options.persistent && hold >= (options.holdSeconds || Math.max(2.2,1.55+message.length*.1))) api.close();
            } else if (phase==='closing') {
                const t=Math2D.clamp(time/.19,0,1);scale=1-.07*t*t;alpha=1-t;textAlpha=Math.max(1-1.6*t,0);
                if(t>=1) {phase='hidden';root.active=false;}
            }
            paint(scale);shapeOpacity.opacity=255*alpha;contentOpacity.opacity=255*alpha*textAlpha;
        }, snapshot: () => ({phase,fontSize:size,card:[...card],measured})};
        api.advance(0); return api;
    }
    function hangingReturn(parent, font, rect, callback, enabled = () => true) {
        const root = node(parent,'HangingReturn',rect), sx=rect[2]/78,sy=rect[3]/128;
        const visual = node(root,'Swing',[39*sx,4*sy,1,1]); visual.setScale(sx,sy,1);
        const g = visual.addComponent(cc.Graphics);
        const outline=[[-25,29],[-30,34],[-29,113],[-24,120],[24,120],[29,115],[30,35],[25,29],[8,27],[-12,28]];
        polygon(g,outline.map(p=>[p[0]+1.5,p[1]+2.5]),[.18,.08,.025,.24]);
        polygon(g,outline,[.596078431,.376470588,.215686275,1]);
        polygon(g,outline.map(p=>[p[0]*.91,(p[1]-74)*.95+74]),[.972549020,.874509804,.674509804,1],[.843137255,.650980392,.396078431,1],1.2);
        const line=(a,b,c,width)=>{g.strokeColor=color(c);g.lineWidth=width;g.moveTo(a[0],-a[1]);g.lineTo(b[0],-b[1]);g.stroke();};
        line([0,0],[-4,31],[.411764706,.262745098,.152941176,1],3);
        line([-2,0],[-2,30],[.701960784,.525490196,.298039216,1],1);
        line([-24,40],[-23,105],[.62,.35,.16,.17],1);line([23,47],[22,112],[.62,.35,.16,.16],1);
        g.strokeColor=color([.518588235,.327529412,.187686275,1]);g.lineWidth=1.5;g.circle(-4,-32,3.5);g.stroke();
        line([-4,27],[-4,34],[.474509804,.313725490,.172549020,1],2);
        line([6,49],[-7,49],[.4,.235294118,.129411765,1],2.8);
        line([-7,49],[-1,43],[.4,.235294118,.129411765,1],2.8);line([-7,49],[0,55],[.4,.235294118,.129411765,1],2.8);
        ['返','回'].forEach((letter,i)=>{
            const n=node(visual,'ReturnLetter'+i,[-20,57+i*26,40,29]),l=n.addComponent(cc.Label);
            l.overflow=cc.Label.Overflow.CLAMP;l.font=font;l.string=letter;l.fontSize=24;l.lineHeight=29;l.horizontalAlign=cc.Label.HorizontalAlign.CENTER;
            l.verticalAlign=cc.Label.VerticalAlign.CENTER;l.color=color([.4,.235294118,.129411765,1]);
        });
        g.fillColor=color([.548392157,.346352941,.198431373,1]);g.circle(0,-119,2.3);g.fill();
        const pin=node(root,'Pin',[39*sx,4*sy,1,1]).addComponent(cc.Graphics);
        pin.fillColor=color([.488784314,.308705882,.176862745,1]);pin.circle(0,0,2.6);pin.fill();
        const hit=node(root,'FixedReturnHitArea',[rect[2]*.09,rect[3]*.23,rect[2]*.82,rect[3]*.76]);
        const swing=new SwingFeedback();
        const binding=action(hit,callback,enabled);
        const press=()=>{if(enabled())swing.press();},release=()=>swing.release();
        hit.on(cc.Node.EventType.TOUCH_START,press);hit.on(cc.Node.EventType.TOUCH_END,release);hit.on(cc.Node.EventType.TOUCH_CANCEL,release);
        return {root,cancel:binding.cancel,dispose(){binding.dispose();hit.off(cc.Node.EventType.TOUCH_START,press);hit.off(cc.Node.EventType.TOUCH_END,release);hit.off(cc.Node.EventType.TOUCH_CANCEL,release);},advance(delta){swing.advance(delta);visual.angle=-swing.angle*180/Math.PI;visual.setScale(sx*swing.scale,sy*swing.scale,1);}};
    }
    return Object.freeze({node, color, polygon, pointer, action, fixedBubble, hangingReturn});
}
Object.assign(api, {clipPolygonBelow, paperBubbleContour, registerUI, SwingFeedback});

// Two update ticks and one actual draw precede the sine-out entrance.
function createPageRouter(cc, owner) {
    let request=null, fade=null, generation=0;
    const event = (type, scope) => new Promise((resolve,reject)=>{
        let settled=false;
        const ready=()=>{if(settled)return;settled=true;resolve();};
        cc.director.once(type,ready);
        scope.own(()=>{cc.director.off(type,ready);if(!settled){settled=true;reject(new CancelledError());}});
    });
    const cancel=()=>{generation++;if(request)request.dispose();request=null;fade=null;};owner.own(cancel);
    return {cancel, async show(root,duration,canRun=()=>true) {
        cancel();const intent=generation,scope=new Lifetime(owner);request=scope;
        const opacity=root.getComponent(cc.UIOpacity)||root.addComponent(cc.UIOpacity);
        root.active=true;root.setSiblingIndex(root.parent.children.length-1);opacity.opacity=0;
        let committed=false;
        scope.own(()=>{if(!committed&&root.isValid){opacity.opacity=255;root.active=false;}});
        try {
            await event(cc.Director.EVENT_AFTER_UPDATE,scope);await event(cc.Director.EVENT_AFTER_UPDATE,scope);
            await event(cc.Director.EVENT_AFTER_DRAW,scope);
            while(!canRun())await event(cc.Director.EVENT_AFTER_UPDATE,scope);
            if(duration>0)await new Promise((resolve,reject)=>{
                fade={root,opacity,duration,elapsed:0,resolve};
                scope.own(()=>{if(fade&&fade.root===root)fade=null;reject(new CancelledError());});
            });
            if(!scope.active||generation!==intent)return false;
            opacity.opacity=255;committed=true;request=null;scope.dispose();return true;
        } catch(error) {scope.dispose();if(error.name==='CancelledError')return false;throw error;}
    }, advance(delta,active) {
        if(!fade||!active)return;fade.elapsed+=Math.max(0,delta);const t=Math2D.clamp(fade.elapsed/fade.duration,0,1);
        fade.opacity.opacity=255*Math.sin(t*Math.PI/2);
        if(t>=1){const completed=fade;fade=null;completed.resolve();}
    }};
}
Object.assign(api,{createPageRouter});

// Cocos transport only. Game sound choices, clocks and rewards live in games/.
api.registerAudio = function(cc) {
    return {player(parent, owner, name, notify = () => {}) {
        const node = new cc.Node(name); parent.addChild(node);
        const source = node.addComponent(cc.AudioSource); source.playOnAwake = false;
        let disposed = false, wanted = 'stopped';
        const counts = {playRequests: 0, actualStarts: 0, actualEnds: 0, pauses: 0, stops: 0, lateStartsStopped: 0};
        const snapshot = () => ({name, disposed, wanted, playing: !disposed && source.playing,
            seconds: disposed ? 0 : source.currentTime, volume: disposed ? 0 : source.volume, ...counts});
        const started = () => {
            if (disposed || !owner.active || wanted !== 'playing') {
                source.stop(); counts.lateStartsStopped++; notify('late-start-stopped', snapshot()); return;
            }
            counts.actualStarts++; notify('started', snapshot());
        };
        const ended = () => {if (disposed) return; counts.actualEnds++; if (!source.loop) wanted = 'stopped'; notify('ended', snapshot());};
        node.on(cc.AudioSource.EventType.STARTED, started); node.on(cc.AudioSource.EventType.ENDED, ended);
        const port = {
            assign(clip, loop = false) {if (disposed) return; port.stop(); source.clip = clip; source.loop = loop;},
            play() {if (disposed || !owner.active || !source.clip || wanted === 'playing') return false;
                wanted = 'playing'; counts.playRequests++; source.play(); return true;},
            pause() {if (disposed || wanted !== 'playing') return false;
                wanted = 'paused'; counts.pauses++; source.pause(); return true;},
            stop() {if (disposed) return false; const pending = wanted !== 'stopped' || source.playing;
                wanted = 'stopped'; if (source.clip) source.stop(); if (pending) counts.stops++; return pending;},
            gain(value) {if (!disposed && Number.isFinite(value)) source.volume = Math.max(0, Math.min(1, value));},
            get playing() {return !disposed && source.playing;},
            snapshot,
            dispose() {if (disposed) return; port.stop(); disposed = true;
                node.off(cc.AudioSource.EventType.STARTED, started); node.off(cc.AudioSource.EventType.ENDED, ended);
                source.clip = null; node.destroy(); notify('disposed', snapshot());},
        };
        owner.own(port.dispose); return port;
    }};
};

// Exact boolean rows, including masks whose width is not a multiple of eight.
api.bitMapContains = function(mask, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= mask.size[0] || y >= mask.size[1]) return false;
    const row = mask.rows[y];
    // Each pair is a half-open positive run, authored offline from original bits.
    let lo = 0, hi = row.length / 2;
    while (lo < hi) {
        const middle = Math.floor((lo + hi) / 2), start = row[middle * 2], end = row[middle * 2 + 1];
        if (x < start) hi = middle;
        else if (x >= end) lo = middle + 1;
        else return true;
    }
    return false;
};

// A separately rendered 2D world. Presentation opacity belongs to the display
// sprite; it must not also fade the offscreen world and multiply alpha twice.
const surfaceHostLayers = new WeakMap();
function registerRenderSurface(cc) {
    const {Node, UITransform, Canvas, Camera, Color, Sprite, SpriteFrame, RenderTexture, director, Director} = cc;
    function estimateTarget(width, height) {
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new Error('Invalid render target size');
        // Color RGBA8 plus a conservative four-byte depth/stencil attachment.
        return width * height * 8;
    }
    function createTarget(width, height, name) {
        estimateTarget(width, height);
        const texture = new RenderTexture();
        try {
            texture.initialize({width, height, name});
            texture.setFilters(RenderTexture.Filter.LINEAR, RenderTexture.Filter.LINEAR);
            texture.setMipFilter(RenderTexture.Filter.NONE);
            texture.setWrapMode(RenderTexture.WrapMode.CLAMP_TO_EDGE, RenderTexture.WrapMode.CLAMP_TO_EDGE);
            return texture;
        } catch (error) { texture.destroy(); throw error; }
    }
    function create({host, displayParent, logicalSize, displayRect, target, layer, name = 'WorldSurface'}, scope) {
        if (!scope.active) throw new CancelledError();
        if (!host || !displayParent) throw new Error('Surface requires scene/display hosts');
        let claimed = surfaceHostLayers.get(host);
        if (!claimed) {claimed = new Set(); surfaceHostLayers.set(host, claimed);}
        if (layer === undefined) {
            for (let bit = 19; bit >= 0; bit--) if (!claimed.has(1 << bit)) {layer = 1 << bit; break;}
        }
        if (!(layer > 0 && layer <= (1 << 19)) || (layer & (layer - 1)) || claimed.has(layer)) throw new Error('Surface requires an available user layer');
        claimed.add(layer);
        scope.own(() => claimed.delete(layer));
        const canvasNode = new Node(name), cameraNode = new Node(name + 'Camera'), content = new Node(name + 'Content'), display = new Node(name + 'Image');
        canvasNode.active = false; host.addChild(canvasNode);
        canvasNode.addChild(cameraNode); canvasNode.addChild(content); displayParent.addChild(display);
        const canvasUI = canvasNode.addComponent(UITransform), contentUI = content.addComponent(UITransform), displayUI = display.addComponent(UITransform);
        canvasUI.setAnchorPoint(.5, .5); contentUI.setAnchorPoint(0, 1); displayUI.setAnchorPoint(0, 1);
        const camera = cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.ORTHO; camera.visibility = layer;
        camera.priority = -1; camera.near = 1; camera.far = 2000;
        camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(0, 0, 0, 0);
        cameraNode.setPosition(0, 0, 1000);
        const canvas = canvasNode.addComponent(Canvas); canvas.alignCanvasWithScreen = false; canvas.cameraComponent = camera;
        const sprite = display.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        display.layer = displayParent.layer;
        let frame = null, disposed = false, readyFrames = 0, settleReady;
        const ready = new Promise((resolve, reject) => {settleReady = error => error ? reject(error) : resolve();});
        // Consumers may dispose a prepared surface without adopting it. Keep
        // cancellation handled even if that consumer never awaits readiness.
        ready.catch(() => {});
        const afterDraw = () => {
            if (!canvasNode.active || !camera.enabledInHierarchy || disposed) return;
            if (++readyFrames < 2) return;
            director.off(Director.EVENT_AFTER_DRAW, afterDraw); settleReady();
        };
        director.on(Director.EVENT_AFTER_DRAW, afterDraw);
        const watched = new Map();
        function exclude(node) {
            const record = watched.get(node); if (!record) return;
            node.off(Node.EventType.CHILD_ADDED, record.added); node.off(Node.EventType.CHILD_REMOVED, record.removed);
            watched.delete(node); node.layer = record.previousLayer; node.children.forEach(exclude);
        }
        function include(node) {
            if (watched.has(node)) return;
            const previousLayer = node.layer;
            node.layer = layer;
            const added = child => include(child), removed = child => exclude(child);
            watched.set(node, {added, removed, previousLayer});
            node.on(Node.EventType.CHILD_ADDED, added); node.on(Node.EventType.CHILD_REMOVED, removed);
            node.children.forEach(include);
        }
        include(canvasNode);
        function layout(size, rect, texture) {
            if (disposed || !scope.active) return false;
            if (!size.every(value => Number.isFinite(value) && value > 0) || !rect.every(Number.isFinite)) throw new Error('Invalid surface layout');
            canvasUI.setContentSize(size[0], size[1]); contentUI.setContentSize(size[0], size[1]);
            content.setPosition(-size[0] / 2, size[1] / 2);
            display.setPosition(rect[0], -rect[1]); displayUI.setContentSize(rect[2], rect[3]);
            camera.orthoHeight = size[1] / 2; camera.targetTexture = texture;
            if (!frame || frame.texture !== texture) {
                const old = frame; frame = new SpriteFrame(); frame.texture = texture; frame.packable = false;
                // Builtin Sprite's SAMPLE_FROM_RT handles the graphics backend's
                // render-texture orientation. Never apply another manual flip.
                sprite.spriteFrame = frame; if (old) old.destroy();
            }
            return true;
        }
        function dispose() {
            if (disposed) return; disposed = true;
            director.off(Director.EVENT_AFTER_DRAW, afterDraw);
            if (readyFrames < 2) settleReady(new CancelledError());
            canvasNode.active = false; camera.enabled = false; camera.targetTexture = null;
            exclude(canvasNode); sprite.spriteFrame = null;
            if (frame) frame.destroy(); frame = null;
            display.destroy(); canvasNode.destroy();
        }
        scope.own(dispose);
        layout(logicalSize, displayRect, target); canvasNode.active = true;
        return {content, display, camera, layout, dispose, ready,
            setActive(value) {if (!disposed) canvasNode.active = !!value;},
            snapshot() {return {logicalSize:[canvasUI.width,canvasUI.height],pixels:camera.targetTexture?[camera.targetTexture.width,camera.targetTexture.height]:null,layer,priority:camera.priority,active:canvasNode.active,disposed,cameraEnabled:camera.enabledInHierarchy,cameraPosition:camera.node.worldPosition,contentPosition:content.worldPosition,displayPosition:display.worldPosition,trackedNodes:watched.size,readyFrames};},
        };
    }
    return {estimateTarget, createTarget, create};
}
Object.assign(api, {registerRenderSurface});

Object.defineProperty(root, 'LittleStepsCore', {value: Object.freeze(api), writable: false, configurable: false});
})(globalThis);
