# d1bfcaa 启动一链七主题有限核查

2026-10-06；仅 QA 产物。源码、正式包与已发布 Site 未改动。源提交 d1bfcaa0bb4ddf2f9980e27e7fabd3b22d8b8b0c，源码工作树回读 clean。本文不能作为七主题全部验收或 Web/用户验收通过。

## 结论

A001、A022、A023、A026、A047、A048 已取得本轮限定的实际原生包、状态/输入与关键 GL 画面证据。A049 在等资源阶段能持续按 1/2/3 点循环，但 Home 首次加入树后的准备/绘制阶段有明显的软件 GL 帧停顿，冷、暖两轮均存在，边界未关闭。所有状态夹具均终态退出且无 SCRIPT ERROR/ERROR；这些检查通过不覆盖该可观察停顿，也不替代画风和用户认可。

## 精确输入和隔离

- 使用官方 Godot 4.5.2，SHA256 5803746bbe055bee0f07a3c5b0dd347719bd45599f3d34519a8a0beaf83014ae。
- 每个 case 独立进程、新 HOME/XDG 用户目录、仅 project.godot 的空 res 根；--main-pack 指向正式 index.pck。没有全资产 --path、生产源 fallback 或 PCK overlay。
- App 始终从正式 main.tscn 创建；使用生产 pack_service 与生产 native backend 的真实读取、bytes/SHA256、动态 mount。入口通过 root.push_input，未直接调用 _commit_home、smoke、autoplay 或 movie。
- QA 只观察/延迟已经由 native backend 成功验证的回调，延迟期间无 sleep 或同步阻塞；顺序实证不叫网络测速。失败由真实 native backend 读取明确不存在的 QA 路径，恢复后重新请求真实 PCK。
- “冷”指全新 Godot 资源/VFS/用户状态，不声称操作系统磁盘缓存为空。“暖”指同一隔离进程完成首轮 App 后重建第二轮 App，保留已 mount/原生资源状态；不等于浏览器 HTTP/IndexedDB 缓存。
- 静态核验 9 个原生 PCK 与冻结 Web PCK 完全相同；461 个成员与生产 inventory 匹配。17 个启动源文件与 build source lock 匹配；全部发行列表文件 hash/bytes 通过。详见 static/REPORT.md 与 pack_integrity.json。

## 七项结果

| ID | 本轮实际证据 | 有限结论与边界 |
|---|---|---|
| A001 | 实际 Login 首帧鱼/鳍隐藏；TITLE→SUBTITLE→SETTLED→PEEK→GREETING；冷、暖重建顺序一致；GL 已看初始、标题、停顿、探头帧 | 原生有限门禁有证。Web 冷刷新/重进与用户认可未验。 |
| A022 | 延迟 entry 已验回调时 Loading 超过 1 秒仍等待；冷/暖 minimum_loading_visible_msec ≥1000；post-draw 自然动画采到准备、挥动、接触、反弹，接触帧 28 锚点 gap=0、冲击短线可见，实看无明显穿入；定稿图与无引擎 logo 配置/host 检查 | 原生画面和门槛有证。浏览器从导航开始是否闪 logo 未实景验证；有限采样不是每个像素/帧或用户力度认可。 |
| A023 | Loading 只请求 entry；Login 同时发起 comic/house 真实已验包且两回调均可独立处于 pending；Comic 在 house 被持有时完成并可进入；结束后保留整纸等待到 Home 真 ready；entry/comic/house 缺路径各自明确失败，再经真实按钮重试到 Home | 资源/原生状态和输入有证；失败场景 headless 保留可见节点/状态，未逐一实看错误画面。联网、取消/迟到响应/浏览器数据恢复仍不由这次测试证明。旧登录四角取消证据未拿来冒充全链。 |
| A026 | 读全部 4 个 sources；正式 approved_story 四句原文、单纸错落四格、每次逐格揭示并保留前格；完整页实际停留后才能继续；四次 puff 与 drink/joy 共 6 次调用紧随 panel_changed；已完成原生 checkpoint 的暖重进仍从空纸播放且原文件 hash 不改 | 实际四格和保留/重播/时序有证。Dummy 只证明接口及调用顺序，未听音；来源记载单幅生成图尚未获用户逐幅认可，不能判画风验收。 |
| A047 | 已看实际 Loading 图无背后大圆圈；Godot/冻结 host 都无进度头小圆点；条下 TravelMark1/2/3 仍在；进度 high-water 未回退/重复零到满；核心背景实际 CTEX 解码逐像素 hash 对上来源 | 原生画面+冻结 Web 静态有证，Web 首屏未浏览器实看。三个静态 TravelMarks 从未明确取消，不列缺陷。 |
| A048 | 读两个 sources；正式 Comic 仅 Retry/Advance，无返回控件；完整页后文字 alpha/scale 轻呼吸，按钮 rect 不变；热区左上角真实输入进入下一阶段，早按空格不跳过 | 原生输入/状态+GL画面有证。未泛化成所有触摸设备或全部安全区通过。 |
| A049 | house 延迟回调期间，实际标题 1→2→3→1→2→3 持续循环；释放回调并 Home 入树后出现冷/暖多秒 process/draw 缺口 | “等待资源时 1/2/3 循环有证，首次软件 GL 准备有停顿，持续动效边界未关闭”。不整项绿。 |

