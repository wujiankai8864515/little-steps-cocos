// Lossless eight-bit coverage planes. No browser, Node or platform globals.
// Bounded inflation and zlib checksums reject corrupt hit/shadow data.
const alphaBase64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function alphaBase64(text, maxBytes) {
    if (typeof text !== 'string' || !text.length || text.length % 4 || text.length > Math.ceil(maxBytes / 3) * 4) throw new Error('Invalid alpha base64 length');
    const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
    const bytes = new Uint8Array(text.length / 4 * 3 - padding);
    let output = 0;
    for (let i = 0; i < text.length; i += 4) {
        let word = 0;
        for (let j = 0; j < 4; j++) {
            const char = text[i + j], at = i + j;
            const value = char === '=' && at >= text.length - padding ? 0 : alphaBase64Alphabet.indexOf(char);
            if (value < 0) throw new Error('Invalid alpha base64 character');
            word = word * 64 + value;
        }
        if (output < bytes.length) bytes[output++] = word >>> 16;
        if (output < bytes.length) bytes[output++] = word >>> 8;
        if (output < bytes.length) bytes[output++] = word;
    }
    return bytes;
}
function decodeAlphaMasks(payload, maxPixels = 64 * 1024 * 1024) {
    if (!payload || payload.schema !== 2 || payload.encoding !== 'zlib-u8-base64' || !payload.masks || typeof payload.masks !== 'object' || Array.isArray(payload.masks)) throw new Error('Unsupported alpha mask format');
    if (!Number.isSafeInteger(maxPixels) || maxPixels <= 0 || maxPixels > 64 * 1024 * 1024) throw new Error('Invalid alpha allocation limit');
    const entries = Object.entries(payload.masks), result = new Map();
    if (entries.length > 128) throw new Error('Too many alpha masks');
    let total = 0;
    for (const [key, mask] of entries) {
        if (!mask || !Array.isArray(mask.size) || mask.size.length !== 2 || !mask.size.every(n => Number.isSafeInteger(n) && n > 0) || !Array.isArray(mask.origin) || mask.origin.length !== 2 || !mask.origin.every(Number.isSafeInteger)) throw new Error('Invalid alpha dimensions');
        const count = mask.size[0] * mask.size[1];
        if (!Number.isSafeInteger(count) || (total += count) > maxPixels) throw new Error('Alpha allocation exceeds limit');
        const compressed = alphaBase64(mask.data, count * 2 + 1024);
        const data = new Uint8Array(count), inflater = new alphaInflate.Inflate({chunkSize: 32768, windowBits: 15});
        let written = 0;
        inflater.onData = chunk => {
            if (written + chunk.length > count) throw new Error('Alpha output exceeds dimensions');
            data.set(chunk, written); written += chunk.length;
        };
        inflater.push(compressed, true);
        if (inflater.err || !inflater.ended || written !== count || inflater.strm.avail_in !== 0) throw new Error('Corrupt or truncated alpha data');
        result.set(key, {size: mask.size.slice(), origin: mask.origin.slice(), data});
    }
    return result;
}
function alphaSample(mask, x, y) {
    const px = x - mask.origin[0], py = y - mask.origin[1];
    // This also rejects NaN/infinity. Accepted coordinates are nonnegative and
    // below the validated 64 Mi-pixel limit, so truncation is exact floor.
    if (!(px >= 0 && py >= 0 && px < mask.size[0] && py < mask.size[1])) return 0;
    return mask.data[(py | 0) * mask.size[0] + (px | 0)] / 255;
}
function alphaBounds(mask, rect) {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    const startX = Math.max(Math.floor(rect[0]), mask.origin[0]), endX = Math.min(Math.ceil(rect[0] + rect[2]), mask.origin[0] + mask.size[0]);
    for (let y = Math.max(Math.floor(rect[1]), mask.origin[1]); y < Math.min(Math.ceil(rect[1] + rect[3]), mask.origin[1] + mask.size[1]); y++) {
        const row = (y - mask.origin[1]) * mask.size[0];
        for (let x = startX; x < endX; x++) if (mask.data[row + x - mask.origin[0]] > 0) {
            left = Math.min(left, Math.max(x, rect[0])); right = Math.max(right, Math.min(x + 1, rect[0] + rect[2])); top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
        }
    }
    return Number.isFinite(left) ? [left, top, right - left, bottom - top] : [rect[0], rect[1], 0, 0];
}
api.decodeAlphaMasks = decodeAlphaMasks;
api.alphaSample = alphaSample;
api.alphaBounds = alphaBounds;
