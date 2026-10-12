# 暗室完整一轮：原包实证与覆盖补齐

范围：B27-1/2/3/4、B16-13 及历史32项中的暗室黑气主题。此提交只补专项回归和证据，不改产品玩法、Home、Travel、Photo、App、manifest 或暗室生产源码。

## 结论

此前 `check_production_input.gd` 暗室段只实例化页面、点击返回并检查路由信号，没有验证针、拖鞋、消散或下一轮。本次确证的是旧验收覆盖缺口，不是暗室整轮产品实现缺失。

精确冻结 `56193b766b3c13d83ac5aee7149f4d8045e5733e` PCK，在空 res 根用官方 Godot 4.5.2 和 Mesa llvmpipe 实际运行生产 App。720×1280、720×1558 两个逻辑画布分别通过 63 项行为检查，各派发 35 次 root.push_input。两次都没有覆盖包或物理生产资源兜底，res 物理目录只有 project.godot。暗室源码在该冻结版本与本任务基线 b3f47f2489eed9a47ea58a76b2b0ee8ad656e793 之间没有变化。

严格整包 runner 两次都返回失败，原因均为已知旧 Home 日记加载 `res://travel/assets/travel_brush.ttf` 缺资源。日志没有忽略或白名单，该缺陷仍需要之后关联组新包的独立回归；暗室行为通过不等于全包通过。

## 已实际验证

- 生产 App 原生 backend 按 manifest 校验文件大小及 SHA256，实际动态 mount。只为跳过无关开场漫画使用 `_commit_home` 夹具；之后娃娃按下、拖给木鱼、邀请确认、暗室输入和返回均经根视口实际事件分发。
- Home 就绪时未挂 darkroom，针资源不存在；按下真实 alpha 娃娃即启动准备。邀请确认后 App 经 first_draw 到 ready，暗室 SubViewport 确有 draw calls 再允许输入。
- 默认针一次减10；第二次真实 touch 附合成鼠标仍只减10；取消 touch 加合成鼠标不启动打击。均在工具接触时结算，不在按下/抬起时结算。
- 真实点击托盘选拖鞋，每次接触减20且恢复后不重复。两针、四拖鞋正好消除100晦气。
- 消散、空档、新娃生成期间的点击不追加接触或排队；completed_rounds 仅加1，finished 仅发1次，新娃 serial 仅加1，恢复100后可再击至80。
- 真实返回牌经过生产 router 返回可用 Home，暗室暂停并清理瞬态输入。全链没有挂载 travel 包。

动画时钟及墙钟都实测。PNG 编码推迟到整轮结束，避免图像压缩暂停测量中的1秒空档：

| 逻辑画布 | 消散（动画/墙钟） | 空档（动画/墙钟） | 新娃生成（动画/墙钟） |
| --- | --- | --- | --- |
| 720×1280 | 2.838 / 2.840 秒 | 1.009 / 1.000 秒 | 1.564 / 1.572 秒 |
| 720×1558 | 2.859 / 2.867 秒 | 0.992 / 0.998 秒 | 1.558 / 1.555 秒 |

配置目标分别为2.85、1.00、1.55秒。这里是软件GL本次观测，不是用户设备GPU/60fps承诺。

## 实际画面核对与仍未通过项

已实际查看原始打击、工具、黑气、消散、空椅、新娃与返回帧，并复查下列截图拼图，未以断言数代替视觉判定：

- [720×1280画面](../darkroom_round/evidence/720/review_sheet.jpg)：针尖和拖鞋进入娃娃身体接触位置，接触后黑紫色烟气可见；清零后金色烟雾和身体消散，空档椅子没有娃娃；新娃与提示恢复。
- [高屏幕比例画面](../darkroom_round/evidence/tall/review_sheet.jpg)：720×1558对应约390:844的比例。返回牌、工具和娃娃能操作；旧暗室上下补边有明显拉伸条纹与接缝，仍列为视觉未通过。本专项没有将其改成“整体视觉通过”。确证代码是 `darkroom/helpers/room_bleed.gd` 把原图顶部/底部18像素条带拉长填充额外高度；尚未修改该项。

没有验证手机触感、听音、浏览器下载/缓存、Web内存或硬件GPU。之后关联组包尚未生成，不得用561原包结果替代它。

## 失败复盘与夹具修正

1. 整包缺字体：触发于空res首次构造Home日记，日志定位 `travel_open_diary_art.gd:50` 加载未挂的 travel_brush.ttf。它在最终两次日志中仍存在，严格runner不放宽门槛；此专项按授权不改Travel。
2. 早期跳过漫画夹具在 `_commit_home` 清引用前没有回收离树的预热漫画，退出时产生RID泄漏噪声。等待预热完成并回收被省略的页面，再排队释放App、等待六帧后退出。最终两次日志不再有该类泄漏；这不是暗室产品修复。
3. 初次高屏夹具错误地把390当生产逻辑宽度，又曾使用不含SubViewport canvas偏移的确认按钮global rect，导致夹具点击落空。生产App保持720逻辑宽度；改为720×1558且用 get_global_transform_with_canvas 得到实际按钮位置。最终画布尺寸断言及邀请确认闭环通过。
4. 初次在阶段中同步save_png使墙钟包含图像压缩暂停。现在捕获Image后统一在整轮结束编码，保留动画时钟和墙钟双重约束；最终两次时长均在目标的规定容差内。

## 证据与后续同源验证

- [720行为明细](../darkroom_round/evidence/720/results.json)、[原包hash/错误](../darkroom_round/evidence/720/summary.json)、[完整日志](../darkroom_round/evidence/720/render.log)
- [高屏行为明细](../darkroom_round/evidence/tall/results.json)、[原包hash/错误](../darkroom_round/evidence/tall/summary.json)、[完整日志](../darkroom_round/evidence/tall/render.log)
- 每组 raw_frames.json 记录11张原始PNG的尺寸、bytes、SHA256和本次绝对路径；拼图仅作轻量审阅，未替换原始证据。原始目录为 `/tmp/darkroom_round_561_720_final` 与 `/tmp/darkroom_round_561_tall_final2`。
- 原 darkroom.pck：4,534,208 bytes，SHA256 `250640a1ddc9d72675b23e6a0cbbc9e1ee14229750bcbdac27eb3bdde6441cac`。其余PCK和官方引擎hash均在summary。

之后关联组冻结包须独立运行，使用新的输出目录；runner固定官方引擎SHA，前后核所有PCK与测试脚本hash，任何 ERROR、脚本错误或行为失败都使runner失败：

```sh
python3 build/checks/run_cold_darkroom_round.py \
  --engine /absolute/Godot_v4.5.2-stable_linux.x86_64 \
  --packs /absolute/grouped-build/native_packs \
  --output /absolute/new-darkroom-evidence \
  --pack-label grouped-EXACT_SOURCE_COMMIT \
  --size 720x1280
```

再以另一新输出目录运行 `--size 720x1558` 并实际看图。该脚本不生成生产包、不推送、不部署，不改Mac。
