// Runs before SystemJS, engine adapters and application modules.
(function () {
    var files = jsb.fileUtils;
    var identity = JSON.parse(files.getStringFromFile('avg-plus-native.json'));
    var writable = files.getWritablePath();
    var cache = writable + 'avg-plus-hot-update/';
    var marker = writable + 'avg-plus-hot-update-state.json';
    var state;
    try { state = JSON.parse(files.getStringFromFile(marker)); } catch (_) { return; }
    if (!state || state.compatibility !== identity.nativeCompatibility) {
        files.removeDirectory(cache);
        files.removeFile(marker);
        return;
    }
    function versionParts(value) {
        return typeof value === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(value) ? value.split('.').map(Number) : null;
    }
    function newerThanPackaged(value) {
        var cached = versionParts(value), packaged = versionParts(identity.version);
        if (!cached || !packaged) return false;
        for (var index = 0; index < 4; index++) {
            if (cached[index] !== packaged[index]) return cached[index] > packaged[index];
        }
        return false;
    }
    if (Array.isArray(state.paths) && state.paths.length && !newerThanPackaged(state.version)) {
        // An APK upgrade already includes this patch or newer resources. Old cache cannot
        // hide its new game code. Only this channel's cache/marker is removed; saves remain.
        files.removeDirectory(cache);
        if (newerThanPackaged(state.blockedVersion)) {
            // A rejected newer delta must stay blocked when recovery returns to APK content.
            files.writeStringToFile(JSON.stringify({compatibility: identity.nativeCompatibility,
                version: identity.version, blockedVersion: state.blockedVersion,
                paths: [], probePending: false, probeAttempted: false}), marker);
        } else files.removeFile(marker);
        files.setSearchPaths(files.getSearchPaths().filter(function (path) { return path !== cache; }));
        return;
    }
    if (state.probePending && state.probeAttempted) {
        // The previous patched boot never reached a successfully loaded local catalog.
        files.removeDirectory(cache);
        files.writeStringToFile(JSON.stringify({
            compatibility: identity.nativeCompatibility,
            blockedVersion: state.version,
            paths: [], probePending: false
        }), marker);
        return;
    }
    var paths = Array.isArray(state.paths) ? state.paths.filter(function (path) {
        return typeof path === 'string' && path === cache;
    }) : [];
    if (paths.length && files.isFileExist(cache + 'project.manifest')) {
        if (state.probePending) {
            state.probeAttempted = true;
            files.writeStringToFile(JSON.stringify(state), marker);
        }
        var current = files.getSearchPaths().filter(function (path) { return path !== cache; });
        files.setSearchPaths(paths.concat(current));
    }
})();
