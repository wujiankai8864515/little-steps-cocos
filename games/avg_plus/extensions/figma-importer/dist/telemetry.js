"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeConfig = normalizeConfig;
exports.eventAllowed = eventAllowed;
exports.shouldSend = shouldSend;
exports.machineIdForPing = machineIdForPing;
exports.isTesterForPing = isTesterForPing;
exports.sanitizeErrMessage = sanitizeErrMessage;
exports.trackImport = trackImport;
exports.trackImportFailed = trackImportFailed;
exports.__resetConfigForTest = __resetConfigForTest;
exports.__currentConfigForTest = __currentConfigForTest;
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
const https_1 = require("https");
const http_1 = require("http");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const types_1 = require("./types");
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
const BUILTIN_CFG = {
    enabled: true,
    endpoint: CONFIG_BASE + '/api/track',
    sampleRate: 1,
    events: null,
    configVersion: 0,
};
let _cfg = null;
let _cfgAt = 0;
let _cfgInflight = false;
/**
 * @zh 校验+归一化远程配置。**纯函数、任何输入都不抛。**
 * 逐字段校验而不是整份 assign：配置来自网络，写残一个字段不该把整份作废。
 * sampleRate 坏值刻意回落 1（宁可多收，不可静默少收 —— 少收是看不见的）。
 */
