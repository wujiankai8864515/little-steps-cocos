# AVG Plus

Cocos Creator 3.8.8 的 AVG + 高低接龙游戏，采用微内核与 Mod 组合架构。

**新 AI 从 [接手总览](docs/AI_HANDOFF.md) 开始。** [开发与内容维护](docs/DEVELOPMENT.md) 包含代码地图、Figma 40 关、既有 AVG、存档、图标和检查命令；[安卓热更新手册](../../builds/android/HOT_UPDATE.md) 包含构建、必要文件发布、同版本恢复和产物清理。最新交付与未完成项在接手总览维护，历史执行文档保留原时点。

- `assets/foundation`：公共协议、确定顺序、事务、异步取消、快照。没有具体玩法。
- `assets/mods`：基础 AVG、基础卡牌、入口路由，以及可选玩法/表现扩展；基础玩法也实现普通 Mod 接口。
- `assets/art`：图片、字体、prefab、关卡、剧情和效果配置。

用 Cocos 打开本工程，等待导入，打开 `assets/mods/base-shell/scene.scene` 预览。组合开关位于 `assets/art/resources/mods/profiles/default.json`；默认保留基础玩法，扩展示例按需启用。

日常协作参考 [Mod 入门](docs/MOD_GUIDE.md)。程序维护者阅读 [架构与异步协议](docs/MOD_ARCHITECTURE.md)，新增能力参考 [Mod 模板](templates/MOD_TEMPLATES.md)。[迁移执行与验收记录](docs/MOD_MIGRATION.md) 说明 2026-09-17 迁移时的内容与边界，不代表最新安卓发布状态。原卡牌节点接口保留在 [UI 合约](GAME_UI_ARCHITECTURE.md)。

运行 `sh tools/check.sh` 检查类型、事务/玩法行为、配置、资源 UUID 和目录依赖。先让 Cocos 生成工程类型声明；脚本可使用本机 Cocos 自带 Node。

当前仍有 18 个历史 UUID 基线缺失使资产检查整体失败；类型／行为与实际导出引用的检查结果分别记录，不删基线来伪装全部通过。
