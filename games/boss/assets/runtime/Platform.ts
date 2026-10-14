import {AudioClip, AudioSource, Node, resources, sys} from 'cc';
import {GameStore, StoragePort} from '../core/Store';
import {SHARE_LINES} from '../core/Config';
import {wechatApi, friendSurface} from './Wechat';

export const wxApi = wechatApi;
export function storagePort(): StoragePort {
    const wx = wxApi();
    return {
        get: key => { const value = wx?.getStorageSync ? wx.getStorageSync(key) : sys.localStorage.getItem(key); return typeof value === 'string' ? value : value ? JSON.stringify(value) : null; },
        set: (key, value) => { if (wx?.setStorageSync) wx.setStorageSync(key, value); else sys.localStorage.setItem(key, value); },
    };
}
export class Platform {
    adUnitId = ''; leaderboardEndpoint = '';
    get hasAd() { return !!this.adUnitId && !!wxApi()?.createRewardedVideoAd; }
    get hasFriends() { return typeof wxApi()?.getOpenDataContext === 'function'; }
    friendSurface() { return friendSurface(wxApi()); }
    share(level: number) {
        const wx = wxApi(); if (!wx?.shareAppMessage) return false;
        wx.shareAppMessage({title: SHARE_LINES[Math.floor(Math.random() * SHARE_LINES.length)], query: 'level=' + level}); return true;
    }
    publishScore(cleared: number, earned: number) {
        const wx = wxApi();
        if (wx?.setUserCloudStorage) wx.setUserCloudStorage({KVDataList: [
            {key: 'boss-cleared', value: String(cleared)}, {key: 'boss-earned', value: String(earned)},
        ], fail: () => {}});
    }
    rewardAd(): Promise<'completed' | 'cancelled' | 'unavailable'> {
        if (!this.hasAd) return Promise.resolve('unavailable');
        return new Promise(resolve => {
            const ad = wxApi().createRewardedVideoAd({adUnitId: this.adUnitId});
            let finished = false;
            const complete = (result: 'completed' | 'cancelled' | 'unavailable') => {
                if (finished) return; finished = true;
                ad.offClose?.(close); ad.offError?.(error); ad.destroy?.(); resolve(result);
            };
            const close = (res: any) => complete(res?.isEnded === true ? 'completed' : 'cancelled');
            const error = () => complete('unavailable');
            ad.onClose(close); ad.onError(error);
            try { Promise.resolve(ad.show()).catch(() => Promise.resolve(ad.load()).then(() => ad.show()).catch(error)); }
            catch (_) { error(); }
        });
    }
    vibrate(good: boolean, enabled: boolean) { if (enabled) wxApi()?.vibrateShort?.({type: good ? 'light' : 'medium', fail: () => {}}); }
    async onlineRanks(): Promise<any[]> {
        if (!this.leaderboardEndpoint.startsWith('https://')) throw new Error('联网排行榜尚未开放');
        const wx = wxApi();
        let result: any;
        if (wx?.request) result = await new Promise((resolve, reject) => wx.request({url: this.leaderboardEndpoint, timeout: 10000,
            success: (r: any) => r.statusCode === 200 ? resolve(r.data) : reject(new Error('榜单暂时不可用')), fail: reject}));
        else {
            const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
            try { const response = await fetch(this.leaderboardEndpoint, {signal: controller.signal}); if (!response.ok) throw new Error('榜单暂时不可用'); result = await response.json(); }
            finally { clearTimeout(timer); }
        }
        if (!Array.isArray(result?.rows)) throw new Error('榜单数据格式错误');
        return result.rows.slice(0, 20).filter((r: any) => typeof r.name === 'string' && Number.isFinite(r.cleared) && Number.isFinite(r.earned));
    }
}
export class Sound {
    private music: AudioSource; private effect: AudioSource; private clips: Record<string, AudioClip> = {};
    private alive = true; private gesture = false;
    constructor(root: Node, private store: GameStore) {
        const music = new Node('sound-music'); root.addChild(music);
        const effect = new Node('sound-effects'); root.addChild(effect);
        this.music = music.addComponent(AudioSource); this.effect = effect.addComponent(AudioSource);
        this.music.loop = true; this.music.volume = .23;
    }
    async load() {
        await Promise.all(['music', 'click', 'pickup', 'hit', 'fire', 'win', 'lose'].map(name => new Promise<void>(resolve =>
            resources.load('audio/' + name, AudioClip, (error, clip) => { if (this.alive && !error) this.clips[name] = clip; resolve(); }))));
    }
    touch() { this.gesture = true; this.resume(); }
    play(name: string) { if (this.alive && this.store.state.music && this.clips[name]) this.effect.playOneShot(this.clips[name], .6); }
    resume() {
        if (!this.alive || !this.gesture || !this.store.state.music || !this.clips.music) return;
        if (!this.music.clip) this.music.clip = this.clips.music;
        if (!this.music.playing) this.music.play();
    }
    pause() { this.music.pause(); this.effect.stop(); }
    destroy() { this.alive = false; this.music.stop(); this.effect.stop(); }
}
