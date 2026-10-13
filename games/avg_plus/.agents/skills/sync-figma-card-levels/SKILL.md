---
name: sync-figma-card-levels
description: 关卡配置更新专用技能。按只读规范从 Figma 读取并审阅式同步每关牌阵配置到本地 JSON（源头 Figma、产物 JSON）。启动关键字：关卡配置更新。目标页面为卡牌玩法界面，目录命名 level_difficultyX_YY 为关卡，main 为每关信息，bp_poker 解析为 slot（牌型），bp_open_hand 正面占位解析为可选 currentCard（此关默认当前牌）。仅调用 Figma get_figma_data（本地 figma-developer-mcp，--format json）读取节点结构与名称，禁止下载图片、禁止持久化 nodeId 或 Cocos UUID。stage 供人工审阅，明确确认后 promote 到 assets/art/resources/config/card-levels/*.json。不要用于扑克 PNG 资源同步（那是 $sync-figma-game-assets）或一次性静态素材拉取（那是 $pull-figma-static-assets）。
---

# 关卡配置更新（Sync Figma Card Levels）

从 Figma 读取并审阅式同步每关牌阵配置。**源头 = Figma（只读），产物 = 本地 JSON**。每次运行都从 `get_figma_data` 重新发现 ID，不持久化 nodeId 或 Cocos UUID，不下载图片，不动 `assets/poker`、catalog、lock 或任何 PNG。

唯一支持的页面是 `卡牌玩法界面`；目录命名结构 `level_difficulty(?P<difficulty>\d+)_(?P<index>\d{2})` 即为关卡，`main` 内为每关信息：

```text
卡牌玩法界面
├── level_difficulty1_01
│   └── main
│       ├── bp_poker         # 卡牌占位实例 → slot（牌型）
│       └── bp_open_hand     # 正面占位实例 → currentCard（可选，此关默认当前牌）
├── level_difficulty1_02
└── ...
```

## 先读项目规则

加载 [docs/card-gameplay/INDEX.md](../../../docs/card-gameplay/INDEX.md) 及 [rules.md#第二层figma-每关牌阵配置](../../../docs/card-gameplay/rules.md#第二层figma-每关牌阵配置) 匹配段落，外加 [rules.md#只读布局同步硬规则](../../../docs/card-gameplay/rules.md#只读布局同步硬规则)。不得自创解析规则。

## 硬规则

- 只调用只读数据工具：本地 Figma MCP 的 `get_figma_data`（参数 `fileKey`/`nodeId`/`depth`），并统一使用 `--format json`（本地服务默认 tree 会丢弃模板帧的 type/layout；YAML 会把 `4:2` 这类 id 按六十进制解析成 `242`，故两者均不可作主数据源）。绝不调用图片工具（`download_figma_images`/`download_assets`）、截图或导出。
- 每次运行从新拉的 `get_figma_data` 重新发现页面与节点 ID，绝不复用已存 ID。
- 每个名称精确匹配且必须在父节点正下方，禁止整文件模糊搜索。
- nodeId 只存在于忽略目录的临时 plan；绝不打入 stage、manifest 或正式 JSON。
- `currentCard` 可选：仅当 `bp_open_hand` 恰好持有 1 个合法 `poker_<suit>_<color>_<01-13>` 正面实例时产出；背面/野牌占位或缺失 `bp_open_hand` 表示无 `currentCard`。
- promote 前必须校验：正面命名矩阵（`diamond/heart → red`，`spade/club → black`，点数 `01–13`）、`currentCard` 不得与正面 slot 重复、`coveredBy`/`covers` 一致。
- 对既有关卡绝不覆盖人工审阅过的 `coveredBy`/`covers`/`figmaCard` 与 slot 布局；同步只在既有 JSON 上补 `currentCard`，仅对真正的新关卡新建 JSON。
- 本地 `get_figma_data` 不提供 rotation；slot 尺寸按仓库约定归一化为 cardSize（162×243），坐标由实际布局中心导出。rotation 用 `figma_rotations.py` 走 Figma REST API（`GET /v1/files/<fileKey>/nodes`，只读 metadata、非图片、不下载）读取每张牌弧度后按 `角度 = -round(弧度×180/π)` 换算（无 rotation 记 0），绝不默认 0 或凭空兜底；nodeId 只存在于临时 mapping，不打入正式 JSON。
- 任何校验失败立即停止并展示确切错误，绝不降级为部分同步。

## 工作流

1. 读 `figma-assets.config.json` 取文件 URL / 页面约定；代码与提示中不得写死 fileKey 或 nodeId。
2. 调用 `get_figma_data`（仅 `fileKey`，`--format json`）列出顶层页面，存到 `temp/figma-sync/`；跑 `figma_levels.py locate --page 卡牌玩法界面` 解析页面 id。
3. 用页面 id 调 `get_figma_data`（`nodeId=<页面>`，`--format json`）取页面树，解析出各关卡帧 id（大树拉取时模板帧会被去重，只剩 id/name/template，用于发现关卡清单即可）。
4. 对每个关卡帧 id 单独调 `get_figma_data`（`nodeId=<关卡帧>`，`--format json`），每关存一个文件到临时目录（模板帧在单节点拉取时带完整 type/layout）。
5. 跑 `figma_levels.py plan --metadata <页面json> --levels-dir <关卡json目录> --output <plan.json>`；再跑 `figma_rotations.py --levels-dir <关卡json目录> --file-key <文件> --output <rotations.json>`（用 Figma REST API 读每张牌 rotation，环境变量 `FIGMA_API_KEY` 取令牌）生成 nodeId→角度映射。
6. 跑 `figma_levels.py stage --plan <plan.json> --rotations <rotations.json> --root .` 写审阅批次（`temp/figma-card-levels-review/`）与 `review-manifest.json`。遇到非法命名、重复牌或多余的 `bp_open_hand` 正面牌立即停止。
7. stage 后停下。报告 diff 与审阅路径，请用户检查；除非用户已明确批准该精确批次，否则不在同一轮 promote。
8. 仅在明确批准后跑 `promote --confirmed`，明确拒绝后跑 `discard-review --confirmed`；构建/发布前跑 `guard-build`。

## 辅助命令

`python3 .agents/skills/sync-figma-card-levels/scripts/figma_levels.py --help` 为确定性接口。

- `locate`：从顶层页面列表解析页面 id（支持 `get_figma_data` 的 JSON/YAML 输出）。
- `plan`：解析页面配置生成每关 stage JSON（slots + 可选 currentCard）；`--levels-dir` 传入逐关 `get_figma_data` JSON 目录；用 `--output` 写 plan 供 `stage`。
- `figma_rotations.py`：从 Figma REST API 读取每关 bp_poker 每张牌 rotation，输出 nodeId→角度映射 JSON（`--file-key`、`--token-env FIGMA_API_KEY`、`--output`）。
- `stage`：把 plan 写入审阅目录作为一批 + `review-manifest.json`；`--rotations` 传入 rotation 映射后逐 slot 覆写角度并清除临时 nodeId。
- `review-status` / `status`：重校验并报告待审阅批次，否则校验正式配置。
- `promote --confirmed`：批准后在一个可回滚事务中更新正式 `card-levels/*.json`（既有关卡只补 `currentCard`，新关卡新建 JSON），成功后自动清理审阅批次。
- `discard-review --confirmed`：移除被拒绝的审阅批次。
- `guard-build`：存在审阅批次即失败。
- `verify`：校验正式 `card-levels/*.json` 是否满足仓库规则。

任何辅助校验失败立即停止并展示确切错误。绝不回退到旧 nodeId、UUID 映射、截图或部分同步。

## 输入输出契约

- **源头**：Figma `卡牌玩法界面` 页面（只读，每次重新发现 ID）。
- **产物**：`assets/art/resources/config/card-levels/<levelId>.json`（UTF-8 无 BOM，LF）。
- **临时**：plan/stage 只写 `temp/figma-sync/` 与 `temp/figma-card-levels-review/`（均被忽略，不提交）。
