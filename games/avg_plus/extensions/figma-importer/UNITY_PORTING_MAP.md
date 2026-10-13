# Unity 指南移植对照

纲领来源：`/Users/dengchg/tuyou/figma2cocos/figma2unity-v1.0.8/Figma→Unity 导入使用指南.md`

本文件用于约束 Cocos 插件后续开发：先按指南拆功能，再找 Unity 插件中的真实逻辑，最后移植到 Cocos。不要只按“能导入 JSON”判断完成度。

## 总体原则

- Production 路径优先：Figma -> Cocos 直接建当前场景节点，高保真还原视觉与层级。
- 整页导入树的 Prefab 保存/实例化保留 beta 定位，不作为主导入路径；组件映射命中的项目 Prefab
  属于直接场景导入主链。
- 现有 Figma 插件协议尽量不改：Cocos 侧兼容 Unity 的 `127.0.0.1:8787` `/ping`、`/push`、`/pull`。
- 每个功能都要能追到 Unity 源码入口和 Cocos 源码入口；没有入口就标为待移植。

## 当前路线图位置（2026-08-18）

- 当前研发主线从单点深挖切到 **P0/P1 广度收口 + Unity 单一工作流对齐**。本轮已把导入工作台、
  ResourceReplace/Assign Prefab 共用当前 JSON、资源 3 条 P0、文字 1 条 P0 + 2 条 P1，以及 Input
  authored 边界首段写入 working source；全部只能标为 `SOURCE_COMPLETE / PENDING_BUILD /
  PENDING_HOST`。
- 本轮开始前最后完整确认的门禁仍是 `.028 / 110/110 / tsc PASS`，`.027 / 107/107` 已降为历史。
  `.028` 已用实时 Figma MCP 业务画板完成 47/47 SpriteFrame 收敛、首次导入、保存/重载和主体视觉
  冒烟，但旧宿主证据不能自动覆盖本轮新源码，也不关闭反馈表中的原 P0/P1。
- `.028` 当前 fresh 证据来自 `DX1oHM5JylpUq2WxD4f2RB / 78:71233`：567 个导入节点、全场 570，
  133 Sprite / 67 text / 19 Sliced / 32 Button，字体 67/67，资产 141 = 47 ImageAsset +
  47 Texture2D + 47 SpriteFrame；保存/soft reload 后保持、`ERROR=0`。清理后只剩
  Scene/Canvas/Camera，专属资产为 0 / `Asset not found`，Figma 业务源保留。主体视觉冒烟为
  `PARTIAL_HOST_PASS`，不是像素级或客户单关闭结论。
- `.028` 又用实时 Figma MCP `78:72185` 完成九宫 focused contract，全程未读取本地已有 JSON。
  FtoX source/dev 为 `1.2.4 (2026-08-18 08:28:46) / 14/14`，Cocos source/dist/宿主均为 `.028`，
  `110/110`。唯一引用的 `SLICED` SpriteFrame 四边为 `40/40/116/43`，原 `668x299` 与放大
  `1000x500` 均视觉通过并跨保存/soft reload 保持。清理后目标节点/资产为 0，场景回到
  Scene/Canvas/Camera、`dirty=false / ready=true / ERROR=0`。该精确契约为 `HOST_PASS`，但与
  `kCde4RqMEw` 原附件同源关系未证明；同日 live 只读回读仍是 P0 / 测试未通过，3 个 PNG 无
  file/node 且当前 DWS 无下载入口。本次未改表，客户单仍为 `PARTIAL_HOST_PASS`。
- `.028` 继续用实时 Figma MCP `78:71021` 完成 RichText fresh 替代样本，不读取本地 JSON。FtoX
  loaded/build 为 `1.2.4 (2026-08-18 08:28:46)` 且 source/dev `code.js`、`ui.html` 一致，Cocos
  loaded/runtime 为 `.028`。白绿分段、2px 黑描边、Commissioner 工程字体、`124x32` authored
  父节点与唯一 renderer 均通过视觉、属性及保存重载复核；清理后只剩 Scene/Canvas/Camera，目标
  节点/资产不存在，`ready=true / dirty=false / ERROR=0`。替代样本为 `HOST_PASS`；
  `OahovTxd32` 仍为 `PARTIAL_HOST_PASS / BLOCKED_ON_ORIGINAL_SAMPLE`，非零 blur 仍是 Gap。
