# AVG Plus：新 AI 接手入口

这份文档交接 `games/avg_plus` 的游戏开发、安卓构建和 GitHub Pages 热更新。先读本页，再按任务进入 [开发与内容维护](DEVELOPMENT.md) 或 [热更新发布手册](../../../builds/android/HOT_UPDATE.md)。无需从整个聊天记录或历史构建日志重新推导流程。

**状态快照：2026-10-14，北京时间。** 本次整理对应游戏发布源码 `5e726ad0805f66d6f3b142ac63d6d4adf1465d6a`。后续文档提交会使 main 前进，不代表客户端资源也发布了新版本。接手时重新查看源码、工作区和线上入口；本页的版本与检查数量是带日期的记录。

## 五分钟开始

1. 阅读 [根仓约束](../../../AGENTS.md) 和 [本游戏约束](../AGENTS.md)。本页不撤销其中的要求；用户最新明确指令优先。
2. 在根仓检查 `git status`、当前分支和最近提交。其他游戏以及本地验证记录可能有未提交工作，不能 reset、清理或一起提交。
3. 看下面的“当前交付”和“尚未完成”，明确本次要完成的边界。
4. 改玩法、UI、剧情或关卡，读 [开发手册](DEVELOPMENT.md)；构建、发更新或恢复上传，读 [发布手册](../../../builds/android/HOT_UPDATE.md)。
5. 实施、做与变更相关的验证、独立中文提交、普通追加推送，并远端回读。只有明确需要发布客户端内容时才构建和发布；纯文档修改不用再发 APK 或热更新。

以下命令在 `little-steps-cocos` 根目录运行。本机路径为 `/Users/wkk/dotWorkers/little-steps-cocos`。

```sh
git status --short --untracked-files=no
git rev-parse --abbrev-ref HEAD
git log -5 --oneline
git remote -v
python3 -B builds/build.py android --game avg_plus --inspect
```

还应按本次修改目录查看未跟踪文件；上面的简短状态命令只是避免将大量私有验证文件刷屏。不要以它代替完整的提交前检查。

## 三仓和 Git 归属

“三仓”目前是**一个 Git 仓库中的三个职责目录**，远端为 `git@github.com:wujiankai8864515/little-steps-cocos.git`，主分支为 `main`。

| 位置 | 职责和入口 |
| --- | --- |
| `games/avg_plus` | Cocos 3.8.8 的 AVG + 高低接龙工程；[游戏说明](../README.md) |
| `games/avg_plus/assets/foundation` | AVG Plus 自身的无引擎微内核；[Mod 架构](MOD_ARCHITECTURE.md) |
| `games/avg_plus/assets/mods` | 游戏规则、Cocos 页面、表现、路由、更新客户端 |
| `games/avg_plus/assets/art` | 原素材、prefab、剧情、关卡与运行配置 |
| `engines/travel-core` | 另一游戏使用的通用框架；不能假定 AVG Plus 已使用它 |
| `games/xiaoyu-cocos` | 小雨／旅行木鱼／Little Steps，属于独立游戏范围 |
| `builds/android` | AVG Plus 安卓配置、处理脚本、启动钩子和图标模板 |
| `builds/build.py` | 所有渠道的公共入口；本任务明确选择 `android --game avg_plus` |
| `migration/tools` | 导入、迁移、构建边界与发布检查工具 |
| `migration/reviews/avg_plus` | 本机验证记录与原始证据；详见后面的证据归属 |
| `migration/work`、`migration/.cache` | 隔离构建和工具临时目录，不是规范源码 |

`games/avg_plus` 已去掉独立 Git 配置，属于根仓普通目录。不要在其中重新 `git init`、创建子模块或新增发布仓。未指定游戏／平台的公共入口默认仍是小雨微信渠道，不能拿它代替 AVG Plus 安卓包。

## 必须延续的用户要求

