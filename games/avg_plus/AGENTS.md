# avg_plus 协作约定

本项目保留 Cocos Creator 3.8.8；架构以 docs/MOD_ARCHITECTURE.md 为准，操作流程见 docs/MOD_GUIDE.md。

新 AI 先读 [接手入口](docs/AI_HANDOFF.md)；代码、Figma 关卡、剧情和验证命令见 [开发手册](docs/DEVELOPMENT.md)，安卓构建／热更新／恢复和清理见 [发布手册](../../builds/android/HOT_UPDATE.md)。继续任务后更新对应状态和验证边界，保留历史报告，不把旧时点当作当前状态。

## Git 归属

本游戏是 `little-steps-cocos` 三仓结构下的 `games/avg_plus` 普通目录，统一由 `little-steps-cocos/.git` 管理。不要在游戏目录初始化独立仓库或添加子模块。提交从根仓进行并限定本次修改路径；保留本目录 `.gitignore` 的缓存、构建产物和待审核资源排除规则。

## 修改位置

- 通用生命周期、事务、排序、任务取消、快照协议：assets/foundation。
- 具体游戏规则、页面和表现：assets/mods。基础 AVG 和基础卡牌与其他 Mod 使用同一接口。
- 素材、prefab、剧情、关卡与可调参数：assets/art。这里不要放 TS/JS 脚本。
- Figma 导入生成的运行时组件放 assets/mods/shared/figma-runtime。

新增能力优先新增/修改完整模块；只有公共协议能力不足时才修改 foundation。不要为单个按钮或单条动画拆模块。需要新增公共协议时，同时更新文档和行为测试。

## 关键约束

- Mod 状态仅纯 JSON，按 ID 分区。execute/beforeCommit/validate 保持同步；候选状态校验通过再一次提交。
- 资源加载和动画使用 TaskScope，await 后检查任务/渲染代次；清理必须幂等。不要使用悬空 Promise 控制玩法结算。
- 写新玩法时明确重开、回撤和快照兼容语义。表现失败保留已提交规则状态，并恢复画面。
- 保留资产和脚本已有 .meta UUID；移动文件与 meta 成对进行。prefab 稳定挂点名称属于合约。
- manifest.json 是包清单来源；修改后生成 ModManifest.ts，并运行一致性检查。
- 不覆盖已有未提交工作，不把构建产物、library、temp 放进 Git。

## 交付验证

涉及框架或规则时运行 sh tools/check.sh；涉及 Cocos 适配、资源或 UI 时，额外构建并实际预览受影响交互。改动 Figma 工具时运行对应脚本测试。原生发布需另做设备验证，网页通过不能代替它。
