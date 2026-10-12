// Channel capabilities consumed by the game through a small optional port.
const host = typeof wx === 'undefined' ? null : wx;
globalThis.LittleStepsPlatform = {
    haptics: {
        supported: () => !!host && typeof host.vibrateShort === 'function',
        pulse(kind) {
            if (!host) return;
            // Unsupported intensity or device failures are deliberately silent.
            const fail = () => {};
            if (kind === 'long') {
                if (typeof host.vibrateLong === 'function') host.vibrateLong({fail});
            } else if (typeof host.vibrateShort === 'function') {
                host.vibrateShort({type: kind === 'heavy' ? 'heavy' : 'light', fail});
            }
        }
    }
};
