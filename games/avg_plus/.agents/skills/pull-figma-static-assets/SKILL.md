---
name: pull-figma-static-assets
description: 按用户指定的 Figma 远端目录，精确定位并只导出该目录直接下一层的整体节点为 1× 透明 PNG，事务性覆盖项目静态资源临时收件箱，但绝不自动修改 assets/art/textures。用于静态美术、Prefab 拖拽素材、组件整体导出、远端目录列表、一次性下载、手动挑选或替换资源；不要用于需要持续远端同步的动态卡牌资源。
---

# 拉取 Figma 静态资源

将指定 Figma 目录的直接子节点作为一次性静态 PNG 拉取到临时收件箱。用户随后手动把需要的文件移动或替换到 `assets/art/textures/`；一旦离开收件箱，不再建立远端同步关系。

## 动态资源与静态资源分流

- 需要以后按名称持续跟随 Figma 更新、stage 后确认并自动原位替换：使用 `$sync-figma-game-assets`。
- 用于 Prefab 手动拖拽、下载后由用户自行选择和管理、不再跟踪远端：使用本 Skill。
- 两种机制共用基础规则：Figma 只读、路径逐级精确发现、名称保持一致、nodeId 仅存在于单次临时计划、PNG/尺寸/Alpha/哈希校验、日志不泄漏短期 URL。
- 不得把静态收件箱接入动态 lock/catalog，也不得把动态资源自动写入 `assets/art/textures/`。

## 用户命令

- `$pull-figma-static-assets list`：重新发现远端目录并生成名称路径列表，不下载资源。
- `$pull-figma-static-assets <远端路径>`：例如 `组件库/元件`，拉取该目录直接下一层整体节点。
- `$pull-figma-static-assets status`：校验当前临时收件箱的 PNG、清单和哈希。
- 每次真实 pull 都完整覆盖旧收件箱；无需二次确认，因为正式 `assets/art/textures/` 永远不会被脚本修改。

## 远端目录发现

1. 读取 `figma-static-assets.config.json`，再从其 `figmaFileConfig` 指向的共享配置动态取得 Figma file URL 和 fileKey；不要在 Skill、脚本或计划中固化 fileKey。
2. 从用户输入解析路径段，例如 `组件库/元件` → `["组件库", "元件"]`。
3. 优先调用 Figma `get_metadata` 列出 Page 并逐级精确匹配直接子节点。
4. 如果普通元数据接口漏列 Page，加载 `figma-use` Skill 后仅用只读 `use_figma` 枚举实际 Pages；不得修改 Figma。
5. 对相关 Page 获取 XML 元数据，运行脚本 `directory-index`，生成不含 nodeId 的远端目录列表。
6. 目录列表保存为临时收件箱根部的 `remote-directories.json`，供用户选择下一次路径。

## 直接下一层导出规则

1. 对最终目录调用 `get_metadata`，运行 `figma_static_pull.py plan`。
2. 只读取最终目录的直接 `children`；禁止递归扫描后代作为独立资源。
3. 加载 `figma-use` Skill 后，以只读 `use_figma` 对每个允许的直接子节点调用一次原生 `node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 }, contentsOnly: true, useAbsoluteBounds: false })`。
4. 通过 `figma.io.write()` 取回原生 PNG，并标记 `sourceKind: figmaNativeExport`。每个调用最多输出 5 张图，最多并发 4 个调用；禁止使用会合成白底的 MCP rendered export，也禁止将内部 `rawImages` 当作整体组件。
5. 例如 `btn` 内含图片和文字时，只导出 `btn.png`，不导出其内部图片、文字或图层。
6. 保留 Figma 直接子节点原名作为 PNG 文件名。拒绝同名、路径分隔符、`.`、`..` 和不安全名称。
7. 原生导出字节和单次定位计划只存在于 Git 忽略的 `temp/figma-static/`，不得把 base64、短期 URL 或 nodeId 写入收件箱清单与项目文档。

## 临时收件箱规则

- 临时根目录由配置 `inboxRoot` 指定，当前为 `assets/art/__figma_static_inbox__/`。
- 保留远端路径层级，例如 `组件库/元件/img_main_btn_red.png`。
- 每次 pull 先把全部文件下载和校验到 staging；成功后事务性替换整个旧收件箱，失败时保留旧收件箱。
- 根部必须包含 `remote-directories.json` 和 `pull-manifest.json`；两者不得包含 nodeId 或 UUID。
- 清单记录远端路径、直接层级规则、原名、尺寸、Alpha 统计、SHA-256 和正式候选根目录。
- `assets/art/textures/` 只允许用户手动新增、移动或替换。Skill 不复制、不删除、不比较该目录，也不追踪用户最终选择。
- 收件箱资源只用于检查和挑选，不得直接拖入正式 Prefab；先手动移动到 `assets/art/textures/`。

## 透明和完整性

- Figma 原生 `exportAsync` 与编辑器手动点击 Export 使用同类渲染路径；配置为 `transparency: required` 时，整体 PNG 必须存在透明或半透明像素，发现白底必须整批失败。
- 校验 PNG 签名、1× 导出尺寸、Alpha、名称、完整直接子节点集合和 SHA-256。
- 非允许类型的直接子节点写入计划的 `ignored` 报告，不递归导出；如果没有任何可导出直接子节点则整批失败。

## 脚本接口

- `validate-config`：校验共享 Figma 配置、收件箱、正式根和下载策略。
- `locate`：按路径深度精确定位 Page/目录。
- `directory-index`：从 Page 元数据生成不含 nodeId 的远端目录列表。
- `plan`：只规划指定目录直接下一层的整体导出。
- `pull`：下载、验证并事务性覆盖静态收件箱；支持 `--dry-run`。
- `status`：验证当前收件箱及 manifest，不访问 Figma。

详细团队约定先从 [静态资源模块索引](../../../docs/figma-static-assets/INDEX.md) 路由，再按关键词读取 [pull.md](../../../docs/figma-static-assets/pull.md) 的对应章节。任何失败都应停止并报告，不得回退到模糊搜索、递归零散导出或自动修改正式 textures。
