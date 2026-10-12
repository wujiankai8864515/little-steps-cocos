# Home 首次实际绘制：限定归因报告

2026-10-06；诊断非产品。仅 3 种额外 Mesa GL 样本，到此收口。没有改源码、PCK、ready 门槛、配置、预算或部署。源工作树仍为干净的 `d1bfcaa0bb4ddf2f9980e27e7fabd3b22d8b8b0c`。

## 可交接结论

当前证据将多秒缺口进一步收窄到 **Home receiver 材质族首次实际使用的渲染/驱动路径**：延后这组 72 个材质绑定时，首段缺口降至 3.949 秒；在同一 Home、节点纹理/几何已经实际绘制几十帧之后恢复它们，另出现 5.134 秒缺口。反向保留 receiver、只延后 106 个阴影/光束类绑定时，首次缺口仍为 7.600 秒，之后恢复这些绑定另有 1.205 秒缺口。

这不是某个具体 shader 已被证明“编译慢”。官方运行期指标在本 GL 后端没有提供 GLSL 编译、链接、Mesa/LLVM JIT、资源首次使用、纹理提交分别耗时的量化接口。本轮也没有拿到驱动调用栈。不能把它们进一步拆成百分比，或声称唯一根因已定位。shader 专用 sampler 的使用会随材质空置一起延后；因此不能完全排除那部分贴图首次使用。只能说“纯节点纹理/mesh 初次上传”不足以单独解释恢复原材质后再次发生的长缺口。

A049 连续尾点与 A038 相关等待体验的缺口仍开放。空材质和关闭光影均是诊断，不是修复或验收通过。本环境明确为 llvmpipe 软件渲染；Web、用户硬件、手机、听音、浏览器内存与用户视觉认可仍未验证。

## 实验边界与精确输入

- 官方引擎：Godot 4.5.2 stable `6ce3de25a`，SHA256 `5803746bbe055bee0f07a3c5b0dd347719bd45599f3d34519a8a0beaf83014ae`。
- 正式输入：`/workspace/scratch/3f82ff2b3f81/home_grounding_formal_d1bfcaa/native_packs` 的原 9 PCK。各样本 runner 均在前后回读全部 bytes/SHA256，写入对应 `summary.json`。
- 空 `res` 根只有 `project.godot`；`--main-pack index.pck`；正式 `main.tscn` App、production native backend 与真实动态 mount；没有 overlay、源码 fallback、重打包、smoke/autoplay/movie。
- 复用 `/workspace/shared/startup_ready_chain_qa/run_review.py` 的隔离模式，以及 `test_startup_timing.gd` 的真实 Loading→Login→Comic→Home 输入与 ready 观察。已有基线不重跑。
- 新 runner 仅适配当前允许的 Xorg TCP display 31679/37327，并加官方 `--gpu-profile --verbose`；每次独立 Xorg、用户数据与缓存。`MESA_SHADER_CACHE_DISABLE=true` 与原 runner 一致。Godot 自己的 shader cache 独立创建，退出后清理。
- 计时段无截图、无 sleep。runner 启动 Xorg 前的 1 秒等待发生在引擎启动之前。没有硬件/浏览器测速含义。
- 实际适配器：`llvmpipe (LLVM 19.1.7, 256 bits)`；Mesa `25.0.7-2+deb13u1`；OpenGL 4.5；`opengl3 / gl_compatibility`。

## 注入方式

在 `prepared_home` 已实例化且尚未加入树时连接 `home.ready`。production `_ready` 结束、第一次实际绘制之前记录完整材质/几何/纹理清单，然后对选中节点调用官方 `RenderingServer.canvas_item_set_material(canvas_rid, RID())`。

节点的 `material` 对象保留，production `_process` 仍能正常更新 shader 参数。直接写 `node.material=null` 会让既有 production 参数更新触发空引用，不适合作为单变量诊断。实际清空的是 RenderingServer 绑定；没有修改原材质资源。`frame_pre_draw` 重申选中绑定以避免运行期参数/绑定更新干扰。Home 的 `can_process=true`，SubViewport 始终 `UPDATE_ALWAYS`，纹理、几何、可见性、节点均保留；材质移除会改变画面和 sampler 使用，故不做产品视觉结论。

