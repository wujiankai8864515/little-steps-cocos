# AVG Plus：开发、内容与验证手册

从 [接手入口](AI_HANDOFF.md) 确认当前范围和状态。本页说明去哪里修改、内容怎样进入游戏、怎么验证；安卓打包发布见 [热更新手册](../../../builds/android/HOT_UPDATE.md)。

## 运行和结构

用 Cocos Creator 3.8.8 打开 `games/avg_plus`，等待资源导入与工程声明生成，然后打开 [base-shell/scene.scene](../assets/mods/base-shell/scene.scene) 预览。保留场景、脚本与素材 `.meta` UUID 和原设计画布，不重新搭一套入口场景。

| 修改目标 | 主要源码／配置 | 维护要求 |
| --- | --- | --- |
| 生命周期、事务、快照、取消 | [foundation](../assets/foundation)、[Runtime.ts](../assets/foundation/Runtime.ts)、[Tasks.ts](../assets/foundation/Tasks.ts) | 不依赖 Cocos 或具体玩法；协议变化同时改架构文档与行为测试 |
| Mod 装配与组合 | [Registry.ts](../assets/mods/Registry.ts)、[default.json](../assets/art/resources/mods/profiles/default.json) | 基础玩法也走普通 Mod 接口；会话中不切换规则组合 |
| 启动、页面路由与版本标识 | [AppBootstrap.ts](../assets/mods/base-shell/AppBootstrap.ts)、[StartupPresentation.ts](../assets/mods/base-shell/StartupPresentation.ts) | 第一帧真实绘制后准备内容，首页真实绘制后结束加载；错误和重试入口保留 |
| 首页、详情、收藏、任务、设置、关卡列表 | [CatalogUI.ts](../assets/mods/base-shell/CatalogUI.ts)、[CatalogMod.ts](../assets/mods/base-shell/CatalogMod.ts)、[CatalogConfig.ts](../assets/mods/base-shell/CatalogConfig.ts)、[catalog.json](../assets/art/resources/config/catalog.json) | UI 读取已提交状态；占位与真实故事分开；保留存档兼容 |
| 卡牌规则与状态 | [CardMod.ts](../assets/mods/base-card/CardMod.ts)、[HighLowSolitaireCore.ts](../assets/mods/base-card/HighLowSolitaireCore.ts)、[GameSessionStore.ts](../assets/mods/base-card/GameSessionStore.ts) | 扣费、消除、奖励、回撤在同步事务中完成 |
| 卡牌画面、发牌和完成页 | [GamePageUI.ts](../assets/mods/base-card/GamePageUI.ts)、[GamePresentation.ts](../assets/mods/base-card/GamePresentation.ts)、[CardCompletionUI.ts](../assets/mods/base-card/CardCompletionUI.ts)、[CardShadowFollower.ts](../assets/mods/base-card/CardShadowFollower.ts) | 复用节点／纹理和原挂点；取消或失败能恢复已提交状态 |
| 卡牌 prefab 与牌面 | [gamePage.prefab](../assets/art/resources/prefabs/gamePage.prefab)、[card-catalog.json](../assets/art/resources/assets/poker/card-catalog.json)、[卡牌 UI 合约](../GAME_UI_ARCHITECTURE.md) | 不改稳定挂点名，不用视频牌面覆盖原卡牌 |
| 关卡加载和数据合约 | [CardLevelRepository.ts](../assets/mods/base-card/CardLevelRepository.ts)、[CardLevelTypes.ts](../assets/mods/base-card/CardLevelTypes.ts)、[card-index.json](../assets/art/resources/config/card-index.json)、[card-levels](../assets/art/resources/config/card-levels) | 首屏读索引，入场动态读对应 JSON；不要把全部几何写进 TS |
| 卡牌通关与 AVG 衔接 | [GameFlow.ts](../assets/mods/base-shell/GameFlow.ts)、[game-flow.json](../assets/art/resources/config/game-flow.json) | 当前首关映射到 `first-chapter`；继续已有阅读位置，不替换视频剧情 |
| AVG 内容与表现 | [AvgContent.ts](../assets/mods/base-avg/AvgContent.ts)、[AvgMod.ts](../assets/mods/base-avg/AvgMod.ts)、[AvgPlayer.ts](../assets/mods/base-avg/AvgPlayer.ts)、[AvgPresentation.ts](../assets/mods/base-avg/AvgPresentation.ts) | 保留现有 AVG 格式、页面顺序、角色和选择逻辑 |
| 图片比例与配置式效果 | [ImageLayout.ts](../assets/mods/shared/ImageLayout.ts)、[EffectPlayer.ts](../assets/mods/shared/EffectPlayer.ts)、[effects](../assets/art/resources/effects) | 背景等比裁切，人物等比显示；加载／动画归任务作用域，不非等比拉伸 |
| 原生更新 | [NativeDeltaUpdate.ts](../assets/mods/base-shell/NativeDeltaUpdate.ts)、[NativeHotUpdate.ts](../assets/mods/base-shell/NativeHotUpdate.ts)、[DeltaProtocol.ts](../assets/mods/base-shell/DeltaProtocol.ts)、[UpdateProtocol.ts](../assets/mods/base-shell/UpdateProtocol.ts) | 来源、版本、哈希、试启动、回退和取消不能弱化 |

