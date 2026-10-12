# travel core Cocos 框架架构

travel-core 为 Cocos Creator 3.8.8 游戏提供通用生命周期、资源准入、输入、二维网格、文本、音频和渲染能力。它不维护旅行、照片、衣柜等玩法，也不承担微信渠道打包。

## 发行与接入

源码在 [src](../src)，发行文件为 dist/travel-core.js。游戏 assets/plugins/travel-core.js 通过相对软链接接入，Engine.ts 获取 LittleStepsCore 并注册 Cocos 适配。仓库根目录安装命令：

```sh
node engines/travel-core/tools/install-plugin.cjs
```

安装脚本生成发行物、恢复只读权限并检查元数据与链接。Git 软链接本身不提供只读保证。微信构建把同字节插件移入延后的 framework_code 包，完整 Loading 不依赖它。

## 通用模块

| 能力 | 源码 | 契约 |
| --- | --- | --- |
| 生命周期 | lifetime.js | parent 管理子 scope，own/disown 管清理，guard 拒绝取消后的延续，清理错误不静默吞掉 |
| 资源门禁 | resource-gate.js | acquire 去重、共享承诺及引用计数，固定 80 specs、128 entries、256 MiB 预估上限 |
| 页面切换 | cocos-router.js | 当前页面、转场与取消；游戏决定目的页面和真实 ready 条件 |
| 输入与气泡 | ui.js、choice-ui.js | 按下、移动、释放、取消、命中与 owner，共用测量、尾巴、安全区和动画 |
| 图像与文本 | alpha.js、bitmap.js、bitmap-text.js | 固定遮罩与字形，源坐标和真实 alpha 命中 |
| 几何与绘制 | math.js、cocos-mesh.js、drawing.js、stylebox.js | 仿射变换、网格、骨骼及抗锯齿图元，保留确定性边界 |
| 渲染目标 | cocos-surface.js | 创建、暂停、恢复和休眠渲染表面，显式释放目标 |
| 音频 | audio.js | 播放状态与生命周期，停止晚到播放；游戏决定音乐策略 |
| 持久化与随机 | checkpoint.js、random.js | 校验 envelope 和固定算法；游戏决定具体事务和玩法 |

ResourceGate bytes 是准入估计，不是手机全部内存。replace 只允许已完成且独占的租约，先释放旧分配再创建新分配；取消后不能读取或替换已释放租约。

## Cocos 与微信边界

框架依赖 Cocos 类型和适配，不决定页面分包时机、存档键或平台震动。微信能力在 builds/wechatgame 中实现，由游戏通过小端口调用。GameAssets 先加载业务依赖，Cocos 处理 native 分包、资源文件及平台播放。

引擎分离指官方 Cocos 引擎插件，framework_code 指本项目框架；它们是不同层。Loading 使用独立小实现减少解析量，不能为了复用通用 UI 又静态引入整个框架。

## 原算法与许可

数学、随机、字体测量、抗锯齿和圆角几何保留历史一致性约束。部分算法改写自固定 Godot 源码；[NOTICE.godot.txt](../NOTICE.godot.txt) 与 pako 许可必须保留。这些来源说明不表示 Godot 是当前运行引擎。

框架回归覆盖生命周期、取消、输入和几何边界，游戏回归覆盖玩法及 Cocos 注册。类型检查、数学样本和静态门禁不代替真实渲染、触控或微信设备表现。
