# 恢复构建入口

这里的工具是此次新补建的，不是原 build 仓找回的代码。它首先保证当前 fa1 导出范围可复现组装、运行和对照；不会发布网站，也没有实现第五轮16项修改。

## 环境

- 官方 Godot 4.5.2 Linux x86_64，版本 4.5.2.stable.official.6ce3de25a。
- 引擎可执行文件 SHA256：5803746bbe055bee0f07a3c5b0dd347719bd45599f3d34519a8a0beaf83014ae。
- 官方下载：https://github.com/godotengine/godot-builds/releases/download/4.5.2-stable/Godot_v4.5.2-stable_linux.x86_64.zip
- Python 3 和 zstandard。引擎与系统安装不包含在源码归档中。

## 组装、验证并生成7包

在工程根目录执行：

```sh
python3 build/assemble.py --engine /absolute/path/Godot_v4.5.2-stable_linux.x86_64 --output /absolute/path/new-empty-output --verify-recovery --packs
```

输出目录必须是新的空目录，已有结果不会被覆盖。命令依次：

1. 将 framework 和 games 组装成可编辑原生工程；原运行资产缓存放到实际资源路径。
2. 解析全部84个脚本，加载208条资源组路径，实际构造主页和暗室。
3. 比较9个文本场景与原二进制场景保存的状态。
4. 用官方引擎重导脚本，与原84个 GDSC 文件逐字节比较。
5. 从文本场景重新生成场景二进制，生成运行配置，构建7个PCK并逐文件验证。
6. 从刚生成的7个PCK实际加载并构造主页和暗室。

原生打开组装项目：

```sh
/path/to/Godot_v4.5.2-stable_linux.x86_64 --path /path/to/output/project
```

每步日志和JSON结果在输出目录 qa 下。所有用户数据、配置与缓存使用该输出目录内的隔离路径。

## 边界

- 这是恢复对照入口；--verify-recovery 会要求当前脚本与原 fa1 字节相同。以后获准修改产品后，应把差异作为新变更审查，并另写新功能测试，不能继续声称与原 fa1 完全相同。
- 当前分包库存固定为原 fa1 的398项。新增生产脚本必须显式更新资源/分包契约，否则构建拒绝；不能静默漏包。
- games 中的 runtime_cache 是原导入纹理、字体、QOA声音等资源。它们保留线上运行数据，不是原绘画分层文件，也不是完整的作者导入参数。
- 84份脚本的原注释、Git历史、原测试、原文档、未导出美术和原构建工具仍缺失。
- headless 构造与资源校验不证明 GPU 画面、首绘、触控、完整输入生命周期或听音通过。Web候选仍需独立组装和验证。

## 官方 Web 候选

先完成上面的原生组装和7包验证，再从 Godot 官方4.5.2导出模板包取得 web_nothreads_release.zip。该文件SHA256必须为 5f202410b79f15d31bfef4c434ee7b7bcc964b50a587bb1338cb53ad9d94c61b。

```sh
python3 build/web_candidate.py --engine /path/to/Godot_v4.5.2-stable_linux.x86_64 --template /path/to/web_nothreads_release.zip --native-build /path/to/native-output --output /path/to/new-empty-web-output
```

该命令用官方模板重新导出Web运行时，逐项核对官方JS/WASM/worklet，再装入从当前源码生成的7包，并生成新的体积/hash清单。宿主布局与脚本来自精确v19导出，只更新分包描述和PCK大小。不会发布、覆盖站点或执行16项产品修改。浏览器启动和GPU验证仍需在允许访问的候选页面完成。

## 原App启动契约

原生源码组装使用local资源模式；Web分包使用web模式。build_info仍使用真实monorepo布局契约，并用独立reconstruction和recovery_origin字段说明重建来源。

组装验证现在实际驱动原App的--smoke入口，经过Loading、Login、完整开场Comic、Home，由原App输出BUILD_METADATA_PASS和GAME_SMOKE_PASS。开场通过真实键盘输入推进，不直接跳页。

已知边界：headless快速smoke退出时，原导出的GDC/场景和重建候选均出现两个MP3资源、两个播放对象的ObjectDB退出提示。这项对照不等于生命周期内存通过；本恢复没有修改原音频代码。
