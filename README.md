# little-steps-cocos

旅行木鱼的 Cocos Creator 3.8.8 迁移工程。以相邻 `little-steps` 最新 Godot 源码、有效产品需求和已发布版本为基准，逐项验证页面、交互、骨骼、光照和存档。当前状态以 `builds/records/migration-plan.json` 为准；源码存在、类型检查或构建成功不代表视觉验收通过。

三仓职责保持独立：

- `engines/travel-core`：通用框架、资源门禁、生命周期、输入和二维网格/骨骼能力。框架源码在此维护，游戏通过只读软链接加载插件产物。
- `games/xiaoyu-cocos`：游戏页面、规则、动作数据、原始美术与游戏光照。保留用户创建的场景、分辨率和已挂载 Boot，运行时创建页面和组件。
- `builds`：导入/校验工具、候选构建、微信小游戏打包配置和验收记录。不得放入游戏业务代码。

正式交付平台仅微信小游戏。浏览器预览用于与 Godot 的同状态截图和操作对照，不是新增发布平台。真实微信设备、AppID、冷加载和预算证据单独记录。

不得修改原 Godot 仓库来迁就 Cocos 的效果；未经对照的项目一律保留待验状态。不得强推或改写历史。

## 六页体验入口

第一版候选包含旅行、衣柜、暗室、日记本、收藏馆和照片墙。启动本机预览：

```sh
python3 builds/tools/serve_candidate.py --name alpha-transport-v2 --port 8792
```

打开 `http://127.0.0.1:8792/review`，页面旁有操作说明。当前候选 `alpha-transport-v2` 的全部运行代码和资源已与远端回读 `4aba881` 核对一致，无测试存档或时间替换。六页完整主流程及刷新恢复的前次证据保留；本次无损透明度优化另验登录、开场、小屋、衣柜、暗室和照片加载。完整异常及微信设备验收仍以功能矩阵中的待验项为准。

## 微信候选打包

工具只在 `builds/work` 创建冻结镜像：游戏源码、原美术、Boot 和场景不改；分包位置和引擎裁剪作为明确记录的构建配置。先准备远端回读记录，再运行：

```sh
python3 builds/tools/create_wechat_candidate.py --name wechat-review-new --readback builds/reviews/M11-six-pages-remote-readback.json --server http://127.0.0.1:8793/ --trim-unused
```

按生成清单的 `command` 调用 Creator；退出码 36 是官方规定的构建成功。构建完成后运行 `audit_wechat_candidate.py --name NAME --out REPORT.json`，再运行 `stage_wechat_delivery.py --name NAME --receipt RECEIPT.json`。工具拒绝覆盖旧候选；任意检查失败不会生成交付目录。

最新候选 `wechat-six-pages-v5` 从远端回读 `4aba881` 构建，本地包 3,056,214 bytes，11 个资源包单独输出到 CDN 目录。129 项资源目录及 141 个源文件没有缺失，98 个原始图像/音频/字体文件在产物中字节不变。`builds/output/wechat-six-pages-v5/package` 是微信开发者工具导入目录；`cdn/remote` 不在上传包里。ZIP 是候选备份。

**v1–v4 已撤回完整性判断，不得用于交付。** M10.02 查出旧 `native` 忽略规则漏掉三张 Loading 角色图，v5 已补齐，并由新目录门禁核验。旧失败产物和记录保留。

当前使用 Creator 官方测试 AppID 和回环资源地址，资源未上传。正式账号、HTTPS 资源域名、19,000,000 bytes 的 Home 首屏下载和微信真机验证仍待完成；主包体积通过不等于首屏或性能通过。
