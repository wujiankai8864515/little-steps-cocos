# 旅行木鱼需求与验收

旅行木鱼使用 Cocos Creator 3.8.8，保留小屋、暗室、旅行、日记、收藏、照片墙和衣柜的完整玩法与原美术。正式交付微信小游戏，设计尺寸为 720×1280，宽度固定并适配长屏、安全区和前后台。

完整历史需求及当前覆盖保存在 [requirements.json](requirements.json)。原有 138 条需求的编号、描述和来源保持可追溯，新增 Cocos 需求单独列出。被后续要求覆盖的旧描述保留为历史，不能按旧编号恢复已撤销行为。

## 最新产品要求

| 范围 | 当前行为与验收要求 | 实现入口 |
| --- | --- | --- |
| 首屏 | 完整 Cocos Loading 美术、动作和进度；资源、字体及代码与公共模块独立，首帧后加载游戏 | [Boot](../assets/Boot.ts)、[Loading](../assets/startup/LoadingView.ts) |
| 登录与开场 | 标题、副标题、小余探头依次出现；全屏进入；保留漫画揭示和停留节奏，Home 未就绪时显示同位等待提示 | [LoginPage](../assets/game/LoginPage.ts)、[ComicPage](../assets/game/ComicPage.ts) |
| 小屋 | 原骨骼、接地投影、光照、灯、花朵、香、背包和道具交互保持；真实 alpha 命中，一次接触只结算一次功德 | [HomePage](../assets/game/HomePage.ts)、[HomeProps](../assets/game/HomeProps.ts)、[MeritFeedback](../assets/game/MeritFeedback.ts) |
| 出发 | 确认后播放云朵；云朵消散即离开，不能再次显示小屋主角；重复确认、取消、迟到和存档重开不重复出发 | [HomeDepartureVisual](../assets/game/HomeDepartureVisual.ts)、[HomeTravelBridge](../assets/game/HomeTravelBridge.ts) |
| 暗室 | 完整轮次、工具接触、娃娃变形和反馈；离页与后台释放或休眠渲染资源，返回恢复状态 | [DarkroomPage](../assets/game/DarkroomPage.ts)、[DollSkin](../assets/game/DollSkin.ts) |
| 旅行与奇遇 | 路线、脚印、钟、落叶、标牌、昼夜柔光及人工选择暂停保持；结束时间不随观看改变，奖励一次收纳 | [TravelService](../assets/game/TravelService.ts)、[TravelMapPage](../assets/game/TravelMapPage.ts)、[TravelEncounterSession](../assets/game/TravelEncounterSession.ts) |
| 日记与收藏 | 已获得记录稳定保存；分页、详情、阅读、取消和返回保持，不伪造奖励解锁 | [TravelJournalPage](../assets/game/TravelJournalPage.ts)、[TravelCollectionPage](../assets/game/TravelCollectionPage.ts) |
| 照片墙 | 按需加载资源和材质，能进入并返回；保留纸、夹绳、藤叶、投影、柔光、已得照片、保存、取消和重开 | [PhotoPage](../assets/game/PhotoPage.ts)、[PhotoCollection](../assets/game/PhotoCollection.ts) |
| 衣柜 | 保留场景、挂布和藤蔓运动、换肤与保存；试穿不直接写入存档，确认写入失败不显示成功 | [WardrobePage](../assets/game/WardrobePage.ts)、[WardrobeStore](../assets/game/WardrobeStore.ts) |
| 震动 | 在敲击和关键确认中合理使用轻、重、长震动，提供持久关闭开关；后台和设备失败不影响玩法 | [Haptics](../assets/game/Haptics.ts)、[设置](../assets/game/MusicCreditsView.ts) |

旧出发描述中的“主角原地渐隐”以当前云朵完成后隐藏主角的完整行为为准。Godot 专用 PCK、Web 导出和引擎版本要求由 Cocos 微信渠道构建规则替代。旧旅行 N17 的撤回继续生效，不恢复按观看情况改变结束或代选的规则。

## 资源与包体要求

Loading 只加载四张原动画图片、独立小字体和小清单，不读取全量游戏目录、公共 UI 或可选页面资源。Cocos 引擎初始化前仅保留同色底；完整 Cocos 页面需要引擎就绪后才能绘制。

框架、运行数据和游戏代码在 Loading 首帧后加载。游戏页面代码目前共用延后的 gameplay_code 包，照片、衣柜、旅行等页面图片仍按进入时加载。Cocos 适配微信原生分包，业务决定预加载时机，不能假定打包后自动提前下载所有页面。

资源门槛保持每批 80 specs、同时 128 entries、256 MiB 预估准入，Home 非启动依赖闭包不超过 19,000,000 bytes，禁止依赖非必需旅行和出发包。这些门槛不等于手机内存及网络实测。

大背景以 720 宽为基准，保留长屏余量，单张目标不超过 500,000 bytes。Loading、登录和照片墙可用程序底色与小图组合。渠道有损转换只作用于隔离镜像，原图、遮罩和来源保留。音乐为单声道流式 MP3，短音效为单声道 PCM。ASTC 尚未启用，实际图集编码评估与真机画质、显存验收分开。

## 存档与输入要求

保留旧存档键、版本迁移、完整性校验、写入回读及 revision 冲突检查。读取失败不能当成空存档；写入失败、未来 schema 和损坏数据不能悄悄覆盖已有记录。照片、服装、旅行、奖励和小屋状态依照各自模型恢复。

所有输入核验按下、移动、释放、取消与后台中断；命中掩码不因纹理压缩或背景合成而改变。页面 scope 取消后，晚回调不得重建页面、播放音效或再次发奖励。公共气泡共用测量、布局、安全区和动画规则。

## 当前验证与放行

已有 272 项游戏回归和 28 项打包回归通过。最近候选的完整 Loading 与登录启动通过；小屋、照片墙及设置画面通过正常游戏回调核验。这不是全部按钮触控或真机体验验收。

手机冷启动、实际帧率、触摸、震动手感、听音与完整画面仍逐项待验。60 FPS 是配置目标。微信工具热编译分包等待在原样重开后恢复，具体根因待核；Home mipmap 警告未关闭。首帧上报和其他埋点后续统一处理。

当前证据见 [本地验证](../../../migration/reviews/M20-final-local-validation.json)、[重复编译等待](../../../migration/reviews/M20-devtools-repeat-start-wait.json)、[功能矩阵](../../../migration/records/M11-six-page-function-matrix.json)。正式发布使用同源冻结构建和真实微信设备证据，不将历史 Godot 通过数或源码备份视为产品认可。