基础模块为 `base-shell`、`base-card`、`base-avg`；可选例子是 `reward-variant`、`story-branch`、`cinematic-style`，默认不启用。新增能力以完整包组织，不把每个按钮或每条动画拆成 Mod。

## 事务、存档与表现边界

完整协议见 [MOD_ARCHITECTURE.md](MOD_ARCHITECTURE.md)。必须延续：

- 每个 Mod 的状态是按 ID 分区的纯 JSON，不能塞入 Node、资源、Promise、类实例、undefined 或循环引用。
- `execute`、`beforeCommit`、`validate` 同步执行；候选校验通过才一次提交。`render` 同步返回表现任务，动画不能控制结算是否发生。
- 异步资源和动画归 `TaskScope`；每次 await 后检查任务／渲染代次。取消、迟到回调、退出与销毁清理幂等。
- 回撤、重开和快照兼容必须明确。表现出错恢复规则状态，不能为重播动画重复发奖励。

产品存档由 `CatalogMod.ts` 管理，主键为 `avg-plus.catalog.v1`，备用有效代次为 `.previous`。它保存金币、宝石、任务、关卡、阅读位置、设置和牌局标识；两代都坏时报告并保留原存档，不静默清零。

入场按牌局 ID 记账。尚未操作的失败入场可以退费一次；操作后不再可退。退出未完成牌局必须关闭对应 round，旧会话的晚回调不能覆盖新会话。卡牌已提交结果先写 checkpoint 并确认存档，再播放飞牌／奖励；写入未确认不得跳转 AVG。重复完成回调不能重复计入同一牌局的奖励或任务次数。

当前 [catalog.json](../assets/art/resources/config/catalog.json) 的默认数值：初始 5700 金币／40 宝石，入场 500，通关 1000，回撤 50，万能牌 500 起每次递增 100，补备用牌 500；五格连击、抽牌清空连击、普通连击金币奖励为 0。以真实配置为准，不把测试存档余额 4800 等当作新玩家初始值。规则测试使用充足金币不代表每一关都能免费通关。

运行中的牌局快照与产品持久存档是不同接口。修改存档结构需保留兼容与恢复依据；不要删 localStorage 或卸载应用来掩盖进度问题。安卓热更新缓存和产品存档也必须分开，缓存清理不能清除钱包或阅读进度。

## 剧情与首页占位

剧情章节入口在 [avg-chapters.json](../assets/art/resources/config/avg-chapters.json)。当前 `first-chapter` 对应 `drama_fake_fiancee` Bundle，加载路径为 `chapters/第一章`，源内容位于 [霸总的假未婚妻](../assets/art/dramas/霸总的假未婚妻)。第一章有 28 个 JSON 页面。

JSON 保留 `chapter`、`page`、`background`、`roles`、`dialogue`、`choices` 等既有字段。`page` 使用数字字符串并按数字顺序读取；章节／页组合不得重复。新增页面保留资源和 `.meta`，通过章节配置进入加载流程，不硬编码总页数或导入视频台词。通关映射和目录阅读入口要一起检查，已有阅读位置不能被每次 Continue 重置。

真实可读内容放在 `catalog.json` 的 `stories`。三个假剧本放 `placeholderStories`，复用真实故事准备好的原背景／角色；不得给占位绑定收费事务或假的章节 ID。内容变动须检查封面、状态、滑动对齐和按钮都能完整显示。

## Figma 批量关卡生产

### 来源与导出格式

