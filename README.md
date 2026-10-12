# little-steps-cocos

旅行木鱼的 Cocos Creator 3.8.8 迁移工程。以相邻 `little-steps` 最新 Godot 源码、有效产品需求和已发布版本为基准，逐项验证页面、交互、骨骼、光照和存档。当前状态以 `migration/records/migration-plan.json` 为准；源码存在、类型检查或构建成功不代表视觉验收通过。

三仓职责保持独立：

- `engines/travel-core`：通用框架、资源门禁、生命周期、输入和二维网格/骨骼能力。框架源码在此维护，游戏通过只读软链接加载插件产物。
- `games/xiaoyu-cocos`：游戏页面、规则、动作数据、原始美术与游戏光照。保留用户创建的场景、分辨率和已挂载 Boot，运行时创建页面和组件。
- `builds`：根目录仅放公共打包入口与公共逻辑；每个渠道在自己的目录内维护配置、处理脚本、模板和产物。微信开发者工具仍打开 `builds/wechatgame`，实际小游戏文件位于其 `project` 子目录。详见 [打包仓说明](builds/README.md)。
- `migration`：资源导入、迁移检查、候选镜像、截图、验收记录和历史证据。它们独立于日常打包目录。

正式交付平台仅微信小游戏。浏览器预览用于与 Godot 的同状态截图和操作对照，不是新增发布平台。真实微信设备、AppID、冷加载和预算证据单独记录。

不得修改原 Godot 仓库来迁就 Cocos 的效果；未经对照的项目一律保留待验状态。不得强推或改写历史。

## 六页体验入口

第一版候选包含旅行、衣柜、暗室、日记本、收藏馆和照片墙。启动本机预览：

```sh
python3 migration/tools/serve_candidate.py --name opaque-png-v1 --port 8792
```

打开 `http://127.0.0.1:8792/review`，页面旁有操作说明。当前候选 `opaque-png-v1` 的 750 个冻结文件与远端回读 `fc61667` 核对一致，无测试存档或时间替换。14 张图片无损去掉冗余通道，共减少 2,817,308 bytes，全部 RGBA 像素保持一致。本次另验登录、开场、小屋昼夜及壁灯、照片墙和返回；六页完整主流程及刷新恢复的前次证据保留。完整异常及微信设备验收仍以功能矩阵中的待验项为准。

## 微信小游戏打包

执行 `python3 -B builds/build.py wechatgame`，每次成功构建后更新同一个微信项目并启动本机资源服务。微信开发者工具打开 `builds/wechatgame`；该目录的 `project.config.json` 使用 `miniprogramRoot: "project/"`，只将生成项目作为小游戏包，公共脚本、渠道脚本和模板不进入游戏包。

微信平台配置统一在 `builds/wechatgame/config.json`（AppID：`wx4d41972686e54c11`），平台脚本在同一目录，固定文件和额外脚本放 `builds/wechatgame/templates`。每次打包先同步到游戏工程和隔离镜像的真实 `build-templates/wechatgame` 目录，再交给 Creator 合并；避免 Creator 3.8.8 复制平台软链接时的目录类型错误。只维护渠道内的模板，镜像不进 Git。

日常打包仓结构与重启后的资源服务恢复见 [打包仓说明](builds/README.md)。迁移与历史构建的原始记录已移至 [migration](migration/README.md)，历史文件内容、哈希和失败证据保留。微信进屋的原始 mipmap 生命周期异常已修复；Home输出仍22,948,245 bytes，19MB门槛、正式HTTPS资源和真机验证继续单独记录。
