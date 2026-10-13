import { createHash } from 'crypto';
import { deflateSync, inflateSync } from 'zlib';

export interface PngCropRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface PngPixelData {
    width: number;
    height: number;
    rgba: Buffer;
}

interface DecodedPng {
    width: number;
    height: number;
    rgba: Buffer;
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let crcTable: number[] | null = null;

export function cropPngBase64(base64: string, rect: PngCropRect): string | null {
    try {
        const decoded = decodePng(Buffer.from(base64, 'base64'));
        const x = Math.max(0, Math.min(decoded.width - 1, Math.round(rect.x)));
        const y = Math.max(0, Math.min(decoded.height - 1, Math.round(rect.y)));
        const right = Math.max(x + 1, Math.min(decoded.width, Math.round(rect.x + rect.width)));
        const bottom = Math.max(y + 1, Math.min(decoded.height, Math.round(rect.y + rect.height)));
        const w = right - x;
        const h = bottom - y;
        const out = Buffer.alloc(w * h * 4);
        for (let row = 0; row < h; row++) {
            const srcOff = ((y + row) * decoded.width + x) * 4;
            const dstOff = row * w * 4;
            decoded.rgba.copy(out, dstOff, srcOff, srcOff + w * 4);
        }
        return encodePng({ width: w, height: h, rgba: out }).toString('base64');
    } catch {
        return null;
    }
}

export function hashPngPixels(bytes: Buffer): { hash: string; width: number; height: number } | null {
    try {
        const decoded = decodePng(bytes);
        const normalized = Buffer.alloc(decoded.rgba.length);
        for (let i = 0; i < decoded.rgba.length; i += 4) {
            const alpha = decoded.rgba[i + 3];
            if (alpha === 0) {
                normalized[i] = 0;
                normalized[i + 1] = 0;
                normalized[i + 2] = 0;
                normalized[i + 3] = 0;
            } else {
                normalized[i] = decoded.rgba[i];
                normalized[i + 1] = decoded.rgba[i + 1];
                normalized[i + 2] = decoded.rgba[i + 2];
                normalized[i + 3] = alpha;
            }
        }
        const header = Buffer.alloc(8);
        header.writeInt32LE(decoded.width, 0);
        header.writeInt32LE(decoded.height, 4);
        return {
            hash: createHash('md5').update(header).update(normalized).digest('hex'),
            width: decoded.width,
            height: decoded.height,
        };
    } catch {
        return null;
    }
}

export function decodePngPixels(bytes: Buffer): PngPixelData | null {
    try {
        const png = decodePng(bytes);
        return {
            width: png.width,
            height: png.height,
            rgba: png.rgba,
        };
    } catch {
        return null;
    }
}

export function encodePngPixels(png: PngPixelData): Buffer {
    return encodePng(png);
}

export function whitenPngRgbKeepAlpha(bytes: Buffer): Buffer {
    const png = decodePngPixels(bytes);
    if (!png) return bytes;
    let changed = false;
    const rgba = Buffer.from(png.rgba);
    for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i] !== 255 || rgba[i + 1] !== 255 || rgba[i + 2] !== 255) {
            rgba[i] = 255;
            rgba[i + 1] = 255;
            rgba[i + 2] = 255;
            changed = true;
        }
    }
    return changed ? encodePng({ width: png.width, height: png.height, rgba }) : bytes;
}

export function pngPerceptualSignature(bytes: Buffer, size = 16): { sig: Buffer; width: number; height: number } | null {
    const png = decodePngPixels(bytes);
    if (!png || png.width <= 0 || png.height <= 0) return null;
    const sig = Buffer.alloc(size * size * 4);
    const { width, height, rgba } = png;
    for (let by = 0; by < size; by++) {
        let y0 = Math.floor(by * height / size);
        let y1 = Math.floor((by + 1) * height / size);
        if (y1 <= y0) y1 = y0 + 1;
        if (y1 > height) y1 = height;
        for (let bx = 0; bx < size; bx++) {
            let x0 = Math.floor(bx * width / size);
            let x1 = Math.floor((bx + 1) * width / size);
            if (x1 <= x0) x1 = x0 + 1;
            if (x1 > width) x1 = width;

            let rPM = 0, gPM = 0, bPM = 0, a = 0, n = 0;
            for (let y = y0; y < y1; y++) {
                const rowOff = y * width;
                for (let x = x0; x < x1; x++) {
                    const off = (rowOff + x) * 4;
                    const alpha = rgba[off + 3];
                    rPM += rgba[off] * alpha;
                    gPM += rgba[off + 1] * alpha;
                    bPM += rgba[off + 2] * alpha;
                    a += alpha;
                    n++;
                }
            }
            const off = (by * size + bx) * 4;
            if (n > 0) {
                sig[off] = Math.floor(rPM / (255 * n));
                sig[off + 1] = Math.floor(gPM / (255 * n));
                sig[off + 2] = Math.floor(bPM / (255 * n));
                sig[off + 3] = Math.floor(a / n);
            }
        }
    }
    return { sig, width, height };
}

