import { readFileSync } from 'fs';
import { basename, join } from 'path';
import { readCurrentJsonPath } from '../../json-workspace-state';

type PanelElementMap = {
    status?: HTMLElement;
    summary?: HTMLElement;
    selectedPrefab?: HTMLElement;
    sceneSelection?: HTMLElement;
    detected?: HTMLElement;
    mappings?: HTMLElement;
    scanBtn?: HTMLButtonElement;
    refreshBtn?: HTMLButtonElement;
    settingsBtn?: HTMLButtonElement;
    version?: HTMLElement;
};

function asElementMap(raw: any): PanelElementMap {
    return raw as PanelElementMap;
}

const REQ = (msg: string, ...args: any[]) => Editor.Message.request('figma-importer', msg, ...args);

function escapeHtml(value: unknown): string {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function variantLabel(value: unknown): string {
    const raw = String(value || '').trim();
    if (!raw) return '默认（兜底）';
    return raw.split(',').map((part) => {
        const separator = part.indexOf('=');
        if (separator <= 0) return part.trim();
        return `${part.slice(0, separator).trim()}：${part.slice(separator + 1).trim()}`;
    }).join('  ·  ');
}

module.exports = Editor.Panel.define({
    template: readFileSync(join(__dirname, '../../../static/template/component-mapping/index.html'), 'utf-8'),
    style: readFileSync(join(__dirname, '../../../static/style/component-mapping/index.css'), 'utf-8'),
    $: {
        status: '#status',
        summary: '#summary',
        selectedPrefab: '#selectedPrefab',
        sceneSelection: '#sceneSelection',
        detected: '#detected',
        mappings: '#mappings',
        scanBtn: '#scanBtn',
        refreshBtn: '#refreshBtn',
        settingsBtn: '#settingsBtn',
        version: '#version',
    },
    ready() {
        const $ = asElementMap(this.$);
        let data: any = null;

        if ($.version) {
            try {
                const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf-8'));
                $.version.textContent = `FtoC v${pkg.version || '?'}`;
            } catch {
                $.version.textContent = '';
            }
        }

        const setStatus = (text: string, tone = 'info') => {
            if (!$.status) return;
            $.status.textContent = text;
            $.status.dataset.tone = tone;
        };

        const load = async () => {
            const result: any = await REQ('get-component-mappings');
            if (!result || result.success === false) {
                setStatus(`读取映射失败：${result && result.error || '未知错误'}`, 'error');
                return;
            }
            data = result.data || {};
            render();
        };

        const bind = async (component: any, variantFilter: string) => {
            if (!component || !component.componentKey) return;
            setStatus('正在 Assign Prefab...', 'info');
            const result: any = await REQ('upsert-component-mapping', {
                componentKey: component.componentKey,
                componentName: component.componentName,
                variantFilter,
            });
            if (!result || result.success === false) {
                setStatus(`绑定失败：${result && result.error || '请先在 Project 面板选中 Prefab'}`, 'error');
                return;
            }
            await load();
            setStatus('Prefab 映射已保存到工程。', 'ok');
        };

        const remove = async (entry: any) => {
            if (!entry) return;
            setStatus('正在解绑 Prefab...', 'info');
            const result: any = await REQ('remove-component-mapping', entry.componentKey, entry.variantFilter || '');
            if (!result || result.success === false) {
                setStatus(`解绑失败：${result && result.error || '未知错误'}`, 'error');
                return;
            }
            await load();
            setStatus('Prefab 映射已解绑。', 'ok');
        };

        const render = () => {
            const document = data && data.document || { entries: [] };
            const entries: any[] = Array.isArray(document.entries) ? document.entries : [];
            const components: any[] = data && Array.isArray(data.components) ? data.components : [];
            const resolved = data && data.resolved || {};
            const selected = data && data.selectedPrefab;
            const sceneSelection = data && data.sceneSelection || { status: 'none', reason: 'no-selection' };

            if ($.summary) {
                $.summary.textContent = `${entries.length} 条映射 · ${resolved.valid || 0} 可用 · ${resolved.broken || 0} 断链`;
                $.summary.dataset.tone = resolved.broken ? 'warn' : 'ok';
            }
            if ($.selectedPrefab) {
                $.selectedPrefab.innerHTML = selected
                    ? `<strong>当前 Project Prefab</strong><span>${escapeHtml(selected.name || selected.dbUrl)}</span><code>${escapeHtml(selected.dbUrl || selected.uuid)}</code>`
                    : '<strong>当前 Project Prefab</strong><span class="muted">未选择</span><small>请在 Project 面板选中一个 Prefab，再回到这里 Assign。</small>';
            }
            if ($.sceneSelection) {
                if (sceneSelection.status === 'selected') {
                    const hasVariant = !!String(sceneSelection.variantFilter || '').trim();
                    $.sceneSelection.innerHTML = `<div class="identity-main"><strong>${escapeHtml(sceneSelection.componentName || sceneSelection.nodeName || sceneSelection.componentKey)}</strong>` +
                        `<span>${escapeHtml(variantLabel(sceneSelection.variantFilter))}</span>` +
                        `<code>${escapeHtml(sceneSelection.componentKey)}</code>` +
                        `<small>${escapeHtml(sceneSelection.scenePath || sceneSelection.nodeName || '')}</small></div>` +
                        `<div class="identity-actions"><button data-scene-default>绑定默认</button>` +
                        (hasVariant ? '<button class="primary" data-scene-variant>绑定此变体</button>' : '') + '</div>';
                    $.sceneSelection.querySelector<HTMLButtonElement>('[data-scene-default]')?.addEventListener('click', () => bind(sceneSelection, ''));
                    $.sceneSelection.querySelector<HTMLButtonElement>('[data-scene-variant]')?.addEventListener('click', () => bind(sceneSelection, String(sceneSelection.variantFilter || '')));
                } else if (sceneSelection.reason === 'scene-query-failed') {
                    $.sceneSelection.innerHTML = `<div class="empty error">无法读取当前场景选择：${escapeHtml(sceneSelection.error || '未知错误')}</div>`;
                } else if (sceneSelection.status === 'not-component') {
                    $.sceneSelection.innerHTML = `<div class="empty"><strong>${escapeHtml(sceneSelection.nodeName || '当前节点')}</strong> 没有可用的 FigmaComponentState，请选择由 FtoC 导入的组件实例。</div>`;
                } else {
                    $.sceneSelection.innerHTML = '<div class="empty">请在场景层级中选择一个由 FtoC 导入的 Figma 组件实例。</div>';
                }
            }
            if ($.detected) {
                $.detected.innerHTML = components.length === 0
                    ? '<div class="empty">暂无最近导入的组件身份。兼容旧流程时可扫描 JSON。</div>'
                    : components.map((component, index) => `<div class="identity-row">` +
                        `<div class="identity-main"><strong>${escapeHtml(component.componentName || component.componentKey)}</strong>` +
                        `<span>${escapeHtml(variantLabel(component.variantFilter))}</span><code>${escapeHtml(component.componentKey)}</code></div>` +
                        `<div class="identity-actions"><button data-default="${index}">绑定默认</button><button data-variant="${index}">绑定此变体</button></div></div>`).join('');
                $.detected.querySelectorAll<HTMLButtonElement>('[data-default],[data-variant]').forEach((button) => {
                    button.addEventListener('click', () => {
                        const index = Number(button.dataset.default ?? button.dataset.variant);
                        const component = components[index];
                        bind(component, button.dataset.variant != null ? String(component.variantFilter || '') : '');
                    });
                });
            }
            if ($.mappings) {
                $.mappings.innerHTML = entries.length === 0
                    ? '<div class="empty">暂无工程映射。</div>'
                    : entries.map((entry, index) => `<div class="mapping-row">` +
                        `<div class="mapping-main"><strong>${escapeHtml(entry.componentName || entry.componentKey)}</strong>` +
                        `<span>${escapeHtml(variantLabel(entry.variantFilter))}</span><code>${escapeHtml(entry.prefabUrl || entry.prefabUuid || 'Prefab 断链')}</code></div>` +
                        `<button data-remove="${index}">解绑</button></div>`).join('');
                $.mappings.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach((button) => {
                    button.addEventListener('click', () => remove(entries[Number(button.dataset.remove)]));
                });
            }
        };

        $.scanBtn?.addEventListener('click', async () => {
            const filePath = await readCurrentJsonPath();
            if (!filePath) {
                setStatus('请先在 FtoC 导入工作台选择当前 JSON。', 'warn');
                await REQ('open-settings-panel');
                return;
            }
            setStatus(`扫描当前 JSON：${basename(filePath)}...`, 'info');
            const result: any = await REQ('scan-component-identities-from-json', filePath);
            if (!result || result.success === false) {
                setStatus(result && result.canceled ? '已取消扫描。' : `扫描失败：${result && result.error || '未知错误'}`, result && result.canceled ? 'info' : 'error');
                return;
            }
            await load();
            setStatus(`已扫描 ${result.data && result.data.count || 0} 个组件身份。`, 'ok');
        });
        $.refreshBtn?.addEventListener('click', async () => {
            await load();
            setStatus('场景选择、Prefab 和映射已刷新。', 'ok');
        });
        $.settingsBtn?.addEventListener('click', () => REQ('open-settings-panel'));
        load();
    },
});
