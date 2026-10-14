# 向老板开炮

在 `games/boss` 实现的 Cocos Creator 3.8.8 竖屏微信小游戏。玩法参考用户提供的 `boss4.zip`，内容参考《向老板开跑》交付研发版。原有场景 UUID、Boot UUID、组件挂载和 720×1280 设计尺寸保留；所有页面与赛道由代码创建。

## 开跑

在 `little-steps-cocos` 根目录执行：

```sh
python3 -B builds/build.py wechatgame --game boss
```

微信开发者工具打开 `builds/wechatgame/boss`。可分享给研发的压缩包为 `migration/output/boss-wechatgame-1.0.0.zip`。默认使用本机微信工具内置「测试号」提供的 AppID，是尚未提交微信审核的本地开发包。其他开发者导入时如提示没有开发者权限，应使用自己工具的「测试号」。`--device` 同样使用原生分包，无需同 Wi-Fi 或资源服务器。CLI 服务端口关闭时，使用工具「项目 → 导入项目」，无需修改安全设置。

```sh
python3 -B builds/build.py wechatgame --game boss --preview
python3 -m http.server 8816 --bind 127.0.0.1 --directory migration/output/boss-web
```

打开 `http://127.0.0.1:8816` 进行网页验证。独立 Chrome 验证脚本在 `migration/tools/verify_boss_browser.cjs`，证据保存在 `migration/reviews/boss`。

## 完整玩法

- 25 个顺序解锁的关卡，五家公司，每家公司有对应老板肖像、专属技能、台词和终极老板。
- 大乱斗随机赛道、老板和公司技能，与闯关共用钱包、皮肤、体验卡和远征。
- 自动跑酷，左右滑动；电脑可用方向键、A/D，屏幕也提供左右按钮。准备三秒，赛道约 150 秒，入场三秒，火力对拼八秒，三分钟内到达办公室。
- 加减、倍率及组合抉择门；金色光环福利与红色恶魔角障碍；十种道具包含摸鱼无敌、同事背锅、内卷抢收益、卡需求、裁员退回起点及单局一次的彩票。
- 实际精力达到老板数值即胜利，结算窝囊费并解锁下一关；失败可重开或每局恢复一次，保留 80% 剩余精力并返回后段赛道。
- 男女打工人、三套皮肤、十种体验卡、九片合成、窝囊费兑换、一次性开局装备、150 精力轻养护。开局增益取最高值。
- 伙伴远征十分钟，离线计时；奖励在派遣时保存，领取后清除任务，避免重复开包。每日补给按北京时间每天领取一次。
- 本机最高火力记录、真实微信好友云存储榜入口、可配置联网排行、微信分享、音乐音效、可关闭震动、前后台自动暂停和本机双份存档恢复。

## 真实平台接口

没有把附件中的「必落地」标注当作发布、创建后台或申请微信账号的授权。当前交付可以独立游玩：包裹免费领取，未配置广告时恢复按钮明确写「免费恢复」，分享不冒充成功回调、不直接发未经核验的分享奖励。

- 游戏自己的 AppID：`builds/wechatgame/games/boss.json` 和对应渠道模板中的 `project.config.json`。不要复用其他游戏的 AppID。
- 激励视频：`assets/resources/data/platform.json` 的 `rewardedAdUnitId`。配置后只在 `onClose.isEnded === true` 时恢复；取消、错误和重复点击不发放。
- 好友榜：原生 `open-data/index.js` 只读取真实好友 `boss-cleared`、`boss-earned` 云存储值。在微信账号和开放数据权限具备时验证，网页清楚显示边界。
- 全网榜：配置 `leaderboardEndpoint` 为已加入微信合法域名的 HTTPS 服务，返回 `{ "rows": [{ "name": "昵称", "cleared": 3, "earned": 120 }] }`。默认不虚构其他玩家。服务端写入、身份核验和反作弊属于后端接入工作。
- 微信分享按钮调用真实 `shareAppMessage`。微信没有可用于可靠发奖的普通分享成功回执，因此不会把按钮点击当成已分享成功。

## 源码与资源

`assets/core` 是不依赖 Cocos 的数值、赛道与存档模型；`assets/runtime` 负责 Cocos 页面、输入、原画加载、音频与微信接口；`assets/resources/data/levels.json` 保留参考关卡内容，可直接维护。Boot 不需要手工拖拽资源。

附件 PNG 原字节保留于游戏资产，来源与 SHA256 见 `source/provenance.json`。仅在隔离构建镜像缩小大背景和肖像，原图可回退；每次构建记录转换前后哈希。字体原件来自附件且为字形子集，数值门使用原字体，中文使用设备字体避免缺字。音频由导入工具原创合成为单声道 PCM。用户附件资源的外部发布许可仍以资源所有者的授权为准，未添加虚构的许可。

`test/game.test.cjs` 包含数值、完整关卡可通关、计时边界、交易防重复和存档恢复回归。微信静态分包检查通过不等于真机验收；必须保留实际验证边界。

本地源码副本为 `migration/output/boss-source-1.0.0.zip`。实际验证结果及未核验项见 [验证记录](docs/VALIDATION.md)。

参考技术文档：[Cocos 3.8 命令行发布](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/publish-in-command-line.html)、[Asset Bundle](https://docs.cocos.com/creator/3.8/manual/en/asset/bundle.html)。
