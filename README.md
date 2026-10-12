# 旅行木鱼 Cocos 工程

当前开发工程使用 Cocos Creator 3.8.8，正式交付平台为微信小游戏。需求、技术说明和资源来源均在本仓维护；日常构建、回归和字体生成不依赖相邻的 Godot 目录。版本号以 [游戏配置](games/xiaoyu-cocos/package.json) 为准。

三仓目前是同一 Git 仓库中的三个职责目录：

| 目录 | 维护内容 | 文档入口 |
| --- | --- | --- |
| engines/travel-core | 通用生命周期、资源门禁、输入、网格、骨骼与渲染能力 | [框架架构](engines/travel-core/docs/architecture.md) |
| games/xiaoyu-cocos | 游戏页面、玩法、存档、动作、光照、原美术与字体来源 | [需求与验收](games/xiaoyu-cocos/docs/requirements.md)、[游戏架构](games/xiaoyu-cocos/docs/architecture.md) |
| builds | 公共打包入口及各渠道的配置、处理脚本和模板 | [微信打包与资源归属](builds/README.md) |

[migration](migration/README.md) 保存迁移工具、历史证据、候选镜像、回读与失败记录，独立于日常打包仓。旧需求和设计原文保持可追溯；当前产品行为以游戏仓需求清单及最新用户覆盖为准。

## 微信小游戏打包

在仓库根目录运行：

```sh
python3 -B builds/build.py wechatgame
```

默认构建最新已保存的本地代码和资源，包含未提交修改。构建与门禁通过后更新固定 builds/wechatgame/project；微信开发者工具打开 builds/wechatgame。AppID 为 wx4d41972686e54c11，配置集中在 builds/wechatgame/config.json。

当前默认使用微信原生分包，不需要本机或局域网资源服务。官方 Cocos 3.8.8 引擎分离已开启。完整 Cocos Loading 独立于游戏及公共模块，在其首帧绘制后再加载框架、运行数据和游戏代码；照片、衣柜、旅行等页面图片按需加载。

最新已检查的开发候选为 wechat-loading-isolated-v5：主包 1,118,016 bytes，完整本地包 22,160,669 bytes，Home 后续依赖闭包 11,595,639 bytes。这些是生成文件字节统计，不是网络传输、冷启动时间或设备内存实测。代码与验证边界见 [本地验证记录](migration/reviews/M20-final-local-validation.json)。

## 验证与回退

游戏与打包回归、模拟器、真机触控、画质、听音及用户认可分别记录。微信工具热编译分包等待和 Home mipmap 警告仍待核，不以构建或回归通过代替完整产品验收。

Git 保留普通追加提交，禁止强推和 squash。旧 Godot 源码、资源和完整历史已归档，恢复说明见 [历史归档](migration/archives/README.md)。该归档用于追溯和回退，不参与当前 Cocos 运行或发布。
