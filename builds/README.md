# 打包仓

根目录放公共脚本。渠道目录集中放本平台的配置、处理脚本、模板和固定产物；日常打包只需要看这里。

```text
builds/
├── build.py                   # 公共打包入口，选择渠道
├── common.py                  # 公共路径、模板接入、资源门禁和HTTP传输
├── README.md
└── wechatgame/
    ├── config.json            # 微信AppID、资源地址和构建选项
    ├── build.py               # 微信构建与固定项目更新
    ├── prepare.py             # 微信构建镜像及平台配置
    ├── assets.py              # 仅构建镜像的背景/音频减包
    ├── startup.py             # 同色启动底和额外渠道文件安装
    ├── isolation.py           # Loading独立及游戏代码延迟分包
    ├── audit.py               # 微信包检查
    ├── stage.py               # 正式交付暂存，保留全部门禁
    ├── serve.py               # 微信本机资源服务
    ├── templates/             # 微信固定配置、SDK及额外脚本
    ├── project/               # Cocos生成的完整小游戏项目
    ├── remote/                # 当前微信远程资源
    ├── project.config.json    # 开发者工具入口，miniprogramRoot=project/
    └── project.private.config.json # 开发者工具个人配置
```

微信开发者工具仍打开 **`builds/wechatgame`**。根入口指向 `project/`，因此脚本和模板不会进入小游戏包。也可以单独打开 `project/` 中的完整项目。

## 使用

对助手说「打包小雨游戏」或「打包旅行木鱼游戏」，默认按下述入口打包微信小游戏。规则已写入根目录 `AGENTS.md`；其他游戏需要先配置游戏与渠道的映射。

在仓库根目录执行：

```sh
python3 -B builds/build.py wechatgame
```

打包默认读取当前本地源码，创建隔离镜像，使用 Creator 3.8.8 构建并检查，成功后更新同一个 `project/` 和 `remote/`。生成项目目录本身不替换；依赖先更新，入口最后更新，旧生成文件按清单清理，用户额外文件和个人配置保留。失败不覆盖当前项目。

默认包含游戏仓已保存但未提交的代码和资源，不复用旧候选包。复制前后以及更新产物前均核对实际源码、资源、框架和模板；若构建期间又修改了它们，停止更新并提示重新打包。只有显式传 `--readback` 才会构建指定历史版本。

默认为微信原生分包，不需要同 Wi-Fi 或资源服务器。`--device` 显式选择这一模式。微信工具的自动真机调试会传输完整代码包和分包，运行时按页面加载。

`--build-only --name NAME` 只生成并审计候选；`--stage-existing --name NAME` 更新固定项目，仍会检查源码是否改变。`--open` 尝试通过已安装工具的 CLI 打开项目，不修改安全设置。

已有 HTTPS 资源服务时，可显式执行 `--resource-mode remote --server https://域名/目录/`，并自行部署 `remote/`；`--serve-only` 仅在远程资源模式下恢复本机模拟器服务。原生分包模式不启动任何资源服务。

渠道配置启用均衡减包：大背景保持原设计几何，显示纹理以 720 宽采样，保留原纵向比例，每张不超过 500,000 bytes；大插画采用 256 色 PNG，小图、字形、数据掩码与原生背包 mipmap 保留。音乐为 44.1 kHz / 48 kbps 单声道 MP3；短音效保持单声道 PCM，避免 MP3 启动延迟破坏敲击。转换只在隔离镜像内进行，原素材保留于游戏仓。

首次安装减包依赖：`python3 -m pip install --target migration/.cache/python -r builds/wechatgame/requirements.txt`。缓存不进入打包仓或 Git。

首屏保留完整 Cocos Loading 的美术、动作和进度界面，由独立的 `assets/startup` 代码及 `loading` 本地 Bundle 实现；只引用四张动画图片、独立的小字体和小清单，不依赖游戏框架、公共 UI 或全量资源目录。第一帧实际绘制后，才加载 `framework_code`、`runtime_data` 和 `gameplay_code`，再进入登录/小屋。渠道构建把全量 resources 移至隔离镜像的 runtime_data，不改变原工程资源位置。游戏页面代码在首屏之后加载，页面图片仍按需加载。引擎初始化期间只有同色底，没有另一套简陋进度界面；完整 Cocos 界面需要引擎初始化后才能绘制。`useSplashScreen=false` 关闭 Cocos 标志页。官方 `separateEngine` 使用已授权的 CocosCreatorV3 3.8.8 插件，保留兼容回退；实际主包门槛仍检查生成字节。