## A049 保留的观察

初始全链有截图的运行中，尾点事件在 23.799→32.307 秒间隔 8.508 秒。为排除保存截图干扰，另起新隔离软件 GL 进程，以同一真实 App 路径做冷/暖两轮，不在计时段保存截图：

| 指标 | 冷轮 | 同进程暖轮 |
|---|---:|---:|
| home_instantiate | 3.343 ms | 1.824 ms |
| home_tree_ready | 198.551 ms | 152.258 ms |
| home_first_draw_gate 总段 | 8628.664 ms | 5845.364 ms |
| 最大连续 process 帧缺口 | 8478 ms | 5718 ms |
| 对应 frame_post_draw 缺口 | 8473 ms | 5715 ms |

home_first_draw_gate 与 home_tree_ready 共享 add_child 前的 start，包含 tree_ready、两次 _frame_tick 和 _draw_tick，不能称为纯 GPU/编译耗时。时钟和每段绝对位置已单独导出 home_prepare_timing.json。回调持有器仅 process_frame 轮询并转发真实结果；没有人为延时阻塞线程。现有证据只定位到 Home 入树后的组合准备/绘制段，不确定 shader 编译、CPU 首次处理或软件驱动的贡献；暖轮同样存在，也不能称冷首绘专属。

最小后续方向是只对这一段区分 Home 子树处理与实际 SubViewport 绘制成本，保留真 ready 门槛，先取证再决定独立源码修复；本次不改生产源、不调大预算、不提前提交 Home。

## 可查看产物

- suite_summary.json：9 个独立 case 的终态、范围、进程记录。所有运行夹具保留，无测试失败记录被删。
- gl_slow/：真实 720×1280 全链的 13 张 GL 帧、输入、实际包日志、状态、资源 metrics。
- gl_loading_contact/：从真实 App Loading 的 frame_post_draw 采样自然动作；contact_frames.json 精确标帧。为避免将截图保存引起跳帧误写为连续电影，准备/挥动/反弹/接触图只作为分相位采样。
- gl_cold_warm_timing/：无截图计时，两轮真实入口和重播；home_prepare_timing.json 提取缺口。
- headless_cold_normal、headless_warm_replay、headless_fail_login、headless_fail_comic、headless_fail_home、headless_parallel_slow_comic：独立空进程状态与真实输入。每次用户数据隔离；暖 case 仅其内部第二轮共享原生状态。
- static/：来源、实际包归属、byte/像素核验和冻结 host 检查。
- viewed_frames.json：本 worker 已查看所有 GL 帧。根工程另已看关键 5 帧。
- requirements_selected.json：七项所有 sources 原样保留，没有只看 latest_requirement 丢子项。

软件 Mesa GL 不代表硬件 60fps、移动触感、Web 内存或用户审美认可。Dummy 不代表听音。没有打开已部署网页、绕过账户关联/consent，或使用线上账户。临时 shader/font cache 在对应进程结束后清理并留清单；截图像素/状态日志均保留，PNG 的无损重压有逐像素一致记录。

## 追加：两种单变量诊断，仅定位方向

按主工程要求，各做一个新空用户目录的软件 GL 样本。夹具均在 prepared_home 实例已创建、仍 detached、home_ready=false 时注入；生产 ready 信号后再次核对设置未被覆盖。详见 diagnostic_comparison.json 与两目录 diagnostic_events.json。它们刻意关闭一个子系统，不能算产品通过，不能拿它们的 ready 结果替代真实绘制。

| QA 注入 | ready 后确认 | Home 准备总门槛 | 实际观察 |
|---|---|---:|---|
| Home process_mode=DISABLED，SubViewport UPDATE_ALWAYS | can_process=false，viewport_update=4 | 8102.763 ms | process 缺口仍 7986 ms；关闭常规子树处理未消掉延迟 |
| Home processing 维持继承，SubViewport UPDATE_DISABLED | can_process=true，viewport_update=0 | 263.236 ms | 生产 resume 恢复渲染后，process 缺口移到 21.158→28.841 秒，共 7683 ms；draw 缺口 7691 ms |

这两个样本把下一步方向收窄到 Home SubViewport 首次实际绘制/提交路径，而非 Home 常规 processing。仍不能细分 shader 编译、资源上传、驱动或软件绘制。关闭渲染只把停顿移后，绝不是修复；A049 开放边界不变。到此收口，不扩展到全项目性能或修改生产源。
