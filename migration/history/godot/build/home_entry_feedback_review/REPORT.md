# Home 入口有限补证：A015 / A037 / A080

## 结论

本组未发现新增产品缺陷。当前正式生产实现的物件询问、设置关闭/重开、入口反馈与取消路径，在本次限定原生测试范围内符合要求。只补 QA 证据；生产改动、修复数、新产品包均为 0。源码树仍干净，九个输入 PCK 前后 SHA256 不变。

这不是 83 主题整体通过，也不是用户视觉认可或 Web 验收。检查数量不用于推导美术或流畅度结论。

## 唯一生产身份与运行方法

- 源码：`bc1f8cf805c3650501a4dca616c37bc8c54f9df7`，只读 `/tmp/godot_actor_gaze_group_source`。
- 正式包：`/workspace/scratch/3f82ff2b3f81/actor_gaze_formal_bc1f8cf/native_packs`。
- index.pck SHA256：`537f10940fedada1a6186c16d2673903e505bd9ad25cddc06d35a7a0114b2448`。完整九包 bytes/SHA 在 `headless_v2/inputs.json` 和 `gl_v1/summary.json`。
- 官方 Godot 4.5.2，SHA256 `5803746bbe055bee0f07a3c5b0dd347719bd45599f3d34519a8a0beaf83014ae`。没有调用 PATH 引擎。
- 每次从只有 `project.godot` 的独立空 res 开始，以正式 `--main-pack index.pck` 启动，实际 App 使用生产 native backend 校验、按需 mount 延迟包。没有 overlay、全资源工程、运行资产副本。
- 仅复用既有 `App._commit_home` 省略本组无关 Comic；并不声称重新验了完整 Login→Comic→Home 用户旅程。测试 UI 全部 `root.push_input`，取消和合成鼠标显式注入；焦点事件也是注入，不是 OS/Web 事件证据。
- headless 正常实时时钟、谓词等待、`--max-fps 60`，无 `--fixed-fps`。GL 同样 max-fps 60，Mesa 默认缓存开启、隔离 XDG；Mesa llvmpipe 是软件渲染。

## 现行要求覆盖

旧 `round5_home_actor` 的照片 album 询问断言已经过时：照片后续获准进入单页照片墙。当前背包/娃娃是拖给角色并落稳后询问；满包是弹完再出物。没有恢复旧 album 提示、轻点背包出行或开包自动开始新旅行。

| 主题 | 代码/实际资源 | 当前正式包限定原生结果 | 图像与边界 |
| --- | --- | --- | --- |
| A015 物件询问 | 包/娃娃→交互控制器→自然气泡→生产路由；照片→photo bridge→单页墙；源码与 GDC 实包成员已核 | 娃娃确认、取消、取消触摸、暗室返回；背包取消、确认出发且只一次；两张照片各自进入/返回；触摸合成鼠标不重复 | 亲看两种询问、照片墙与返回载体。气泡在小余上方、尾部朝小余、文字和选项无截断。背包截图是确认前原角色穿戴，不是确认后的旅行静态角色；不能误报旧需求违背 |
| A037 设置可关闭/重开 | credits、共用 TouchActionButton/HangingReturn 与 Home 遮罩路由已核 | 设置取消触摸不打开；弹后打开；取消关闭仍保留；真实触摸关闭并重开；Escape 关闭；音乐关/开各一次；后续照片、灯、香与物件点击仍可达 | 亲看设置页、音乐开关和返回木牌可见。未扩做其他尺寸的视觉验收 |
| A080 先反馈再入口 | Home 通用 bounce 为 0.28s；地图/满包 tween 为 0.27s；日记两段 0.24s；灯渐变独立 0.22s。实际调用路径已核 | 照片/设置/香/地图/满包先反馈；日记半程仍 Home、完整后进阅读批阅；连点不跳过；取消/焦点中断/Escape/重开按有限场景检查；灯按下立即变目标且实测中间能量，再完成渐变 | 亲看照片短弹状态、满包浮物、日记展开中和阅读页；真实每帧节点轨迹补充截图。未点浮物始终不自动收纳；无性能或手机触感通过声明 |

`source_resource_binding.json` 对 16 个相关源码文件逐个核对正式 build source hash，并从真实 PCK 读取相应 GDC、逐个核对 inventory hash；同时记录有关字体、日记、共用返回等资源成员。包内存在不是视觉证明，本次又以真实运行和八张图核限定路径。

## 已有覆盖与本次真正补足

- `build/checks/test_home_header.gd` 已有设置触摸关/开、取消、拖出、焦点、Escape 和窄屏布局逻辑；它直接构造 Home，并有无条件截图等待，不能直接当本轮 headless/冷包证明。
- `build/checks/test_round5_home_actor.gd` 已有照片、香、灯、拖拽包与地图中断；部分是旧产品语义和按帧夹具，未盲跑其过时 album 断言。
- `build/checks/test_round5_travel_ui.gd` 已有地图/满包/日记与奖励交互，但直接构造组件且用了服务时钟夹具。
- `build/darkroom_entry_review/test_home_note_button.gd` 与已有 candidate GL 证据覆盖共用气泡确认/取消/返回和合成鼠标；不能把其旧候选包身份直接标成本次正式 bc1。
- 本次缺口是：正式 bc1 空 res/native backend 下，上述 Home 真实入口的一条综合输入链，加一轮有限 GL 可见性/时序证据。没有重新造产品功能，也没有跑全套历史测试。

