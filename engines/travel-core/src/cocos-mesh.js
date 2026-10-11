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
