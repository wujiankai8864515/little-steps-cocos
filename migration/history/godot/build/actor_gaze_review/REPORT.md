# A035 眼球安全钳制保向修复（候选专项验证）

结论：修复正式 d1 中“向下追物被完整瞳安全域投影为向上”的确证代码缺陷。官方 Godot 4.5.2 编译、原包红值、候选保向/完整瞳边界及真实 App/root GL 已验证。尚未形成新的正式关联组包、GitHub 远端核验、部署或 Web/用户验收。A035 整体要求不能因此标成全部通过：右眼可见行程依然很小，“明显追到各方向眼角”仍未取得认可。

## 源码与具体修复

基线源码 `a202b1562fd4b77b0666f0a98dd516d62a420855`；其 games/framework/design 与正式 `d1bfcaa0bb4ddf2f9980e27e7fabd3b22d8b8b0c` 无 diff。本项唯一生产文件是 `games/travel_woodfish/project/home/behavior/eye_geometry.gd`，仅改变 `clamp_offset`。

旧算法先限制 travel 椭圆，再取安全凸域最近欧氏边点；狭长斜域会让所求边点落在请求的反向。新算法从既有 neutral 沿 bounded 请求射线逐边裁剪，对每条逆时针凸域边的 inward half-plane 求允许的比例，返回同一请求乘以 0..1 的标量，复杂度 O(n)。用 0.0001 源像素内缩吸收 float32 加法边界误差。极大有限输入先共同缩放再算长度，避免长度平方溢出；零/NaN/Infinity 返回安全 neutral。

中心、凸域点、travel、最新 A066 半径（左 12×9.12、右 10.8×7.92）、所有 public API、shader、小高光、原始像素和生产阻尼完全不变。没有缩瞳、扩眼白、换 IP/旧 Cocos 图或调整加载预算。

## 代码红绿与完整瞳安全

- `eye_geometry_before.gd` 保存旧源码；`candidate/baseline_geometry.json` 在独立新进程只加载实际正式 core，真实请求左 `(3.760847,3.149987)` 返回 `(2.194946,-0.308029)`，确认 y 翻向。188 个代表请求含 24 角度、边界前/上/后、小值及极大有限值，37 个翻向；红值是预期确证，不是候选失败。
- `candidate/candidate_geometry.json` 加载新编译的两成员脚本 delta 后，同一真实请求返回 `(0.457207,0.382945)`。188 个输出无翻向、与请求平行、均有限且在凸域内；最小有向边距约 0.0000900 源像素。另测每眼 NaN/±Infinity 输入回 neutral。旧结果 strict half-plane 的约 0.0000076px 浮点外偏仅记录数值边界，不声称这是可见裁瞳缺陷。
- `candidate/full_pupil_safety.json` 对上述实际输出中心取完整椭圆内部/周界，包含 1.05× AA fringe 与 0.35px filtering clearance；每中心 1,025 个支持采样，对正式 d1 解码 body 按既有真实 white-mask 方程求值，左右最小白色支持均 1.0。此为本修复的有限边界抽样，不冒称连续全空间证明或美术验收。
- 官方引擎 SHA256 `5803746bbe055bee0f07a3c5b0dd347719bd45599f3d34519a8a0beaf83014ae`。候选 source SHA256 `488c0ff3d2add469013fa8c3835bb5e19d0533009b4fbf4b9a66f6f44a196664`。

## 实际包、真实输入及看图

`candidate/A035_CANDIDATE_ONLY.pck` 仅 2,968 bytes，SHA256 `dd72b106b08d72dda96762e9da8b184a99f11678b9033f8e9942d61d3fd851ea`，只含 eye_geometry.gdc 和原 remap。它是明确的候选 overlay，不是正式整包。运行入口 `--path` 指向仅有 project.godot 的空 res，`--main-pack` 是实际正式 d1 index.pck；overlay 在任何 main/App/geometry load 或 preload 之前挂载，检查缓存为空并核对实际可见 GDC hash `0cb8f4a4b4d7d3add83bb194f5c8c506344ec1446d5274fd8c4e17ac73637365`，避免旧脚本缓存假绿。真实 App/native backend 加载 core、entry、comic、exterior、house、darkroom，没有要求 travel/departure/photo。正式九包每跑前后 SHA 完全不变。