- 结构一致性中的基础横/竖排与规则 Grid/Wrap 已完成；Input authored 边界与原生 `EditBox` 首段已
  到源码阶段，异构、混合等复杂布局仍后置。Unity importer 本身没有现成 InputField/TMP_InputField
  链路，因此该项记录为 Cocos 先行补齐，不伪装成直接移植完成。
- 组件映射主链已有 `HOST_PASS`：映射命中、Assign Prefab、映射 Prefab 的项目脚本/内部引用，
  `v1.2.4.016` 新增的 `FigmaComponentState`，以及公告业务 JSON 两轮正式导入均已通过；`.028`
  实时业务画板又完成 `353/353` 组件身份保持，但没有新增 Prefab 命中。更多画板与 Prefab 命中
  作为后续业务扩面，不是当前 P0 主线。
- 本轮新增的 Unity 风格导入工作台会把当前 JSON 传给正式导入、ResourceReplace 和 Assign Prefab；
  旧独立 Assign Prefab 的 `HOST_PASS` 保留，但不能替代新工作台跨面板路径继承的宿主验收。
- 组件搜索/缩略图、映射云同步、Cocos -> Figma 反向导出和 Processor 扩展均后置，不与当前主线并行扩面。

## 本轮候选门禁

内部最终候选规划为 `v1.2.4.036 (2026-08-18 Import Workbench and P0 Breadth)`，产品版本仍为
`1.2.4`，本轮不发 FtoC 包。文档更新时 working source 已到 `.035 Input Authored Bounds`；`.036`
只有在最终合并后才允许写入源码，随后必须依次通过：

1. `PENDING_BUILD`：TypeScript 构建和完整自动测试。
2. `PENDING_HOST`：Creator 3.8.7 热加载后由 `getSceneBuildVersion` 读回 `.036`。
3. 宿主回归：实时 Figma MCP + FtoX Working Source + Cocos MCP，覆盖工作台、4 P0、2 P1、Input、
   ResourceReplace 和组件映射；保存、`soft_reload`、截图对照、错误为 0，最后清理测试节点和资产。

只有第 3 步的对应样本通过，才能新增 `HOST_PASS`；旧版本已有的 `HOST_PASS` 仅在原证明范围内保留。

## 功能矩阵

