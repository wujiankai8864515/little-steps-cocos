# 普通 Home 原角色：7 个历史主题的正式 d1 限定复核

结论：发现 A035 一处正式包真实缺陷：对角向下追物的安全域投影可能把竖直分量反转为向上。其余六项在本轮选定状态、原生软件 GL 图和资源链中未发现新的明确缺陷；这不是用户美术认可或 Web 全验收。没有修改生产树、提交、push 或部署。

## A035 真实缺陷及修复边界

在 gl_v1 中，真实 root 输入拖玩偶到双眼下方：target_world=(379.7061,991.9448)，左眼当时位于约 (317.89,804.95)。阻尼层请求左眼 offset=(+3.760847,+3.149987)，但实际绘制的完整瞳安全域钳制结果为 (+2.194946,-0.308029)：向下的 y 分量被反转为向上。四向图与状态取自同一实际绘制相位，见 `gl_v1/08_gaze_down.png`、`gl_v1/results.json` 的同名 snapshot，以及 `eyes_actual_1x.png`。

根因在生产 `home/behavior/eye_geometry.gd::clamp_offset`：目标落在安全凸域外时，采用最近欧氏边缘点。A066 放大后形成的狭长斜域会让“右下”请求最近于中点右上的边缘。`repro_gaze_direction.gd` 只加载正式 core PCK；`clamp_repro/results.json` 复现完全相同值，另对 (5,4) 请求两眼均反转 y。这是产品方向语义问题，不是输入坐标夹具红，也不是瞳孔越界。

建议：保留 A066 半径与已建立的完整瞳安全域，改用从 neutral center 沿请求方向到凸域边界的射线/线段钳制；回归应验证分量不反转、有限阻尼、完整瞳安全、四向真实输入、原有敲击/喝水状态。不能改回旧小眼或扩大域造成裁瞳。右眼可用位移本来很小，即使修复方向，仍须向用户诚实呈现可见程度，不能把几何通过写成“明显追到四角已认可”。本轮未实施修复，交主工程统一独立提交。

## 各主题证据

- A006 拖起挣扎、落地恢复：实际 alpha 鱼体长按，再通过 root 鼠标移动抬升 175px，满 lift=1；三个持拖相位有鳍、尾、红嘴与眼神变化。松手后 spring 压缩最大观测 7.877px、回弹最低 -0.509px，回到原父节点与固定 Home 位置，临时 Canvas 清理。`01..06` 图和 trace 支持本轮选定路径；未测硬件触感。
- A009 日常眼神/表情：真实敲鱼输入呈 mallet → strike 目标与接触帧闭眼/红嘴紧张；点碗由生产 controller 完成喝水，目标 bowl，嘴部运动；拖鱼目标 ground；瞌睡闭眼/红嘴轻动由真实 ambient 代码绘制。瞌睡通过 request_ambient_action(doze)、fatigue=.65 明确选态，并未伪称靠自然疲劳等待进入。已看状态和切换相位，柔和程度及实际设备连续观感仍待认可。追物共有 A035 方向缺陷保留。
- A010 全身弹性：三附件实际软网格、骨骼、原始贴图和滞后 spring 都在生产中运行。持拖区间尾骨角度跨度约 2.743°、肩 0.969°、握槌骨 2.215°；体型 rig/body 基准 scale 保持。实际图可见鳍槌与尾滞后小幅变化，落地接地恢复。UV 在整个主 trace 中不变。不能以这些数值代替艺术认可。
- A035 眼球追物与范围：真实拖玩偶 left/right/up/down/near、焦点取消恢复都有生产 ownership 和阻尼轨迹；所有观测中心位于完整瞳安全域，但上述向下分量反转使本项只能标部分符合、确证缺陷待修。
- A053 尾巴连接：主跑抓身体，补跑真实 alpha 尾抓与鳍槌抓。尾抓两个满 lift=1 的 GL 相位已看，未见脱缝、UV 裁切或轮廓断裂；三个来源像素接缝探针最大距离约 0.119 逻辑像素。尾与身原始贴图共享 670×402 空间；x=115..155 的 seam 权重把尾连接逐渐对齐身体，再用同一软偏移，未缩小动作掩盖。此处是少量有针对性的探针与实图，不是全空间扫描证明。
- A054 半瞳/额外白球：直接查看正式 PCK 解码 body，可以看到原烘焙瞳本来贴上眼睑呈半瞳；当前 body pass 通过 `eye_clear_mask` 连同旧右瞳灰弧复原眼白，再用两个独立 pupil Sprite 绘制完整椭圆和内部小高光。原 Sprite self_modulate.a=0，实际 body 由 SoftOriginalPixels 绘制；避免重复原瞳。实际四向、喝水、持拖睁眼图均未见额外白球或半截瞳，闭眼用 eyes_closed 的两块来源区域。未盲删层或改原资源。
- A066 放大 20%：实际 PCK 加载 EyeGeometry 的半径精确为左 (12,9.12)、右 (10.8,7.92)，相对旧 (10,7.6)/(9,6.6) 两轴×1.20；shader 的两个 ellipse 半径相同。A035 摘要中的旧半径明确已被覆盖。小高光可见，完整椭圆与安全域有效；自然跟随方向上的 A035 缺陷仍须修。