最终 `gl_settled`：37 项检查全部通过，134 个状态/268 个逐眼原始请求到实际绘制偏移的观测无反向，15 次真实 root 输入。玩偶真实 alpha 拖拽 left/right/up/down/near，等生产阻尼速度收敛后取图；窗口 focus 取消清除 ownership。普通鱼体长按、175px 抬升、松手压缩/回弹、恢复父节点/位置与清除临时 carrier，碗点击喝水及结束、敲击预备和接触均通过。环境状态选择仍明确标夹具：10h、rest 与显式 doze，Comic 用户点击过程跳过，其余真实 App 准备和提交 Home。

最终下方目标约 `(379.7595,991.9548)`：左原始阻尼请求 `(3.894226,4.724625)` → 实际 `(0.348043,0.422259)`；右 `(-1.746281,2.902291)` → `(-0.070318,0.116868)`。保向已经解决，大小没有夸大。四向快照源像素跨度：左 x≈2.940/y≈0.978，右 x≈0.767/y≈0.225；右眼肉眼变化尤其轻微。

已直接查看 `viewed_frames.json` 列出的整屏、中性、四向、持拖、回弹、喝水与接触图，睁眼时保留完整瞳和内部小高光，未看到额外白球或半瞳；接触正常闭眼。`eyes_before_after_1x.png` 是原 1× 像素裁片，无放大，旧正式图来自原审查的同一 root 场景，新图额外等阻尼收敛；并非同一动画时间的像素差证明。未把前后跨度差全归为代码差，因为观测相位不同。

## 来源与限定

`baseline/` 保留原正式审查的报告、verdict、来源表、完整原 manifest 和精选原图/原 snapshot；原目录 `/workspace/shared/actor_face_motion_qa` 的 manifest 共 105 个成员重新核 hash 全匹配，见 `baseline_manifest_audit.json`。其余 A006/A009/A010/A053/A054/A066 原审查限定结论保留，不因本修复扩写为全主题通过。

原 body/tail/fin_mallet/eyes_closed PNG 在冻结工程缺失，实际 .ctex 恢复链与原冻结 inventory 匹配；本项没有替换或重新导入这些资源。完整瞳安全采样使用正式 d1 解码 body；不能声称和缺失 PNG 做过像素比较。既有来源、alpha 阈值和资源归包详见 `baseline/source_resource_provenance.json`。

## 夹具复盘与可重跑入口

首轮 `gl_candidate` 的额外方向断言误把已经钳制的 left/right offset 当作请求，不能作为保向证据。源版本保存为 `test_live_gaze_v1.gd`；对该轮原始 face 请求独立回读得到 266 个逐眼观测无反向，见 `preclamp_direction.json`。随后修正为 face 中真正的未钳制 left/right 请求（普通状态回退 common request），完整重跑 `gl_settled`，并增加逐方向等待阻尼收敛。未更改生产来修夹具。精选首轮下方图与完整无损 gzip trace 留存，冗余图片移除逐项记录于 cleanup.json。

- `build_candidate.py --engine <4.5.2> --reference-build <完整基线/build> --packs <正式d1/native_packs> --output <新空目录>`：先原包红，再官方编译、两成员打包与候选绿。
- `run_gl.py --engine <4.5.2> --packs <正式d1/native_packs> --output <新空目录> --pack-label A035-test-only --check-script <test_live_gaze.gd> --overlay <A035_CANDIDATE_ONLY.pck> --geometry-sha <上述GDC SHA>`：真实 App/root GL；详细实际参数保存在 command.json。
- `check_full_pupil.py` 的实际输入与 hash 见 full_pupil_safety.json；参考方程是完整基线 build/pupil_size/white_reference.py，输入 body 为原审查 resource_decode/body_runtime.png。

每个官方引擎与 Xorg PID、退出码、wait 记录均留存。独立 HOME/XDG/default Mesa cache，未设 MESA_SHADER_CACHE_DISABLE；所有进程回收后才清理本项孤立缓存并无损压缩 trace。没有性能/60fps/Web内存结论，也没有用户 Mac/GPU、触感、听感或用户美术认可。正式关联组包与 Web 仍须从待核 GitHub 的同源重新验证。
