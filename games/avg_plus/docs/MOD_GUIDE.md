# 协作与 Mod 入门

## 先运行默认游戏

用 Cocos Creator 3.8.8 打开工程，等待资源导入；打开 `assets/mods/base-shell/scene.scene` 并预览。初始只启用 base-card 和 base-avg，三个扩展示例默认关闭。

当前 default profile 已关闭调试模式（`base-card.config.singleBackupCardTest=false`）：备用数量按关卡配置初始化，未指定时为 10 张；当前牌和首次抽牌不再强制避开开局可接牌。付费和重开仍按 `catalog.json` 的现有经济配置扣费，重开恢复正常关卡配置。需要临时验证单张耗尽时，才将开关设为 `true` 并重新进入会话；此模式开局 1 张备用牌，当前牌与第一次抽牌均不命中开局可点牌。

备用牌只记数量，翻出前不预定牌面；每次 `card.draw` 同步事务从 52 种牌面中排除全部仍在牌型区的牌（包括背面）后等概率抽取，再保存随机状态并播放动画。旧当前牌在替换时释放，允许跨时间再次抽到；命中牌从场上转到当前位，历史牌不占用候选。牌型区、当前牌、备用牌总数可以超过 52；付费加 5 张只足额增加数量，不消耗随机数。

牌型区最多 51 张，固定场上牌及固定当前牌不得重复。不能满足的配置明确拒绝，入场预检失败不扣费；不随机替换设计牌、不删牌。旧 `deckCount` 只保留为导入审计字段，不能放宽去重。当前 40 个 JSON 均保留原样，其中 `level_difficulty1_06` 固定当前牌与 slot_010 重复、`level_difficulty4_02` 有 52 个牌位，按新规则拒绝入场，待设计修订。

`base-card` 2.0.0 使用 `SolitaireCoreSnapshot.schemaVersion=2`，`stockRemainingCount` 代替旧 `stockPile/deck`；旧快照拒绝恢复。回撤恢复牌面、数量、测试约束及 RNG，重做相同翻牌得到相同结果；既有递增回撤费用、付费重开和通关奖励规则保留。产品目录／阅读存档结构没有变化。

组合配置：`assets/art/resources/mods/profiles/default.json`。
- reward-variant：enabled=true 后，multiplier 控制四连击奖励倍率，1–100 整数。
- story-branch：routes 的键为 `章节ID/页面ID/选项下标`，下标从 0 开始，值为 `目标章节ID/页面ID`。仅支持同一次加载的章节内页面。
- cinematic-style：启用后读取 `assets/art/resources/effects/card.json` 和 `avg.json`。

配置改变后停止并重新运行预览；当前会话的规则组合不会中途变化。剧情章节目录由 `assets/art/resources/config/avg-chapters.json` 维护；AVG open 回调的第二参数可选择章节 ID。当前首页仍保留默认剧情入口，增加入口在 base-shell 内完成。页面 page 使用数字字符串并按数值顺序加载，chapter/page 组合不可重复；新增页后无需修改代码里的页数。

## 美术日常工作

1. 在 art 内添加图片、动画、prefab，保留原有 `.meta`。
2. 调整已有 prefab 外观，但保留接口要求的节点名称。
3. 在效果配置中添加一条效果，指定事件、挂点、参数，按顺序排列。
4. 本地预览，确认退出、重开、回撤后没有残留节点。
5. 提交资产、配置与 meta；不需要修改 foundation。

可配置类型：pulse、shake、fadeIn、moveIn、sprite、prefab。常用字段：id、kind、target、enabled、duration、delay、x、y、scale；shake 使用 amount。when 可限制为精确关卡 ID，或 AVG 的 `章节ID/页面ID`。

