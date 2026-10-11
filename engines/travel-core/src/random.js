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