## 运行结果与冷/暖顺序

`headless_v2`：82 个限定状态/资源断言，253 次 root 输入，失败 0，脚本/资源错误 0。`results.json` 保留各项、decision 和实际动态 mount；`run_summary.json` 核九包未变、空 res 仍只有 project.godot。

进程从冷 Home 开始，先测设置，再照片→暗室→背包确认出发→地图。照片、暗室、departure、travel 资源陆续 mount 后，末段满包/日记是**同进程暖路径**。不能把整条称作独立冷日记证明。

`gl_v1`：22 个限定断言，42 次 root 输入，失败 0，无脚本/缺资源错误；只保留八张 720×1280 实际原生帧，已逐张查看。GL 也先经过设置、照片、两询问，再由生产 service 构建隔离行程夹具到归来状态。它仅给 A080 翻页/进入时序和本次状态可见性，不替代独立三路冷日记专项。

冷日记三路仍引用 c242 交付 QA 归档中的既有生产包专项：`runtime_equivalent_a297/diary_actual_packs/{direct,map_first,legacy_return}`，其 summary 明确空 res、actual grouped PCK、no source delta。摘录和原归档位置在 `prior_cold_diary_summary.json`。直接/先地图/旧存档三路旧结果均无红；当前 house.pck 和有关 travel 资产 hash 与其相同，`travel_open_diary_art.gd`、`travel_home_props.gd`、`travel_home_bridge.gd` 逐个 git 读回确认 c242→bc1 字节不变。该引用是“既有有限证据＋未变身份”，不是本轮重新跑的 bc1 三路冷日记。

GL 确认的节点顺序：

- 照片：bounce elapsed 0.1298147、0.259187 时 photo_loading=false / photo_open=false；下一阶段 bounce 已清空才 loading=true，后才 photo_open=true。截图 02 在 bounce 0.1298147 的实际帧，03 为已打开墙。
- 日记：open_scale.x 0.0162→0.1053→0.2178→0.3039→0.3222→0.3241；entry_busy=true 时阅读页始终不可见；完成后才等待页面资源并打开 journal。截图 07 是 entry_busy=true / diary_open=true / travel_open=false，08 是 journal 阅读批阅页。
- 本机 llvmpipe 的真实帧 delta 与墙钟含 shader 编译、图片编码等停顿。日记墙钟并不等于 0.48s 产品动画参数；本次证明顺序和状态，没有声称 60fps、手机流畅度或延迟预算达标。

## v1 夹具红复盘

原红、原实际脚本和 hash 保留在 `headless_v1/`。v1 将 RoomViewport 内气泡按钮 `get_global_transform_with_canvas` 坐标直接作为 root 输入，叠入离屏 render-scale 并遗漏 Home root 偏移；点击意图为“好呀”，实际落在气泡外，decision 为 false。继而暗室未进、未有旅行是级联，不是两个产品缺陷。

实测旧 canvas 点为 `(530.6666,1092.444)`，正确逻辑点 `(298.4999,614.5)`，正确 root 点 `(578.4999,614.5)`。修正只在 QA：Control global→world local→Home root，再用生产 `_world_pointer`、`_target_at` 反算为 yes；后者同时要求按钮可见、可用。v2 记录按钮路径、旧/新点、反算点和最终 decision，全部气泡取消/确认重跑；v1 可能由外点产生的“取消通过”明确作废。v2 decision 顺序为暗室取消/确认、旅行取消/确认，且真实页面和返回闭环通过。

未调整生产触摸代码、动画时长或固定帧率迁就夹具。见 `headless_v1/fixture_failure.json`。

## 交付与剩余边界

可整体复制本目录，或按 `artifact_manifest.json` 文件清单复制。主要入口：本报告、`check.gd` / `run.py`、`gl_check.gd` / `run_gl.py`、`source_resource_binding.json`、`headless_v1` 原红与复盘、`headless_v2` 正式重验、`gl_v1` 八图与真实 trace、`prior_cold_diary_summary.json`。

生产源码、正式 PCK、GitHub、部署、用户电脑均未改。主线程另行记录部署终态，本报告不把已发布推导为本主题 Web 通过。尚缺 Web 实际实例交互、设备触摸/浏览器合成鼠标、设备 GPU/帧率/内存，以及用户对画风与视觉的认可。本轮没有额外重验夜间/所有视口。

Xorg/Godot 已退出，临时 xauthority 已删除；只删除本 QA 的可重建 Mesa/Godot shader 缓存。八图保留相同尺寸和逐字节相同 RGBA，仅作 PNG 无损编码压缩；原/现 PNG SHA 与 RGBA SHA 见 `storage_cleanup.json`。最终字节以 artifact_manifest 为准。
