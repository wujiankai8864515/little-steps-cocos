# 暗室高屏与实际入口有限门禁

基线是已发布 c242；这组证据使用 TEST ONLY 候选，不是已发布正式新包。原生实际 App 从空 res 挂 9 个精确 PCK；只用 `_commit_home` 省略无关开场格漫，暗室入口、确认、针/拖鞋、灯、返回及取消均用 root 输入。

复用 `build/checks/run_cold_darkroom_round.py` 和原测试的通用输入/捕获方法，没有复制全工程。`run_review.py` 额外记录继承 QA 脚本 hash、所有子进程 PID 和退出码。所有生成物应放工程外新空目录。

```sh
python3 build/darkroom_entry_review/run_review.py \
  --case visual \
  --engine /absolute/Godot_v4.5.2-stable_linux.x86_64 \
  --packs /absolute/native_packs \
  --output /absolute/new_evidence_directory \
  --pack-label TEST-ONLY-or-exact-formal-commit \
  --size 720x1558
```

- `visual`：D01–D04 高屏有限门禁；用 720x1280 时只验首帧/稳定参照，不重复 c242 标准屏完整轮。
- `entry`：D05 实际 App 的延迟、native 真缺文件失败、重试、实际取消、迟到 ready 和暖复用。仅控制运输回调；成功数据均通过原 native 后端查文件/核 hash/挂真实 PCK。这不是 Web 网络证据。
- `return_emulation`：D03 独立红绿复现，分开真鼠标拖出、单独取消、尾随模拟鼠标。
- `button`：公共控件 root 输入及生命周期矩阵。fixture 与实际 App 证据分开。
- `home_note`：Home 公共确认气泡接受/拒绝/取消与暗室返回的实际调用。
- `midstrike`：取消返回、真鼠标拖出，以及挥击未接触立即离页再入。

`build_button_candidate.py` 只编译当前公共按钮到 index 中既有 `.gdc`。输入包全程不变，另外 8 PCK 用只读 symlink 复用，官方引擎输出逐 entry 回读核对。它只用于测试，正式组包仍须先 GitHub 源码核验后统一 assemble。

## 结果范围

D01/D02 的高屏整图、第一可见帧独立渲染面、夜晚开关灯、清晨/黄昏和底部98行近图均已实际查看。720x1558 中 composition 与 SubViewport canvas 共同偏移139像素，灯和工具命中经过该变换。底部原接缝处木纹/木板边线连续，无额外水平条带。夜晚灯关闭时“绣花针”“拖鞋”“轻点布偶”均可辨识，无口口缺字。针/拖鞋留在凹槽，选中为柔光，没有黄色矩形框；返回没有虚线圆。清晨与黄昏 shadow mesh 方向符号/长度和实际画面随时段变化。

D04 核现有设计：active 返回保留进度；clear_out/gap_1s/spawn_in 离页后，重入由既有 `_replay_on_resume` 启动新session。测试未强加新的保留/重置策略。离页在 Home 稳定后不继续扣条、不改变完成计数、旧结果气泡不可见；非可输入阶段重入一次满格单娃。

D03 新增负测发现公共按钮取消后模拟鼠标仍激活，并发现生命周期取消未撤销已排队 touch release。两子缺陷作为同一公共输入契约独立修复；复盘见 `../reviews/2026-10-06-D03-shared-touch-cancel.md`。不能用初始159项通过掩盖该后续失败，也不能将7断言失败计作7个产品bug。

D05 暖包路由没有任何可见装载纸条帧。慢加载实际文字循环为“暗室装载中.”、“暗室装载中..”、“暗室装载中...”三个阶段。故障回调与下一帧错误UI之间捕捉到一次 loading=false 但尚显示旧纸条的过渡帧；下一帧进入重试UI，未持续卡住，也未计作单独产品缺陷。

## 不关闭的边界

- 这里是候选原生 Mesa GL；最终关联组正式包和正式 Web 仍要独立验收。
- Audio Dummy、状态暂停或无迟到结算不等于实际听音、Web createBuffer、手机触感、硬件GPU/60fps/内存通过。
- D01没有以修接缝自动关闭全部玻璃/投影要求；A031原造型一比一与A033原叶片幅度没有新增对应母版证据。
- 未把已省略的格漫、真实网络Home分离、浏览器安全区、刷新/存档等自动改绿。
- 预算不在本脚本中重定，128 entries、256MiB估值上限及首屏19,000,000 B保持。父集成持有其真实全组Gate结果。
