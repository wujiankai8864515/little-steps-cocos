# little-steps-cocos

旅行木鱼的 Cocos Creator 3.8.8 迁移工程。以相邻 `little-steps` 最新 Godot 源码、有效产品需求和已发布版本为基准，逐项验证页面、交互、骨骼、光照和存档。当前状态以 `builds/records/migration-plan.json` 为准；源码存在、类型检查或构建成功不代表视觉验收通过。

三仓职责保持独立：

- `engines/travel-core`：通用框架、资源门禁、生命周期、输入和二维网格/骨骼能力。框架源码在此维护，游戏通过只读软链接加载插件产物。
- `games/xiaoyu-cocos`：游戏页面、规则、动作数据、原始美术与游戏光照。保留用户创建的场景、分辨率和已挂载 Boot，运行时创建页面和组件。
- `builds`：按平台维护打包模板、配置和固定输出；微信小游戏在 `builds/wechatgame` 直接用开发者工具打开。构建工具和验收记录也由此维护，不放入游戏业务代码。目录和使用方式见 [打包仓说明](builds/README.md)。

正式交付平台仅微信小游戏。浏览器预览用于与 Godot 的同状态截图和操作对照，不是新增发布平台。真实微信设备、AppID、冷加载和预算证据单独记录。

不得修改原 Godot 仓库来迁就 Cocos 的效果；未经对照的项目一律保留待验状态。不得强推或改写历史。

## 六页体验入口

第一版候选包含旅行、衣柜、暗室、日记本、收藏馆和照片墙。启动本机预览：

```sh
python3 builds/tools/serve_candidate.py --name opaque-png-v1 --port 8792
```

打开 `http://127.0.0.1:8792/review`，页面旁有操作说明。当前候选 `opaque-png-v1` 的 750 个冻结文件与远端回读 `fc61667` 核对一致，无测试存档或时间替换。14 张图片无损去掉冗余通道，共减少 2,817,308 bytes，全部 RGBA 像素保持一致。本次另验登录、开场、小屋昼夜及壁灯、照片墙和返回；六页完整主流程及刷新恢复的前次证据保留。完整异常及微信设备验收仍以功能矩阵中的待验项为准。

## 微信小游戏固定入口

在仓库根目录运行 `python3 -B builds/tools/build_wechat.py --open`。AppID 已配置为 `wx4d41972686e54c11`，每次成功构建后更新同一个 `builds/wechatgame` 目录，并自动启动本机远程资源服务。游戏根目录的 `build-templates` 通过相对软链接指向 `builds/templates`；微信固定配置和额外脚本放 `builds/templates/wechatgame`，由 Cocos 原生模板流程合并或复制到新包。旧构建证据保留，旧生成文件清理，开发者工具个人配置和额外文件保留。

默认构建当前本地源码的隔离候选；远端冻结构建使用 `--readback`。本机候选与正式发布门禁分开记录，Home预算和微信设备的待验范围不改变。完整命令、模板定制与电脑重启后的资源服务恢复见 [打包仓说明](builds/README.md)。

固定入口当前为 `wechat-workspace-v7`，从远端回读的 `01a0713` 源码构建，本地包 3,640,135 bytes。已用微信开发者工具验证登录、开场和进入小屋，用户确认“已进入小屋”，运行日志显示 `PAGE_READY HOME` 且无错误。模板/目录更新9项及冻结资源/暗室生命周期16项回归通过。已修复微信图片缓存清理导致背包原始 mipmap 基础图像提前释放的问题，额外原图内存纳入原预算；Home输出仍22,948,245 bytes，正式交付继续受19MB门禁限制。完整证据见 `builds/reviews/M12-workspace-delivery-v1.json`。

## 历史微信候选打包

工具只在 `builds/work` 创建冻结镜像：游戏源码、原美术、Boot 和场景不改；分包位置和引擎裁剪作为明确记录的构建配置。先准备远端回读记录，再运行：

```sh
python3 builds/tools/create_wechat_candidate.py --name wechat-review-new --readback builds/reviews/M09-opaque-png-meta-readback.json --server http://127.0.0.1:8793/ --trim-unused
```

按生成清单的 `command` 调用 Creator；退出码 36 是官方规定的构建成功。构建完成后运行 `audit_wechat_candidate.py --name NAME --out REPORT.json`，再运行 `stage_wechat_delivery.py --name NAME --receipt RECEIPT.json`。工具拒绝覆盖旧候选；任意检查失败不会生成交付目录。

最新构建候选 `wechat-six-pages-v7` 从远端回读 `fc61667` 构建，本地包 3,056,214 bytes，11 个资源包单独输出到 remote 目录。129 项资源目录及 141 个源文件没有缺失，98 个图像/音频/字体文件与当前冻结源码中字节一致；其中 14 张 PNG 的编码已更新，解码像素与优化前相同。元数据和资源检查通过，但 Home 预算仍失败，因此 v7 没有生成交付目录或 ZIP。

**v1–v4 已撤回完整性判断，不得用于交付。** M10.02 查出旧 `native` 忽略规则漏掉三张 Loading 角色图，v5 已补齐，并由新目录门禁核验。旧失败产物和记录保留。

M10.04 已按原版 `check_loading_contract.py` 补上 Home 硬门禁：统计小屋及其非启动依赖资源包，不包含引擎、登录和格漫。v5 为 23,401,239 bytes，v7 减至 22,948,245 bytes，仍超过 19,000,000 bytes。审核会拒绝交付暂存；旧 v5 目录保留为测试候选和历史证据。此前 16 项检查通过未覆盖此项，不代表完整打包门禁通过。

当前使用 Creator 官方测试 AppID 和回环资源地址，资源未上传。正式账号、HTTPS 资源域名、Home 资源减重、实际下载和微信真机验证仍待完成；主包体积通过不等于首屏或性能通过。