实际四向快照的左眼 x 跨度约 9.526 源像素、y 跨度 2.852；右眼 x 跨度约 2.842、y 跨度 0.804。上述是放大后的真实范围，右眼变化尤其轻微。下方/近处目标可被当前斜域投影限制，不应写成四向幅度足够的验收通过。

## 来源、归包与真实导入边界

冻结源码 d1bfcaa0bb4ddf2f9980e27e7fabd3b22d8b8b0c，正式九包根 `home_grounding_formal_d1bfcaa/native_packs`，官方 Godot 4.5.2 SHA256 为 5803746bbe055bee0f07a3c5b0dd347719bd45599f3d34519a8a0beaf83014ae。`source_resource_provenance.json` 重读校验 40 个实际成员（PCK MD5 与正式 SHA256/bytes/pack），29 个源文件匹配正式 source_files；原 rig 的曲线源码 hash 仍与 original_curve_audit 一致。10 个相关成员与现有正式 d1 敲击审查逐一相同，旧敲击证据只限这些成员关系沿用；本轮亦重新采了真实敲击图。喝水本轮独立重验，无需借旧候选包冒充 d1。

核心 GDC（Home/interaction/behavior）在 index.pck；rig SCN、face shader、四张 Home .ctex/sidecar 和 alpha .res 在 house.pck。真实 App/native backend 冷挂载日志包含 core、entry、comic、exterior、house、darkroom；没有 travel、departure、photo，未打开这些玩法。九包输入在每次跑前后完整 SHA 不变。

冻结工程缺 body.png、tail.png、fin_mallet.png、eyes_closed.png 的原 PNG；保有 import sidecar 与恢复 .ctex。四个 .ctex 与冻结原恢复清单字节 hash 完全相同。本轮从正式 PCK 解码 RGBA8，四张均 670×402，无 mip，并逐张看了像素。`resource_decode/resources.json` 保存 RGBA hash、透明像素计数、使用范围与 mask metadata。不能把这里称为新官方 PNG 导入，也不能声称与缺失 PNG 做了逐像素比对。没有拿早期 Cocos 或别的 IP 图代替。

三个真实 alpha mask 的元数据阈值是 .16；逐像素记录显示 false 像素最大 alpha <= .156863，true 最小 >= .160784，与其阈值一致。body、tail、fin 的原纹理解析、UV 和 alpha 来源均已具体核查。body 中旧断离尾弧由有界的 body_tail_residue_mask 去除，真正独立尾贴图保留；源 body/tail 解码图展示了该来源关系。

## 夹具、失败和限制

主 GL 跑 gl_v1 的 28 项运行断言无红，但断言只覆盖状态/安全/恢复，没有覆盖方向正负；不能因断言绿而抹去后续读图/状态发现的 A035 缺陷。主跑从空 res（仅 project.godot）启动正式主包，所有交互 root.push_input，经 _world_pointer 逆变换并检查没有竞争入口。只跳过 Comic 的用户点击过程，仍用实际 App/prepare/_commit_home/native backend。没有资源 overlay、全工程 path、固定 delta 或直接 actor 敲击调用。

补跑 gl_grips 12 检查中有一项夹具失败：硬编码 fin 源像素 (481,152) 当时为透明/未命中 fin，选到了 body，尚未执行鳍抓。尾抓已经成功。保留其原 render.log/results/summary 及 test_attachment_grips_v1.gd。gl_fin 改为对实际 alpha 与 `_grab_sprite_at` 做只读选点，再走相同 root 长按，11 检查无红，两张满幅动作图已看。该修正不修改产品，也不掩盖 A035 真红。

每跑使用隔离 HOME/XDG/MESA_SHADER_CACHE_DIR，移除了 runner 旧 MESA_SHADER_CACHE_DISABLE。未把此环境第一次长帧/软件渲染时长解释为用户 Web 根因，也未做性能结论。全部子进程已 wait 回收；临时 shader/cache 已清并记录。保留精选图片和报告总量约 11MB；headless 预检长 trace 无损 gzip 保留。

画面为 720×1280 逻辑画布的原生 Mesa llvmpipe 软件 OpenGL；仅一张整屏，其余是实际帧无缩放裁片；eyes_actual_1x 是同一批像素的 1×对照。没有新增 DPR2，因为本轮椭圆完整性、尾缝及确证方向问题在 1×和真实状态已能判断。未验证 Web/GPU/手机触感/音频听感/60fps/用户美术认可。没有要求认可后的静态出发旅行鱼继续 Home 骨架眼神，也没有扩查背包、TravelUI 或全历史。