首次 ready 观察均为 389 个节点、378 个 CanvasItem、190 个非空材质节点。随后的 Home 路由创建 InteractionFeedback，它使用 CanvasItemMaterial，没有额外重 Shader；v2 夹具记录了这个动态节点。首个全材质空置样本使用 v1，尚未追踪这个之后增加的反馈材质，准确范围是“ready 时已有 190 个材质”。

真实 Home 路由 ready 后继续约 30 个 process 帧，再恢复所有存活节点的原绑定，继续 35 帧，清掉诊断引用并按 production App teardown 释放。三个样本各 49 个夹具检查，失败 0、SCRIPT ERROR/ERROR 0；这只证明诊断顺利完成。

## 核心数字

| 样本（均为诊断非产品） | 初次被空置 | home_tree_ready | home_first_draw_gate 总段 | Home 首绘 process 缺口 | 恢复绑定后的 process 缺口 |
|---|---:|---:|---:|---:|---:|
| 既有未改材质基线，冷轮 | 0 | 198.551 ms | 8628.664 ms | 8478 ms | 不适用 |
| 既有未改材质基线，同进程暖轮 | 0 | 152.258 ms | 5845.364 ms | 5718 ms | 不适用 |
| ready 时全部材质空置 | 190 | 223.507 ms | 3162.826 ms | 3029 ms | 6605 ms |
| receiver 材质族空置 | 72 | 207.526 ms | 4075.770 ms | 3949 ms | 5134 ms |
| 非 receiver Shader 材质族空置 | 106 | 210.272 ms | 7752.894 ms | 7600 ms | 1205 ms |

`home_first_draw_gate` 与 `home_tree_ready` 共用 add_child 前起点，包含 tree_ready、两次 frame tick 和 draw gate；不能称纯 GPU 编译耗时。ready 采集清单额外耗时 11–12 ms 已记录，包含在上述 tree_ready 中，不足以解释多秒缺口。不同样本不是统计重复，不推导精确性能提升率。

### 实际材质分组

receiver 组：`receiver.gdshader` 43、`part_receiver.gdshader` 12、`flower_receiver.gdshader` 8、`bleed_receiver.gdshader` 3、`home_face_receiver.gdshader` 3、`bed_receiver.gdshader` 1、`incense_stick.gdshader` 1、运行期 OpenDiaryArtwork shader 1。共 72 个。路径是在实际挂载包的 live 节点上采到，日记 shader 以代码 SHA256 识别。

另组：`home_grounded_shadow.gdshader` 53、`part_wall_shadow.gdshader` 46、运行期 tabletop clipped shadow 6、`light_shafts.gdshader` 1。共 106 个。12 个 CanvasItemMaterial 在两组对照中保留。所有实际路径、节点、纹理、mesh surface 数、shader 代码及 SHA256 均在各 `profile.json`。

### 首帧和后续帧

| 样本 | 诊断阶段首个 post_draw 时间（本轮 ms） | 首绘阶段 viewport CPU / GPU 返回峰值 | 恢复阶段 viewport CPU / GPU 返回峰值 | 恢复后最后 20 帧 post_draw 间隔中位数 |
|---|---:|---:|---:|---:|
| 全材质空置 | 23971.641 | 2740.255 / 2785.232 ms | 6546.952 / 6591.344 ms | 61.652 ms |
| receiver 空置 | 24842.099 | 3682.000 / 3721.663 ms | 5078.642 / 5118.884 ms | 60.447 ms |
| 非 receiver 空置 | 28553.145 | 7306.889 / 7370.522 ms | 1149.341 / 1189.791 ms | 60.019 ms |

首次 post_draw 已有真实 RoomViewport draw counts：初帧约 317 个对象、21828 primitives；后续约 283 个对象、21760 primitives。恢复原材质后的 objects/primitives 持续存在，没有靠停止 Viewport 获得数值。