export function perceptualDistance(a: Buffer, b: Buffer): { mean: number; max: number } | null {
    if (!a || !b || a.length !== b.length) return null;
    let sum = 0;
    let max = 0;
    let count = 0;
    for (let i = 0; i < a.length; i += 4) {
        const aa = a[i + 3];
        const ba = b[i + 3];
        if (aa === 0 && ba === 0) continue;
        const dr = Math.abs(a[i] - b[i]);
        const dg = Math.abs(a[i + 1] - b[i + 1]);
        const db = Math.abs(a[i + 2] - b[i + 2]);
        const da = Math.abs(aa - ba);
        const m = Math.max(dr, dg, db, da);
        sum += dr + dg + db + da;
        if (m > max) max = m;
        count++;
    }
    if (count === 0) return null;
    return { mean: sum / (count * 4), max };
}

function decodePng(bytes: Buffer): DecodedPng {
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIG)) throw new Error('not png');
    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    const idats: Buffer[] = [];

    while (offset + 8 <= bytes.length) {
        const len = bytes.readUInt32BE(offset);
        const type = bytes.toString('ascii', offset + 4, offset + 8);
        const dataStart = offset + 8;
        const dataEnd = dataStart + len;
        if (dataEnd + 4 > bytes.length) throw new Error('bad chunk');
        const data = bytes.subarray(dataStart, dataEnd);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
        } else if (type === 'IDAT') {
            idats.push(data);
        } else if (type === 'IEND') {
            break;
        }
        offset = dataEnd + 4;
    }

    if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2) || width <= 0 || height <= 0) {
        throw new Error('unsupported png');
    }

    const channels = colorType === 6 ? 4 : 3;
    const bpp = channels;
    const stride = width * channels;
    const raw = inflateSync(Buffer.concat(idats));
    const pixels = Buffer.alloc(width * height * channels);
    let inOff = 0;
    let prev = Buffer.alloc(stride);

    for (let y = 0; y < height; y++) {
        const filter = raw[inOff++];
        const row = Buffer.alloc(stride);
        for (let i = 0; i < stride; i++) {
            const value = raw[inOff++];
            const left = i >= bpp ? row[i - bpp] : 0;
            const up = prev[i] || 0;
            const upLeft = i >= bpp ? prev[i - bpp] : 0;
            let predictor = 0;
            if (filter === 1) predictor = left;
            else if (filter === 2) predictor = up;
            else if (filter === 3) predictor = Math.floor((left + up) / 2);
            else if (filter === 4) predictor = paeth(left, up, upLeft);
            else if (filter !== 0) throw new Error('bad filter');
            row[i] = (value + predictor) & 255;
        }
        row.copy(pixels, y * stride);
        prev = row;
    }

    if (channels === 4) return { width, height, rgba: pixels };
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) {
        rgba[j] = pixels[i];
        rgba[j + 1] = pixels[i + 1];
        rgba[j + 2] = pixels[i + 2];
        rgba[j + 3] = 255;
    }
    return { width, height, rgba };
}

function encodePng(png: DecodedPng): Buffer {
    const rows: Buffer[] = [];
    for (let y = 0; y < png.height; y++) {
        rows.push(Buffer.from([0]));
        rows.push(png.rgba.subarray(y * png.width * 4, (y + 1) * png.width * 4));
    }
    return Buffer.concat([
        PNG_SIG,
        chunk('IHDR', ihdr(png.width, png.height)),
        chunk('IDAT', deflateSync(Buffer.concat(rows))),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

function ihdr(width: number, height: number): Buffer {
    const b = Buffer.alloc(13);
    b.writeUInt32BE(width, 0);
    b.writeUInt32BE(height, 4);
    b[8] = 8;
    b[9] = 6;
    b[10] = 0;
    b[11] = 0;
    b[12] = 0;
    return b;
}

function chunk(type: string, data: Buffer): Buffer {
    const typeBuf = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
}

function crc32(buf: Buffer): number {
    if (!crcTable) {
        crcTable = [];
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            crcTable[n] = c >>> 0;
        }
    }
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function paeth(a: number, b: number, c: number): number {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
}
