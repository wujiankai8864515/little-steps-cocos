# Home 首绘：默认驱动缓存冷暖补充对照

2026-10-06。第 4 且最后一种额外 GL 配置，仅纠正比较环境，不是新功能或修复。旧 `/workspace/shared/home_first_draw_profile_qa` 已冻结，本补充没有修改它。

## 结论

移除 QA 自设的 `MESA_SHADER_CACHE_DISABLE=true`、采用正常驱动缓存策略后，本机 llvmpipe 的真实 App 冷轮与同进程暖轮仍分别出现 **7.902 秒、4.632 秒 process 缺口**；相应 post_draw 缺口为 **7.887 秒、4.628 秒**。因此“仅显式禁用了 Mesa 缓存”不足以解释本环境全部现象。

这仍然只是 **llvmpipe 软件渲染、隔离新缓存、实际正式 PCK** 的限定结果，不能判定用户常规生产设备或 Web 存在相同故障。新旧配置各只有一组冷暖运行，数值更低不构成可重复的缓存改善量测，也不能作为统计性因果结论。到此收口，不继续细化编译/JIT/sampler 根因，不改 shader，不把诊断手段变成产品方案。

A049/A038 保留环境边界：等待资源时尾点能循环有证；该软件 GL 首绘阶段连续性仍有缺口；真实 Web/用户硬件是否存在、程度如何仍未验。既有材质组实验必须继续标注“llvmpipe + 显式禁用 Mesa 缓存的受控诊断”，不能泛化成普通生产故障。

## 本次究竟改了什么

- 正式 d1 源及 9 PCK、所有材质、节点、ready/首次绘制/取消语义和资源预算完全未改。
- 引擎进程环境中不设置 `MESA_SHADER_CACHE_DISABLE`；也没有自设缓存容量、线程数、驱动或系统配置。`cache_policy.json` 记录移除的继承值为 null，其他所查驱动选项也为空。
- 为这一次引擎进程保留独立 HOME/XDG/MESA_SHADER_CACHE_DIR；没有在两轮之间删除、替换、限制或清空任何缓存。
- 使用与既有无截图冷暖基线**字节完全一致**的 `test_startup_timing.gd`；同进程首个完整 App→production teardown→第二个完整 App，均经 Loading、Login、Comic 的真实输入进入 Home。
- 原包 `index.pck` + production native pack backend 动态 mount，空 `res` 根只有 `project.godot`。无源码 fallback、PCK overlay、材质注入、GPU profiler 或计时截图。
- 引擎始终为官方 Godot 4.5.2，SHA256 `5803746bbe055bee0f07a3c5b0dd347719bd45599f3d34519a8a0beaf83014ae`；真实适配器仍为 `llvmpipe (LLVM 19.1.7, 256 bits)` / Mesa `25.0.7-2+deb13u1` / OpenGL 4.5 Compatibility。

runner 与原版的功能差异仅为：移除本次进程的缓存禁用 flag，适配当前允许的 Xorg TCP display，以及在引擎退出后索引/清理隔离缓存。没有截图和引擎运行期间的 sleep。Xorg 启动等待发生在引擎启动前。

## 数字对照

| 配置与轮次 | home_tree_ready | home_first_draw_gate 总段 | Home 最大 process 缺口 | 对应 post_draw 缺口 |
|---|---:|---:|---:|---:|
| 既有显式禁用 Mesa 缓存，冷轮 | 198.551 ms | 8628.664 ms | 8478 ms | 8473 ms |
| 既有显式禁用 Mesa 缓存，同进程暖轮 | 152.258 ms | 5845.364 ms | 5718 ms | 5715 ms |
| 本次默认 Mesa 缓存，冷轮 | 204.894 ms | 8038.268 ms | 7902 ms | 7887 ms |
| 本次默认 Mesa 缓存，同进程暖轮 | 172.486 ms | 4764.974 ms | 4632 ms | 4628 ms |

`home_first_draw_gate` 含 add_child/tree_ready、两次 frame tick 和 draw gate，不能称纯 shader 编译或 GPU 耗时。冷轮 process 缺口位于 20967→28869 ms，暖轮位于 49912→54544 ms；这些是本次引擎计时原点。全部阶段绝对位置、尾点事件、process/draw gaps 均在 `comparison.json` 与原始 `results.json`。

“冷”指首次创建的隔离 Godot/App/驱动缓存目录，不代表 OS 磁盘 page cache 被清空；“暖”指同一引擎进程重建第二个 App，保留 native mounted resource、内存与磁盘缓存状态。没有额外启动一个只测试磁盘缓存命中的进程。

## 实际缓存写入

只在引擎正常退出后读取文件大小与 SHA256，结果如下：

| 类别 | 文件数 | bytes |
|---|---:|---:|
| Mesa 驱动目录 | 101 | 3,611,878 |
| Godot shader cache | 17 | 11,775,006 |
| fontconfig/其他缓存 | 31 | 1,132,144 |

这些文件证明本次有实际缓存写入，**不证明哪一轮、哪个 shader 命中**，也不是逐帧编译/JIT/上传耗时数据。引擎退出后的缓存总量 16,519,028 bytes 是已观测到的临时占用，不冒称全程峰值；未为压低运行期磁盘占用而破坏正常缓存行为。全部条目与 hash 在 `cache_inventory.json`，原缓存随后清掉，不应入源码或 Library。

## 完成与留存

100 个原夹具检查通过，失败 0，SCRIPT ERROR/ERROR 0。引擎与 Xorg 均退出码 0；驱动不能设置 VSync 的既有 warning 原样保留。GL 已交回，不再启动后续实验。

- `comparison.json`：显式禁用和默认缓存分开的冷暖阶段与帧缺口。
- `default_cache_cold_warm/results.json`：原始输入、页面、资源/pack metrics、尾点与帧事件。
- `summary.json`：前后回读不变的全部 9 PCK bytes/SHA256、引擎/脚本 hash、空 res 文件和检查结果。
- `cache_policy.json`、`cache_inventory.json`、`cache_cleanup.json`：实际环境策略、写入索引和清理证据。
- `command.json`、`engine_pid.json`、`xorg_pid.json`、`process_exit.json` 与原日志：本轮可复查运行记录。
- `PREPARED.json` 为启动前记录；`RUN_STATUS.json` 为完成状态；`evidence_manifest.json` 固定全部留存文件。

源工作树回读仍为干净的 `d1bfcaa0bb4ddf2f9980e27e7fabd3b22d8b8b0c`。最终证据包小于 5 MB。Home 19,000,000 bytes、80 specs/batch、128 entries、256 MiB 预估准入门槛未改。没有部署、账户或用户数据操作；Dummy 不代表听音，原生软件 GL 不代表 Web/硬件或用户审美验收。
