# AVG Plus：安卓构建与热更新发布手册

本页是 `games/avg_plus` 的操作手册，以实际 [build.py](build.py)、[publish.py](publish.py)、[pages.py](pages.py) 和客户端协议为依据。工程与用户约束先读 [新 AI 接手入口](../../games/avg_plus/docs/AI_HANDOFF.md)。状态快照为 **2026-10-14，北京时间**；接手时重新回读线上数据，不从文件名或旧报告推断 latest。

## 日常最短流程

以下命令均在 `little-steps-cocos` 根目录执行。

1. 检查工作区和本次差异，完成对应验证。只提交必要源码、素材、模板与文档，不带原生日志、截图或临时产物。
2. 用中文事项 ID 独立提交并普通推送，回读 `origin/main`。发布器会检查冻结输入是否属于远端当前 main；本地构建成功不代表允许发布。
3. 只有游戏 JS／资源改变时使用增量命令；需要首装、原生变化或修复旧更新客户端时使用 APK／完整桥接命令。
4. 等待服务端摘要、匿名完整下载和 Pages 版本／摘要核对完成。失败时保留同一候选，按恢复章节处理。
5. 发布器默认只清理本次已验证的隔离构建与对应固定输出。核验发布记录、线上入口以及源码／模板仍在；不能用整仓清理代替它。

```sh
# 只读检查本机工具与游戏映射，不构建。
python3 -B builds/build.py android --game avg_plus --inspect

# 日常内容更新：导出、比较实际文件、上传增量，不编译 APK。
python3 -B builds/build.py android --game avg_plus --hot-only --publish

# 首装／完整桥接：生成调试 APK、完整资源和旧协议清单。
python3 -B builds/build.py android --game avg_plus --publish
```

这两条发布命令已经得到用户对本项目客户端产物的授权，不需要用户逐次手工传附件。账号授权失效或 GitHub 要求本人验证时，由本人在官方页面完成，不读取凭据；不能通过关闭安全校验恢复发布。

纯文档修改只提交推送，不发资源版本。用户只要本地候选时去掉 `--publish`，并明确标注未上线；离线候选的版本／基线语义见下文。

## 何时要 APK，何时只要增量

| 变化 | 操作 |
| --- | --- |
| 游戏规则、页面、剧情 JSON、关卡、图片、音频、已编译 Bundle | 通常 `--hot-only --publish`，上传实际变化文件 |
| 新用户安装 | 从 Pages 下载最新 APK；安装后检查后续资源更新 |
| 引擎、native 插件、ABI、权限、包名、启动钩子、原生主题或应用图标 | 重新生成 APK；native／引擎合约变化时更新 `nativeCompatibility` |
| 旧客户端自身更新实现有缺陷 | 评估新的完整桥接／APK，使旧客户端能先取得修复；不能仅发布一个旧客户端无法安全应用的增量 |
| 正式签名包 | 当前未接入，`--release` 会拒绝；需先配置并验证正式签名，不能把 debug 包改名冒充 |

完整桥接一般发布 5 个实际附件：`AVGPlus-debug.apk`、完整 `avg-plus-assets.zip`、两个旧协议 manifest、完整 `avg-plus-content.json`。日常增量发布 3 个：变化文件 ZIP、`avg-plus-delta.json` 和完整 `avg-plus-content.json`。

Release 的 `Source code (zip/tar.gz)` 是 GitHub 自动提供的源码归档，不是客户端每次需要下载的资源。客户端普通增量不下载新 APK，也不重复下载未变图片。Cocos 合并的 JS 或 JSON 只要发生变化，仍上传整个变化文件；当前没有二进制补丁或任意切片。

构建过程仍需要完整隔离导出，并在本地暂时准备完整资源 ZIP 来计算和验证差异；“只上传必要文件”不等于“构建时完全不占临时空间”。成功后默认清理这些产物，不留每次的历史 APK。ZIP 大小也不等于总流量，索引、元数据和跨多个版本的增量另占网络字节。

## 版本身份和当前线上快照