API 在当前 GL 的时序读回有数帧延迟，初帧会先返回 0，尖峰稍后才出现在 samples 中。表中按阶段给峰值，不把“本次 API 返回时刻”误写成“尖峰发生帧”。CPU/GPU 数值不能相加：llvmpipe 的 GPU timer 也是软件驱动队列计时，无法代表独立硬件 GPU 执行成本。后续仍有个别 361–486 ms 帧；本轮不是完整性能/60fps 验收。

## 官方能力检查与边界

已保存 `engine_help.txt` 和实际 `ClassDB` 查得的 `runtime_api.json`。使用了 `viewport_set_measure_render_time`、CPU/GPU measured time、per-viewport draw info、Performance monitors，第二/三样本还采集 frame setup CPU。

- 官方文档说明 viewport CPU 时间覆盖渲染相关操作，不含脚本 `_process`；但它不进一步拆分编译、上传、驱动阻塞。见 [Godot 4.5 RenderingServer](https://docs.godotengine.org/en/4.5/classes/class_renderingserver.html#class-renderingserver-method-viewport-get-measured-render-time-cpu)。
- 所有 `PIPELINE_COMPILATIONS_*` 在本次 GL 中均为 0。不能由这个 0 宣称没编译。官方 GLES3 引擎实现确实含 shader 编译/链接路径，但本轮没有逐调用计时，见 [固定 4.5.2 ShaderGLES3 源码](https://github.com/godotengine/godot/blob/4.5.2-stable/drivers/gles3/shader_gles3.cpp)。
- `--gpu-profile` 可打印 CanvasItems 总段，未提供 node/shader 级拆分。本机没有现成 perf/gdb；未安装任何分析软件，没有改引擎。
- 不能用 Godot shader baker 当作已验证补救：官方 4.5 文档明确它不支持 Compatibility/Web，见 [Godot 4.5 shader baker](https://docs.godotengine.org/en/4.5/tutorials/performance/pipeline_compilations.html#shader-baker)。

## 是否存在可立即提交的最小修复

尚无得到实证的具体代码/材质结构缺陷，故不建议据本次诊断直接改 shader 或重构渲染，也不应把预绘期间动画卡顿改成提前进入 Home、关闭效果或提高预算。

静态可见 tabletop 支持为不同材质创建多个相同代码的 Shader 对象；这只是一条待验证的结构线索，不是本轮的已证主因，更不能据此许诺缓存一下就解决 receiver 组的主要耗时。没有为它继续开第 4 样本。

若未来在用户硬件/Web 复现后另立最小修复，应保持原所有渲染效果及原 ready/取消语义；只改已证有重复的 shader 构造/编译结构。验证至少要有同包路径的冷暖首绘间隔、原材质恢复后的时序、相同尺寸/时段/灯状态的原画面对照与资源字节核验。19,000,000-byte Home、80 specs/batch、128 entries、256 MiB 预估门槛均不得抬升。这是后续候选验证要求，本轮没有修改或验收它。

## 留存与清理

- `comparison.json`：三个样本的阶段、首帧/恢复帧、前 12 个 API 返回、后 20 帧概况、全部 process/draw gaps、PID/退出状态。
- 各样本 `profile.json`：完整 live 清单、shader 代码/路径/hash、全部逐帧数据和注入/恢复事件。
- 各 `results.json`、`summary.json`、`render.log`、`command.json`、Xorg 日志与进程记录全部保留。
- `profile_home_v1.gd` 是第一样本确切脚本，`profile_home.gd` 是后两样本脚本；SHA256 与各 summary 一致。
- 三个引擎进程均 0 退出，Xorg 均已 terminate/wait；GL 已交回可供下一组使用。
- 所有隔离 shader/font 缓存只在对应进程完成后删除，清单与 bytes/SHA256 保存在各 `cache_cleanup.json`。未删除产品文件、包或计时证据。
- 第一次仅 API 枚举时缺少 XDG_DATA/CONFIG 隔离，目录创建失败；补齐本 QA 目录下的隔离后重跑成功，记录在 `api_attempts.json`。没有把这一无 GL 的初始化错误作为性能样本。