- **剧情**：不制作视频里的剧情。继续使用游戏已有的 AVG 表现、第一章 28 页 JSON 和自己的衔接逻辑。
- **卡牌**：使用已有卡牌元件、prefab、UI 与原素材。历史视频裁切和 19 牌位夹具仅供追溯，不能重新替代现有 Figma 关卡或原卡牌。
- **关卡**：保留动态读取 JSON。已导入 Figma 40 关、893 个牌位，4 个难度各 10 关，不能退回旧的两三关或硬编码布局。
- **首页占位**：《海风与你》《春日未完》《午夜来信》为“筹备中”，点击只提示；不能扣费、创建剧情章节或写入阅读／通关进度。真实剧情《霸总的假未婚妻》保持可玩。
- **体验**：继续优化图片比例、主页、动画、特效、发牌和完整启动流程；不用缩减功能来换取通过。新 APK 已接入自己的图标和加载页，不能回到 Cocos 默认 Logo／静态等待。
- **版本显示**：各页面随时能看到当前实际运行内容的北京时间 `年-月-日-时-分-秒`。不要显示服务器最新版来冒充已运行版本。
- **发布**：日常自动上传必要变化文件，用户无需反复协助传附件。APK、完整桥接资源和增量资源各有用途，见发布手册。
- **仓库**：用户最新操作是将 `little-steps-cocos` 设为公开，用此仓的 Pages。早先“恢复私有”的讨论已被后续操作覆盖，不能擅自切回私有。`little-steps-play` 已删除，`avg-plus-android-updates` 已弃用，不再依赖或重建它们。
- **磁盘**：必要源码与产物完成 GitHub 回读后，只清理自己生成的最终产物和临时目录。源码、原素材、图标源图、三仓目录、模板、打包必要文件、文档和约束必须保留。
- **提交**：每项实质变更使用独立中文事项 ID 提交，普通追加推送；禁止强推和 squash。仅提交本次文件，不带其他游戏或私有原始证据。
- **权限**：用户已授权继续实现、正常提交推送及发布这些客户端产物，不需反复确认常规步骤。登录或重新验证必须由本人在官方页面完成，不读取密码／令牌，不将凭据写进客户端或文档。

## 当前交付

