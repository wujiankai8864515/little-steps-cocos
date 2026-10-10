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