当前 Figma 文件 key 为 `YMuq2nhziNuRf309T17tkc`，页面为“卡牌玩法界面”，页面 ID `4:2`。[Figma 页面](https://www.figma.com/design/YMuq2nhziNuRf309T17tkc?node-id=4-2)。这里导出的是牌阵与开场当前牌，不是排行榜数据，也不是运行时直接联网读取 Figma。

现有转换器为 [import_avg_figma_levels.py](../../../migration/tools/import_avg_figma_levels.py)。它**读取已导出的本地 JSON**，不自行登录或拉取 Figma。做新的 Figma 导出时先按当前会话提供的 Figma 工具／技能要求读取结构，保留来源证据；不要把预览截图识别结果当作精确节点坐标。

每个 `level_difficulty<难度>_<两位序号>` frame 提取 `bp_poker` 牌阵和 `bp_open_hand` 中唯一当前牌。源 JSON 结构如下；cards 的坐标是牌中心相对牌阵左上角的坐标，次序是 Figma 的兄弟绘制顺序。

```json
{
  "fileKey": "YMuq2nhziNuRf309T17tkc",
  "pageName": "卡牌玩法界面",
  "levels": [{
    "id": "Figma frame ID",
    "name": "level_difficulty1_01",
    "board": {
      "id": "bp_poker ID",
      "width": 1179,
      "height": 779,
      "cards": [["node ID", "poker_back_01", 162, 243, 589.5, 389.5, 0]]
    },
    "hand": [{"id": "current card node ID", "name": "poker_heart_red_03"}]
  }]
}
```

这个片段只说明格式，不是实际首关配置。当前 40 关完整数据以游戏 JSON 为准。

### 转换与维护

转换保留 `schemaVersion: 1`：

- 中心坐标变为 `x = centerX - boardWidth/2`、`y = boardHeight/2 - centerY`；保留旋转与绘制层级。
- 原卡牌尺寸为 162×243，卡牌语义通过已有 `card-catalog.json` 校验。
- 后绘制的旋转矩形与前面牌重叠面积大于 1 平方像素时产生遮挡；同时写 `coveredBy` 与 `covers`，只碰边不算遮挡。
- 根据牌位数量、10 张备用牌、1 张当前牌和重复指定牌面计算 `deckCount`，支持最多 4 副；不能为满足单副牌上限删牌。
- 输出 `card-levels/<levelId>.json` 与排序的 `card-index.json`；原有 JSON 的 `.meta` 保留，新 JSON 的 UUID 按固定命名空间生成。

在根仓先做只读校验，再确认新增／变动范围后写入：

```sh
python3 -B migration/tools/import_avg_figma_levels.py migration/reviews/avg_plus/figma-level-source-20261014.json --verify-only
```

该命令针对本机已保存的旧导出，不是同步最新 Figma。新 clone 可能没有该私有文件；需要先重新精确导出，再将路径替换为新导出。

实际写入用相同命令去掉 `--verify-only`，并传入**本次**源 JSON。当前工具会把旧关卡保存在 `migration/history/avg_plus/pre-figma-20261014`，并使用固定的 `figma-level-import-20261014.json` 报告名。再次导入前应先把工具的报告／备份命名改为本次日期或唯一 ID，保留原报告；不要覆盖历史证据。输出差异确认后只提交必要游戏 JSON、metadata 和工具代码，原始私有导出不自动公开。

新导入必须核对数量、难度、名称、全部牌位、原卡牌资产、遮挡、当前牌和索引，逐关验证开始、恢复、操作、回撤与结束。此前 40 关共 893 个牌位；Figma 命名为权威，旧本地第 1／2 关几何曾与新命名互换，不能按照旧序号擅自调回。

原 19 张视频牌位配置作为显式兼容夹具保存在历史／测试中，不是当前 11 张首关。不要为了让旧测试“看起来一致”覆盖最新 Figma 数据。既有编辑器 [figma-importer](../extensions/figma-importer/CLAUDE.md) 与这个批量 JSON 转换器是两条工作流，改其中之一不能宣称另一条已验证。

## 卡牌、图片、动画与图标

美术／内容日常修改先按 [MOD_GUIDE.md](MOD_GUIDE.md) 和 [UI 合约](../GAME_UI_ARCHITECTURE.md) 进行。`assets/art` 不放 TS／JS；Figma 生成的脚本归 `assets/mods/shared/figma-runtime`。

图片在显示时等比适配：背景允许等比裁切，透明人物与完整封面保持比例。检查不同屏幕与透明留白，不通过分别修改宽／高比例消除空白。源图保留；渠道 PNG 优化仅改变隔离导出的压缩存储，并校验解码扫描线与非 IDAT 元数据不变。

发牌使用一个累计时间时钟安排桌面、备用与当前牌，到期动作在慢帧补发，所有落位后再翻面；不要重新改成每张牌依次 await 一个间隔，避免 Tween 首帧和帧取整误差逐牌累加。节点复用、牌面预热、有限特效、取消和阴影复位一起维护。低 FPS 下按时发出牌不等于真实手机已流畅，必须测受影响实际设备。

首页滑动对齐观察真实 TOUCH_END／CANCEL 与 ScrollView 结束；位移在 Cocos update 中应用，必须在位移更新后对齐。按钮模拟取消、仍在拖动和未结束的惯性不能被当作立即吸附触发。这里有已实测失败的旧方案和回归，不应简单只留下 `SCROLL_ENDED` 监听。

Android 图标的必要源文件在 [source/android-icon](../source/android-icon)，包括原图、各密度 PNG 和 `generation.json` 来源记录。渠道 XML 在 [avg-plus-icons](../../../builds/android/templates/avg-plus-icons)。它们覆盖普通、圆形、自适应、主题单色和 Android 12 启动图标，不能当作已构建 APK 的临时图片删除。

## 新增 Mod

1. 在 `assets/mods/packages/<id>` 建完整包，参考 [MOD_TEMPLATES.md](../templates/MOD_TEMPLATES.md)。
2. 编写 `manifest.json` 与工厂，在 [Registry.ts](../assets/mods/Registry.ts) 注册，在 profile 配置启用与参数。
3. 在游戏目录执行 `node tools/generate-manifests.cjs`，生成对应 `ModManifest.ts`；无系统 Node 时使用实际可用的 bundled Node 或 Creator Node。
4. 编写与真实协议边界相关的测试，检查新能力的状态、重开、回撤、失败、取消和快照兼容。
5. 提交 manifest、生成代码、配置、资产与 meta，确认资源层没有脚本、内核没有反向依赖。

不能只编辑生成的 `ModManifest.ts` 而不改来源。只改倍率、位置、时长和特效参数时优先改已有配置，不新增补丁模块。

## 验证命令和判断结果

在游戏目录运行：

```sh
sh tools/check.sh
```

脚本依次进行类型、`tests/*.test.cjs` 行为和资产／清单检查。先通过 Creator 生成 `temp/declarations`；脚本会在无系统 Node 时回退到本机 Creator Node。原始 UUID 基线见 [migration-uuid-baseline.json](migration-uuid-baseline.json)，当前仍有 18 个历史缺失；因此“类型和行为通过”不能写成“全检查通过”。不要删除基线项来掩盖失败。

在根仓按改动选择安卓工具检查：

```sh
python3 -B migration/tools/test_android_channel.py
python3 -B migration/tools/test_android_delta.py
python3 -B migration/tools/test_android_pages.py
python3 -B migration/tools/test_android_publisher.py
python3 -B migration/tools/test_android_png_storage.py
```

原生启动钩子另用实际可用 Node 执行 `node --test migration/tools/test_android_bootstrap.cjs`。当前本机没有系统 `node`，可以使用接手入口列出的 bundled Node。不要仅为文档或无行为影响的小改动重新跑全部游戏／原生构建；选择能验证实际改动的检查。

| 修改 | 有意义的验证入口 |
| --- | --- |
| 规则、回撤、组合、存档 | `runtime`、`gameplay`、`catalog`、`game-flow`、`entry-recovery`、`checkpoint-before-motion` 测试和真实完整流程 |
| Figma 关卡 | `figma-levels` 测试；全部真实关卡的 JSON、牌数、遮挡、快照与通关行为 |
| 发牌、阴影、特效 | `opening-clock`、`presentation`、`card-shadow-recovery` 测试；原生大小牌阵的实际画面与输入 |
| 占位和快速滑动 | `catalog-carousel`、`catalog-navigation` 测试；原生三个占位与边界点击，前后存档摘要 |
| 更新检查和状态切换 | `update-discovery`、`hot-update`、`delta-update`、`native-health` 测试；启动钩子测试；真实旧包联网与故障恢复 |
| 渠道／Pages／上传 | 对应 Python 检查；实际产物审计、匿名完整下载、Pages 回读 |

这些测试名对应游戏 `tests/<名字>.test.cjs`。测试或导出通过不能替代实际页面、原生输入、联网更新、真机性能或用户认可。

图形运行与 Creator 导出串行，一次只运行自己的一个引擎页面。原生测试只操作专用 QA 环境，不清除用户数据、不关闭无关应用。此前 Codex 内置浏览器的重复 Godot 截图路径有崩溃证据，不再用于当前工程；真实 UI 操作使用当次支持的工具，不能借 ADB 输入绕开 UI 自动化约束。

## 每次改动结束

记录具体触发、改前／改后结果、代码／模拟测试／实际设备的边界以及仍 pending 的项目。私有截图、设备日志和失败记录归本机 `migration/reviews/avg_plus`，不随公开源码提交。

按本次文件检查 `git diff` 与 `git diff --check`，独立中文事项 ID 提交，普通推送并远端回读。修改发布方式、协议或完成待验项时更新 [AI_HANDOFF.md](AI_HANDOFF.md) 与相关手册；历史报告保留原时点和原字节，不改成最新 PASS。源码变化需要发布客户端时，再走公共安卓入口，不直接改导出包或手工丢附件。
