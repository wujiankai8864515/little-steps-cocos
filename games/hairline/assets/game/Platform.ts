// Platform IDs are supplied by the publisher. No preview ad grants a production reward.
export const PLATFORM = { rewardedAdUnitId: '' };
export class Platform {
    private wx: any = (globalThis as any).wx;
    private ad: any;
    private busy = false;
    private sequence = 0;
    get adsReady() { return !!(PLATFORM.rewardedAdUnitId && this.wx?.createRewardedVideoAd); }
    vibrate(enabled: boolean) { if (enabled)
        this.wx?.vibrateShort?.({ type: 'light' }); }
    async reward(): Promise<string | null> {
        if (!this.adsReady || this.busy)
            return null;
        this.busy = true;
        try {
            this.ad ||= this.wx.createRewardedVideoAd({ adUnitId: PLATFORM.rewardedAdUnitId });
            const ad = this.ad;
            return await new Promise<string | null>(resolve => { let done = false; const finish = (receipt: string | null) => { if (done)
                return; done = true; ad.offClose(close); ad.offError(error); resolve(receipt); }; const close = (r: any) => finish(r?.isEnded === true ? 'wx-completed-' + Date.now() + '-' + (++this.sequence) : null); const error = () => finish(null); ad.onClose(close); ad.onError(error); ad.show().catch(() => ad.load().then(() => ad.show()).catch(error)); });
        }
        catch {
            return null;
        }
        finally {
            this.busy = false;
        }
    }
    async chooseBoss(): Promise<string | null> {
        if (this.wx?.chooseImage)
            return new Promise(resolve => this.wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: (r: any) => { try {
                    const path = this.wx.env.USER_DATA_PATH + '/hairline-boss.png';
                    this.wx.getFileSystemManager().copyFileSync(r.tempFilePaths[0], path);
                    resolve(path);
                }
                catch {
                    resolve(null);
                } }, fail: () => resolve(null) }));
        if (typeof document === 'undefined')
            return null;
        return new Promise(resolve => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.oncancel = () => resolve(null); input.onchange = () => { const file = input.files?.[0]; if (!file || file.size > 2 * 1024 * 1024) {
            resolve(null);
            return;
        } const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => resolve(null); reader.readAsDataURL(file); }; input.click(); });
    }
    dispose() { this.ad?.destroy?.(); this.ad = null; }
}
