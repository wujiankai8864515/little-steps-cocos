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
