# 冷启动地面日记双页空白：复现、修复与漏验复盘

## 确认的问题

受影响冻结源码：`56193b766b3c13d83ac5aee7149f4d8045e5733e`。用户第二次截图中的地面展开日记，左右页都没有文字或插图。问题不是用户缓存推测：使用该提交的精确发布 PCK、空 `res://` 根和官方 Godot 4.5.2，在原生 Mesa GL 中稳定复现。

Home 的 `travel_home_props.configure()` 会立即调用 `travel_open_diary_art.mount()`。原实现读取 `travel_brush.ttf`，但其 `.import` 和 `.fontdata` 只在按需 `travel.pck` 中。实际 Home 只挂载 core、entry、comic、exterior、house；此时字体读取失败并留下空引用。`_draw()` 又在字体为空时整体返回，因此连已驻留 house 的明信片、叶片和线稿也不画。后来打开地图挂载 travel，也不会重新初始化原有 artwork 的字体。

## 最小修复

- 日记绘制改用 `Art.FONT` 指向的 `travel_ui.ttf`，它是 house 已驻留的 LXGW WenKai 手写子集。字体沿用仓库内固定来源、OFL 许可证和官方导入；关闭系统字体回退，全部所需文字均逐字核验覆盖。
- 字体防御检查仅作用于文字命令，不再使插图、铅笔线、路线整段消失。
- 保留三段通用小记、明信片、叶片、原尺寸和随书页展开的局部坐标，不修改正式日志事件页、交互时序、travel_home_props 或已发布资源包。

## 精确冷包证据

独立工作树：`/tmp/godot_diary_cold_fix`。
固定证据目录：`/workspace/scratch/3f82ff2b3f81/diary_cold_fix_evidence/`，文件 SHA256 清单为 `evidence_sha256.json`。
被测只读包：`/tmp/travel_scene_formal_56193b7/native_packs/`。

新增 `build/checks/run_cold_diary_packs.py` 可重放全部用例。它从空工程启动 `index.pck`，让原 App 通过真实 pack backend 校验并动态挂包；没有复制全资源项目或 runtime_cache。修复对照仅叠加官方引擎编译的日记 GDC 和 remap 两项测试资源包，明确不是正式候选。每个场景使用独立 XDG 数据/缓存目录，旧存档先在另一进程按冻结模型生成 schema 1 归来记录，退出后再启动实际冷 Home，防止资源缓存污染。

| 路径 | 原561缺陷复现断言 | 修复回归 | 冷Home字体 |
| --- | ---: | ---: | --- |
| 直接点地面日记 | 22/22 | 39/39 | null → 驻留WenKai |
| 先地图、返回Home、点日记 | 23/23 | 40/40 | 后挂travel仍null → 正常 |
| schema 1旧存档归来、点日记 | 23/23 | 40/40 | null → 正常，原行程和日志保留 |

以上“原561通过”表示成功断言并复现已知缺陷，不是产品通过。修复总计119项断言通过。每路径实录翻页中段、双页展开、夜间展开，并通过真实指针、Escape取消、暂停中断、重开、正式日志关闭。直接冷展开与取消没有请求 travel；只有后续正式日志页面需要时才挂载它。

对每个截图临时隐藏 artwork，再比较两页对应像素，避免把“节点存在/字体非空”当成“真的画了内容”。三条路径结果一致：

| 渲染阶段 | 原561左/右变化像素 | 修复左/右变化像素 |
| --- | ---: | ---: |
| 白天翻页中段 | 0 / 0 | 1005 / 358 |
| 白天双页展开 | 0 / 0 | 2442 / 879 |
| 夜间双页展开 | 0 / 0 | 2430 / 868 |

每路径下的 `01_midpoint_day`、`02_unfolded_day`、`03_unfolded_night` 各有整画面和 `_detail.png`。已实际查看修复前后截图、夜间、动画中段及720×1280整屋画面。详细结果/动态挂包hash在相邻 `results.json`，总表在 `summary.json`。

复现命令（输出必须是新空目录）：

```sh
python3 build/checks/run_cold_diary_packs.py --engine /absolute/Godot_v4.5.2-stable_linux.x86_64 --packs /absolute/frozen/native_packs --output /tmp/diary_before --baseline
python3 build/checks/run_cold_diary_packs.py --engine /absolute/Godot_v4.5.2-stable_linux.x86_64 --packs /absolute/frozen/native_packs --output /tmp/diary_after
```

## 预算与构建边界

- house + exterior 下载量保持 17,935,552 bytes，小于19,000,000；新增字体/纹理/资源准入项均为0。
- 冻结准入为Home 66 specs、105,704,696 bytes估算；全页面126/128 entries、251,641,768/268,435,456 bytes估算。修复不改这些资源或门槛。
- 7个原发布PCK的前后SHA256全部一致。官方引擎SHA256为 `5803746bbe055bee0f07a3c5b0dd347719bd45599f3d34519a8a0beaf83014ae`。
- 通用字体 `prepare_fonts.py --check` 通过。专用旅行字体检查中，TTF字节一致断言通过，随后因本次日记源码hash变动而在 coverage metadata stale 处失败。整合所有下一批改动后必须运行已有旅行字体准备器刷新 `coverage.json`，再通过完整正式构建；本独立所有权范围没有代改共享字体记录。
- runner记录Xorg PID并在成功或异常时退出回收；所有本次Godot/Xorg后台进程均已结束，缓存保留在`/tmp`。没有正式PCK/Web重建、push、部署或用户电脑操作。
- 本证据为原生Mesa软件GL和固定尺寸；不声称Web实机、移动触控、硬件GPU、浏览器内存或全站验收通过。下一批正式集成仍须重复冷包测试及既定完整门槛。

## 为什么上一轮会漏

旧 `test_diary_visual_cues.gd` 从全资源项目直接加载Home，`travel_brush.ttf`可见，掩盖了生产分包差异。旧packed construction先把所有包挂齐，不能覆盖Home缺少travel的时刻；`check_lazy_home.gd`虽然检查Home不挂travel和道具数量，却没验证地面日记实际字形或像素。把这些通过组合成“用户路径已经有内容”超出了证据。

回归改为：空根、冻结真实包、真实App加载器、具体交互路径、局部前后像素差和实际图像查看同时满足。先地图路径还专门断言迟到挂包不会神奇修复已经保存的null引用。测试开发中的首个fixture在90秒尚未生成归来日志，旧存档首尝试也因core尚无旅行内容而无效；这些未通过运行没有计入最终证据，最终通过记录只使用独立写盘fixture和完整三路径重跑结果。

## 仍独立存在的问题

为发布审计只读记录，冷Home中tent及ApprovedContact材质均为空。它们不是本次日记字体错误的结果，也未在此补丁修改；交由对应Home灯光任务处理。
