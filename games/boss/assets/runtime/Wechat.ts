declare const wx: any;
// Some WeChat script environments expose wx lexically rather than on globalThis.
export function wechatApi(): any { return typeof wx !== 'undefined' ? wx : (globalThis as any).wx; }
export function friendSurface(api: any): {context: any; canvas: any} | null {
    try {
        const context = api?.getOpenDataContext?.();
        const canvas = context?.canvas || api?.getSharedCanvas?.();
        if (!context || !canvas || typeof context.postMessage !== 'function') return null;
        return {context, canvas};
    } catch (_) { return null; }
}
