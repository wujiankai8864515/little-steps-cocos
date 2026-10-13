/**
 * @zh figma-importer 埋点上报（fire-and-forget，绝不阻塞/破坏导入）。
 *
 * 主进程跑在 Node 环境，可直接用 node https。埋点服务走 Cloudflare Tunnel 暴露的正式域名
 * telemetry.pixgo.uk（Cloudflare 正式证书），用系统 CA 正常校验，无需自签指纹。
 *
 * 匿名 ID：首次生成随机 uuid，存 Editor.Profile（与身份无关，仅用于去重人数）。
 * 任何失败（网络/构造）一律静默吞掉——埋点绝不能影响导入本身。
 *
 * 事件：cocos_import（成功）/ cocos_import_failed（失败，extra 带 step+脱敏 message）。
 * 两者成对上报才算得出导入成功率——只报成功的话分母永远缺失。
 */
import { request } from 'https';
import { request as httpRequest } from 'http';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { homedir, hostname, userInfo } from 'os';
import { join } from 'path';
import { BUILD_VERSION } from './types';

// 埋点服务（ucloud figma-telemetry，经 Cloudflare Tunnel）：域名 + 443 正式证书。
// 【这是唯一保留的硬编码】"往哪发/发不发/发什么/采样多少"改由运行时远程配置决定
// （GET /config，见下方 REMOTE CONFIG 段）。此前五端全部硬编码上报地址，于是线上那个
// 控制面**一个端都没在读** —— 改 enabled/sampleRate 对现网零效果，换后端要五端各发一次版。
const TELEMETRY_HOST = 'telemetry.pixgo.uk';
const TELEMETRY_PORT = 443;

const ANON_ID_KEY = 'figma-importer.anonId';

// 测试机声明：本机被标记为测试机时，事件标 envKind:'tester'，v2 看板不计入人数。
//
// 两条判据，任一命中即算：
//   ① 环境变量 FIGMA_TELEMETRY_TESTER（命令行启动时方便）
//   ② **机器级标记文件**（与 machineId 同目录的 figma-launchpad-tester）
//
// 【为什么必须有 ② 这条文件判据】只用环境变量在 GUI 应用上不可靠，2026-08-28 实测栽过：
//   · Cocos Creator 是 CocosDashboard 启动的，环境从 Dashboard 继承。Dashboard 昨天
//     就在跑了 ⇒ 今天 launchctl setenv 之后重启 Creator **仍然读不到**（要连
//     Dashboard 一起重启，而没人会想到这一步）。
//   · 且 IS_TESTER 若写成模块级 const，是**加载时求值一次** —— 扩展加载后再设变量
//     也不生效。这两个坑叠起来，"设了 flag 却没生效"完全静默：事件照样上报，
//     只是被算进真机人数，而那正是 flag 要防的事。
// 文件判据没有这些问题：每次上报现读，改完立刻生效、不用重启任何进程。
const ENV_TESTER = !!(process.env.FIGMA_TELEMETRY_TESTER || '').trim();

// ══════════════════════════════════════════════════════════════
//  远程配置（GET /config）
// ══════════════════════════════════════════════════════════════
// 【最重要的不变量】拉不到 ≠ 不上报。配置服务挂掉/断网/坏 JSON 一律回落内置默认
// （enabled=true + 当前域名）继续采集。反过来做会让"配置服务抖一下"变成
// "那段时间数据整段消失"，而 fire-and-forget 没有失败回音，我们永远不会知道。
//
// 【不阻塞导入】首次 track 时懒拉一次，在它返回之前用内置默认判定 —— 没有任何 await
// 挡在导入路径上。Cocos 主进程是长驻的（编辑器开着就一直在），拉一次够用；
// 加 30 分钟软过期，长时间开着编辑器也能拿到新配置。
const CONFIG_TTL_MS = 30 * 60 * 1000;
// 环境变量覆盖：开发期把整条链路指向本机假服务验证（生产不设）。
const CONFIG_BASE = (process.env.FIGMA_TELEMETRY_BASE || `https://${TELEMETRY_HOST}`).replace(/\/+$/, '');