卡牌事件：card.open/play/draw/reward/wild.prepare/wild.cancel/addBackup/rollback/complete。玩家在仍有可消除牌时点击备用牌，仍正常消耗一张备用牌、替换当前牌并记录回撤，同时摇摆提示抽牌前错过的可消除牌；提示随抽牌动画结束或取消而收起，不额外延长输入锁定，特效事件为 card.draw。非法动作仍由框架拒绝，不触发成功表现。
卡牌挂点：root、content、current、backup、progress、coin、wild、addBackup、rollback。source 是适配器提供的可选挂点，默认示例不提供它。
`addBackup` 的横向位置由表现层按当前可见备用牌的实际左右边界动态计算；耗尽时以待领取的 5 张预览牌为准。不要在 prefab 中把按钮 X 与 backup 容器 X 相等当作居中，隐藏牌槽、扩容和左右锚点会改变可见牌堆中心。按钮、费用和特效随运行时布局更新，原垂直位置与入场动画保留。
AVG 事件：avg.page.enter/page.turn/choice/chapter.end；挂点：root、background、roleLeft、roleRight、dialoguePanel、choices、endOverlay。

例如 card.reward 中加入：
```json
{"id":"coinPulse","kind":"pulse","target":"coin","duration":0.3,"scale":1.15}
```

新 prefab 放到 `assets/art/resources/effects/...`，配置 asset 使用相对于 resources 的路径、不带扩展名。sprite 使用 `effects/.../spriteFrame`。也可指定已有 Bundle 名及其内部资源路径。prefab 默认播放根节点 Animation 的指定 clip/defaultClip；粒子可使用 playOnLoad。duration 为实例保留时长，到期或取消会销毁。持续背景效果应写成有明确清理的 Mod 脚本，不要用无限 duration。

## 新增脚本 Mod

1. 复制 templates 下的示例说明，创建 `assets/mods/packages/<id>`。
2. 编写 manifest.json 和工厂 index.ts；manifest 包含 id/version/apiVersion/order/requires/conflicts。
3. 运行 `node tools/generate-manifests.cjs` 生成 ModManifest.ts，确保引擎无需直接导入 JSON 脚本模块。
4. 在 `assets/mods/Registry.ts` 的已知模块名单和工厂装配中注册。这个文件是应用装配点，不是 foundation。
5. 在 Profile 添加开关和配置，添加状态校验与行为测试。
6. 新能力需要的图片/prefab 放到 art/mod-assets 或对应可加载 Bundle 中。

只改倍率、速度、位置时改配置，不要创建新的补丁 Mod。配置跟随能力；通用资产独立管理。玩法模块有持久计数时须明确重开与回撤行为。

## 验证与故障定位

执行 `sh tools/check.sh`：严格 TypeScript 检查、运行时/玩法测试、资产与清单检查。无系统 Node 时使用本机 Cocos 自带 Node。需要先用 Cocos 打开工程生成 temp/declarations。

控制台 [Mods] 包含 mod、stage、action、message；状态快照不能包含资源对象。遇到加载错误先查 Bundle 和 config 路径；同一动作处理器重复会在装配时报错；版本或组合不同的快照不会恢复。

## 两人如何分工

以能力包分工，而不是把“含数值”一律归程序。卡牌飞行速度、轨迹、时长属于表现参数；扣费、命中判定、奖励和回撤属于玩法状态。二者都可以由 Mod 实现，但结算写在同步事务钩子，动画只读取提交结果。

| 工作 | 常用目录 | 合作方式 |
|---|---|---|
| 框架、接口、资源生命周期 | foundation | 由框架维护者统一维护；修改协议时双方同步版本 |
| 基础玩法和新玩法包 | mods/base-*、mods/packages | 每个能力包有负责人；逻辑与表现可以在同一个包内合作 |
| 图片、prefab、动画和布局 | art | 内容负责人维护，节点合约由双方约定 |
| 组合开关、倍率、效果参数 | art/resources/mods、art/resources/effects | 内容负责人可调；规则参数变化需共同验收 |

双方各自一个本地 Git 工作目录是正常协作方式，GitHub 是共同的正式版本；不要让两台 Codex 同时改同一个服务器工作目录。使用功能分支与小提交，开始工作先拉取，避免同时修改同一个 prefab/配置。目录约定能减少冲突，但不是访问权限隔离；需要硬性审核时，在 GitHub 配置实际账号的 CODEOWNERS/分支保护。仓库没有写入虚构账号。

伙伴最少学习：打开工程和预览、找到指定配置、保存并检查、查看 Git 差异和提交；脚本改动可以交给 Codex。无需学习整个内核再开始制作效果。Figma 继续做设计，运行资产与已接入的布局以项目内对应资源为准。
