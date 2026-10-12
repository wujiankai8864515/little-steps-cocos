# 旧工程历史归档与恢复

完整 Git 历史保存在本机 godot-history.bundle；[元数据](godot-history.json) 记录固定 commit、tree、文件数和 SHA256。bundle 已恢复到空 bare 仓库并核对全部 3,226 个 tracked blob 和 mode。旧私有仓库 wujiankai8864515/little-steps 的 main 与固定源 b4f77af 一致；本次不删除或改写该远端。

本机 bundle 不进入 Cocos Git 或游戏包。需求、设计、字体源、许可和技术记录已迁到对应目录并纳入 Cocos Git。完整恢复时，在 Cocos 根目录执行：

```sh
git bundle verify migration/archives/godot-history.bundle
git clone migration/archives/godot-history.bundle /absolute/new-empty-restore-directory
```

先按元数据核对 bundle SHA256、commit 和 tree，再使用恢复文件。目标为新空目录，不覆盖 Cocos 工程。新机器缺本机 bundle 时，可从保留的私有旧仓库读取 b4f77afc02999a465757177794343eb3d531c5e6；不要用其未来更新替代此历史来源。

显式调用历史工具时，tools/legacy_source.py 恢复 migration/.cache/godot-reference，并拒绝不匹配或已修改的来源。缓存是历史参考，正常 Cocos 构建、回归及字体生成不需要它。

历史文档原链接与旧命令按原文保留，原文件可从恢复目录查看。当前规则、架构和验收以根 AGENTS.md 及游戏、框架、打包文档为准，旧 Godot PASS 不代表 Cocos 通过。