function normalizeConfig(raw) {
    const out = Object.assign({}, BUILTIN_CFG);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return out;
    // enabled 只认真布尔：字符串 "false" 在 JS 里是 truthy，认它=以为关了其实没关。
    if (typeof raw.enabled === 'boolean')
        out.enabled = raw.enabled;
    if (typeof raw.endpoint === 'string' && raw.endpoint) {
        // 只认 http/https，避免坏值变成没法发的地址。不做域名白名单——
        // 换后端不发版正是目的，信任锚是"这份配置来自我们掌控的域名"。
        if (/^https?:\/\/[^\s]+$/i.test(raw.endpoint))
            out.endpoint = raw.endpoint;
    }
    if (typeof raw.sampleRate === 'number' && isFinite(raw.sampleRate)
        && raw.sampleRate >= 0 && raw.sampleRate <= 1) {
        out.sampleRate = raw.sampleRate;
    }
    if (Array.isArray(raw.events)) {
        const evs = raw.events.filter((x) => typeof x === 'string' && x);
        out.events = evs.length ? evs : null; // 空数组当"没下发"，不当"全拦"
    }
    if (typeof raw.configVersion === 'number' && isFinite(raw.configVersion)) {
        out.configVersion = raw.configVersion;
    }
    return out;
}
/** @zh 事件名是否在白名单里（支持 `*` 通配）。清单空 → 一律放行。**纯函数。** */
function eventAllowed(event, patterns) {
    if (!patterns || !patterns.length)
        return true;
    const ev = String(event || '');
    for (const p of patterns) {
        if (p === '*' || p === ev)
            return true;
        if (p.indexOf('*') < 0)
            continue;
        // 只把 * 当通配，其余正则元字符全转义：否则配置里的 `.` 会变成"任意字符"。
        const re = new RegExp('^' + p.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
        if (re.test(ev))
            return true;
    }
    return false;
}
/** @zh 这条事件该不该发。`rnd` 可注入，便于确定性地验采样。**纯函数（除读缓存）。** */
function shouldSend(event, cfg, rnd) {
    const c = cfg || _cfg || BUILTIN_CFG;
    if (!c.enabled)
        return false;
    if (!eventAllowed(event, c.events))
        return false;
    if (c.sampleRate >= 1)
        return true;
    if (c.sampleRate <= 0)
        return false;
    const r = typeof rnd === 'number' ? rnd : Math.random();
    return r < c.sampleRate;
}
/**
 * @zh 后台拉一次远程配置。fire-and-forget：不抛、4s 超时、失败保持原状。
 * 已在拉取中则直接返回（避免连续导入时并发打配置端点）。
 */
function refreshConfig() {
    if (_cfgInflight)
        return;
    if (_cfg && Date.now() - _cfgAt < CONFIG_TTL_MS)
        return;
    _cfgInflight = true;
    const done = () => { _cfgInflight = false; };
    try {
        const isHttps = CONFIG_BASE.startsWith('https:');
        const noScheme = CONFIG_BASE.replace(/^https?:\/\//, '');
        const slash = noScheme.indexOf('/');
        const hostPort = slash < 0 ? noScheme : noScheme.slice(0, slash);
        const [host, portStr] = hostPort.split(':');
        const req = (isHttps ? https_1.request : http_1.request)({
            host,
            port: portStr ? Number(portStr) : (isHttps ? 443 : 80),
            path: (slash < 0 ? '' : noScheme.slice(slash)) + '/config',
            method: 'GET',
            // 【必须带 UA】telemetry.pixgo.uk 走 Cloudflare Tunnel，CF 会拦某些默认 UA 回 403
            // （preflight.py / deploy-check.py 都为此踩过）。不带的后果是"永远拉不到且完全静默"。
            headers: { 'User-Agent': 'figma-cocos-telemetry-config/1.0' },
            timeout: 4000,
        }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                done();
                return;
            }
            let body = '';
            res.setEncoding('utf-8');
            res.on('data', (d) => { if (body.length < 65536)
                body += d; }); // 封顶 64KB
            res.on('end', () => {
                try {
                    _cfg = normalizeConfig(JSON.parse(body));
                    _cfgAt = Date.now();
                }
                catch ( /* 坏 JSON：保持原状 */_a) { /* 坏 JSON：保持原状 */ }
                done();
            });
            res.on('error', done);
        });
        req.on('error', done); // 断网/DNS/证书失败：静默
        req.on('timeout', () => { req.destroy(); done(); });
        req.end();
    }
    catch (_a) {
        done();
    }
}
/** @zh 取（或首次生成）匿名稳定 ID；失败返回空串（上报仍继续，只是无去重维度）。 */
async function getAnonId() {
    try {
        const raw = await Editor.Profile.getConfig('figma-importer', ANON_ID_KEY);
        if (typeof raw === 'string' && raw)
            return raw;
        const id = (0, crypto_1.randomUUID)();
        await Editor.Profile.setConfig('figma-importer', ANON_ID_KEY, id);
        return id;
    }
    catch (_a) {
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
function machineIdFilePath() {
    if (process.platform === 'win32') {
        const base = process.env.PROGRAMDATA || process.env.ALLUSERSPROFILE || '';
        return base ? (0, path_1.join)(base, 'figma-launchpad', 'machine-id') : '';
    }
    if (process.platform === 'darwin') {
        return (0, path_1.join)((0, os_1.homedir)(), 'Library', 'Application Support', 'figma-launchpad-id');
    }
    return (0, path_1.join)((0, os_1.homedir)(), '.figma-launchpad-id');
}
function readMachineId() {
    try {
        const f = machineIdFilePath();
        if (!f)
            return '';
        const v = String((0, fs_1.readFileSync)(f, 'utf-8') || '').trim();
        // 只认 UUID 形状：防把乱码/半截文件当 ID 用（那会让一台机器每次都是新机器）
        return /^[0-9a-f-]{36}$/i.test(v) ? v : '';
    }
    catch (_a) {
        return ''; // 文件不存在 / 无权限 —— 都是正常情形，不是错误
    }
}
/**
 * @zh 供推送服务的 /ping 应答用。**导出它而不是在 server.ts 里再写一遍路径逻辑**
 * —— 那条路径已经在三处出现（main.js / 本文件 / Unity 的 FigmaTelemetry.cs），
 * 再多一处就更容易漂移；同一个进程里没有理由拷贝第四份。
 */
function machineIdForPing() {
    return readMachineId();
}
/** @zh 测试机标记文件的路径（与 machineId 同目录，同一套平台规则）。 */
function testerFlagFilePath() {
    if (process.platform === 'win32') {
        const base = process.env.PROGRAMDATA || process.env.ALLUSERSPROFILE || '';
        return base ? (0, path_1.join)(base, 'figma-launchpad', 'tester') : '';
    }
    if (process.platform === 'darwin') {
        return (0, path_1.join)((0, os_1.homedir)(), 'Library', 'Application Support', 'figma-launchpad-tester');
    }
    return (0, path_1.join)((0, os_1.homedir)(), '.figma-launchpad-tester');
}
/**
 * @zh 本机是不是测试机。**每次调用都现读**，不缓存 —— 见上方 IS_TESTER 注释里
 * 记的那两个坑（GUI 进程继承不到变量 / 模块级 const 加载时就固化）。
 * 读文件的开销对 fire-and-forget 的埋点完全无所谓。
 */
function isTesterMachine() {
    if (ENV_TESTER)
        return true;
    try {
        const f = testerFlagFilePath();
        return !!f && (0, fs_1.existsSync)(f);
    }
    catch (_a) {
        return false; // 读不了就当不是测试机 —— 宁可多收数据，不可静默少收
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
function isTesterForPing() {
    return isTesterMachine();
}
/** @zh 机器名 + 系统用户名。用户拍板要「能主动认出每台机器是谁」，明文上报。 */
function machineLabel() {
    const out = {};
    try {
        const h = String((0, os_1.hostname)() || '').trim();
        if (h)
            out.machineName = h.slice(0, 64);
    }
    catch ( /* 取不到就不带 */_a) { /* 取不到就不带 */ }
    try {
        const u = String(((0, os_1.userInfo)() || {}).username || '').trim();
        if (u)
            out.osUser = u.slice(0, 64);
    }
    catch ( /* 同上 */_b) { /* 同上 */ }
    return out;
}
/**
 * @zh 错误信息脱敏 + 截断（与 Launchpad main.js sanitizeErrMessage 等效）。
 * 报错里常含绝对路径（带用户名，属个人信息），抹掉家目录段后再上报；超长截断到 500 字。
 */
function sanitizeErrMessage(msg) {
    let s = String((msg && msg.message) || msg || '');
    s = s.replace(/\/Users\/[^/\s]+/g, '/Users/*') // mac
        .replace(/\/home\/[^/\s]+/g, '/home/*') // linux
        .replace(/([A-Za-z]:\\Users\\)[^\\\s]+/g, '$1*'); // windows
    return s.length > 500 ? s.slice(0, 500) + '…' : s;
}
/**
 * @zh 上报一个导入事件。fire-and-forget：不 await 网络、失败全静默。
 * extra 里可带 durationMs 等附加维度。
 */
async function trackImport(extra) {
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
function trackImportFailed(step, err, extra) {
    try {
        if (err && typeof err === 'object') {
            if (err[REPORTED_KEY])
                return;
            try {
                Object.defineProperty(err, REPORTED_KEY, { value: true, enumerable: false });
            }
            catch ( /* 冻结对象等：忽略 */_a) { /* 冻结对象等：忽略 */ }
        }
        // 显式 .catch：本函数是同步的，不接住的话 track 万一 reject 就成 unhandledRejection。
        track('cocos_import_failed', Object.assign({
            step,
            message: sanitizeErrMessage(err),
        }, extra || {})).catch(() => { });
    }
    catch ( /* 埋点绝不影响导入的错误处理本身 */_b) { /* 埋点绝不影响导入的错误处理本身 */ }
}
/**
 * @zh 仅供测试：清掉配置缓存，让下一次 track 重新拉。
 * 【为什么必须有】没有它就无法在一个进程里验「配置变了之后行为跟着变」——
 * 30 分钟 TTL 会把上一个场景的配置一直粘住，于是"enabled 从 false 改回 true"
 * 这条根本测不出来（我写测试时正是先漏了它、C/D 两组假失败）。生产代码不调。
 */
function __resetConfigForTest() {
    _cfg = null;
    _cfgAt = 0;
    _cfgInflight = false;
}
/** @zh 仅供测试：读当前生效配置（判断到底采纳了哪一份）。生产代码不调。 */
function __currentConfigForTest() {
    return _cfg || BUILTIN_CFG;
}
/** @zh 实际发送：拼公共维度 + POST 到（可下发的）上报地址，全程静默。 */
async function track(event, extra) {
    // 懒启动一次配置拉取：不 await，本次判定用已有配置/内置默认，绝不挡住导入。
    try {
        refreshConfig();
    }
    catch ( /* 静默 */_a) { /* 静默 */ }
    // 远程配置闸门：enabled:false / events 白名单 / sampleRate 三项在这里真正生效。
    try {
        if (!shouldSend(event))
            return;
    }
    catch ( /* 判定异常一律放行，宁可多收 */_b) { /* 判定异常一律放行，宁可多收 */ }
    let anonId = '';
    try {
        anonId = await getAnonId();
    }
    catch ( /* 忽略 */_c) { /* 忽略 */ }
    try {
        // version 收敛成纯版本号（BUILD_VERSION 形如 "v1.1.5 (2026-... 描述)"）；
        // 完整构建串放 build 字段，避免"按版本"聚合被构建描述打散。
        const verMatch = types_1.BUILD_VERSION.match(/\d+\.\d+\.\d+/);
        const payload = Buffer.from(JSON.stringify(Object.assign(Object.assign(Object.assign({ event, plugin: 'cocos', version: verMatch ? verMatch[0] : types_1.BUILD_VERSION, build: types_1.BUILD_VERSION, platform: process.platform === 'darwin' ? 'mac' : (process.platform === 'win32' ? 'win' : process.platform), anonId, 
            // 与 anonId **并存**：machineId 是七端共用的机器标识（读不到就空串），
            // 看板按 machineId 优先归并、拿不到时退回 anonId 单列。
            machineId: readMachineId() }, (isTesterMachine() ? { envKind: 'tester' } : {})), machineLabel()), extra || {})));
        // 上报地址由远程配置下发（以后换后端不用发版）；拉不到配置时用内置默认域名。
        const target = (_cfg && _cfg.endpoint) || BUILTIN_CFG.endpoint;
        const isHttps = target.startsWith('https:');
        const noScheme = target.replace(/^https?:\/\//, '');
        const slash = noScheme.indexOf('/');
        const hostPort = slash < 0 ? noScheme : noScheme.slice(0, slash);
        const [host, portStr] = hostPort.split(':');
        const req = (isHttps ? https_1.request : http_1.request)({
            host,
            port: portStr ? Number(portStr) : (isHttps ? TELEMETRY_PORT : 80),
            path: slash < 0 ? '/api/track' : noScheme.slice(slash),
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length },
            timeout: 4000,
        }, (res) => { res.resume(); }); // 丢弃响应体
        req.on('error', () => { }); // 静默：埋点失败绝不影响导入
        req.on('timeout', () => req.destroy());
        req.write(payload);
        req.end();
    }
    catch ( /* 连构造都失败也静默 */_d) { /* 连构造都失败也静默 */ }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVsZW1ldHJ5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc291cmNlL3RlbGVtZXRyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQTRGQSwwQ0FzQkM7QUFHRCxvQ0FXQztBQUdELGdDQVFDO0FBc0dELDRDQUVDO0FBcUNELDBDQUVDO0FBZUQsZ0RBTUM7QUFNRCxrQ0FFQztBQVdELDhDQVlDO0FBUUQsb0RBRUM7QUFHRCx3REFFQztBQTdWRDs7Ozs7Ozs7Ozs7R0FXRztBQUNILGlDQUFnQztBQUNoQywrQkFBOEM7QUFDOUMsbUNBQW9DO0FBQ3BDLDJCQUE4QztBQUM5QywyQkFBaUQ7QUFDakQsK0JBQTRCO0FBQzVCLG1DQUF3QztBQUV4QyxrRUFBa0U7QUFDbEUsNENBQTRDO0FBQzVDLHlEQUF5RDtBQUN6RCw2REFBNkQ7QUFDN0QsTUFBTSxjQUFjLEdBQUcsb0JBQW9CLENBQUM7QUFDNUMsTUFBTSxjQUFjLEdBQUcsR0FBRyxDQUFDO0FBRTNCLE1BQU0sV0FBVyxHQUFHLHVCQUF1QixDQUFDO0FBRTVDLG9EQUFvRDtBQUNwRCxFQUFFO0FBQ0YsZUFBZTtBQUNmLDRDQUE0QztBQUM1QywyREFBMkQ7QUFDM0QsRUFBRTtBQUNGLHVEQUF1RDtBQUN2RCx1RUFBdUU7QUFDdkUsMkRBQTJEO0FBQzNELGlDQUFpQztBQUNqQyx5REFBeUQ7QUFDekQsOENBQThDO0FBQzlDLGdDQUFnQztBQUNoQyxxQ0FBcUM7QUFDckMsTUFBTSxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUV2RSxpRUFBaUU7QUFDakUscUJBQXFCO0FBQ3JCLGlFQUFpRTtBQUNqRSwrQ0FBK0M7QUFDL0MsOENBQThDO0FBQzlDLGtEQUFrRDtBQUNsRCxFQUFFO0FBQ0Ysb0RBQW9EO0FBQ3BELDBDQUEwQztBQUMxQyw4QkFBOEI7QUFDOUIsTUFBTSxhQUFh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uIrmiqXvvIhmaXJlLWFuZC1mb3JnZXTvvIznu53kuI3pmLvloZ4v56C05Z2P5a+85YWl77yJ44CCXG4gKlxuICog5Li76L+b56iL6LeR5ZyoIE5vZGUg546v5aKD77yM5Y+v55u05o6l55SoIG5vZGUgaHR0cHPjgILln4vngrnmnI3liqHotbAgQ2xvdWRmbGFyZSBUdW5uZWwg5pq06Zyy55qE5q2j5byP5Z+f5ZCNXG4gKiB0ZWxlbWV0cnkucGl4Z28udWvvvIhDbG91ZGZsYXJlIOato+W8j+ivgeS5pu+8ie+8jOeUqOezu+e7nyBDQSDmraPluLjmoKHpqozvvIzml6DpnIDoh6rnrb7mjIfnurnjgIJcbiAqXG4gKiDljL/lkI0gSUTvvJrpppbmrKHnlJ/miJDpmo/mnLogdXVpZO+8jOWtmCBFZGl0b3IuUHJvZmlsZe+8iOS4jui6q+S7veaXoOWFs++8jOS7heeUqOS6juWOu+mHjeS6uuaVsO+8ieOAglxuICog5Lu75L2V5aSx6LSl77yI572R57ucL+aehOmAoO+8ieS4gOW+i+mdmem7mOWQnuaOieKAlOKAlOWfi+eCuee7neS4jeiDveW9seWTjeWvvOWFpeacrOi6q+OAglxuICpcbiAqIOS6i+S7tu+8mmNvY29zX2ltcG9ydO+8iOaIkOWKn++8iS8gY29jb3NfaW1wb3J0X2ZhaWxlZO+8iOWksei0pe+8jGV4dHJhIOW4piBzdGVwK+iEseaVjyBtZXNzYWdl77yJ44CCXG4gKiDkuKTogIXmiJDlr7nkuIrmiqXmiY3nrpflvpflh7rlr7zlhaXmiJDlip/njofigJTigJTlj6rmiqXmiJDlip/nmoTor53liIbmr43msLjov5znvLrlpLHjgIJcbiAqL1xuaW1wb3J0IHsgcmVxdWVzdCB9IGZyb20gJ2h0dHBzJztcbmltcG9ydCB7IHJlcXVlc3QgYXMgaHR0cFJlcXVlc3QgfSBmcm9tICdodHRwJztcbmltcG9ydCB7IHJhbmRvbVVVSUQgfSBmcm9tICdjcnlwdG8nO1xuaW1wb3J0IHsgZXhpc3RzU3luYywgcmVhZEZpbGVTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgaG9tZWRpciwgaG9zdG5hbWUsIHVzZXJJbmZvIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgQlVJTERfVkVSU0lPTiB9IGZyb20gJy4vdHlwZXMnO1xuXG4vLyDln4vngrnmnI3liqHvvIh1Y2xvdWQgZmlnbWEtdGVsZW1ldHJ577yM57uPIENsb3VkZmxhcmUgVHVubmVs77yJ77ya5Z+f5ZCNICsgNDQzIOato+W8j+ivgeS5puOAglxuLy8g44CQ6L+Z5piv5ZSv5LiA5L+d55WZ55qE56Gs57yW56CB44CRXCLlvoDlk6rlj5Ev5Y+R5LiN5Y+RL+WPkeS7gOS5iC/ph4fmoLflpJrlsJFcIuaUueeUsei/kOihjOaXtui/nOeoi+mFjee9ruWGs+WumlxuLy8g77yIR0VUIC9jb25maWfvvIzop4HkuIvmlrkgUkVNT1RFIENPTkZJRyDmrrXvvInjgILmraTliY3kupTnq6/lhajpg6jnoaznvJbnoIHkuIrmiqXlnLDlnYDvvIzkuo7mmK/nur/kuIrpgqPkuKpcbi8vIOaOp+WItumdoioq5LiA5Liq56uv6YO95rKh5Zyo6K+7Kiog4oCU4oCUIOaUuSBlbmFibGVkL3NhbXBsZVJhdGUg5a+5546w572R6Zu25pWI5p6c77yM5o2i5ZCO56uv6KaB5LqU56uv5ZCE5Y+R5LiA5qyh54mI44CCXG5jb25zdCBURUxFTUVUUllfSE9TVCA9ICd0ZWxlbWV0cnkucGl4Z28udWsnO1xuY29uc3QgVEVMRU1FVFJZX1BPUlQgPSA0NDM7XG5cbmNvbnN0IEFOT05fSURfS0VZID0gJ2ZpZ21hLWltcG9ydGVyLmFub25JZCc7XG5cbi8vIOa1i+ivleacuuWjsOaYju+8muacrOacuuiiq+agh+iusOS4uua1i+ivleacuuaXtu+8jOS6i+S7tuaghyBlbnZLaW5kOid0ZXN0ZXIn77yMdjIg55yL5p2/5LiN6K6h5YWl5Lq65pWw44CCXG4vL1xuLy8g5Lik5p2h5Yik5o2u77yM5Lu75LiA5ZG95Lit5Y2z566X77yaXG4vLyAgIOKRoCDnjq/looPlj5jph48gRklHTUFfVEVMRU1FVFJZX1RFU1RFUu+8iOWRveS7pOihjOWQr+WKqOaXtuaWueS+v++8iVxuLy8gICDikaEgKirmnLrlmajnuqfmoIforrDmlofku7YqKu+8iOS4jiBtYWNoaW5lSWQg5ZCM55uu5b2V55qEIGZpZ21hLWxhdW5jaHBhZC10ZXN0ZXLvvIlcbi8vXG4vLyDjgJDkuLrku4DkuYjlv4XpobvmnIkg4pGhIOi/meadoeaWh+S7tuWIpOaNruOAkeWPqueUqOeOr+Wig+WPmOmHj+WcqCBHVUkg5bqU55So5LiK5LiN5Y+v6Z2g77yMMjAyNi0wOC0yOCDlrp7mtYvmoL3ov4fvvJpcbi8vICAgwrcgQ29jb3MgQ3JlYXRvciDmmK8gQ29jb3NEYXNoYm9hcmQg5ZCv5Yqo55qE77yM546v5aKD5LuOIERhc2hib2FyZCDnu6fmib/jgIJEYXNoYm9hcmQg5pio5aSpXG4vLyAgICAg5bCx5Zyo6LeR5LqGIOKHkiDku4rlpKkgbGF1bmNoY3RsIHNldGVudiDkuYvlkI7ph43lkK8gQ3JlYXRvciAqKuS7jeeEtuivu+S4jeWIsCoq77yI6KaB6L+eXG4vLyAgICAgRGFzaGJvYXJkIOS4gOi1t+mHjeWQr++8jOiAjOayoeS6uuS8muaDs+WIsOi/meS4gOatpe+8ieOAglxuLy8gICDCtyDkuJQgSVNfVEVTVEVSIOiLpeWGmeaIkOaooeWdl+e6pyBjb25zdO+8jOaYryoq5Yqg6L295pe25rGC5YC85LiA5qyhKiog4oCU4oCUIOaJqeWxleWKoOi9veWQjuWGjeiuvuWPmOmHj1xuLy8gICAgIOS5n+S4jeeUn+aViOOAgui/meS4pOS4quWdkeWPoOi1t+adpe+8jFwi6K6+5LqGIGZsYWcg5Y205rKh55Sf5pWIXCLlrozlhajpnZnpu5jvvJrkuovku7bnhafmoLfkuIrmiqXvvIxcbi8vICAgICDlj6rmmK/ooqvnrpfov5vnnJ/mnLrkurrmlbDvvIzogIzpgqPmraPmmK8gZmxhZyDopoHpmLLnmoTkuovjgIJcbi8vIOaWh+S7tuWIpOaNruayoeaciei/meS6m+mXrumimO+8muavj+asoeS4iuaKpeeOsOivu++8jOaUueWujOeri+WIu+eUn+aViOOAgeS4jeeUqOmHjeWQr+S7u+S9lei/m+eoi+OAglxuY29uc3QgRU5WX1RFU1RFUiA9ICEhKHByb2Nlc3MuZW52LkZJR01BX1RFTEVNRVRSWV9URVNURVIgfHwgJycpLnRyaW0oKTtcblxuLy8g4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXG4vLyAg6L+c56iL6YWN572u77yIR0VUIC9jb25maWfvvIlcbi8vIOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkFxuLy8g44CQ5pyA6YeN6KaB55qE5LiN5Y+Y6YeP44CR5ouJ5LiN5YiwIOKJoCDkuI3kuIrmiqXjgILphY3nva7mnI3liqHmjILmjokv5pat572RL+WdjyBKU09OIOS4gOW+i+WbnuiQveWGhee9rum7mOiupFxuLy8g77yIZW5hYmxlZD10cnVlICsg5b2T5YmN5Z+f5ZCN77yJ57un57ut6YeH6ZuG44CC5Y+N6L+H5p2l5YGa5Lya6K6pXCLphY3nva7mnI3liqHmipbkuIDkuItcIuWPmOaIkFxuLy8gXCLpgqPmrrXml7bpl7TmlbDmja7mlbTmrrXmtojlpLFcIu+8jOiAjCBmaXJlLWFuZC1mb3JnZXQg5rKh5pyJ5aSx6LSl5Zue6Z+z77yM5oiR5Lus5rC46L+c5LiN5Lya55+l6YGT44CCXG4vL1xuLy8g44CQ5LiN6Zi75aGe5a+85YWl44CR6aaW5qyhIHRyYWNrIOaXtuaHkuaLieS4gOasoe+8jOWcqOWug+i/lOWbnuS5i+WJjeeUqOWGhee9rum7mOiupOWIpOWumiDigJTigJQg5rKh5pyJ5Lu75L2VIGF3YWl0XG4vLyDmjKHlnKjlr7zlhaXot6/lvoTkuIrjgIJDb2NvcyDkuLvov5vnqIvmmK/plb/pqbvnmoTvvIjnvJbovpHlmajlvIDnnYDlsLHkuIDnm7TlnKjvvInvvIzmi4nkuIDmrKHlpJ/nlKjvvJtcbi8vIOWKoCAzMCDliIbpkp/ova/ov4fmnJ/vvIzplb/ml7bpl7TlvIDnnYDnvJbovpHlmajkuZ/og73mi7/liLDmlrDphY3nva7jgIJcbmNvbnN0IENPTkZJR19UVExfTVMgPSAzMCAqIDYwICogMTAwMDtcbi8vIOeOr+Wig+WPmOmHj+imhueblu+8muW8gOWPkeacn+aKiuaVtOadoemTvui3r+aMh+WQkeacrOacuuWBh+acjeWKoemqjOivge+8iOeUn+S6p+S4jeiuvu+8ieOAglxuY29uc3QgQ09ORklHX0JBU0UgPSAocHJvY2Vzcy5lbnYuRklHTUFfVEVMRU1FVFJZX0JBU0UgfHwgYGh0dHBzOi8vJHtURUxFTUVUUllfSE9TVH1gKS5yZXBsYWNlKC9cXC8rJC8sICcnKTtcblxuaW50ZXJmYWNlIFJlbW90ZUNmZyB7XG4gICAgZW5hYmxlZDogYm9vbGVhbjtcbiAgICBlbmRwb2ludDogc3RyaW5nO1xuICAgIHNhbXBsZVJhdGU6IG51bWJlcjtcbiAgICBldmVudHM6IHN0cmluZ1tdIHwgbnVsbDtcbiAgICBjb25maWdWZXJzaW9uOiBudW1iZXI7XG59XG4vLyDlhoXnva7pu5jorqTvvJrlv4XpobvmmK9cIueFp+WPkVwi6ICM5LiN5pivXCLkuI3lj5FcIuOAgmV2ZW50cz1udWxsIOihqOekuuS4jeWBmueZveWQjeWNlei/h+a7pCDigJTigJRcbi8vIOaLv+S4jeWIsOa4heWNleaXtuabv+acjeWKoeerr+aKiumXqOWFs+S4iu+8jOetieS6juiuqemFjee9ruS4jeWPr+i+vuaXtuaVsOaNruaVtOautea2iOWkse+8iOacjeWKoeerr+iHquW3sei/mOaciVxuLy8gS05PV05fRVZFTlRTIOWFnOW6le+8jOWuouaIt+err+S4jemcgOimgeWkmui/meS4gOmBk++8ieOAglxuLy9cbi8vIOOAkGVuZHBvaW50IOW/hemhu+i3n+edgCBDT05GSUdfQkFTRSDotbDvvIzkuI3og73lhpnmrbvnur/kuIrln5/lkI3jgJFcbi8vIOaIkeesrOS4gOeJiOWGmeaIkCBgaHR0cHM6Ly8ke1RFTEVNRVRSWV9IT1NUfS9hcGkvdHJhY2tg77yM5LqO5piv5byA5Y+R5pyf5Y2z5L2/5oqKXG4vLyBGSUdNQV9URUxFTUVUUllfQkFTRSDmjIflkJHmnKzmnLrlgYfmnI3liqHvvIwqKumFjee9ruaLieS4jeWIsC/lnY8gSlNPTiDnmoTpgqPmnaHlm57okL3ot6/lvoTku43nhLbmiZPnur/kuIoqKiDigJTigJRcbi8vIOWunua1i+ecn+W+gOeUn+S6p+W6k+eBjOi/myA0IOadoSBwcm9iZSDkuovku7bvvIhjb2Nvc19pbXBvcnQgZXh0cmE9e1wicHJvYmVcIjoxL1wid2FybVwiLzV977yJ44CCXG4vLyDov5nlsLHmmK9cIumAg+eUn+iIsee7lei/h+S6humalOemu1wi77ya5Li76Lev5b6E6KKr6ZqU56a75LqG77yM5YWc5bqV6Lev5b6E5rKh5pyJ44CC5Yeh5piv5pyJIGZhbGxiYWNrIOeahOWcsOaWue+8jFxuLy8gZmFsbGJhY2sg5Lmf5b+F6aG76JC95Zyo5ZCM5LiA5Liq6ZqU56a75byA5YWz5LiL44CCXG5jb25zdCBCVUlMVElOX0NGRzogUmVtb3RlQ2ZnID0ge1xuICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgZW5kcG9pbnQ6IENPTkZJR19CQVNFICsgJy9hcGkvdHJhY2snLFxuICAgIHNhbXBsZVJhdGU6IDEsXG4gICAgZXZlbnRzOiBudWxsLFxuICAgIGNvbmZpZ1ZlcnNpb246IDAsXG59O1xubGV0IF9jZmc6IFJlbW90ZUNmZyB8IG51bGwgPSBudWxsO1xubGV0IF9jZmdBdCA9IDA7XG5sZXQgX2NmZ0luZmxpZ2h0ID0gZmFsc2U7XG5cbi8qKlxuICogQHpoIOagoemqjCvlvZLkuIDljJbov5znqIvphY3nva7jgIIqKue6r+WHveaVsOOAgeS7u+S9lei+k+WFpemDveS4jeaKm+OAgioqXG4gKiDpgJDlrZfmrrXmoKHpqozogIzkuI3mmK/mlbTku70gYXNzaWdu77ya6YWN572u5p2l6Ieq572R57uc77yM5YaZ5q6L5LiA5Liq5a2X5q615LiN6K+l5oqK5pW05Lu95L2c5bqf44CCXG4gKiBzYW1wbGVSYXRlIOWdj+WAvOWIu+aEj+WbnuiQvSAx77yI5a6B5Y+v5aSa5pS277yM5LiN5Y+v6Z2Z6buY5bCR5pS2IOKAlOKAlCDlsJHmlLbmmK/nnIvkuI3op4HnmoTvvInjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZUNvbmZpZyhyYXc6IGFueSk6IFJlbW90ZUNmZyB7XG4gICAgY29uc3Qgb3V0OiBSZW1vdGVDZmcgPSBPYmplY3QuYXNzaWduKHt9LCBCVUlMVElOX0NGRyk7XG4gICAgaWYgKCFyYXcgfHwgdHlwZW9mIHJhdyAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheShyYXcpKSByZXR1cm4gb3V0O1xuICAgIC8vIGVuYWJsZWQg5Y+q6K6k55yf5biD5bCU77ya5a2X56ym5LiyIFwiZmFsc2VcIiDlnKggSlMg6YeM5pivIHRydXRoee+8jOiupOWugz3ku6XkuLrlhbPkuoblhbblrp7msqHlhbPjgIJcbiAgICBpZiAodHlwZW9mIHJhdy5lbmFibGVkID09PSAnYm9vbGVhbicpIG91dC5lbmFibGVkID0gcmF3LmVuYWJsZWQ7XG4gICAgaWYgKHR5cGVvZiByYXcuZW5kcG9pbnQgPT09ICdzdHJpbmcnICYmIHJhdy5lbmRwb2ludCkge1xuICAgICAgICAvLyDlj6rorqQgaHR0cC9odHRwc++8jOmBv+WFjeWdj+WAvOWPmOaIkOayoeazleWPkeeahOWcsOWdgOOAguS4jeWBmuWfn+WQjeeZveWQjeWNleKAlOKAlFxuICAgICAgICAvLyDmjaLlkI7nq6/kuI3lj5HniYjmraPmmK/nm67nmoTvvIzkv6Hku7vplJrmmK9cIui/meS7vemFjee9ruadpeiHquaIkeS7rOaOjOaOp+eahOWfn+WQjVwi44CCXG4gICAgICAgIGlmICgvXmh0dHBzPzpcXC9cXC9bXlxcc10rJC9pLnRlc3QocmF3LmVuZHBvaW50KSkgb3V0LmVuZHBvaW50ID0gcmF3LmVuZHBvaW50O1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHJhdy5zYW1wbGVSYXRlID09PSAnbnVtYmVyJyAmJiBpc0Zpbml0ZShyYXcuc2FtcGxlUmF0ZSlcbiAgICAgICAgJiYgcmF3LnNhbXBsZVJhdGUgPj0gMCAmJiByYXcuc2FtcGxlUmF0ZSA8PSAxKSB7XG4gICAgICAgIG91dC5zYW1wbGVSYXRlID0gcmF3LnNhbXBsZVJhdGU7XG4gICAgfVxuICAgIGlmIChBcnJheS5pc0FycmF5KHJhdy5ldmVudHMpKSB7XG4gICAgICAgIGNvbnN0IGV2cyA9IHJhdy5ldmVudHMuZmlsdGVyKCh4OiBhbnkpID0+IHR5cGVvZiB4ID09PSAnc3RyaW5nJyAmJiB4KTtcbiAgICAgICAgb3V0LmV2ZW50cyA9IGV2cy5sZW5ndGggPyBldnMgOiBudWxsOyAgICAgIC8vIOepuuaVsOe7hOW9k1wi5rKh5LiL5Y+RXCLvvIzkuI3lvZNcIuWFqOaLplwiXG4gICAgfVxuICAgIGlmICh0eXBlb2YgcmF3LmNvbmZpZ1ZlcnNpb24gPT09ICdudW1iZXInICYmIGlzRmluaXRlKHJhdy5jb25maWdWZXJzaW9uKSkge1xuICAgICAgICBvdXQuY29uZmlnVmVyc2lvbiA9IHJhdy5jb25maWdWZXJzaW9uO1xuICAgIH1cbiAgICByZXR1cm4gb3V0O1xufVxuXG4vKiogQHpoIOS6i+S7tuWQjeaYr+WQpuWcqOeZveWQjeWNlemHjO+8iOaUr+aMgSBgKmAg6YCa6YWN77yJ44CC5riF5Y2V56m6IOKGkiDkuIDlvovmlL7ooYzjgIIqKue6r+WHveaVsOOAgioqICovXG5leHBvcnQgZnVuY3Rpb24gZXZlbnRBbGxvd2VkKGV2ZW50OiBzdHJpbmcsIHBhdHRlcm5zOiBzdHJpbmdbXSB8IG51bGwpOiBib29sZWFuIHtcbiAgICBpZiAoIXBhdHRlcm5zIHx8ICFwYXR0ZXJucy5sZW5ndGgpIHJldHVybiB0cnVlO1xuICAgIGNvbnN0IGV2ID0gU3RyaW5nKGV2ZW50IHx8ICcnKTtcbiAgICBmb3IgKGNvbnN0IHAgb2YgcGF0dGVybnMpIHtcbiAgICAgICAgaWYgKHAgPT09ICcqJyB8fCBwID09PSBldikgcmV0dXJuIHRydWU7XG4gICAgICAgIGlmIChwLmluZGV4T2YoJyonKSA8IDApIGNvbnRpbnVlO1xuICAgICAgICAvLyDlj6rmioogKiDlvZPpgJrphY3vvIzlhbbkvZnmraPliJnlhYPlrZfnrKblhajovazkuYnvvJrlkKbliJnphY3nva7ph4znmoQgYC5gIOS8muWPmOaIkFwi5Lu75oSP5a2X56ymXCLjgIJcbiAgICAgICAgY29uc3QgcmUgPSBuZXcgUmVnRXhwKCdeJyArIHAuc3BsaXQoJyonKS5tYXAoKHMpID0+IHMucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKSkuam9pbignLionKSArICckJyk7XG4gICAgICAgIGlmIChyZS50ZXN0KGV2KSkgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuLyoqIEB6aCDov5nmnaHkuovku7bor6XkuI3or6Xlj5HjgIJgcm5kYCDlj6/ms6jlhaXvvIzkvr/kuo7noa7lrprmgKflnLDpqozph4fmoLfjgIIqKue6r+WHveaVsO+8iOmZpOivu+e8k+WtmO+8ieOAgioqICovXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkU2VuZChldmVudDogc3RyaW5nLCBjZmc/OiBSZW1vdGVDZmcgfCBudWxsLCBybmQ/OiBudW1iZXIpOiBib29sZWFuIHtcbiAgICBjb25zdCBjID0gY2ZnIHx8IF9jZmcgfHwgQlVJTFRJTl9DRkc7XG4gICAgaWYgKCFjLmVuYWJsZWQpIHJldHVybiBmYWxzZTtcbiAgICBpZiAoIWV2ZW50QWxsb3dlZChldmVudCwgYy5ldmVudHMpKSByZXR1cm4gZmFsc2U7XG4gICAgaWYgKGMuc2FtcGxlUmF0ZSA+PSAxKSByZXR1cm4gdHJ1ZTtcbiAgICBpZiAoYy5zYW1wbGVSYXRlIDw9IDApIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCByID0gdHlwZW9mIHJuZCA9PT0gJ251bWJlcicgPyBybmQgOiBNYXRoLnJhbmRvbSgpO1xuICAgIHJldHVybiByIDwgYy5zYW1wbGVSYXRlO1xufVxuXG4vKipcbiAqIEB6aCDlkI7lj7Dmi4nkuIDmrKHov5znqIvphY3nva7jgIJmaXJlLWFuZC1mb3JnZXTvvJrkuI3mipvjgIE0cyDotoXml7bjgIHlpLHotKXkv53mjIHljp/nirbjgIJcbiAqIOW3suWcqOaLieWPluS4reWImeebtOaOpei/lOWbnu+8iOmBv+WFjei/nue7reWvvOWFpeaXtuW5tuWPkeaJk+mFjee9ruerr+eCue+8ieOAglxuICovXG5mdW5jdGlvbiByZWZyZXNoQ29uZmlnKCk6IHZvaWQge1xuICAgIGlmIChfY2ZnSW5mbGlnaHQpIHJldHVybjtcbiAgICBpZiAoX2NmZyAmJiBEYXRlLm5vdygpIC0gX2NmZ0F0IDwgQ09ORklHX1RUTF9NUykgcmV0dXJuO1xuICAgIF9jZmdJbmZsaWdodCA9IHRydWU7XG4gICAgY29uc3QgZG9uZSA9ICgpID0+IHsgX2NmZ0luZmxpZ2h0ID0gZmFsc2U7IH07XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaXNIdHRwcyA9IENPTkZJR19CQVNFLnN0YXJ0c1dpdGgoJ2h0dHBzOicpO1xuICAgICAgICBjb25zdCBub1NjaGVtZSA9IENPTkZJR19CQVNFLnJlcGxhY2UoL15odHRwcz86XFwvXFwvLywgJycpO1xuICAgICAgICBjb25zdCBzbGFzaCA9IG5vU2NoZW1lLmluZGV4T2YoJy8nKTtcbiAgICAgICAgY29uc3QgaG9zdFBvcnQgPSBzbGFzaCA8IDAgPyBub1NjaGVtZSA6IG5vU2NoZW1lLnNsaWNlKDAsIHNsYXNoKTtcbiAgICAgICAgY29uc3QgW2hvc3QsIHBvcnRTdHJdID0gaG9zdFBvcnQuc3BsaXQoJzonKTtcbiAgICAgICAgY29uc3QgcmVxID0gKGlzSHR0cHMgPyByZXF1ZXN0IDogaHR0cFJlcXVlc3QpKHtcbiAgICAgICAgICAgIGhvc3QsXG4gICAgICAgICAgICBwb3J0OiBwb3J0U3RyID8gTnVtYmVyKHBvcnRTdHIpIDogKGlzSHR0cHMgPyA0NDMgOiA4MCksXG4gICAgICAgICAgICBwYXRoOiAoc2xhc2ggPCAwID8gJycgOiBub1NjaGVtZS5zbGljZShzbGFzaCkpICsgJy9jb25maWcnLFxuICAgICAgICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgICAgICAgIC8vIOOAkOW/hemhu+W4piBVQeOAkXRlbGVtZXRyeS5waXhnby51ayDotbAgQ2xvdWRmbGFyZSBUdW5uZWzvvIxDRiDkvJrmi6bmn5Dkupvpu5jorqQgVUEg5ZueIDQwM1xuICAgICAgICAgICAgLy8g77yIcHJlZmxpZ2h0LnB5IC8gZGVwbG95LWNoZWNrLnB5IOmDveS4uuatpOi4qei/h++8ieOAguS4jeW4pueahOWQjuaenOaYr1wi5rC46L+c5ouJ5LiN5Yiw5LiU5a6M5YWo6Z2Z6buYXCLjgIJcbiAgICAgICAgICAgIGhlYWRlcnM6IHsgJ1VzZXItQWdlbnQnOiAnZmlnbWEtY29jb3MtdGVsZW1ldHJ5LWNvbmZpZy8xLjAnIH0sXG4gICAgICAgICAgICB0aW1lb3V0OiA0MDAwLFxuICAgICAgICB9LCAocmVzKSA9PiB7XG4gICAgICAgICAgICBpZiAocmVzLnN0YXR1c0NvZGUgIT09IDIwMCkgeyByZXMucmVzdW1lKCk7IGRvbmUoKTsgcmV0dXJuOyB9XG4gICAgICAgICAgICBsZXQgYm9keSA9ICcnO1xuICAgICAgICAgICAgcmVzLnNldEVuY29kaW5nKCd1dGYtOCcpO1xuICAgICAgICAgICAgcmVzLm9uKCdkYXRhJywgKGQpID0+IHsgaWYgKGJvZHkubGVuZ3RoIDwgNjU1MzYpIGJvZHkgKz0gZDsgfSk7ICAgLy8g5bCB6aG2IDY0S0JcbiAgICAgICAgICAgIHJlcy5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7IF9jZmcgPSBub3JtYWxpemVDb25maWcoSlNPTi5wYXJzZShib2R5KSk7IF9jZmdBdCA9IERhdGUubm93KCk7IH0gY2F0Y2ggeyAvKiDlnY8gSlNPTu+8muS/neaMgeWOn+eKtiAqLyB9XG4gICAgICAgICAgICAgICAgZG9uZSgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXMub24oJ2Vycm9yJywgZG9uZSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXEub24oJ2Vycm9yJywgZG9uZSk7ICAgICAgICAvLyDmlq3nvZEvRE5TL+ivgeS5puWksei0pe+8mumdmem7mFxuICAgICAgICByZXEub24oJ3RpbWVvdXQnLCAoKSA9PiB7IHJlcS5kZXN0cm95KCk7IGRvbmUoKTsgfSk7XG4gICAgICAgIHJlcS5lbmQoKTtcbiAgICB9IGNhdGNoIHsgZG9uZSgpOyB9XG59XG5cblxuLyoqIEB6aCDlj5bvvIjmiJbpppbmrKHnlJ/miJDvvInljL/lkI3nqLPlrpogSUTvvJvlpLHotKXov5Tlm57nqbrkuLLvvIjkuIrmiqXku43nu6fnu63vvIzlj6rmmK/ml6Dljrvph43nu7TluqbvvInjgIIgKi9cbmFzeW5jIGZ1bmN0aW9uIGdldEFub25JZCgpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJhdyA9IGF3YWl0IEVkaXRvci5Qcm9maWxlLmdldENvbmZpZygnZmlnbWEtaW1wb3J0ZXInLCBBTk9OX0lEX0tFWSk7XG4gICAgICAgIGlmICh0eXBlb2YgcmF3ID09PSAnc3RyaW5nJyAmJiByYXcpIHJldHVybiByYXc7XG4gICAgICAgIGNvbnN0IGlkID0gcmFuZG9tVVVJRCgpO1xuICAgICAgICBhd2FpdCBFZGl0b3IuUHJvZmlsZS5zZXRDb25maWcoJ2ZpZ21hLWltcG9ydGVyJywgQU5PTl9JRF9LRVksIGlkKTtcbiAgICAgICAgcmV0dXJuIGlkO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxufVxuXG4vLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcbi8vICDmnLrlmajnuqcgSUTvvIjot6jnq6/lhbHkuqvvvIlcbi8vIOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkFxuLy8g44CQ5Li65LuA5LmI6KaB5a6D44CRYW5vbklkIOaYryoq5q+P5Liq56uv5ZCE6Ieq55Sf5oiQKirnmoTvvJpMYXVuY2hwYWQg5LiA5Liq44CB5pys5omp5bGV5LiA5Liq44CBXG4vLyBVbml0eSDmj5Lku7bkuIDkuKrjgIFGaWdtYSDkuInnq6/lkITkuIDkuKrjgILlrp7mtYvot6jnq6/lhbHkuqvmlbAgPSAw77yM5LqO5piv5LiA5Liq5Lq655SoIDcg5Liq56uvXG4vLyDlnKjnnIvmnb/kuIrlsLHmmK8gNyDkuKpcIueUqOaIt1wi77yI5YWo5bqTIDEyNyDkuKogYW5vbklkIC8gMTMg5LiqIElQIOWJjee8gO+8jOiZmumrmOe6piAxMCDlgI3vvInjgIJcbi8vXG4vLyDop6Pms5XkuI3mmK/mlLnlkITnq6/nmoQgYW5vbklk77yI6YKj5Lya5pat6KOC5bey5pyJ5pWw5o2u77yM5LiUIEZpZ21hIOerr+eJqeeQhuS4iuivu+S4jeWIsOaWh+S7tuezu+e7n++8ie+8jFxuLy8g6ICM5pivKirpop3lpJYqKuivu+S4gOS4quS4g+err+WFseeUqOeahOacuuWZqOe6p+aWh+S7tuOAguWug+eUsSBMYXVuY2hwYWQg5Yib5bu657u05oqkXG4vL++8iGZpZ21hLWxhdW5jaHBhZC9hcHAvbWFpbi5qcyDnmoQgcmVhZE9yQ3JlYXRlTWFjaGluZUlk77yJ44CCXG4vL1xuLy8g4pqg77iPIOW5s+WPsOi3r+W+hOW/hemhu+WGmeatu++8jOS4jeiDveeUqCBFbGVjdHJvbiDnmoQgYXBwLmdldFBhdGgg4oCU4oCUIOi/memHjOaYryBDb2NvcyDmianlsZXnmoRcbi8vIE5vZGUg546v5aKD77yM5rKh5pyJIGVsZWN0cm9uIGFwcCDlr7nosaHjgILkuInlpITot6/lvoTkuI4gbWFpbi5qcyDnmoQgbWFjaGluZUlkRmlsZSgpIOS4gOS4gOWvueW6lO+8jFxuLy8gKirmlLnkuIDlpITlv4XpobvmlLnkuKTlpIQqKu+8iOWQpuWImeivu+WIsOepuiA9IOW9kuW5tumdmem7mOWkseaViO+8jOiAjOeci+adv+eFp+agt+iDveaJk+W8gO+8ieOAglxuLy9cbi8vIOivu+S4jeWIsOWwsei/lOWbnuepuuS4su+8iOayoeijhSBMYXVuY2hwYWTjgIHmiJblroPov5jmsqHot5Hov4fkuIDmrKHvvInigJTigJQg5LiK5oql54Wn5bi477yMXG4vLyDnnIvmnb/miorov5nmnaHlvZLliLDjgIzmnKrog73lvZLlubbjgI3ljZXliJfvvIzkuI3njJzjgIJcbmZ1bmN0aW9uIG1hY2hpbmVJZEZpbGVQYXRoKCk6IHN0cmluZyB7XG4gICAgaWYgKHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicpIHtcbiAgICAgICAgY29uc3QgYmFzZSA9IHByb2Nlc3MuZW52LlBST0dSQU1EQVRBIHx8IHByb2Nlc3MuZW52LkFMTFVTRVJTUFJPRklMRSB8fCAnJztcbiAgICAgICAgcmV0dXJuIGJhc2UgPyBqb2luKGJhc2UsICdmaWdtYS1sYXVuY2hwYWQnLCAnbWFjaGluZS1pZCcpIDogJyc7XG4gICAgfVxuICAgIGlmIChwcm9jZXNzLnBsYXRmb3JtID09PSAnZGFyd2luJykge1xuICAgICAgICByZXR1cm4gam9pbihob21lZGlyKCksICdMaWJyYXJ5JywgJ0FwcGxpY2F0aW9uIFN1cHBvcnQnLCAnZmlnbWEtbGF1bmNocGFkLWlkJyk7XG4gICAgfVxuICAgIHJldHVybiBqb2luKGhvbWVkaXIoKSwgJy5maWdtYS1sYXVuY2hwYWQtaWQnKTtcbn1cblxuZnVuY3Rpb24gcmVhZE1hY2hpbmVJZCgpOiBzdHJpbmcge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGYgPSBtYWNoaW5lSWRGaWxlUGF0aCgpO1xuICAgICAgICBpZiAoIWYpIHJldHVybiAnJztcbiAgICAgICAgY29uc3QgdiA9IFN0cmluZyhyZWFkRmlsZVN5bmMoZiwgJ3V0Zi04JykgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgLy8g5Y+q6K6kIFVVSUQg5b2i54q277ya6Ziy5oqK5Lmx56CBL+WNiuaIquaWh+S7tuW9kyBJRCDnlKjvvIjpgqPkvJrorqnkuIDlj7DmnLrlmajmr4/mrKHpg73mmK/mlrDmnLrlmajvvIlcbiAgICAgICAgcmV0dXJuIC9eWzAtOWEtZi1dezM2fSQvaS50ZXN0KHYpID8gdiA6ICcnO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gJyc7ICAgICAgLy8g5paH5Lu25LiN5a2Y5ZyoIC8g5peg5p2D6ZmQIOKAlOKAlCDpg73mmK/mraPluLjmg4XlvaLvvIzkuI3mmK/plJnor69cbiAgICB9XG59XG5cbi8qKlxuICogQHpoIOS+m+aOqOmAgeacjeWKoeeahCAvcGluZyDlupTnrZTnlKjjgIIqKuWvvOWHuuWug+iAjOS4jeaYr+WcqCBzZXJ2ZXIudHMg6YeM5YaN5YaZ5LiA6YGN6Lev5b6E6YC76L6RKipcbiAqIOKAlOKAlCDpgqPmnaHot6/lvoTlt7Lnu4/lnKjkuInlpITlh7rnjrDvvIhtYWluLmpzIC8g5pys5paH5Lu2IC8gVW5pdHkg55qEIEZpZ21hVGVsZW1ldHJ5LmNz77yJ77yMXG4gKiDlho3lpJrkuIDlpITlsLHmm7TlrrnmmJPmvILnp7vvvJvlkIzkuIDkuKrov5vnqIvph4zmsqHmnInnkIbnlLHmi7fotJ3nrKzlm5vku73jgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hY2hpbmVJZEZvclBpbmcoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gcmVhZE1hY2hpbmVJZCgpO1xufVxuXG4vKiogQHpoIOa1i+ivleacuuagh+iusOaWh+S7tueahOi3r+W+hO+8iOS4jiBtYWNoaW5lSWQg5ZCM55uu5b2V77yM5ZCM5LiA5aWX5bmz5Y+w6KeE5YiZ77yJ44CCICovXG5mdW5jdGlvbiB0ZXN0ZXJGbGFnRmlsZVBhdGgoKTogc3RyaW5nIHtcbiAgICBpZiAocHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJykge1xuICAgICAgICBjb25zdCBiYXNlID0gcHJvY2Vzcy5lbnYuUFJPR1JBTURBVEEgfHwgcHJvY2Vzcy5lbnYuQUxMVVNFUlNQUk9GSUxFIHx8ICcnO1xuICAgICAgICByZXR1cm4gYmFzZSA/IGpvaW4oYmFzZSwgJ2ZpZ21hLWxhdW5jaHBhZCcsICd0ZXN0ZXInKSA6ICcnO1xuICAgIH1cbiAgICBpZiAocHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ2RhcndpbicpIHtcbiAgICAgICAgcmV0dXJuIGpvaW4oaG9tZWRpcigpLCAnTGlicmFyeScsICdBcHBsaWNhdGlvbiBTdXBwb3J0JywgJ2ZpZ21hLWxhdW5jaHBhZC10ZXN0ZXInKTtcbiAgICB9XG4gICAgcmV0dXJuIGpvaW4oaG9tZWRpcigpLCAnLmZpZ21hLWxhdW5jaHBhZC10ZXN0ZXInKTtcbn1cblxuLyoqXG4gKiBAemgg5pys5py65piv5LiN5piv5rWL6K+V5py644CCKirmr4/mrKHosIPnlKjpg73njrDor7sqKu+8jOS4jee8k+WtmCDigJTigJQg6KeB5LiK5pa5IElTX1RFU1RFUiDms6jph4rph4xcbiAqIOiusOeahOmCo+S4pOS4quWdke+8iEdVSSDov5vnqIvnu6fmib/kuI3liLDlj5jph48gLyDmqKHlnZfnuqcgY29uc3Qg5Yqg6L295pe25bCx5Zu65YyW77yJ44CCXG4gKiDor7vmlofku7bnmoTlvIDplIDlr7kgZmlyZS1hbmQtZm9yZ2V0IOeahOWfi+eCueWujOWFqOaXoOaJgOiwk+OAglxuICovXG5mdW5jdGlvbiBpc1Rlc3Rlck1hY2hpbmUoKTogYm9vbGVhbiB7XG4gICAgaWYgKEVOVl9URVNURVIpIHJldHVybiB0cnVlO1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGYgPSB0ZXN0ZXJGbGFnRmlsZVBhdGgoKTtcbiAgICAgICAgcmV0dXJuICEhZiAmJiBleGlzdHNTeW5jKGYpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gZmFsc2U7ICAgLy8g6K+75LiN5LqG5bCx5b2T5LiN5piv5rWL6K+V5py6IOKAlOKAlCDlroHlj6/lpJrmlLbmlbDmja7vvIzkuI3lj6/pnZnpu5jlsJHmlLZcbiAgICB9XG59XG5cbi8qKlxuICogQHpoIOacrOacuuaYr+S4jeaYr+a1i+ivleacuu+8iOS+myAvcGluZyDlupTnrZTluKbnu5kgRmlnbWEg5o+S5Lu256uv77yJ44CCXG4gKlxuICog44CQ5Li65LuA5LmIIEZpZ21hIOerr+imgemdoOaIkeS7rOWRiuivieWug+OAkeWug+i3keWcqOa1j+iniOWZqOaymeeusemHjO+8jCoq5pei6K+75LiN5Yiw546v5aKD5Y+Y6YeP5Lmf6K+75LiN5YiwXG4gKiDmlofku7bns7vnu58qKiDigJTigJQg5LqO5piv5qCH6K6w5Li65rWL6K+V5py655qE5byA5Y+R5py677yMRmlnbWEg56uv55qE5LqL5Lu25LuN5Lya6KKr566X6L+b55yf5py65Lq65pWw44CCXG4gKiDmiJHoh6rlt7HlgZrnnJ/mnLrpqozor4Hml7blsLHkvJrmsaHmn5PvvIgyMDI2LTA4LTI3IOW3suaxoeafk+i/h+eUn+S6p+W6k++8mnVuaXR5IDIuMC4xIMOXMTEg5p2h77yJ44CCXG4gKiDmjqjpgIHmnI3liqHot5HlnKggTm9kZSDph4zor7vlvpfliLDvvIzpobrnnYDlt7LmnInnmoQgL3Bpbmcg6YCa6YGT5Zue5Lyg5piv5pyA55yB55qE5YGa5rOV44CCXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1Rlc3RlckZvclBpbmcoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIGlzVGVzdGVyTWFjaGluZSgpO1xufVxuXG4vKiogQHpoIOacuuWZqOWQjSArIOezu+e7n+eUqOaIt+WQjeOAgueUqOaIt+aLjeadv+imgeOAjOiDveS4u+WKqOiupOWHuuavj+WPsOacuuWZqOaYr+iwgeOAje+8jOaYjuaWh+S4iuaKpeOAgiAqL1xuZnVuY3Rpb24gbWFjaGluZUxhYmVsKCk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4ge1xuICAgIGNvbnN0IG91dDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgIHRyeSB7IGNvbnN0IGggPSBTdHJpbmcoaG9zdG5hbWUoKSB8fCAnJykudHJpbSgpOyBpZiAoaCkgb3V0Lm1hY2hpbmVOYW1lID0gaC5zbGljZSgwLCA2NCk7IH0gY2F0Y2ggeyAvKiDlj5bkuI3liLDlsLHkuI3luKYgKi8gfVxuICAgIHRyeSB7IGNvbnN0IHUgPSBTdHJpbmcoKHVzZXJJbmZvKCkgfHwgKHt9IGFzIGFueSkpLnVzZXJuYW1lIHx8ICcnKS50cmltKCk7IGlmICh1KSBvdXQub3NVc2VyID0gdS5zbGljZSgwLCA2NCk7IH0gY2F0Y2ggeyAvKiDlkIzkuIogKi8gfVxuICAgIHJldHVybiBvdXQ7XG59XG5cblxuLyoqXG4gKiBAemgg6ZSZ6K+v5L+h5oGv6ISx5pWPICsg5oiq5pat77yI5LiOIExhdW5jaHBhZCBtYWluLmpzIHNhbml0aXplRXJyTWVzc2FnZSDnrYnmlYjvvInjgIJcbiAqIOaKpemUmemHjOW4uOWQq+e7neWvuei3r+W+hO+8iOW4pueUqOaIt+WQje+8jOWxnuS4quS6uuS/oeaBr++8ie+8jOaKueaOieWutuebruW9leauteWQjuWGjeS4iuaKpe+8m+i2hemVv+aIquaWreWIsCA1MDAg5a2X44CCXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYW5pdGl6ZUVyck1lc3NhZ2UobXNnOiBhbnkpOiBzdHJpbmcge1xuICAgIGxldCBzID0gU3RyaW5nKChtc2cgJiYgbXNnLm1lc3NhZ2UpIHx8IG1zZyB8fCAnJyk7XG4gICAgcyA9IHMucmVwbGFjZSgvXFwvVXNlcnNcXC9bXi9cXHNdKy9nLCAnL1VzZXJzLyonKSAgICAgICAgICAvLyBtYWNcbiAgICAgICAgIC5yZXBsYWNlKC9cXC9ob21lXFwvW14vXFxzXSsvZywgJy9ob21lLyonKSAgICAgICAgICAgIC8vIGxpbnV4XG4gICAgICAgICAucmVwbGFjZSgvKFtBLVphLXpdOlxcXFxVc2Vyc1xcXFwpW15cXFxcXFxzXSsvZywgJyQxKicpOyAgLy8gd2luZG93c1xuICAgIHJldHVybiBzLmxlbmd0aCA+IDUwMCA/IHMuc2xpY2UoMCwgNTAwKSArICfigKYnIDogcztcbn1cblxuLyoqXG4gKiBAemgg5LiK5oql5LiA5Liq5a+85YWl5LqL5Lu244CCZmlyZS1hbmQtZm9yZ2V077ya5LiNIGF3YWl0IOe9kee7nOOAgeWksei0peWFqOmdmem7mOOAglxuICogZXh0cmEg6YeM5Y+v5bimIGR1cmF0aW9uTXMg562J6ZmE5Yqg57u05bqm44CCXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB0cmFja0ltcG9ydChleHRyYT86IFJlY29yZDxzdHJpbmcsIGFueT4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdHJhY2soJ2NvY29zX2ltcG9ydCcsIGV4dHJhKTtcbn1cblxuLyoqIEB6aCDlkIzkuIDkuKogZXJyb3Ig5a+56LGh5Y+q5LiK5oql5LiA5qyh55qE5qCH6K6w6ZSu77yI5LiN5Y+v5p6a5Li+77yM5LiN5rGh5p+TIEpTT04uc3RyaW5naWZ577yJ44CCICovXG5jb25zdCBSRVBPUlRFRF9LRVkgPSAnX19maWdtYVRlbGVtZXRyeVJlcG9ydGVkJztcblxuLyoqXG4gKiBAemgg5LiK5oql5LiA5qyh5a+85YWl5aSx6LSl77yIY29jb3NfaW1wb3J0X2ZhaWxlZO+8ieOAgnN0ZXAg5qCH5piO5aSx6LSl5Zyo5ZOq5LiA5q2l77yMbWVzc2FnZSDlt7LohLHmlY8r5oiq5pat44CCXG4gKlxuICog5ZCM5LiA5LiqIGVycm9yIOWvueixoeWPquS4iuaKpeS4gOasoe+8mmJ1aWxkRnJvbURhdGEg5LiK5oql5ZCO5LyaIHJldGhyb3fvvIzlpJblsYIgY2F0Y2gg5YaN6LCD5pys5Ye95pWw5pe255u05o6l6Lez6L+H77yMXG4gKiDpgb/lhY3kuIDmrKHlpLHotKXkuqfnlJ/kuKTmnaHkuovku7bjgIHmiormiJDlip/njofnrpfmrarjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRyYWNrSW1wb3J0RmFpbGVkKHN0ZXA6IHN0cmluZywgZXJyOiBhbnksIGV4dHJhPzogUmVjb3JkPHN0cmluZywgYW55Pik6IHZvaWQge1xuICAgIHRyeSB7XG4gICAgICAgIGlmIChlcnIgJiYgdHlwZW9mIGVyciA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIGlmICgoZXJyIGFzIGFueSlbUkVQT1JURURfS0VZXSkgcmV0dXJuO1xuICAgICAgICAgICAgdHJ5IHsgT2JqZWN0LmRlZmluZVByb3BlcnR5KGVyciwgUkVQT1JURURfS0VZLCB7IHZhbHVlOiB0cnVlLCBlbnVtZXJhYmxlOiBmYWxzZSB9KTsgfSBjYXRjaCB7IC8qIOWGu+e7k+Wvueixoeetie+8muW/veeVpSAqLyB9XG4gICAgICAgIH1cbiAgICAgICAgLy8g5pi+5byPIC5jYXRjaO+8muacrOWHveaVsOaYr+WQjOatpeeahO+8jOS4jeaOpeS9j+eahOivnSB0cmFjayDkuIfkuIAgcmVqZWN0IOWwseaIkCB1bmhhbmRsZWRSZWplY3Rpb27jgIJcbiAgICAgICAgdHJhY2soJ2NvY29zX2ltcG9ydF9mYWlsZWQnLCBPYmplY3QuYXNzaWduKHtcbiAgICAgICAgICAgIHN0ZXAsXG4gICAgICAgICAgICBtZXNzYWdlOiBzYW5pdGl6ZUVyck1lc3NhZ2UoZXJyKSxcbiAgICAgICAgfSwgZXh0cmEgfHwge30pKS5jYXRjaCgoKSA9PiB7IC8qIOmdmem7mCAqLyB9KTtcbiAgICB9IGNhdGNoIHsgLyog5Z+L54K557ud5LiN5b2x5ZON5a+85YWl55qE6ZSZ6K+v5aSE55CG5pys6LqrICovIH1cbn1cblxuLyoqXG4gKiBAemgg5LuF5L6b5rWL6K+V77ya5riF5o6J6YWN572u57yT5a2Y77yM6K6p5LiL5LiA5qyhIHRyYWNrIOmHjeaWsOaLieOAglxuICog44CQ5Li65LuA5LmI5b+F6aG75pyJ44CR5rKh5pyJ5a6D5bCx5peg5rOV5Zyo5LiA5Liq6L+b56iL6YeM6aqM44CM6YWN572u5Y+Y5LqG5LmL5ZCO6KGM5Li66Lef552A5Y+Y44CN4oCU4oCUXG4gKiAzMCDliIbpkp8gVFRMIOS8muaKiuS4iuS4gOS4quWcuuaZr+eahOmFjee9ruS4gOebtOeymOS9j++8jOS6juaYr1wiZW5hYmxlZCDku44gZmFsc2Ug5pS55ZueIHRydWVcIlxuICog6L+Z5p2h5qC55pys5rWL5LiN5Ye65p2l77yI5oiR5YaZ5rWL6K+V5pe25q2j5piv5YWI5ryP5LqG5a6D44CBQy9EIOS4pOe7hOWBh+Wksei0pe+8ieOAgueUn+S6p+S7o+eggeS4jeiwg+OAglxuICovXG5leHBvcnQgZnVuY3Rpb24gX19yZXNldENvbmZpZ0ZvclRlc3QoKTogdm9pZCB7XG4gICAgX2NmZyA9IG51bGw7IF9jZmdBdCA9IDA7IF9jZmdJbmZsaWdodCA9IGZhbHNlO1xufVxuXG4vKiogQHpoIOS7heS+m+a1i+ivle+8muivu+W9k+WJjeeUn+aViOmFjee9ru+8iOWIpOaWreWIsOW6lemHh+e6s+S6huWTquS4gOS7ve+8ieOAgueUn+S6p+S7o+eggeS4jeiwg+OAgiAqL1xuZXhwb3J0IGZ1bmN0aW9uIF9fY3VycmVudENvbmZpZ0ZvclRlc3QoKTogUmVtb3RlQ2ZnIHtcbiAgICByZXR1cm4gX2NmZyB8fCBCVUlMVElOX0NGRztcbn1cblxuLyoqIEB6aCDlrp7pmYXlj5HpgIHvvJrmi7zlhazlhbHnu7TluqYgKyBQT1NUIOWIsO+8iOWPr+S4i+WPkeeahO+8ieS4iuaKpeWcsOWdgO+8jOWFqOeoi+mdmem7mOOAgiAqL1xuYXN5bmMgZnVuY3Rpb24gdHJhY2soZXZlbnQ6IHN0cmluZywgZXh0cmE/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8g5oeS5ZCv5Yqo5LiA5qyh6YWN572u5ouJ5Y+W77ya5LiNIGF3YWl077yM5pys5qyh5Yik5a6a55So5bey5pyJ6YWN572uL+WGhee9rum7mOiupO+8jOe7neS4jeaMoeS9j+WvvOWFpeOAglxuICAgIHRyeSB7IHJlZnJlc2hDb25maWcoKTsgfSBjYXRjaCB7IC8qIOmdmem7mCAqLyB9XG4gICAgLy8g6L+c56iL6YWN572u6Ze46Zeo77yaZW5hYmxlZDpmYWxzZSAvIGV2ZW50cyDnmb3lkI3ljZUgLyBzYW1wbGVSYXRlIOS4iemhueWcqOi/memHjOecn+ato+eUn+aViOOAglxuICAgIHRyeSB7IGlmICghc2hvdWxkU2VuZChldmVudCkpIHJldHVybjsgfSBjYXRjaCB7IC8qIOWIpOWumuW8guW4uOS4gOW+i+aUvuihjO+8jOWugeWPr+WkmuaUtiAqLyB9XG4gICAgbGV0IGFub25JZCA9ICcnO1xuICAgIHRyeSB7IGFub25JZCA9IGF3YWl0IGdldEFub25JZCgpOyB9IGNhdGNoIHsgLyog5b+955WlICovIH1cbiAgICB0cnkge1xuICAgICAgICAvLyB2ZXJzaW9uIOaUtuaVm+aIkOe6r+eJiOacrOWPt++8iEJVSUxEX1ZFUlNJT04g5b2i5aaCIFwidjEuMS41ICgyMDI2LS4uLiDmj4/ov7ApXCLvvInvvJtcbiAgICAgICAgLy8g5a6M5pW05p6E5bu65Liy5pS+IGJ1aWxkIOWtl+aute+8jOmBv+WFjVwi5oyJ54mI5pysXCLogZrlkIjooqvmnoTlu7rmj4/ov7DmiZPmlaPjgIJcbiAgICAgICAgY29uc3QgdmVyTWF0Y2ggPSBCVUlMRF9WRVJTSU9OLm1hdGNoKC9cXGQrXFwuXFxkK1xcLlxcZCsvKTtcbiAgICAgICAgY29uc3QgcGF5bG9hZCA9IEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KE9iamVjdC5hc3NpZ24oe1xuICAgICAgICAgICAgZXZlbnQsXG4gICAgICAgICAgICBwbHVnaW46ICdjb2NvcycsXG4gICAgICAgICAgICB2ZXJzaW9uOiB2ZXJNYXRjaCA/IHZlck1hdGNoWzBdIDogQlVJTERfVkVSU0lPTixcbiAgICAgICAgICAgIGJ1aWxkOiBCVUlMRF9WRVJTSU9OLFxuICAgICAgICAgICAgcGxhdGZvcm06IHByb2Nlc3MucGxhdGZvcm0gPT09ICdkYXJ3aW4nID8gJ21hYycgOiAocHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJyA/ICd3aW4nIDogcHJvY2Vzcy5wbGF0Zm9ybSksXG4gICAgICAgICAgICBhbm9uSWQsXG4gICAgICAgICAgICAvLyDkuI4gYW5vbklkICoq5bm25a2YKirvvJptYWNoaW5lSWQg5piv5LiD56uv5YWx55So55qE5py65Zmo5qCH6K+G77yI6K+75LiN5Yiw5bCx56m65Liy77yJ77yMXG4gICAgICAgICAgICAvLyDnnIvmnb/mjIkgbWFjaGluZUlkIOS8mOWFiOW9kuW5tuOAgeaLv+S4jeWIsOaXtumAgOWbniBhbm9uSWQg5Y2V5YiX44CCXG4gICAgICAgICAgICBtYWNoaW5lSWQ6IHJlYWRNYWNoaW5lSWQoKSxcbiAgICAgICAgICAgIC4uLihpc1Rlc3Rlck1hY2hpbmUoKSA/IHsgZW52S2luZDogJ3Rlc3RlcicgfSA6IHt9KSxcbiAgICAgICAgICAgIC4uLm1hY2hpbmVMYWJlbCgpLFxuICAgICAgICB9LCBleHRyYSB8fCB7fSkpKTtcblxuICAgICAgICAvLyDkuIrmiqXlnLDlnYDnlLHov5znqIvphY3nva7kuIvlj5HvvIjku6XlkI7mjaLlkI7nq6/kuI3nlKjlj5HniYjvvInvvJvmi4nkuI3liLDphY3nva7ml7bnlKjlhoXnva7pu5jorqTln5/lkI3jgIJcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gKF9jZmcgJiYgX2NmZy5lbmRwb2ludCkgfHwgQlVJTFRJTl9DRkcuZW5kcG9pbnQ7XG4gICAgICAgIGNvbnN0IGlzSHR0cHMgPSB0YXJnZXQuc3RhcnRzV2l0aCgnaHR0cHM6Jyk7XG4gICAgICAgIGNvbnN0IG5vU2NoZW1lID0gdGFyZ2V0LnJlcGxhY2UoL15odHRwcz86XFwvXFwvLywgJycpO1xuICAgICAgICBjb25zdCBzbGFzaCA9IG5vU2NoZW1lLmluZGV4T2YoJy8nKTtcbiAgICAgICAgY29uc3QgaG9zdFBvcnQgPSBzbGFzaCA8IDAgPyBub1NjaGVtZSA6IG5vU2NoZW1lLnNsaWNlKDAsIHNsYXNoKTtcbiAgICAgICAgY29uc3QgW2hvc3QsIHBvcnRTdHJdID0gaG9zdFBvcnQuc3BsaXQoJzonKTtcblxuICAgICAgICBjb25zdCByZXEgPSAoaXNIdHRwcyA/IHJlcXVlc3QgOiBodHRwUmVxdWVzdCkoe1xuICAgICAgICAgICAgaG9zdCxcbiAgICAgICAgICAgIHBvcnQ6IHBvcnRTdHIgPyBOdW1iZXIocG9ydFN0cikgOiAoaXNIdHRwcyA/IFRFTEVNRVRSWV9QT1JUIDogODApLFxuICAgICAgICAgICAgcGF0aDogc2xhc2ggPCAwID8gJy9hcGkvdHJhY2snIDogbm9TY2hlbWUuc2xpY2Uoc2xhc2gpLFxuICAgICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgICAgICBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsICdDb250ZW50LUxlbmd0aCc6IHBheWxvYWQubGVuZ3RoIH0sXG4gICAgICAgICAgICB0aW1lb3V0OiA0MDAwLFxuICAgICAgICB9LCAocmVzKSA9PiB7IHJlcy5yZXN1bWUoKTsgfSk7IC8vIOS4ouW8g+WTjeW6lOS9k1xuXG4gICAgICAgIHJlcS5vbignZXJyb3InLCAoKSA9PiB7fSk7ICAgICAgICAgICAvLyDpnZnpu5jvvJrln4vngrnlpLHotKXnu53kuI3lvbHlk43lr7zlhaVcbiAgICAgICAgcmVxLm9uKCd0aW1lb3V0JywgKCkgPT4gcmVxLmRlc3Ryb3koKSk7XG4gICAgICAgIHJlcS53cml0ZShwYXlsb2FkKTtcbiAgICAgICAgcmVxLmVuZCgpO1xuICAgIH0gY2F0Y2ggeyAvKiDov57mnoTpgKDpg73lpLHotKXkuZ/pnZnpu5ggKi8gfVxufVxuIl19