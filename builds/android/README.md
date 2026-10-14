# AVG Plus 安卓渠道

游戏映射与渠道配置在 `config.json`。当前接入 `games/avg_plus`，原生竖屏，保持原场景 UUID 和动态 JSON 关卡资源。

在三仓根目录执行：

```sh
python3 -B builds/build.py android --game avg_plus --inspect
python3 -B builds/build.py android --game avg_plus
```

脚本冻结最新已保存的本地文件到 `migration/work`，导出原生工程，安装热更新启动钩子后编译。源文件在构建期间改变时保留候选与日志，不覆盖固定交付目录；重新运行公共入口即可重新构建。固定候选 APK 和更新资源位于 `builds/android/avg_plus`，全部排除 Git。日志、源文件哈希与检查边界位于 `migration/reviews/avg_plus`。

工具默认读取本机 Cocos 3.8.8、`~/Library/Android/sdk`、其已安装 NDK、Android Studio JBR 和 Cocos 内置 CMake；可用 `COCOS_CREATOR`、`ANDROID_SDK_ROOT`、`ANDROID_NDK_HOME`、`AVG_PLUS_JAVA_HOME` 指定。不会修改微信渠道配置。

当前产物属于 debug 预览候选。0.1.0.4 完整 APK 已在原仓库 Releases 发布并匿名下载核对 SHA-256；Pages 资源上线、实际旧 0.1.0.0 APK 升级至 0.1.0.4 和冷启动保留进度已在 Android 35 ARM64 模拟器通过。旧客户端缓存内的 319 个解压文件与发布 ZIP 每项字节一致；下载 ZIP 会在解压后由 Cocos 删除，不能将不存在的缓存 ZIP 当作完整下载证据。正式 release 签名、完整视频交互/截图对照及真实手机验证仍须完成。构建器将渠道应用版本写入原生 Gradle 模板，并实际审计 APK 包名、版本、竖屏、ABI 与签名，不能以模板默认版本冒充配置值。

## 热更新资源

按用户最新要求使用 `little-steps-cocos` 的 GitHub Pages，在 `avg-plus/android` 目录发布更新。用户已将该仓设置为公开以启用当前套餐的 Pages。`little-steps-play` 已由用户删除，新建的 `avg-plus-android-updates` 停止使用，用户表示将自行删除。客户端不携带 GitHub 凭据。

`.github/workflows/avg-plus-pages.yml` 在手动触发、发布 Release 或修改部署脚本时组装并部署 Pages。它只将验证后的 Release 更新资源与下载索引放进站点；构建产物不提交到源码分支。完整桥接版本包含完整 ZIP、两个旧协议清单及完整文件索引；后续增量版本包含变化文件 ZIP、增量元数据及完整文件索引。APK 只在首装或需要原生变化时生成。`pages.py` 校验 ZIP 与每个文件的 SHA-256、大小、路径、清单和完整版本链；未完成附件不会发布。

发布和编辑 Release 的事件先触发 `main` 上的部署，保持 `github-pages` 环境现有保护规则。首页和 `avg-plus/android/` 入口都可打开；客户端只从 Pages 的不可变版本目录下载经过校验的完整桥接 ZIP 或必要变化文件 ZIP。

各版本 ZIP 发布到 `avg-plus/android/versions/<version>/avg-plus-assets.zip`；发现入口是 `avg-plus/android/latest/avg-plus-project.manifest` 和 `avg-plus-version.manifest`。先发布不可修改的版本目录，核验内容后再更新 latest 清单；客户端校验 ZIP URL 必须与清单版本完全一致。

启动钩子在 SystemJS 与游戏模块加载之前恢复缓存搜索路径。覆盖安装 APK 时，比其打包版本旧或相同的缓存会被淘汰；只处理自身热更新缓存与标记，产品存档保留。ZIP 经过 SHA-256 和大小检查后才解压；下载最多重试两次，断网和不兼容更新使用本地内容。更新成功保存待验证启动状态，重启后目录读取成功才确认健康；若新代码启动未完成，下次启动退回 APK 内容并屏蔽该版本。`nativeCompatibility` 是 native/引擎合约，修改 native 或引擎时必须升级合约并重新安装 APK。

更新包含游戏 `src`、Bundle 配置、动态 JSON、图片和音频，排除引擎 JS、JSB 适配器、native 身份和启动钩子。增量以实际导出文件的哈希比较为准；Cocos 合并的脚本或 JSON 文件仍以整个变化文件进入 ZIP，未改变的图片、音频和配置文件不再上传。这里不做任意分片或二进制补丁。

