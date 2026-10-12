# 打包仓

微信开发者工具始终打开 `builds/wechatgame`。每次打包成功后更新同一个目录，无需重新导入项目。`engines` 维护通用框架，`games` 维护游戏，`builds` 维护平台模板、打包配置、工具和构建记录。目前这三部分仍在同一个 Git 仓库中，不增加嵌套仓库。

```text
little-steps-cocos/
├── engines/travel-core/                 # 框架源码和只读插件发行文件
├── games/xiaoyu-cocos/
│   ├── assets/plugins/travel-core.js    # 相对软链接到框架发行文件
│   └── build-templates                  # -> ../../builds/templates
└── builds/
    ├── wechatgame/                      # 微信小游戏完整入口，直接用开发者工具打开
    ├── templates/wechatgame/            # 需长期维护的配置、SDK、自定义脚本和额外文件
    ├── configs/wechatgame.json          # AppID、资源地址、引擎裁剪选项
    ├── cdn/wechatgame/remote/           # 当前远程资源，本机服务或部署CDN的资源源目录
    ├── tools/                          # 安装链接、构建、检查、目录更新、本机资源服务
    ├── work/                           # 每轮冻结镜像、原始引擎输出和更新前备份
    ├── records/                        # 源码、模板和构建配置的哈希清单
    └── reviews/                        # 构建日志、检查和失败证据
```

模板源和生成目录独立：Cocos 会清理、生成和覆盖构建文件，不能把整个生成目录再作为模板输入，否则容易把旧资源哈希、旧入口和旧配置带回新包。相对软链接只用于接入模板；微信开发者工具打开的目录是实际文件夹。

## 一次打包

在 `little-steps-cocos` 根目录执行：

```sh
python3 -B builds/tools/build_wechat.py --open
```

默认对当前本地源码做隔离快照，保留尚未提交的游戏修改，使用 Creator 3.8.8 构建、检查入口与资源完整性，然后更新 `builds/wechatgame` 并自动启动本机资源服务。`--open` 使用已安装的微信开发者工具命令行打开固定项目；无需打开工具时省略它。若工具关闭了命令行服务端口，构建仍完成，首次在工具里「导入」该固定目录，后续在已有项目点「编译」即可；脚本不修改工具的安全设置。AppID 默认 `wx4d41972686e54c11`，在 `builds/configs/wechatgame.json` 修改。单次覆盖可以使用 `--appid`、`--server`。

重新拉取或恢复源码后，Git 支持软链接的系统会自动恢复模板链接；也可执行以下命令安装并检查：

```sh
python3 -B builds/tools/build_templates.py
```

框架插件仍按原流程恢复只读权限。Creator 构建面板也能原生读取模板链接；更新固定目录请使用上述打包命令，避免绕过失败检查和目录更新逻辑。

## 模板放什么

- `templates/wechatgame/game.json`：长期的小游戏配置。保留引擎生成的分包、插件等动态字段，由 Creator 按原生规则融合。
- `templates/wechatgame/project.config.json`：长期的开发者工具配置。AppID 由打包配置注入，不在模板内重复维护。
- 额外脚本、SDK、开放数据域及其他固定文件：按最终包中的相对路径放进 `templates/wechatgame`，Creator 每轮自动带入。需要从入口执行脚本时，在自定义 `game.ejs` 中显式 `require`；仅复制文件不会自动执行。
- 需要定制入口时，用 Creator「项目 → 创建项目构建模板 → 微信小游戏」生成 `game.ejs` 到链接对应的目录，保留官方 `cocosTemplate`、`importMapFile`、`applicationJs` 等引用。不要把旧构建后的 `game.js` 当长期模板。

模板不放入引擎生成的 `assets`、`src`、`cocos-js`、`remote` 或带哈希的资源。普通文件按路径复制；`game.ejs` 渲染为当前构建的入口，`game.json` 和 `project.config.json` 由 Creator 融合。规则见 [Cocos 3.8 自定义构建模板](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/custom-project-build-template.html)。

## 覆盖与保留

新包在隔离目录构建与检查，成功后才更新固定目录。固定目录本身保持不变，避免开发者工具仍监听旧目录；依赖文件先更新，入口最后更新。前一轮生成文件按清单替换，已不再生成的旧哈希文件移除。`project.private.config.json` 和直接额外加入的文件保留；新生成文件与用户额外文件冲突时停止更新。长期自定义建议放模板，以便换机器和空目录恢复。

更新前的固定目录保存在本轮 `work/NAME/previous-wechatgame`，旧候选、构建日志和失败证据保留。构建失败、源文件变更、缺资源、错误AppID等结构检查失败均不覆盖当前固定项目。

## 本机资源和正式发布

当前游戏资源使用远程 Asset Bundle。为避免把全部资源放入微信主包，打包时把 `remote` 输出到 `cdn/wechatgame/remote`，以 `http://127.0.0.1:8794/` 服务，模板中 `urlCheck: false` 用于本机开发。打包命令自动启动服务；重启电脑后，打开开发者工具前运行：

```sh
python3 -B builds/tools/build_wechat.py --serve-only
```

如需前台运行服务：

```sh
python3 -B builds/tools/serve_wechat.py --port 8794
```

本机回环地址只能用于开发者工具。真机/正式版须提供已配置的 HTTPS 资源域名、部署对应 CDN 文件，并按微信要求启用域名校验。当前 Home 19,000,000 bytes 门槛仍单独记录；本机候选更新不代表通过发布门禁。`stage_wechat_delivery.py` 继续拒绝未通过全部门禁的交付物。

需要从已远端回读的源码生成候选，可传入原流程的回读记录：

```sh
python3 -B builds/tools/build_wechat.py --readback builds/reviews/READBACK.json --name wechat-review-NAME
```

模板和打包配置也从该冻结版本读取并记录哈希。旧版本若没有模板目录，保留旧行为，不隐式混入当前本地模板。其构建仍是候选；正式交付需全量门禁、HTTPS资源和真实设备验证。
