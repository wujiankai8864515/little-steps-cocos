# H03 / A007：恢复原敲击动作，只缩短自动敲击后的停留

用户覆盖要求：`Sentinel_8a392f2b78f08191a9fe5e1d9e2e1d84`，原文“现在的主角敲木鱼动作太快了，不像敲木鱼，改回之前的，只是之前的敲木鱼动作和动作之间间隔太长”。基线 `56193b766b3c13d83ac5aee7149f4d8045e5733e`；原动作参照 `efc034a^`。

## 实际改动

- 删除把原动作分段压成 0.58 秒的 `_tap_pose_time`；直接按原 clip 时间取样，保留原 1.29 秒接触点、3.2 秒完整手动 clip，以及原来的 1.08 倍/轻微逐次节奏变化。
- 原动画文件逐字节未变。肩膀与槌在 1.8667 秒回位，尾巴到 2.15 秒才全部回位。自动敲击保留完整的 0–2.15 秒运动，再独立停留 280ms；没有截掉尾巴、缩短蓄势或加快下落/回弹。
- 动作参数为 `TAP_LENGTH` / `TAP_MOTION_END` / `TAP_HIT`；自动停留为 `home_behavior/tap_idle_seconds`，默认 0.28，范围 0.1–0.75 秒。自动周期等于 `2.15 / current_tap_speed + tap_idle_seconds`。上限保证原 clip 尾部不会循环到第二次视觉动作。
- `player_resume_delay_seconds` 仍为 0.8 秒，只负责交互后恢复；与自动循环停留分开。手动轻点继续取消待完成敲击，并从原 clip 开头完整重播。
- 原 contact 同帧姿态、现有温和反应、冲击线、一击一次功德/音效、拖拽/焦点/页面/出发暂停保留。自动循环更密，单位时间自动击数随间隔缩短增加；没有额外重复结算。

## 验证结果与边界

唯一引擎为官方 `4.5.2.stable.official.6ce3de25a`。专项工程独立覆盖 Home 两个脚本；资源和未改源码引用只读已组装缓存，没有改共享工程，没有正式 PCK、GitHub 推送或发布。

- `real_clock_headless.json`：41/41。正常真实墙钟运行，无 fixed-fps、无动画加速。按帧检查蓄势、回弹和尾巴均原时间直接取样；实测 contact 约 1.22 秒，完整手动 clip 约 2.99 秒，自动运动约 2.00 秒 + idle 约 0.28 秒，周期约 2.28 秒（原约 2.96 秒）。把 idle 单独改到 650ms，动作段不变、周期仅增加约 370ms。
- `production_input.json`：21/21。真实根视口鼠标、触摸、取消回位、背包邀请取消、暗室返回。
- `native_gl_half_render.json`：38/41，Mesa llvmpipe GL；根输入 720×1280，离屏房间 360×640。实际 contact 的一次功德、一次转发到真实音效接口、冲击线和接触姿态通过；连点重启、触摸去重、拖拽、失焦/回焦、页面暂停、出发/返回、回位均通过。3 个严格墙钟断言失败，原始证据保留：软件渲染一次阻塞 426ms，触发原有 100ms 积分上限，不能声称设备时序性能已达标。
- `native_gl_full_render.json`：31/41。完整离屏房间 720×1280 首次渲染阻塞约 1045ms，后续最大 587ms；紧墙钟/首次 contact 截止断言失败。完整功能状态流继续通过，不能改称全过。
- `original_curve_audit.json`：原始 rig SHA256 一致及所有骨骼回位时间审计；Body scale/position 在两版 `_sample_base_pose` 中均由既有逻辑归零/固定，不以其呼吸曲线冒充有效动作差异。

## 实际渲染对照

[原版与恢复后并排 1x 影片](comparison_1x.mp4) 左侧为 `efc034a^` 原版动作，右侧为本轮恢复动作+280ms 停留。已实际查看蓄势、槌头落下、接触、回弹、尾巴回位，以及第二轮开始时机；两侧第一击位置和相位一致，右侧只更早开始下一次动作。

`original_movie_samples.json` 与 `restored_movie_samples.json` 是相应逐帧记录。原版接触约 1.23 / 4.10 / 7.00 秒；本轮约 1.23 / 3.43 / 5.70 / 7.93 秒。

影片使用官方 MovieWriter 30 FPS、`Engine.time_scale=1` 固定动画步长，8 秒模拟动画实际录制约 35 秒。它是实际 Mesa GL 的原速动画对照，**不是**真实设备 FPS、浏览器性能、手机触感或人工听音证明。影片音轨取右侧，本轮一次音效由真实音频接口调用计数另外验证。

## 复现

在组装专项工程覆盖本提交的 `home/home_world.gd` 与 `home/behavior/ambient_director.gd`，保持其它资源不变。隔离 XDG config/cache/data，然后使用固定官方引擎：

```sh
Godot_v4.5.2-stable_linux.x86_64 --headless --audio-driver Dummy --max-fps 60 \
  --path QA_PROJECT --script REPO/build/checks/test_strike_feedback.gd -- real_clock.json
Godot_v4.5.2-stable_linux.x86_64 --headless --audio-driver Dummy --max-fps 60 \
  --path QA_PROJECT --script REPO/build/checks/check_production_input.gd -- input.json
```

有 Xorg 的原生 GL 环境运行同一专项脚本；可选最后参数 `half_render` 仅降低测试离屏房间栅格尺寸并预热，保留 720×1280 的输入与同一生产逻辑。它没有放宽时间断言，失败照常记录。

影片使用 `build/checks/record_original_strike_rhythm.gd`，加 `--write-movie output.avi --fixed-fps 30`。原版与修改版须用独立源码快照，不能让旧版覆盖到共享/正式工程。
