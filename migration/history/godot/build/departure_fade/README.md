# 出发背包主角原地渐隐

来源：Sentinel_9e48cce7f12881918e3db43c01eb54dd，用户要求“旅行前的背书包主角别有向上的位移，改为渐隐”。这条覆盖此前 W3 记录中保留的末段漂移；W3 的单次穿戴、单次净化云要求继续有效。

## 确证根因与修改

生产源 `home/home_departure_visual.gd` 原来在 2.6–4.5 秒把静态背包主角叠加 `(28,-56)` 位移，接触阴影也按 drift 提前衰减。现仅移除此位移与关联“离地”阴影系数：主角保持 configure 时的原始位置、0.35 缩放及同一纹理，接触阴影在原位置跟随主角 alpha 淡出。

保留 0.76 秒原生/静态主角交接、0.9–1.5 秒显现、3.3–4.55 秒渐隐与 4.8 秒结束；没有改动垫子/UI、云的轨迹、一次云发射、资产/材质、旅行服务或存档。对照完整候选工程只有这一份生产 GD 不同，见 evidence/source_delta.json。

## 已验证的层次

- 官方 Godot 4.5.2 `6ce3de25a`，引擎 SHA256 `5803746bbe055bee0f07a3c5b0dd347719bd45599f3d34519a8a0beaf83014ae`。
- 修正后 115 份生产脚本解析通过，代码 diff 检查通过。
- 原生 Mesa llvmpipe 软件 GL：旧基线 13 项复现完整 `(28,-56)` 漂移；新候选 51 项通过，无脚本或运行错误。
- 新夹具实际点击 HomeNote 确认按钮。白天、夜晚关灯、夜晚开灯、720×1558 长屏共四组，每组对 0–4.8 秒做 481 个时刻采样：主角/承载层完整 transform 不变，原生 rig 与垫子不移动，退场 alpha 单调至零，无双主角，无第二次云。
- 3.92 秒 alpha=0.505999872，4.55 秒 alpha=0；四种情形 actor.position 均为 `(-332.5,-288.75)`，scale=0.35。4.8 秒释放和纸牌出现同帧，长帧与倒序年龄不会重播。
- 实际写入独立 native 存档，销毁重建 Home 后仍是同一旅行，无退场重播；旅行结束恢复原角色及投影。
- 原 W3 21 项另跑官方 GL 通过：真实确认、原穿戴状态保留、重复点击/请求、取消晚回调、失败后重试、suspend 清理与云只发一次。
- 主项与 W3 同时另有 headless 51/21 项通过。原生 GL 实帧已查看：完整主角、半透明主角、消失后、昼夜灯色和长屏，确认脚底/背包原位淡出，没有向上移动。PNG 转 lossless WebP 后逐 RGBA 字节一致，19 帧索引见 evidence/screenshots.json。

边界：以上是明确的源码组件候选，未生成本修复正式 PCK、未部署，不能替代本批统一冷包、Web/手机或用户视觉验收。旧冻结源码/包未改。

## 重跑

准备候选：使用 `build/travel_user_corrections/prepare_candidate.py NEW_OUTPUT OFFICIAL_ENGINE`；源根由工具位置确定。对比时先在旧干净基线准备 baseline，再复制到独立 candidate，只替换本生产 GD，并核对完整文件 SHA 差异。

原生 GL：

```sh
python3 build/departure_fade/run_component_gl.py OFFICIAL_ENGINE CANDIDATE_PROJECT build/departure_fade/check_fade.gd NEW_OUTPUT candidate
```

旧基线复现：同命令最后一项换成 baseline，并使用旧源码工程。它明确断言旧位移存在，仅是缺陷复现，不是当前需求验收通过。

正式整合包：`check_fade_formal.gd` 仅接收精确 PACK_ROOT、OUT、none；必须从空 res 根运行、main-pack 指向该 PACK_ROOT/index.pck，并先运行 qa_source_guard formal 门禁。wrapper 只挂载同一根目录的 house/exterior/departure/travel 包，不接受候选覆盖。预检通过脚本解析和递归覆层门禁；本次未对新正式包运行。继承夹具的内部 report 保守标记为组件候选，正式属性应由整合 runner 的精确命令、包 SHA 与运行证据共同认定，不能改一行标签就认定正式。

```sh
OFFICIAL_ENGINE --path EMPTY_RES --main-pack PACK_ROOT/index.pck --rendering-method gl_compatibility --script ABS_SOURCE/build/departure_fade/check_fade_formal.gd -- PACK_ROOT OUT none
```

正式资源等待与失败回归继续使用本批原 W3 的 none-only 正式夹具，不能用本次全资源工程冒充冷加载证据。
