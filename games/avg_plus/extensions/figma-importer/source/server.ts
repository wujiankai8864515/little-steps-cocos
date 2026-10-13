/**
 * @en Local push-receive HTTP server (binds 127.0.0.1:8787). Port a subset of Unity's
 *     FigmaPushServer.cs so the SAME Figma plugin talks to Cocos unchanged.
 * @zh 本地推送接收服务（绑 127.0.0.1:8787）。协议照搬 Unity FigmaPushServer.cs 的子集，
 *     让同一个 Figma 插件无需改动就能推给 Cocos。
 *
 * 协议契约（必须与 Figma 插件 ui.html 的 UNITY_URL/pushToUnity 对齐）：
 *   GET  /ping                          → {"ok":true,"app":"unity-figma-import","machineId":"…","envKind":"…"}
 *                                          ← 插件靠 app 字段认服务；machineId/envKind 供 Figma 端埋点
 *                                            （它读不到文件系统与环境变量，这是唯一通道；取不到时为空串）
 *   POST /push?name=&id=&seq=&total=     → 分片：total>1&&id 时按 id 累积、按 seq 重组，收齐再回调
 *                                          单发：整串直接回调。回 {"ok":true} / {"ok":true,"partial":true}
 *   GET  /pull                           → Cocos→Figma 回流：返回已暂存的导出 JSON；无内容时 204
 *
 * Node 内置 http 已处理 header 解析 / chunked / Content-Length，比 C# 裸 TcpListener 简单得多。
 * 分片重组、JSON 配平检查照搬 Unity（防大 base64 被截断后导入半截 JSON）。
 */
import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { dirname, join } from 'path';
import { URL } from 'url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { machineIdForPing, isTesterForPing } from './telemetry';

export const PUSH_PORT = 8787;

export interface PushOptions {
    /** @zh 仅供本地自动化验证使用；Figma 插件不会带这个参数，仍会走确认闸门。 */
    skipConfirm?: boolean;
}

/** @zh 收到完整 JSON 的回调：(json 字符串, 界面名, 推送选项)。 */
export type PushHandler = (json: string, name: string, options?: PushOptions) => void;

let server: Server | null = null;

// 分片重组：插件把大 JSON 按 UTF-8 字节切片多次 POST，这里按 id 累积（端口 Accumulate 754）。
interface Upload {
    parts: Array<Buffer | null>;
    received: number;
    total: number;
    name: string;
    ts: number;
}
const uploads: { [id: string]: Upload } = {};
const UPLOAD_TTL_MS = 120000;

/** @zh 增量判断 JSON 顶层大括号/方括号是否配平（正确处理字符串与转义）。端口 JsonBalance 891。 */
function isBalancedJson(buf: Buffer): boolean {
    if (!buf || buf.length === 0) return false;
    let depth = 0, inString = false, escape = false, started = false;
    for (let i = 0; i < buf.length; i++) {
        const ch = buf[i];
        if (inString) {
            if (escape) escape = false;
            else if (ch === 0x5c) escape = true; // backslash
            else if (ch === 0x22) inString = false; // "
            continue;
        }
        if (ch === 0x22) { inString = true; continue; }
        if (ch === 0x7b || ch === 0x5b) { depth++; started = true; } // { [
        else if (ch === 0x7d || ch === 0x5d) { // } ]
            depth--;
            if (started && depth <= 0) return true;
        }
    }
    return false;
}

/** @zh 清理超时未收齐的分片（端口 PurgeStaleNoLock 791）。 */
function purgeStale(): void {
    const now = Date.now();
    for (const id of Object.keys(uploads)) {
        if (now - uploads[id].ts > UPLOAD_TTL_MS) delete uploads[id];
    }
}

/** @zh 按 id 累积分片；收齐返回完整 Buffer，否则 null（端口 Accumulate 754）。 */
function accumulate(id: string, name: string, seq: number, total: number, piece: Buffer): Buffer | null {
    purgeStale();
    let up = uploads[id];
    if (!up) {
        up = { parts: new Array(total).fill(null), received: 0, total, name, ts: Date.now() };
        uploads[id] = up;
    }
    up.ts = Date.now();
    if (seq >= 0 && seq < total && up.parts[seq] == null) {
        up.parts[seq] = piece;
        up.received++;
    }
    if (up.received < total) return null;
    delete uploads[id];
    return Buffer.concat(up.parts.map((p) => p || Buffer.alloc(0)));
}

function readBody(req: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', () => resolve(Buffer.concat(chunks)));
    });
}

function writeJson(res: ServerResponse, code: number, body: string): void {
    writeBytes(res, code, Buffer.from(body || '', 'utf8'), 'application/json; charset=utf-8');
}

function writeBytes(res: ServerResponse, code: number, body: Buffer, contentType: string): void {
    res.writeHead(code, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Content-Length': body.length,
    });
    res.end(body);
}

function pendingPullFile(): string | null {
    const projectPath = (Editor as any).Project && (Editor as any).Project.path;
    return projectPath ? join(projectPath, 'temp', 'figma_pull.json') : null;
}

export function setPendingPullJson(json: string): boolean {
    try {
        const file = pendingPullFile();
        if (!file) return false;
        const dir = dirname(file);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(file, json || '', 'utf8');
        return true;
    } catch (err) {
        console.warn('[figma-importer] 暂存待 Figma 拉取 JSON 失败:', err);
        return false;
    }
}

