# 旅行木鱼 Cocos 技术架构

游戏使用 Cocos Creator 3.8.8。Boot 负责独立首屏，Application 组合页面与服务，通用能力由只读 travel-core 插件提供，微信适配与构建转换由打包仓管理。动态节点、网格和 EffectAsset 保留原动作、美术及光照，不依赖 Godot 引擎运行。

## 启动与代码边界

[Boot](../assets/Boot.ts) 静态依赖只有 Cocos 与 assets/startup。顺序为引擎就绪、读取 loading 小清单和资源、绘制完整 Loading、等待 EVENT_AFTER_DRAW、加载 framework_code、安装平台端口和框架、加载 runtime_data、加载 gameplay_code、创建 Application、准备登录页面、等待绘制、销毁 Loading 并释放资源。

[RuntimeEntry](../assets/game/RuntimeEntry.ts) 在游戏分包注册工厂，Boot 不静态引用 Application。[Application](../assets/game/Application.ts) 创建登录、漫画、小屋和可选页面，拥有路由、服务、音乐及页面 scope。失败由完整 Loading 显示重试；销毁与晚回调防护不能因延迟分包被绕过。

四张 Loading 原图、程序纸面、小字体和小清单属于独立 loading Bundle。全量 source-catalog、source-scenes 和游戏 effects 在规范工程中位于 assets/resources，打包时仅在隔离镜像移入 runtime_data。不要手工搬规范工程资源或修改 Boot、场景 UUID。

## 页面与业务模型

| 业务 | 主要模块 | 所有权和行为 |
| --- | --- | --- |
| 小屋 | HomePage、HomeHUD、HomeClock、HomeProps、HomePlants、HomeIncense、HomePhotos、HomeWardrobe | HomePage 组合元素，共享时钟驱动昼夜，输入按当前 owner 分配 |
| 旅行 | TravelModel、TravelStore、TravelService、HomeTravelBridge | 模型控制路线、选择和一次性奖励，服务连接存档与 Home，页面读取服务 |
| 照片 | PhotoCollection、HomePhotos、PhotoPage | 从已获旅行物品形成照片投影，照片页面不成为旅行进度主存档 |
| 衣柜 | WardrobeStore、WardrobeSession、WardrobePage、OutfitBinding | 试穿归会话，确认后写入，共享穿戴状态驱动角色 |
| 日记与收藏 | TravelJournalSession、TravelCollectionSession 及对应 Page | 保留分页、详情、阅读和获得记录 |
| 暗室 | DarkroomPage、DollSkin、DarkroomLighting | 工具、接触和轮次归页面，保留返回状态并休眠渲染目标 |
| 公共交互 | Engine、Visual、Viewport、InteractionFeedback、Haptics | 游戏配置行为，通用输入、气泡、网格和生命周期由框架提供 |

角色、背包、藤蔓、照片纸和场景装饰保留已导入动作、骨骼及几何数据。纹理显示尺寸与真实 alpha 命中独立，程序背景不替代前景、光照或输入规则。

## 资源加载与释放

[GameAssets](../assets/game/Assets.ts) 按目录依赖先加载 Bundle，再取得 Texture2D、ImageAsset、Font、AudioClip、JsonAsset 或 EffectAsset。ResourceGate 和页面 scope 共同租用资源；同键共享加载承诺，失败或取消释放租约，最后一个引用消失才卸载。

微信 native Bundle 由 Cocos 适配 loadSubpackage。loadBundle 完成表示包代码和清单就绪，不表示所有纹理已解析。图片由 acquireGroups 或 acquireResources 准入。Cocos 管理实际文件依赖归属，游戏目录另行声明业务加载顺序；审计分别记录实际 Bundle deps 和逻辑 Home 闭包。

分组包括 loading、login、comic、home、darkroom、shared_boot_ui、shared_room_visual、outfit_visual、departure_visual、photo_visual、travel_visual 和 wardrobe_visual；渠道生成 framework_code、runtime_data、gameplay_code。公共纹理按较高 Bundle 优先级归属，可选页面不放入首屏公共包。

隐藏页面的节点、scope、渲染目标和租约具有不同生命周期。park、hibernate、restore 和 decRef 等已有机制须保留；隐藏不自动等于释放全部内存，准入估计也不包含全部微信进程和引擎开销。

## 存档与平台能力

[TravelStore](../assets/game/TravelStore.ts) 保留 travel_woodfish:travel_story 前缀，使用校验 envelope、schema 迁移、容量限制、revision 检查和单主键事务；微信使用同步存储 API，预览使用 localStorage，不可用时显式失败。[WardrobeStore](../assets/game/WardrobeStore.ts) 和 PhotoCollection 维护各自存档，不将试穿或未确认选择直接提交。

[Haptics](../assets/game/Haptics.ts) 通过 LittleStepsPlatform.haptics 使用轻、重、长反馈，关闭开关使用 little-steps:haptics:v1。前后台和 scope 清理控制有效性；平台失败不修改游戏结果。微信渠道 platform.js 安装该端口，Loading 首帧前不加载适配脚本。

长音乐为单声道流式 MP3，短音效为单声道 PCM。当前 Cocos 使用 InnerAudioContext，未额外开启短音效 WebAudio 驱动。60 FPS 是配置目标，埋点和首帧上报未接入。

## 来源与变更边界

原美术、许可和动作来源保存在 assets、licenses、source/fonts 和 docs/design。res:// 是已迁移数据的稳定逻辑资源键，不表示运行时仍读取 Godot。[历史来源](../../../migration/archives/README.md) 保留固定源码和技术资料；旧 oracle 仅证明指定数学或数据样本一致，不等于当前画面或微信设备验收。

新增页面、存档格式、纹理处理或 Bundle 依赖改变时，同时更新 [需求清单](requirements.json)、相关回归和渠道门禁，并保留独立 Git 提交。失败边界在 migration/reviews 追加记录，不覆盖历史。
