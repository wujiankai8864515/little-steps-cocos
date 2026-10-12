// Channel capabilities consumed by the game through a small optional port.
const host = typeof wx === 'undefined' ? null : wx;
module.exports = function install(config) {
globalThis.LittleStepsPlatform = {
    runtimeDataBundle: 'runtime_data',
    installFramework() {
        const load=globalThis.__wxRequire||require;
        for(const path of config.scripts)load('./'+path);
    },
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
};
