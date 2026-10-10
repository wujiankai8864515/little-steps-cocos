// Cocos transport only. Game sound choices, clocks and rewards live in games/.
api.registerAudio = function(cc) {
    return {player(parent, owner, name, notify = () => {}) {
        const node = new cc.Node(name); parent.addChild(node);
        const source = node.addComponent(cc.AudioSource); source.playOnAwake = false;
        let disposed = false, wanted = 'stopped';
        const counts = {playRequests: 0, actualStarts: 0, actualEnds: 0, pauses: 0, stops: 0, lateStartsStopped: 0};
        const snapshot = () => ({name, disposed, wanted, playing: !disposed && source.playing,
            seconds: disposed ? 0 : source.currentTime, volume: disposed ? 0 : source.volume, ...counts});
        const started = () => {
            if (disposed || !owner.active || wanted !== 'playing') {
                source.stop(); counts.lateStartsStopped++; notify('late-start-stopped', snapshot()); return;
            }
            counts.actualStarts++; notify('started', snapshot());
        };
        const ended = () => {if (disposed) return; counts.actualEnds++; if (!source.loop) wanted = 'stopped'; notify('ended', snapshot());};
        node.on(cc.AudioSource.EventType.STARTED, started); node.on(cc.AudioSource.EventType.ENDED, ended);
        const port = {
            assign(clip, loop = false) {if (disposed) return; port.stop(); source.clip = clip; source.loop = loop;},
            play() {if (disposed || !owner.active || !source.clip || wanted === 'playing') return false;
                wanted = 'playing'; counts.playRequests++; source.play(); return true;},
            pause() {if (disposed || wanted !== 'playing') return false;
                wanted = 'paused'; counts.pauses++; source.pause(); return true;},
            stop() {if (disposed) return false; const pending = wanted !== 'stopped' || source.playing;
                wanted = 'stopped'; if (source.clip) source.stop(); if (pending) counts.stops++; return pending;},
            gain(value) {if (!disposed && Number.isFinite(value)) source.volume = Math.max(0, Math.min(1, value));},
            get playing() {return !disposed && source.playing;},
            snapshot,
            dispose() {if (disposed) return; port.stop(); disposed = true;
                node.off(cc.AudioSource.EventType.STARTED, started); node.off(cc.AudioSource.EventType.ENDED, ended);
                source.clip = null; node.destroy(); notify('disposed', snapshot());},
        };
        owner.own(port.dispose); return port;
    }};
};