| 指南模块 | Unity 代码入口 | Cocos 当前入口 | 状态 |
| --- | --- | --- | --- |
| Figma -> 引擎推送服务器 | `Editor/Loader/FigmaPushServer.cs` | `source/server.ts`、`source/main.ts#startPushServer` | 已移植；菜单已暴露启动/停止 |
| JSON 文件导入与工作台 | `Editor/FigmaImporterWindow.cs`、`Editor/FigmaImporter.cs` | `source/panels/settings/index.ts`、`static/template/settings/index.html`、`source/main.ts#importFromJson`、`source/scene.ts#buildTree` | 基础导入已有宿主证据；本轮新增 JSON 选择/拖放/记忆、画板元信息预览和正式导入主入口，`SOURCE_COMPLETE / PENDING_BUILD / PENDING_HOST` |
| 解析 Manifest -> 创建层级 | `Editor/FigmaImporter.cs`、`Runtime/FigmaNodeData.cs` | `source/types.ts`、`source/main.ts#prepareScenePayloadFromData`、`source/scene.ts#buildTree` | 已移植 |
| 坐标/尺寸/旋转还原 | `Editor/FigmaImporter.cs` | `source/scene.ts#placeAbsolute`、`source/scene.ts#applyPatchTransform` | 已移植 |
| 约束/锚点适配 | `Editor/FigmaImporter.cs` | `source/scene.ts#applyConstraintWidget` | 已移植到 Cocos `Widget` |
| Auto Layout | `Editor/FigmaImporter.cs` | `source/scene.ts#effectiveHasLayout`、`source/layout-plan.ts` | 基础横/竖排及规则 Grid/Wrap 已移植；安全样本生成 Cocos `Layout.GRID`，异构、混合布局仍回退绝对定位且尚未完成 |
| 图片落盘、查重与资源 P0 | `Editor/SpriteCache.cs` | `source/assets.ts#importAssetWithRetry`、`validateProjectSpriteFrame`、`settleSpriteFrameOnce`、`resolveSpriteFramesBeforeBuild` | 既有链路保留 `.028` 证据；本轮新增三次有界重试、硬失败账本和项目 SpriteFrame 子 UUID live 校验，覆盖 `VkTuabTzHG`、`eBf5Iz9sfZ`，`SOURCE_COMPLETE / PENDING_BUILD / PENDING_HOST` |
| 九宫格/隐式与独立切片 | `Editor/FigmaImporter.cs`、`Editor/SpriteCache.cs` | `source/main.ts#collectSpriteFrameBorders`、`detectImplicitSlice9`、`prepareStitchedImplicitSlice9`、`prepareSlice9ImageVariants`、`source/scene.ts#readSlice9Border` | `.028` focused contract 的旧证据保留；本轮补 Unity 兼容 3/9 独立 PNG 拼合为单 SpriteFrame，覆盖 `kCde4RqMEw`，`SOURCE_COMPLETE / PENDING_BUILD / PENDING_HOST`；原客户附件仍待同源验收 |
| 白图染色/叠色 | `Editor/FigmaImporter.cs` | `source/scene.ts#applyImageColor`、`source/scene.ts#exportSprite` | 已移植 |
| 图片 fill/crop/tile | `Editor/FigmaImporter.cs` | `source/main.ts#preparePersistentImageVariants`、`source/scene.ts#adaptImageFillSpriteFrame` | 已移植 |
| clipsContent / 图片遮罩 | `Editor/FigmaImporter.cs` | `source/main.ts#routeMask`、`source/scene.ts` 遮罩分支 | 部分验证；异形图片遮罩仍需样本回归 |
| 字体资源匹配 | `Runtime/FigmaTextStyleTable.cs` | `source/fontlib.ts`、`source/textstylelib.ts` | 已移植为 Cocos 字体库匹配 |
| TextStyles 样式库 | `Runtime/FigmaTextStyleSet.cs`、`Editor/FigmaTextStyleSetEditor.cs` | `source/textstylegen.ts`、`source/textstylelib.ts`、`generateTextStylesFromJsonBeta` | 已移植为 JSON 索引 + 同名 Prefab 模板；Exact 命中走模板，Fuzzy/未命中安全降级 |
| 文本 P0/P1：对齐、RichText、Exact 模板 | `Runtime/FigmaTextStyleTable.cs`、`Editor/FigmaImporter.cs` | `source/main.ts#normalizeTextSegments`、`source/scene.ts#normalizeRichTextSegmentRuns`、`colorToHex`、`resolveTextStyleTemplatePath`、`applyPatchRichTextFont` | 既有描边/投影和 `.028` 替代样本证据保留；本轮补 token 归一、分段排序/裁剪/补空档、unit/byte 颜色兼容和 `figmaPath -> childName -> 唯一递归` 回退，覆盖 `72WH6AgzHp`、`OahovTxd32`、`PNH4Mra5ue`，`SOURCE_COMPLETE / PENDING_BUILD / PENDING_HOST`；非零 blur 仍降级 |
| 基础组件 Button | `Editor/FigmaImporter.cs` | `source/scene.ts#setupButton` | 已移植 |
| ComponentKey/变体 -> Prefab 与 Assign Prefab | `Editor/FigmaComponentMappings.cs`、`Editor/FigmaComponentMappingWindow.cs`、`Editor/FigmaImporter.cs` | `source/component-mapping.ts`、`source/panels/component-mapping/*`、`source/panels/settings/index.ts`、`source/main.ts`、`source/scene.ts` | 旧独立主链已有有边界 `HOST_PASS`；本轮工作台沿用当前 JSON 扫描并打开 Assign Prefab，`SOURCE_COMPLETE / PENDING_BUILD / PENDING_HOST`，后续按业务画板扩面 |
| `FigmaComponentState` 运行时身份 | `Runtime/FigmaComponentState.cs`、`Editor/FigmaImporter.cs#AttachComponentState` | `source/component-mapping.ts`、`source/main.ts#ensureComponentStateRuntime`、`static/FigmaComponentState.ts`、`source/scene.ts` | `.016` 专项与公告业务 JSON 单样本均 `HOST_PASS`；`.028` 实时业务画板 `353/353` 身份保持、覆盖 58 个身份，保存/soft reload 后保持，但本轮无新增 Prefab 命中 |
| Input 首段 / 复杂混合布局 | Unity 无现成 InputField/TMP_InputField 主链；复杂布局见 `Editor/FigmaImporter.cs` | FtoX `code.js` 输入语义识别；Cocos `source/main.ts` slim contract、`source/types.ts#FigmaInputSpec`、`source/scene.ts` native `EditBox`/authored labels/margins | Input 首段为 Cocos 先行成果，`SOURCE_COMPLETE / PENDING_BUILD / PENDING_HOST`；复杂混合布局仍待移植，规则 Grid/Wrap 不在此待办内 |
| 预览窗口/框选 | `Editor/Loader/FigmaLoaderWindow.cs`、`FigmaPreviewComposer.cs`、`FigmaNodeHitTester.cs` | `source/main.ts#loadJsonPreviewBeta`、`source/panels/settings/index.ts`、`static/template/settings/index.html`、`static/template/replace/index.html` | ResourceReplace 详细预览保持 beta；工作台轻量画板元信息预览为本轮源码完成，待构建/宿主 |
| 局部应用/资源替换 | `Editor/Loader/FigmaNodeReplacer.cs`、`FigmaResourceReplaceWindow.cs` | `source/panels/replace/index.ts`、`source/main.ts#openReplacePanelBeta`、`applyJsonNodeToTargetBeta`、`source/scene.ts#applyNodePatchBeta` | 既有替换机制为 beta；本轮让工作台当前 JSON 自动传入并共享最近路径，`SOURCE_COMPLETE / PENDING_BUILD / PENDING_HOST` |
| 整页替换 | `Editor/Loader/FigmaNodeReplacer.cs` | `source/main.ts#replaceSelectedFromJsonBeta`、`source/scene.ts#replaceTreeBeta` | beta |
| Cocos -> Figma JSON 导出 | `Editor/FigmaExporter.cs`、`Editor/FigmaExportProcessor.cs` | `source/scene.ts#exportTreeForFigma`、`source/main.ts#exportTreeForFigmaPull` | beta；已接 `/pull` 暂存队列 |
| Processor 扩展钩子 | `Editor/FigmaImportProcessor.cs`、`Editor/FigmaExportProcessor.cs`、`PostProcessors/*` | 无项目级 Processor 注册机制 | 待移植 |
| 设置/导入工作台：资源目录、TextStyles、推送服务 | `Editor/FigmaImporterConfig.cs`、`FigmaImporterConfigEditor.cs` | `source/panels/settings/index.ts`、`static/template/settings/index.html`、`static/style/settings/index.css` | 通用资源目录已有入口；本轮与导入、Assign Prefab、ResourceReplace、TextStyles 和推送服务合为主工作台，`SOURCE_COMPLETE / PENDING_BUILD / PENDING_HOST`；默认字体等更细配置仍待产品化 |

## 下一步移植顺序

1. 完成本轮源码集成审查：工作台当前 JSON 必须由正式导入、ResourceReplace 和 Assign Prefab 共用；
   资源、文字、Input 的新逻辑不得形成旁路。
2. 统一写入 `.036 Import Workbench and P0 Breadth`，跑 TypeScript 和完整自动测试；构建通过前所有
   新项保持 `PENDING_BUILD`。
3. 只做扩展热加载，不重启 Creator、不打开 Dashboard；由 Creator 3.8.7 / MCP 9947 读回 `.036`，
   确认实际运行字节与 working source 一致。
4. 集中做宿主回归：面板主流程、4 P0、2 P1、Input、ResourceReplace、Assign Prefab 和组件映射；
   输入使用实时 Figma MCP 与 FtoX Working Source，不依赖已有本地 JSON。每个样本都要保存、
   `soft_reload`、截图/属性对照和检查 `ERROR=0`。
5. 回归后删除所有临时节点和资产，保存场景并确认 `dirty=false`；只有对应样本通过才写 `HOST_PASS`。
6. 再扩原反馈同源附件与更多业务画板；复杂混合布局、组件搜索/缩略图、映射云同步、Processor 和
   Cocos -> Figma 反向导出继续后置。
