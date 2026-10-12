# 迁移工具与历史记录

当前产品、架构及打包说明分别由游戏仓、框架仓和打包仓维护。本目录保存迁移工具、候选、原始来源、失败证据和验证结果，不参与小游戏主包。

| 目录 | 内容 |
| --- | --- |
| tools | Cocos 迁移、资源处理、截图和检查工具 |
| records | 初始需求快照、来源与构建输入清单 |
| reviews | 运行、资源、打包、回读和失败记录 |
| history/godot | 原需求、技术记录与验收原文 |
| archives | 历史归档元数据、恢复说明和本机 Git bundle |
| work、output、.cache | 不进 Git 的隔离工程、产物和缓存 |

旧 records/requirements.json 是迁移开始时的冻结快照；当前有效需求见 [游戏需求](../games/xiaoyu-cocos/docs/requirements.md) 及 requirements.json。旧执行约束保存为 historical-agent-policy.txt，不能替代当前 AGENTS.md。

Godot 工作目录已退役。日常打包用 python3 -B builds/build.py wechatgame，读取最新 Cocos 内容，默认微信原生分包并更新固定项目。详见 [打包仓](../builds/README.md)。不要将旧 builds/tools、CDN 回环地址或 Godot Web 导出命令用于当前产品。

历史报告保持原字节、commit、时点和边界。报告旧路径与原截图、脚本可通过 [完整归档](archives/README.md) 恢复查看；设计参考在游戏 docs/design，字体来源在游戏 source/fonts。

Godot 对照工具仅在显式调用历史流程时恢复固定缓存，使用 tools/legacy_source.py，不能将其作为最新开发源码。正常 Cocos 回归和构建不需要该缓存。算法来源、逻辑 res:// 键、历史 oracle 与许可证不应删除或伪造为 Cocos 来源。
