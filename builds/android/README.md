# AVG Plus 安卓渠道

游戏映射与渠道配置在 `config.json`。当前接入 `games/avg_plus`，原生竖屏，保持原场景 UUID 和动态 JSON 关卡资源。

在三仓根目录执行：

```sh
python3 -B builds/build.py android --game avg_plus --inspect
python3 -B builds/build.py android --game avg_plus
```

脚本冻结最新已保存的本地文件到 `migration/work`，导出原生工程，安装热更新启动钩子后编译。源文件在构建期间改变时保留候选与日志，不覆盖固定交付目录；重新运行公共入口即可重新构建。固定候选 APK 和更新资源位于 `builds/android/avg_plus`，全部排除 Git。日志、源文件哈希与检查边界位于 `migration/reviews/avg_plus`。

工具默认读取本机 Cocos 3.8.8、`~/Library/Android/sdk`、其已安装 NDK、Android Studio JBR 和 Cocos 内置 CMake；可用 `COCOS_CREATOR`、`ANDROID_SDK_ROOT`、`ANDROID_NDK_HOME`、`AVG_PLUS_JAVA_HOME` 指定。不会修改微信渠道配置。

当前产物属于 debug 候选。正式 release 签名、安卓设备完整交互、截图对照和 GitHub 更新实测均需完成后才能称为可发布版本。

## 热更新资源

按用户最新要求使用 `little-steps-cocos` 的 GitHub Pages，在 `avg-plus/android` 目录发布更新。用户已将该仓设置为公开以启用当前套餐的 Pages。`little-steps-play` 已由用户删除，新建的 `avg-plus-android-updates` 也停止使用并由用户删除。客户端不携带 GitHub 凭据。

`.github/workflows/avg-plus-pages.yml` 在手动触发、发布 Release 或修改部署脚本时组装并部署 Pages。它只将验证后的 Release 更新资源与下载索引放进站点；构建产物不提交到源码分支。每个 Release 需上传三个固定名称的资源文件，APK 可一并作为 Release 资产上传。`pages.py` 校验所有版本 ZIP 的 SHA-256、大小、路径和清单一致性，保存历史版本目录，再按最高资源版本生成 latest 入口。

发布和编辑 Release 的事件先触发 `main` 上的部署，保持 `github-pages` 环境现有保护规则。未完成附件不会进入站点。首页和 `avg-plus/android/` 入口都可打开；客户端只从 Pages 的不可变版本目录下载完整 ZIP。

各版本 ZIP 发布到 `avg-plus/android/versions/<version>/avg-plus-assets.zip`；发现入口是 `avg-plus/android/latest/avg-plus-project.manifest` 和 `avg-plus-version.manifest`。先发布不可修改的版本目录，核验内容后再更新 latest 清单；客户端校验 ZIP URL 必须与清单版本完全一致。

启动钩子在 SystemJS 与游戏模块加载之前恢复缓存搜索路径。ZIP 经过 SHA-256 和大小检查后才解压；下载最多重试两次，断网和不兼容更新使用本地内容。更新成功保存待验证启动状态，重启后目录读取成功才确认健康；若新代码启动未完成，下次启动退回 APK 内容并屏蔽该版本。`nativeCompatibility` 是 native/引擎合约，修改 native 或引擎时必须升级合约并重新安装 APK。

更新包含游戏 `src`、Bundle 配置、动态 JSON、图片和音频，排除引擎 JS、JSB 适配器、native 身份和启动钩子。当前每次下载完整游戏 ZIP；不宣称已有逐文件差分更新。

本地验证：`python3 -B migration/tools/test_android_channel.py` 和 bundled Node 执行 `--test migration/tools/test_android_bootstrap.cjs`。这些覆盖打包、校验、失败和恢复边界，不能替代 GitHub 下载及安卓旧包更新实测。API 依据：[Cocos 原生热更新](https://docs.cocos.com/creator/3.8/manual/en/advanced-topics/hot-update-manager.html)、[命令行构建](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/publish-in-command-line.html)。