interface RemoteCfg {
    enabled: boolean;
    endpoint: string;
    sampleRate: number;
    events: string[] | null;
    configVersion: number;
}
// 内置默认：必须是"照发"而不是"不发"。events=null 表示不做白名单过滤 ——
// 拿不到清单时替服务端把门关上，等于让配置不可达时数据整段消失（服务端自己还有
// KNOWN_EVENTS 兜底，客户端不需要多这一道）。
//
// 【endpoint 必须跟着 CONFIG_BASE 走，不能写死线上域名】
// 我第一版写成 `https://${TELEMETRY_HOST}/api/track`，于是开发期即使把
// FIGMA_TELEMETRY_BASE 指向本机假服务，**配置拉不到/坏 JSON 的那条回落路径仍然打线上** ——
// 实测真往生产库灌进 4 条 probe 事件（cocos_import extra={"probe":1/"warm"/5}）。
// 这就是"逃生舱绕过了隔离"：主路径被隔离了，兜底路径没有。凡是有 fallback 的地方，
// fallback 也必须落在同一个隔离开关下。
const BUILTIN_CFG: RemoteCfg = {
    enabled: true,
    endpoint: CONFIG_BASE + '/api/track',
    sampleRate: 1,
    events: null,
    configVersion: 0,
};
let _cfg: RemoteCfg | null = null;
let _cfgAt = 0;
let _cfgInflight = false;

/**
 * @zh 校验+归一化远程配置。**纯函数、任何输入都不抛。**
 * 逐字段校验而不是整份 assign：配置来自网络，写残一个字段不该把整份作废。
 * sampleRate 坏值刻意回落 1（宁可多收，不可静默少收 —— 少收是看不见的）。
 */
export function normalizeConfig(raw: any): RemoteCfg {
    const out: RemoteCfg = Object.assign({}, BUILTIN_CFG);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    // enabled 只认真布尔：字符串 "false" 在 JS 里是 truthy，认它=以为关了其实没关。
    if (typeof raw.enabled === 'boolean') out.enabled = raw.enabled;
    if (typeof raw.endpoint === 'string' && raw.endpoint) {
        // 只认 http/https，避免坏值变成没法发的地址。不做域名白名单——
        // 换后端不发版正是目的，信任锚是"这份配置来自我们掌控的域名"。
        if (/^https?:\/\/[^\s]+$/i.test(raw.endpoint)) out.endpoint = raw.endpoint;
    }
    if (typeof raw.sampleRate === 'number' && isFinite(raw.sampleRate)
        && raw.sampleRate >= 0 && raw.sampleRate <= 1) {
        out.sampleRate = raw.sampleRate;
    }
    if (Array.isArray(raw.events)) {
        const evs = raw.events.filter((x: any) => typeof x === 'string' && x);
        out.events = evs.length ? evs : null;      // 空数组当"没下发"，不当"全拦"
    }
    if (typeof raw.configVersion === 'number' && isFinite(raw.configVersion)) {
        out.configVersion = raw.configVersion;
    }
    return out;
}