| 身份 | 用途 |
| --- | --- |
| `0.1.0.n` | 四整数内部资源版本，用数值比较，关联 Release tag 和不可变资源目录 |
| `YYYY-MM-DD-HH-mm-ss` | 北京时间显示版本；来自实际运行内容的 `config/release-info.json` |
| Android `versionCode` | APK 覆盖安装的整数版本；与资源版本不是同一个序列 |
| `nativeCompatibility` | 游戏资源与 native／引擎的兼容合约；不匹配要换 APK |
| `sourceCommit` 与 `workingInputs` | 冻结候选对应的源码提交与逐文件 SHA，供备份和发布门禁核验 |

`--publish` 从 Releases 分配下一资源版本。构建器在隔离镜像写入时间版本、渠道身份和 release-info，不改规范源码。源配置里的 `hotUpdateVersion: 0.1.0.6` 是起点，源 release-info 显示“开发版本”；不要每发一次包就把这两个文件手改成 latest。

2026-10-14 的线上已核实状态：

| 内容 | 版本／大小／摘要 |
| --- | --- |
| 最新资源 | `0.1.0.13`；显示 `2026-10-14-22-50-32`；源码 `5e726ad0805f66d6f3b142ac63d6d4adf1465d6a` |
| 13 增量 ZIP | 100,480 bytes，2 个变化文件；SHA-256 `14ed79167b8e4dd2e016b8c8a8903620fd60e31973d8a30c18b060187d9270d3` |
| 13 完整文件索引 | 71,737 bytes；SHA-256 `aac336cb8089a903877c1d50a6b4906c12197fbea84f9e2db3b21a91424d92a9` |
| 13 增量元数据 | 72,283 bytes；SHA-256 `d47249b492ccc2649236463d0b4e734c986d7ba1efd8716bde080a251e71bc8d` |
| 最新 APK／完整桥接 | `0.1.0.8`；显示 `2026-10-14-15-05-51`；Android code 6；原生合约 `avg_plus-cocos-3.8.8-native-1` |
| APK | 56,158,565 bytes；SHA-256 `91e51fae260dbed19a3cace7402a124284d8834db75ed1518bfa764b29a84411` |
| 8 完整 ZIP | 32,105,728 bytes，352 个游戏文件；SHA-256 `0fad781169a2958f1be48d96df6cb9804e727ba1864d2cc3df4dad65c7bb3377` |
| APK 调试证书 | SHA-256 `5d28400e0ad52af0ed29c8c879f91c0dd9d56526f8c16e5ef5f8f474abe01141`；不等于正式发行签名 |

后续修复必须使用新资源版本，不能覆写公开版本附件或用 `--clobber`。保留已发布桥接和增量链，不为节省本地空间删除 GitHub 中仍被链引用的版本。

## 站点与附件位置

