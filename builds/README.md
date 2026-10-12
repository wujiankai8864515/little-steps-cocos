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

电脑重启后无需重建，启动本机资源服务：

```sh
python3 -B builds/build.py wechatgame --serve-only
```

`--open` 尝试通过开发者工具CLI打开渠道目录；工具未开启CLI服务端口时，直接在工具中打开已有项目即可。脚本不会修改安全设置。`--appid`、`--server` 可单次覆盖 `config.json`。

从已远端回读的源码构建：

```sh
python3 -B builds/build.py wechatgame --readback migration/reviews/READBACK.json
```

## 模板和渠道扩展

微信固定配置和额外文件放 `wechatgame/templates/`，按最终包中的相对路径组织。Creator原生合并 `game.json`、`project.config.json`；普通文件按路径复制。需要额外脚本自动执行时，通过 `game.ejs` 显式引入，不把旧的生成入口和带哈希资源作为模板。

每次打包从渠道模板同步出真实的 `games/xiaoyu-cocos/build-templates/wechatgame`，并在隔离镜像中同步一次。Creator 3.8.8 的模板复制不能直接使用平台目录软链接，因此这里使用自动生成且不进 Git 的真实目录；只编辑渠道内的 `templates/`。新增渠道时，将该渠道自己的 `build.py`、`config.json`、`templates/` 放在新渠道目录；公共入口调用该渠道脚本。

## 迁移工具与记录

资源导入、对照工具、截图、验收记录、旧候选及缓存统一放在仓库根目录的 `migration/`，不放在打包仓。打包测试位于 `tests/builds/`。记录保留原文件内容和哈希，旧路径由读取工具映射到新位置，不改写历史清单。

当前本机资源地址为 `http://127.0.0.1:8794/`，打包命令自动启动服务。真机或发布需要合法HTTPS资源域名及对应资源部署。Home19MB门槛、源码冻结和微信真机验收仍按原规则执行。