公共资源 Bundle 优先级高于页面 Bundle，但低于引擎内置包。运行时先完成公共依赖的 `loadBundle`，随后按页面取得具体资源；不把可选页面资源全部塞入启动公共包。每次审计记录实际 Bundle 依赖、清单开销及 native 内容重复字节。原生主包仍按 4 MB、完整代码包按 30 MB、Home 依赖闭包按 19 MB 保守检查，静态通过不代表手机性能或画质验收。

参考：[Asset Bundle 规则](https://docs.cocos.com/creator/3.8/manual/zh/asset/bundle.html)、[微信引擎插件](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/wechatgame-plugin.html)、[纹理压缩](https://docs.cocos.com/creator/3.8/manual/zh/asset/compress-texture.html)。ASTC 支持微信真机，但开发者工具模拟器不支持；当前默认使用普通 PNG 兼容包，不额外附带一整套 ASTC + PNG 重复纹理。

从已远端回读的源码构建：

```sh
python3 -B builds/build.py wechatgame --readback migration/reviews/READBACK.json
```

## 模板和渠道扩展

微信固定配置和额外文件放 `wechatgame/templates/`，按最终包中的相对路径组织。Creator原生合并 `game.json`、`project.config.json`；渠道脚本显式复制额外的 `platform.js`，随后移入 framework_code 分包，不能假定 Creator 自动复制任意 JS 文件。需要额外脚本自动执行时，通过 `game.ejs` 显式引入，不把旧的生成入口和带哈希资源作为模板。

每次打包从渠道模板同步出真实的 `games/xiaoyu-cocos/build-templates/wechatgame`，并在隔离镜像中同步一次。Creator 3.8.8 的模板复制不能直接使用平台目录软链接，因此这里使用自动生成且不进 Git 的真实目录；只编辑渠道内的 `templates/`。新增渠道时，将该渠道自己的 `build.py`、`config.json`、`templates/` 放在新渠道目录；公共入口调用该渠道脚本。

## 迁移工具与记录

资源导入、对照工具、截图、验收记录、旧候选及缓存统一放在仓库根目录的 `migration/`，不放在打包仓。打包测试位于 `tests/builds/`。记录保留原文件内容和哈希，旧路径由读取工具映射到新位置，不改写历史清单。

原素材、候选与失败记录均可追溯回退；日常打包始终读取最新已保存源码。

## Cocos 运行时与资料归属

当前渠道使用工程固定的 Creator 3.8.8。规范游戏源码、原图、字形与存档规则属于游戏仓；完整字体原文件在游戏 source/fonts，设计参考在游戏 docs/design，均位于 Cocos assets 之外，不进入微信包。通用资源门禁和渲染能力属于框架仓。旧 Godot 目录退役后，日常打包不读取或恢复该工程；资源门槛的当前定义见 [游戏需求清单](../games/xiaoyu-cocos/docs/requirements.json)。

| 运行时目录或包 | 内容 | 请求时机 |
| --- | --- | --- |
| 主包 main 和 loading | Boot、独立 Loading 代码、四张动画图、小字体、小清单及启动适配 | Cocos 初始化后显示完整 Loading |
| framework_code | 同字节 travel-core 插件及微信 platform.js | Loading 首帧绘制后 |
| runtime_data | 全量资源和场景目录、游戏 effects | 框架安装后 |
| gameplay_code | Application 和游戏页面代码 | 数据包就绪后 |
| login、comic、home | 当前入口与小屋所需资源 | 相应页面准备时；Home 在漫画进入动作后请求 |
| photo_visual、wardrobe_visual、travel_visual 等 | 可选页面图片与数据 | 按页面和明确业务需求加载 |

isolation.py 只处理冻结镜像及生成包：搬移 resources、从 eager jsList 移出框架、生成可 require 的 runtime-framework.js 并刷新入口哈希引用。微信 require 不具备 Node JSON 导入语义，不能把该清单改回 JSON require。startup.py 显式复制额外渠道 JS，不能假定 Creator 会复制所有自定义脚本。

settings 中的 preloadBundles、实际 Bundle deps、游戏目录中的业务依赖是不同层。公共依赖先加载，可选资源不提前混入首屏；loadBundle 不等于已解析包里所有图片。每次审计检查独立 Loading、只读框架、真实 payload、重复字节和闭包预算。

当前 v5 候选的主包为 1,118,016 bytes，总本地包 22,160,669 bytes，Home 后续闭包 11,595,639 bytes，native 相同 payload 额外重复字节为 0。这些数字来自生成文件清单，不是客户端下载大小或真机内存。热编译等待、mipmap 警告、冷启动与实际触感仍按 [验证记录](../migration/reviews/M20-final-local-validation.json) 和 [重复编译记录](../migration/reviews/M20-devtools-repeat-start-wait.json) 的边界处理。