export function hasPendingPullJson(): boolean {
    const file = pendingPullFile();
    return !!file && existsSync(file);
}

function readPendingPullJson(): Buffer | null {
    try {
        const file = pendingPullFile();
        if (!file || !existsSync(file)) return null;
        return readFileSync(file);
    } catch {
        return null;
    }
}

/**
 * @en Start the push server. Idempotent. `onPush` fires with the full JSON once a
 *     (possibly multi-part) push is complete.
 * @zh 启动推送服务（幂等）。分片收齐后用完整 JSON 调 onPush。
 */
export function startPushServer(onPush: PushHandler): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
        if (server) {
            resolve({ ok: true });
            return;
        }
        const srv = createServer(async (req, res) => {
            try {
                const u = new URL(req.url || '/', `http://127.0.0.1:${PUSH_PORT}`);
                const path = u.pathname;
                const method = req.method || 'GET';

                if (method === 'OPTIONS') { writeJson(res, 204, ''); return; }

                if (method === 'GET' && path === '/ping') {
                    // machineId 顺路带给 Figma 插件端：那边跑在浏览器沙箱里、
                    // 读不到文件系统，拿不到七端共用的机器 ID（于是它的事件在看板上
                    // 永远归不到具体机器）。推送前的这次 /ping 是唯一的天然通道 ——
                    // 插件收到后存进 clientStorage，后续埋点就带上了。
                    //
                    // ⚠️ 必须保留 app 字段：插件靠它认服务（见文件头注释）。
                    // 且 machineId 读不到时给空串而不是省略字段 —— 省略会让插件端
                    // 分不清"服务是旧版"和"这台机器没有 ID"。
                    // envKind 同理：Figma 端读不到环境变量，无法自己声明是测试机
                    // ⇒ 设了 FIGMA_TELEMETRY_TESTER 的开发机，它的 Figma 事件仍会被
                    // 算进真机人数（我做真机验证时必然踩到）。这里替它带上。
                    writeJson(res, 200, JSON.stringify({
                        ok: true,
                        app: 'unity-figma-import',
                        machineId: machineIdForPing(),
                        envKind: isTesterForPing() ? 'tester' : '',
                    }));
                    return;
                }

                if (method === 'GET' && path === '/pull') {
                    const pending = readPendingPullJson();
                    if (!pending || pending.length === 0) {
                        writeJson(res, 204, '');
                    } else {
                        writeBytes(res, 200, pending, 'application/json; charset=utf-8');
                    }
                    return;
                }

                if (method === 'POST' && (path === '/push' || path === '/figma')) {
                    const name = decodeURIComponent(u.searchParams.get('name') || '');
                    const id = u.searchParams.get('id') || '';
                    const seq = parseInt(u.searchParams.get('seq') || '0', 10) || 0;
                    const total = parseInt(u.searchParams.get('total') || '1', 10) || 1;
                    const skipConfirm =
                        u.searchParams.get('skipConfirm') === '1' ||
                        u.searchParams.get('noConfirm') === '1';

                    const piece = await readBody(req);
                    let full: Buffer | null;
                    if (total > 1 && id) {
                        full = accumulate(id, name, seq, total, piece);
                        if (full == null) {
                            writeJson(res, 200, '{"ok":true,"partial":true}'); // 还没收齐
                            return;
                        }
                    } else {
                        full = piece;
                    }

                    if (!full || full.length === 0 || !isBalancedJson(full)) {
                        console.error(`[figma-importer] 推送数据不完整或非合法 JSON（${total > 1 ? total + ' 片' : '单发'}，${full ? full.length : 0} 字节），已丢弃。`);
                        writeJson(res, 400, '{"ok":false,"error":"incomplete body"}');
                        return;
                    }

                    writeJson(res, 200, '{"ok":true}');
                    try {
                        onPush(full.toString('utf-8'), name, { skipConfirm });
                    } catch (e) {
                        console.error('[figma-importer] onPush 处理失败:', e);
                    }
                    return;
                }

                writeJson(res, 404, '{"ok":false}');
            } catch (e) {
                console.error('[figma-importer] 请求处理出错:', e);
                try { writeJson(res, 500, '{"ok":false}'); } catch { /* 已发送头 */ }
            }
        });

        srv.on('error', (err: any) => {
            server = null;
            const msg = err && err.code === 'EADDRINUSE'
                ? `端口 ${PUSH_PORT} 已被占用（可能另一个 Cocos/Unity 实例，或上次没退干净）。`
                : String(err);
            console.error(`[figma-importer] 推送服务启动失败：${msg}`);
            resolve({ ok: false, error: msg });
        });

        srv.listen(PUSH_PORT, '127.0.0.1', () => {
            server = srv;
            console.log(`[figma-importer] 推送服务已启动，监听 http://127.0.0.1:${PUSH_PORT}/（Figma 插件点「推送」即可）`);
            resolve({ ok: true });
        });
    });
}

/** @zh 停止推送服务（幂等）。 */
export function stopPushServer(): Promise<void> {
    return new Promise((resolve) => {
        const srv = server;
        server = null;
        for (const id of Object.keys(uploads)) delete uploads[id];
        if (!srv) { resolve(); return; }
        try { srv.close(() => resolve()); } catch { resolve(); }
    });
}

export function isPushServerRunning(): boolean {
    return server != null;
}
