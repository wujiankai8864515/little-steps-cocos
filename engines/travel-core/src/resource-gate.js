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