唯一仓库为 `wujiankai8864515/little-steps-cocos`，用户已设为公开。入口为 [Pages 下载页](https://wujiankai8864515.github.io/little-steps-cocos/avg-plus/android/)。客户端匿名 HTTPS 下载，不携带 GitHub 凭据。

以下路径相对 `https://wujiankai8864515.github.io/little-steps-cocos/avg-plus/android/`：

| 路径 | 内容 |
| --- | --- |
| `latest/avg-plus-project.manifest`、`latest/avg-plus-version.manifest` | 最新完整桥接的旧协议发现入口；目前为 8 |
| `versions/<version>/avg-plus-assets.zip` | 完整桥接 ZIP，不可变 |
| `versions/<version>/avg-plus-project.manifest`、`avg-plus-version.manifest` | 对应桥接的不可变清单 |
| `delta/latest/index.json` | 现代增量发现入口；schemaVersion 2、桥接版本、完整可达版本链，目前 latest 13 |
| `delta/latest/avg-plus-content.json` | latest 的完整文件快照；构建新增量的默认基线，**会随 latest 前进** |
| `delta/versions/<version>/avg-plus-assets.zip` | 此版必要变化文件 ZIP，不可变 |
| `delta/versions/<version>/avg-plus-delta.json` | 此版父版本、changed、removed、完整目标文件索引及 ZIP 摘要，不可变 |

**Pages 的 `delta/versions/<version>` 没有单独的 `avg-plus-content.json`。** 要恢复某个历史父快照，应读取该版本 GitHub Release 上的完整索引附件，不能猜一个不存在的 Pages URL。

Release URL 模式：

```text
https://github.com/wujiankai8864515/little-steps-cocos/releases/tag/avg-plus-android-<version>
https://github.com/wujiankai8864515/little-steps-cocos/releases/download/avg-plus-android-<version>/avg-plus-content.json
```

当前 APK 在 [8 的 Release](https://github.com/wujiankai8864515/little-steps-cocos/releases/tag/avg-plus-android-0.1.0.8)，当前资源在 [13 的 Release](https://github.com/wujiankai8864515/little-steps-cocos/releases/tag/avg-plus-android-0.1.0.13)。旧协议 latest 为 8、增量 latest 为 13 并非部署落后。

## 构建器具体做什么

配置归 [config.json](config.json)，公共入口归 [builds/build.py](../build.py)。环境由构建器发现，允许 `COCOS_CREATOR`、`ANDROID_SDK_ROOT`、`ANDROID_NDK_HOME`、`AVG_PLUS_JAVA_HOME` 覆盖实际工具路径。

1. 枚举游戏、安卓渠道和公共入口的 tracked／非 ignored 文件，逐项计算冻结输入 SHA；未提交且未 ignored 的文件也可能被构建读取。
2. 在 `migration/work/avg-plus-android-<UTC唯一时间>` 建隔离工程，复制游戏输入并写本次渠道／版本配置。复制前后、导出后、编译后重新比较输入。
3. 调 Creator 3.8.8 导出，审计实际生成入口、SDK 参数和缺失引用；关闭默认 Logo／强制两秒 Splash，安装自身启动钩子和图标，只修改隔离导出。
4. [png_storage.py](png_storage.py) 只重压缩导出 PNG 的 IDAT，扫描线及其他元数据逐字节验证不变，规范素材不变。
5. [hot_update.py](hot_update.py) 将游戏 `src`、Bundle 配置、动态 JSON、图片与音频打成完整 ZIP；排除引擎 `cocos-js`，不把顶层引擎启动、JSB 适配器、native 身份或启动钩子作为游戏热资源。
6. [delta.py](delta.py) 对完整文件索引逐项比较 path／bytes／SHA；生成 changed／removed、变化 ZIP 和完整目标快照。最终链验证使用完整索引，不仅检查变化 ZIP。
7. 非 `--hot-only` 时编译 APK，实际审计包名、显示版本、code、竖屏、ABI 与证书。不能仅检查 Gradle 模板或 Creator 退出码就宣称 APK 成功。
8. 候选成功后更新固定 `builds/android/avg_plus`；失败不将不一致候选冒充当前产物。记录位于 `migration/reviews/avg_plus/<candidate>.json`。

`--hot-only --publish` 自动读取线上 latest 完整快照来建立新增量。**单独的 `--hot-only` 不会自动取得线上基线**；未给 `--delta-base` 时可能仍生成完整桥接资源，不能把参数名称当作增量证明。离线候选使用已核验的本地父快照和显式新版本，例如：

```sh
# 将 NEXT_VERSION 和 VERIFIED_BASE.json 替换为真实分配／核验的值。
python3 -B builds/build.py android --game avg_plus --hot-only --hot-version NEXT_VERSION --delta-base VERIFIED_BASE.json
```

候选默认配置的版本可能早于线上。不要直接发布默认旧版本候选；并行发布时也要检查分配是否冲突，公开内容不同必须新分配版本。构建期间不要继续修改相关源码／模板／文档输入；已变化则保留失败依据并重新从公共入口构建。

## 自动发布和 Pages 门禁

[publish.py](publish.py) 当前顺序：

1. 要求冻结输入未变化、导出检查通过、正确目标仓库／tag 与有效 GitHub CLI 授权。
2. 校验完整桥接 payload 或增量父快照、变化 ZIP 和完整目标索引。
3. 回读远端 `refs/heads/main`，要求与候选 `sourceCommit` **完全相同**；逐个从该提交读取 `workingInputs` 文件并比对 SHA。不是“只要提交在历史里就可以”。
4. 创建同一 tag 的草稿，逐项上传真实附件。每个附件最多 4 次上传尝试，核对服务端 `state`、size 与 `digest`。
5. 已有同名且 size／SHA 一致的附件复用；仅自己的草稿空残件可删除重试。已上传不同内容、非空残件或已公开不同附件都停止，不覆写。
6. 全附件服务端校验后开放预览 Release；随后匿名完整下载所有实际附件，核对总字节与 SHA。
7. 触发 main 的 Pages workflow，最多等待 900 秒；回读桥接不可变清单或增量索引中的对应版本和 ZIP 摘要。
8. 写 `publication-<version>.json`，再默认清理自己的已验证输出。

“Release 已可见”只是第 6 步前后的状态，不能代替匿名完整下载或 Pages 成功。匿名 TLS 下载目前没有自动有界重试包装，失败会保留候选供恢复；不要仅凭服务端 digest 跳过匿名下载。

Pages 配置归 [.github/workflows/avg-plus-pages.yml](../../.github/workflows/avg-plus-pages.yml)。手动触发、Release published／edited，以及 main 上 workflow／pages.py／delta.py 的指定变更触发部署。Release 事件先转到 main，保留 `github-pages` 环境保护；并发组 `avg-plus-pages` 不取消正在进行的部署。

[pages.py](pages.py) 从 Releases 组装站点，验证完整桥接 ZIP、文件大小／SHA／路径，以及所有增量父子关系和最新版本可达性，再由 Actions Pages artifact 部署。资源不提交到源码分支。增量发现索引只去掉 JSON 排版空白，协议字段、完整链与文件索引保留。

只需要修复站点部署时可查看／触发现有工作流，无需再上传相同包：

```sh
gh run list --repo wujiankai8864515/little-steps-cocos --workflow avg-plus-pages.yml --limit 5
gh workflow run avg-plus-pages.yml --repo wujiankai8864515/little-steps-cocos --ref main
```

触发后回读具体 run 和站点；不能只因 dispatch 成功就宣称站点上线。

上述 `gh` 指官方 GitHub CLI；本机可执行路径是 `/opt/homebrew/bin/gh`，当前 shell 若找不到 `gh`，用该绝对路径代替，不修改系统配置或读取授权令牌。

## 客户端下载、试启动与回退

对应源码为 [NativeDeltaUpdate.ts](../../games/avg_plus/assets/mods/base-shell/NativeDeltaUpdate.ts)、[NativeHotUpdate.ts](../../games/avg_plus/assets/mods/base-shell/NativeHotUpdate.ts)、[DeltaProtocol.ts](../../games/avg_plus/assets/mods/base-shell/DeltaProtocol.ts) 和 [hot-update-bootstrap.js](templates/hot-update-bootstrap.js)。

- 启动钩子在 SystemJS／游戏模块加载之前恢复搜索路径，检查 native 合约、打包版本、屏蔽版本和试启动状态。
- 旧单 ZIP 客户端先经完整桥接升级；现代客户端按当前实际缓存／APK 版本下载需要的连续增量。跨版本不是直接只取最后一个 ZIP。
- 增量在 `avg-plus-hot-update-next/` 私有暂存中准备；只按已验证目标完整索引复制当前缓存的实际文件，不递归 Android `listFiles`，不复制孤立资源或产品存档。
- 下载最多并发 1 项，ZIP 解压前核对 SHA-256 和精确大小，应用 changed／removed，再逐项校验最终完整内容。Cocos manifest 字段名 `md5` 在本实现装的是 SHA-256，不可更换为弱哈希。
- 当前缓存为 `avg-plus-hot-update/`，上一健康缓存为 `avg-plus-hot-update-previous/`，状态为 `avg-plus-hot-update-state.json`，恢复日志为 `avg-plus-hot-update-journal.json`；它们都位于应用 writable path。
- journal 记录 staging／swapping／probing，更新模块中的状态与 journal 写入采用临时文件再原子改名。启动钩子的早期探测／屏蔽路径仍直接写标记，不能将所有写入路径概括为原子写入；真实中断验证仍 pending。完整验证后才交换目录，保留上一健康版，重启试运行。
- `probePending`／`probeAttempted` 表示新内容尚未健康确认；真实首页打开后才确认并删除上一版。试启动期间先到健康首页，不叠加下一轮更新。
- 失败或下一启动仍未健康时退回上一健康缓存／APK 并保留 `blockedVersion`；修复的新版本仍可以更新。不要清屏蔽标记来反复安装坏版本。
- 覆盖安装 APK 时淘汰不比打包版本新的缓存，必要时保留更高失败版本屏蔽；只作用于更新缓存，不清产品存档。

校验文件会按小时间预算让出执行权；ZIP 解压前的摘要仍按 Cocos verify 回调同步完成。这些是实现边界，不等于任何手机上都不会掉帧。

### 超时的准确含义

[UpdateProtocol.ts](../../games/avg_plus/assets/mods/base-shell/UpdateProtocol.ts) 的当前常量：请求 `UPDATE_CHECK_TIMEOUT_MS = 8000`，单次检查任务 `UPDATE_CHECK_BUDGET_MS = 10000`。增量发现和旧桥接清单两个通道都用此限制。下载任务仍为 600,000ms，下载失败最多再试两次。

**8 秒是单次请求，10 秒是单次检查任务保护，不是整个启动的总上限。** 增量检查失败再尝试旧协议，以及后续下载／校验，可能使总时长更长。取消要中止传输并拒绝晚响应，超时继续本地内容，不能无限等。

这些常量随资源 13 生效。还没拉到 13 的旧客户端检查时仍使用旧 1.8 秒逻辑；需要实际验证首次升级，不能以服务器已发布推断它已用新时限。

## 同一候选恢复发布

首先找到本次候选 JSON，确认记录与 stage 仍存在、冻结输入未变化、附件状态、Pages latest 和源码 main。不要反复构建制造多个历史包。

常规入口：

```sh
# <candidate> 替换为实际保留的候选名。
python3 -B builds/android/publish.py --record migration/reviews/avg_plus/<candidate>.json
```

已有一致附件复用，继续剩余校验。**下述父版本问题及 exact-main 检查仍适用**，不能无条件承诺这条命令对所有历史记录都可续传。产物已清理的成功版本不需要也不能用旧 stage 重跑；从线上核验即可。

### 已知问题：增量父版本在重试时漂移

当前源码 `publish.base_snapshot(game)` 总是读 `delta/latest/avg-plus-content.json`。创建新候选时这样选择父快照可用，但恢复已生成的候选时必须绑定其 `baseVersion`。如果附件公开后 Pages 已前进，再用 latest 校验同一候选就会选错父版本。

13 的实际过程：上传与服务端摘要成功，匿名完整下载遇到 TLS `SSLEOFError`；Release 事件先使 Pages latest 从 12 前进到 13。按原记录重跑发布器时拿到父快照 13，而候选 13 的 `baseVersion` 是 12，因此报 `Invalid delta parent`。这不是需要覆写附件或改候选父版本的问题。

13 已通过一次性恢复完成全部正式校验：从 **12 的 Release 完整索引附件**读取父快照，按此前发布摘要与大小核验，验证 schema／version／合约，然后将该父快照提供给现有 canonical `publish()`。没有跳过 ZIP、文件、源提交、服务端、匿名下载或 Pages 检查，也没有关闭 TLS。一次性 wrapper 已删除，**永久源码修复尚未实现**。

12 的父快照锚点是 71,737 bytes、SHA-256 `5ae11d0429813035bba80dd85203449d4ec8e574e86e10c655579f0a5cfe2944`，对应附件：

[0.1.0.12 的 avg-plus-content.json](https://github.com/wujiankai8864515/little-steps-cocos/releases/download/avg-plus-android-0.1.0.12/avg-plus-content.json)。这个锚点只适用于恢复以 12 为父版的候选，不能照搬给以后所有版本。

接手修复应保持如下边界：

1. 从候选 metadata 取得真实 `baseVersion`，按固定版本查同仓 Release 完整索引；没有对应父快照或来源不匹配则拒绝。
2. 校验该附件已发布的大小／SHA、schema、版本、native 合约以及候选差异能重建完整目标索引。移动 latest 不能替代固定父版。
3. 同一候选继续上传／校验已有一致附件，不重新分配父版、不改候选 ZIP、不 `--clobber`。
4. 添加“匿名下载失败后 Pages latest 已前进，再恢复同一候选”回归，覆盖父快照缺失、摘要错误、版本／合约错误和网络失败。
5. 保留原匿名 TLS 失败与恢复记录，更新本页问题状态。不能只因临时恢复成功写成发布器已修复。

**另一个现有限制**：候选源码必须等于远端当前 main。候选冻结后 main 若增加文档等提交，恢复仍可能因 exact-main 不一致而拒绝。当前门禁并未实现“祖先提交且所有输入仍匹配”的规则，不可默默放宽。需要恢复设计变更时明确验证来源与输入、补行为检查；不要 reset／强推 main 回旧提交来迁就候选。

### 常见故障定位

| 现象 | 处理 |
| --- | --- |
| 新草稿按 tag 查询 404 | 已修复为分页查 Release 列表并按 ID 回读同 tag；列表读取失败必须报错，不能视为不存在后创建重复版本 |
| 附件上传失败 | 查同草稿服务端 state／size／digest，复用一致附件；仅自己的草稿空残件可删除重试；不同非空附件分配新版本 |
| 匿名下载 TLS EOF | 保留候选与同一 Release；正常 TLS 下重新完整下载核验。先检查 latest 是否前进，再按固定父版恢复，不关闭证书校验 |
| Pages 尚未出现版本 | 查看具体 workflow run；有界等待／重触发现有 main 工作流，失败保留输出与事实记录 |
| 客户端仍显示旧版本 | 检查实际运行版本、网络超时、两条协议入口、合约、屏蔽状态和试启动。不能只改版本标签，不能清用户存档 |
| `Maximum call stack size exceeded` | 旧缓存复制递归曾误入 Android `./`／`../`；现按完整目标索引逐项复制。旧版本先经修复桥接版，不能重新引入递归列目录 |
| 下载差 1 byte 被拒绝 | Cocos native Asset.size 为 float 会舍入；按原始 JSON 的精确整数和 SHA 校验，ZIP 合法注释长度对齐兼容旧 APK；不可放宽 size 校验 |
| 构建输入／远端源码不匹配 | 先辨别未提交文件和实际冻结版本；备份正确输入，重新构建或设计有验证的恢复规则，不绕过门禁 |

## 清理产物，保留必要文件

默认发布成功会调用 `clean_build()`。它严格校验隔离路径、候选命名、`build-config.json`、是否含 tracked 文件，以及固定 APK／payload 的本次版本和摘要；不满足时保留，不能扩大删除范围。

允许清理的范围是本次已核验的 `migration/work/avg-plus-android-<唯一ID>`、对应固定 APK、`build-record.json` 和一致的 `builds/android/avg_plus/hot-update`。失败未核验时保留当前候选，恢复成功后清理；不保留多版历史 APK。`--keep-output` 是调试例外，用户要求不长期保留产物，默认不使用。

始终保留：`games`、`engines`、`builds` 职责目录及必要文件，游戏 assets 与 meta、原图／音频／剧情／关卡、`source/android-icon` 和 generation 记录、渠道配置、脚本、`templates`、SDK／NDK、文档、约束、用户工作及私有失败证据。不能使用 `git clean -fdx`、清空三仓或整个 migration 的方式腾空间。

2026-10-14 已清理自己的发布产物、临时 APK、QA AVD 和包装 App；原 SDK／NDK／系统镜像和源码没有删除。本机 publication／cleanup JSON 可保留小型事实记录，但原始日志、截图、录屏不自动上传公开仓。新的 AI 不能假定这些未跟踪记录存在于新 clone。

## 发布前后验证

相关检查入口：

```sh
python3 -B migration/tools/test_android_channel.py
python3 -B migration/tools/test_android_delta.py
python3 -B migration/tools/test_android_pages.py
python3 -B migration/tools/test_android_publisher.py
python3 -B migration/tools/test_android_png_storage.py
```

启动钩子用实际可用 Node 执行 `node --test migration/tools/test_android_bootstrap.cjs`；游戏源码检查与 UI／内容维护见 [DEVELOPMENT.md](../../games/avg_plus/docs/DEVELOPMENT.md)。按变更选择检查，不把测试数量当作设备验收。

正式报告分别写明：源码备份、候选导出、APK 身份、服务端附件、匿名完整下载、Pages 回读、真实旧 APK 联网应用、逐文件缓存／健康确认、存档保留、物理手机性能与正式签名。任一未做保持 pending，不能合并成一个“全部通过”。

13 的服务端／匿名／Pages 校验已完成，46 个脚本和 103 项行为通过；18 个历史 UUID 使资源全检查仍失败。真实模拟器联网链已做到 11，12 的对齐在隔离候选实测，13 的新时限联网原生实测、全面故障恢复、物理手机和正式签名仍未完成。完整当前状态只维护在 [AI_HANDOFF.md](../../games/avg_plus/docs/AI_HANDOFF.md)，后续任务结束同步更新相关手册与带日期的事实记录。