| 项目 | 2026-10-14 的已核实状态 |
| --- | --- |
| 下载与更新入口 | [GitHub Pages](https://wujiankai8864515.github.io/little-steps-cocos/avg-plus/android/) |
| 最新资源 | `0.1.0.13`，显示 `2026-10-14-22-50-32`，源码 `5e726ad` |
| 本次增量 | 2 个变化文件，ZIP 100,480 bytes，约 98 KiB；没有新图片或 APK。另有索引／元数据流量 |
| 最新可安装 APK | [0.1.0.8 的 AVGPlus-debug.apk](https://github.com/wujiankai8864515/little-steps-cocos/releases/download/avg-plus-android-0.1.0.8/AVGPlus-debug.apk)，显示 `2026-10-14-15-05-51`，56,158,565 bytes |
| APK 身份 | `com.wujiankai.avgplus`，Android versionCode 6，ARM64，竖屏，调试签名预览版 |
| 旧协议桥接 | `latest/avg-plus-version.manifest` 仍为 `0.1.0.8`；增量 `delta/latest/index.json` 为 `0.1.0.13`，这是设计上的两个入口 |
| 原生合约 | `avg_plus-cocos-3.8.8-native-1` |
| 线上发布校验 | 13 的三个附件完成服务端大小／摘要、匿名完整下载、Pages 版本与摘要回读；本次文档整理再次只读核实入口 |
| 最新自动检查记录 | 46 个脚本类型检查、103 项游戏行为通过；18 个原始 UUID 基线缺失仍使资源检查整体失败 |
| 本地构建产物 | 已清理自己的已发布 APK、构建镜像和临时 QA 模拟器；不要把记录中的旧绝对路径当作仍存在的文件 |

源配置 `builds/android/config.json` 与 `config/release-info.json` 中的 `0.1.0.6` 是打包配置起点／开发占位，**不是线上 latest**。发布器从 Releases 分配版本，构建镜像写入时间戳；不要仅为“同步数字”手改源配置。

13 的 APK 安装入口仍指向 8。安装 APK 与资源更新版本不相同是正常的。正式 release 签名尚未配置，不能把公开的 debug 预览版称为正式安卓发行版。

## 验证已经做到哪里

| 验证对象 | 结果和边界 |
| --- | --- |
| 首关与剧情 | Android 35 ARM64 专用模拟器完成 11 张首关、1000 金币奖励、Continue 到原 AVG 02/28、返回目录与冷启动存档保留 |
| 启动／导航 | 新 APK 检查自己的加载动画、无 Cocos 默认 Logo、关卡列表到第 40 关、退出未完成牌局后再入场 |
| 大牌阵 | 52 张牌的开场、合法操作、50 金币回撤与阴影恢复在对应候选上实测；约五秒开场不能当作真机 FPS 结论 |
| 真实旧包联网更新 | 原 0.1.0.0 APK 和旧桥接版本完成相应升级；8→9→10→11 的真实缓存链逐项核对 352 个文件大小与 SHA，健康重启且产品存档保留 |
| 首页对齐修复 12 | 隔离原生候选验证三个占位、快速滑动对齐、边界和点击，完整目录存档摘要不变；候选缓存随后恢复。这次预览不等于原包联网更新 12 成功 |
| 超时修复 13 | 两通道的 6 秒成功、8 秒超时、10 秒任务保护和取消，共 8 项模拟时钟回归通过；干净原生导出引用为空缺列表，线上文件校验通过 |

**没有物理手机验收。13 的实际原包联网更新和新超时效果尚未做原生实测。** 旧版本拉取 13 之前仍执行旧的检查时限，发布 13 本身不会立即改变尚未更新的客户端。此前 11→12 的联网尝试曾在旧 1.8 秒限制下安全使用本地内容。

## 尚未完成，下一步怎么做

| 工作 | 当前事实 | 接手动作 |
| --- | --- | --- |
| 同版本发布恢复 | `publish.py` 仍用移动的 latest 作为增量父版本；13 曾在 Pages 前进后重试报 `Invalid delta parent` | 按 [恢复说明](../../../builds/android/HOT_UPDATE.md#已知问题增量父版本在重试时漂移) 实现按候选 `baseVersion` 固定读取和校验父快照，加恢复回归。一次性恢复脚本已删除，源码问题仍在 |
| 原生慢网与更新 | 13 已发布；实际旧包下载 13、新时限、离线和取消尚未复验 | 从官方现有 APK 和版本索引重建独立 QA 环境，保留存档对照，完成联网／离线／取消实测 |
| 故障恢复 | 文件系统 mock、启动协议测试通过；真实安卓中断／坏版本／切换故障未全覆盖 | 分别验证暂存、重命名、试启动失败、退回上一健康版／APK，不改产品存档 |
| 完整画面与玩法体验 | 已修复多处比例、导航、卡牌和流程问题，完整视频 UI 对照及所有页面验收仍 pending | 使用既有素材逐页检查；剧情继续按本游戏。覆盖不同屏幕、快速触摸、暂停、返回、前后台与奖励一次性 |
| 物理手机性能 | 无物理设备证据；低帧率模拟器和 Node 测量只解释特定问题 | 有实际设备后分别测冷启动、发牌、帧间卡顿和内存；保留测量条件，不先写“不卡顿”结论 |
| 18 个历史 UUID | 初始基线即有缺失，自动资源检查仍失败；最新干净导出 `missingReferences: []` | 追溯原资产和实际引用，修复真实缺失或形成有证据的迁移结论；不删除基线来伪装通过 |
| 正式安卓签名与服务 | `--release` 当前会拒绝；奖励视频、付费宝石、震动服务未完成接入 | 配置并验证后才能宣称正式发布／服务可用；未配置按钮只报告暂不可用，不伪造奖励 |

不要把此表理解为要在文档任务中立即做完全部旧目标。用户继续某一工作时，按明确范围推进，并更新这里的状态与验证边界。

## 文件与历史阅读顺序

| 文档 | 用途 |
| --- | --- |
| [DEVELOPMENT.md](DEVELOPMENT.md) | 代码地图、内容配置、Figma 导入、存档与验证命令 |
| [HOT_UPDATE.md](../../../builds/android/HOT_UPDATE.md) | 构建发布、版本、协议、恢复、清理与操作检查 |
| [ANDROID_REQUIREMENTS.md](ANDROID_REQUIREMENTS.md) | 用户范围及按日期追加的执行事实；旧版本、旧素材方案和 pending 不能直接当作最新状态 |
| [MOD_ARCHITECTURE.md](MOD_ARCHITECTURE.md) | 内核、事务、取消、快照和 Mod 协议 |
| [MOD_GUIDE.md](MOD_GUIDE.md) | Mod 组合与内容／程序协作日常流程 |
| [UI 合约](../GAME_UI_ARCHITECTURE.md) | 原卡牌 prefab 稳定挂点、动作与表现接口 |
| [Mod 模板](../templates/MOD_TEMPLATES.md) | 新增完整能力包的模板 |
| [MOD_MIGRATION.md](MOD_MIGRATION.md) | 2026-09-17 微内核迁移历史；“当时没有热更新”不代表现在没有 |
| [Figma 导入器说明](../extensions/figma-importer/CLAUDE.md) | 既有编辑器扩展；批量关卡转换另外使用 migration 工具 |
| [迁移目录说明](../../../migration/README.md) | 原始来源、工具、失败记录与证据归属 |

最近关键提交可用 `git show <提交>` 追溯：`ebf5459` 修复 Android 缓存目录递归；`dbbae96` 增加三个占位；`024d6b0` 的首次对齐方案实测仍失败；`5d5b114` 修正原生输入排序；`bc1eb2f` 延长两通道检查时限；`5e726ad` 缩减发现索引空白。失败方案没有改写历史。

## 本机环境与证据

构建器通过 `--inspect` 检查工具。当前为 Creator 3.8.8、Android SDK `~/Library/Android/sdk`、NDK `26.0.10792818`、Android Studio JBR 和 Creator 内置 CMake。不要改全局 Creator 模板来修本项目渠道。

当前终端没有系统 `node`，但 `sh tools/check.sh` 会回退到 Creator 自带 Node；较新的 bundled Node 在 `/Users/wkk/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`。在其他机器先发现实际运行时，不能照抄本机绝对路径。

本地 `migration/reviews/avg_plus` 中的 `publication-0.1.0.13.json` 是最终发布成功记录；同候选构建 JSON 还保留最初匿名下载 TLS 失败，不应删除历史失败或据它否定后续已校验的成功。其他关键记录包括 `publication-0.1.0.8.json`、`figma-level-import-20261014.json`、`catalog-candidate12-native-preview.json`、`timeout-final-check.log`、`publication-13-anonymous-tls-20261014.json` 和 `timeout-release-cleanup-20261014.json`。

这些原生录屏、截图、日志和故障证据保持本机私有，**不随公开源码提交**；新 clone 不一定有这些文件。不能虚构它们已备份到公开 GitHub。可公开追溯的是源代码／测试、通用文档和已核验的客户端 Release 附件。没有本地证据时，从源码、公开附件与独立实测重新核验。

自己的临时 AVD、QA 包装 App、下载 APK、一次性恢复脚本和构建镜像已删除。Android SDK／NDK／系统镜像、素材、模板和小型私有证据保留。接手时不要沿用已删除的 `/private/tmp` 工具路径；不要关闭用户无关应用，Creator 导出和图形验证串行执行。

## 可以直接交给新 AI 的提示词

```text
请接手 little-steps-cocos/games/avg_plus。先读根仓与游戏 AGENTS.md，
再读 games/avg_plus/docs/AI_HANDOFF.md、DEVELOPMENT.md 和
builds/android/HOT_UPDATE.md。检查实际工作区、main 和线上索引；文档版本是
2026-10-14 的快照，不可把旧报告、mock 测试或模拟器当作真机验收。

沿用本游戏 28 页 AVG、已有卡牌 UI/素材及动态 Figma 40 关；不制作视频剧情。
三个首页剧本仅筹备占位。全页显示实际运行内容的北京时间版本。
从 builds/build.py android --game avg_plus 构建；日常内容热更新用
--hot-only --publish。先做必要源码备份与验证，普通追加提交推送并远端回读。
注意发布重试仍存在 latest 父版本漂移，按手册固定父版本，不弱化 SHA、TLS、
来源或源码门禁，不覆写公开附件。仅在产物远端核验后清理自身构建产物，
源码、原素材、图标源图、模板、三仓、文档、约束和他人工作全部保留。
当前未完成项按 AI_HANDOFF 的表推进；只处理用户本次指定范围，记录真实边界。
```
