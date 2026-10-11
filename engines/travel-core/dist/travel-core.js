/* Creator 3.8.8 plugin; generated from engines/travel-core/src. */
/*!
The feathered line geometry in src/drawing.js is adapted from Godot Engine
4.5.2-stable, servers/rendering/renderer_canvas_cull.cpp.
Source: https://github.com/godotengine/godot/blob/4.5.2-stable/servers/rendering/renderer_canvas_cull.cpp
Git blob: 42ba93c0f2e5d4623400448b364d456611891e0a
SHA-256: a980ed8c3edef57eb50a810d0b2fbd6c7312ae9f6691bbf763423b69178bf3ad

The rounded fill/border geometry in src/stylebox.js is adapted from the same
Godot Engine 4.5.2-stable release, scene/resources/style_box_flat.cpp.
Source: https://github.com/godotengine/godot/blob/4.5.2-stable/scene/resources/style_box_flat.cpp
Git blob: 3562f6641f75c85029387e22db906c136f960405
SHA-256: 11c658db519fb71326fd6b53618c280016425a2268f0fc47d7bc16d5c4e05947
Defaults verified against scene/resources/style_box_flat.h:
Git blob: 7bb29937c67250fc99f573f0ee23a63416df9469
SHA-256: 4ace97e116a91d05b6a67a7ab995cbf2ad4128179a7e76a74e0f4057b357ef2c

Copyright (c) 2014-present Godot Engine contributors (see AUTHORS.md).
Copyright (c) 2007-2014 Juan Linietsky, Ariel Manzur.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

PCG32 XSH-RR and Godot RandomPCG inclusive range adapter:
Adapted to two uint32 words in src/random.js; original unsigned64 arithmetic.
Copyright (c)2014 Melissa O'Neill, pcg-random.org. Apache-2.0.
Pinned Godot4.5.2-stable sources:
core/math/random_pcg.h, blob bfcd3eeeccb836599993c4e7eeafe71df93b5059
core/math/random_pcg.cpp, blob 3f40c0084e0fd10037281b26ff60181737d67bf0
thirdparty/misc/pcg.h, blob 0faab73e6409ef94b3cde25ae606fd8e764a7ef0
thirdparty/misc/pcg.cpp, blob 914a353874d79802ed6ce024f28e77e5968bc85c
License copied from official COPYRIGHT.txt, blob c9464bd8ade4d684df8576826d56dcd834eb3f1f:
                              Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

(a) You must give any other recipients of the Work or
    Derivative Works a copy of this License; and

(b) You must cause any modified files to carry prominent notices
    stating that You changed the files; and

(c) You must retain, in the Source form of any Derivative Works
    that You distribute, all copyright, patent, trademark, and
    attribution notices from the Source form of the Work,
    excluding those notices that do not pertain to any part of
    the Derivative Works; and

(d) If the Work includes a "NOTICE" text file as part of its
    distribution, then any Derivative Works that You distribute must
    include a readable copy of the attribution notices contained
    within such NOTICE file, excluding those notices that do not
    pertain to any part of the Derivative Works, in at least one
    of the following places: within a NOTICE text file distributed
    as part of the Derivative Works; within the Source form or
    documentation, if provided along with the Derivative Works; or,
    within a display generated by the Derivative Works, if and
    wherever such third-party notices normally appear. The contents
    of the NOTICE file are for informational purposes only and
    do not modify the License. You may add Your own attribution
    notices within Derivative Works that You distribute, alongside
    or as an addendum to the NOTICE text from the Work, provided
    that such additional attribution notices cannot be construed
    as modifying the License.

You may add Your own copyright statement to Your modifications and
may provide additional or different license terms and conditions
for use, reproduction, or distribution of Your modifications, or
for any such Derivative Works as a whole, provided Your use,
reproduction, and distribution of the Work otherwise complies with
the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright [yyyy] [name of copyright owner]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
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
                if (sprite.mesh.vertexUV) {
                    const offset = i * rd.floatStride;
                    vb[offset + 3] = sprite.mesh.vertexUV[i * 2];
                    vb[offset + 4] = sprite.mesh.vertexUV[i * 2 + 1];
                    continue;
                }
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
            if (mesh.vertexUV && (!(mesh.vertexUV instanceof Float32Array) || mesh.vertexUV.length !== mesh.source.length || mesh.vertexUV.some(x => !Number.isFinite(x)))) throw new Error('Invalid UI vertex UV');
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
// Captures one modal target. Leaving it cancels permanently, including an
// outside press crossing the paper and returning outside before release.
class BubblePointer {
    constructor(){this.cancel();}
    cancel(){this.owner=null;this.target='';this.valid=false;this.rect=[];}
    down(id,at,card,choices,phase){if(this.owner!==null)return true;this.owner=id;this.target=this.targetAt(at,card,choices);if(phase==='closing'||phase!=='hold'&&this.target!=='outside'&&this.target!=='no')this.target='';this.valid=!!this.target;this.rect=(choices[this.target]||[]).slice();return true;}
    move(id,at,card){if(id!==this.owner)return false;const stays=this.target==='outside'?!this.inside(at,card):this.inside(at,this.rect);if(!stays)this.valid=false;return true;}
    up(id,at,card,choices,phase){if(id!==this.owner)return null;this.move(id,at,card);const accepted=this.valid&&phase!=='closing'&&(phase==='hold'||this.target==='outside'||this.target==='no')&&this.targetAt(at,card,choices)===this.target,target=accepted?this.target:'';this.cancel();return target;}
    inside(at,r){return at.length===2&&at.every(Number.isFinite)&&r.length===4&&at[0]>=r[0]&&at[1]>=r[1]&&at[0]<r[0]+r[2]&&at[1]<r[1]+r[3];}
    targetAt(at,card,choices){if(!at.every(Number.isFinite))return '';if(!this.inside(at,card))return 'outside';for(const name of Object.keys(choices))if(this.inside(at,choices[name]))return name;return '';}
}
function infoBubbleLayout(anchor,safe,naturalWidth,measuredHeight,options={}) {
    const r=safe.slice(),point=options.fontSize||24;
    if(options.aboveOnly){r[3]=Math.min(r[1]+r[3],anchor[1]+6)-r[1];if(r[3]<(options.confirmation?180:130))return [anchor[0],anchor[1],0,0];}
    const available=[r[0]+6,r[1]+6,r[2]-12,r[3]-12],max=Math.min(options.maxWidth||430,available[2]),min=Math.min(options.minWidth||270,max),w=Math2D.clamp(naturalWidth+56,min,max);
    let h=Math.min(Math.max(Math.max(measuredHeight,point*1.5)+44+(options.confirmation?62:0),options.confirmation?130:79),available[3]-24);
    const above=Math2D.clamp(anchor[1]-available[1]-20,0,available[3]-24),below=Math2D.clamp(available[1]+available[3]-anchor[1]-20,0,available[3]-24),under=above<h&&below>above;
    h=Math.min(h,Math.max(under?below:above,80));
    return [Math2D.clamp(anchor[0]-w/2,available[0],available[0]+available[2]-w),Math2D.clamp(under?anchor[1]+20:anchor[1]-h-20,available[1],available[1]+available[3]-h),w,h];
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
        const graphics = shape.addComponent(cc.Graphics);
        const content = node(root,'Content',[card[0]+28,card[1]+20,card[2]-56,card[3]-40]);
        const text = content.addComponent(cc.Label); text.overflow = cc.Label.Overflow.RESIZE_HEIGHT; text.font = font; text.string = message;
        text.horizontalAlign = cc.Label.HorizontalAlign.CENTER; text.verticalAlign = cc.Label.VerticalAlign.CENTER;
        text.color = color([.376470588,.231372549,.133333333,1]);
        text.enableWrapText = true; text.overflow = cc.Label.Overflow.RESIZE_HEIGHT;
        let size = options.fontSize || 24, minimum = options.minimumFontSize || Math.max(15,size-8), measured = [];
        const bounds = content.getComponent(cc.UITransform), allowedHeight = card[3]-40-(options.confirmation?62:0);
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
        let phase = 'pop', time = 0, hold = 0, contentAlpha = 0;
        const paint = scale => {
            const center=[card[0]+card[2]/2,card[1]+card[3]/2];
            graphics.clear();
            const base = card[1] > anchor[1] ? card[1] : card[1]+card[3];
            const tip = [Math2D.clamp(anchor[0],card[0]+22,card[0]+card[2]-22),Math2D.clamp(anchor[1],base-26,base+26)];
            const contour = paperBubbleContour(card,tip,anchor[1]<card[1]).map(p => [center[0]+(p[0]-center[0])*scale,center[1]+(p[1]-center[1])*scale]);
            polygon(graphics,contour.map(p=>[p[0],p[1]+4]),[.23,.12,.055,.12]);
            polygon(graphics,contour,[1,.945098039,.839215686,1],[.788235294,.654901961,.443137255,.58]);
        };
        const api = {root, text, layout(next,at) {card.splice(0,4,...next);anchor.splice(0,2,...at);bounds.setContentSize(Math.max(1,card[2]-56),Math.max(1,card[3]-40-(options.confirmation?62:0)));content.setPosition(card[0]+28,-(card[1]+20+(options.fontMetrics?(options.fontMetrics.ascent-options.fontMetrics.descent-.74)*size/2:0)));}, close() {if(phase==='closing'||phase==='hidden')return;phase='closing';time=0;}, advance(delta) {
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
            paint(scale);shapeOpacity.opacity=255*alpha;contentAlpha=alpha*textAlpha;contentOpacity.opacity=255*contentAlpha;
        }, snapshot: () => ({phase,fontSize:size,card:[...card],measured,contentAlpha})};
        api.advance(0); return api;
    }
    function infoBubble(parent,font,message,anchor,safe,options={}) {
        const probe=node(parent,'BubbleMeasurement',[0,0,1,1]),label=probe.addComponent(cc.Label),bounds=probe.getComponent(cc.UITransform),point=options.fontSize||24;
        label.font=font;label.string=message;label.fontSize=point;label.lineHeight=point*(options.fontMetrics?options.fontMetrics.height:1.2);label.enableWrapText=false;label.overflow=cc.Label.Overflow.NONE;label.updateRenderData(true);
        const natural=bounds.width,measurements=new Map();
        const initial=infoBubbleLayout(anchor,safe,natural,point*1.5,Object.assign({},options,{aboveOnly:false}));label.enableWrapText=true;label.overflow=cc.Label.Overflow.RESIZE_HEIGHT;bounds.setContentSize(Math.max(1,initial[2]-56),1);label.updateRenderData(true);const measured=Math.max(0,bounds.height-.26*label.lineHeight);measurements.set(Math.max(1,initial[2]-56),measured);probe.destroy();
        const card=infoBubbleLayout(anchor,safe,natural,measured,options),fallback=infoBubbleLayout(anchor,safe,natural,measured,Object.assign({},options,{aboveOnly:false})),api=fixedBubble(parent,font,message,card[2]>0?card:fallback,anchor.slice(),options),advance=api.advance,snapshot=api.snapshot;
        let blocked=false,currentSafe=safe.slice(),lastAnchor=anchor.slice();
        api.layoutFor=(at,nextSafe)=>{
            const initial=infoBubbleLayout(at,nextSafe,natural,point*1.5,Object.assign({},options,{aboveOnly:false})),width=Math.max(1,initial[2]-56);
            if(!measurements.has(width)){
                const probe=node(parent,'BubbleMeasurement',[0,0,width,1]),label=probe.addComponent(cc.Label),bounds=probe.getComponent(cc.UITransform);
                label.font=font;label.string=message;label.fontSize=point;label.lineHeight=point*(options.fontMetrics?options.fontMetrics.height:1.2);label.enableWrapText=true;label.overflow=cc.Label.Overflow.RESIZE_HEIGHT;label.updateRenderData(true);
                measurements.set(width,Math.max(0,bounds.height-.26*label.lineHeight));probe.destroy();
            }
            return infoBubbleLayout(at,nextSafe,natural,measurements.get(width),options);
        };
        api.setSafe=nextSafe=>{if(nextSafe.length!==4||!nextSafe.every(Number.isFinite)||nextSafe[2]<=0||nextSafe[3]<=0)throw new Error('Invalid bubble safe rect');currentSafe=nextSafe.slice();api.setAnchor(lastAnchor);};
        api.setAnchor=at=>{lastAnchor=at.slice();const rect=api.layoutFor(at,currentSafe);blocked=rect[2]===0;api.layout(rect,at);api.root.children.forEach(child=>{child.active=!blocked;});};
        api.advance=delta=>{if(!blocked)advance(delta);};api.snapshot=()=>Object.assign(snapshot(),{speakerClearanceBlocked:blocked});api.setAnchor(anchor);return api;
    }
    function confirmationBubble(parent,font,message,anchor,safe,options={}) {
        const settings=Object.assign({},options,{confirmation:true,persistent:true}),api=infoBubble(parent,font,message,anchor,safe,settings),choices=node(api.root,'Choices',[0,0,1,1]),opacity=choices.addComponent(cc.UIOpacity),owner=new BubblePointer(),buttons={},divider=node(choices,'Divider',[0,0,1,1]).addComponent(cc.Graphics);
        let rects={},decided=false;
        ['yes','no'].forEach((key,index)=>{if(options.cancelOnly&&key==='yes')return;const root=node(choices,key,[0,0,1,1]),text=root.addComponent(cc.Label);text.font=font;text.string=index?(options.cancelText===undefined?'Cancel':options.cancelText):(options.acceptText===undefined?'OK':options.acceptText);text.fontSize=options.fontSize||24;text.lineHeight=text.fontSize*(options.fontMetrics?options.fontMetrics.height:1.2);text.horizontalAlign=cc.Label.HorizontalAlign.CENTER;text.verticalAlign=cc.Label.VerticalAlign.CENTER;const ink=[.376470588,.231372549,.133333333],light=index?(options.cancelLighten||0):0;text.color=color([...ink.map(v=>v+(1-v)*light),1]);text.overflow=cc.Label.Overflow.CLAMP;buttons[key]=root;});
        const setAnchor=api.setAnchor,advance=api.advance,snapshot=api.snapshot;
        api.setAnchor=at=>{setAnchor(at);const state=snapshot(),r=state.card,w=Math.max(1,(r[2]-48)/2);rects=options.cancelOnly?{no:[r[0]+(r[2]-w)/2,r[1]+r[3]-54,w,44]}:{yes:[r[0]+18,r[1]+r[3]-54,w,44],no:[r[0]+30+w,r[1]+r[3]-54,w,44]};Object.keys(buttons).forEach(key=>{const node=buttons[key],r=rects[key];node.setPosition(r[0],-(r[1]+(options.fontMetrics?(options.fontMetrics.ascent-options.fontMetrics.descent-.74)*(options.fontSize||24)/2:0)));node.getComponent(cc.UITransform).setContentSize(r[2],r[3]);});divider.clear();divider.strokeColor=color([.376470588,.231372549,.133333333,.11]);divider.lineWidth=1;divider.moveTo(r[0]+29,-(r[1]+r[3]-60));divider.lineTo(r[0]+r[2]-29,-(r[1]+r[3]-60));divider.stroke();choices.active=!state.speakerClearanceBlocked;};
        api.advance=delta=>{advance(delta);opacity.opacity=255*snapshot().contentAlpha;};
        api.down=(id,at)=>owner.down(id,at,snapshot().card,choices.active?rects:{},snapshot().phase);
        api.move=(id,at)=>owner.move(id,at,snapshot().card);
        api.up=(id,at)=>{const target=owner.up(id,at,snapshot().card,choices.active?rects:{},snapshot().phase);if(target&&!decided){decided=true;api.close();if(options.onDecision)options.onDecision(target==='yes');}return target!==null;};
        api.cancelPointer=()=>owner.cancel();
        api.snapshot=()=>Object.assign(snapshot(),{choices:rects,decided,capturedPointer:owner.owner});api.setAnchor(anchor);return api;
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
    return Object.freeze({node, color, polygon, pointer, action, fixedBubble, infoBubble, confirmationBubble, hangingReturn});
}
Object.assign(api, {clipPolygonBelow, paperBubbleContour, registerUI, SwingFeedback,infoBubbleLayout,BubblePointer});

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

// Checksummed, recoverable checkpoints. The game supplies schema validation
// and generation ordering; this module knows no save slot or product rule.
function checkpointUtf8(text) {
    const bytes=[];
    for(let i=0;i<text.length;i++) {
        let cp=text.charCodeAt(i);
        if(cp>=0xd800&&cp<=0xdbff) {const next=text.charCodeAt(i+1);if(next>=0xdc00&&next<=0xdfff){cp=0x10000+(cp-0xd800)*1024+next-0xdc00;i++;}else cp=0xfffd;}
        else if(cp>=0xdc00&&cp<=0xdfff)cp=0xfffd;
        if(cp<128)bytes.push(cp);else if(cp<2048)bytes.push(192|(cp>>6),128|(cp&63));else if(cp<65536)bytes.push(224|(cp>>12),128|((cp>>6)&63),128|(cp&63));else bytes.push(240|(cp>>18),128|((cp>>12)&63),128|((cp>>6)&63),128|(cp&63));
    }
    return bytes;
}
function checkpointSHA256(text) {
    const bytes=checkpointUtf8(text),length=bytes.length*8;
    bytes.push(128);while(bytes.length%64!==56)bytes.push(0);
    const high=Math.floor(length/4294967296),low=length>>>0;
    for(const word of [high,low])for(let shift=24;shift>=0;shift-=8)bytes.push((word>>>shift)&255);
    const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],w=new Int32Array(64),rotr=(x,n)=>(x>>>n)|(x<<(32-n));
    for(let base=0;base<bytes.length;base+=64) {
        for(let i=0;i<16;i++)w[i]=bytes[base+i*4]<<24|bytes[base+i*4+1]<<16|bytes[base+i*4+2]<<8|bytes[base+i*4+3];
        for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=(rotr(a,7)^rotr(a,18)^(a>>>3))+w[i-16]+(rotr(b,17)^rotr(b,19)^(b>>>10))+w[i-7];}
        let [a,b,c,d,e,f,g,j]=h;
        for(let i=0;i<64;i++){const t=(j+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0,u=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))|0;j=g;g=f;f=e;e=(d+t)|0;d=c;c=b;b=a;a=(t+u)|0;}
        [a,b,c,d,e,f,g,j].forEach((v,i)=>h[i]=(h[i]+v)|0);
    }
    return h.map(v=>('00000000'+(v>>>0).toString(16)).slice(-8)).join('');
}
function checkpointUTF8Length(text) {
    let length=0;
    for(let i=0;i<text.length;i++) {
        const cp=text.charCodeAt(i);
        if(cp>=0xd800&&cp<=0xdbff&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){length+=4;i++;}
        else length+=cp<128?1:cp<2048?2:3;
    }
    return length;
}
function checkpointCanonical(value) {
    if(Array.isArray(value))return value.map(checkpointCanonical);
    if(value&&typeof value==='object'){const out={};Object.keys(value).sort().forEach(k=>{Object.defineProperty(out,k,{value:checkpointCanonical(value[k]),writable:true,enumerable:true,configurable:true});});return out;}
    return value;
}
class CheckpointStore {
    constructor(storage,maxBytes=4096){this.storage=storage;this.maxBytes=maxBytes;this.lastError='';this.committed=false;}
    envelope(data){const payload=JSON.stringify(checkpointCanonical(data));return JSON.stringify({payload,sha256:checkpointSHA256(payload)});}
    decode(contents){
        if(typeof contents!=='string'||checkpointUTF8Length(contents)>this.maxBytes)return null;
        try{const box=JSON.parse(contents);if(typeof box.payload!=='string'||checkpointSHA256(box.payload)!==box.sha256)return null;const data=JSON.parse(box.payload);return data&&typeof data==='object'&&!Array.isArray(data)?data:null;}catch(_){return null;}
    }
    read(key){
        this.lastError='';const records=[];let found=false;
        for(const suffix of ['','.tmp','.bak'])try{const contents=this.storage.getItem(key+suffix);if(typeof contents==='string'){found=true;const data=this.decode(contents);if(data)records.push({data,source:key+suffix});}}catch(error){this.lastError='checkpoint_read_failed:'+String(error.name||error);}
        if(found&&!records.length&&!this.lastError)this.lastError='no_valid_saved_generation';return records;
    }
    write(key,data){
        this.lastError='';this.committed=false;const contents=this.envelope(data);
        if(checkpointUTF8Length(contents)>this.maxBytes){this.lastError='save_too_large';return false;}
        try {
            this.storage.setItem(key+'.tmp',contents);if(this.storage.getItem(key+'.tmp')!==contents)throw new Error('verify_temporary_save_failed');
            const before=this.storage.getItem(key);if(typeof before==='string')this.storage.setItem(key+'.bak',before);
            this.storage.setItem(key,contents);if(this.storage.getItem(key)!==contents)throw new Error('verify_committed_save_failed');
            this.committed=true;return true;
        }catch(error){this.lastError='checkpoint_write_failed:'+String(error.message||error);return false;}
    }
}
// File-format migrations may need raw JSON rather than a checksummed envelope.
// Validation and revision selection remain the caller's responsibility.
class RawJSONCheckpointStore extends CheckpointStore {
    envelope(data){return JSON.stringify(checkpointCanonical(data));}
    decode(contents){
        if(typeof contents!=='string'||checkpointUTF8Length(contents)>this.maxBytes)return null;
        try{const data=JSON.parse(contents);return data&&typeof data==='object'&&!Array.isArray(data)?data:null;}catch(_){return null;}
    }
}
Object.assign(api,{CheckpointStore,RawJSONCheckpointStore,checkpointSHA256,checkpointUTF8Length});

// Antialiased positive-width 2D lines. Feather geometry follows Godot 4.5.2
// renderer_canvas_cull.cpp (MIT; see NOTICE.godot.txt), without screen derivatives.
// Vertex payload's first channel is coverage, independent of Creator UIOpacity.
const DRAW_FEATHER = 1.25;
const drawAdd=(a,b,s=1)=>[a[0]+b[0]*s,a[1]+b[1]*s];
const drawSub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const drawNormal=a=>[a[1],-a[0]];
const drawUnit=a=>{const l=Math.hypot(a[0],a[1]);return l?[a[0]/l,a[1]/l]:[0,0];};
const drawZero=a=>Math.abs(a[0])<1e-5&&Math.abs(a[1])<1e-5;
function drawValidate(points,width){
    if(!Number.isFinite(width)||width<=0||points.length<2||!points.every(p=>p.length===2&&p.every(Number.isFinite)))throw new Error('Invalid positive-width line');
}
function drawBuilder(){
    const vertices=[],coverage=[],indices=[];
    return {strip(points,alphas){const start=vertices.length/2;points.forEach((p,i)=>{vertices.push(...p);coverage.push(alphas[i],0,0);});for(let i=2;i<points.length;i++)indices.push(start+i-2,start+i-1,start+i);},quad(points,alphas){const start=vertices.length/2;points.forEach((p,i)=>{vertices.push(...p);coverage.push(alphas[i],0,0);});indices.push(start,start+1,start+2,start,start+2,start+3);},finish(){if(vertices.length/2>65535)throw new Error('Line mesh exceeds 16-bit indices');return {vertices:new Float32Array(vertices),source:new Float32Array(vertices.length),vertexData:new Float32Array(coverage),indices:new Uint16Array(indices)};}};
}
function featherLine(from,to,width){
    drawValidate([from,to],width);const b=drawBuilder(),diff=drawSub(from,to);
    if(drawZero(diff))return b.finish();
    const normal=drawNormal(drawUnit(diff)),extent=width*.5,borderSize=DRAW_FEATHER*Math.min(1,width),side=normal.map(v=>v*borderSize),cap=drawUnit(diff).map(v=>v*borderSize);
    const a=drawAdd(from,normal,extent),c=drawAdd(from,normal,-extent),d=drawAdd(to,normal,-extent),e=drawAdd(to,normal,extent);
    b.quad([a,c,d,e],[1,1,1,1]);
    b.quad([a,drawAdd(a,side),drawAdd(e,side),e],[1,0,0,1]);
    b.quad([c,drawAdd(c,side,-1),drawAdd(d,side,-1),d],[1,0,0,1]);
    b.quad([a,drawAdd(a,cap),drawAdd(c,cap),c],[1,0,0,1]);
    b.quad([e,drawAdd(e,cap,-1),drawAdd(d,cap,-1),d],[1,0,0,1]);
    for(const [p,s,t]of [[a,1,1],[c,-1,1],[e,1,-1],[d,-1,-1]])b.quad([p,drawAdd(p,cap,t),drawAdd(drawAdd(p,side,s),cap,t),drawAdd(p,side,s)],[1,0,0,0]);
    return b.finish();
}
function featherPolyline(points,width){
    drawValidate(points,width);const b=drawBuilder(),n=points.length,dirs=[];
    for(let i=1;i<n;i++)dirs.push(drawUnit(drawSub(points[i],points[i-1])));
    const first=dirs.find(d=>!drawZero(d));if(!first)return b.finish();const last=dirs.slice().reverse().find(d=>!drawZero(d));
    const loop=drawZero(drawSub(points[0],points[n-1])),offset=loop?0:2,count=n*2+(loop?0:4),sideCount=n*2+(loop?0:5),center=Array(count),left=Array(sideCount),right=Array(sideCount),ca=Array(count),la=Array(sideCount),ra=Array(sideCount),borderSize=DRAW_FEATHER*Math.min(1,width);
    let previous=[0,0];
    for(let i=0;i<n;i++){
        let segment=i===n-1?previous:dirs[i];if(drawZero(segment))segment=previous;
        if(loop&&i===0)previous=last;else if(loop&&i===n-1)previous=first;
        let base;
        if(!loop&&i===0)base=drawNormal(first);else if(!loop&&i===n-1)base=drawNormal(last);else {
            let bisector=drawUnit(drawSub(previous,segment)),length=1;
            const sine=Math.sin(Math.atan2(bisector[0]*previous[1]-bisector[1]*previous[0],bisector[0]*previous[0]+bisector[1]*previous[1]));
            if(Math.abs(sine)>=1e-5&&!drawZero(drawSub(segment,previous)))length=Math.max(-3,Math.min(3,1/sine));else bisector=drawNormal(segment);
            if(drawZero(bisector))bisector=drawNormal(segment);base=bisector.map(v=>v*length);
        }
        const p=points[i],edge=base.map(v=>v*width*.5),border=base.map(v=>v*borderSize),j=i*2+offset;
        center[j]=left[j]=drawAdd(p,edge);center[j+1]=right[j]=drawAdd(p,edge,-1);left[j+1]=drawAdd(center[j],border);right[j+1]=drawAdd(center[j+1],border,-1);
        ca[j]=ca[j+1]=la[j]=ra[j]=1;la[j+1]=ra[j+1]=0;
        if(!loop&&i===0){const cap=segment.map(v=>-v*borderSize);center[0]=left[0]=drawAdd(center[j],cap);center[1]=right[0]=drawAdd(center[j+1],cap);left[1]=drawAdd(left[0],border);right[1]=drawAdd(right[0],border,-1);ca[0]=ca[1]=la[0]=la[1]=ra[0]=ra[1]=0;}
        if(!loop&&i===n-1){const cap=previous.map(v=>v*borderSize),end=n*2+2;center[end]=drawAdd(center[j],cap);center[end+1]=drawAdd(center[j+1],cap);ca[end]=ca[end+1]=0;
            left[end]=center[j];left[end+1]=drawAdd(drawAdd(center[j],cap),border);left[end+2]=drawAdd(center[j],cap);la[end]=1;la[end+1]=la[end+2]=0;
            right[end]=center[j+1];right[end+1]=drawAdd(drawAdd(center[j+1],cap),border,-1);right[end+2]=drawAdd(center[j+1],cap);ra[end]=1;ra[end+1]=ra[end+2]=0;
        }
        previous=segment;
    }
    // Native commands render the body then the left and right feather strips.
    b.strip(center,ca);b.strip(left,la);b.strip(right,ra);return b.finish();
}
function mergeDrawingMeshes(meshes){
    const b={vertices:[],source:[],vertexData:[],indices:[]};
    for(const mesh of meshes){const offset=b.vertices.length/2;for(const key of ['vertices','source','vertexData'])for(const value of mesh[key])b[key].push(value);for(const index of mesh.indices)b.indices.push(index+offset);}
    if(b.vertices.length/2>65535)throw new Error('Drawing mesh exceeds 16-bit indices');
    return {vertices:new Float32Array(b.vertices),source:new Float32Array(b.source),vertexData:new Float32Array(b.vertexData),indices:new Uint16Array(b.indices)};
}
Object.assign(api,{featherLine,featherPolyline,mergeDrawingMeshes});

// Rounded fill/border tessellation follows Godot 4.5.2 StyleBoxFlat (MIT;
// NOTICE.godot.txt). Supports four radii/borders, center, AA and corner detail.
// Shadow, skew and blended borders are outside this explicit API.
function roundedStyleBox(rect,options={}) {
    const four=(value,defaultValue)=>Array.isArray(value)?value.slice():Array(4).fill(value??defaultValue);
    const radii=four(options.radius,0),border=four(options.borderWidth,0),fill=options.fill??[.6,.6,.6,1],outline=options.border??[.8,.8,.8,1],detail=options.cornerDetail??8,aa=options.aaSize??1,center=options.drawCenter!==false;
    if(rect.length!==4||rect.some(v=>!Number.isFinite(v))||rect[2]<0||rect[3]<0||[radii,border].some(v=>v.length!==4||v.some(n=>!Number.isFinite(n)||n<0))||[fill,outline].some(c=>c.length!==4||c.some(n=>!Number.isFinite(n)||n<0||n>1))||!Number.isInteger(detail)||detail<1||detail>20||!Number.isFinite(aa)||aa<0)throw new Error('Invalid rounded style box');
    const vertices=[],rgb=[],uv=[],indices=[];
    const finish=()=>({vertices:new Float32Array(vertices),source:new Float32Array(vertices.length),vertexData:new Float32Array(rgb),vertexUV:new Float32Array(uv),indices:new Uint16Array(indices)});
    if(!rect[2]||!rect[3]||(!center&&!border.some(n=>n>0)))return finish();
    const grow=(r,b)=>[r[0]-b[0],r[1]-b[1],r[2]+b[0]+b[2],r[3]+b[1]+b[3]],map=(a,f)=>a.map(f),adaptedBorder=Array(4).fill(1e6),adaptedRadius=Array(4).fill(1e6);
    const adapt=(a,b,result,values,width,maxA,maxB)=>{const factor=Math.min(1,width/(values[a]+values[b]));result[a]=Math.min(values[a]*factor,maxA,result[a]);result[b]=Math.min(values[b]*factor,maxB,result[b]);};
    adapt(1,3,adaptedBorder,border,rect[3],rect[3],rect[3]);adapt(0,2,adaptedBorder,border,rect[2],rect[2],rect[2]);
    adapt(1,2,adaptedRadius,radii,rect[3],rect[3]-adaptedBorder[3],rect[3]-adaptedBorder[1]);adapt(0,3,adaptedRadius,radii,rect[3],rect[3]-adaptedBorder[3],rect[3]-adaptedBorder[1]);
    adapt(0,1,adaptedRadius,radii,rect[2],rect[2]-adaptedBorder[2],rect[2]-adaptedBorder[0]);adapt(3,2,adaptedRadius,radii,rect[2],rect[2]-adaptedBorder[2],rect[2]-adaptedBorder[0]);
    const hasBorder=border.some(n=>n>0),aaOn=options.antialiased!==false&&aa>0&&radii.some(n=>n>0),infill=grow(rect,map(adaptedBorder,n=>-n)),style=aaOn?grow(rect,map(border,n=>n>0?-aa:0)):rect;
    function corners(r){
        const b=[r[0]-style[0],r[1]-style[1],style[2]-r[2]-(r[0]-style[0]),style[3]-r[3]-(r[1]-style[1])];
        const cr=[Math.max(adaptedRadius[0]-Math.min(b[1],b[0]),0),Math.max(adaptedRadius[1]-Math.min(b[1],b[2]),0),Math.max(adaptedRadius[2]-Math.min(b[3],b[2]),0),Math.max(adaptedRadius[3]-Math.min(b[3],b[0]),0)];
        const overflow=[Math.max(0,cr[0]+cr[3]-r[3]),Math.max(0,cr[0]+cr[1]-r[2]),Math.max(0,cr[1]+cr[2]-r[3]),Math.max(0,cr[3]+cr[2]-r[2])],hs=b[0]+b[2],vs=b[1]+b[3],ratio=[hs>0?b[0]/hs:0,vs>0?b[1]/vs:0,hs>0?b[2]/hs:0,vs>0?b[3]/vs:0];
        const reduction=[[overflow[1]*ratio[0],overflow[0]*ratio[1]],[overflow[1]*ratio[2],overflow[2]*ratio[1]],[overflow[3]*ratio[2],overflow[2]*ratio[3]],[overflow[3]*ratio[0],overflow[0]*ratio[3]]],left=reduction.map((v,i)=>v.map(n=>Math.max(0,n-cr[i]))),distributed=reduction.map((v,i)=>v.map((n,j)=>Math.max(0,cr[i]-n-left[(i+1)%4][j]-left[(i+3)%4][j]))),scale=distributed.map((v,i)=>v.map((n,j)=>n/Math.max(1.1920928955078125e-7,cr[i]-Math.max(0,left[(i+1)%4][j]+left[(i+3)%4][j]-n))));
        const centers=[[r[0]+cr[0]*scale[0][0],r[1]+cr[0]*scale[0][1]],[r[0]+r[2]-cr[1]*scale[1][0],r[1]+cr[1]*scale[1][1]],[r[0]+r[2]-cr[2]*scale[2][0],r[1]+r[3]-cr[2]*scale[2][1]],[r[0]+cr[3]*scale[3][0],r[1]+r[3]-cr[3]*scale[3][1]]];
        return {cr,scale,centers};
    }
    function rounded(ring,inner,innerColor,outerColor,filled=false){
        const start=vertices.length/2,steps=adaptedRadius.some(n=>n>0)?detail:1,a=corners(inner),b=corners(ring),add=(set,i,angle,color)=>{vertices.push(set.centers[i][0]+set.cr[i]*Math.cos(angle)*set.scale[i][0],set.centers[i][1]+set.cr[i]*Math.sin(angle)*set.scale[i][1]);rgb.push(...color.slice(0,3));uv.push(color[3],0);};
        for(let i=0;i<4;i++)for(let j=0;j<=steps;j++){const angle=(i+j/steps)*Math.PI/2+Math.PI;add(a,i,angle,innerColor);if(!filled)add(b,i,angle,outerColor);}
        const count=vertices.length/2-start;
        if(!filled){for(let i=0;i<count;i++)indices.push(start+i,start+(i+2)%count,start+(i+1)%count);}
        else{for(let i=0;i<count/2-1;i++)indices.push(start+i,start+count-2-i,start+i+1,start+i,start+count-1-i,start+count-2-i);}
    }
    const transparent=c=>[c[0],c[1],c[2],0];
    if(!aaOn){if(hasBorder)rounded(style,infill,outline,outline);if(center)rounded(infill,infill,fill,fill,true);}
    else {
        const borderAA=map(border,n=>hasBorder&&n>0?aa:0),fillAA=map(border,n=>!hasBorder||n===0?aa:0),half=a=>map(a,n=>n*.5),negative=a=>map(a,n=>-n);
        if(center){const clear=grow(infill,half(fillAA)),solid=grow(clear,negative(fillAA));rounded(solid,solid,fill,fill,true);rounded(clear,solid,fill,transparent(fill));}
        if(hasBorder){const innerSolid=grow(infill,half(borderAA)),innerClear=grow(innerSolid,negative(borderAA)),outerClear=grow(rect,half(borderAA)),outerSolid=grow(style,half(borderAA));rounded(outerSolid,innerSolid,outline,outline);rounded(innerSolid,innerClear,center?fill:transparent(outline),outline);rounded(outerClear,outerSolid,outline,transparent(outline));}
    }
    if(vertices.length/2>65535)throw new Error('Style box exceeds 16-bit indices');return finish();
}
Object.assign(api,{roundedStyleBox});

// PCG32 XSH-RR, adapted from the pinned Godot4.5.2 implementation.
// (c)2014 M.E. O'Neill, Apache-2.0; full notice in NOTICE.godot.txt.
// Two exact uint32 words avoid requiring BigInt on mini-game runtimes.
api.PCG32 = class PCG32 {
    constructor(seed = 0) { this.seed(seed); }
    seed(value) {
        if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('PCG seed requires a nonnegative safe integer');
        this.low = 0; this.high = 0;
        this.next();
        const low = value >>> 0, sum = this.low + low;
        this.high = (this.high + Math.floor(value / 4294967296) + (sum >= 4294967296 ? 1 : 0)) >>> 0;
        this.low = sum >>> 0;
        this.next();
        return this;
    }
    next() {
        const low = this.low, high = this.high;
        const a = low & 65535, b = low >>> 16;
        const c = 0x4c957f2d & 65535, d = 0x4c957f2d >>> 16;
        const middle = Math.floor(a * c / 65536) + b * c + a * d;
        const carryProduct = (b * d + Math.floor(middle / 65536)) >>> 0;
        const productLow = Math.imul(low, 0x4c957f2d) >>> 0;
        const sum = productLow + 0xeecf029f;
        this.low = sum >>> 0;
        this.high = (carryProduct + Math.imul(low, 0x5851f42d) + Math.imul(high, 0x4c957f2d) + 0x280af6fd + (sum >= 4294967296 ? 1 : 0)) >>> 0;
        const shiftedLow = (low >>> 18) | (high << 14);
        const xorLow = shiftedLow ^ low, xorHigh = (high >>> 18) ^ high;
        const output = (xorLow >>> 27) | (xorHigh << 5), rotation = high >>> 27;
        return ((output >>> rotation) | (output << ((-rotation) & 31))) >>> 0;
    }
    bounded(bound) {
        if (!Number.isInteger(bound) || bound < 1 || bound > 4294967296) throw new RangeError('PCG bound requires1..2^32');
        if (bound === 4294967296) return this.next();
        const threshold = ((-bound) >>> 0) % bound;
        for (;;) { const value = this.next(); if (value >= threshold) return value % bound; }
    }
    range(from, to) {
        if (![from,to].every(v => Number.isInteger(v) && v >= -2147483648 && v <= 2147483647)) throw new RangeError('PCG range requires signed32-bit endpoints');
        if (from === to) return from;
        const minimum = Math.min(from,to);
        return minimum + this.bounded(Math.max(from,to) - minimum + 1);
    }
};

Object.defineProperty(root, 'LittleStepsCore', {value: Object.freeze(api), writable: false, configurable: false});
})(globalThis);