## 自动发布与输出清理

官方 GitHub CLI 在当前账户完成一次授权后，先提交并推送必要源码，再从根仓执行：

```sh
# 首装／完整桥接版本，包含 APK。
python3 -B builds/build.py android --game avg_plus --publish
# 日常游戏内容更新，只构建和上传真实变化文件，不编译 APK。
python3 -B builds/build.py android --game avg_plus --hot-only --publish
```

`--publish` 读取已发布版本自动分配下一个内部资源版本。显示版本与 APK versionName 由构建镜像写入北京时间 `年-月-日-时-分-秒`，源工程与模板保持可编辑。`--hot-only --publish` 自动读取线上最新完整文件索引作为增量基线。冻结输入逐文件核对 GitHub main 对应源码，未备份输入禁止发布。

上传使用完整的真实 ZIP/APK 附件，失败可有界重试；先创建草稿并核对 GitHub 服务端大小和 SHA，再开放版本，匿名完整下载校验，等待 Pages 版本和哈希回读。公开版本附件不可覆盖，不用 `--clobber`；如内容不同需分配新版本。发布后只清理此次隔离镜像、临时构建和固定输出；不会删除源码、原素材、其他游戏、渠道配置、模板、打包必要文件或文档。未验证的发布保留当前输出供恢复，不积累新的历史候选。

新建草稿按标签查询可能返回 404；发布工具会在当前账户可读的 Release 列表中查找同一标签，再按 ID 回读当前附件。列表读取失败直接停止，不能当作版本不存在后重复创建。已有候选可通过 `python3 -B builds/android/publish.py --record migration/reviews/avg_plus/<candidate>.json` 继续发布，已上传且哈希一致的附件会直接复用。

增量客户端先复制自身当前缓存到暂存目录，按完整顺序下载缺失的版本，校验最后一版全部文件后切换目录。保留一版健康缓存至新版本首页真实打开；启动失败时利用恢复日志回退并屏蔽失败版本，后续修复版本仍可更新。旧单 ZIP 客户端先使用完整桥接版本升级，再进入增量通道。断网检查有时限并继续本地游戏。文件系统故障注入通过不等于真实安卓升级通过，原生边界必须单独记录。

Android 图标原画与五档密度 PNG 位于游戏 `source/android-icon`；渠道 XML 位于 `templates/avg-plus-icons`，包括普通、圆形、自适应、主题单色与 Android 12 启动图标。安装只作用于隔离原生导出，不能改 Creator 全局模板。PNG 源图由已调用的内置 imagegen 生成，确切提示词、模式与源图 SHA 在 `generation.json` 中；这些是必要源文件，应保留并备份。

渠道关闭隔离导出的默认 Cocos Logo 与强制两秒 Splash，不修改 Creator 全局模板。游戏加载页先绘制、再准备内容，按真实阶段显示进度，首页绘制后淡出；系统启动主题与场景底色一致。构建检查未知 Splash 设置合约时拒绝继续，不能静默回到默认 Logo。

PNG 仅在隔离导出目录重新压缩 IDAT 存储，扫描线和所有非 IDAT 元数据逐字节校验不变；不改变源素材、尺寸、颜色或透明度。原导出 PNG 保留在候选的 `png-storage-originals`。Cocos 3.8.8 的 native Asset.size 使用 float，客户端按经过验证的 JS 清单读取精确字节数；ZIP 通过合法注释对齐长度，兼容旧 APK 的严格大小比较。

本地验证：`python3 -B migration/tools/test_android_channel.py` 和 bundled Node 执行 `--test migration/tools/test_android_bootstrap.cjs`。这些覆盖打包、校验、失败和恢复边界，不能替代 GitHub 下载及安卓旧包更新实测。API 依据：[Cocos 原生热更新](https://docs.cocos.com/creator/3.8/manual/en/advanced-topics/hot-update-manager.html)、[命令行构建](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/publish-in-command-line.html)。

发布恢复检查：`python3 -B migration/tools/test_android_publisher.py`。0.1.0.6 已从远端核验的 `c3b8e6a` 发布完整桥接包与 APK，五个实际附件均经过服务端摘要和匿名完整下载检查，Pages 版本/哈希回读通过。该 APK 是调试签名 ARM64 竖屏预览版；安卓模拟器已打通冷启动、首关、千金币奖励、原 AVG 与目录返回，真实手机性能、正式签名和完整视频对照仍待验证。