/** @zh 事件名是否在白名单里（支持 `*` 通配）。清单空 → 一律放行。**纯函数。** */
export function eventAllowed(event: string, patterns: string[] | null): boolean {
    if (!patterns || !patterns.length) return true;
    const ev = String(event || '');
    for (const p of patterns) {
        if (p === '*' || p === ev) return true;
        if (p.indexOf('*') < 0) continue;
        // 只把 * 当通配，其余正则元字符全转义：否则配置里的 `.` 会变成"任意字符"。
        const re = new RegExp('^' + p.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
        if (re.test(ev)) return true;
    }
    return false;
}

/** @zh 这条事件该不该发。`rnd` 可注入，便于确定性地验采样。**纯函数（除读缓存）。** */
export function shouldSend(event: string, cfg?: RemoteCfg | null, rnd?: number): boolean {
    const c = cfg || _cfg || BUILTIN_CFG;
    if (!c.enabled) return false;
    if (!eventAllowed(event, c.events)) return false;
    if (c.sampleRate >= 1) return true;
    if (c.sampleRate <= 0) return false;
    const r = typeof rnd === 'number' ? rnd : Math.random();
    return r < c.sampleRate;
}

/**
 * @zh 后台拉一次远程配置。fire-and-forget：不抛、4s 超时、失败保持原状。
 * 已在拉取中则直接返回（避免连续导入时并发打配置端点）。
 */
function refreshConfig(): void {
    if (_cfgInflight) return;
    if (_cfg && Date.now() - _cfgAt < CONFIG_TTL_MS) return;
    _cfgInflight = true;
    const done = () => { _cfgInflight = false; };
    try {
        const isHttps = CONFIG_BASE.startsWith('https:');
        const noScheme = CONFIG_BASE.replace(/^https?:\/\//, '');
        const slash = noScheme.indexOf('/');
        const hostPort = slash < 0 ? noScheme : noScheme.slice(0, slash);
        const [host, portStr] = hostPort.split(':');
        const req = (isHttps ? request : httpRequest)({
            host,
            port: portStr ? Number(portStr) : (isHttps ? 443 : 80),
            path: (slash < 0 ? '' : noScheme.slice(slash)) + '/config',
            method: 'GET',
            // 【必须带 UA】telemetry.pixgo.uk 走 Cloudflare Tunnel，CF 会拦某些默认 UA 回 403
            // （preflight.py / deploy-check.py 都为此踩过）。不带的后果是"永远拉不到且完全静默"。
            headers: { 'User-Agent': 'figma-cocos-telemetry-config/1.0' },
            timeout: 4000,
        }, (res) => {
            if (res.statusCode !== 200) { res.resume(); done(); return; }
            let body = '';
            res.setEncoding('utf-8');
            res.on('data', (d) => { if (body.length < 65536) body += d; });   // 封顶 64KB
            res.on('end', () => {
                try { _cfg = normalizeConfig(JSON.parse(body)); _cfgAt = Date.now(); } catch { /* 坏 JSON：保持原状 */ }
                done();
            });
            res.on('error', done);
        });
        req.on('error', done);        // 断网/DNS/证书失败：静默
        req.on('timeout', () => { req.destroy(); done(); });
        req.end();
    } catch { done(); }
}


/** @zh 取（或首次生成）匿名稳定 ID；失败返回空串（上报仍继续，只是无去重维度）。 */
async function getAnonId(): Promise<string> {
    try {
        const raw = await Editor.Profile.getConfig('figma-importer', ANON_ID_KEY);
        if (typeof raw === 'string' && raw) return raw;
        const id = randomUUID();
        await Editor.Profile.setConfig('figma-importer', ANON_ID_KEY, id);
        return id;
    } catch {
        return '';
    }
}

// ══════════════════════════════════════════════════════════════
//  机器级 ID（跨端共享）
// ══════════════════════════════════════════════════════════════
// 【为什么要它】anonId 是**每个端各自生成**的：Launchpad 一个、本扩展一个、
// Unity 插件一个、Figma 三端各一个。实测跨端共享数 = 0，于是一个人用 7 个端
// 在看板上就是 7 个"用户"（全库 127 个 anonId / 13 个 IP 前缀，虚高约 10 倍）。
//
// 解法不是改各端的 anonId（那会断裂已有数据，且 Figma 端物理上读不到文件系统），
// 而是**额外**读一个七端共用的机器级文件。它由 Launchpad 创建维护
//（figma-launchpad/app/main.js 的 readOrCreateMachineId）。
//
// ⚠️ 平台路径必须写死，不能用 Electron 的 app.getPath —— 这里是 Cocos 扩展的
// Node 环境，没有 electron app 对象。三处路径与 main.js 的 machineIdFile() 一一对应，
// **改一处必须改两处**（否则读到空 = 归并静默失效，而看板照样能打开）。
//
// 读不到就返回空串（没装 Launchpad、或它还没跑过一次）—— 上报照常，
// 看板把这条归到「未能归并」单列，不猜。
function machineIdFilePath(): string {
    if (process.platform === 'win32') {
        const base = process.env.PROGRAMDATA || process.env.ALLUSERSPROFILE || '';
        return base ? join(base, 'figma-launchpad', 'machine-id') : '';
    }
    if (process.platform === 'darwin') {
        return join(homedir(), 'Library', 'Application Support', 'figma-launchpad-id');
    }
    return join(homedir(), '.figma-launchpad-id');
}

function readMachineId(): string {
    try {
        const f = machineIdFilePath();
        if (!f) return '';
        const v = String(readFileSync(f, 'utf-8') || '').trim();
        // 只认 UUID 形状：防把乱码/半截文件当 ID 用（那会让一台机器每次都是新机器）
        return /^[0-9a-f-]{36}$/i.test(v) ? v : '';
    } catch {
        return '';      // 文件不存在 / 无权限 —— 都是正常情形，不是错误
    }
}

/**
 * @zh 供推送服务的 /ping 应答用。**导出它而不是在 server.ts 里再写一遍路径逻辑**
 * —— 那条路径已经在三处出现（main.js / 本文件 / Unity 的 FigmaTelemetry.cs），
 * 再多一处就更容易漂移；同一个进程里没有理由拷贝第四份。
 */
export function machineIdForPing(): string {
    return readMachineId();
}

/** @zh 测试机标记文件的路径（与 machineId 同目录，同一套平台规则）。 */
function testerFlagFilePath(): string {
    if (process.platform === 'win32') {
        const base = process.env.PROGRAMDATA || process.env.ALLUSERSPROFILE || '';
        return base ? join(base, 'figma-launchpad', 'tester') : '';
    }
    if (process.platform === 'darwin') {
        return join(homedir(), 'Library', 'Application Support', 'figma-launchpad-tester');
    }
    return join(homedir(), '.figma-launchpad-tester');
}

/**
 * @zh 本机是不是测试机。**每次调用都现读**，不缓存 —— 见上方 IS_TESTER 注释里
 * 记的那两个坑（GUI 进程继承不到变量 / 模块级 const 加载时就固化）。
 * 读文件的开销对 fire-and-forget 的埋点完全无所谓。
 */
function isTesterMachine(): boolean {
    if (ENV_TESTER) return true;
    try {
        const f = testerFlagFilePath();
        return !!f && existsSync(f);
    } catch {
        return false;   // 读不了就当不是测试机 —— 宁可多收数据，不可静默少收
    }
}

/**
 * @zh 本机是不是测试机（供 /ping 应答带给 Figma 插件端）。
 *
 * 【为什么 Figma 端要靠我们告诉它】它跑在浏览器沙箱里，**既读不到环境变量也读不到
 * 文件系统** —— 于是标记为测试机的开发机，Figma 端的事件仍会被算进真机人数。
 * 我自己做真机验证时就会污染（2026-08-27 已污染过生产库：unity 2.0.1 ×11 条）。
 * 推送服务跑在 Node 里读得到，顺着已有的 /ping 通道回传是最省的做法。
 */
export function isTesterForPing(): boolean {
    return isTesterMachine();
}

/** @zh 机器名 + 系统用户名。用户拍板要「能主动认出每台机器是谁」，明文上报。 */
function machineLabel(): Record<string, string> {
    const out: Record<string, string> = {};
    try { const h = String(hostname() || '').trim(); if (h) out.machineName = h.slice(0, 64); } catch { /* 取不到就不带 */ }
    try { const u = String((userInfo() || ({} as any)).username || '').trim(); if (u) out.osUser = u.slice(0, 64); } catch { /* 同上 */ }
    return out;
}


/**
 * @zh 错误信息脱敏 + 截断（与 Launchpad main.js sanitizeErrMessage 等效）。
 * 报错里常含绝对路径（带用户名，属个人信息），抹掉家目录段后再上报；超长截断到 500 字。
 */
export function sanitizeErrMessage(msg: any): string {
    let s = String((msg && msg.message) || msg || '');
    s = s.replace(/\/Users\/[^/\s]+/g, '/Users/*')          // mac
         .replace(/\/home\/[^/\s]+/g, '/home/*')            // linux
         .replace(/([A-Za-z]:\\Users\\)[^\\\s]+/g, '$1*');  // windows
    return s.length > 500 ? s.slice(0, 500) + '…' : s;
}

/**
 * @zh 上报一个导入事件。fire-and-forget：不 await 网络、失败全静默。
 * extra 里可带 durationMs 等附加维度。
 */
export async function trackImport(extra?: Record<string, any>): Promise<void> {
    return track('cocos_import', extra);
}

/** @zh 同一个 error 对象只上报一次的标记键（不可枚举，不污染 JSON.stringify）。 */
const REPORTED_KEY = '__figmaTelemetryReported';

/**
 * @zh 上报一次导入失败（cocos_import_failed）。step 标明失败在哪一步，message 已脱敏+截断。
 *
 * 同一个 error 对象只上报一次：buildFromData 上报后会 rethrow，外层 catch 再调本函数时直接跳过，
 * 避免一次失败产生两条事件、把成功率算歪。
 */
export function trackImportFailed(step: string, err: any, extra?: Record<string, any>): void {
    try {
        if (err && typeof err === 'object') {
            if ((err as any)[REPORTED_KEY]) return;
            try { Object.defineProperty(err, REPORTED_KEY, { value: true, enumerable: false }); } catch { /* 冻结对象等：忽略 */ }
        }
        // 显式 .catch：本函数是同步的，不接住的话 track 万一 reject 就成 unhandledRejection。
        track('cocos_import_failed', Object.assign({
            step,
            message: sanitizeErrMessage(err),
        }, extra || {})).catch(() => { /* 静默 */ });
    } catch { /* 埋点绝不影响导入的错误处理本身 */ }
}

/**
 * @zh 仅供测试：清掉配置缓存，让下一次 track 重新拉。
 * 【为什么必须有】没有它就无法在一个进程里验「配置变了之后行为跟着变」——
 * 30 分钟 TTL 会把上一个场景的配置一直粘住，于是"enabled 从 false 改回 true"
 * 这条根本测不出来（我写测试时正是先漏了它、C/D 两组假失败）。生产代码不调。
 */
export function __resetConfigForTest(): void {
    _cfg = null; _cfgAt = 0; _cfgInflight = false;
}

/** @zh 仅供测试：读当前生效配置（判断到底采纳了哪一份）。生产代码不调。 */
export function __currentConfigForTest(): RemoteCfg {
    return _cfg || BUILTIN_CFG;
}

/** @zh 实际发送：拼公共维度 + POST 到（可下发的）上报地址，全程静默。 */
async function track(event: string, extra?: Record<string, any>): Promise<void> {
    // 懒启动一次配置拉取：不 await，本次判定用已有配置/内置默认，绝不挡住导入。
    try { refreshConfig(); } catch { /* 静默 */ }
    // 远程配置闸门：enabled:false / events 白名单 / sampleRate 三项在这里真正生效。
    try { if (!shouldSend(event)) return; } catch { /* 判定异常一律放行，宁可多收 */ }
    let anonId = '';
    try { anonId = await getAnonId(); } catch { /* 忽略 */ }
    try {
        // version 收敛成纯版本号（BUILD_VERSION 形如 "v1.1.5 (2026-... 描述)"）；
        // 完整构建串放 build 字段，避免"按版本"聚合被构建描述打散。
        const verMatch = BUILD_VERSION.match(/\d+\.\d+\.\d+/);
        const payload = Buffer.from(JSON.stringify(Object.assign({
            event,
            plugin: 'cocos',
            version: verMatch ? verMatch[0] : BUILD_VERSION,
            build: BUILD_VERSION,
            platform: process.platform === 'darwin' ? 'mac' : (process.platform === 'win32' ? 'win' : process.platform),
            anonId,
            // 与 anonId **并存**：machineId 是七端共用的机器标识（读不到就空串），
            // 看板按 machineId 优先归并、拿不到时退回 anonId 单列。
            machineId: readMachineId(),
            ...(isTesterMachine() ? { envKind: 'tester' } : {}),
            ...machineLabel(),
        }, extra || {})));

        // 上报地址由远程配置下发（以后换后端不用发版）；拉不到配置时用内置默认域名。
        const target = (_cfg && _cfg.endpoint) || BUILTIN_CFG.endpoint;
        const isHttps = target.startsWith('https:');
        const noScheme = target.replace(/^https?:\/\//, '');
        const slash = noScheme.indexOf('/');
        const hostPort = slash < 0 ? noScheme : noScheme.slice(0, slash);
        const [host, portStr] = hostPort.split(':');

        const req = (isHttps ? request : httpRequest)({
            host,
            port: portStr ? Number(portStr) : (isHttps ? TELEMETRY_PORT : 80),
            path: slash < 0 ? '/api/track' : noScheme.slice(slash),
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length },
            timeout: 4000,
        }, (res) => { res.resume(); }); // 丢弃响应体

        req.on('error', () => {});           // 静默：埋点失败绝不影响导入
        req.on('timeout', () => req.destroy());
        req.write(payload);
        req.end();
    } catch { /* 连构造都失败也静默 */ }
}
